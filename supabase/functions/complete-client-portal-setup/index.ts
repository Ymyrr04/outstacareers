// Save profile data from first-time account setup wizard.
// Called by the authenticated client portal user after setting their new password.
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getUserIdFromBearer(supabaseUrl: string, serviceKey: string, authHeader: string): Promise<string | null> {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: serviceKey,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string" ? user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = await getUserIdFromBearer(supabaseUrl, serviceKey, authHeader);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fullName: string = (body.full_name || "").trim();
    const newUsername: string = (body.username || "").trim().toLowerCase();
    const primaryEmail: string = (body.primary_email || "").trim().toLowerCase();
    const secondaryEmail: string = (body.secondary_email || "").trim().toLowerCase();
    const phone: string = (body.phone || "").trim();
    const companyName: string = (body.company_name || "").trim();

    if (!newUsername || !primaryEmail) {
      return new Response(JSON.stringify({ error: "username and primary_email are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!/^[a-z0-9._-]{3,40}$/.test(newUsername)) {
      return new Response(JSON.stringify({ error: "Username must be 3-40 chars, lowercase letters/numbers/._-" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(primaryEmail)) {
      return new Response(JSON.stringify({ error: "Invalid primary email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (secondaryEmail && !emailRe.test(secondaryEmail)) {
      return new Response(JSON.stringify({ error: "Invalid secondary email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Get current row
    const { data: current } = await admin
      .from("client_portal_users")
      .select("id, username, client_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!current) {
      return new Response(JSON.stringify({ error: "Portal user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If username changed, check uniqueness and update auth email
    if (newUsername !== (current.username || "").toLowerCase()) {
      const { data: clash } = await admin
        .from("client_portal_users")
        .select("id")
        .ilike("username", newUsername)
        .neq("id", current.id)
        .maybeSingle();
      if (clash) {
        return new Response(JSON.stringify({ error: "Username already taken" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newSynthetic = `${newUsername}@portal.outsta.local`;
      const { error: aErr } = await admin.auth.admin.updateUserById(userId, { email: newSynthetic });
      if (aErr) throw aErr;
    }

    const syntheticEmail = `${newUsername}@portal.outsta.local`;
    const { error: upErr } = await admin

      .from("client_portal_users")
      .update({
        full_name: fullName || null,
        username: newUsername,
        email: syntheticEmail,
        primary_email: primaryEmail,
        secondary_email: secondaryEmail || null,
        phone: phone || null,
        is_first_login: false,
        password_reset_required: false,
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (upErr) throw upErr;

    // Update client company name if changed
    if (companyName && current.client_id) {
      const { error: cErr } = await admin
        .from("clients")
        .update({ company_name: companyName, updated_at: new Date().toISOString() })
        .eq("id", current.client_id);
      if (cErr) throw cErr;
    }


    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("complete-client-portal-setup error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
