import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_APP_URL = 'https://outstahub.com';

function redirectToApp(status: string, response?: string | null): Response {
  const target = new URL(`${PUBLIC_APP_URL}/availability-response`);
  target.searchParams.set('status', status);
  if (response === 'yes' || response === 'no') {
    target.searchParams.set('response', response);
  }
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, 'Location': target.toString() },
  });
}

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
      return redirectToApp('invalid');
    }

    if (response !== 'yes' && response !== 'no') {
      return redirectToApp('invalid');
    }

    // Find the availability response record - simple query without join
    const { data: responseRecord, error: findError } = await supabase
      .from('availability_responses')
      .select('*')
      .eq('response_token', token)
      .single();

    if (findError || !responseRecord) {
      console.error('Token not found:', findError);
      return redirectToApp('invalid');
    }

    // Check if already responded (responded_at is set and response is not 'pending')
    if (responseRecord.responded_at && responseRecord.response !== 'pending') {
      return redirectToApp('already', responseRecord.response);
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
      return redirectToApp('error');
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

    return redirectToApp('success', response);

  } catch (error) {
    console.error('Error in handle-availability-response:', error);
    return redirectToApp('error');
  }
});
