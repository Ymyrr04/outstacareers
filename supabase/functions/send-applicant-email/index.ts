import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

// Generate a unique Message-ID for email threading
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

interface Attachment {
  filename: string;
  content: string; // base64 encoded
  contentType: string;
}

interface SendEmailRequest {
  applicantId: string;
  templateId?: string;
  subject: string;
  bodyHtml: string;
  recipientEmail: string;
  applicantStatusAtSend?: string;
  isAutomated: boolean;
  scheduleFor?: string; // ISO date string for scheduled emails
  attachments?: Attachment[];
  cc?: string[]; // CC email addresses
  bcc?: string[]; // BCC email addresses
  inReplyTo?: string; // Message-ID of the email being replied to (for threading)
}

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

    const {
      applicantId,
      templateId,
      subject,
      bodyHtml,
      recipientEmail,
      applicantStatusAtSend,
      isAutomated,
      scheduleFor,
      attachments,
      cc,
      bcc,
      inReplyTo,
    }: SendEmailRequest = await req.json();

    console.log("Processing email request for:", recipientEmail);

    // If scheduled for later, create a scheduled email entry
    if (scheduleFor) {
      const scheduledDate = new Date(scheduleFor);
      if (scheduledDate > new Date()) {
        const { data: scheduled, error: scheduleError } = await supabase
          .from('scheduled_emails')
          .insert({
            applicant_id: applicantId,
            template_id: templateId || null,
            subject,
            body_html: bodyHtml,
            recipient_email: recipientEmail,
            scheduled_for: scheduleFor,
            status: 'pending',
          })
          .select()
          .single();

        if (scheduleError) {
          console.error("Error scheduling email:", scheduleError);
          throw new Error("Failed to schedule email: " + scheduleError.message);
        }

        console.log("Email scheduled for:", scheduleFor);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Email scheduled successfully",
            scheduled: true,
            scheduledId: scheduled.id,
            scheduledFor: scheduleFor
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    // Send email immediately
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

    // Generate a unique Message-ID for thread tracking
    const domain = gmailUser.split('@')[1] || 'outsta.io';
    const messageId = generateMessageId(domain);
    console.log("Generated Message-ID:", messageId);

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head><body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;"><table role="presentation" style="width: 100%; border-collapse: collapse;"><tr><td align="center" style="padding: 40px 0;"><table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><tr><td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 12px 12px 0 0; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 2px;">OutSta</h1><p style="color: #a0aec0; margin: 6px 0 0 0; font-size: 13px; font-weight: 400; letter-spacing: 1px;">Recruitment Team</p></td></tr><tr><td style="padding: 40px;">${bodyHtml}</td></tr><tr><td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 12px 12px; text-align: center;"><p style="color: #999999; font-size: 12px; margin: 0;">This email was sent by OutSta Recruitment.<br>If you have any questions, please reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

    // Prepare email options with Message-ID header
    const emailOptions: any = {
      from: `OutSta Recruitment <${gmailUser}>`,
      to: recipientEmail,
      subject: subject,
      content: "auto",
      html: emailHtml,
      headers: {
        "Message-ID": messageId,
      },
    };

    // Add In-Reply-To and References headers for threading if replying to an email
    if (inReplyTo) {
      emailOptions.headers["In-Reply-To"] = inReplyTo;
      emailOptions.headers["References"] = inReplyTo;
      console.log("Adding threading headers - In-Reply-To:", inReplyTo);
    }

    // Add CC if provided
    if (cc && cc.length > 0) {
      emailOptions.cc = cc;
      console.log("Adding CC recipients:", cc);
    }

    // Add BCC if provided
    if (bcc && bcc.length > 0) {
      emailOptions.bcc = bcc;
      console.log("Adding BCC recipients:", bcc);
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content, // Pass base64 string directly
        contentType: att.contentType,
        encoding: "base64", // Tell denomailer the content is base64 encoded
      }));
    }

    await client.send(emailOptions);

    await client.close();

    console.log("Email sent successfully to:", recipientEmail, "with Message-ID:", messageId);

    // Log the sent email with Message-ID for thread tracking
    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        applicant_id: applicantId,
        template_id: templateId || null,
        subject,
        body_html: bodyHtml,
        recipient_email: recipientEmail,
        status: 'sent',
        sent_at: new Date().toISOString(),
        applicant_status_at_send: applicantStatusAtSend || null,
        is_automated: isAutomated,
        message_id: messageId,
      });

    if (logError) {
      console.error("Error logging email:", logError);
      // Don't throw - email was sent successfully
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending email:", error);

    // Try to log the failed email
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const reqBody = await req.clone().json();
        await supabase
          .from('email_logs')
          .insert({
            applicant_id: reqBody.applicantId,
            template_id: reqBody.templateId || null,
            subject: reqBody.subject,
            body_html: reqBody.bodyHtml,
            recipient_email: reqBody.recipientEmail,
            status: 'failed',
            applicant_status_at_send: reqBody.applicantStatusAtSend || null,
            is_automated: reqBody.isAutomated,
            error_message: error.message,
          });
      }
    } catch (logErr) {
      console.error("Error logging failed email:", logErr);
    }

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
