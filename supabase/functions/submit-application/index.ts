import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max 10 submissions per IP per hour
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_HOURS = 1;

// Background task to run CV scoring
async function runCvScoringInBackground(
  supabase: SupabaseClient,
  applicantId: string,
  jobTitle: string,
  jobDescription: string,
  qualifications: string[],
  responsibilities: string[],
  cvText: string
) {
  console.log(`[Background] Starting CV scoring for applicant ${applicantId}`);
  
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('[Background] LOVABLE_API_KEY is not configured');
      return;
    }

    const systemPrompt = `You are an expert HR recruiter and CV evaluator. Your task is to score a candidate's CV against a job posting and provide detailed analysis.

SCORING RULES (total = 100):
- Role experience match: 0-45 points (how well their experience matches the role)
- Skills and tools match: 0-45 points (how well their skills match required qualifications)
- Availability and setup readiness: 0-5 points (remote work readiness indicators)
- Bonus or red flags: -5 to +5 points (exceptional achievements or concerning patterns)

RANKING STATUS:
- Strong Match: total_score >= 70
- Partial Match: total_score >= 40 AND < 70
- Low Match: total_score < 40

EXTRACTION REQUIREMENTS:
You MUST also extract searchable metadata from the CV:
1. extracted_skills: List ALL skills mentioned (soft skills, hard skills, languages, certifications)
   Examples: "Customer Service", "Sales", "Legal Intake", "Spanish", "Problem Solving", "Time Management"
2. extracted_tools: List ALL software/tools/platforms mentioned
   Examples: "Salesforce", "HubSpot", "Excel", "Google Workspace", "Clio", "Zendesk", "Shopify", "GoHighLevel"
3. years_of_experience: Estimate total professional experience in years (null if unclear)
   - Calculate from work history dates if available
   - Use career span to estimate

You MUST return ONLY valid JSON with NO additional text. The JSON must have this exact structure:
{
  "role_experience_score": <number 0-45>,
  "skills_tools_score": <number 0-45>,
  "availability_setup_score": <number 0-5>,
  "bonus_red_flag_score": <number -5 to 5>,
  "total_score": <sum of all scores>,
  "ranking_status": "<Strong Match|Partial Match|Low Match>",
  "summary": "<max 3 sentences summarizing the candidate's fit>",
  "assessment_details": {
    "matched_tools": [
      {"tool": "<tool/skill name>", "found": true, "context": "<brief context from CV where this was found>"}
    ],
    "missing_tools": ["<required tool/skill not found in CV>"],
    "experience_highlights": [
      {"role": "<job title>", "company": "<company name if available>", "duration": "<time period if available>", "relevance": "<why this is relevant to the role>"}
    ],
    "strengths": ["<key strength 1>", "<key strength 2>"],
    "concerns": ["<potential concern or gap if any>"]
  },
  "extracted_skills": ["<skill 1>", "<skill 2>", ...],
  "extracted_tools": ["<tool 1>", "<tool 2>", ...],
  "years_of_experience": <number or null>
}`;

    const userPrompt = `Evaluate this candidate's CV for the following job:

JOB TITLE: ${jobTitle}

JOB DESCRIPTION: ${jobDescription || 'Not provided'}

KEY QUALIFICATIONS REQUIRED:
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

RESPONSIBILITIES:
${responsibilities?.length ? responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified'}

CANDIDATE CV TEXT:
${cvText}

Return ONLY the JSON scoring object with detailed assessment_details and extracted metadata, no other text.`;

    console.log('[Background] Calling Lovable AI for CV scoring...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] AI API error:', response.status, errorText);
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    logAiUsage({
      functionName: 'submit-application:cv-scoring',
      model: 'google/gemini-2.5-flash',
      usage: data.usage,
      context: { applicant_id: applicantId, job_title: jobTitle },
    });

    if (!content) {
      console.error('[Background] No content in AI response');
      return;
    }

    console.log('[Background] AI response received, parsing...');

    // Parse JSON from the response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.slice(7);
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.slice(3);
    }
    if (jsonContent.endsWith('```')) {
      jsonContent = jsonContent.slice(0, -3);
    }
    jsonContent = jsonContent.trim();

    let scoreResult;
    try {
      scoreResult = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('[Background] Failed to parse AI response:', parseError);
      return;
    }

    // Validate and sanitize the scores
    const roleScore = Math.max(0, Math.min(45, scoreResult.role_experience_score || 0));
    const skillsScore = Math.max(0, Math.min(45, scoreResult.skills_tools_score || 0));
    const availabilityScore = Math.max(0, Math.min(5, scoreResult.availability_setup_score || 0));
    const bonusScore = Math.max(-5, Math.min(5, scoreResult.bonus_red_flag_score || 0));
    const totalScore = roleScore + skillsScore + availabilityScore + bonusScore;

    let rankingStatus = 'Low Match';
    if (totalScore >= 70) {
      rankingStatus = 'Strong Match';
    } else if (totalScore >= 40) {
      rankingStatus = 'Partial Match';
    }

    // Update the applicant record with scoring results
    const { error: updateError } = await supabase
      .from('applicants_prescreen')
      .update({
        role_experience_score: roleScore,
        skills_tools_score: skillsScore,
        availability_setup_score: availabilityScore,
        bonus_red_flag_score: bonusScore,
        total_score: totalScore,
        ranking_status: rankingStatus,
        ai_summary: scoreResult.summary || 'Unable to generate summary.',
        ai_assessment_details: scoreResult.assessment_details || null,
        extracted_skills: Array.isArray(scoreResult.extracted_skills) ? scoreResult.extracted_skills : [],
        extracted_tools: Array.isArray(scoreResult.extracted_tools) ? scoreResult.extracted_tools : [],
        years_of_experience: typeof scoreResult.years_of_experience === 'number' ? scoreResult.years_of_experience : null,
      })
      .eq('id', applicantId);

    if (updateError) {
      console.error('[Background] Failed to update applicant with scores:', updateError);
      return;
    }

    console.log(`[Background] CV scoring completed for applicant ${applicantId}. Score: ${totalScore}, Status: ${rankingStatus}`);
  } catch (error) {
    console.error('[Background] Error in CV scoring:', error);
  }
}

