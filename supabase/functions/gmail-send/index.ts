// Sends an email through Gmail on behalf of the signed-in admin.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function b64(s: string): string {
  return btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
}

function header(v: string): string {
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;
}

function createRawEmail(to: string, cc: string, bcc: string, subject: string, body: string): string {
  const email = [
    to ? `To: ${to}` : "",
    cc ? `Cc: ${cc}` : "",
    bcc ? `Bcc: ${bcc}` : "",
    `Subject: ${header(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=\"UTF-8\"",
    "",
    body,
  ].filter(Boolean).join("\r\n");
  return b64(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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

    const { to, cc, bcc, subject, body } = await req.json();
    if (!to || !subject) {
      return new Response(JSON.stringify({ error: "to and subject required" }), { status: 400, headers: corsHeaders });
    }

    const raw = createRawEmail(to, cc || "", bcc || "", subject, body || "");
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/messages/send",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      },
    });
    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: errBody }), { status: res.status, headers: corsHeaders });
    }
    const data = await res.json();
    return new Response(JSON.stringify({ success: true, messageId: data.id, threadId: data.threadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-send error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
