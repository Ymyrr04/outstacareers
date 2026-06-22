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
  status: string;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  reason?: string;
}

// Sanitize text to remove null bytes and other problematic Unicode characters
function sanitizeText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .trim();
}

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

// Extract text and contact info from PDF using AI Vision
async function extractWithVision(
  base64Data: string,
  mimeType: string,
  LOVABLE_API_KEY: string
): Promise<{ 
  success: boolean; 
  text?: string; 
  contactInfo?: { fullName?: string; email?: string; phone?: string };
  error?: string 
}> {
  try {
    console.log('Attempting AI Vision extraction with structured contact info...');

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
                text: `You are a CV/Resume parser. Analyze this document and extract:

1. CONTACT INFORMATION (return as JSON at the START of your response):
\`\`\`json
{
  "fullName": "First Name Last Name",
  "email": "email@example.com", 
  "phone": "+1234567890"
}
\`\`\`

IMPORTANT for name extraction:
- If name is formatted as "Last Name, First Name" (e.g., "Akol, Mary Grace Dalangpan"), convert it to "First Name Last Name" format (e.g., "Mary Grace Dalangpan Akol")
- The name is usually prominently displayed at the top of the CV
- Look for the largest/boldest text near the top - that's typically the name
- Include middle names if present

2. Then extract ALL other text content from the document including:
- Professional summary
- Work experience
- Education  
- Skills

If you cannot find a field, use null for that field.
If this is not a CV/resume, respond with: "EXTRACTION_FAILED: [reason]"`
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
    const extractedContent = visionData.choices?.[0]?.message?.content;

    if (!extractedContent || extractedContent.startsWith('EXTRACTION_FAILED:')) {
      console.error('Vision extraction failed:', extractedContent);
      return { success: false, error: extractedContent || 'No content extracted' };
    }

    // Parse the JSON contact info from the response
    let contactInfo: { fullName?: string; email?: string; phone?: string } = {};
    
    const jsonMatch = extractedContent.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        contactInfo = {
          fullName: parsed.fullName || undefined,
          email: parsed.email || undefined,
          phone: parsed.phone || undefined,
        };
        console.log('Parsed contact info from Vision:', contactInfo);
      } catch (e) {
        console.error('Failed to parse contact JSON:', e);
      }
    }

    // Also try to extract email/phone with regex as fallback
    if (!contactInfo.email) {
      const emailMatch = extractedContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) contactInfo.email = emailMatch[0].toLowerCase();
    }
    
    if (!contactInfo.phone) {
      const phoneMatch = extractedContent.match(/\+?[0-9]{10,15}/);
      if (phoneMatch) contactInfo.phone = phoneMatch[0];
    }

    console.log(`Vision extraction successful. Text length: ${extractedContent.length}, Contact: ${JSON.stringify(contactInfo)}`);
    return { success: true, text: extractedContent, contactInfo };

  } catch (error) {
    console.error('Vision extraction error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Simple text extraction from PDF bytes (basic approach)
function extractTextFromPDFBytes(bytes: Uint8Array): string {
  try {
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const textMatches: string[] = [];

    const parenRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = parenRegex.exec(content)) !== null) {
      const text = match[1].replace(/\\[nrt]/g, ' ').trim();
      if (text.length > 1 && /[a-zA-Z]/.test(text)) {
        textMatches.push(text);
      }
    }

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

// Extract text from DOC/DOCX bytes (basic approach)
function extractTextFromDocBytes(bytes: Uint8Array): string {
  try {
    const content = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const textMatches: string[] = [];

    const xmlTextRegex = />([^<]+)</g;
    let match;
    while ((match = xmlTextRegex.exec(content)) !== null) {
      const text = match[1].trim();
      if (text.length > 2 && /[a-zA-Z]/.test(text)) {
        textMatches.push(text);
      }
    }

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

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Extract contact info from text
function extractContactInfo(text: string): { email?: string; phone?: string; fullName?: string } {
  const result: { email?: string; phone?: string; fullName?: string } = {};
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  if (emails && emails.length > 0) {
    result.email = emails[0].toLowerCase();
  }
  
  const phoneRegex = /(?:\+?1[-.\s]?)?(?:\(?[0-9]{3}\)?[-.\s]?)?[0-9]{3}[-.\s]?[0-9]{4}|\+?[0-9]{10,15}/g;
  const phones = text.match(phoneRegex);
  if (phones && phones.length > 0) {
    result.phone = phones[0].replace(/[^0-9+]/g, '');
  }
  
  const lines = text.split(/[\n\r]+/).filter(line => line.trim().length > 0);
  for (const line of lines.slice(0, 5)) {
    const cleaned = line.trim();
    const nameMatch = cleaned.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/);
    if (nameMatch) {
      result.fullName = nameMatch[1];
      break;
    }
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
    hash = hash & hash;
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
      status, 
    } = body;

    console.log('Processing CV:', { file_name, job_title, status });

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Decode bytes ONCE (reused for text extraction and storage upload)
    // Guard against oversized files that would OOM the edge function runtime.
    const approxBytes = Math.floor((file_base64?.length || 0) * 0.75);
    const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
    if (approxBytes > MAX_FILE_BYTES) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `File too large (${(approxBytes / (1024 * 1024)).toFixed(1)}MB). Maximum is ${MAX_FILE_BYTES / (1024 * 1024)}MB. Please compress the PDF and try again.`,
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fileBytes = base64ToBytes(file_base64);

    // Step 1: Extract text from CV
    let cvText = '';
    let extractionMethod = 'standard';

    if (file_type.includes('pdf')) {
      cvText = extractTextFromPDFBytes(fileBytes);
    } else {
      cvText = extractTextFromDocBytes(fileBytes);
    }


    cvText = sanitizeText(cvText);
    console.log('Extracted text length:', cvText.length);

    // Check if text extraction failed and try Vision API
    let visionContactInfo: { fullName?: string; email?: string; phone?: string } | undefined;
    
    if (isCorruptedText(cvText) && LOVABLE_API_KEY) {
      console.log('Text extraction appears corrupted, trying AI Vision...');
      
      // Determine MIME type for vision
      let mimeType = file_type;
      if (!mimeType || mimeType === 'application/octet-stream') {
        const fileName = file_name.toLowerCase();
        if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (fileName.endsWith('.png')) mimeType = 'image/png';
        else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else mimeType = 'application/pdf'; // default to PDF
      }
      
      const visionResult = await extractWithVision(file_base64, mimeType, LOVABLE_API_KEY);
      
      if (visionResult.success && visionResult.text) {
        cvText = sanitizeText(visionResult.text);
        extractionMethod = 'vision';
        visionContactInfo = visionResult.contactInfo;
        console.log('Vision extraction successful, text length:', cvText.length, 'Contact:', visionContactInfo);
      } else {
        console.log('Vision extraction failed:', visionResult.error);
      }
    }

    // Step 2: Extract contact info - prefer Vision results if available
    const regexContactInfo = extractContactInfo(cvText);
    const contactInfo = {
      fullName: visionContactInfo?.fullName || regexContactInfo.fullName,
      email: visionContactInfo?.email || regexContactInfo.email,
      phone: visionContactInfo?.phone || regexContactInfo.phone,
    };
    console.log('Final contact info:', contactInfo, 'Method:', extractionMethod, 'Vision contact:', visionContactInfo);

    // Generate file hash
    const fileHash = generateFileHash(file_base64);

    // Step 3: Check for duplicates (only for the SAME job/role)
    const duplicateCheck: DuplicateCheckResult = { isDuplicate: false };

    // Only check duplicates within the same job - different roles are allowed
    if (contactInfo.email) {
      const { data: emailMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, email, job_id')
        .eq('email', contactInfo.email)
        .eq('job_id', job_id)
        .maybeSingle();
      
      if (emailMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate email for this role: ${contactInfo.email}`;
      }
    }

    if (!duplicateCheck.isDuplicate && contactInfo.phone) {
      const { data: phoneMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, phone, job_id')
        .eq('phone', contactInfo.phone)
        .eq('job_id', job_id)
        .maybeSingle();
      
      if (phoneMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate phone for this role: ${contactInfo.phone}`;
      }
    }

    // File hash check is also scoped to the same job
    if (!duplicateCheck.isDuplicate) {
      const { data: hashMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, file_hash, job_id')
        .eq('file_hash', fileHash)
        .eq('job_id', job_id)
        .maybeSingle();
      
      if (hashMatch) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = 'Duplicate file for this role (same content)';
      }
    }

    // Name + file check is also scoped to the same job
    if (!duplicateCheck.isDuplicate && contactInfo.fullName) {
      const { data: nameMatch } = await supabase
        .from('applicants_prescreen')
        .select('id, full_name, cv_file_url, job_id')
        .ilike('full_name', contactInfo.fullName)
        .eq('job_id', job_id)
        .maybeSingle();
      
      if (nameMatch && nameMatch.cv_file_url?.includes(file_name.split('.')[0])) {
        duplicateCheck.isDuplicate = true;
        duplicateCheck.reason = `Duplicate name + file for this role: ${contactInfo.fullName}`;
      }
    }

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

    // Step 5: Skip AI scoring for bulk uploads (recruitment manager already reviewed)
    // The contact info was already extracted in Step 2 (using Vision if needed)
    console.log('Bulk upload - skipping AI scoring (already reviewed by manager)');

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
      cv_text: cvText.substring(0, 50000),
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

    // No scoring data for bulk uploads - manager already reviewed

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

    console.log('Applicant saved:', insertedApplicant.id, 'Extraction method:', extractionMethod);

    return new Response(
      JSON.stringify({
        success: true,
        skipped: false,
        applicant_id: insertedApplicant.id,
        extracted_info: contactInfo,
        extraction_method: extractionMethod,
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
