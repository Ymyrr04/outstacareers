import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({ envelopeId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) throw new Error("Missing backend configuration");

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(url, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { envelopeId } = parsed.data;
    const { data: envelope, error: envelopeError } = await admin
      .from("contract_envelopes")
      .select("signed_pdf_path")
      .eq("id", envelopeId)
      .single();
    if (envelopeError || !envelope?.signed_pdf_path) throw new Error("Signed contract not found");

    const { data: signedFile, error: downloadError } = await admin.storage
      .from("contract-signed")
      .download(envelope.signed_pdf_path);
    if (downloadError || !signedFile) throw new Error("Could not load signed contract");

    const { data: values, error: valuesError } = await admin
      .from("contract_envelope_field_values")
      .select("signature_data_url, contract_template_fields!inner(field_type)")
      .eq("envelope_id", envelopeId)
      .eq("contract_template_fields.field_type", "attachment");
    if (valuesError) throw valuesError;

    const pdf = await PDFDocument.load(new Uint8Array(await signedFile.arrayBuffer()));
    let appended = 0;
    for (const value of values ?? []) {
      const match = value.signature_data_url?.match(/^data:application\/pdf;base64,(.+)$/);
      if (!match) continue;
      const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
      const attachment = await PDFDocument.load(bytes);
      const pages = await pdf.copyPages(attachment, attachment.getPageIndices());
      for (const page of pages) pdf.addPage(page);
      appended += pages.length;
    }
    if (!appended) throw new Error("No PDF attachment found");

    const output = await pdf.save();
    const newPath = `${envelopeId}/signed-repaired-${Date.now()}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("contract-signed")
      .upload(newPath, output, { contentType: "application/pdf", cacheControl: "0", upsert: false });
    if (uploadError) throw uploadError;

    const { error: updateError } = await admin
      .from("contract_envelopes")
      .update({ signed_pdf_path: newPath })
      .eq("id", envelopeId);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, appended, pages: pdf.getPageCount() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Repair failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});