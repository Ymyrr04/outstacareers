import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PASSWORD = "OutSta2026!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional payload: { contractorAssignmentId?: string }
    let body: { contractorAssignmentId?: string } = {};
    try { body = await req.json(); } catch { /* no body */ }

    // Fetch active contractors with email
    let query = admin
      .from("contractor_assignments")
      .select("id, applicant:applicants_prescreen(email, full_name)")
      .eq("status", "active");

    if (body.contractorAssignmentId) {
      query = query.eq("id", body.contractorAssignmentId);
    }

    const { data: contractors, error: cErr } = await query;
    if (cErr) throw cErr;

    // List existing portal users to skip
    const { data: existing } = await admin
      .from("contractor_portal_users")
      .select("contractor_assignment_id");
    const existingSet = new Set((existing || []).map((r: any) => r.contractor_assignment_id));

    // Pre-fetch all auth users (paginate)
    const emailToUserId = new Map<string, string>();
    let page = 1;
    while (true) {
      const { data: list, error: lErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (lErr) throw lErr;
      for (const u of list.users) {
        if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
      }
      if (list.users.length < 1000) break;
      page += 1;
    }

    let created = 0;
    let linked = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const c of contractors || []) {
      const applicant = c.applicant as { email?: string; full_name?: string } | null;
      const email = applicant?.email?.trim().toLowerCase();
      if (!email) { skipped += 1; continue; }
      if (existingSet.has(c.id)) { skipped += 1; continue; }

      try {
        let userId = emailToUserId.get(email);
        if (!userId) {
          const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
            email,
            password: DEFAULT_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: applicant?.full_name, contractor_portal: true },
          });
          if (createErr) throw createErr;
          userId = newUser.user!.id;
          created += 1;
        } else {
          linked += 1;
        }

        const { error: insErr } = await admin
          .from("contractor_portal_users")
          .insert({
            user_id: userId,
            contractor_assignment_id: c.id,
            email,
            must_change_password: true,
          });
        if (insErr) throw insErr;
      } catch (e: any) {
        errors.push(`${email}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created,
        linked,
        skipped,
        total: contractors?.length || 0,
        errors,
        defaultPassword: DEFAULT_PASSWORD,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
