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

// Background task to notify the assigned admin about interview completion
async function notifyAssignedAdmin(
  supabase: SupabaseClient,
  adminUserId: string,
  applicantId: string,
  applicantName: string,
  applicantEmail: string,
  jobTitle: string,
  interviewStatus: string
) {
  console.log(`[Background] Notifying admin ${adminUserId} about completed interview`);
  
  try {
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
    const statusLabel = interviewStatus === 'completed' ? 'Completed Assessment' : 'Completed (Manual Review)';
    const subject = `New Application: ${applicantName} - ${jobTitle} (${statusLabel})`;
    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #1a1a2e;">New Completed Application</h2>
        <p>A candidate has completed their application and assessment for a role assigned to you:</p>
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
          <tr>
            <td style="padding: 8px 16px 8px 0; font-weight: bold; color: #666;">Assessment Status:</td>
            <td style="padding: 8px 0;">${statusLabel}</td>
          </tr>
        </table>
        <p style="margin: 20px 0;">
          <a href="${applicantProfileUrl}" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">View Applicant Profile</a>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">This is an automated notification from OutSta Recruitment.</p>
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

    await supabase
      .from('interview_sessions')
      .update({ admin_notified_at: new Date().toISOString() })
      .eq('applicant_id', applicantId);

    console.log(`[Background] Admin notification sent successfully to ${adminEmail}`);
  } catch (error) {
    console.error('[Background] Error notifying admin:', error);
  }
}

