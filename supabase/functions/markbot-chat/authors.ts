// Mirrors src/lib/adminDisplayNames.ts (getAdminDisplayName) — the source the comment UIs use.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const EMAIL_TO_NAME: Record<string, string> = {
  "czarina@outsta.io": "Czarina",
  "kristine@outsta.io": "Kristine",
  "eduardo@outsta.io": "Eduardo",
  "mark@outsta.io": "Mark",
  "liezl@outsta.io": "Liezl",
  "jil@outsta.io": "Jil",
  "yes@outsta.io": "Yes",
  "adam@outsta.io": "Adam",
  "sean@outsta.io": "Sean",
  "christian@outsta.io": "Christian",
  "jacob@outsta.io": "Jacob",
  "michael@outsta.io": "Michael",
};

const cache = new Map<string, string>();

export async function authorName(sb: SupabaseClient, userId: string | null): Promise<string> {
  if (!userId) return "Unknown";
  if (cache.has(userId)) return cache.get(userId)!;
  let name = "Admin";
  try {
    const { data } = await sb.auth.admin.getUserById(userId);
    const email = data?.user?.email?.toLowerCase();
    if (email) name = EMAIL_TO_NAME[email] || email.split("@")[0];
  } catch { /* keep fallback */ }
  cache.set(userId, name);
  return name;
}

/** Resolve an assignee name (e.g. "Kristine") to admin user ids, using the same display names. */
export async function adminIdsByName(sb: SupabaseClient, name: string): Promise<string[]> {
  const q = name.trim().toLowerCase();
  const { data: roles } = await sb.from("user_roles").select("user_id").in("role", ["admin", "super_admin"]);
  const ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
  const out: string[] = [];
  for (const id of ids) {
    const n = (await authorName(sb, id)).toLowerCase();
    if (n.includes(q)) out.push(id);
  }
  return out;
}
