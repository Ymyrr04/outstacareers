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

interface SendEnvelopeRequest {
  templateId: string;
  recipientName: string;
  recipientEmail: string;
  applicantId?: string | null;
  contractorAssignmentId?: string | null;
  adminPrefill?: Record<string, string>;
  message?: string;
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

    // Auth check (signing-keys compatible)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const authedClient = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await authedClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("Auth failed:", claimsErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email as string | undefined;

    const admin = createClient(supabaseUrl, serviceKey);


    const body: SendEnvelopeRequest = await req.json();

    if (!body.templateId || !body.recipientEmail || !body.recipientName) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 14) * 86400000).toISOString();

    const { data: envelope, error: envErr } = await admin
      .from("contract_envelopes")
      .insert({
        template_id: body.templateId,
        recipient_name: body.recipientName,
        recipient_email: body.recipientEmail,
        applicant_id: body.applicantId ?? null,
        contractor_assignment_id: body.contractorAssignmentId ?? null,
        admin_prefill: body.adminPrefill ?? {},
        message: body.message ?? null,
        signing_token: token,
        expires_at: expiresAt,
        status: "sent",
        sent_at: new Date().toISOString(),
        sender_user_id: userId,
        sender_email: userEmail,
      })
      .select()
      .single();

    if (envErr) throw envErr;

    await admin.from("contract_audit_events").insert({
      envelope_id: envelope.id,
      event_type: "sent",
      actor_email: userEmail,
      metadata: { recipient: body.recipientEmail },
    });

    // Build signing URL using request origin
    const origin = req.headers.get("origin") || `https://${req.headers.get("host")}`;
    const signUrl = `${origin}/sign/${token}`;

    // Send email via Gmail
    const client = new SMTPClient({
      connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPassword } },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">You have a document to sign</h2>
        <p>Hi ${body.recipientName},</p>
        <p>${body.message || "Please review and sign the attached contract."}</p>
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

    await client.send({
      from: `OutSta Contracts <${gmailUser}>`,
      to: body.recipientEmail,
      subject: "Action required: Please sign your contract",
      html,
      replyTo: userEmail || gmailUser,
    });
    await client.close();

    return new Response(JSON.stringify({ success: true, envelopeId: envelope.id, signUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e) {
    console.error("send-contract-envelope error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
