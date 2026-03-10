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

    // Get the default template
    const { data: template, error: tplError } = await supabase
      .from('contractor_email_templates')
      .select('subject, body_html')
      .eq('is_default', true)
      .single();

    if (tplError || !template) {
      console.log("No default template found, skipping recurring email");
      return new Response(
        JSON.stringify({ success: true, message: "No default template found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Call the bulk email function
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

    return new Response(
      JSON.stringify(result),
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
