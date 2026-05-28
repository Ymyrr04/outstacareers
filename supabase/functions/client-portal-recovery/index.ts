// Forgot username / forgot password recovery for client portal users.
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
    from: `OutStaWorkforce <${user}>`,
    to,
    subject,
    content: "auto",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.6;padding:20px;">${html}</body></html>`,
  });
  await client.close();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action: "forgot_username" | "forgot_password" = body.action;
    const identifier: string = (body.identifier || "").trim().toLowerCase();

    if (!identifier) {
      return new Response(JSON.stringify({ error: "identifier required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For forgot_username: lookup by primary_email OR secondary_email only.
    // For forgot_password: also allow username lookup.
    let query = admin.from("client_portal_users").select("id, user_id, username, primary_email, secondary_email, full_name");

    if (action === "forgot_password" && !identifier.includes("@")) {
      query = query.ilike("username", identifier);
    } else {
      query = query.or(`primary_email.ilike."${identifier}",secondary_email.ilike."${identifier}"`);
    }

    const { data: rows } = await query.limit(1);
    const row = rows?.[0];

    // Always return same generic response
    const genericMsg =
      action === "forgot_username"
        ? "If that email is associated with an account, your username has been sent."
        : "If that account exists, a reset link has been sent to your email.";

    if (!row) return ok(genericMsg);

    // Determine recipient email: prefer the email that matched.
    let recipient: string | null = null;
    if (identifier.includes("@")) {
      if (row.primary_email?.toLowerCase() === identifier) recipient = row.primary_email;
      else if (row.secondary_email?.toLowerCase() === identifier) recipient = row.secondary_email;
    } else {
      recipient = row.primary_email || row.secondary_email;
    }
    if (!recipient) return ok(genericMsg);

    const greeting = row.full_name ? `Hi ${row.full_name},` : "Hello,";

    if (action === "forgot_username") {
      await sendMail(
        recipient,
        "Your OutStaWorkforce username",
        `<p>${greeting}</p>
         <p>Your client portal username is:</p>
         <p style="font-size:18px;font-weight:bold;background:#f4f4f5;padding:10px 14px;border-radius:6px;display:inline-block;">${row.username}</p>
         <p>You can sign in at <a href="https://outstaworkforce.com/client-portal/login">outstaworkforce.com/client-portal/login</a>.</p>
         <p style="color:#888;font-size:12px;margin-top:24px;">If you did not request this, you can safely ignore this email.</p>`,
      );
      return ok(genericMsg);
    }

    if (action === "forgot_password") {
      // Generate a recovery link for the synthetic auth email
      const syntheticEmail = `${row.username}@portal.outsta.local`;
      const origin = req.headers.get("origin") || "https://outstaworkforce.com";
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: syntheticEmail,
        options: { redirectTo: `${origin}/client-portal/reset-password` },
      });
      if (linkErr) {
        console.error("generateLink error:", linkErr);
        return ok(genericMsg);
      }
      const actionLink = linkData.properties?.action_link;
      if (!actionLink) return ok(genericMsg);

      await sendMail(
        recipient,
        "Reset your OutStaWorkforce password",
        `<p>${greeting}</p>
         <p>We received a request to reset the password for your client portal account (<strong>${row.username}</strong>).</p>
         <p><a href="${actionLink}" style="display:inline-block;background:#1f6a85;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset password</a></p>
         <p style="font-size:12px;color:#666;">Or paste this link in your browser:<br/><span style="word-break:break-all;">${actionLink}</span></p>
         <p>This link expires in 1 hour.</p>
         <p style="color:#888;font-size:12px;margin-top:24px;">If you did not request this, you can safely ignore this email.</p>`,
      );
      return ok(genericMsg);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("client-portal-recovery error:", e);
    // Still return generic message to avoid leaking info
    return ok("If that account exists, an email has been sent.");
  }
});
