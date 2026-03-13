import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const invokeBulkContractorEmail = async (
  supabaseUrl: string,
  supabaseServiceKey: string,
  payload: Record<string, unknown>,
) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/bulk-contractor-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let json: Record<string, unknown> = {};

  if (rawText) {
    try {
      json = JSON.parse(rawText);
    } catch {
      json = { rawText };
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : `bulk-contractor-email returned ${response.status}`,
    );
  }

  return json;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results: string[] = [];

    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Continue all due scheduled emails (both pending and processing)
    const { data: scheduledEmails, error: schedError } = await supabase
      .from("scheduled_contractor_emails")
      .select("*")
      .in("status", ["pending", "processing"])
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true });

    if (!schedError && scheduledEmails && scheduledEmails.length > 0) {
      for (const scheduled of scheduledEmails) {
        try {
          if (scheduled.status === "pending") {
            const { data: lockedRows, error: lockError } = await supabase
              .from("scheduled_contractor_emails")
              .update({ status: "processing", error_message: null })
              .eq("id", scheduled.id)
              .eq("status", "pending")
              .select("id");

            if (lockError) throw lockError;
            if (!lockedRows || lockedRows.length === 0) {
              results.push(`Scheduled email ${scheduled.id}: skipped (already picked by another run)`);
              continue;
            }
          }

          const result = await invokeBulkContractorEmail(supabaseUrl, supabaseServiceKey, {
            subject: scheduled.subject,
            bodyHtml: scheduled.body_html,
            scheduledEmailId: scheduled.id,
          });

          const completed = Boolean(result.completed);
          const processed = Number(result.processed_items ?? scheduled.processed_items ?? 0);
          const total = Number(result.total_items ?? scheduled.total_items ?? 0);

          if (completed) {
            await supabase
              .from("scheduled_contractor_emails")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                error_message: null,
                processed_items: processed,
                total_items: total,
              })
              .eq("id", scheduled.id);

            results.push(`Scheduled email ${scheduled.id}: completed (${processed}/${total})`);
          } else {
            await supabase
              .from("scheduled_contractor_emails")
              .update({ status: "processing", error_message: null })
              .eq("id", scheduled.id);

            results.push(`Scheduled email ${scheduled.id}: in progress (${processed}/${total})`);
          }
        } catch (err: any) {
          await supabase
            .from("scheduled_contractor_emails")
            .update({ status: "failed", error_message: err.message })
            .eq("id", scheduled.id);

          results.push(`Scheduled email ${scheduled.id}: failed - ${err.message}`);
        }
      }
    }

    // 2. Check for recurring default template (Friday auto-send at ~5pm UTC / 1pm EDT)
    const isFriday = now.getUTCDay() === 5;
    const utcHour = now.getUTCHours();

    if (isFriday && utcHour === 17) {
      const { data: template, error: tplError } = await supabase
        .from("contractor_email_templates")
        .select("subject, body_html")
        .eq("is_default", true)
        .single();

      if (!tplError && template) {
        const result = await invokeBulkContractorEmail(supabaseUrl, supabaseServiceKey, {
          subject: template.subject,
          bodyHtml: template.body_html,
        });

        results.push(`Recurring Friday email: sent ${Number(result.sent || 0)}`);
      } else {
        results.push("No default template found for recurring send");
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Recurring email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
