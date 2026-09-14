import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { PDFDocument } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { envelope_id } = await req.json();
    const { data: env } = await admin
      .from("contract_envelopes")
      .select("id, signed_pdf_path")
      .eq("id", envelope_id)
      .maybeSingle();
    if (!env?.signed_pdf_path) throw new Error("No signed PDF");

    const { data: vals } = await admin
      .from("contract_envelope_field_values")
      .select("signature_data_url, template_field_id")
      .eq("envelope_id", envelope_id);

    const { data: file } = await admin.storage.from("contract-signed").download(env.signed_pdf_path);
    if (!file) throw new Error("download failed");
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));

    let appended = 0;
    for (const v of vals ?? []) {
      const url: string | null = v.signature_data_url;
      if (!url) continue;
      const m = url.match(/^data:(image\/(?:png|jpeg|jpg)|application\/pdf);base64,(.+)$/);
      if (!m) continue;
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      if (m[1] === "application/pdf") {
        const att = await PDFDocument.load(bytes);
        const copied = await doc.copyPages(att, att.getPageIndices());
        for (const p of copied) doc.addPage(p);
        appended++;
      }
    }
    if (!appended) return new Response(JSON.stringify({ appended: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const out = await doc.save();
    await admin.storage.from("contract-signed").upload(env.signed_pdf_path, out, { contentType: "application/pdf", upsert: true });
    return new Response(JSON.stringify({ appended, pages: doc.getPageCount() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
