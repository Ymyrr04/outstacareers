import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MentionNotificationRequest {
  type: 'mention' | 'assignment';
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  requestTitle: string;
  clientName: string;
  commentContent?: string; // For mentions
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

    if (!gmailUser || !gmailPassword) {
      throw new Error("Gmail credentials not configured");
    }

    const { type, recipientEmail, recipientName, senderName, requestTitle, clientName, commentContent }: MentionNotificationRequest = await req.json();

    // Don't send notification to yourself
    if (recipientEmail.toLowerCase() === gmailUser.toLowerCase()) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'self-notification' }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });

    let subject: string;
    let bodyHtml: string;

    if (type === 'mention') {
      subject = `💬 ${senderName} mentioned you in ${requestTitle} – ${clientName}`;
      // Strip HTML tags for plain preview, keep it brief
      const plainComment = (commentContent || '').replace(/<[^>]*>/g, '').substring(0, 200);
      bodyHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;font-family:Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px;">OutSta</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi <strong>${recipientName}</strong>,
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        <strong>${senderName}</strong> mentioned you in a comment on <strong>${requestTitle}</strong> (${clientName}):
      </p>
      <div style="background:#f8f9fa;border-left:4px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        <p style="color:#555;font-size:14px;margin:0;line-height:1.5;">${plainComment}</p>
      </div>
      <p style="color:#999;font-size:13px;margin:0;">
        Log in to the admin dashboard to view the full comment and respond.
      </p>
    </div>
  </div>
</body>
</html>`;
    } else {
      subject = `📋 You've been assigned: ${requestTitle} – ${clientName}`;
      bodyHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;font-family:Arial,sans-serif;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:20px;letter-spacing:1px;">OutSta</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi <strong>${recipientName}</strong>,
      </p>
      <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px;">
        <strong>${senderName}</strong> has assigned you to the hiring request <strong>${requestTitle}</strong> for <strong>${clientName}</strong>.
      </p>
      <p style="color:#999;font-size:13px;margin:0;">
        Log in to the admin dashboard to review the details and take action.
      </p>
    </div>
  </div>
</body>
</html>`;
    }

    await client.send({
      from: `OutSta Notifications <${gmailUser}>`,
      to: recipientEmail,
      subject,
      content: "auto",
      html: bodyHtml,
    });

    await client.close();

    console.log(`Mention notification (${type}) sent to:`, recipientEmail);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending mention notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
