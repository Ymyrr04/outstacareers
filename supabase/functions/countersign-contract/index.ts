// Public countersign endpoint.
// GET ?token=...   -> { envelope, signed_pdf_url, placement, message }
// POST { token, signature_data_url } -> embeds signature into signed PDF and saves it.
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: corsHeaders });

      const { data: env } = await admin
        .from("contract_envelopes")
        .select("id, status, signed_pdf_path, countersigned_at, countersign_expires_at, countersign_recipient_name, countersign_recipient_email, countersign_message, countersign_placement, recipient_name")
        .eq("countersign_token", token)
        .maybeSingle();
      if (!env) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
      if (env.countersign_expires_at && new Date(env.countersign_expires_at) < new Date() && !env.countersigned_at) {
        return new Response(JSON.stringify({ error: "expired" }), { status: 410, headers: corsHeaders });
      }
      if (!env.signed_pdf_path) return new Response(JSON.stringify({ error: "No signed PDF" }), { status: 400, headers: corsHeaders });

      const { data: signed } = await admin.storage.from("contract-signed").createSignedUrl(env.signed_pdf_path, 3600);

      // Refresh viewed timestamp on every open (unless already countersigned)
      if (!env.countersigned_at) {
        await admin
          .from("contract_envelopes")
          .update({ countersign_viewed_at: new Date().toISOString() })
          .eq("id", env.id);
      }

      // Lookup saved signature
      let saved_signature: string | null = null;
      if (env.countersign_recipient_email) {
        const { data: sig } = await admin
          .from("saved_signatures")
          .select("signature_data_url")
          .eq("recipient_email", env.countersign_recipient_email.toLowerCase())
          .maybeSingle();
        saved_signature = sig?.signature_data_url ?? null;
      }

      return new Response(JSON.stringify({
        envelope: {
          id: env.id,
          status: env.status,
          recipient_name: env.recipient_name,
          countersign_recipient_name: env.countersign_recipient_name,
          countersign_recipient_email: env.countersign_recipient_email,
          countersign_message: env.countersign_message,
          countersigned_at: env.countersigned_at,
        },
        placement: env.countersign_placement,
        pdf_url: signed?.signedUrl,
        saved_signature,
      }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (req.method === "POST") {
      const { token, signature_data_url } = await req.json();
      if (!token || !signature_data_url) {
        return new Response(JSON.stringify({ error: "Missing token or signature" }), { status: 400, headers: corsHeaders });
      }

      const { data: env } = await admin
        .from("contract_envelopes")
        .select("id, signed_pdf_path, countersign_placement, countersign_expires_at, countersigned_at, countersign_recipient_email, countersign_recipient_name, recipient_email, recipient_name")
        .eq("countersign_token", token)
        .maybeSingle();
      if (!env) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
      if (env.countersigned_at) return new Response(JSON.stringify({ error: "Already countersigned" }), { status: 409, headers: corsHeaders });
      if (env.countersign_expires_at && new Date(env.countersign_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "expired" }), { status: 410, headers: corsHeaders });
      }
      const placement = env.countersign_placement as { page: number; x_pct: number; y_pct: number; w_pct: number; h_pct: number };
      if (!placement) return new Response(JSON.stringify({ error: "No placement" }), { status: 400, headers: corsHeaders });

      const { data: pdfFile, error: dlErr } = await admin.storage.from("contract-signed").download(env.signed_pdf_path!);
      if (dlErr || !pdfFile) throw new Error(dlErr?.message || "Failed to download PDF");
      const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());

      const pdf = await PDFDocument.load(pdfBytes);
      const page = pdf.getPage(placement.page);
      const { width: pw, height: ph } = page.getSize();
      const base64 = (signature_data_url as string).split(",")[1] || signature_data_url;
      const sigBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const png = await pdf.embedPng(sigBytes);
      const w = placement.w_pct * pw;
      const h = placement.h_pct * ph;
      const x = placement.x_pct * pw;
      const y = ph - (placement.y_pct * ph) - h;
      page.drawImage(png, { x, y, width: w, height: h });
      // Timestamp under the signature
      const helv = await pdf.embedFont(StandardFonts.Helvetica);
      const ts = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
      const tsSize = 6;
      const label = `Signed: ${ts}`;
      const tw = helv.widthOfTextAtSize(label, tsSize);
      page.drawText(label, {
        x: x + Math.max(0, (w - tw) / 2),
        y: Math.max(2, y - tsSize - 1),
        size: tsSize,
        font: helv,
        color: rgb(0.35, 0.35, 0.35),
      });
      const out = await pdf.save();

      const path = `countersigned/${env.id}-${Date.now()}.pdf`;
      const blob = new Blob([out], { type: "application/pdf" });
      const { error: upErr } = await admin.storage.from("contract-signed").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const nowIso = new Date().toISOString();
      await admin.from("contract_envelopes").update({
        countersigned_file_url: path,
        countersigned_at: nowIso,
      }).eq("id", env.id);

      await admin.from("contract_audit_events").insert({
        envelope_id: env.id,
        event_type: "countersigned",
        actor_email: null,
        metadata: { path },
      });

      // Save signature for future reuse
      try {
        if (env.countersign_recipient_email) {
          await admin.from("saved_signatures").upsert({
            recipient_email: env.countersign_recipient_email.toLowerCase(),
            signature_data_url: signature_data_url,
            last_used_at: new Date().toISOString(),
          }, { onConflict: "recipient_email" });
        }
      } catch (sigErr) {
        console.error("save signature failed", sigErr);
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  } catch (e) {
    console.error("countersign-contract error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
