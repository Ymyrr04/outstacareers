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

interface InterviewInviteRequest {
  to: string;
  candidateName: string;
  jobTitle: string;
  interviewDate: string;
  interviewTime: string;
  zoomLink: string;
  interviewerName?: string;
  additionalNotes?: string;
  applicantId?: string;
  isCalendlyLink?: boolean;
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

    const {
      to,
      candidateName,
      jobTitle,
      interviewDate,
      interviewTime,
      zoomLink,
      interviewerName = "Our Team",
      additionalNotes = "",
      applicantId,
    }: InterviewInviteRequest = await req.json();

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

    const subject = `Interview Invitation - ${jobTitle}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Interview Invitation</h1>
              <p style="color: #a0a0a0; margin: 10px 0 0 0; font-size: 14px;">OUTSTA Talent Team</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Dear <strong>${candidateName}</strong>,
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                We are pleased to invite you for an interview for the <strong>${jobTitle}</strong> position. We were impressed with your application and would like to learn more about your experience.
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-radius: 8px; margin: 30px 0;">
                <tr>
                  <td style="padding: 25px;">
                    <h3 style="color: #1a1a2e; margin: 0 0 20px 0; font-size: 18px;">📅 Interview Details</h3>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; width: 120px;">Date:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${interviewDate}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Time:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${interviewTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Platform:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">Zoom Video Call</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px;">Interviewer:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px; font-weight: 600;">${interviewerName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${zoomLink}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);">
                      Join Zoom Meeting
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 20px 0; text-align: center;">
                Meeting Link: <a href="${zoomLink}" style="color: #2563eb;">${zoomLink}</a>
              </p>
              ${additionalNotes ? `
              <div style="background-color: #fff8e6; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>Note:</strong> ${additionalNotes}
                </p>
              </div>
              ` : ''}
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
                Please confirm your availability by replying to this email.
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 20px 0 0 0;">
                Best regards,<br>
                <strong>The Outsta Recruitment Team</strong>
              </p>
            </td>
          </tr>
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

    // Generate Message-ID for thread tracking
    const domain = gmailUser.split('@')[1] || 'outsta.io';
    const messageId = generateMessageId(domain);
    console.log("Generated Message-ID:", messageId);

    await client.send({
      from: `OutSta Recruitment <${gmailUser}>`,
      to: to,
      subject: subject,
      content: "auto",
      html: emailHtml,
      headers: {
        "Message-ID": messageId,
      },
    });

    await client.close();

    console.log("Interview invite sent successfully to:", to, "with Message-ID:", messageId);

    // Log the sent email with Message-ID for reply tracking
    if (applicantId && supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { error: logError } = await supabase
          .from('email_logs')
          .insert({
            applicant_id: applicantId,
            subject: subject,
            body_html: emailHtml,
            recipient_email: to,
            status: 'sent',
            sent_at: new Date().toISOString(),
            is_automated: false,
            message_id: messageId,
          });

        if (logError) {
          console.error("Error logging interview invite email:", logError);
        } else {
          console.log("Interview invite logged to email_logs");
        }
      } catch (logErr) {
        console.error("Error logging email:", logErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Interview invite sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending interview invite:", error);
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
