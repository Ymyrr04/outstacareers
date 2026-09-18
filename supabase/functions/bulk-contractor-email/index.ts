import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

function generateMessageId(domain: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  maxBatchSize?: number;
  clientId?: string;
  country?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    let { subject, bodyHtml, scheduledEmailId, maxBatchSize, clientId, country }: BulkEmailRequest = await req.json();

    // When resuming a scheduled batch, always read subject/body from the database
    // to avoid empty body issues from re-triggers or self-invocations
    if (scheduledEmailId) {
      const { data: scheduledData, error: scheduledErr } = await supabase
        .from("scheduled_contractor_emails")
        .select("subject, body_html, client_id, country")
        .eq("id", scheduledEmailId)
        .single();

      if (scheduledErr) throw new Error(`Failed to load scheduled email: ${scheduledErr.message}`);
      if (scheduledData) {
        subject = scheduledData.subject;
        bodyHtml = scheduledData.body_html;
        if (!clientId && scheduledData.client_id) {
          clientId = scheduledData.client_id;
        }
        if (!country && (scheduledData as any).country) {
          country = (scheduledData as any).country;
        }
      }
    }

    let contractorQuery = supabase
      .from("contractor_assignments")
      .select("id, job_title, hourly_rate, applicant:applicants_prescreen(full_name, email), client:clients(company_name)")
      .eq("status", "active")
      .order("id", { ascending: true });

    if (clientId) {
      contractorQuery = contractorQuery.eq("client_id", clientId);
    }
    if (country) {
      contractorQuery = contractorQuery.eq("country", country);
    }

    const { data: contractors, error: fetchError } = await contractorQuery;

    if (fetchError) throw new Error("Failed to fetch contractors: " + fetchError.message);
    if (!contractors || contractors.length === 0) {
      if (scheduledEmailId) {
        await supabase
          .from("scheduled_contractor_emails")
          .update({
            total_items: 0,
            processed_items: 0,
            status: "sent",
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", scheduledEmailId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          completed: true,
          sent: 0,
          failed: 0,
          remaining_items: 0,
          total_items: 0,
          processed_items: 0,
          message: "No active contractors found",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const totalItems = contractors.length;
    const defaultBatchSize = Number(Deno.env.get("BULK_EMAIL_BATCH_SIZE") || "5");
    const batchSize = scheduledEmailId
      ? Math.max(
          1,
          Math.min(totalItems, Number.isFinite(maxBatchSize as number) ? Number(maxBatchSize) : defaultBatchSize),
        )
      : totalItems;

    let processedItems = 0;

    if (scheduledEmailId) {
      const { data: scheduledRow, error: scheduledFetchError } = await supabase
        .from("scheduled_contractor_emails")
        .select("id, processed_items, total_items, status")
        .eq("id", scheduledEmailId)
        .single();

      if (scheduledFetchError) {
        throw new Error(`Failed to load scheduled email tracking: ${scheduledFetchError.message}`);
      }

      // If paused, halt immediately without processing
      if (scheduledRow?.status === 'paused') {
        console.log(`Batch ${scheduledEmailId} is paused. Halting.`);
        return new Response(
          JSON.stringify({
            success: true,
            completed: false,
            sent: 0,
            failed: 0,
            processed_items: Number(scheduledRow?.processed_items || 0),
            total_items: totalItems,
            remaining_items: totalItems - Number(scheduledRow?.processed_items || 0),
            message: "Batch is paused",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      processedItems = Math.max(0, Number(scheduledRow?.processed_items || 0));

      if (Number(scheduledRow?.total_items || 0) !== totalItems) {
        await supabase
          .from("scheduled_contractor_emails")
          .update({ total_items: totalItems, last_activity_at: new Date().toISOString() })
          .eq("id", scheduledEmailId);
      }
    }

    if (processedItems >= totalItems) {
      if (scheduledEmailId) {
        await supabase
          .from("scheduled_contractor_emails")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            processed_items: totalItems,
            total_items: totalItems,
            error_message: null,
          })
          .eq("id", scheduledEmailId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          completed: true,
          sent: 0,
          failed: 0,
          skipped: 0,
          processed_items: totalItems,
          total_items: totalItems,
          remaining_items: 0,
          message: "Batch already completed",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const endIndexExclusive = Math.min(processedItems + batchSize, totalItems);
    const contractorsToProcess = contractors.slice(processedItems, endIndexExclusive);

    console.log(
      `Processing chunk ${processedItems + 1}-${endIndexExclusive} of ${totalItems} (scheduledEmailId=${scheduledEmailId || "none"})`,
    );

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });

    const domain = gmailUser.split("@")[1] || "outsta.io";
    const signatureUrl = `${supabaseUrl}/storage/v1/object/public/email-assets/mark-signature.png`;
    const signatureHtml = `
<br/>
<p style="margin: 0; color: #333333; font-size: 14px;">--</p>
<p style="margin: 4px 0 0 0; color: #333333; font-size: 14px;">Warm Regards,<br/>Mark</p>
<br/>
<img src="${signatureUrl}" alt="Mark Chua - Marketing & Business Development Manager, OutSta" style="width: 420px; max-width: 100%; height: auto; border-radius: 8px;" />`;

    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < contractorsToProcess.length; i++) {
        const contractor = contractorsToProcess[i];
        const applicant = contractor.applicant as { full_name?: string; email?: string } | null;
        const clientData = contractor.client as { company_name?: string } | null;

        if (i > 0) {
          console.log("Waiting 30 seconds before sending next email...");
          await wait(30000);
        }

        processedItems += 1;

        if (!applicant?.email) {
          skippedCount += 1;
          if (scheduledEmailId) {
            await supabase
              .from("scheduled_contractor_emails")
              .update({ processed_items: processedItems, last_activity_at: new Date().toISOString() })
              .eq("id", scheduledEmailId);
          }
          continue;
        }

        const firstName = applicant.full_name?.split(" ")[0] || "";
        const rateStr = contractor.hourly_rate != null ? `$${contractor.hourly_rate}/hr` : "";
        const personalizedBody = bodyHtml
          .replace(/\{\{first_name\}\}/gi, firstName)
          .replace(/\{\{full_name\}\}/gi, applicant.full_name || "")
          .replace(/\{\{company\}\}/gi, clientData?.company_name || "")
          .replace(/\{\{job_title\}\}/gi, contractor.job_title || "")
          .replace(/\{\{rate\}\}/gi, rateStr);

        const personalizedSubject = subject
          .replace(/\{\{first_name\}\}/gi, firstName)
          .replace(/\{\{full_name\}\}/gi, applicant.full_name || "")
          .replace(/\{\{company\}\}/gi, clientData?.company_name || "")
          .replace(/\{\{job_title\}\}/gi, contractor.job_title || "")
          .replace(/\{\{rate\}\}/gi, rateStr);

        const formattedBody = personalizedBody
          .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color: #1a73e8; text-decoration: underline;">$1</a>')
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/__(.+?)__/g, "<u>$1</u>")
          .replace(/\n/g, "<br>");

        const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${personalizedSubject}</title></head><body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #ffffff; color: #333333; font-size: 14px; line-height: 1.6;">${formattedBody}${signatureHtml}</body></html>`;

        try {
          const messageId = generateMessageId(domain);

          await client.send({
            from: `OutSta Mark Chua <${gmailUser}>`,
            to: applicant.email,
            subject: personalizedSubject,
            content: "auto",
            html: emailHtml,
            headers: { "Message-ID": messageId },
          });

          await supabase.from("contractor_email_logs").insert({
            contractor_assignment_id: contractor.id,
            subject: personalizedSubject,
            body_html: personalizedBody,
            recipient_email: applicant.email,
            status: "sent",
            sent_at: new Date().toISOString(),
            message_id: messageId,
          });

          sentCount++;
          console.log(`Sent to: ${applicant.email} (${processedItems}/${totalItems})`);
        } catch (err: any) {
          console.error(`Failed to send to ${applicant.email}:`, err.message);
          errors.push(`${applicant.full_name || "Unknown"} (${applicant.email}): ${err.message}`);

          await supabase.from("contractor_email_logs").insert({
            contractor_assignment_id: contractor.id,
            subject: personalizedSubject,
            body_html: personalizedBody,
            recipient_email: applicant.email,
            status: "failed",
            error_message: err.message,
          });
        }

        if (scheduledEmailId) {
          await supabase
            .from("scheduled_contractor_emails")
            .update({ processed_items: processedItems, last_activity_at: new Date().toISOString() })
            .eq("id", scheduledEmailId);
        }
      }
    } finally {
      await client.close();
    }

    const completed = processedItems >= totalItems;
    const remainingItems = Math.max(0, totalItems - processedItems);

    if (scheduledEmailId) {
      // Re-check status to see if admin cancelled
      const { data: currentStatus } = await supabase
        .from("scheduled_contractor_emails")
        .select("status")
        .eq("id", scheduledEmailId)
        .single();

      if (currentStatus?.status === 'failed' || currentStatus?.status === 'cancelled' || currentStatus?.status === 'paused') {
        console.log(`Batch was ${currentStatus?.status} by admin. Halting.`);
        return new Response(
          JSON.stringify({
            success: true,
            completed: true,
            sent: sentCount,
            failed: errors.length,
            skipped: skippedCount,
            processed_items: processedItems,
            total_items: totalItems,
            remaining_items: remainingItems,
            message: "Batch was cancelled by admin",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      await supabase
        .from("scheduled_contractor_emails")
        .update(
          completed
            ? {
                status: "sent",
                sent_at: new Date().toISOString(),
                processed_items: processedItems,
                total_items: totalItems,
                error_message: null,
              }
            : {
                status: "processing",
                processed_items: processedItems,
                total_items: totalItems,
                last_activity_at: new Date().toISOString(),
              },
        )
        .eq("id", scheduledEmailId);
    }

    console.log(
      `Chunk complete: ${sentCount} sent, ${errors.length} failed, ${skippedCount} skipped. Completed=${completed}, processed=${processedItems}/${totalItems}`,
    );

    // Self-invoke for the next batch if not completed
    if (!completed && scheduledEmailId) {
      console.log(`Self-invoking for next batch (processed=${processedItems}, total=${totalItems})`);
      const selfUrl = `${supabaseUrl}/functions/v1/bulk-contractor-email`;
      const serviceKey = supabaseServiceKey;
      
      // Fire and forget - don't await to avoid chaining timeouts
      fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: JSON.stringify({
          subject,
          bodyHtml,
          scheduledEmailId,
          maxBatchSize: batchSize,
          clientId: clientId || undefined,
          country: country || undefined,
        }),
      }).catch((err) => {
        console.error("Self-invoke failed:", err.message);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        completed,
        sent: sentCount,
        failed: errors.length,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
        processed_items: processedItems,
        total_items: totalItems,
        remaining_items: remainingItems,
        message: completed
          ? `Sent ${processedItems} of ${totalItems} contractors`
          : `Processed ${processedItems} of ${totalItems}. ${remainingItems} remaining.`,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Bulk email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
