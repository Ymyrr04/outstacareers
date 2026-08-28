// Applies label changes: mark read/unread, archive, star, trash, untrash.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

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

    const { action, messageId, messageIds } = await req.json();
    const ids: string[] = messageIds || (messageId ? [messageId] : []);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: "messageId(s) required" }), { status: 400, headers: corsHeaders });
    }

    let path = "";
    let method = "POST";
    let body: any = {};

    switch (action) {
      case "mark-read":
        path = `/gmail/v1/users/me/messages/${ids[0]}/modify`;
        body = { removeLabelIds: ["UNREAD"] };
        break;
      case "mark-unread":
        path = `/gmail/v1/users/me/messages/${ids[0]}/modify`;
        body = { addLabelIds: ["UNREAD"] };
        break;
      case "archive":
        path = `/gmail/v1/users/me/messages/${ids[0]}/modify`;
        body = { removeLabelIds: ["INBOX"] };
        break;
      case "star":
        path = `/gmail/v1/users/me/messages/${ids[0]}/modify`;
        body = { addLabelIds: ["STARRED"] };
        break;
      case "unstar":
        path = `/gmail/v1/users/me/messages/${ids[0]}/modify`;
        body = { removeLabelIds: ["STARRED"] };
        break;
      case "trash":
        path = `/gmail/v1/users/me/messages/${ids[0]}/trash`;
        method = "POST";
        body = {};
        break;
      case "untrash":
        path = `/gmail/v1/users/me/messages/${ids[0]}/untrash`;
        method = "POST";
        body = {};
        break;
      case "batch-mark-read":
        path = "/gmail/v1/users/me/messages/batchModify";
        body = { ids, removeLabelIds: ["UNREAD"] };
        break;
      case "batch-archive":
        path = "/gmail/v1/users/me/messages/batchModify";
        body = { ids, removeLabelIds: ["INBOX"] };
        break;
      default:
        return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: corsHeaders });
    }

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path,
      init: { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    });
    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: errBody }), { status: res.status, headers: corsHeaders });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-action error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
