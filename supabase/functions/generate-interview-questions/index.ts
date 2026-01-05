import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuestionRequest {
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

interface MultipleChoiceOption {
  id: string;
  label: string;
  value: string;
}

interface MultipleChoiceQuestion {
  question_text: string;
  question_context: string;
  options: MultipleChoiceOption[];
}

interface QuestionsResponse {
  voice_questions: VoiceQuestion[];
  text_questions: TextQuestion[];
  multiple_choice_questions: MultipleChoiceQuestion[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are an expert HR interviewer. Your task is to generate interview questions for a job candidate based on the job requirements and their CV.

Generate THREE types of questions:

1. VOICE QUESTIONS (5-6 questions) - For verbal answers, testing experience and technical skills:
   - Ask about specific experiences from their CV
   - Ask about how they handled responsibilities listed in the job description
   - Ask technical questions about tools/technologies in the job posting
   - Ask follow-up style questions based on their work history
   - Questions should be open-ended and require detailed answers

2. TEXT QUESTIONS (5-6 questions) - Situational questions for written answers:
   - Present realistic work scenarios related to the role
   - Test decision-making and problem-solving abilities
   - Focus on how they would handle specific challenges
   - Each scenario should be relevant to the job responsibilities

3. MULTIPLE CHOICE QUESTIONS (5-6 questions) - Personality and interpersonal skills:
   - Test communication style, teamwork, reliability, professionalism
   - Each question MUST have exactly 4 options
   - Options should have varying degrees of suitability
   - No obviously wrong answers - test judgment and priorities

IMPORTANT RULES:
- Address the candidate by their first name where appropriate
- Reference specific details from their CV to personalize questions
- Make questions specific to the role and industry
- Voice questions should be answerable in 1-2 minutes each
- Text scenarios should be 2-3 sentences describing the situation
- The entire interview should take 20-30 minutes

Return ONLY valid JSON with this structure:
{
  "voice_questions": [
    {"question_text": "<question>", "question_context": "<why this question is relevant>"}
  ],
  "text_questions": [
    {"question_text": "<scenario + question>", "question_context": "<skill being assessed>"}
  ],
  "multiple_choice_questions": [
    {
      "question_text": "<question>",
      "question_context": "<trait being assessed>",
      "options": [
        {"id": "a", "label": "Option A text", "value": "a"},
        {"id": "b", "label": "Option B text", "value": "b"},
        {"id": "c", "label": "Option C text", "value": "c"},
        {"id": "d", "label": "Option D text", "value": "d"}
      ]
    }
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

Generate personalized interview questions based on this information. Return ONLY the JSON object.`;

    console.log('Generating interview questions...');

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

    console.log('AI response for questions:', content);

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

    // Validate structure
    const validatedResult: QuestionsResponse = {
      voice_questions: Array.isArray(questionsResult.voice_questions) 
        ? questionsResult.voice_questions.slice(0, 6) 
        : [],
      text_questions: Array.isArray(questionsResult.text_questions) 
        ? questionsResult.text_questions.slice(0, 6) 
        : [],
      multiple_choice_questions: Array.isArray(questionsResult.multiple_choice_questions) 
        ? questionsResult.multiple_choice_questions.slice(0, 6).map(q => ({
            ...q,
            options: Array.isArray(q.options) ? q.options.slice(0, 4) : []
          }))
        : []
    };

    console.log('Generated questions:', validatedResult);

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
