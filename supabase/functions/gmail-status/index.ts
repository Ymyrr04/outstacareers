// Checks whether the signed-in admin has a Gmail connection and returns their profile.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser, deleteConnectionKeyForUser } from "../_shared/appUserConnections.ts";

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

    const { action } = await req.json().catch(() => ({ action: "status" }));

    if (action === "disconnect") {
      const connectionAPIKey = await getConnectionKeyForUser(userId, CONNECTOR_ID);
      if (connectionAPIKey) {
        try {
          const { disconnectAppUser } = await import("../_shared/appUserConnector.ts");
          await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey, connectorId: CONNECTOR_ID });
        } catch (e) {
          console.error("disconnect gateway error:", e);
        }
        await deleteConnectionKeyForUser(userId, CONNECTOR_ID);
      }
      return new Response(JSON.stringify({ ok: true, disconnected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // status / profile
    const connectionAPIKey = await getConnectionKeyForUser(userId, CONNECTOR_ID);
    if (!connectionAPIKey) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: "/gmail/v1/users/me/profile",
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error("profile fetch failed:", res.status, errBody);
      let friendly = errBody;
      try {
        const parsed = JSON.parse(errBody);
        friendly = parsed?.error?.message ?? errBody;
      } catch { /* keep raw */ }
      // Only a hard auth failure invalidates the stored connection.
      if (res.status === 401) {
        await deleteConnectionKeyForUser(userId, CONNECTOR_ID);
        return new Response(JSON.stringify({ connected: false, error: "Connection expired — please reconnect" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // 403 etc. keep the connection but report why Gmail can't be read.
      return new Response(JSON.stringify({ connected: true, error: friendly }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile = await res.json();

    // Gmail signature for the primary send-as address (best effort).
    let signature = "";
    try {
      const sendAsRes = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: "/gmail/v1/users/me/settings/sendAs",
      });
      if (sendAsRes.ok) {
        const sendAs = await sendAsRes.json();
        const list: any[] = sendAs?.sendAs || [];
        const primary =
          list.find((s: any) => s.isPrimary) ||
          list.find((s: any) => (s.sendAsEmail || "").toLowerCase() === (profile.emailAddress || "").toLowerCase()) ||
          list.find((s: any) => s.signature);
        signature = primary?.signature || "";
      } else {
        console.error("sendAs fetch failed:", sendAsRes.status, await sendAsRes.text());
      }
    } catch (e) {
      console.error("sendAs error:", e);
    }

    return new Response(JSON.stringify({
      connected: true,
      profile: { emailAddress: profile.emailAddress, messagesTotal: profile.messagesTotal, threadsTotal: profile.threadsTotal, signature },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-status error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
