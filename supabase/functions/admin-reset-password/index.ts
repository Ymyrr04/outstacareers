import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };

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

async function linkPortalUser(supabase: any, contractorAssignmentId: string, userId: string, email: string) {
  const payload = { user_id: userId, contractor_assignment_id: contractorAssignmentId, email, must_change_password: true };
  const { data: updated, error: updateErr } = await supabase
    .from("contractor_portal_users")
    .update(payload)
    .eq("contractor_assignment_id", contractorAssignmentId)
    .select("id")
    .maybeSingle();
  if (updateErr) return updateErr;
  if (updated) return null;
  const { error: insertErr } = await supabase.from("contractor_portal_users").insert(payload);
  return insertErr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { email, password, contractorAssignmentId } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Missing email or password" }), { status: 400, headers: cors });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header was received. Please sign in as admin and try again." }), { status: 401, headers: cors });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const decoded = decodeJwtPayload(token);
    const exp = decoded?.exp as number | undefined;
    const callerUserId = userData.user?.id || (decoded?.sub as string | undefined);
    if (exp && Date.now() / 1000 > exp) {
      return new Response(JSON.stringify({ error: "Admin session expired. Please sign in again." }), { status: 401, headers: cors });
    }
    if (!callerUserId) {
      return new Response(JSON.stringify({ error: "Invalid admin session. Please sign in again." }), { status: 401, headers: cors });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _user_id: callerUserId });
    if (adminErr) {
      return new Response(JSON.stringify({ error: `Admin check failed: ${adminErr.message}` }), { status: 500, headers: cors });
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    }

    // Search all pages for the user by email
    const normalizedEmail = String(email).trim().toLowerCase();
    let foundUser: any = null;
    let page = 1;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("listUsers error:", error);
        return new Response(JSON.stringify({ error: `listUsers failed: ${error.message}` }), { status: 500, headers: cors });
      }
      foundUser = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
      if (foundUser) break;
      if (data.users.length < 1000) break;
      page += 1;
    }
    if (!foundUser) {
      if (!contractorAssignmentId) {
        console.error("User not found for email:", email);
        return new Response(JSON.stringify({ error: `No auth user found with email ${email}. The contractor may not have a portal account yet.` }), { status: 404, headers: cors });
      }
      const { data: contractor, error: contractorErr } = await supabase
        .from("contractor_assignments")
        .select("id, applicant:applicants_prescreen(email, full_name)")
        .eq("id", contractorAssignmentId)
        .single();
      if (contractorErr || !contractor) {
        return new Response(JSON.stringify({ error: `Contractor assignment not found: ${contractorErr?.message || contractorAssignmentId}` }), { status: 404, headers: cors });
      }
      const applicant = contractor.applicant as { email?: string; full_name?: string } | null;
      if (applicant?.email?.trim().toLowerCase() !== normalizedEmail) {
        return new Response(JSON.stringify({ error: "The selected contractor email does not match the portal account email." }), { status: 400, headers: cors });
      }
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: applicant?.full_name, contractor_portal: true },
      });
      if (createErr || !newUser.user) {
        return new Response(JSON.stringify({ error: `Create user failed: ${createErr?.message || "No user returned"}` }), { status: 500, headers: cors });
      }
      const portalErr = await linkPortalUser(supabase, contractorAssignmentId, newUser.user.id, normalizedEmail);
      if (portalErr) {
        await supabase.auth.admin.deleteUser(newUser.user.id).catch(() => {});
        return new Response(JSON.stringify({ error: `Portal link failed: ${portalErr.message}` }), { status: 500, headers: cors });
      }
      return new Response(JSON.stringify({ success: true, id: newUser.user.id, action: "created" }), { headers: cors });
    }

    const { error } = await supabase.auth.admin.updateUserById(foundUser.id, { password });
    if (error) {
      console.error("updateUserById error:", error);
      return new Response(JSON.stringify({ error: `Update failed: ${error.message}` }), { status: 500, headers: cors });
    }
    if (contractorAssignmentId) {
      const portalErr = await linkPortalUser(supabase, contractorAssignmentId, foundUser.id, normalizedEmail);
      if (portalErr) {
        return new Response(JSON.stringify({ error: `Portal link failed: ${portalErr.message}` }), { status: 500, headers: cors });
      }
    }

    return new Response(JSON.stringify({ success: true, id: foundUser.id, action: "updated" }), { headers: cors });
  } catch (e: any) {
    console.error("admin-reset-password fatal:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: cors });
  }
});
