import { createClient } from "npm:@supabase/supabase-js@2";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = new TextDecoder().decode(decode(parts[1]));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const payload = decodeJwtPayload(token);

    if (!payload || !payload.sub) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exp = payload.exp as number;
    if (exp && Date.now() / 1000 > exp) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = payload.sub as string;

    // Check if requesting user is admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSuperAdmin = roleData.some((r) => r.role === "super_admin");

    // Get all admin/super_admin roles
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"]);

    if (rolesError) throw rolesError;

    const adminUserIds = new Set((adminRoles || []).map((r) => r.user_id));
    const roleMap = new Map((adminRoles || []).map((r) => [r.user_id, r.role]));

    // Get user details for admins
    const adminUsers = [];
    for (const role of adminRoles || []) {
      const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
      if (userData?.user) {
        adminUsers.push({
          user_id: role.user_id,
          email: userData.user.email || role.user_id.slice(0, 8) + "...",
          role: role.role,
        });
      }
    }

    // If super admin, also get pending users (users with auth accounts but no role)
    let pendingUsers: Array<{ user_id: string; email: string; created_at: string }> = [];
    if (isSuperAdmin) {
      const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 100 });
      if (allUsers?.users) {
        pendingUsers = allUsers.users
          .filter((u) => !adminUserIds.has(u.id))
          .map((u) => ({
            user_id: u.id,
            email: u.email || "unknown",
            created_at: u.created_at,
          }));
      }
    }

    return new Response(JSON.stringify({ adminUsers, pendingUsers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error fetching admin users:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
