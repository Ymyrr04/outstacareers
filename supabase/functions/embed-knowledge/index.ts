// Turns queued knowledge_dirty_queue rows into embedded knowledge_chunks.
// Internal job: requires x-internal-secret === KNOWLEDGE_JOB_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};
import { authorName } from "./authors.ts";

const EMBED_MODEL = "google/gemini-embedding-2";
const DIMENSIONS = 768;
const RUN_BUDGET_MS = 45_000;
const BATCH = 20;
const PARALLEL = 5;
const CHUNK_SIZE = 1200;
const OVERLAP = 150;
const MAX_EMBED_ITEMS = 50;

type QueueRow = { id: string; source_type: string; source_id: string; action: string };
type Loaded = {
  text: string;
  title: string;
  author: string;
  date: string | null;
  required_tab: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
} | null;

class HaltError extends Error {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const fmtDate = (d: string | null) => (d ? d.slice(0, 10) : "unknown date");

async function applicantName(sb: SupabaseClient, id: string | null) {
  if (!id) return "Unknown applicant";
  const { data } = await sb.from("applicants_prescreen").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name || "Unknown applicant";
}

async function load(sb: SupabaseClient, type: string, id: string): Promise<Loaded> {
  switch (type) {
    case "cv": {
      const { data, error } = await sb.from("applicants_prescreen")
        .select("id, full_name, cv_text, job_title, created_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        text: data.cv_text || "", title: `CV: ${data.full_name || "Applicant"}${data.job_title ? ` (${data.job_title})` : ""}`,
        author: data.full_name || "Applicant", date: data.created_at, required_tab: "applicants",
        entity_type: "applicant", entity_id: data.id, metadata: {},
      };
    }
    case "applicant_note": {
      const { data, error } = await sb.from("applicant_notes")
        .select("applicant_id, content, created_by, created_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        text: data.content || "", title: `Note on ${await applicantName(sb, data.applicant_id)}`,
        author: await authorName(sb, data.created_by), date: data.created_at, required_tab: "applicants",
        entity_type: "applicant", entity_id: data.applicant_id, metadata: {},
      };
    }
    case "additional_profile": {
      const { data, error } = await sb.from("candidate_additional_profiles")
        .select("applicant_id, title, content, created_by, created_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const body = [data.title, data.content].filter(Boolean).join("\n\n");
      return {
        text: data.content?.trim() ? body : "", title: `Profile "${data.title || "Untitled"}" for ${await applicantName(sb, data.applicant_id)}`,
        author: await authorName(sb, data.created_by), date: data.created_at, required_tab: "applicants",
        entity_type: "applicant", entity_id: data.applicant_id, metadata: {},
      };
    }
    case "interview_answer": {
      const { data, error } = await sb.from("interview_answers")
        .select("text_answer, answered_at, created_at, question_id, session_id").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [{ data: q }, { data: s }] = await Promise.all([
        sb.from("interview_questions").select("question_text").eq("id", data.question_id).maybeSingle(),
        sb.from("interview_sessions").select("applicant_id").eq("id", data.session_id).maybeSingle(),
      ]);
      const applicantId = s?.applicant_id ?? null;
      const name = await applicantName(sb, applicantId);
      const answer = data.text_answer || "";
      return {
        text: answer.trim() ? `Question: ${q?.question_text || ""}\n\nAnswer: ${answer}` : "",
        title: `Interview answer by ${name}`, author: name, date: data.answered_at || data.created_at,
        required_tab: "applicants", entity_type: "applicant", entity_id: applicantId, metadata: {},
      };
    }
    case "hiring_comment": {
      const { data, error } = await sb.from("hiring_request_comments")
        .select("request_id, user_id, content, created_at, linked_applicant_id").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: req } = await sb.from("client_hiring_requests").select("job_title").eq("id", data.request_id).maybeSingle();
      return {
        text: data.content || "", title: `Comment on hiring request: ${req?.job_title || "Untitled"}`,
        author: await authorName(sb, data.user_id), date: data.created_at, required_tab: "pipeline",
        entity_type: "hiring_request", entity_id: data.request_id,
        metadata: { linked_applicant_id: data.linked_applicant_id ?? null },
      };
    }
    case "calendar_comment": {
      const { data, error } = await sb.from("calendar_event_comments")
        .select("event_id, comment, commented_by, created_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: ev } = await sb.from("calendar_events").select("title").eq("id", data.event_id).maybeSingle();
      return {
        text: data.comment || "", title: `Comment on calendar event: ${ev?.title || "Untitled"}`,
        author: await authorName(sb, data.commented_by), date: data.created_at, required_tab: "calendar",
        entity_type: "calendar_event", entity_id: data.event_id, metadata: {},
      };
    }
    case "resource": {
      const { data, error } = await sb.from("rm_resources")
        .select("id, title, content_text, uploaded_by, created_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        text: data.content_text || "", title: `RM resource: ${data.title}`,
        author: await authorName(sb, data.uploaded_by), date: data.created_at, required_tab: "resources",
        entity_type: "resource", entity_id: data.id, metadata: {},
      };
    }
    default:
      throw new Error(`Unknown source_type ${type}`);
  }
}

const stripHtml = (s: string) =>
  s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

function chunkText(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  // Hard-split any paragraph that is too long on its own.
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= CHUNK_SIZE) { pieces.push(p); continue; }
    for (let i = 0; i < p.length; i += CHUNK_SIZE - OVERLAP) pieces.push(p.slice(i, i + CHUNK_SIZE));
  }
  const chunks: string[] = [];
  let cur = "";
  for (const piece of pieces) {
    if (cur && cur.length + 2 + piece.length > CHUNK_SIZE) {
      chunks.push(cur);
      const tail = cur.slice(-OVERLAP);
      const cut = tail.search(/\s/);
      cur = (cut >= 0 ? tail.slice(cut + 1) : tail) + "\n\n" + piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function embed(apiKey: string, inputs: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += MAX_EMBED_ITEMS) {
    const batch = inputs.slice(i, i + MAX_EMBED_ITEMS);
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: batch, dimensions: DIMENSIONS }),
      });
      if (res.ok || !(res.status === 429 || res.status >= 500) || attempt === 3) break;
      await res.body?.cancel();
      const ra = Number(res.headers.get("Retry-After"));
      await new Promise((r) => setTimeout(r, (ra > 0 ? ra * 1000 : 1000 * 2 ** attempt) + Math.random() * 500));
    }
    if (!res!.ok) {
      const msg = `Embeddings failed: ${res!.status} ${(await res!.text()).slice(0, 300)}`;
      if (res!.status === 402 || res!.status === 403 || res!.status === 401 || res!.status === 429) throw new HaltError(msg);
      throw new Error(msg);
    }
    const body = await res!.json() as { data: { index: number; embedding: number[] }[] };
    const ordered: number[][] = new Array(batch.length);
    for (const d of body.data) ordered[d.index] = d.embedding;
    for (const v of ordered) {
      if (!v || v.length !== DIMENSIONS) throw new Error("Invalid embedding response");
      out.push(v);
    }
  }
  return out;
}

