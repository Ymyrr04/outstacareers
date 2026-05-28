import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USERNAME_DOMAIN = "portal.outsta.local";

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
    const callerUserId = userData.user?.id || (decoded?.sub as string | undefined);
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

    type Action = "create" | "reset_password" | "delete";
    const body: {
      action?: Action;
      clientId?: string;
      username?: string;
      password?: string;
      portalUserId?: string;
    } = await req.json().catch(() => ({}));

    const action: Action = body.action || "create";

    // ---------- RESET PASSWORD ----------
    if (action === "reset_password") {
      if (!body.portalUserId || !body.password) {
        return new Response(JSON.stringify({ error: "portalUserId and password are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (body.password.length < 6) {
        return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row, error: rErr } = await admin
        .from("client_portal_users")
        .select("user_id")
        .eq("id", body.portalUserId)
        .maybeSingle();
      if (rErr || !row) {
        return new Response(JSON.stringify({ error: "Portal user not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, { password: body.password });
      if (updErr) throw updErr;
      await admin.from("client_portal_users")
        .update({ must_change_password: true, updated_at: new Date().toISOString() })
        .eq("id", body.portalUserId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- DELETE ----------
    if (action === "delete") {
      if (!body.portalUserId) {
        return new Response(JSON.stringify({ error: "portalUserId is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: row } = await admin
        .from("client_portal_users")
        .select("user_id")
        .eq("id", body.portalUserId)
        .maybeSingle();
      await admin.from("client_portal_users").delete().eq("id", body.portalUserId);
      if (row?.user_id) {
        await admin.auth.admin.deleteUser(row.user_id).catch(() => {});
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- CREATE ----------
    if (!body.clientId || !body.username || !body.password) {
      return new Response(JSON.stringify({ error: "clientId, username, and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const username = body.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return new Response(JSON.stringify({ error: "Username must be 3-40 chars, lowercase letters/numbers/._- only" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check username unique
    const { data: existing } = await admin
      .from("client_portal_users")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Username already taken" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const syntheticEmail = `${username}@${USERNAME_DOMAIN}`;
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email: syntheticEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: { client_portal: true, client_id: body.clientId, username },
    });
    if (createErr) throw createErr;

    const { error: insErr } = await admin.from("client_portal_users").insert({
      user_id: newUser.user!.id,
      client_id: body.clientId,
      email: syntheticEmail,
      username,
      must_change_password: true,
    });
    if (insErr) {
      await admin.auth.admin.deleteUser(newUser.user!.id).catch(() => {});
      throw insErr;
    }

    return new Response(JSON.stringify({ success: true, username, userId: newUser.user!.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("create-client-portal-account error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
