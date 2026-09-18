// Sends a reminder email for an EXISTING contract envelope, reusing the same signing link.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENDER_CREDENTIALS: Record<string, { userEnv: string; passEnv: string; displayName: string }> = {
  "mark@outsta.io": { userEnv: "MARK_GMAIL_USER", passEnv: "MARK_GMAIL_APP_PASSWORD", displayName: "Mark Chua" },
  "liezl@outsta.io": { userEnv: "LIEZL_GMAIL_USER", passEnv: "LIEZL_GMAIL_APP_PASSWORD", displayName: "Liezl" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    const userEmail = claimsData.claims.email as string | undefined;

    const admin = createClient(supabaseUrl, serviceKey);
    const { envelopeId, note } = await req.json();
    if (!envelopeId) {
      return new Response(JSON.stringify({ error: "Missing envelopeId" }), { status: 400, headers: corsHeaders });
    }

    const { data: env, error: envErr } = await admin
      .from("contract_envelopes")
      .select("id, recipient_name, recipient_email, signing_token, expires_at, status, signed_at, sender_email")
      .eq("id", envelopeId)
      .maybeSingle();
    if (envErr) throw envErr;
    if (!env) return new Response(JSON.stringify({ error: "Contract not found" }), { status: 404, headers: corsHeaders });
    if (env.signed_at || env.status === "signed") {
      return new Response(JSON.stringify({ error: "This contract is already signed." }), { status: 400, headers: corsHeaders });
    }
    if (env.status === "voided") {
      return new Response(JSON.stringify({ error: "This contract was voided." }), { status: 400, headers: corsHeaders });
    }

    const requestedSender = (env.sender_email || "mark@outsta.io").toLowerCase();
    const senderConfig = SENDER_CREDENTIALS[requestedSender] ?? SENDER_CREDENTIALS["mark@outsta.io"];
    const gmailUser = Deno.env.get(senderConfig.userEnv) || Deno.env.get("MARK_GMAIL_USER")!;
    const gmailPassword = Deno.env.get(senderConfig.passEnv) || Deno.env.get("MARK_GMAIL_APP_PASSWORD")!;
    const senderDisplayName = (Deno.env.get(senderConfig.userEnv) && Deno.env.get(senderConfig.passEnv))
      ? senderConfig.displayName
      : SENDER_CREDENTIALS["mark@outsta.io"].displayName;

    const signUrl = `https://outstahub.com/sign/${env.signing_token}`;
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const extra = note && String(note).trim()
      ? `<p style="margin:12px 0;">${escape(String(note)).replace(/\n/g, "<br/>")}</p>`
      : "";

    const expiresLabel = env.expires_at
      ? new Date(env.expires_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/New_York" })
      : null;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color:#1a1a1a; font-size:14px; line-height:1.6;">
        <p style="margin:12px 0;">Hi ${escape(env.recipient_name)},</p>
        <p style="margin:12px 0;">Just a friendly reminder that your OutSta agreement is still waiting for your signature. This is the same document we sent earlier — no need to start over, simply continue where you left off.</p>
        ${extra}
        <p style="margin: 32px 0;">
          <a href="${signUrl}" style="background:#1a1a1a; color:#fff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:600; display:inline-block;">
            Review &amp; Sign Document
          </a>
        </p>
        ${expiresLabel ? `<p style="color:#666; font-size:13px;">This link expires on ${expiresLabel}.</p>` : ""}
        <p style="color:#666; font-size:13px;">If the button doesn't work, paste this link in your browser:<br/><a href="${signUrl}">${signUrl}</a></p>
        <hr style="border:none; border-top:1px solid #eee; margin: 32px 0;"/>
        <p style="color:#999; font-size:12px;">OutSta — Part of Zoomployee LLC</p>
      </div>
    `;

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPassword } },
    });
    await client.send({
      from: `${senderDisplayName} <${gmailUser}>`,
      to: env.recipient_email,
      subject: `Reminder: OutSta Agreement - ${env.recipient_name}`,
      html,
      replyTo: userEmail || gmailUser,
    });
    await client.close();

    await admin.from("contract_audit_events").insert({
      envelope_id: env.id,
      event_type: "reminder_sent",
      actor_email: userEmail,
      metadata: { recipient: env.recipient_email },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("send-contract-reminder error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
