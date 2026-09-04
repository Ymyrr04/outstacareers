// Processes auto-reply rules: finds recent inbox messages matching enabled
// rules and sends a threaded reply. Each sender only gets one reply per rule.
// Called by pg_cron every 5 minutes (service-role bearer) or manually by an admin.
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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function subjectMatches(matchType: string, keyword: string, subject: string): boolean {
  const k = keyword.toLowerCase();
  const s = subject.toLowerCase();
  if (matchType === "equals") return s === k;
  if (matchType === "starts_with") return s.startsWith(k);
  return s.includes(k);
}

function parseSenderEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

// Display name from the From header, e.g. "John Doe <john@x.com>" -> "John Doe".
function parseSenderName(from: string): string {
  const m = from.match(/^\s*"?([^"<>]+?)"?\s*</);
  return (m ? m[1] : "").trim();
}

// Replaces merge tags like {first_name} in the reply body.
function applyMergeTags(body: string, fromHeader: string, senderEmail: string): string {
  const displayName = parseSenderName(fromHeader);
  const parts = displayName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  return body
    .replace(/\{\{\s*first_name\s*\}\}|\{first_name\}/gi, firstName)
    .replace(/\{\{\s*last_name\s*\}\}|\{last_name\}/gi, lastName)
    .replace(/\{\{\s*full_name\s*\}\}|\{full_name\}/gi, displayName)
    .replace(/\{\{\s*email\s*\}\}|\{email\}/gi, senderEmail);
}

const SKIP_SENDER_PATTERNS = [/^no-?reply@/, /mailer-daemon@/, /postmaster@/, /notifications?@/];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: service-role bearer (cron) or an admin user's JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const authedClient = createClient(supabaseUrl, anonKey);
      const { data: claimsData, error: claimsErr } = await authedClient.auth.getClaims(token);
      const userId = claimsData?.claims?.sub;
      if (claimsErr || !userId) return json({ error: "Unauthorized" }, 401);
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userId });
      if (!isAdmin) return json({ error: "Admins only" }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: rules, error: rulesErr } = await supabase
      .from("auto_reply_rules")
      .select("id, name, match_type, subject_keyword, body_html, delay_minutes, created_by")
      .eq("is_enabled", true);
    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) return json({ processed: 0, sent: 0 });

    // Group rules by mailbox owner (the admin whose Gmail connection is used).
    const rulesByUser = new Map<string, typeof rules>();
    for (const rule of rules) {
      const list = rulesByUser.get(rule.created_by) || [];
      list.push(rule);
      rulesByUser.set(rule.created_by, list);
    }

    // Window: messages that arrived between 35 and 5 minutes ago. The 5-minute
    // floor is the intentional reply delay; the overlap guards cron gaps.
    const nowSec = Math.floor(Date.now() / 1000);
    const afterSec = nowSec - 35 * 60;
    const beforeSec = nowSec - 5 * 60;

    let sent = 0;
    const errors: string[] = [];

    for (const [userId, userRules] of rulesByUser) {
      const connectionAPIKey = await getConnectionKeyForUser(userId, CONNECTOR_ID);
      if (!connectionAPIKey) {
        errors.push(`No Gmail connection for rule owner ${userId}`);
        continue;
      }

      // Own address, so we never reply to ourselves.
      let ownEmail = "";
      try {
        const profRes = await callAsAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId: CONNECTOR_ID,
          path: "/gmail/v1/users/me/profile",
        });
        if (profRes.ok) ownEmail = ((await profRes.json()).emailAddress || "").toLowerCase();
      } catch { /* best-effort */ }

      // List recent inbox messages in the processing window.
      const q = `in:inbox after:${afterSec} before:${beforeSec}`;
      const listRes = await callAsAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
        path: `/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(q)}&fields=messages(id,threadId)`,
      });
      if (!listRes.ok) {
        errors.push(`list failed [${listRes.status}]: ${await listRes.text()}`);
        continue;
      }
      const listData = await listRes.json();
      const messages: { id: string; threadId?: string }[] = listData.messages || [];
      if (messages.length === 0) continue;

      for (const msg of messages) {
        try {
          const metaRes = await callAsAppUser({
            gatewayBaseUrl: GATEWAY_BASE_URL,
            connectionAPIKey,
            connectorId: CONNECTOR_ID,
            path: `/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`,
          });
          if (!metaRes.ok) continue;
          const meta = await metaRes.json();
          const headers: { name: string; value: string }[] = meta?.payload?.headers || [];
          const getH = (n: string) =>
            headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || "";
          const subject = getH("Subject");
          const fromHeader = getH("From");
          const senderEmail = parseSenderEmail(fromHeader);
          if (!senderEmail) continue;
          if (ownEmail && senderEmail === ownEmail) continue;
          if (SKIP_SENDER_PATTERNS.some((p) => p.test(senderEmail))) continue;

          for (const rule of userRules) {
            if (!subjectMatches(rule.match_type, rule.subject_keyword, subject)) continue;

            // Once per sender per rule.
            const { data: existing } = await supabase
              .from("auto_reply_logs")
              .select("id")
              .eq("rule_id", rule.id)
              .eq("sender_email", senderEmail)
              .maybeSingle();
            if (existing) continue;

            const raw = createRawEmail({
              to: senderEmail,
              subject: `Re: ${subject || rule.subject_keyword}`,
              body: applyMergeTags(rule.body_html, fromHeader, senderEmail),
              inReplyTo: getH("Message-ID") || "",
            });
            const sendRes = await callAsAppUser({
              gatewayBaseUrl: GATEWAY_BASE_URL,
              connectionAPIKey,
              connectorId: CONNECTOR_ID,
              path: "/gmail/v1/users/me/messages/send",
              init: {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(msg.threadId ? { raw, threadId: msg.threadId } : { raw }),
              },
            });
            if (!sendRes.ok) {
              errors.push(`send failed for rule ${rule.name} [${sendRes.status}]: ${await sendRes.text()}`);
              continue;
            }

            const { error: logErr } = await supabase.from("auto_reply_logs").insert({
              rule_id: rule.id,
              sender_email: senderEmail,
              message_id: msg.id,
              thread_id: msg.threadId || null,
            });
            if (logErr && logErr.code !== "23505") errors.push(`log failed: ${logErr.message}`);
            sent++;
          }
        } catch (e) {
          errors.push(`message ${msg.id}: ${(e as Error).message}`);
        }
      }
    }

    return json({ processed: true, sent, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("process-auto-replies error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
