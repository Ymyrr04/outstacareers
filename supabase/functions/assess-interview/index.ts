import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
}

interface AssessmentResponse {
  experience_score: number;
  technical_score: number;
  communication_score: number;
  situational_score: number;
  personality_score: number;
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
      answers
    }: AssessmentRequest = await req.json();

    if (!session_id || !answers || answers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: session_id and answers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format answers for AI assessment
    const voiceAnswers = answers.filter(a => a.section === 'voice');
    const textAnswers = answers.filter(a => a.section === 'text');
    const mcAnswers = answers.filter(a => a.section === 'multiple_choice');

    const systemPrompt = `You are an expert HR interviewer and assessor. Your task is to evaluate a candidate's interview performance and provide detailed scoring and feedback.

SCORING CRITERIA (each 0-100):
1. Experience Score: Based on voice answers about their background and experience relevance
2. Technical Score: Based on voice answers about tools, technologies, and technical competencies
3. Communication Score: Based on clarity, structure, and professionalism in voice answers (assessed via recording metadata and context)
4. Situational Score: Based on text answers to situational/scenario questions
5. Personality Score: Based on multiple choice answers about interpersonal skills

IMPORTANT NOTES:
- For voice answers, you are receiving metadata (duration) not transcriptions. Score based on:
  - Whether they answered (recording exists)
  - Recording duration (longer = more detailed, but too short may indicate lack of depth)
  - Consider 30-90 seconds as ideal for most questions
- For text answers, evaluate the actual written response content
- For multiple choice, consider the option they selected and what it reveals about their work style

Return ONLY valid JSON with this structure:
{
  "experience_score": <0-100>,
  "technical_score": <0-100>,
  "communication_score": <0-100>,
  "situational_score": <0-100>,
  "personality_score": <0-100>,
  "overall_score": <0-100, weighted average>,
  "ai_summary": "<2-3 sentence overall assessment>",
  "ai_strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "ai_concerns": ["<concern 1>", "<concern 2>"],
  "ai_assessment_details": {
    "voice_analysis": {
      "answered_count": <number>,
      "average_duration": <seconds>,
      "depth_rating": "<shallow|adequate|detailed>",
      "highlights": ["<notable point>"]
    },
    "text_analysis": {
      "answered_count": <number>,
      "quality_rating": "<poor|fair|good|excellent>",
      "key_insights": ["<insight from their answers>"]
    },
    "personality_profile": {
      "work_style": "<description>",
      "team_fit": "<assessment>",
      "notable_traits": ["<trait>"]
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

    const mcAnswersFormatted = mcAnswers.map((a, i) => {
      const selectedOption = a.options?.find(o => o.id === a.selected_option_id);
      return `Q${i + 1}: ${a.question_text}
Context: ${a.question_context}
Options: ${a.options?.map(o => `${o.id}) ${o.label}`).join(' | ')}
Selected: ${selectedOption ? `${selectedOption.id}) ${selectedOption.label}` : 'Not answered'}`;
    }).join('\n\n');

    const userPrompt = `Assess this candidate's interview performance:

CANDIDATE: ${applicant_name}
ROLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

REQUIRED QUALIFICATIONS:
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

CV SUMMARY:
${cv_text.substring(0, 2000)}${cv_text.length > 2000 ? '...' : ''}

=== VOICE INTERVIEW ANSWERS (Experience & Technical) ===
${voiceAnswersFormatted || 'No voice answers recorded'}

=== TEXT ANSWERS (Situational Questions) ===
${textAnswersFormatted || 'No text answers provided'}

=== MULTIPLE CHOICE ANSWERS (Personality & Interpersonal) ===
${mcAnswersFormatted || 'No multiple choice answers'}

Provide your assessment. Return ONLY the JSON object.`;

    console.log('Assessing interview...');

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
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please contact support.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

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
    const validatedResult: AssessmentResponse = {
      experience_score: Math.max(0, Math.min(100, assessmentResult.experience_score || 0)),
      technical_score: Math.max(0, Math.min(100, assessmentResult.technical_score || 0)),
      communication_score: Math.max(0, Math.min(100, assessmentResult.communication_score || 0)),
      situational_score: Math.max(0, Math.min(100, assessmentResult.situational_score || 0)),
      personality_score: Math.max(0, Math.min(100, assessmentResult.personality_score || 0)),
      overall_score: Math.max(0, Math.min(100, assessmentResult.overall_score || 0)),
      ai_summary: assessmentResult.ai_summary || 'Assessment completed.',
      ai_strengths: Array.isArray(assessmentResult.ai_strengths) ? assessmentResult.ai_strengths : [],
      ai_concerns: Array.isArray(assessmentResult.ai_concerns) ? assessmentResult.ai_concerns : [],
      ai_assessment_details: assessmentResult.ai_assessment_details || {}
    };

    // Update the interview session in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from('interview_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        experience_score: validatedResult.experience_score,
        technical_score: validatedResult.technical_score,
        communication_score: validatedResult.communication_score,
        situational_score: validatedResult.situational_score,
        personality_score: validatedResult.personality_score,
        overall_score: validatedResult.overall_score,
        ai_summary: validatedResult.ai_summary,
        ai_strengths: validatedResult.ai_strengths,
        ai_concerns: validatedResult.ai_concerns,
        ai_assessment_details: validatedResult.ai_assessment_details
      })
      .eq('id', session_id);

    if (updateError) {
      console.error('Failed to update interview session:', updateError);
      // Continue anyway - the assessment was successful
    }

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
