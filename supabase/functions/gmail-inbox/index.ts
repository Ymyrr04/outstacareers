// Lists Gmail messages and batch-fetches metadata for each in a single request.
// Uses Gmail multipart batch to avoid N round-trips.
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAsAppUser } from "../_shared/appUserConnector.ts";
import { getConnectionKeyForUser, deleteConnectionKeyForUser } from "../_shared/appUserConnections.ts";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_mail";
const BATCH_URL = "https://connector-gateway.lovable.dev/google_mail/batch/gmail/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MessageMeta {
  id: string;
  threadId?: string;
  snippet?: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  unread?: boolean;
  starred?: boolean;
  labelIds?: string[];
}

function parseMultipartBatch(body: string, boundary: string): { status: number; json: any }[] {
  const parts = body.split(`--${boundary}`).filter((p) => p.trim() && !p.trim().startsWith("--"));
  const results: { status: number; json: any }[] = [];
  for (const part of parts) {
    const lines = part.trim().split("\r\n");
    const httpLineIdx = lines.findIndex((l) => l.startsWith("Content-Type: application/http"));
    if (httpLineIdx === -1) continue;
    const statusLineIdx = httpLineIdx + 2;
    const statusLine = lines[statusLineIdx] || "";
    const statusMatch = statusLine.match(/^HTTP\/1\.\d\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 0;
    const bodyStartIdx = lines.findIndex((l, i) => i > statusLineIdx && l.trim() === "");
    const jsonText = lines.slice(bodyStartIdx + 1).join("\r\n").trim();
    let json: any = null;
    try { json = jsonText ? JSON.parse(jsonText) : null; } catch { json = null; }
    results.push({ status, json });
  }
  return results;
}

function getHeader(headers: any[], name: string): string {
  const h = headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
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

    const { maxResults = 20, q, labelIds, pageToken } = await req.json().catch(() => ({}));

    // Step 1: list message IDs
    const listParams = new URLSearchParams({ maxResults: String(maxResults) });
    if (q) listParams.set("q", q);
    if (labelIds) listParams.set("labelIds", labelIds);
    if (pageToken) listParams.set("pageToken", pageToken);

    const listRes = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path: `/gmail/v1/users/me/messages?${listParams.toString()}`,
    });
    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        await deleteConnectionKeyForUser(userId, CONNECTOR_ID);
        return new Response(JSON.stringify({ connected: false, error: "Connection expired" }), { status: 401, headers: corsHeaders });
      }
      const errBody = await listRes.text();
      return new Response(JSON.stringify({ error: errBody }), { status: listRes.status, headers: corsHeaders });
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];
    if (messages.length === 0) {
      return new Response(JSON.stringify({ messages: [], nextPageToken: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: batch fetch metadata
    const boundary = "batch_" + crypto.randomUUID().replace(/-/g, "");
    const parts = messages.map((m: any) =>
      `--${boundary}\r\nContent-Type: application/http\r\n\r\nGET /gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date\r\n`
    ).join("");
    const batchBody = parts + `--${boundary}--`;

    const batchRes = await fetch(BATCH_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "X-Connection-Api-Key": connectionAPIKey,
        "Content-Type": `multipart/mixed; boundary=${boundary}`,
      },
      body: batchBody,
    });

    const result: MessageMeta[] = [];
    if (batchRes.ok) {
      const batchText = await batchRes.text();
      const respContentType = batchRes.headers.get("Content-Type") || "";
      const bMatch = respContentType.match(/boundary=([^;]+)/);
      const respBoundary = bMatch ? bMatch[1].trim().replace(/"/g, "") : "";
      if (respBoundary) {
        const parsed = parseMultipartBatch(batchText, respBoundary);
        for (const p of parsed) {
          if (p.status === 200 && p.json) {
            result.push({
              id: p.json.id,
              threadId: p.json.threadId,
              snippet: p.json.snippet,
              from: getHeader(p.json.payload?.headers, "From"),
              to: getHeader(p.json.payload?.headers, "To"),
              subject: getHeader(p.json.payload?.headers, "Subject"),
              date: getHeader(p.json.payload?.headers, "Date"),
              unread: (p.json.labelIds || []).includes("UNREAD"),
              starred: (p.json.labelIds || []).includes("STARRED"),
              labelIds: p.json.labelIds,
            });
          }
        }
      }
    } else {
      // Fallback: fetch metadata individually (less efficient but resilient)
      for (const m of messages) {
        const metaRes = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId: CONNECTOR_ID,
          path: `/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          result.push({
            id: meta.id,
            threadId: meta.threadId,
            snippet: meta.snippet,
            from: getHeader(meta.payload?.headers, "From"),
            to: getHeader(meta.payload?.headers, "To"),
            subject: getHeader(meta.payload?.headers, "Subject"),
            date: getHeader(meta.payload?.headers, "Date"),
            unread: (meta.labelIds || []).includes("UNREAD"),
            starred: (meta.labelIds || []).includes("STARRED"),
            labelIds: meta.labelIds,
          });
        }
      }
    }

    return new Response(JSON.stringify({
      messages: result,
      nextPageToken: listData.nextPageToken || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-inbox error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
