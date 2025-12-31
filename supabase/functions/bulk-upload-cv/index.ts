import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessCVRequest {
  file_base64: string;
  file_name: string;
  file_type: string;
  job_id: string;
  job_title: string;
  job_description?: string;
  job_qualifications?: string[];
  job_responsibilities?: string[];
  status: string;
  run_scoring: boolean;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
}

// Simple text extraction from PDF (basic approach)
async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    // Decode base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert to string and extract text between stream markers
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    
    // Extract text content - look for text between parentheses in PDF
    const textMatches: string[] = [];
    
    // Pattern 1: Text in parentheses (common in PDFs)
    const parenRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = parenRegex.exec(content)) !== null) {
      const text = match[1].replace(/\\[nrt]/g, ' ').trim();
      if (text.length > 1 && /[a-zA-Z]/.test(text)) {
        textMatches.push(text);
      }
    }
    
    // Pattern 2: Look for readable ASCII sequences
    const asciiRegex = /[\x20-\x7E]{10,}/g;
    while ((match = asciiRegex.exec(content)) !== null) {
      const text = match[0].trim();
      if (/[a-zA-Z]{3,}/.test(text) && !text.includes('stream') && !text.includes('endstream')) {
        textMatches.push(text);
      }
    }
    
    const extractedText = textMatches.join(' ').replace(/\s+/g, ' ').trim();
    return extractedText || 'Unable to extract text from PDF';
  } catch (error) {
    console.error('PDF extraction error:', error);
    return 'Unable to extract text from PDF';
  }
}

// Extract text from DOC/DOCX (basic approach)
async function extractTextFromDoc(base64Data: string): Promise<string> {
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    
    // For DOCX, look for text in XML content
    const textMatches: string[] = [];
    
    // Extract text from XML tags
    const xmlTextRegex = />([^<]+)</g;
    let match;
    while ((match = xmlTextRegex.exec(content)) !== null) {
      const text = match[1].trim();
      if (text.length > 2 && /[a-zA-Z]/.test(text)) {
        textMatches.push(text);
      }
    }
    
    // Also get readable ASCII
    const asciiRegex = /[\x20-\x7E]{15,}/g;
    while ((match = asciiRegex.exec(content)) !== null) {
      const text = match[0].trim();
      if (/[a-zA-Z]{4,}/.test(text)) {
        textMatches.push(text);
      }
    }
    
    return textMatches.join(' ').replace(/\s+/g, ' ').trim() || 'Unable to extract text from document';
  } catch (error) {
    console.error('DOC extraction error:', error);
    return 'Unable to extract text from document';
  }
}

// Extract contact info from text
function extractContactInfo(text: string): { email?: string; phone?: string; fullName?: string } {
  const result: { email?: string; phone?: string; fullName?: string } = {};
  
  // Extract email
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  if (emails && emails.length > 0) {
    result.email = emails[0].toLowerCase();
  }
  
  // Extract phone (various formats)
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}|\+?[0-9]{10,15}/g;
  const phones = text.match(phoneRegex);
  if (phones && phones.length > 0) {
    result.phone = phones[0].replace(/[^0-9+]/g, '');
  }
  
  // Try to extract name (usually at the beginning, look for capitalized words)
  const lines = text.split(/[\n\r]+/).filter(line => line.trim().length > 0);
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.trim();
    // Look for 2-4 capitalized words that could be a name
    const nameMatch = cleaned.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/);
    if (nameMatch) {
      result.fullName = nameMatch[1];
      break;
    }
    // Alternative: Just look for capitalized words at start
    const capWords = cleaned.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (capWords && capWords[1].split(' ').length <= 4) {
      result.fullName = capWords[1];
      break;
    }
  }
  
  return result;
}

