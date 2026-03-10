import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

function generateMessageId(domain: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `<${timestamp}.${randomHex}@${domain}>`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendContractorEmailRequest {
  contractorAssignmentId: string;
  subject: string;
  bodyHtml: string;
  recipientEmail: string;
  recipientName: string;
  scheduleFor?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get("MARK_GMAIL_USER");
    const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!gmailUser || !gmailPassword) {
      throw new Error("Gmail credentials not configured");
    }
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      contractorAssignmentId,
      subject,
      bodyHtml,
      recipientEmail,
      recipientName,
      scheduleFor,
    }: SendContractorEmailRequest = await req.json();

    console.log("Processing contractor email for:", recipientEmail);

    // If scheduled for later, just log it as scheduled
    if (scheduleFor) {
      const scheduledDate = new Date(scheduleFor);
      if (scheduledDate > new Date()) {
        const { error: logError } = await supabase
          .from('contractor_email_logs')
          .insert({
            contractor_assignment_id: contractorAssignmentId,
            subject,
            body_html: bodyHtml,
            recipient_email: recipientEmail,
            status: 'scheduled',
            scheduled_for: scheduleFor,
          });

        if (logError) throw new Error("Failed to schedule email: " + logError.message);

        return new Response(
          JSON.stringify({ success: true, scheduled: true, scheduledFor: scheduleFor }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Send immediately
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });

    const domain = gmailUser.split('@')[1] || 'outsta.io';
    const messageId = generateMessageId(domain);

    const signatureHtml = `
<br/>
<p style="margin: 0; color: #333333; font-size: 14px;">--</p>
<p style="margin: 4px 0 0 0; color: #333333; font-size: 14px;">Warm Regards,<br/>Mark</p>
<br/>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 420px; background-color: #1a2332; border-radius: 8px; overflow: hidden;">
  <tr>
    <td style="padding: 20px; vertical-align: top; width: 260px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <img src="https://outstacareers.lovable.app/outsta-logo.png" alt="OutSta" style="height: 18px; margin-bottom: 4px;" />
            <p style="margin: 0 0 2px 0; color: #8899aa; font-size: 10px; font-family: Arial, sans-serif;">Talent Across Borders</p>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 8px;">
            <p style="margin: 0; color: #ffffff; font-size: 16px; font-weight: 700; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">MARK CHUA</p>
            <p style="margin: 2px 0 0 0; color: #e8a020; font-size: 11px; font-weight: 600; font-family: Arial, sans-serif;">Marketing & Business Development Manager</p>
          </td>
        </tr>
        <tr>
          <td style="padding-top: 12px;">
            <p style="margin: 0 0 4px 0; color: #cccccc; font-size: 11px; font-family: Arial, sans-serif;">📞 +639982326001</p>
            <p style="margin: 0 0 4px 0; color: #cccccc; font-size: 11px; font-family: Arial, sans-serif;">✉️ mark@outsta.io</p>
            <p style="margin: 0; color: #cccccc; font-size: 11px; font-family: Arial, sans-serif;">📍 3029 NE 188th St Suite 1108<br/>&nbsp;&nbsp;&nbsp;&nbsp;Aventura 33180 33180 Florida</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head><body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #ffffff; color: #333333; font-size: 14px; line-height: 1.6;">${bodyHtml}${signatureHtml}</body></html>`;

    await client.send({
      from: `Mark Chua <${gmailUser}>`,
      to: recipientEmail,
      subject,
      content: "auto",
      html: emailHtml,
      headers: { "Message-ID": messageId },
    });

    await client.close();

    // Log sent email
    await supabase
      .from('contractor_email_logs')
      .insert({
        contractor_assignment_id: contractorAssignmentId,
        subject,
        body_html: bodyHtml,
        recipient_email: recipientEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
        message_id: messageId,
      });

    console.log("Contractor email sent to:", recipientEmail);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending contractor email:", error);

    // Log failure
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const reqBody = await req.clone().json();
        await supabase.from('contractor_email_logs').insert({
          contractor_assignment_id: reqBody.contractorAssignmentId,
          subject: reqBody.subject,
          body_html: reqBody.bodyHtml,
          recipient_email: reqBody.recipientEmail,
          status: 'failed',
          error_message: error.message,
        });
      }
    } catch (logErr) {
      console.error("Error logging failed email:", logErr);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
