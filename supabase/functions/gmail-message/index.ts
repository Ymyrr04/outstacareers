// Gets a single Gmail message body (format=full).
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function decodeBase64(data: string, charset = "utf-8"): string {
  try {
    let normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4 !== 0) normalized += "=";
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  } catch {
    return "";
  }
}

function charsetOf(part: any): string {
  const ct = (part?.headers || []).find((h: any) => h.name?.toLowerCase() === "content-type")?.value || "";
  const m = /charset=["']?([\w-]+)/i.exec(ct);
  return (m?.[1] || "utf-8").toLowerCase();
}

// Collect the best html and plain text bodies anywhere in the MIME tree,
// skipping attachment parts.
function collectBodies(payload: any, acc: { html: string; text: string }) {
  if (!payload) return;
  const isAttachment = !!payload.filename && payload.filename.length > 0;
  const data = payload.body?.data;
  if (data && !isAttachment) {
    if (payload.mimeType === "text/html" && !acc.html) {
      acc.html = decodeBase64(data, charsetOf(payload));
    } else if (payload.mimeType === "text/plain" && !acc.text) {
      acc.text = decodeBase64(data, charsetOf(payload));
    } else if (!acc.html && !acc.text && !payload.mimeType?.startsWith("multipart/")) {
      acc.text = decodeBase64(data, charsetOf(payload));
    }
  }
  if (Array.isArray(payload.parts)) payload.parts.forEach((p: any) => collectBodies(p, acc));
}


function extractAttachments(payload: any): { filename: string; mimeType: string; size: number; attachmentId: string }[] {
  const attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[] = [];
  function walk(p: any) {
    if (p?.filename && p?.body?.attachmentId) {
      attachments.push({ filename: p.filename, mimeType: p.mimeType || "application/octet-stream", size: p.body.size || 0, attachmentId: p.body.attachmentId });
    }
    if (p?.parts) p.parts.forEach(walk);
  }
  walk(payload);
  return attachments;
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

    const { messageId } = await req.json();
    if (!messageId) {
      return new Response(JSON.stringify({ error: "messageId required" }), { status: 400, headers: corsHeaders });
    }

    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: `/gmail/v1/users/me/messages/${messageId}?format=full`,
    });
    if (!res.ok) {
      const errBody = await res.text();
      return new Response(JSON.stringify({ error: errBody }), { status: res.status, headers: corsHeaders });
    }
    const msg = await res.json();
    const bodies = { html: "", text: "" };
    collectBodies(msg.payload, bodies);
    const body = bodies.html || bodies.text;
    const isHtml = !!bodies.html;

    const attachments = extractAttachments(msg.payload);

    return new Response(JSON.stringify({
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet,
      from: getHeader(msg.payload?.headers, "From"),
      to: getHeader(msg.payload?.headers, "To"),
      cc: getHeader(msg.payload?.headers, "Cc"),
      subject: getHeader(msg.payload?.headers, "Subject"),
      date: getHeader(msg.payload?.headers, "Date"),
      body,
      isHtml,
      attachments,
      unread: (msg.labelIds || []).includes("UNREAD"),
      starred: (msg.labelIds || []).includes("STARRED"),
      labelIds: msg.labelIds,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-message error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
