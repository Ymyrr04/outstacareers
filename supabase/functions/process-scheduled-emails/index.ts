import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!gmailUser || !gmailPassword) {
      throw new Error("Gmail credentials not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all pending scheduled emails that are due
    const { data: dueEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (fetchError) {
      throw new Error("Failed to fetch scheduled emails: " + fetchError.message);
    }

    console.log(`Found ${dueEmails?.length || 0} emails to process`);

    if (!dueEmails || dueEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPassword,
        },
      },
    });

    let processed = 0;
    let failed = 0;

    for (const email of dueEmails) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${email.subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Outsta Recruitment</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${email.body_html}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                This email was sent by Outsta Recruitment.<br>
                If you have any questions, please reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `;

        await client.send({
          from: gmailUser,
          to: email.recipient_email,
          subject: email.subject,
          content: "auto",
          html: emailHtml,
        });

        // Update scheduled email status
        await supabase
          .from('scheduled_emails')
          .update({ status: 'sent' })
          .eq('id', email.id);

        // Log the sent email
        await supabase
          .from('email_logs')
          .insert({
            applicant_id: email.applicant_id,
            template_id: email.template_id,
            subject: email.subject,
            body_html: email.body_html,
            recipient_email: email.recipient_email,
            status: 'sent',
            sent_at: new Date().toISOString(),
            is_automated: true,
          });

        processed++;
        console.log(`Sent scheduled email to: ${email.recipient_email}`);
      } catch (emailError: any) {
        console.error(`Failed to send email to ${email.recipient_email}:`, emailError);
        
        // Update scheduled email status to failed
        await supabase
          .from('scheduled_emails')
          .update({ status: 'failed' })
          .eq('id', email.id);

        // Log the failed email
        await supabase
          .from('email_logs')
          .insert({
            applicant_id: email.applicant_id,
            template_id: email.template_id,
            subject: email.subject,
            body_html: email.body_html,
            recipient_email: email.recipient_email,
            status: 'failed',
            is_automated: true,
            error_message: emailError.message,
          });

        failed++;
      }
    }

    await client.close();

    console.log(`Processed ${processed} emails, ${failed} failed`);

    return new Response(
      JSON.stringify({ success: true, processed, failed }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error processing scheduled emails:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
