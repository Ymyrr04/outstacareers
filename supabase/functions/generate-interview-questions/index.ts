import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logAiUsage } from "../_shared/logAiUsage.ts";

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
  allow_paste?: boolean;
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
            question_context: q.question_context || '',
            allow_paste: q.allow_paste === true
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

🔴 #1 PRIORITY — JOB QUALIFICATIONS & RESPONSIBILITIES 🔴
Your questions MUST be driven primarily by the job's REQUIRED QUALIFICATIONS and KEY RESPONSIBILITIES.
- At least 2 out of 3 voice questions MUST directly test a specific required qualification or core responsibility
- The text scenario MUST simulate a realistic challenge drawn from the job's responsibilities
- If qualifications list specific tools, certifications, or skills — those MUST be the focus of technical questions
- If responsibilities describe specific workflows, processes, or outcomes — questions should probe the candidate's ability to deliver on those
- The CV is used to PERSONALIZE the question (e.g., referencing their past role), but the TOPIC must come from the job requirements

CRITICAL PRINCIPLES:
- Questions must be SPECIFIC to the job requirements and candidate's background - no generic questions
- Every question should have a clear assessment purpose tied to a specific qualification or responsibility
- Questions should be challenging enough to differentiate top candidates from average ones

⚠️ CV ACCURACY RULES ⚠️
- ONLY reference skills, tools, roles, and experiences that are EXPLICITLY stated in the CV
- DO NOT assume or infer experience the candidate doesn't have
- DO NOT mention specific tools, platforms, or techniques unless they appear verbatim in the CV
- If the job requires a qualification the candidate's CV doesn't mention, ASK if they have that experience rather than assuming
- When referencing CV content, use phrases like "You mentioned..." or "Your CV shows..." to ground questions in actual content

Generate TWO types of questions:

1. VOICE QUESTIONS (3 questions) - Experience, Technical & Communication assessment:
   PRIORITY ORDER:
   a) Questions testing KEY QUALIFICATIONS from the job listing (highest priority)
   b) Questions testing ability to handle KEY RESPONSIBILITIES (high priority)
   c) Questions exploring relevant experience from CV that maps to job requirements (supporting)
   
   FORMAT:
   - Use STAR-format (Situation, Task, Action, Result) when probing past experience
   - For qualifications the candidate may lack, ask exploratory questions: "The role requires [X]. Can you walk us through your experience with this?"
   - For responsibilities, create scenario-based questions: "A key part of this role is [responsibility]. Tell us about a time you handled something similar."
   
   QUESTION QUALITY CHECKLIST:
   ✓ Maps to a SPECIFIC qualification or responsibility from the job listing
   ✓ Cannot be answered with generic/rehearsed responses
   ✓ Requires concrete examples with measurable outcomes
   ✓ Should take 60-90 seconds to answer well

2. TEXT QUESTION (1 question) - Situational judgment and problem-solving:
   MUST BE BASED ON the job's actual responsibilities. Create a realistic scenario the candidate would face in this specific role.
   
   SCENARIO QUALITY CHECKLIST:
   ✓ Derived from one or more KEY RESPONSIBILITIES listed in the job
   ✓ Specific to this role/industry, not generic workplace situations
   ✓ Has no "obvious" right answer - tests judgment
   ✓ Requires weighing trade-offs relevant to the role
   ✓ Includes enough context for a thoughtful response
   ✓ Answer should require 3-5 sentences minimum

FORMATTING REQUIREMENTS:
- Use the candidate's first name naturally in 1-2 questions
- Voice questions: Direct, clear, and specific
- Text scenario: 2-4 sentences of context drawn from the job's responsibilities, then a clear question
- In question_context, specify WHICH qualification or responsibility the question tests

Return ONLY valid JSON with this structure:
{
  "voice_questions": [
    {"question_text": "<question>", "question_context": "<which qualification/responsibility this tests>"}
  ],
  "text_questions": [
    {"question_text": "<scenario + question>", "question_context": "<which responsibility this simulates>"}
  ]
}`;
    const userPrompt = `Generate interview questions for this candidate. PRIORITIZE questions that test the REQUIRED QUALIFICATIONS and KEY RESPONSIBILITIES listed below.

CANDIDATE NAME: ${applicant_name}

JOB TITLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

⭐ REQUIRED QUALIFICATIONS (questions MUST test these):
${qualifications?.length ? qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified - focus on job description instead'}

⭐ KEY RESPONSIBILITIES (questions MUST reflect these):
${responsibilities?.length ? responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified - focus on job description instead'}

CANDIDATE'S CV (use to personalize, but prioritize job requirements above):
${cv_text}

Generate 3 voice questions and 1 text question. Each question's context must specify which qualification or responsibility it tests. Return ONLY the JSON object.`;

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
    logAiUsage({
      functionName: 'generate-interview-questions',
      model: 'google/gemini-3-flash-preview',
      usage: data.usage,
      context: { job_id: job_id ?? null, job_title },
    });

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
