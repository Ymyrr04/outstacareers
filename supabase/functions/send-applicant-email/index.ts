import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { decode as decodeBase64Url } from "https://deno.land/std@0.190.0/encoding/base64url.ts";

// Admin email to display name mapping
const ADMIN_NAMES: Record<string, string> = {
  'czarina@outsta.io': 'Czarina',
  'kristine@outsta.io': 'Kristine',
  'eduardo@outsta.io': 'Eduardo',
  'mark@outsta.io': 'Mark',
  'liezl@outsta.io': 'Liezl',
  'jil@outsta.io': 'Jil',
  'yes@outsta.io': 'Yes',
};

function getAdminNameFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    const email = payload.email?.toLowerCase();
    return email ? (ADMIN_NAMES[email] || null) : null;
  } catch {
    return null;
  }
}

function getAdminEmailFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    return payload.email?.toLowerCase() || null;
  } catch {
    return null;
  }
}

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
  scheduleFor?: string;
  attachments?: Attachment[];
  cc?: string[];
  bcc?: string[];
  inReplyTo?: string;
  sendAsEmail?: string; // Override sender to a specific admin's credentials
}

function normalizeSmtpSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '');
  return normalized.length > 0 ? normalized : null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let requestBody: SendEmailRequest | null = null;

  try {
    const defaultGmailUser = Deno.env.get("GMAIL_USER");
    const defaultGmailPassword = normalizeSmtpSecret(Deno.env.get("GMAIL_APP_PASSWORD"));
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!defaultGmailUser || !defaultGmailPassword) {
      throw new Error("Gmail credentials not configured");
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase credentials not configured");
    }

    // Admin-specific Gmail credentials mapping
    const ADMIN_GMAIL_CREDENTIALS: Record<string, { userEnv: string; passEnv: string }> = {
      'mark@outsta.io': { userEnv: 'MARK_GMAIL_USER', passEnv: 'MARK_GMAIL_APP_PASSWORD' },
      'kristine@outsta.io': { userEnv: 'KRISTINE_GMAIL_USER', passEnv: 'KRISTINE_GMAIL_APP_PASSWORD' },
      'czarina@outsta.io': { userEnv: 'CZARINA_GMAIL_USER', passEnv: 'CZARINA_GMAIL_APP_PASSWORD' },
      'eduardo@outsta.io': { userEnv: 'EDUARDO_GMAIL_USER', passEnv: 'EDUARDO_GMAIL_APP_PASSWORD' },
      'jil@outsta.io': { userEnv: 'JIL_GMAIL_USER', passEnv: 'JIL_GMAIL_APP_PASSWORD' },
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    requestBody = await req.json();

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
      sendAsEmail,
    } = requestBody;

    // Extract admin name and email from JWT for personalized sign-off and sender selection
    const adminName = getAdminNameFromJwt(req.headers.get('authorization'));
    const adminEmail = getAdminEmailFromJwt(req.headers.get('authorization'));
    
    // Select sender credentials: use sendAsEmail override, then admin-specific if available, otherwise default
    let gmailUser = defaultGmailUser;
    let gmailPassword = defaultGmailPassword;
    let senderAdminName = adminName;
    
    // Determine which admin email to use for credentials
    const effectiveAdminEmail = (!isAutomated && sendAsEmail) ? sendAsEmail.toLowerCase() : adminEmail;
    
    if (effectiveAdminEmail && !isAutomated) {
      const creds = ADMIN_GMAIL_CREDENTIALS[effectiveAdminEmail];
      if (creds) {
        const specificUser = Deno.env.get(creds.userEnv);
        const specificPass = normalizeSmtpSecret(Deno.env.get(creds.passEnv));
        if (specificUser && specificPass) {
          gmailUser = specificUser;
          gmailPassword = specificPass;
          senderAdminName = ADMIN_NAMES[effectiveAdminEmail] || null;
          console.log(`Using ${effectiveAdminEmail}'s Gmail credentials for sending`);
        }
      }
    }
    
    // Auto-replace generic sign-offs with the admin's name if available
    let processedBodyHtml = bodyHtml;
    if (senderAdminName && !isAutomated) {
      const signOff = `Best regards,<br><br>${senderAdminName}<br>OutSta Recruitment Team`;
      processedBodyHtml = processedBodyHtml
        .replace(/Best regards,\s*<br\s*\/?>\s*The\s+(Outsta\s+)?Recruitment\s+Team/gi, signOff)
        .replace(/Best regards,\s*\n\s*The\s+(Outsta\s+)?Recruitment\s+Team/gi, signOff)
        .replace(/Best regards,<br>The OutSta Recruitment Team/gi, signOff)
        .replace(/Best regards,<br>OutSta Recruitment Team/gi, signOff);
    }

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
            body_html: processedBodyHtml,
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

    // Send email immediately via nodemailer (denomailer produced malformed MIME
    // boundaries that Gmail rendered as raw text in the body).
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPassword },
    });

    // Generate a unique Message-ID for thread tracking
    const domain = gmailUser.split('@')[1] || 'outsta.io';
    const messageId = generateMessageId(domain);
    console.log("Generated Message-ID:", messageId);

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head><body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;"><table role="presentation" style="width: 100%; border-collapse: collapse;"><tr><td align="center" style="padding: 40px 0;"><table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"><tr><td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 50px 40px; border-radius: 12px 12px 0 0; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 3px;">OutSta</h1><p style="color: #e2e8f0; margin: 8px 0 0 0; font-size: 16px; font-weight: 400; letter-spacing: 2px;">Recruitment Team</p></td></tr><tr><td style="padding: 40px;">${processedBodyHtml}</td></tr><tr><td style="background-color: #f8f9fa; padding: 25px 40px; border-radius: 0 0 12px 12px; text-align: center;"><p style="color: #999999; font-size: 12px; margin: 0;">This email was sent by OutSta Recruitment.<br>If you have any questions, please reply to this email.</p></td></tr></table></td></tr></table></body></html>`;

    // Build a clean plain-text fallback from the body HTML.
    const plainText = processedBodyHtml
      .replace(/<br\s*\/?>(\n)?/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const mailOptions: any = {
      from: `OutSta Recruitment <${gmailUser}>`,
      to: recipientEmail,
      subject,
      text: plainText,
      html: emailHtml,
      messageId,
    };

    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
      console.log("Adding threading headers - In-Reply-To:", inReplyTo);
    }

    if (cc && cc.length > 0) {
      mailOptions.cc = cc;
      console.log("Adding CC recipients:", cc);
    }

    if (bcc && bcc.length > 0) {
      mailOptions.bcc = bcc;
      console.log("Adding BCC recipients:", bcc);
    }

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: "base64",
      }));
    }

    await transporter.sendMail(mailOptions);


    console.log("Email sent successfully to:", recipientEmail, "with Message-ID:", messageId);

    // Log the sent email with Message-ID for thread tracking
    const { error: logError } = await supabase
      .from('email_logs')
      .insert({
        applicant_id: applicantId,
        template_id: templateId || null,
        subject,
        body_html: processedBodyHtml,
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

    // Friendlier message when the sender mailbox credentials are rejected
    const isAuthError = error?.code === 'EAUTH' || error?.responseCode === 535;
    const senderLabel = (requestBody?.sendAsEmail || 'the selected sender');
    const friendlyMessage = isAuthError
      ? `Gmail rejected the login for ${senderLabel}. The app password for that mailbox is invalid or expired — generate a new Google app password for it and update it in the project settings.`
      : error.message;


    // Try to log the failed email
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && supabaseServiceKey) {
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb
          .from('email_logs')
          .insert({
            applicant_id: requestBody?.applicantId,
            template_id: requestBody?.templateId || null,
            subject: requestBody?.subject || 'Unknown',
            body_html: requestBody?.bodyHtml || '',
            recipient_email: requestBody?.recipientEmail || 'unknown',
            status: 'failed',
            applicant_status_at_send: requestBody?.applicantStatusAtSend || null,
            is_automated: requestBody?.isAutomated ?? false,
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
