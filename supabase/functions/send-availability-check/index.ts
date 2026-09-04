import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendAvailabilityCheckRequest {
  applicantId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GMAIL_USER = Deno.env.get('GMAIL_USER');
    const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('Gmail credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { applicantId }: SendAvailabilityCheckRequest = await req.json();

    console.log('Sending availability check for applicant:', applicantId);

    // Get applicant details
    const { data: applicant, error: fetchError } = await supabase
      .from('applicants_prescreen')
      .select('id, full_name, email, job_title')
      .eq('id', applicantId)
      .single();

    if (fetchError || !applicant) {
      throw new Error('Applicant not found');
    }

    // Get the check_availability template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('status_trigger', 'check_availability')
      .single();

    if (templateError || !template) {
      throw new Error('Check availability template not found');
    }

    // Generate a unique token for this availability check
    const token = crypto.randomUUID();

    // Create the availability response record with 'pending' as placeholder
    // We set response to 'yes' initially (will be updated when they respond)
    // This is a workaround since the check constraint doesn't allow 'pending'
    const { error: insertError } = await supabase
      .from('availability_responses')
      .insert({
        applicant_id: applicantId,
        response: 'yes', // Placeholder, will be updated on actual response
        response_token: token
      });

    if (insertError) {
      console.error('Failed to create availability record:', insertError);
      throw new Error('Failed to create availability tracking record');
    }

    // Generate magic links
    const baseUrl = `${supabaseUrl}/functions/v1/handle-availability-response`;
    const yesLink = `${baseUrl}?token=${token}&response=yes`;
    const noLink = `${baseUrl}?token=${token}&response=no`;

    // Process template - replace placeholders
    let subject = template.subject.replace(/\{\{full_name\}\}/g, applicant.full_name);
    let body = template.body_html
      .replace(/\{\{full_name\}\}/g, applicant.full_name)
      .replace(/\{\{job_title\}\}/g, applicant.job_title)
      .replace(/\{\{availability_yes_link\}\}/g, yesLink)
      .replace(/\{\{availability_no_link\}\}/g, noLink);

    // Send email via Gmail SMTP
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_USER,
          password: GMAIL_APP_PASSWORD,
        },
      },
    });

    // Convert the body to proper HTML with styling
    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${body.replace(/\n/g, '<br>')}
</body>
</html>`;

    await client.send({
      from: GMAIL_USER,
      to: applicant.email,
      subject: subject,
      content: "auto",
      html: htmlBody,
    });

    await client.close();

    // Log the email
    await supabase
      .from('email_logs')
      .insert({
        applicant_id: applicantId,
        template_id: template.id,
        subject: subject,
        body_html: body,
        recipient_email: applicant.email,
        status: 'sent',
        sent_at: new Date().toISOString(),
        is_automated: false,
        applicant_status_at_send: 'Bench'
      });

    // Stamp the applicant as "checked in, awaiting response" so the kanban badge shows
    await supabase
      .from('applicants_prescreen')
      .update({
        is_available: null,
        availability_checked_at: new Date().toISOString(),
      })
      .eq('id', applicantId);

    console.log('Availability check email sent successfully to:', applicant.email);

    return new Response(
      JSON.stringify({ success: true, message: 'Availability check sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending availability check:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});