// Background task to notify the assigned admin about a new application
async function notifyAssignedAdmin(
  supabase: SupabaseClient,
  adminUserId: string,
  applicantId: string,
  applicantName: string,
  applicantEmail: string,
  jobTitle: string
) {
  console.log(`[Background] Notifying admin ${adminUserId} about new application`);
  
  try {
    // Get admin email using Supabase admin API
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(adminUserId);
    
    if (userError || !userData?.user?.email) {
      console.error('[Background] Failed to get admin email:', userError);
      return;
    }

    const adminEmail = userData.user.email;
    console.log(`[Background] Sending notification to admin: ${adminEmail}`);

    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPassword) {
      console.error('[Background] Gmail credentials not configured');
      return;
    }

    // Import SMTP client dynamically
    const { SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts");

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPassword,
        },
      },
    });

    const applicantProfileUrl = `https://outstahub.com/admin?applicant=${applicantId}`;
    const subject = `New Application: ${applicantName} applied for ${jobTitle}`;
    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #1a1a2e;">New Job Application</h2>
        <p>A new candidate has applied for a role assigned to you:</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Position:</td>
            <td style="padding: 8px 0;">${jobTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Candidate Name:</td>
            <td style="padding: 8px 0;">${applicantName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Candidate Email:</td>
            <td style="padding: 8px 0;">${applicantEmail}</td>
          </tr>
        </table>
        <p style="margin: 20px 0;">
          <a href="${applicantProfileUrl}" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">View Applicant Profile</a>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">This is an automated notification from Outsta Recruitment.</p>
      </div>
    `;

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head><body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;"><table role="presentation" style="width: 100%; border-collapse: collapse;"><tr><td align="center" style="padding: 40px 0;"><table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><tr><td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 50px 40px; border-radius: 12px 12px 0 0; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 3px;">OutSta</h1><p style="color: #e2e8f0; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; letter-spacing: 2px;">Recruitment Team</p></td></tr><tr><td style="padding: 40px;">${bodyHtml}</td></tr><tr><td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 12px 12px; text-align: center;"><p style="color: #999999; font-size: 12px; margin: 0;">This is an automated notification.<br>Please do not reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

    await client.send({
      from: `OutSta Recruitment <${gmailUser}>`,
      to: adminEmail,
      subject: subject,
      content: "auto",
      html: emailHtml,
    });

    await client.close();

    console.log(`[Background] Admin notification sent successfully to ${adminEmail}`);
  } catch (error) {
    console.error('[Background] Error notifying admin:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role for rate limit checking (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Received application submission request');

    // Get client IP for rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    // Detect device type from user agent
    const userAgent = req.headers.get('user-agent') || '';
    const isMobile = /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';
    console.log(`Device type detected: ${deviceType} (UA: ${userAgent.substring(0, 50)}...)`);
    
    // Hash the IP for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(clientIP + 'salt_for_hashing');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const ipHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

    console.log(`Processing submission from IP hash: ${ipHash}`);

    // Check honeypot field - if filled, log it but don't block (browser autofill can cause false positives)
    const honeypotFilled = body.honeypot_field && body.honeypot_field.trim() !== '';
    if (honeypotFilled) {
      console.log(`Honeypot field filled with value: "${body.honeypot_field}" - flagging but allowing submission`);
    }

    // Validate required fields
    if (!body.full_name || body.full_name.trim() === '') {
      return new Response(JSON.stringify({ error: 'Full name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!body.email || body.email.trim() === '') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Voice introduction is now handled via AI interview, so it's optional at this stage
    const vocarooLink = body.vocaroo_link?.trim() || null;
    const voiceRecordingUrl = body.voice_recording_url?.trim() || null;

    // Check rate limit - count submissions from this IP in the last hour
    const rateLimitWindow = new Date();
    rateLimitWindow.setHours(rateLimitWindow.getHours() - RATE_LIMIT_WINDOW_HOURS);

    const { count, error: countError } = await supabase
      .from('applicants_prescreen')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', rateLimitWindow.toISOString());

    if (countError) {
      console.error('Error checking rate limit:', countError);
      // Continue anyway - don't block legitimate users due to rate limit check failures
    } else if (count && count >= RATE_LIMIT_MAX) {
      console.log(`Rate limit exceeded for IP hash ${ipHash}: ${count} submissions in last hour`);
      return new Response(JSON.stringify({ 
        error: 'Too many submissions. Please try again later.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

// Fetch job details for CV scoring and admin notification
    let jobDescription = '';
    let qualifications: string[] = [];
    let responsibilities: string[] = [];
    let assignedAdminId: string | null = null;
    let jobTitle = body.job_title || '';
    
    if (body.job_id) {
      const { data: jobData, error: jobError } = await supabase
        .from('jobs')
        .select('description, qualifications, responsibilities, assigned_admin_id, title')
        .eq('id', body.job_id)
        .single();
      
      if (!jobError && jobData) {
        jobDescription = jobData.description || '';
        qualifications = jobData.qualifications || [];
        responsibilities = jobData.responsibilities || [];
        assignedAdminId = jobData.assigned_admin_id;
        jobTitle = jobData.title || jobTitle;
      }
    }

    // Check for existing applications for this email + job combination
    const applicantEmail = body.email.trim().toLowerCase();
    if (body.job_id) {
      // Find existing applications for this email + job
      const { data: existingApps, error: existingError } = await supabase
        .from('applicants_prescreen')
        .select('id, status, submitted_at')
        .eq('email', applicantEmail)
        .eq('job_id', body.job_id)
        .order('submitted_at', { ascending: false });

      if (!existingError && existingApps && existingApps.length > 0) {
        const latestApp = existingApps[0];
        
        // Check for completed interview sessions (status = 'completed' or 'completed_manual_review')
        const { data: completedSessions } = await supabase
          .from('interview_sessions')
          .select('id, completed_at, status')
          .eq('applicant_id', latestApp.id)
          .in('status', ['completed', 'completed_manual_review'])
          .order('completed_at', { ascending: false })
          .limit(1);

        if (completedSessions && completedSessions.length > 0) {
          const completedSession = completedSessions[0];
          const completedAt = new Date(completedSession.completed_at);
          const now = new Date();
          const daysSinceCompletion = Math.floor((now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24));
          const cooldownDays = 90;
          
          if (daysSinceCompletion < cooldownDays) {
            const daysRemaining = cooldownDays - daysSinceCompletion;
            const eligibleDate = new Date(completedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000);
            
            console.log(`Applicant ${applicantEmail} already completed assessment for job ${body.job_id}. Days remaining: ${daysRemaining}`);
            
            return new Response(JSON.stringify({ 
              error: 'cooldown_period',
              message: `You have already completed the assessment for this role.`,
              days_remaining: daysRemaining,
              eligible_date: eligibleDate.toISOString(),
              completed_at: completedSession.completed_at
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Check for incomplete interview sessions within 2 days (resume window)
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        const { data: inProgressSessions } = await supabase
          .from('interview_sessions')
          .select('id, started_at, status')
          .eq('applicant_id', latestApp.id)
          .eq('status', 'in_progress')
          .gte('started_at', twoDaysAgo.toISOString())
          .order('started_at', { ascending: false })
          .limit(1);

        if (inProgressSessions && inProgressSessions.length > 0) {
          const session = inProgressSessions[0];
          const startedAt = new Date(session.started_at);
          const expiresAt = new Date(startedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
          
          console.log(`Applicant ${applicantEmail} has incomplete assessment for job ${body.job_id}. Session: ${session.id}`);
          
          return new Response(JSON.stringify({ 
            error: 'incomplete_assessment',
            message: 'You have an incomplete assessment for this role. Please complete it to continue.',
            session_id: session.id,
            resume_url: `/interview/${session.id}`,
            expires_at: expiresAt.toISOString()
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Insert the application WITHOUT scoring data - scoring will run in background
    const insertData: Record<string, unknown> = {
      full_name: body.full_name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      home_office: body.home_office,
      noise_canceling_headset: body.noise_canceling_headset,
      laptop_or_pc: body.laptop_or_pc,
      good_internet: body.good_internet,
      internet_speed: body.internet_speed?.trim() || '',
      power_backup: body.power_backup,
      can_work_40_50: body.can_work_40_50,
      us_timezone_ok: body.us_timezone_ok,
      start_availability: body.start_availability?.trim() || '',
      has_experience: body.has_experience,
      currently_working: body.currently_working,
      employment_status: body.employment_status?.trim() || null,
      last_day_with_employer: body.last_day_with_employer?.trim() || null,
      upcoming_plans: body.upcoming_plans?.trim() || null,
      location: body.location?.trim() || '',
      job_title: body.job_title,
      job_id: body.job_id,
      apply_url: body.apply_url,
      status: 'For Review',
      ip_hash: ipHash,
      honeypot_field: null,
      cv_file_url: body.cv_file_url || null,
      cv_text: body.cv_text || null,
      vocaroo_link: vocarooLink,
      voice_recording_url: voiceRecordingUrl,
      job_source: body.job_source?.trim() || null,
      pre_screening_responses: body.pre_screening_responses ?? null,
      pre_screening_flagged: body.pre_screening_flagged === true,

      device_type: deviceType,
      // Scoring fields will be populated by background task
      role_experience_score: null,
      skills_tools_score: null,
      availability_setup_score: null,
      bonus_red_flag_score: null,
      total_score: null,
      ranking_status: null,
      ai_summary: null,
      ai_assessment_details: null,
      extracted_skills: [],
      extracted_tools: [],
      years_of_experience: null,
    };

    console.log('Inserting application (scoring will run in background):', {
      has_cv_file: !!insertData.cv_file_url,
      has_cv_text: !!body.cv_text,
      cv_text_length: body.cv_text?.length || 0,
      has_vocaroo: !!insertData.vocaroo_link,
      has_voice_recording: !!insertData.voice_recording_url,
    });

    const { data: insertedData, error: insertError } = await supabase
      .from('applicants_prescreen')
      .insert(insertData)
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting application:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to submit application. Please try again.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const applicantId = insertedData.id;
    console.log(`Application submitted successfully with ID: ${applicantId}`);

// Trigger CV scoring as background task if CV was provided
    if (body.cv_text && body.job_title) {
      console.log('Triggering background CV scoring...');
      EdgeRuntime.waitUntil(
        runCvScoringInBackground(
          supabase,
          applicantId,
          body.job_title,
          jobDescription,
          qualifications,
          responsibilities,
          body.cv_text
        )
      );
    }

    // Admin notification is now sent after interview completion or 20-minute timeout
    // See: assess-interview (on completion) and process-pending-notifications (for timeout)

    return new Response(JSON.stringify({ 
      success: true,
      applicant_id: applicantId,
      message: 'Application submitted successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in submit-application function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
