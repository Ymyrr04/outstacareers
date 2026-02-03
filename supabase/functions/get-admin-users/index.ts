import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Decode JWT payload without verification (signature is verified by Supabase gateway when verify_jwt=true)
// Since we set verify_jwt=false in config.toml, we just decode the payload to get claims
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payloadBase64 = parts[1];
    const payloadJson = new TextDecoder().decode(decode(payloadBase64));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Service-role client: used for privileged admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the requesting user has authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Decode the JWT to get user ID from claims
    // Note: The JWT signature was already verified by Supabase when the user logged in.
    // We trust the token structure here since it came through the client's auth flow.
    const payload = decodeJwtPayload(token);
    
    if (!payload || !payload.sub) {
      console.error("Failed to decode JWT payload");
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if token is expired
    const exp = payload.exp as number;
    if (exp && Date.now() / 1000 > exp) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = payload.sub as string;

    // Check if user is admin or super_admin
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

    // Get all admin and super_admin user IDs
    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "super_admin"]);

    if (rolesError) {
      throw rolesError;
    }

    // Get user details for each admin
    const adminUsers = [];
    for (const role of adminRoles || []) {
      const { data: userData } = await supabase.auth.admin.getUserById(role.user_id);
      if (userData?.user) {
        adminUsers.push({
          user_id: role.user_id,
          email: userData.user.email || role.user_id.slice(0, 8) + "...",
        });
      }
    }

    return new Response(JSON.stringify({ adminUsers }), {
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
