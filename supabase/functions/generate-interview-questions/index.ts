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

    // Check if AI is available
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiAvailable = !!LOVABLE_API_KEY;
    let noAiReason = '';

    // If we have custom questions, try to generate AI personality questions
    // If we don't have custom questions, try to generate all questions with AI
    if (hasCustomQuestions && aiAvailable) {
      // We have custom voice/text questions, just try to generate personality questions
      const personalityResult = await generatePersonalityQuestionsWithFallback(job_title, applicant_name);
      
      return new Response(
        JSON.stringify({
          voice_questions: customVoiceQuestions,
          text_questions: customTextQuestions,
          multiple_choice_questions: personalityResult.questions,
          has_custom_questions: true,
          no_ai_mode: personalityResult.no_ai_mode,
          no_ai_reason: personalityResult.no_ai_reason
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No custom questions - need to check if we have AI available
    if (!aiAvailable) {
      // No AI, check if we have custom questions to fall back to
      if (hasCustomQuestions && (customVoiceQuestions.length > 0 || customTextQuestions.length > 0)) {
        console.log('No AI available, using custom questions only');
        return new Response(
          JSON.stringify({
            voice_questions: customVoiceQuestions,
            text_questions: customTextQuestions,
            multiple_choice_questions: getDefaultPersonalityQuestions(),
            has_custom_questions: true,
            no_ai_mode: true,
            no_ai_reason: 'AI service not configured'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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

    // Try to generate questions with AI
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

    console.log('Generating interview questions with AI...');

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

    // Handle AI credit/rate limit errors with fallback
    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        noAiReason = response.status === 402 ? 'AI credits exhausted' : 'Rate limit exceeded';
        console.log(`${noAiReason}, checking for fallback options...`);
        
        // Check if we have custom questions to fall back to
        if (hasCustomQuestions && (customVoiceQuestions.length > 0 || customTextQuestions.length > 0)) {
          console.log('Falling back to custom questions only');
          return new Response(
            JSON.stringify({
              voice_questions: customVoiceQuestions,
              text_questions: customTextQuestions,
              multiple_choice_questions: getDefaultPersonalityQuestions(),
              has_custom_questions: true,
              no_ai_mode: true,
              no_ai_reason: noAiReason
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // No custom questions - return error with guidance to add manual questions
        return new Response(
          JSON.stringify({ 
            error: noAiReason,
            no_questions: true,
            message: 'Please add manual interview questions for this job to proceed without AI credits.'
          }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        : [],
      no_ai_mode: false
    };

    console.log('Generated questions successfully');

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

// Helper function to generate personality questions with AI, with fallback
async function generatePersonalityQuestionsWithFallback(
  jobTitle: string, 
  applicantName: string
): Promise<{ questions: MultipleChoiceQuestion[], no_ai_mode: boolean, no_ai_reason?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('No AI key, using default personality questions');
    return { 
      questions: getDefaultPersonalityQuestions(), 
      no_ai_mode: true, 
      no_ai_reason: 'AI service not configured' 
    };
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: `Generate 5 personality assessment multiple choice questions for a job interview.
Each question should have exactly 4 options testing communication style, teamwork, reliability, or professionalism.
Return ONLY valid JSON array with this structure:
[{"question_text": "<question>", "question_context": "<trait being assessed>", "options": [{"id": "a", "label": "...", "value": "a"}, {"id": "b", "label": "...", "value": "b"}, {"id": "c", "label": "...", "value": "c"}, {"id": "d", "label": "...", "value": "d"}]}]` 
          },
          { role: 'user', content: `Generate personality questions for a ${jobTitle} role. Candidate name: ${applicantName}` }
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      console.log(`AI API error for personality questions: ${status}`);
      
      if (status === 402 || status === 429) {
        return { 
          questions: getDefaultPersonalityQuestions(), 
          no_ai_mode: true, 
          no_ai_reason: status === 402 ? 'AI credits exhausted' : 'Rate limit exceeded'
        };
      }
      
      return { 
        questions: getDefaultPersonalityQuestions(), 
        no_ai_mode: true, 
        no_ai_reason: 'AI service unavailable'
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      return { questions: getDefaultPersonalityQuestions(), no_ai_mode: false };
    }

    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) jsonContent = jsonContent.slice(7);
    else if (jsonContent.startsWith('```')) jsonContent = jsonContent.slice(3);
    if (jsonContent.endsWith('```')) jsonContent = jsonContent.slice(0, -3);
    jsonContent = jsonContent.trim();

    const parsed = JSON.parse(jsonContent);
    return { 
      questions: Array.isArray(parsed) ? parsed.slice(0, 6) : getDefaultPersonalityQuestions(), 
      no_ai_mode: false 
    };
  } catch (error) {
    console.error('Error generating personality questions:', error);
    return { questions: getDefaultPersonalityQuestions(), no_ai_mode: false };
  }
}

// Fallback personality questions
function getDefaultPersonalityQuestions(): MultipleChoiceQuestion[] {
  return [
    {
      question_text: "How do you typically handle a situation where you disagree with a team member's approach?",
      question_context: "Conflict resolution and teamwork",
      options: [
        { id: "a", label: "I immediately voice my disagreement to ensure my perspective is heard", value: "a" },
        { id: "b", label: "I try to understand their perspective first, then share my thoughts constructively", value: "b" },
        { id: "c", label: "I usually go along with their approach to avoid conflict", value: "c" },
        { id: "d", label: "I escalate to a manager to get a third-party opinion", value: "d" }
      ]
    },
    {
      question_text: "When given a task with an unclear deadline, what do you typically do?",
      question_context: "Communication and initiative",
      options: [
        { id: "a", label: "Ask for clarification on the expected timeline immediately", value: "a" },
        { id: "b", label: "Set my own reasonable deadline and communicate it to the team", value: "b" },
        { id: "c", label: "Start working and complete it when I can", value: "c" },
        { id: "d", label: "Wait until someone follows up about it", value: "d" }
      ]
    },
    {
      question_text: "How do you prefer to receive feedback on your work?",
      question_context: "Growth mindset and adaptability",
      options: [
        { id: "a", label: "Direct and immediate, even if critical", value: "a" },
        { id: "b", label: "Regular scheduled check-ins with constructive suggestions", value: "b" },
        { id: "c", label: "Written feedback I can review on my own time", value: "c" },
        { id: "d", label: "Only when there's a significant issue to address", value: "d" }
      ]
    },
    {
      question_text: "When you're overloaded with tasks, how do you prioritize?",
      question_context: "Time management and prioritization",
      options: [
        { id: "a", label: "Focus on the most urgent deadlines first", value: "a" },
        { id: "b", label: "Communicate with stakeholders to reset expectations", value: "b" },
        { id: "c", label: "Work longer hours to complete everything", value: "c" },
        { id: "d", label: "Delegate or ask for help from teammates", value: "d" }
      ]
    },
    {
      question_text: "What motivates you most in your work?",
      question_context: "Motivation and career values",
      options: [
        { id: "a", label: "Learning new skills and professional growth", value: "a" },
        { id: "b", label: "Recognition and appreciation from the team", value: "b" },
        { id: "c", label: "Achieving goals and seeing measurable results", value: "c" },
        { id: "d", label: "Having a good work-life balance", value: "d" }
      ]
    }
  ];
}
