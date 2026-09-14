// Public signing endpoint. GET ?token=... loads envelope/template/fields and a signed PDF URL.
// POST { token, fieldValues:[{template_field_id, value, signature_data_url}], consent } submits.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function getClientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0].trim()) || req.headers.get("cf-connecting-ip") || "unknown";
}

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

      const { data: envelope } = await admin
        .from("contract_envelopes")
        .select("*")
        .eq("signing_token", token)
        .maybeSingle();

      if (!envelope) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
      if (new Date(envelope.expires_at) < new Date() && envelope.status !== "signed") {
        await admin.from("contract_envelopes").update({ status: "expired" }).eq("id", envelope.id);
        return new Response(JSON.stringify({ error: "expired" }), { status: 410, headers: corsHeaders });
      }
      if (envelope.status === "voided") return new Response(JSON.stringify({ error: "voided" }), { status: 410, headers: corsHeaders });

      const { data: template } = await admin
        .from("contract_templates")
        .select("*")
        .eq("id", envelope.template_id)
        .single();

      const { data: fields } = await admin
        .from("contract_template_fields")
        .select("*")
        .eq("template_id", envelope.template_id)
        .order("sort_order");

      const { data: signed } = await admin.storage.from("contract-templates").createSignedUrl(template!.pdf_path, 3600);

      // Track view — always refresh viewed_at so it reflects the last view, not just the first
      if (envelope.status === "sent" || envelope.status === "viewed") {
        const nowIso = new Date().toISOString();
        const update: Record<string, unknown> = { viewed_at: nowIso };
        if (envelope.status === "sent") update.status = "viewed";
        await admin.from("contract_envelopes").update(update).eq("id", envelope.id);
        await admin.from("contract_audit_events").insert({
          envelope_id: envelope.id, event_type: "viewed",
          actor_email: envelope.recipient_email, ip_address: getClientIp(req), user_agent: req.headers.get("user-agent") ?? "",
        });
      }

      // Lookup saved signature by recipient email
      let saved_signature: string | null = null;
      if (envelope.recipient_email) {
        const { data: sig } = await admin
          .from("saved_signatures")
          .select("signature_data_url")
          .eq("recipient_email", envelope.recipient_email.toLowerCase())
          .maybeSingle();
        saved_signature = sig?.signature_data_url ?? null;
      }

      return new Response(JSON.stringify({
        envelope: {
          id: envelope.id,
          status: envelope.status === "sent" ? "viewed" : envelope.status,
          recipient_name: envelope.recipient_name,
          recipient_email: envelope.recipient_email,
          expires_at: envelope.expires_at,
          admin_prefill: envelope.admin_prefill,
          message: envelope.message,
        },
        template: { id: template!.id, name: template!.name, page_count: template!.page_count },
        pdf_url: signed?.signedUrl,
        fields,
        saved_signature,
      }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, fieldValues, consent } = body as {
        token: string;
        fieldValues: Array<{ template_field_id: string; value?: string; signature_data_url?: string }>;
        consent: boolean;
      };
      if (!token || !consent || !Array.isArray(fieldValues)) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
      }

      const { data: envelope } = await admin.from("contract_envelopes").select("*").eq("signing_token", token).maybeSingle();
      if (!envelope) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
      if (envelope.status === "signed") return new Response(JSON.stringify({ error: "Already signed" }), { status: 409, headers: corsHeaders });
      if (envelope.status === "voided" || new Date(envelope.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Envelope unavailable" }), { status: 410, headers: corsHeaders });
      }

      const { data: template } = await admin.from("contract_templates").select("*").eq("id", envelope.template_id).single();
      const { data: fields } = await admin.from("contract_template_fields").select("*").eq("template_id", envelope.template_id);

      // Validate required fields filled (signer + system)
      const valueByFieldId = new Map(fieldValues.map(v => [v.template_field_id, v]));
      const todayObj = new Date();
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const today = `${monthNames[todayObj.getMonth()]} ${todayObj.getDate()}, ${todayObj.getFullYear()}`;
      for (const f of fields!) {
        if (f.assigned_to === "system" && f.field_type === "date") {
          valueByFieldId.set(f.id, { template_field_id: f.id, value: today });
        }
        if (f.assigned_to === "admin") {
          const key = (f.field_key || f.label || "").toString();
          const pref = (envelope.admin_prefill as Record<string, string>)?.[key];
          if (pref && !valueByFieldId.has(f.id)) {
            valueByFieldId.set(f.id, { template_field_id: f.id, value: pref });
          }
        }
        if (f.required && f.assigned_to === "signer") {
          const v = valueByFieldId.get(f.id);
          const hasVal = (f.field_type === "signature" || f.field_type === "initials" || f.field_type === "attachment")
            ? !!v?.signature_data_url
            : f.field_type === "checkbox"
            ? v?.value === "true"
            : !!v?.value;
          if (!hasVal) return new Response(JSON.stringify({ error: `Missing required field: ${f.label || f.field_type}` }), { status: 400, headers: corsHeaders });
        }
      }

      // Load source PDF
      const { data: srcFile, error: dlErr } = await admin.storage.from("contract-templates").download(template!.pdf_path);
      if (dlErr || !srcFile) throw new Error("Failed to load template PDF");
      const srcBytes = new Uint8Array(await srcFile.arrayBuffer());

      const pdfDoc = await PDFDocument.load(srcBytes);
      const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();

      const attachmentImages: Array<{ bytes: Uint8Array; kind: "png" | "jpg" | "pdf"; label: string }> = [];

      for (const f of fields!) {
        const v = valueByFieldId.get(f.id);
        if (!v) continue;
        const pageIdx = Math.min(Math.max(f.page - 1, 0), pages.length - 1);
        const page = pages[pageIdx];
        const { width: pw, height: ph } = page.getSize();
        const x = Number(f.x_pct) * pw;
        const w = Number(f.width_pct) * pw;
        const h = Number(f.height_pct) * ph;
        const y = ph - (Number(f.y_pct) * ph + h);

        if (f.field_type === "attachment" && v.signature_data_url) {
          // Defer attachments to dedicated pages at the end, original size
          const m = v.signature_data_url.match(/^data:(image\/(?:png|jpeg|jpg)|application\/pdf);base64,(.+)$/);
          if (m) {
            const attBytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
            const kind = m[1] === "application/pdf" ? "pdf" : m[1] === "image/png" ? "png" : "jpg";
            attachmentImages.push({ bytes: attBytes, kind, label: f.label || "Attachment" });
          }
          continue;
        }

        if ((f.field_type === "signature" || f.field_type === "initials") && v.signature_data_url) {
          const m = v.signature_data_url.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
          if (m) {
            const imgBytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
            const img = m[1] === "png" ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
            const scaled = img.scaleToFit(w, h);
            page.drawImage(img, { x: x + (w - scaled.width) / 2, y: y + (h - scaled.height) / 2, width: scaled.width, height: scaled.height });
            // Timestamp under the signature
            const ts = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
            const tsSize = 6;
            const tsW = helv.widthOfTextAtSize(ts, tsSize);
            page.drawText(`Signed: ${ts}`, {
              x: x + Math.max(0, (w - helv.widthOfTextAtSize(`Signed: ${ts}`, tsSize)) / 2),
              y: Math.max(2, y - tsSize - 1),
              size: tsSize,
              font: helv,
              color: rgb(0.35, 0.35, 0.35),
            });
            void tsW;
          }
        } else if (f.field_type === "checkbox") {
          if (v.value === "true") {
            const pad = Math.min(w, h) * 0.15;
            const thickness = Math.max(1.5, Math.min(w, h) * 0.12);
            page.drawLine({
              start: { x: x + pad, y: y + h * 0.55 },
              end: { x: x + w * 0.42, y: y + pad },
              thickness,
              color: rgb(0, 0, 0),
            });
            page.drawLine({
              start: { x: x + w * 0.42, y: y + pad },
              end: { x: x + w - pad, y: y + h * 0.75 },
              thickness,
              color: rgb(0, 0, 0),
            });
          }
        } else {
          let text = v.value || "";
          // Format ISO date values (yyyy-mm-dd) into "Dayname , Month D, YYYY" for date fields
          if (f.field_type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
            const [yy, mm, dd] = text.split("-").map(Number);
            const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
            const dow = dayNames[new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay()];
            text = `${dow} , ${monthNames[mm - 1]} ${dd}, ${yy}`;
          }
          if (text) {
            // Auto-fit: scale font size to fill the box (centered), shrinking if needed
            const padX = 4;
            const padY = 2;
            const maxW = Math.max(w - padX * 2, 1);
            const maxH = Math.max(h - padY * 2, 1);
            let fontSize = Math.min(maxH, 48);
            const minSize = 4;
            while (fontSize > minSize) {
              const tw = helv.widthOfTextAtSize(text, fontSize);
              const th = helv.heightAtSize(fontSize);
              if (tw <= maxW && th <= maxH) break;
              fontSize -= 0.5;
            }
            const tw = helv.widthOfTextAtSize(text, fontSize);
            const th = helv.heightAtSize(fontSize);
            page.drawText(text, {
              x: x + (w - tw) / 2,
              y: y + (h - th) / 2,
              size: fontSize,
              font: helv,
              color: rgb(0, 0, 0),
            });
          }
        }
      }

      // Append attachments at the end, each on its own page, at original size (scaled down only if larger than page)
      for (const att of attachmentImages) {
        if (att.kind === "pdf") {
          try {
            const attDoc = await PDFDocument.load(att.bytes);
            const copied = await pdfDoc.copyPages(attDoc, attDoc.getPageIndices());
            for (const p of copied) pdfDoc.addPage(p);
          } catch (e) {
            console.error("Failed to append PDF attachment", e);
          }
          continue;
        }
        const img = att.kind === "png" ? await pdfDoc.embedPng(att.bytes) : await pdfDoc.embedJpg(att.bytes);
        const lastPage = pages[pages.length - 1];
        const { width: pw, height: ph } = lastPage.getSize();
        const newPage = pdfDoc.addPage([pw, ph]);
        const margin = 40;
        const maxW = pw - margin * 2;
        const maxH = ph - margin * 2;
        let dw = img.width;
        let dh = img.height;
        if (dw > maxW || dh > maxH) {
          const scaled = img.scaleToFit(maxW, maxH);
          dw = scaled.width; dh = scaled.height;
        }
        const dx = (pw - dw) / 2;
        const dy = (ph - dh) / 2;
        newPage.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
      }

      const signedBytes = await pdfDoc.save();
      const signedHash = await sha256Hex(signedBytes);
      // Use a versioned path so a re-signed/repaired document can never be
      // replaced by a stale CDN-cached copy from the previous upload.
      const signedPath = `${envelope.id}/signed-${Date.now()}.pdf`;
      const { error: signedUploadError } = await admin.storage
        .from("contract-signed")
        .upload(signedPath, signedBytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
      if (signedUploadError) throw new Error(`Failed to save signed contract: ${signedUploadError.message}`);

      // Audit PDF
      const auditDoc = await PDFDocument.create();
      const aPage = auditDoc.addPage([595, 842]);
      const aFont = await auditDoc.embedFont(StandardFonts.Helvetica);
      const aBold = await auditDoc.embedFont(StandardFonts.HelveticaBold);
      const ip = getClientIp(req);
      const ua = req.headers.get("user-agent") ?? "unknown";
      const nowObj = new Date();
      const now = `${monthNames[nowObj.getMonth()]} ${nowObj.getDate()}, ${nowObj.getFullYear()}`;
      let yy = 800;
      const line = (t: string, bold = false, size = 11) => {
        aPage.drawText(t, { x: 40, y: yy, size, font: bold ? aBold : aFont, color: rgb(0, 0, 0) });
        yy -= size + 6;
      };
      line("Audit Trail — Electronic Signature", true, 16); yy -= 6;
      line(`Document: ${template!.name}`);
      line(`Envelope ID: ${envelope.id}`);
      line(`Signer: ${envelope.recipient_name} <${envelope.recipient_email}>`);
      line(`Sender: ${envelope.sender_email || "OutSta"}`);
      line(`Signed at: ${now}`);
      line(`IP address: ${ip}`);
      line(`User agent: ${ua.slice(0, 100)}`);
      line(`SHA-256 of signed PDF: ${signedHash}`); yy -= 6;
      line("Timeline", true, 13);
      const { data: events } = await admin.from("contract_audit_events").select("*").eq("envelope_id", envelope.id).order("created_at");
      const fmtDate = (d: string) => {
        const dt = new Date(d);
        return `${monthNames[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
      };
      for (const ev of (events ?? [])) {
        line(`• ${fmtDate(ev.created_at)}  ${ev.event_type}  ${ev.actor_email ?? ""}`, false, 9);
      }
      line(`• ${now}  signed  ${envelope.recipient_email}`, false, 9);
      const auditBytes = await auditDoc.save();
      const auditPath = `${envelope.id}/audit.pdf`;
      await admin.storage.from("contract-signed").upload(auditPath, auditBytes, { contentType: "application/pdf", upsert: true });

      // Save field values + envelope status
      const rows = Array.from(valueByFieldId.values()).map(v => ({
        envelope_id: envelope.id,
        template_field_id: v.template_field_id,
        value: v.value ?? null,
        signature_data_url: v.signature_data_url ?? null,
      }));
      if (rows.length) await admin.from("contract_envelope_field_values").upsert(rows, { onConflict: "envelope_id,template_field_id" });

      await admin.from("contract_envelopes").update({
        status: "signed", signed_at: nowObj.toISOString(), signed_pdf_path: signedPath, audit_pdf_path: auditPath, signed_pdf_sha256: signedHash,
      }).eq("id", envelope.id);

      await admin.from("contract_audit_events").insert({
        envelope_id: envelope.id, event_type: "signed",
        actor_email: envelope.recipient_email, ip_address: ip, user_agent: ua,
        metadata: { sha256: signedHash },
      });

      // Save signature for future reuse (first "signature" field by signer)
      try {
        const sigField = fields!.find(f => f.field_type === "signature" && f.assigned_to === "signer");
        const sigVal = sigField ? valueByFieldId.get(sigField.id) : null;
        if (sigVal?.signature_data_url && envelope.recipient_email) {
          await admin.from("saved_signatures").upsert({
            recipient_email: envelope.recipient_email.toLowerCase(),
            signature_data_url: sigVal.signature_data_url,
            last_used_at: new Date().toISOString(),
          }, { onConflict: "recipient_email" });
        }
      } catch (sigErr) {
        console.error("save signature failed", sigErr);
      }

      // Email signed copy to both parties
      try {
        const gmailUser = Deno.env.get("MARK_GMAIL_USER")!;
        const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD")!;
        const smtp = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPassword } } });
        const signedPdfBase64 = btoa(String.fromCharCode(...signedBytes));
        const auditPdfBase64 = btoa(String.fromCharCode(...auditBytes));
        const recipients = [envelope.recipient_email];
        if (envelope.sender_email) recipients.push(envelope.sender_email);
        const html = `<div style="font-family:Arial,sans-serif"><h2>Contract signed</h2>
          <p>${template!.name} has been signed by ${envelope.recipient_name}.</p>
          <p>Attached: signed PDF and audit trail.</p></div>`;
        await smtp.send({
          from: `OutSta Contracts <${gmailUser}>`,
          to: recipients,
          subject: `Signed: ${template!.name}`,
          html,
          attachments: [
            { filename: "signed.pdf", content: signedPdfBase64, encoding: "base64", contentType: "application/pdf" },
            { filename: "audit-trail.pdf", content: auditPdfBase64, encoding: "base64", contentType: "application/pdf" },
          ],
        });
        await smtp.close();
      } catch (mailErr) {
        console.error("email send failed", mailErr);
      }

      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (e) {
    console.error("sign-contract error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
