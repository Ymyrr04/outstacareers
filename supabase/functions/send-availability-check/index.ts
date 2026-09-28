import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

interface SendAvailabilityCheckRequest {
  applicantId: string;
  senderName?: string;
}

// Admin-specific Gmail credentials mapping
const ADMIN_GMAIL_CREDENTIALS: Record<string, { userEnv: string; passEnv: string }> = {
  'mark@outsta.io': { userEnv: 'MARK_GMAIL_USER', passEnv: 'MARK_GMAIL_APP_PASSWORD' },
  'kristine@outsta.io': { userEnv: 'KRISTINE_GMAIL_USER', passEnv: 'KRISTINE_GMAIL_APP_PASSWORD' },
  'czarina@outsta.io': { userEnv: 'CZARINA_GMAIL_USER', passEnv: 'CZARINA_GMAIL_APP_PASSWORD' },
  'eduardo@outsta.io': { userEnv: 'EDUARDO_GMAIL_USER', passEnv: 'EDUARDO_GMAIL_APP_PASSWORD' },
  'jil@outsta.io': { userEnv: 'JIL_GMAIL_USER', passEnv: 'JIL_GMAIL_APP_PASSWORD' },
};

function normalizeSmtpSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '');
  return normalized.length > 0 ? normalized : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const defaultGmailUser = Deno.env.get('GMAIL_USER');
    const defaultGmailPassword = normalizeSmtpSecret(Deno.env.get('GMAIL_APP_PASSWORD'));
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: roles, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['admin', 'super_admin']);
    if (roleError || !roles?.length) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let payload: SendAvailabilityCheckRequest;
    try { payload = await req.json(); } catch { payload = { applicantId: '' }; }
    const { applicantId, senderName } = payload;
    if (typeof applicantId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicantId)
      || (senderName !== undefined && (typeof senderName !== 'string' || !senderName.trim() || senderName.trim().length > 80 || /[\x00-\x1f\x7f]/.test(senderName)))) {
      return new Response(JSON.stringify({ error: 'Invalid availability check details' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const displayName = senderName?.trim() || 'OutSta Recruitment';

    // Use the clicking admin's own Gmail credentials when available
    let GMAIL_USER = defaultGmailUser;
    let GMAIL_APP_PASSWORD = defaultGmailPassword;
    const adminEmail = user.email?.toLowerCase();
    if (adminEmail) {
      const creds = ADMIN_GMAIL_CREDENTIALS[adminEmail];
      if (creds) {
        const specificUser = Deno.env.get(creds.userEnv);
        const specificPass = normalizeSmtpSecret(Deno.env.get(creds.passEnv));
        if (specificUser && specificPass) {
          GMAIL_USER = specificUser;
          GMAIL_APP_PASSWORD = specificPass;
          console.log(`Using ${adminEmail}'s Gmail credentials for availability check`);
        }
      }
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error('Gmail credentials not configured');

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
      from: `"${displayName.replace(/(["\\])/g, '\\$1')}" <${GMAIL_USER}>`,
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