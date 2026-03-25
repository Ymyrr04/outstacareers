import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuestionRequest {
  job_id?: string;
  job_title: string;
  job_description: string | null;
  qualifications: string[] | null;
  responsibilities: string[] | null;
  cv_text: string;
  applicant_name: string;
}

interface VoiceQuestion {
  question_text: string;
  question_context: string;
}

interface TextQuestion {
  question_text: string;
  question_context: string;
}

interface QuestionsResponse {
  voice_questions: VoiceQuestion[];
  text_questions: TextQuestion[];
  has_custom_questions?: boolean;
  no_ai_mode?: boolean;
  no_ai_reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      job_id,
      job_title, 
      job_description, 
      qualifications, 
      responsibilities, 
      cv_text,
      applicant_name 
    }: QuestionRequest = await req.json();

    if (!job_title || !cv_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: job_title and cv_text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for custom questions first
    let customVoiceQuestions: VoiceQuestion[] = [];
    let customTextQuestions: TextQuestion[] = [];
    let hasCustomQuestions = false;

    if (job_id) {
      const { data: customQuestions, error: customError } = await supabase
        .from('job_interview_questions')
        .select('*')
        .eq('job_id', job_id)
        .order('question_order');

      if (!customError && customQuestions && customQuestions.length > 0) {
        console.log(`Found ${customQuestions.length} custom questions for job ${job_id}`);
        hasCustomQuestions = true;
        
        customVoiceQuestions = customQuestions
          .filter(q => q.question_type === 'voice')
          .map(q => ({
            question_text: q.question_text,
            question_context: q.question_context || ''
          }));

        customTextQuestions = customQuestions
          .filter(q => q.question_type === 'text')
          .map(q => ({
            question_text: q.question_text,
            question_context: q.question_context || ''
          }));
      }
    }

    // If we have custom questions, use them directly
    if (hasCustomQuestions) {
      console.log(`Using custom questions: ${customVoiceQuestions.length} voice, ${customTextQuestions.length} text`);
      return new Response(
        JSON.stringify({
          voice_questions: customVoiceQuestions,
          text_questions: customTextQuestions,
          has_custom_questions: true,
          no_ai_mode: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if AI is available
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      // No AI and no custom questions - return error with guidance
      return new Response(
        JSON.stringify({ 
          error: 'No interview questions available',
          no_questions: true,
          message: 'Please add manual interview questions for this job to proceed without AI.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate questions with AI: 3 voice + 1 text
    const systemPrompt = `You are a senior HR interviewer with expertise in behavioral and competency-based interviewing. Your task is to generate highly relevant, probing interview questions that genuinely assess a candidate's fit for the role.

CRITICAL PRINCIPLES:
- Questions must be SPECIFIC to the job and candidate's background - no generic questions
- Every question should have a clear assessment purpose tied to job requirements
- Questions should be challenging enough to differentiate top candidates from average ones

⚠️ EXTREMELY IMPORTANT - CV ACCURACY RULES ⚠️
- ONLY reference skills, tools, roles, and experiences that are EXPLICITLY stated in the CV
- DO NOT assume or infer experience the candidate doesn't have
- DO NOT mention specific tools, platforms, or techniques unless they appear verbatim in the CV
- If the CV lacks detail in an area, ask OPEN-ENDED questions to explore (e.g., "Tell me about..." rather than "Describe your experience with X")
- When referencing CV content, use phrases like "You mentioned..." or "Your CV shows..." to ground questions in actual content
- If the job requires skills not in the CV, ask if they have that experience rather than assuming they do

Generate TWO types of questions:

1. VOICE QUESTIONS (3 questions) - Experience, Technical & Communication assessment:
   FOCUS ON:
   - STAR-format questions (Situation, Task, Action, Result) about ACTUAL experiences mentioned in CV
   - Technical proficiency with tools/platforms ONLY if mentioned in CV
   - Problem-solving scenarios from roles ACTUALLY listed in their work history
   - Leadership/collaboration examples ONLY from roles they've held
   - Questions that require specific examples, not hypotheticals
   
   QUESTION QUALITY CHECKLIST:
   ✓ References a VERIFIED role, company, or skill from their CV (not assumed)
   ✓ Cannot be answered with generic/rehearsed responses
   ✓ Requires concrete examples with measurable outcomes
   ✓ Directly relates to a key job requirement
   ✓ Should take 60-90 seconds to answer well

2. TEXT QUESTION (1 question) - Situational judgment and problem-solving:
   FOCUS ON:
   - A realistic scenario that could happen in this specific role
   - Multi-factor problems requiring prioritization
   - Stakeholder management challenges
   - Time-pressure decision making
   
   SCENARIO QUALITY CHECKLIST:
   ✓ Specific to this role/industry, not generic workplace situations
   ✓ Has no "obvious" right answer - tests judgment
   ✓ Requires weighing trade-offs
   ✓ Includes enough context for a thoughtful response
   ✓ Answer should require 3-5 sentences minimum

FORMATTING REQUIREMENTS:
- Use the candidate's first name naturally in 1-2 questions
- Voice questions: Direct, clear, and specific - grounded in actual CV content
- Text scenario: 2-4 sentences of context, then a clear question

Return ONLY valid JSON with this structure:
{
  "voice_questions": [
    {"question_text": "<question>", "question_context": "<why this question is relevant>"}
  ],
  "text_questions": [
    {"question_text": "<scenario + question>", "question_context": "<skill being assessed>"}
  ]
}`;
    const userPrompt = `Generate interview questions for this candidate:

CANDIDATE NAME: ${applicant_name}

JOB TITLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

REQUIRED QUALIFICATIONS:
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

JOB RESPONSIBILITIES:
${responsibilities?.length ? responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified'}

CANDIDATE'S CV:
${cv_text}

Generate 3 voice questions and 1 text question based on this information. Return ONLY the JSON object.`;

    console.log('Generating interview questions with AI (3 voice + 1 text)...');

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

    // Handle AI credit/rate limit errors with fallback
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        const noAiReason = response.status === 402 ? 'AI credits exhausted' : 'Rate limit exceeded';
        console.log(`${noAiReason}, no custom questions available`);
        
        return new Response(
          JSON.stringify({ 
            no_questions: true,
            no_ai_mode: true,
            no_ai_reason: noAiReason,
            message: 'Please add manual interview questions for this job to proceed without AI credits.'
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

    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'Invalid AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI response for questions received');

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

    let questionsResult: QuestionsResponse;
    try {
      questionsResult = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, 'Content:', jsonContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse questions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate structure - enforce 3 voice + 1 text
    const validatedResult: QuestionsResponse = {
      voice_questions: Array.isArray(questionsResult.voice_questions) 
        ? questionsResult.voice_questions.slice(0, 3) 
        : [],
      text_questions: Array.isArray(questionsResult.text_questions) 
        ? questionsResult.text_questions.slice(0, 1) 
        : [],
      no_ai_mode: false
    };

    console.log(`Generated questions: ${validatedResult.voice_questions.length} voice, ${validatedResult.text_questions.length} text`);

    return new Response(
      JSON.stringify(validatedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-interview-questions function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