async function processRow(sb: SupabaseClient, apiKey: string, row: QueueRow) {
  const del = () => sb.from("knowledge_chunks").delete().eq("source_type", row.source_type).eq("source_id", row.source_id);
  if (row.action === "delete") {
    const { error } = await del(); if (error) throw error; return;
  }
  if (row.action !== "upsert") throw new Error(`Unknown action ${row.action}`);

  const src = await load(sb, row.source_type, row.source_id);
  const text = src ? stripHtml(src.text) : "";
  if (!src || !text) { const { error } = await del(); if (error) throw error; return; }

  const header = `${src.title} · ${src.author} · ${fmtDate(src.date)}`;
  const hash = await sha256(`${header}\n${text}`);
  const { data: existing, error: exErr } = await sb.from("knowledge_chunks").select("source_hash")
    .eq("source_type", row.source_type).eq("source_id", row.source_id).limit(1);
  if (exErr) throw exErr;
  if (existing?.[0]?.source_hash === hash) return;

  const chunks = chunkText(text).map((c) => `${header}\n\n${c}`);
  const vectors = await embed(apiKey, chunks);

  { const { error } = await del(); if (error) throw error; }
  const rows = chunks.map((content, i) => ({
    source_type: row.source_type, source_id: row.source_id, required_tab: src.required_tab,
    entity_type: src.entity_type, entity_id: src.entity_id, title: src.title, content,
    metadata: { author_name: src.author, written_at: src.date, ...src.metadata },
    chunk_index: i, embedding: JSON.stringify(vectors[i]), source_hash: hash,
  }));
  const { error } = await sb.from("knowledge_chunks").insert(rows);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-internal-secret");
  const secrets = [Deno.env.get("KNOWLEDGE_JOB_SECRET"), Deno.env.get("KNOWLEDGE_CRON_SECRET")].filter(Boolean);
  if (!provided || !secrets.includes(provided)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Single-flight lease; a paused job (credits/policy) processes one probe item per run
  const { data: lock, error: lockErr } = await sb.rpc("claim_knowledge_job_lock", { _seconds: 90 });
  if (lockErr) return json({ error: lockErr.message }, 500);
  if (!lock?.length) return json({ skipped: "another run is in progress" });
  const pausedReason = (lock[0] as any).paused_reason as string | null;
  const release = (patch: Record<string, unknown> = {}) =>
    sb.from("knowledge_job_state").update({ locked_until: null, ...patch }).eq("id", true);

  const started = Date.now();
  let processed = 0, failed = 0;
  let halted: string | null = null;
  const tried = new Set<string>(); // failed rows stay unprocessed; don't retry within this run

  while (Date.now() - started < RUN_BUDGET_MS && !halted) {
    let q = sb.from("knowledge_dirty_queue").select("id, source_type, source_id, action")
      .is("processed_at", null).is("error", null).order("created_at", { ascending: true }).limit(pausedReason ? 1 : BATCH);
    if (tried.size) q = q.not("id", "in", `(${[...tried].join(",")})`);
    const { data: batch, error } = await q;
    if (error) return json({ error: error.message, processed, failed }, 500);
    if (!batch?.length) { await sb.rpc("disarm_knowledge_job"); break; }

    for (let i = 0; i < batch.length && !halted; i += PARALLEL) {
      if (Date.now() - started >= RUN_BUDGET_MS) break;
      const slice = batch.slice(i, i + PARALLEL) as QueueRow[];
      await Promise.all(slice.map(async (row) => {
        tried.add(row.id);
        try {
          await processRow(sb, apiKey, row);
          await sb.from("knowledge_dirty_queue").update({ processed_at: new Date().toISOString(), error: null }).eq("id", row.id);
          processed++;
          if (pausedReason) halted = "probe ok";
        } catch (e) {
          const msg = e instanceof Error ? e.message : String((e as any)?.message ?? e);
          if (e instanceof HaltError) halted = msg;
          if (pausedReason) halted = halted ?? msg;
          // Credit/rate halts leave the row untouched so it's retried later
          if (!(e instanceof HaltError)) await sb.from("knowledge_dirty_queue").update({ error: msg.slice(0, 1000) }).eq("id", row.id);
          failed++;
        }
      }));
    }
  }

  // Persist pause on credit/policy blocks; clear it after a successful probe
  const blocked = !!halted && /Embeddings failed: (401|402|403)/.test(halted);
  if (blocked) await release({ paused_reason: halted!.slice(0, 500), paused_at: new Date().toISOString() });
  else if (pausedReason && processed > 0) await release({ paused_reason: null, paused_at: null });
  else await release();
  const ok = !halted || halted === "probe ok";
  return json({ processed, failed, halted: ok ? null : halted, paused: blocked, elapsed_ms: Date.now() - started }, ok ? 200 : 503);
});
