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

interface BulkEmailRequest {
  subject: string;
  bodyHtml: string;
  scheduledEmailId?: string;
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

    if (!gmailUser || !gmailPassword) throw new Error("Gmail credentials not configured");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { subject, bodyHtml, scheduledEmailId }: BulkEmailRequest = await req.json();

    // Fetch all active contractors with their applicant details
    const { data: contractors, error: fetchError } = await supabase
      .from('contractor_assignments')
      .select('id, job_title, applicant:applicants_prescreen(full_name, email), client:clients(company_name)')
      .eq('status', 'active');

    if (fetchError) throw new Error("Failed to fetch contractors: " + fetchError.message);
    if (!contractors || contractors.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No active contractors found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending bulk email to ${contractors.length} active contractors`);

    // Update total_items on scheduled email record for progress tracking
    if (scheduledEmailId) {
      await supabase
        .from('scheduled_contractor_emails')
        .update({ total_items: contractors.length, processed_items: 0 })
        .eq('id', scheduledEmailId);
    }

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });

    const domain = gmailUser.split('@')[1] || 'outsta.io';
    const signatureHtml = `
<br/>
<p style="margin: 0; color: #333333; font-size: 14px;">--</p>
<p style="margin: 4px 0 0 0; color: #333333; font-size: 14px;">Warm Regards,<br/>Mark</p>
<br/>
<img src="https://ohxtavjababtrcrkgndq.supabase.co/storage/v1/object/public/email-assets/mark-signature.png" alt="Mark Chua - Marketing & Business Development Manager, OutSta" style="width: 420px; max-width: 100%; height: auto; border-radius: 8px;" />`;

    let sentCount = 0;
    const errors: string[] = [];

    for (const contractor of contractors) {
      const applicant = contractor.applicant as any;
      const clientData = contractor.client as any;
      if (!applicant?.email) continue;

      const firstName = applicant.full_name?.split(' ')[0] || '';
      const personalizedBody = bodyHtml
        .replace(/\{\{first_name\}\}/gi, firstName)
        .replace(/\{\{full_name\}\}/gi, applicant.full_name || '')
        .replace(/\{\{company\}\}/gi, clientData?.company_name || '')
        .replace(/\{\{job_title\}\}/gi, contractor.job_title || '');

      const personalizedSubject = subject
        .replace(/\{\{first_name\}\}/gi, firstName)
        .replace(/\{\{full_name\}\}/gi, applicant.full_name || '')
        .replace(/\{\{company\}\}/gi, clientData?.company_name || '')
        .replace(/\{\{job_title\}\}/gi, contractor.job_title || '');

      // Convert markdown-style links [text](url) to HTML <a> tags, then newlines to <br>
      const formattedBody = personalizedBody
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color: #1a73e8; text-decoration: underline;">$1</a>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/\n/g, '<br>');
      const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${personalizedSubject}</title></head><body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #ffffff; color: #333333; font-size: 14px; line-height: 1.6;">${formattedBody}${signatureHtml}</body></html>`;

      try {
        // Wait 30 seconds between emails to avoid spam detection
        if (sentCount > 0 || errors.length > 0) {
          console.log(`Waiting 30 seconds before sending next email...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }

        const messageId = generateMessageId(domain);
        await client.send({
          from: `OutSta Mark Chua <${gmailUser}>`,
          to: applicant.email,
          subject: personalizedSubject,
          content: "auto",
          html: emailHtml,
          headers: { "Message-ID": messageId },
        });

        // Log sent email
        await supabase.from('contractor_email_logs').insert({
          contractor_assignment_id: contractor.id,
          subject: personalizedSubject,
          body_html: personalizedBody,
          recipient_email: applicant.email,
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_id: messageId,
        });

        sentCount++;
        console.log(`Sent to: ${applicant.email} (${sentCount}/${contractors.length})`);

        // Update progress on scheduled email record
        if (scheduledEmailId) {
          await supabase
            .from('scheduled_contractor_emails')
            .update({ processed_items: sentCount + errors.length })
            .eq('id', scheduledEmailId);
        }
      } catch (err: any) {
        console.error(`Failed to send to ${applicant.email}:`, err.message);
        errors.push(`${applicant.full_name} (${applicant.email}): ${err.message}`);

        await supabase.from('contractor_email_logs').insert({
          contractor_assignment_id: contractor.id,
          subject: personalizedSubject,
          body_html: personalizedBody,
          recipient_email: applicant.email,
          status: 'failed',
          error_message: err.message,
        });
      }
    }

    await client.close();

    console.log(`Bulk email complete: ${sentCount} sent, ${errors.length} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined,
        message: `Sent ${sentCount} of ${contractors.length} emails` 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Bulk email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
