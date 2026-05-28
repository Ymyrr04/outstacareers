import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "OutSta2026!";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const decoded = decodeJwtPayload(token);
    const exp = decoded?.exp as number | undefined;
    const callerUserId = userData.user?.id || (decoded?.sub as string | undefined);

    if (exp && Date.now() / 1000 > exp) {
      return new Response(JSON.stringify({ error: "Admin session expired." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "Invalid admin session." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: callerUserId });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: { clientId?: string; email?: string } = await req.json().catch(() => ({}));
    if (!body.clientId) {
      return new Response(JSON.stringify({ error: "clientId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which emails to provision
    let targetEmails: string[] = [];
    if (body.email) {
      targetEmails = [body.email.trim().toLowerCase()];
    } else {
      const { data: contacts, error: cErr } = await admin
        .from("client_contacts")
        .select("email")
        .eq("client_id", body.clientId)
        .not("email", "is", null);
      if (cErr) throw cErr;
      targetEmails = (contacts || [])
        .map((c: any) => (c.email || "").trim().toLowerCase())
        .filter(Boolean);
    }

    if (targetEmails.length === 0) {
      return new Response(JSON.stringify({ error: "No contact emails found for this client." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Existing mappings for this client
    const { data: existing } = await admin
      .from("client_portal_users")
      .select("email")
      .eq("client_id", body.clientId);
    const existingEmails = new Set((existing || []).map((r: any) => (r.email || "").toLowerCase()));

    // Cache existing auth users
    const emailToUserId = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (lErr) throw lErr;
      for (const u of list.users) if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
      if (list.users.length < 1000) break;
      page += 1;
    }

    let created = 0, linked = 0, skipped = 0;
    const errors: string[] = [];

    for (const email of targetEmails) {
      if (existingEmails.has(email)) { skipped += 1; continue; }
      try {
        let userId = emailToUserId.get(email);
        if (!userId) {
          const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
            email, password: DEFAULT_PASSWORD, email_confirm: true,
            user_metadata: { client_portal: true, client_id: body.clientId },
          });
          if (createErr) throw createErr;
          userId = newUser.user!.id;
          created += 1;
        } else {
          const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: DEFAULT_PASSWORD });
          if (updErr) throw updErr;
          linked += 1;
        }

        const { error: insErr } = await admin.from("client_portal_users").insert({
          user_id: userId, client_id: body.clientId, email, must_change_password: true,
        });
        if (insErr) throw insErr;
      } catch (e: any) {
        errors.push(`${email}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true, created, linked, skipped, total: targetEmails.length, errors,
      defaultPassword: DEFAULT_PASSWORD,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("provision-client-accounts error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
