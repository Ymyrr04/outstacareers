import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if text looks like corrupted/binary data
function isCorruptedText(text: string): boolean {
  if (!text || text.length < 50) return true;
  
  // Count readable characters vs garbage
  const readableChars = text.match(/[a-zA-Z0-9\s.,;:!?@#$%&*()\-_+=\[\]{}|\\'"<>/]/g) || [];
  const readableRatio = readableChars.length / text.length;
  
  // If less than 60% readable characters, it's likely corrupted
  if (readableRatio < 0.6) return true;
  
  // Check for common PDF binary markers in the text
  const binaryMarkers = [
    'endstream', 'endobj', 'xref', '/Filter', '/FlateDecode',
    'stream', 'obj', '<<', '>>', '/Length', '/Type'
  ];
  
  let markerCount = 0;
  for (const marker of binaryMarkers) {
    if (text.includes(marker)) markerCount++;
  }
  
  // If multiple PDF structure markers found, text extraction failed
  if (markerCount >= 3) return true;
  
  return false;
}

async function extractTextWithVision(
  supabase: any,
  cvFileUrl: string,
  LOVABLE_API_KEY: string
): Promise<{ success: boolean; text?: string; error?: string }> {
  try {
    console.log(`Attempting vision extraction for: ${cvFileUrl}`);

    // Download the PDF file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('cv-uploads')
      .download(cvFileUrl);

    if (downloadError || !fileData) {
      console.error('Error downloading CV file:', downloadError);
      return { success: false, error: 'Could not download CV file' };
    }

    // Convert PDF to base64 for vision API
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Determine MIME type
    const fileName = cvFileUrl.toLowerCase();
    let mimeType = 'application/pdf';
    if (fileName.endsWith('.png')) mimeType = 'image/png';
    else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (fileName.endsWith('.webp')) mimeType = 'image/webp';

    console.log(`Sending ${mimeType} file to vision AI for text extraction...`);

    // Use Gemini vision to extract text from the document
    const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a CV/Resume text extractor. Extract ALL text content from this document exactly as it appears, preserving the structure and layout as much as possible. 

Extract:
- Full name
- Contact information (email, phone, address)
- Professional summary/objective if present
- Work experience (job titles, companies, dates, responsibilities)
- Education (degrees, institutions, dates)
- Skills and certifications
- Any other relevant sections

Format the output as clean, readable plain text that can be used for job matching analysis. Do NOT add any commentary or analysis - just extract the text content.

If the document is not readable or is not a CV/resume, respond with: "EXTRACTION_FAILED: [reason]"`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', visionResponse.status, errorText);
      return { success: false, error: `Vision API error: ${visionResponse.status}` };
    }

    const visionData = await visionResponse.json();
    const extractedText = visionData.choices?.[0]?.message?.content;

    logAiUsage({
      functionName: 'rescore-cv:vision',
      model: 'google/gemini-2.5-flash',
      usage: visionData.usage,
      context: { mimeType, file: fileName },
    });

    if (!extractedText || extractedText.startsWith('EXTRACTION_FAILED:')) {
      console.error('Vision extraction failed:', extractedText);
      return { success: false, error: extractedText || 'No text extracted' };
    }

    console.log(`Vision extraction successful. Extracted ${extractedText.length} characters.`);
    return { success: true, text: extractedText };

  } catch (error) {
    console.error('Vision extraction error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { applicant_id, force_vision = false } = await req.json();
    
    if (!applicant_id) {
      return new Response(JSON.stringify({ error: 'applicant_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch applicant data
    const { data: applicant, error: fetchError } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, job_title, cv_text, cv_file_url, job_id, file_hash, ai_summary')
      .eq('id', applicant_id)
      .single();

    if (fetchError || !applicant) {
      return new Response(JSON.stringify({ error: 'Applicant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dedupe: if this applicant already has an AI summary and caller did not force, skip.
    if (!force_vision && applicant.ai_summary && applicant.ai_summary.trim().length > 0) {
      console.log(`Applicant ${applicant_id} already scored — skipping redundant AI call.`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already_scored' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Dedupe: if another applicant with the same file_hash has already been scored,
    // copy that score rather than re-running the AI.
    if (!force_vision && applicant.file_hash) {
      const { data: twin } = await supabase
        .from('applicants_prescreen')
        .select('ai_summary, scoring_breakdown, total_score')
        .eq('file_hash', applicant.file_hash)
        .neq('id', applicant_id)
        .not('ai_summary', 'is', null)
        .limit(1)
        .maybeSingle();
      if (twin?.ai_summary) {
        await supabase
          .from('applicants_prescreen')
          .update({
            ai_summary: twin.ai_summary,
            scoring_breakdown: (twin as any).scoring_breakdown ?? null,
            total_score: (twin as any).total_score ?? null,
          })
          .eq('id', applicant_id);
        console.log(`Copied existing score from twin file_hash for applicant ${applicant_id}.`);
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'reused_file_hash' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


    console.log(`Re-scoring CV for applicant: ${applicant.full_name} (${applicant_id})`);
    console.log(`CV text length: ${applicant.cv_text?.length || 0}`);
    console.log(`CV file URL: ${applicant.cv_file_url || 'none'}`);
    console.log(`Force vision: ${force_vision}`);

    // Determine if we need vision extraction
    let cvText = applicant.cv_text;
    const textIsCorrupted = isCorruptedText(cvText || '');
    let extractionMethod = 'existing';

    if (force_vision || textIsCorrupted) {
      if (!applicant.cv_file_url) {
        return new Response(JSON.stringify({ 
          error: 'CV text is corrupted/missing and no file available for vision extraction',
          suggestion: 'Please re-upload the CV through the application form.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Text is corrupted or vision forced, attempting vision extraction...');
      const visionResult = await extractTextWithVision(supabase, applicant.cv_file_url, LOVABLE_API_KEY);
      
      if (!visionResult.success || !visionResult.text) {
        return new Response(JSON.stringify({ 
          error: 'Vision extraction failed',
          details: visionResult.error,
          suggestion: 'The PDF may be encrypted, password-protected, or in an unsupported format.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      cvText = visionResult.text;
      extractionMethod = 'vision';

      // Update the applicant record with the extracted text
      await supabase
        .from('applicants_prescreen')
        .update({ cv_text: cvText })
        .eq('id', applicant_id);

      console.log('Updated applicant with vision-extracted text');
    }

    if (!cvText) {
      return new Response(JSON.stringify({ 
        error: 'No CV text available for scoring. Please re-upload the CV.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Truncate CV text to avoid exceeding AI token limits (~4 chars per token, limit ~1M tokens)
    // Cap at 50,000 characters which is more than enough for any CV
    const MAX_CV_LENGTH = 50000;
    if (cvText.length > MAX_CV_LENGTH) {
      console.log(`CV text too long (${cvText.length} chars), truncating to ${MAX_CV_LENGTH}`);
      cvText = cvText.substring(0, MAX_CV_LENGTH) + '\n\n[... CV text truncated due to length ...]';
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
2. extracted_tools: List ALL software/tools/platforms mentioned
3. years_of_experience: Estimate total professional experience in years (null if unclear)

You MUST return ONLY valid JSON with NO additional text, with this structure:
{
  "role_experience_score": <0-50>,
  "skills_tools_score": <0-45>,
  "availability_setup_score": <0-5>,
  "summary": "<max 3 sentences>",
  "assessment_details": {
    "matched_tools": [{"tool": "<name>", "found": true, "context": "<snippet from CV>"}],
    "missing_tools": ["<required tool/skill not found>"],
    "experience_highlights": [{"role": "<title>", "company": "<company>", "duration": "<period>", "relevance": "<why relevant>"}],
    "strengths": ["<strength>"],
    "concerns": ["<concern>"],
    "recommended_roles": [{"role": "<other role they fit>", "fit_score": <0-100>, "reason": "<1 sentence>"}]
  },
  "extracted_skills": ["<skill>"],
  "extracted_tools": ["<tool>"],
  "years_of_experience": <number or null>
}

For recommended_roles: independently of the job applied for, recommend 3-5 OTHER roles the candidate is viable for, each scored 0-100 for viability, sorted descending, excluding the role they applied for.`;

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

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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

    logAiUsage({
      functionName: 'rescore-cv:scoring',
      model: 'google/gemini-2.5-flash',
      usage: aiData.usage,
      context: { applicant_id, job_id: applicant.job_id, extraction_method: extractionMethod },
    });

    if (!aiContent) {
      return new Response(JSON.stringify({ error: 'No response from AI' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the JSON response
    let scores;
    try {
      let jsonContent = aiContent.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      scores = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: aiContent }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Coerce AI values to integers (DB columns are integer)
    const toInt = (v: unknown, max?: number) => {
      const n = Number(v);
      if (!isFinite(n)) return 0;
      const r = Math.round(n);
      return max !== undefined ? Math.min(max, Math.max(0, r)) : Math.max(0, r);
    };

    const roleScore = toInt(scores.role_experience_score, 50);
    const skillsScore = toInt(scores.skills_tools_score, 45);
    const availabilityScore = toInt(scores.availability_setup_score, 5);

    // Calculate total score (max 100)
    const totalScore = roleScore + skillsScore + availabilityScore;

    // Determine ranking status
    let rankingStatus = 'Low Match';
    if (totalScore >= 70) {
      rankingStatus = 'Strong Match';
    } else if (totalScore >= 40) {
      rankingStatus = 'Partial Match';
    }

    const yearsExp =
      scores.years_of_experience === null || scores.years_of_experience === undefined
        ? null
        : toInt(scores.years_of_experience);

    // Update the applicant record
    const { error: updateError } = await supabase
      .from('applicants_prescreen')
      .update({
        role_experience_score: roleScore,
        skills_tools_score: skillsScore,
        availability_setup_score: availabilityScore,
        total_score: totalScore,
        ranking_status: rankingStatus,
        ai_summary: scores.summary,
        ai_assessment_details: scores.assessment_details,
        extracted_skills: scores.extracted_skills || [],
        extracted_tools: scores.extracted_tools || [],
        years_of_experience: yearsExp,
      })
      .eq('id', applicant_id);

    if (updateError) {
      console.error('Error updating applicant:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to save scores' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Successfully re-scored applicant ${applicant_id} with total score: ${totalScore}`);

    return new Response(JSON.stringify({ 
      success: true,
      extraction_method: extractionMethod,
      scores: {
        total_score: totalScore,
        ranking_status: rankingStatus,
        role_experience_score: scores.role_experience_score,
        skills_tools_score: scores.skills_tools_score,
        availability_setup_score: scores.availability_setup_score,
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
