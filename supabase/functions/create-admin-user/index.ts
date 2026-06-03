import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  try {
    const { email, password } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      user = data.user!;
    } else {
      await supabase.auth.admin.updateUserById(user.id, { password });
    }
    await supabase.from("user_roles").upsert({ user_id: user.id, role: "admin" as any }, { onConflict: "user_id,role" });
    return new Response(JSON.stringify({ success: true, id: user.id }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }
});
