import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({ envelopeId: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Missing backend configuration");

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { envelopeId } = parsed.data;
    if (envelopeId !== "ebad37e0-58f0-4ace-b0ea-5cca92bf82d8") {
      return new Response(JSON.stringify({ error: "Envelope not permitted" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(url, serviceKey);
    const { data: envelope, error: envelopeError } = await admin
      .from("contract_envelopes")
      .select("signed_pdf_path, contract_templates!inner(pdf_path)")
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
    const templatePath = (envelope.contract_templates as { pdf_path?: string } | null)?.pdf_path;
    if (!templatePath) throw new Error("Contract template not found");
    const { data: templateFile, error: templateError } = await admin.storage
      .from("contract-templates")
      .download(templatePath);
    if (templateError || !templateFile) throw new Error("Could not load contract template");
    const template = await PDFDocument.load(new Uint8Array(await templateFile.arrayBuffer()));
    const basePageCount = template.getPageCount();
    while (pdf.getPageCount() > basePageCount) pdf.removePage(pdf.getPageCount() - 1);
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