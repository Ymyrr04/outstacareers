import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PROMPT = `You are a senior financial analyst at a staffing company writing a brief for leadership.
Using ONLY the figures in the JSON provided (never invent or recompute numbers beyond simple restatement), write a concise analysis of 3-5 sentences, plain text, no headings or bullet points.
Cover: the income and expense change and what drove it (contractor count vs hours per contractor vs rate), the markup per hour trend, and one practical takeaway. Use professional financial language (e.g. "volume-driven", "margin compression", "utilisation"). Format money like $4,884 and percentages to one decimal.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Same rule as the PL tab: any dashboard user unless PL was explicitly switched off for them
    const [{ data: isAdmin, error: adminErr }, { data: perm, error: permErr }] = await Promise.all([
      admin.rpc("is_admin", { _user_id: u.user.id }),
      admin.from("admin_tab_permissions").select("can_view").eq("user_id", u.user.id).eq("tab_id", "pl").maybeSingle(),
    ]);
    if (adminErr || permErr) return json({ error: "Could not verify access" }, 500);
    const plAllowed = perm ? perm.can_view === true : !!isAdmin;
    if (!plAllowed) return json({ error: "You don't have access to P&L" }, 403);

    const { facts, cacheOnly } = await req.json();
    if (!facts || typeof facts !== "object") return json({ error: "Missing data" }, 400);
    const factsStr = JSON.stringify(facts);
    const signature = await sha256(PROMPT + factsStr);

    const { data: hit } = await admin.from("pl_ai_summaries").select("summary").eq("signature", signature).maybeSingle();
    if (hit) return json({ summary: hit.summary, cached: true });
    if (cacheOnly) return json({ summary: null });

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "AI is not configured" }, 500);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: PROMPT,
        input: factsStr,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok || !res.body) {
      let msg = "AI request failed";
      try { const e = await res.json(); msg = e?.error?.message ?? e?.message ?? msg; } catch { /* ignore */ }
      if (res.status === 402) msg = "Out of AI credits. Add credits in Settings → Plans & credits.";
      if (res.status === 429) msg = "AI is busy right now — try again in a minute.";
      return json({ error: msg }, res.status);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", failed = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        const d = l.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const ev = JSON.parse(d);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "AI request failed";
        } catch { /* partial */ }
      }
    }
    text = text.trim();
    if (failed || !text) return json({ error: failed || "The AI returned no summary" }, 502);
    await admin.from("pl_ai_summaries").upsert({ signature, summary: text });
    return json({ summary: text, cached: false });
  } catch (e) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
