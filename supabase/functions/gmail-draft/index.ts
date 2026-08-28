// Creates / updates / deletes Gmail drafts for the signed-in admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";
import { createRawEmail } from "../_shared/gmailMime.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const authedClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await authedClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const connectionAPIKey = await getConnectionKeyForUser(userId, CONNECTOR_ID);
    if (!connectionAPIKey) {
      return new Response(JSON.stringify({ connected: false }), { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    const action: string = payload.action || "save-draft";

    const call = (path: string, init: RequestInit) =>
      callAsAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID, path, init });

    if (action === "delete-draft") {
      const draftId = payload.draftId;
      if (!draftId) return new Response(JSON.stringify({ error: "draftId required" }), { status: 400, headers: corsHeaders });
      const res = await call(`/gmail/v1/users/me/drafts/${draftId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const errBody = await res.text();
        return new Response(JSON.stringify({ error: errBody }), { status: res.status, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list-drafts") {
      const res = await call("/gmail/v1/users/me/drafts?maxResults=100", { method: "GET" });
      const text = await res.text();
      if (!res.ok) return new Response(JSON.stringify({ error: text }), { status: res.status, headers: corsHeaders });
      const parsed = JSON.parse(text || "{}");
      const drafts = (parsed.drafts || []).map((d: any) => ({ draftId: d.id, messageId: d.message?.id, threadId: d.message?.threadId }));
      return new Response(JSON.stringify({ drafts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-draft") {
      const draftId = payload.draftId;
      if (!draftId) return new Response(JSON.stringify({ error: "draftId required" }), { status: 400, headers: corsHeaders });
      const res = await call(`/gmail/v1/users/me/drafts/${draftId}?format=full`, { method: "GET" });
      const text = await res.text();
      if (!res.ok) return new Response(JSON.stringify({ error: text }), { status: res.status, headers: corsHeaders });
      return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // save-draft (create or update)
    const { to, cc, bcc, subject, body, attachments, draftId } = payload;
    const raw = createRawEmail({
      to: to || "",
      cc: cc || "",
      bcc: bcc || "",
      subject: subject || "",
      body: body || "",
      attachments: attachments || [],
    });
    const path = draftId ? `/gmail/v1/users/me/drafts/${draftId}` : "/gmail/v1/users/me/drafts";
    const res = await call(path, {
      method: draftId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: errBody }), { status: res.status, headers: corsHeaders });
    }
    const data = await res.json();
    return new Response(JSON.stringify({ success: true, draftId: data.id, messageId: data.message?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-draft error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
