// Super-admin only: reports knowledge index status and queues existing rows for indexing.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SOURCE_TYPES = ["cv", "applicant_note", "additional_profile", "interview_answer", "hiring_comment", "calendar_comment"];
const SOURCES: Record<string, { table: string; filter?: (q: any) => any }> = {
  cv: { table: "applicants_prescreen", filter: (q) => q.not("cv_text", "is", null) },
  applicant_note: { table: "applicant_notes" },
  additional_profile: { table: "candidate_additional_profiles" },
  interview_answer: { table: "interview_answers", filter: (q) => q.not("text_answer", "is", null) },
  hiring_comment: { table: "hiring_request_comments" },
  calendar_comment: { table: "calendar_event_comments" },
};
const GROUPS: Record<string, string[]> = {
  cvs: ["cv"],
  notes: ["applicant_note", "additional_profile"],
  comments: ["hiring_comment", "calendar_comment", "interview_answer"],
};

async function countSource(sb: SupabaseClient, type: string) {
  const s = SOURCES[type];
  let q = sb.from(s.table).select("id", { count: "exact", head: true });
  if (s.filter) q = s.filter(q);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function allIds(sb: SupabaseClient, type: string) {
  const s = SOURCES[type];
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(s.table).select("id").order("id").range(from, from + 999);
    if (s.filter) q = s.filter(q);
    const { data, error } = await q;
    if (error) throw error;
    ids.push(...(data ?? []).map((r: any) => r.id));
    if (!data || data.length < 1000) break;
  }
  return ids;
}

async function pendingIds(sb: SupabaseClient, type: string) {
  const set = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("knowledge_dirty_queue").select("source_id")
      .eq("source_type", type).is("processed_at", null).order("id").range(from, from + 999);
    if (error) throw error;
    (data ?? []).forEach((r: any) => set.add(r.source_id));
    if (!data || data.length < 1000) break;
  }
  return set;
}

async function stats(sb: SupabaseClient) {
  const [pending, failed, last, ...chunkCounts] = await Promise.all([
    sb.from("knowledge_dirty_queue").select("id", { count: "exact", head: true }).is("processed_at", null),
    sb.from("knowledge_dirty_queue").select("id", { count: "exact", head: true }).not("error", "is", null).is("processed_at", null),
    sb.from("knowledge_dirty_queue").select("processed_at").not("processed_at", "is", null)
      .order("processed_at", { ascending: false }).limit(1),
    ...SOURCE_TYPES.map((t) => sb.from("knowledge_chunks").select("id", { count: "exact", head: true }).eq("source_type", t)),
  ]);
  for (const r of [pending, failed, last, ...chunkCounts]) if (r.error) throw r.error;
  return {
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
    last_processed_at: (last.data as any)?.[0]?.processed_at ?? null,
    chunks: Object.fromEntries(SOURCE_TYPES.map((t, i) => [t, chunkCounts[i].count ?? 0])),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: claims, error: cErr } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!)
      .auth.getClaims(auth.slice(7));
    const userId = claims?.claims?.sub;
    if (cErr || !userId) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isSuper, error: rErr } = await sb.rpc("is_super_admin", { _user_id: userId });
    if (rErr) throw rErr;
    if (!isSuper) return json({ error: "Super admins only" }, 403);

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const action = body?.action;

    if (action === "stats") return json(await stats(sb));

    const types = GROUPS[body?.group];
    if (!types) return json({ error: "Unknown group" }, 400);

    if (action === "count") {
      const counts = await Promise.all(types.map((t) => countSource(sb, t)));
      return json({ count: counts.reduce((a, b) => a + b, 0) });
    }

    if (action === "enqueue") {
      let queued = 0, alreadyPending = 0;
      for (const t of types) {
        const [ids, pending] = await Promise.all([allIds(sb, t), pendingIds(sb, t)]);
        const fresh = ids.filter((id) => !pending.has(id));
        alreadyPending += ids.length - fresh.length;
        for (let i = 0; i < fresh.length; i += 500) {
          const rows = fresh.slice(i, i + 500).map((id) => ({ source_type: t, source_id: id, action: "upsert" }));
          const { error } = await sb.from("knowledge_dirty_queue").insert(rows);
          if (error) {
            // A row was queued concurrently; fall back to one-by-one, ignoring duplicates.
            for (const r of rows) {
              const { error: e } = await sb.from("knowledge_dirty_queue").insert(r);
              if (!e) queued++; else if (e.code === "23505") alreadyPending++; else throw e;
            }
          } else queued += rows.length;
        }
      }
      return json({ queued, already_pending: alreadyPending });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("enqueue-knowledge-backfill error:", e);
    return json({ error: e instanceof Error ? e.message : String((e as any)?.message ?? e) }, 500);
  }
});
