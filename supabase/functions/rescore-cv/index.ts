import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { applicant_id } = await req.json();
    
    if (!applicant_id) {
      return new Response(JSON.stringify({ error: 'applicant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch applicant data
    const { data: applicant, error: fetchError } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, job_title, cv_text, cv_file_url, job_id')
      .eq('id', applicant_id)
      .single();

    if (fetchError || !applicant) {
      return new Response(JSON.stringify({ error: 'Applicant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Re-scoring CV for applicant: ${applicant.full_name} (${applicant_id})`);
    console.log(`CV text length: ${applicant.cv_text?.length || 0}`);
    console.log(`CV file URL: ${applicant.cv_file_url || 'none'}`);

    // If no cv_text but has cv_file_url, we need to download and extract
    let cvText = applicant.cv_text;
    
    if (!cvText && applicant.cv_file_url) {
      console.log('No CV text found, attempting to download from storage...');
      
      // Download the file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('cv-uploads')
        .download(applicant.cv_file_url);

      if (downloadError) {
        console.error('Error downloading CV file:', downloadError);
        return new Response(JSON.stringify({ 
          error: 'Could not download CV file',
          details: downloadError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For now, we'll just note that server-side PDF extraction would require additional setup
      return new Response(JSON.stringify({ 
        error: 'CV text extraction not available server-side. Please re-upload the CV through the application form.',
        cv_file_exists: true,
        cv_file_url: applicant.cv_file_url
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!cvText) {
      return new Response(JSON.stringify({ 
        error: 'No CV text available for scoring. The applicant needs to re-upload their CV.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch job details
    let jobDescription = '';
    let qualifications: string[] = [];
    let responsibilities: string[] = [];

    if (applicant.job_id) {
      const { data: job } = await supabase
        .from('jobs')
        .select('description, qualifications, responsibilities')
        .eq('id', applicant.job_id)
        .single();

      if (job) {
        jobDescription = job.description || '';
        qualifications = job.qualifications || [];
        responsibilities = job.responsibilities || [];
      }
    }

    // Run CV scoring
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `You are an expert HR recruiter and CV evaluator. Your task is to score a candidate's CV against a job posting and provide detailed analysis.

SCORING RULES (total = 95):
- Role experience match: 0-45 points (how well their experience matches the role)
- Skills and tools match: 0-45 points (how well their skills match required qualifications)
- Availability and setup readiness: 0-5 points (remote work readiness indicators)

RANKING STATUS:
- Strong Match: total_score >= 65
- Partial Match: total_score >= 38 AND < 65
- Low Match: total_score < 38

EXTRACTION REQUIREMENTS:
You MUST also extract searchable metadata from the CV:
1. extracted_skills: List ALL skills mentioned (soft skills, hard skills, languages, certifications)
2. extracted_tools: List ALL software/tools/platforms mentioned
3. years_of_experience: Estimate total professional experience in years (null if unclear)

You MUST return ONLY valid JSON with NO additional text.`;

    const userPrompt = `Evaluate this candidate's CV for the following job:

JOB TITLE: ${applicant.job_title}

JOB DESCRIPTION: ${jobDescription || 'Not provided'}

KEY QUALIFICATIONS REQUIRED:
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

RESPONSIBILITIES:
${responsibilities?.length ? responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified'}

CANDIDATE CV TEXT:
${cvText}

Return ONLY the JSON scoring object with detailed assessment_details and extracted metadata, no other text.`;

    console.log('Calling AI for CV scoring...');

    const aiResponse = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(JSON.stringify({ error: 'AI scoring failed', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the JSON response
    let scores;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scores = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: aiContent }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate total score (max 95)
    const totalScore = 
      (scores.role_experience_score || 0) + 
      (scores.skills_tools_score || 0) + 
      (scores.availability_setup_score || 0);

    // Determine ranking status
    let rankingStatus = 'Low Match';
    if (totalScore >= 65) {
      rankingStatus = 'Strong Match';
    } else if (totalScore >= 38) {
      rankingStatus = 'Partial Match';
    }

    // Update the applicant record
    const { error: updateError } = await supabase
      .from('applicants_prescreen')
      .update({
        role_experience_score: scores.role_experience_score,
        skills_tools_score: scores.skills_tools_score,
        availability_setup_score: scores.availability_setup_score,
        total_score: totalScore,
        ranking_status: rankingStatus,
        ai_summary: scores.summary,
        ai_assessment_details: scores.assessment_details,
        extracted_skills: scores.extracted_skills || [],
        extracted_tools: scores.extracted_tools || [],
        years_of_experience: scores.years_of_experience,
      })
      .eq('id', applicant_id);

    if (updateError) {
      console.error('Error updating applicant:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to save scores' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully re-scored applicant ${applicant_id} with total score: ${scores.total_score}`);

    return new Response(JSON.stringify({ 
      success: true,
      scores: {
        total_score: scores.total_score,
        ranking_status: scores.ranking_status,
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in rescore-cv:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
