// Forgot password for contractor portal users.
// Public endpoint - always returns a generic success message regardless of
// whether the email matched, to avoid leaking account existence.
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok = (msg: string) =>
  new Response(JSON.stringify({ success: true, message: msg }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sendMail(to: string, subject: string, html: string) {
  const user = Deno.env.get("GMAIL_USER")!;
  const pass = Deno.env.get("GMAIL_APP_PASSWORD")!;
  const client = new SMTPClient({
    connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } },
  });
  await client.send({
    from: `OutSta PL Portal <${user}>`,
    to,
    subject,
    content: "auto",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.6;padding:20px;">${html}</body></html>`,
  });
  await client.close();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const genericMsg = "If that account exists, a reset link has been sent to your email.";
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const email: string = (body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find contractor portal user by email (stored on contractor_portal_users or applicant_prescreen).
    // contractor_portal_users links by user_id to auth.users; look up auth user by email first.
    let page = 1;
    let foundUserId: string | null = null;
    while (true) {
      const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      const match = list.users.find((u) => u.email?.toLowerCase() === email);
      if (match) { foundUserId = match.id; break; }
      if (list.users.length < 1000) break;
      page += 1;
    }
    if (!foundUserId) return ok(genericMsg);

    const { data: portalRow } = await admin
      .from("contractor_portal_users")
      .select("id")
      .eq("user_id", foundUserId)
      .maybeSingle();
    if (!portalRow) return ok(genericMsg);

    const origin = req.headers.get("origin") || "https://outstahub.com";
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${origin}/portal/reset-password` },
    });
    if (linkErr) {
      console.error("generateLink error:", linkErr);
      return ok(genericMsg);
    }
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) return ok(genericMsg);

    await sendMail(
      email,
      "Reset your OutSta PL Portal password",
      `<p>Hello,</p>
       <p>We received a request to reset the password for your OutSta contractor portal account.</p>
       <p><a href="${actionLink}" style="display:inline-block;background:#1f6a85;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
       <p style="font-size:12px;color:#666;">Or paste this link in your browser:<br/><span style="word-break:break-all;">${actionLink}</span></p>
       <p>This link expires in 1 hour.</p>
       <p style="color:#888;font-size:12px;margin-top:24px;">If you did not request this, you can safely ignore this email.</p>`,
    );
    return ok(genericMsg);
  } catch (e: any) {
    console.error("contractor-portal-recovery error:", e);
    return ok(genericMsg);
  }
});
