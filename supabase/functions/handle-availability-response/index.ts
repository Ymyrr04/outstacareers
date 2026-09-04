// native Deno.serve
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const response = url.searchParams.get('response');

    console.log('Availability response received:', { token, response });

    if (!token || !response) {
      return new Response(
        generateHtmlPage('Missing Parameters', 'Invalid link. Please contact support.', 'error'),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    if (response !== 'yes' && response !== 'no') {
      return new Response(
        generateHtmlPage('Invalid Response', 'Invalid response value.', 'error'),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Find the availability response record - simple query without join
    const { data: responseRecord, error: findError } = await supabase
      .from('availability_responses')
      .select('*')
      .eq('response_token', token)
      .single();

    if (findError || !responseRecord) {
      console.error('Token not found:', findError);
      return new Response(
        generateHtmlPage(
          'Link Invalid or Expired', 
          'This link has already been used or expired. Please contact the recruitment team if you need assistance.',
          'error'
        ),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Check if already responded (responded_at is set and response is not 'pending')
    if (responseRecord.responded_at && responseRecord.response !== 'pending') {
      return new Response(
        generateHtmlPage(
          'Thank You for Your Response!', 
          'You have already submitted your response. If you need to update your availability, please contact the recruitment team.',
          'info'
        ),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Update the response record
    const { error: updateResponseError } = await supabase
      .from('availability_responses')
      .update({
        response: response,
        responded_at: new Date().toISOString()
      })
      .eq('id', responseRecord.id);

    if (updateResponseError) {
      console.error('Failed to update response:', updateResponseError);
      return new Response(
        generateHtmlPage('Error', 'Failed to record your response. Please try again.', 'error'),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Update the applicant record with availability status
    const { error: updateApplicantError } = await supabase
      .from('applicants_prescreen')
      .update({
        is_available: response === 'yes',
        availability_checked_at: new Date().toISOString()
      })
      .eq('id', responseRecord.applicant_id);

    if (updateApplicantError) {
      console.error('Failed to update applicant:', updateApplicantError);
      // Don't fail the request, the response was already recorded
    }

    console.log('Availability updated successfully for applicant:', responseRecord.applicant_id);

    const title = 'Thank You for Your Response!';
    const message = response === 'yes' 
      ? 'We appreciate you confirming your availability. Our team will be in touch soon with exciting opportunities that match your profile!'
      : 'We understand you\'re not available at this time. Feel free to apply again in the future once you are available. We\'d love to hear from you!';

    return new Response(
      generateHtmlPage(title, message, 'success'),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );

  } catch (error) {
    console.error('Error in handle-availability-response:', error);
    return new Response(
      generateHtmlPage('Error', 'An unexpected error occurred. Please try again later.', 'error'),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
});

function generateHtmlPage(title: string, message: string, type: 'success' | 'error' | 'info'): string {
  const iconSvg = type === 'success' 
    ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:64px;height:64px;color:#10B981"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
    : type === 'error'
    ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:64px;height:64px;color:#EF4444"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:64px;height:64px;color:#3B82F6"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Outsta</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      padding: 48px;
      text-align: center;
      max-width: 480px;
      width: 100%;
    }
    .icon { margin-bottom: 24px; }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1F2937;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      color: #6B7280;
      line-height: 1.6;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #E5E7EB;
      font-size: 14px;
      color: #9CA3AF;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${iconSvg}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="footer">You can close this window now.</div>
  </div>
</body>
</html>`;
}