// Authed admin sends a countersign request email containing a /countersign/:token link.
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

interface Body {
  envelopeId: string;
  recipientName: string;
  recipientEmail: string;
  message?: string;
  placement: { page: number; x_pct: number; y_pct: number; w_pct: number; h_pct: number };
  expiresInDays?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const gmailUser = Deno.env.get("MARK_GMAIL_USER")!;
    const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD")!;

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

    const body: Body = await req.json();
    if (!body.envelopeId || !body.recipientEmail || !body.recipientName || !body.placement) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
    }

    const { data: env, error: envErr } = await admin
      .from("contract_envelopes")
      .select("id, status, signed_pdf_path, recipient_name")
      .eq("id", body.envelopeId)
      .single();
    if (envErr || !env) throw new Error("Envelope not found");
    if (env.status !== "signed" || !env.signed_pdf_path) throw new Error("Envelope is not signed yet");

    const token = generateToken();
    const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 14) * 86400000).toISOString();

    const { error: updErr } = await admin
      .from("contract_envelopes")
      .update({
        countersign_token: token,
        countersign_recipient_name: body.recipientName,
        countersign_recipient_email: body.recipientEmail,
        countersign_message: body.message ?? null,
        countersign_placement: body.placement,
        countersign_sent_at: new Date().toISOString(),
        countersign_expires_at: expiresAt,
      })
      .eq("id", body.envelopeId);
    if (updErr) throw updErr;

    await admin.from("contract_audit_events").insert({
      envelope_id: body.envelopeId,
      event_type: "countersign_sent",
      actor_email: userEmail,
      metadata: { recipient: body.recipientEmail },
    });

    const PUBLIC_APP_URL = "https://outstahub.com";
    const signUrl = `${PUBLIC_APP_URL}/countersign/${token}`;

    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (s: string) =>
      escape(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^\*])\*(?!\s)([^\*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/==(.+?)==/g, '<mark style="background:#fff176; padding:0 2px;">$1</mark>');

    const raw = body.message || `Please review and sign the contract signed by ${env.recipient_name}.`;
    const blocks = raw.replace(/\r\n/g, "\n").split(/\n\s*\n/);
    const renderedBlocks = blocks.map((block) => {
      const lines = block.split("\n").filter((l) => l.trim().length);
      const isList = lines.length > 0 && lines.every((l) => /^\s*-\s+/.test(l));
      if (isList) {
        const items = lines.map((l) => `<li style="margin:6px 0;">${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("");
        return `<ul style="padding-left:22px; margin:12px 0;">${items}</ul>`;
      }
      return `<p style="margin:12px 0;">${lines.map(inline).join("<br/>")}</p>`;
    }).join("");

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color:#1a1a1a; font-size:14px; line-height:1.6;">
        ${renderedBlocks}
        <p style="margin: 32px 0;">
          <a href="${signUrl}" style="background:#1a1a1a; color:#fff; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:600; display:inline-block;">
            Review &amp; Sign Document
          </a>
        </p>
        <p style="color:#666; font-size:13px;">This link expires on ${new Date(expiresAt).toLocaleDateString()}.</p>
        <p style="color:#666; font-size:13px;">If the button doesn't work, paste this link in your browser:<br/><a href="${signUrl}">${signUrl}</a></p>
        <hr style="border:none; border-top:1px solid #eee; margin: 32px 0;"/>
        <p style="color:#999; font-size:12px;">OutSta — Part of Zoomployee LLC</p>
      </div>
    `;

    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPassword } },
    });
    await client.send({
      from: `Mark Chua <${gmailUser}>`,
      to: body.recipientEmail,
      subject: `OutSta Agreement - ${env.recipient_name}`,
      html,
      replyTo: userEmail || gmailUser,
    });
    await client.close();

    return new Response(JSON.stringify({ success: true, signUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("send-countersign-request error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
