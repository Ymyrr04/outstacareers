import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace("Bearer ", "");
    const authed = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userEmail = claimsData.claims.email as string | undefined;


    const admin = createClient(supabaseUrl, serviceKey);
    const { envelopeId, reason } = await req.json();
    if (!envelopeId) return new Response(JSON.stringify({ error: "Missing envelopeId" }), { status: 400, headers: corsHeaders });

    await admin.from("contract_envelopes").update({
      status: "voided", voided_at: new Date().toISOString(), voided_reason: reason ?? null,
    }).eq("id", envelopeId);

    await admin.from("contract_audit_events").insert({
      envelope_id: envelopeId, event_type: "voided", actor_email: userEmail, metadata: { reason },
    });

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
