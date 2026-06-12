import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Missing email or password" }), { status: 400, headers: cors });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Search all pages for the user by email
    let foundUser: any = null;
    let page = 1;
    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("listUsers error:", error);
        return new Response(JSON.stringify({ error: `listUsers failed: ${error.message}` }), { status: 500, headers: cors });
      }
      foundUser = data.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());
      if (foundUser) break;
      if (data.users.length < 1000) break;
      page += 1;
    }
    if (!foundUser) {
      console.error("User not found for email:", email);
      return new Response(JSON.stringify({ error: `No auth user found with email ${email}. The contractor may not have a portal account yet.` }), { status: 404, headers: cors });
    }

    const { error } = await supabase.auth.admin.updateUserById(foundUser.id, { password });
    if (error) {
      console.error("updateUserById error:", error);
      return new Response(JSON.stringify({ error: `Update failed: ${error.message}` }), { status: 500, headers: cors });
    }

    return new Response(JSON.stringify({ success: true, id: foundUser.id }), { headers: cors });
  } catch (e: any) {
    console.error("admin-reset-password fatal:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: cors });
  }
});
