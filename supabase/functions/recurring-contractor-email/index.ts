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

const FREQUENCY_CONFIG: Record<string, { checkMatch: (now: Date) => boolean }> = {
  "weekly-friday": {
    checkMatch: (now) => now.getUTCDay() === 5,
  },
  "weekly-monday": {
    checkMatch: (now) => now.getUTCDay() === 1,
  },
  "biweekly-friday": {
    checkMatch: (now) => {
      if (now.getUTCDay() !== 5) return false;
      // Use ISO week number to determine odd/even weeks
      const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
      const weekNumber = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
      return weekNumber % 2 === 0;
    },
  },
  "monthly-first": {
    checkMatch: (now) => now.getUTCDate() === 1,
  },
  "monthly-last": {
    checkMatch: (now) => {
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow.getUTCDate() === 1;
    },
  },
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
            clientId: scheduled.client_id || undefined,
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

    // 2. Check recurring schedules from the database table
    const utcHour = now.getUTCHours();
    // Only process recurring at a specific hour window (17 UTC / 1 PM EDT)
    if (utcHour === 17) {
      const { data: recurringSchedules, error: recurringError } = await supabase
        .from("recurring_contractor_email_schedules")
        .select("*, template:contractor_email_templates(subject, body_html, name)")
        .eq("is_enabled", true);

      if (!recurringError && recurringSchedules && recurringSchedules.length > 0) {
        for (const schedule of recurringSchedules) {
          const config = FREQUENCY_CONFIG[schedule.frequency];
          if (!config || !config.checkMatch(now)) {
            continue;
          }

          // Guard: check if already sent today
          const todayStart = new Date(now);
          todayStart.setUTCHours(0, 0, 0, 0);

          if (schedule.last_sent_at && new Date(schedule.last_sent_at) >= todayStart) {
            results.push(`Recurring "${schedule.template?.name}": already sent today, skipping`);
            continue;
          }

          const template = schedule.template;
          if (!template) {
            results.push(`Recurring schedule ${schedule.id}: template not found, skipping`);
            continue;
          }

          try {
            // Create a tracking record
            const { data: trackingRecord } = await supabase
              .from("scheduled_contractor_emails")
              .insert({
                subject: template.subject,
                body_html: template.body_html,
                scheduled_for: nowIso,
                status: "processing",
                client_id: schedule.client_id || null,
              })
              .select("id")
              .single();

            const scheduledEmailId = trackingRecord?.id;

            const result = await invokeBulkContractorEmail(supabaseUrl, supabaseServiceKey, {
              subject: template.subject,
              bodyHtml: template.body_html,
              scheduledEmailId,
              clientId: schedule.client_id || undefined,
            });

            // Update last_sent_at on the recurring schedule
            await supabase
              .from("recurring_contractor_email_schedules")
              .update({ last_sent_at: nowIso })
              .eq("id", schedule.id);

            results.push(`Recurring "${template.name}" (${schedule.frequency}): sent ${Number(result.sent || 0)}`);
          } catch (err: any) {
            results.push(`Recurring "${template.name}": failed - ${err.message}`);
          }
        }
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
