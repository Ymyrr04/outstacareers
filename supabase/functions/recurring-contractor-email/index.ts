import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase credentials not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const results: string[] = [];

    // 1. Check for pending scheduled emails that are due
    const { data: scheduledEmails, error: schedError } = await supabase
      .from('scheduled_contractor_emails')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (!schedError && scheduledEmails && scheduledEmails.length > 0) {
      for (const scheduled of scheduledEmails) {
        console.log(`Processing scheduled email: ${scheduled.id}`);
        try {
          // Mark as processing IMMEDIATELY to prevent duplicate sends from subsequent cron runs
          await supabase
            .from('scheduled_contractor_emails')
            .update({ status: 'processing' })
            .eq('id', scheduled.id)
            .eq('status', 'pending');

          const bulkResponse = await fetch(`${supabaseUrl}/functions/v1/bulk-contractor-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              subject: scheduled.subject,
              bodyHtml: scheduled.body_html,
              scheduledEmailId: scheduled.id,
            }),
          });

          const result = await bulkResponse.json();
          console.log("Scheduled email result:", JSON.stringify(result));

          await supabase
            .from('scheduled_contractor_emails')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', scheduled.id);

          results.push(`Scheduled email ${scheduled.id}: sent ${result.sent || 0}`);
        } catch (err: any) {
          await supabase
            .from('scheduled_contractor_emails')
            .update({ status: 'failed', error_message: err.message })
            .eq('id', scheduled.id);

          results.push(`Scheduled email ${scheduled.id}: failed - ${err.message}`);
        }
      }
    }

    // 2. Check for recurring default template (Friday auto-send at ~5pm UTC / 1pm EDT)
    const now = new Date();
    const isFriday = now.getUTCDay() === 5;
    const utcHour = now.getUTCHours();

    // Only send recurring Friday email once, around 5pm UTC (1pm EDT)
    if (isFriday && utcHour === 17) {
      const { data: template, error: tplError } = await supabase
        .from('contractor_email_templates')
        .select('subject, body_html')
        .eq('is_default', true)
        .single();

      if (!tplError && template) {
        const bulkResponse = await fetch(`${supabaseUrl}/functions/v1/bulk-contractor-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            subject: template.subject,
            bodyHtml: template.body_html,
          }),
        });

        const result = await bulkResponse.json();
        console.log("Recurring bulk email result:", JSON.stringify(result));
        results.push(`Recurring Friday email: sent ${result.sent || 0}`);
      } else {
        results.push("No default template found for recurring send");
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Recurring email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
