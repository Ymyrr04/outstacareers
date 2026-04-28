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
  
  // Check for excessive special characters that indicate encoding issues
  const weirdChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFFFD]/g) || [];
  if (weirdChars.length > text.length * 0.1) return true;
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { applicant_id, cv_text, cv_file_url } = await req.json();

    if (!applicant_id) {
      return new Response(
        JSON.stringify({ error: 'applicant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the provided cv_text is corrupted
    const textIsCorrupted = isCorruptedText(cv_text || '');
    
    console.log(`CV text analysis for ${applicant_id}:`, {
      textLength: cv_text?.length || 0,
      isCorrupted: textIsCorrupted,
      hasFileUrl: !!cv_file_url
    });

    if (!textIsCorrupted && cv_text) {
      // Text extraction worked fine, return the text
      return new Response(
        JSON.stringify({ 
          success: true, 
          cv_text: cv_text,
          extraction_method: 'standard'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Text is corrupted or missing - try vision extraction
    if (!cv_file_url) {
      return new Response(
        JSON.stringify({ 
          error: 'CV text is corrupted and no file URL available for vision extraction',
          isCorrupted: true
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Text extraction failed, attempting vision extraction for: ${cv_file_url}`);

    // Download the PDF file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('cv-uploads')
      .download(cv_file_url);

    if (downloadError || !fileData) {
      console.error('Error downloading CV file:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Could not download CV file for vision extraction' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert PDF to base64 for vision API
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    // Determine MIME type
    const fileName = cv_file_url.toLowerCase();
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
      
      if (visionResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Vision extraction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const visionData = await visionResponse.json();
    const extractedText = visionData.choices?.[0]?.message?.content;

    if (!extractedText || extractedText.startsWith('EXTRACTION_FAILED:')) {
      console.error('Vision extraction failed:', extractedText);
      return new Response(
        JSON.stringify({ 
          error: 'Could not extract text from document using vision',
          details: extractedText
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Vision extraction successful. Extracted ${extractedText.length} characters.`);

    // Update the applicant record with the extracted text
    const { error: updateError } = await supabase
      .from('applicants_prescreen')
      .update({ cv_text: extractedText })
      .eq('id', applicant_id);

    if (updateError) {
      console.error('Error updating applicant cv_text:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        cv_text: extractedText,
        extraction_method: 'vision',
        original_was_corrupted: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-cv-with-vision:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
