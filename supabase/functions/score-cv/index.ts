import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScoreRequest {
  job_title: string;
  job_description: string;
  key_qualifications: string[];
  responsibilities: string[];
  cv_text: string;
}

interface ToolMatch {
  tool: string;
  found: boolean;
  context?: string;
}

interface ExperienceHighlight {
  role: string;
  company?: string;
  duration?: string;
  relevance: string;
}

interface AssessmentDetails {
  matched_tools: ToolMatch[];
  missing_tools: string[];
  experience_highlights: ExperienceHighlight[];
  strengths: string[];
  concerns: string[];
}

interface ScoreResponse {
  role_experience_score: number;
  skills_tools_score: number;
  availability_setup_score: number;
  total_score: number;
  ranking_status: string;
  summary: string;
  assessment_details: AssessmentDetails;
  // New fields for searchable metadata
  extracted_skills: string[];
  extracted_tools: string[];
  years_of_experience: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_title, job_description, key_qualifications, responsibilities, cv_text }: ScoreRequest = await req.json();

    if (!cv_text || !job_title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: cv_text and job_title' }),
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

    const systemPrompt = `You are an expert HR recruiter and CV evaluator. Your task is to score a candidate's CV against a job posting and provide detailed analysis.

SCORING RULES (total = 100):
- Role experience match: 0-50 points (how well their experience matches the role)
- Skills and tools match: 0-45 points (how well their skills match required qualifications)
- Availability and setup readiness: 0-5 points (remote work readiness indicators)

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
  "role_experience_score": <number 0-50>,
  "skills_tools_score": <number 0-45>,
  "availability_setup_score": <number 0-5>,
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
}

IMPORTANT for assessment_details:
- Extract ALL required tools/skills from the job qualifications and check if they appear in the CV
- For matched_tools, include the context snippet from the CV where the tool/skill was mentioned
- For experience_highlights, list the 2-3 most relevant past positions and explain why they matter
- Be specific and cite actual information from the CV

IMPORTANT for extracted metadata:
- Be thorough - extract ALL skills and tools mentioned, not just job-relevant ones
- Normalize names (e.g., "MS Excel" -> "Excel", "Google Sheets" -> "Google Workspace")
- Include language skills as skills
- Include certifications as skills`;

    const userPrompt = `Evaluate this candidate's CV for the following job:

JOB TITLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

KEY QUALIFICATIONS REQUIRED:
${key_qualifications?.length ? key_qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

RESPONSIBILITIES:
${responsibilities?.length ? responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified'}

CANDIDATE CV TEXT:
${cv_text}

Return ONLY the JSON scoring object with detailed assessment_details and extracted metadata, no other text.`;

    console.log('Calling Lovable AI for CV scoring with metadata extraction...');

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
        JSON.stringify({ error: 'AI scoring service unavailable' }),
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

    console.log('AI response content:', content);

    // Parse JSON from the response, handling potential markdown code blocks
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

    let scoreResult: ScoreResponse;
    try {
      scoreResult = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, 'Content:', jsonContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse scoring result' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate the score result
    const validatedResult: ScoreResponse = {
      role_experience_score: Math.max(0, Math.min(50, scoreResult.role_experience_score || 0)),
      skills_tools_score: Math.max(0, Math.min(45, scoreResult.skills_tools_score || 0)),
      availability_setup_score: Math.max(0, Math.min(5, scoreResult.availability_setup_score || 0)),
      total_score: 0,
      ranking_status: scoreResult.ranking_status || 'Low Match',
      summary: scoreResult.summary || 'Unable to generate summary.',
      assessment_details: scoreResult.assessment_details || {
        matched_tools: [],
        missing_tools: [],
        experience_highlights: [],
        strengths: [],
        concerns: []
      },
      // New extracted metadata
      extracted_skills: Array.isArray(scoreResult.extracted_skills) ? scoreResult.extracted_skills : [],
      extracted_tools: Array.isArray(scoreResult.extracted_tools) ? scoreResult.extracted_tools : [],
      years_of_experience: typeof scoreResult.years_of_experience === 'number' ? scoreResult.years_of_experience : null
    };

    // Recalculate total to ensure accuracy (max 100)
    validatedResult.total_score = 
      validatedResult.role_experience_score + 
      validatedResult.skills_tools_score + 
      validatedResult.availability_setup_score;

    // Validate ranking status based on score
    if (validatedResult.total_score >= 70) {
      validatedResult.ranking_status = 'Strong Match';
    } else if (validatedResult.total_score >= 40) {
      validatedResult.ranking_status = 'Partial Match';
    } else {
      validatedResult.ranking_status = 'Low Match';
    }

    console.log('Validated score result with metadata:', validatedResult);

    return new Response(
      JSON.stringify(validatedResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in score-cv function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