async function triggerAdminNotification(
  supabase: SupabaseClient,
  sessionId: string,
  interviewStatus: string
) {
  try {
    const { data: session, error: sessionError } = await supabase
      .from('interview_sessions')
      .select('applicant_id, job_id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      console.error('[Notify] Failed to get session:', sessionError);
      return;
    }

    const { data: applicant, error: applicantError } = await supabase
      .from('applicants_prescreen')
      .select('full_name, email, job_title')
      .eq('id', session.applicant_id)
      .single();

    if (applicantError || !applicant) {
      console.error('[Notify] Failed to get applicant:', applicantError);
      return;
    }

    if (!session.job_id) {
      console.log('[Notify] No job_id on session, skipping admin notification');
      return;
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('assigned_admin_id, title')
      .eq('id', session.job_id)
      .single();

    if (jobError || !job || !job.assigned_admin_id) {
      console.log('[Notify] No assigned admin for job, skipping notification');
      return;
    }

    console.log(`[Notify] Triggering admin notification for session ${sessionId}`);
    EdgeRuntime.waitUntil(
      notifyAssignedAdmin(
        supabase,
        job.assigned_admin_id,
        session.applicant_id,
        applicant.full_name,
        applicant.email,
        job.title || applicant.job_title,
        interviewStatus
      )
    );
  } catch (error) {
    console.error('[Notify] Error triggering admin notification:', error);
  }
}

interface InterviewAnswer {
  question_text: string;
  question_context: string;
  section: string;
  voice_recording_url?: string;
  voice_duration_seconds?: number;
  text_answer?: string;
  selected_option_id?: string;
  selected_option_label?: string;
  options?: Array<{ id: string; label: string; value: string }>;
}

interface AssessmentRequest {
  session_id: string;
  job_title: string;
  job_description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
  cv_text: string;
  applicant_name: string;
  answers: InterviewAnswer[];
  skip_ai_assessment?: boolean;
}

interface AssessmentResponse {
  experience_score: number;
  technical_score: number;
  communication_score: number;
  situational_score: number;
  overall_score: number;
  ai_summary: string;
  ai_strengths: string[];
  ai_concerns: string[];
  ai_assessment_details: object;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      session_id,
      job_title,
      job_description,
      qualifications,
      responsibilities,
      cv_text,
      applicant_name,
      answers,
      skip_ai_assessment
    }: AssessmentRequest = await req.json();

    if (!session_id || !answers || answers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: session_id and answers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dedupe guard: if session is already completed with an AI assessment, skip re-running the AI.
    {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: existing } = await supabase
        .from('interview_sessions')
        .select('status, ai_summary')
        .eq('id', session_id)
        .maybeSingle();
      if (existing?.status === 'completed' && existing?.ai_summary) {
        console.log(`Session ${session_id} already assessed — skipping redundant AI call.`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: 'already_assessed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }


    // Validate that answers have actual content
    const hasVoiceContent = answers.some(a => a.section === 'voice' && a.voice_recording_url);
    const hasTextContent = answers.some(a => a.section === 'text' && a.text_answer && a.text_answer.trim().length > 0);
    
    const hasAnyContent = hasVoiceContent || hasTextContent;
    
    if (!hasAnyContent) {
      console.log('No actual answer content found - marking for manual review');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { error: updateError } = await supabase
        .from('interview_sessions')
        .update({
          status: 'completed_manual_review',
          completed_at: new Date().toISOString(),
          ai_summary: 'Manual review required - No interview responses were recorded. Session may have timed out or answers were not submitted.',
        })
        .eq('id', session_id);

      if (updateError) {
        console.error('Error updating session for manual review:', updateError);
      }

      await triggerAdminNotification(supabase, session_id, 'completed_manual_review');

      return new Response(
        JSON.stringify({ 
          success: true,
          manual_review: true,
          no_content: true,
          message: 'Interview session had no recorded responses. Marked for manual review.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Safety net: make sure the raw answers are persisted even if the client-side
    // inserts failed (historically this lost voice/text answers permanently).
    await ensureAnswersPersisted(supabase, session_id, answers);


    if (skip_ai_assessment) {
      console.log('Skipping AI assessment - marking for manual review');
      
      const { error: updateError } = await supabase
        .from('interview_sessions')
        .update({
          status: 'completed_manual_review',
          completed_at: new Date().toISOString(),
          ai_summary: 'Manual review required - AI assessment was not available.',
        })
        .eq('id', session_id);

      if (updateError) {
        console.error('Error updating session for manual review:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update interview session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await triggerAdminNotification(supabase, session_id, 'completed_manual_review');

      return new Response(
        JSON.stringify({ 
          success: true,
          manual_review: true,
          message: 'Interview completed. Responses will be reviewed manually by our team.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('No API key - marking for manual review');
      
      await supabase
        .from('interview_sessions')
        .update({
          status: 'completed_manual_review',
          completed_at: new Date().toISOString(),
          ai_summary: 'Manual review required - AI service not configured.',
        })
        .eq('id', session_id);

      await triggerAdminNotification(supabase, session_id, 'completed_manual_review');

      return new Response(
        JSON.stringify({ 
          success: true,
          manual_review: true,
          message: 'Interview completed. Responses will be reviewed manually.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format answers for AI assessment
    const voiceAnswers = answers.filter(a => a.section === 'voice');
    const textAnswers = answers.filter(a => a.section === 'text');

    // Check which sections have questions and actual content
    const hasVoiceQuestions = voiceAnswers.length > 0;
    const hasTextQuestions = textAnswers.length > 0;

    const voiceAnsweredCount = voiceAnswers.filter(a => a.voice_recording_url).length;
    const textAnsweredCount = textAnswers.filter(a => a.text_answer && a.text_answer.trim().length > 0).length;

    const hasVoiceResponses = hasVoiceQuestions && voiceAnsweredCount > 0;
    const hasTextResponses = hasTextQuestions && textAnsweredCount > 0;

    console.log(`Section questions check - Voice: ${voiceAnswers.length} questions, Text: ${textAnswers.length} questions`);
    console.log(`Section content check - Voice: ${voiceAnsweredCount}/${voiceAnswers.length}, Text: ${textAnsweredCount}/${textAnswers.length}`);

    // Build score override instructions for AI
    const scoreOverrides: string[] = [];
    if (!hasVoiceQuestions) {
      scoreOverrides.push('- EXPERIENCE, TECHNICAL, COMMUNICATION SCORES: Must be 0 (no voice questions were configured)');
    } else if (!hasVoiceResponses) {
      scoreOverrides.push('- EXPERIENCE SCORE: Must be 0 (no voice recordings submitted)');
      scoreOverrides.push('- TECHNICAL SCORE: Must be 0 (no voice recordings submitted)');
      scoreOverrides.push('- COMMUNICATION SCORE: Must be 0 (no voice recordings submitted)');
    }
    if (!hasTextQuestions) {
      scoreOverrides.push('- SITUATIONAL SCORE: Must be 0 (no text questions were configured)');
    } else if (!hasTextResponses) {
      scoreOverrides.push('- SITUATIONAL SCORE: Must be 0 (no text answers submitted)');
    }

    const scoreOverrideSection = scoreOverrides.length > 0 
      ? `\n\nMANDATORY SCORE OVERRIDES (sections without questions or without answers = automatic 0):\n${scoreOverrides.join('\n')}\n\nThese scores MUST be exactly 0 - do not infer from CV or other sections. The overall score should only reflect sections that had questions AND answers.`
      : '';

    const systemPrompt = `You are a senior HR professional with extensive experience in candidate assessment. Your task is to provide a rigorous, objective evaluation of interview performance.

INTERVIEW FORMAT: This interview consists of 3 voice questions (experience, technical & communication) and 1 text question (situational judgment).

SCORING FRAMEWORK (each dimension 0-100):

1. EXPERIENCE SCORE (Voice Section):
   - 90-100: Exceptional depth, specific achievements with metrics, directly relevant experience
   - 70-89: Strong relevant experience, clear examples, good articulation
   - 50-69: Adequate experience, some relevant examples but lacking specificity
   - 30-49: Limited relevant experience, vague or generic responses
   - 0-29: Minimal/no relevant experience, did not answer, or extremely brief
   - **0: MANDATORY if no voice recordings were submitted**

2. TECHNICAL SCORE (Voice Section):
   - 90-100: Expert-level proficiency, deep knowledge of required tools/skills
   - 70-89: Solid technical foundation, comfortable with most requirements
   - 50-69: Basic competency, may need training on some tools
   - 30-49: Limited technical skills, significant gaps
   - 0-29: Lacks fundamental technical requirements
   - **0: MANDATORY if no voice recordings were submitted**

3. COMMUNICATION SCORE (Voice Section):
   - Assessed via recording metadata (duration, whether answered)
   - Ideal response: 45-120 seconds (shows depth without rambling)
   - Too brief (<20 sec): Likely superficial or unprepared
   - Too long (>150 sec): May indicate difficulty being concise
   - 90-100: Optimal duration, engaged with all questions
   - 70-89: Good engagement, mostly appropriate length
   - 50-69: Inconsistent - some too brief, some too long
   - 30-49: Multiple unanswered or extremely short responses
   - 0-29: Most questions unanswered or minimal effort
   - **0: MANDATORY if no voice recordings were submitted**

4. SITUATIONAL SCORE (Text Section):
   - 90-100: Thoughtful, nuanced responses showing excellent judgment
   - 70-89: Good problem-solving approach, considers multiple factors
   - 50-69: Acceptable responses but predictable/surface-level
   - 30-49: Poor judgment, misses key considerations
   - 0-29: Did not answer, one-word responses, or completely off-topic
   - **0: MANDATORY if no text answers were submitted**

OVERALL SCORE CALCULATION:
- Weight: Experience (30%) + Technical (30%) + Communication (25%) + Situational (15%)
- Round to nearest integer
${scoreOverrideSection}

ASSESSMENT GUIDELINES:
- Be OBJECTIVE - base scores on actual evidence, not assumptions
- Be SPECIFIC - cite actual responses/patterns in your analysis
- Be CRITICAL - identify genuine concerns, don't sugarcoat
- Be BALANCED - acknowledge both strengths and weaknesses
- PENALIZE clearly: placeholder text ("test test"), one-word answers, no recordings
- **CRITICAL: Sections with NO answers must receive a score of exactly 0 - never infer from CV**

Return ONLY valid JSON with this structure:
{
  "experience_score": <0-100>,
  "technical_score": <0-100>,
  "communication_score": <0-100>,
  "situational_score": <0-100>,
  "overall_score": <0-100, weighted average>,
  "ai_summary": "<2-3 sentence overall assessment>",
  "ai_strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "ai_concerns": ["<concern 1>", "<concern 2>"],
  "ai_assessment_details": {
    "voice_analysis": {
      "answered_count": <number>,
      "average_duration": <seconds>,
      "depth_rating": "<shallow|adequate|detailed|none>",
      "highlights": ["<notable point>"]
    },
    "text_analysis": {
      "answered_count": <number>,
      "quality_rating": "<poor|fair|good|excellent|none>",
      "key_insights": ["<insight from their answers>"]
    }
  }
}`;

    const voiceAnswersFormatted = voiceAnswers.map((a, i) => 
      `Q${i + 1}: ${a.question_text}
Context: ${a.question_context}
Recording: ${a.voice_recording_url ? 'Yes' : 'No'}
Duration: ${a.voice_duration_seconds || 0} seconds`
    ).join('\n\n');

    const textAnswersFormatted = textAnswers.map((a, i) => 
      `Q${i + 1}: ${a.question_text}
Context: ${a.question_context}
Answer: ${a.text_answer || 'Not answered'}`
    ).join('\n\n');

    const userPrompt = `Assess this candidate's interview performance:

CANDIDATE: ${applicant_name}
ROLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

REQUIRED QUALIFICATIONS:
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

CV SUMMARY:
${cv_text.substring(0, 2000)}${cv_text.length > 2000 ? '...' : ''}

=== VOICE INTERVIEW ANSWERS (Experience, Technical & Communication) ===
${voiceAnswersFormatted || 'No voice answers recorded'}

=== TEXT ANSWER (Situational Question) ===
${textAnswersFormatted || 'No text answer provided'}

Provide your assessment. Return ONLY the JSON object.`;

    console.log('Assessing interview...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        const reason = response.status === 402 ? 'AI credits exhausted' : 'Rate limit exceeded';
        console.log(`${reason} - falling back to manual review`);
        
        await supabase
          .from('interview_sessions')
          .update({
            status: 'completed_manual_review',
            completed_at: new Date().toISOString(),
            ai_summary: `Manual review required - ${reason}.`,
          })
          .eq('id', session_id);

        await triggerAdminNotification(supabase, session_id, 'completed_manual_review');

        return new Response(
          JSON.stringify({ 
            success: true,
            manual_review: true,
            message: `Interview completed. ${reason} - responses will be reviewed manually.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    logAiUsage({
      functionName: 'assess-interview',
      model: 'google/gemini-3-flash-preview',
      usage: data.usage,
      context: { session_id },
    });

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI assessment response:', content);

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

    let assessmentResult: AssessmentResponse;
    try {
      assessmentResult = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, 'Content:', jsonContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse assessment' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize scores
    let validatedResult: AssessmentResponse = {
      experience_score: Math.max(0, Math.min(100, assessmentResult.experience_score || 0)),
      technical_score: Math.max(0, Math.min(100, assessmentResult.technical_score || 0)),
      communication_score: Math.max(0, Math.min(100, assessmentResult.communication_score || 0)),
      situational_score: Math.max(0, Math.min(100, assessmentResult.situational_score || 0)),
      overall_score: Math.max(0, Math.min(100, assessmentResult.overall_score || 0)),
      ai_summary: assessmentResult.ai_summary || 'Assessment completed.',
      ai_strengths: Array.isArray(assessmentResult.ai_strengths) ? assessmentResult.ai_strengths : [],
      ai_concerns: Array.isArray(assessmentResult.ai_concerns) ? assessmentResult.ai_concerns : [],
      ai_assessment_details: assessmentResult.ai_assessment_details || {}
    };

    // ENFORCE: Sections with no questions or no answers get 0
    if (!hasVoiceQuestions) {
      console.log('No voice questions - excluding from scoring');
      validatedResult.experience_score = 0;
      validatedResult.technical_score = 0;
      validatedResult.communication_score = 0;
    } else if (!hasVoiceResponses) {
      console.log('Enforcing 0 scores for voice section (no recordings)');
      validatedResult.experience_score = 0;
      validatedResult.technical_score = 0;
      validatedResult.communication_score = 0;
      
      if (!validatedResult.ai_concerns.some(c => c.toLowerCase().includes('voice') || c.toLowerCase().includes('recording'))) {
        validatedResult.ai_concerns.push('No voice recordings submitted for experience/technical questions');
      }
    }
    
    if (!hasTextQuestions) {
      console.log('No text questions - excluding from scoring');
      validatedResult.situational_score = 0;
    } else if (!hasTextResponses) {
      console.log('Enforcing 0 score for situational section (no text answers)');
      validatedResult.situational_score = 0;
      
      if (!validatedResult.ai_concerns.some(c => c.toLowerCase().includes('text') || c.toLowerCase().includes('situational'))) {
        validatedResult.ai_concerns.push('No text answers submitted for situational questions');
      }
    }

    // Recalculate overall score with dynamic weights
    // Base weights: Experience (30%) + Technical (30%) + Communication (25%) + Situational (15%)
    let weightExp = hasVoiceQuestions ? 0.30 : 0;
    let weightTech = hasVoiceQuestions ? 0.30 : 0;
    let weightComm = hasVoiceQuestions ? 0.25 : 0;
    let weightSit = hasTextQuestions ? 0.15 : 0;
    
    const totalWeight = weightExp + weightTech + weightComm + weightSit;
    
    if (totalWeight > 0) {
      // Normalize weights so they sum to 1.0
      weightExp /= totalWeight;
      weightTech /= totalWeight;
      weightComm /= totalWeight;
      weightSit /= totalWeight;
      
      validatedResult.overall_score = Math.round(
        (validatedResult.experience_score * weightExp) +
        (validatedResult.technical_score * weightTech) +
        (validatedResult.communication_score * weightComm) +
        (validatedResult.situational_score * weightSit)
      );
    } else {
      validatedResult.overall_score = 0;
    }
    
    console.log(`Dynamic weight calculation - Voice: ${hasVoiceQuestions}, Text: ${hasTextQuestions}, TotalWeight: ${totalWeight}`);

    // Update the interview session - personality_score set to 0 since MC is removed
    const { error: updateError } = await supabase
      .from('interview_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        experience_score: validatedResult.experience_score,
        technical_score: validatedResult.technical_score,
        communication_score: validatedResult.communication_score,
        situational_score: validatedResult.situational_score,
        personality_score: 0,
        overall_score: validatedResult.overall_score,
        ai_summary: validatedResult.ai_summary,
        ai_strengths: validatedResult.ai_strengths,
        ai_concerns: validatedResult.ai_concerns,
        ai_assessment_details: validatedResult.ai_assessment_details
      })
      .eq('id', session_id);

    if (updateError) {
      console.error('Failed to update interview session:', updateError);
    }

    await triggerAdminNotification(supabase, session_id, 'completed');

    console.log('Interview assessment completed:', validatedResult);

    return new Response(
      JSON.stringify(validatedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in assess-interview function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