// Generate a simple hash for the file
function generateFileHash(base64Data: string): string {
  let hash = 0;
  for (let i = 0; i < base64Data.length; i++) {
    const char = base64Data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ProcessCVRequest = await req.json();
    const { 
      file_base64, 
      file_name, 
      file_type, 
      job_id, 
      job_title, 
      job_description,
      job_qualifications,
      job_responsibilities,
      status, 
      run_scoring 
    } = body;

    console.log('Processing CV:', { file_name, job_title, status, run_scoring });

    // Step 1: Extract text from CV
    let cvText = '';
    if (file_type.includes('pdf')) {
      cvText = await extractTextFromPDF(file_base64);
    } else {
      cvText = await extractTextFromDoc(file_base64);
    }

    console.log('Extracted text length:', cvText.length);

    // Step 2: Extract contact info
    const contactInfo = extractContactInfo(cvText);
    console.log('Extracted contact info:', contactInfo);

    // Generate file hash
    const fileHash = generateFileHash(file_base64);

    // Step 3: Check for duplicates
    const duplicateCheck: DuplicateCheckResult = { isDuplicate: false };

    // Check by email
    if (contactInfo.email) {
      const { data: emailMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, email')
        .eq('email', contactInfo.email)
        .maybeSingle();
      
      if (emailMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate email: ${contactInfo.email}`;
      }
    }

    // Check by phone
    if (!duplicateCheck.isDuplicate && contactInfo.phone) {
      const { data: phoneMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, phone')
        .eq('phone', contactInfo.phone)
        .maybeSingle();
      
      if (phoneMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate phone: ${contactInfo.phone}`;
      }
    }

    // Check by file hash
    if (!duplicateCheck.isDuplicate) {
      const { data: hashMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, file_hash')
        .eq('file_hash', fileHash)
        .maybeSingle();
      
      if (hashMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = 'Duplicate file (same content)';
      }
    }

    // Check by name + filename combination
    if (!duplicateCheck.isDuplicate && contactInfo.fullName) {
      const { data: nameMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name, cv_file_url')
        .ilike('full_name', contactInfo.fullName)
        .maybeSingle();
      
      if (nameMatch && nameMatch.cv_file_url?.includes(file_name.split('.')[0])) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate name + file: ${contactInfo.fullName}`;
      }
    }

    // If duplicate, return early
    if (duplicateCheck.isDuplicate) {
      console.log('Duplicate detected:', duplicateCheck.reason);
      return new Response(
        JSON.stringify({ 
          success: false, 
          skipped: true, 
          reason: duplicateCheck.reason,
          extracted_info: contactInfo
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 4: Upload CV to storage
    const fileExt = file_name.split('.').pop();
    const storageName = `bulk/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    // Convert base64 to Uint8Array for upload
    const binaryString = atob(file_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { error: uploadError } = await supabase.storage
      .from('cv-uploads')
      .upload(storageName, bytes, { 
        contentType: file_type,
        upsert: false 
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to upload file: ' + uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Run AI scoring if status is "Reviewed"
    let scoreResult = null;
    if (run_scoring && cvText && cvText.length > 50) {
      console.log('Running AI scoring...');
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (LOVABLE_API_KEY) {
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
    "matched_tools": [{"tool": "<tool/skill name>", "found": true, "context": "<brief context>"}],
    "missing_tools": ["<required tool/skill not found>"],
    "experience_highlights": [{"role": "<job title>", "company": "<company>", "duration": "<time>", "relevance": "<why relevant>"}],
    "strengths": ["<strength 1>", "<strength 2>"],
    "concerns": ["<concern if any>"]
  }
}`;

        const userPrompt = `Evaluate this candidate's CV for the following job:

JOB TITLE: ${job_title}

JOB DESCRIPTION: ${job_description || 'Not provided'}

KEY QUALIFICATIONS REQUIRED:
${job_qualifications?.length ? job_qualifications.map((q, i) => `${i + 1}. ${q}`).join('\n') : 'Not specified'}

RESPONSIBILITIES:
${job_responsibilities?.length ? job_responsibilities.map((r, i) => `${i + 1}. ${r}`).join('\n') : 'Not specified'}

CANDIDATE CV TEXT:
${cvText.substring(0, 8000)}

Return ONLY the JSON scoring object with detailed assessment_details, no other text.`;

        try {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              temperature: 0.3,
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content;
            
            if (content) {
              let jsonContent = content.trim();
              if (jsonContent.startsWith('```json')) {
                jsonContent = jsonContent.slice(7);
              } else if (jsonContent.startsWith('```')) {
                jsonContent = jsonContent.slice(3);
              }
              if (jsonContent.endsWith('```')) {
                jsonContent = jsonContent.slice(0, -3);
              }
              
              try {
                scoreResult = JSON.parse(jsonContent.trim());
                console.log('AI scoring complete:', scoreResult.total_score);
              } catch (parseError) {
                console.error('Failed to parse AI response:', parseError);
              }
            }
          } else {
            console.error('AI API error:', aiResponse.status);
          }
        } catch (aiError) {
          console.error('AI scoring error:', aiError);
        }
      }
    }

    // Step 6: Create applicant record
    const applicantData: Record<string, unknown> = {
      full_name: contactInfo.fullName || `Unknown (${file_name})`,
      email: contactInfo.email || `bulk-${Date.now()}@unknown.com`,
      phone: contactInfo.phone || null,
      job_id: job_id,
      job_title: job_title,
      apply_url: `/jobs/${job_id}`,
      status: status,
      cv_file_url: storageName,
      cv_text: cvText.substring(0, 50000), // Limit text length
      file_hash: fileHash,
      location: 'Unknown',
      home_office: false,
      noise_canceling_headset: false,
      laptop_or_pc: false,
      good_internet: false,
      internet_speed: 'Unknown',
      power_backup: false,
      can_work_40_50: false,
      us_timezone_ok: false,
      start_availability: 'Unknown',
      has_experience: true,
      currently_working: false,
    };

    // Add scoring data if available
    if (scoreResult) {
      applicantData.role_experience_score = scoreResult.role_experience_score || 0;
      applicantData.skills_tools_score = scoreResult.skills_tools_score || 0;
      applicantData.availability_setup_score = scoreResult.availability_setup_score || 0;
      applicantData.bonus_red_flag_score = scoreResult.bonus_red_flag_score || 0;
      applicantData.total_score = scoreResult.total_score || 0;
      applicantData.ranking_status = scoreResult.ranking_status || 'Low Match';
      applicantData.ai_summary = scoreResult.summary || null;
      applicantData.ai_assessment_details = scoreResult.assessment_details || null;
    }

    const { data: insertedApplicant, error: insertError } = await supabase
      .from('applicants_prescreen')
      .insert(applicantData)
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save applicant: ' + insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Applicant saved:', insertedApplicant.id);

    return new Response(
      JSON.stringify({
        success: true,
        skipped: false,
        applicant_id: insertedApplicant.id,
        extracted_info: contactInfo,
        scored: !!scoreResult,
        total_score: scoreResult?.total_score || null,
        ranking_status: scoreResult?.ranking_status || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in bulk-upload-cv function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
