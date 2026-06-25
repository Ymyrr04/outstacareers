// Pre-Pitch Agreement signing endpoint — renders content as HTML on the client
// and generates a fresh PDF here (no template overlay).
//
// POST { token, fullName, signatureDataUrl, terms:[bool x6], finalConfirm:bool, consent:bool }

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRE_PITCH_TEMPLATE_NAME = "OutSta Pre-Pitch Agreement";

const TERMS: { title: string; body: string }[] = [
  {
    title: "Security deposit",
    body: "A two-week security deposit will be held by OutSta for the duration of your contract. This deposit will be released in full on your final working day, provided there are no outstanding issues or claims. This is a standard requirement for all contractors and is non-negotiable.",
  },
  {
    title: "Payment method — Payoneer only",
    body: "All payments are processed exclusively through Payoneer. This is required for our tax and accounting compliance. Direct bank transfers or any other payment methods are not supported. Please ensure you have an active Payoneer account set up before your start date.",
  },
  {
    title: "Employment status — full - time Independent contractor",
    body: "You will be engaged as a full - time Independent contractor, working dedicated hours exclusively for your assigned client. While you work full-time hours, your engagement is on a contractor basis — meaning you are responsible for your own taxes and statutory compliance in your country of residence. OutSta does not provide employment benefits such as paid leave, health insurance, or retirement contributions.",
  },
  {
    title: "Working hours — as per client requirement",
    body: "Your working hours are based on the client's requirements, up to a maximum of 50 hours per week as stated in the contract. Your agreed hours will be confirmed during the offer stage. Any overtime beyond the agreed hours must be mutually agreed upon by both parties in advance.",
  },
  {
    title: "Rate — as agreed during offer",
    body: "Your rate is the hourly or weekly rate discussed and agreed upon during your offer conversation with our recruitment manager. This rate is final and forms part of your contract. Rate adjustments cannot be made after the contract has been signed and executed.",
  },
  {
    title: "Probation period",
    body: "All contractors are subject to a two-week probation period starting from their first day of work. During this period, either party may end the engagement without the standard notice requirement. Successful completion of the probation period confirms your continued placement with the client. OutSta and the client reserve the right to assess your performance, work quality, and overall fit during this time.",
  },
];

async function sha256Hex(buf: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function getClientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0].trim()) || req.headers.get("cf-connecting-ip") || "unknown";
}

// Word-wrap text for pdf-lib drawing
function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function buildPrePitchPdf(opts: {
  recipientName: string;
  recipientEmail: string;
  fullName: string;
  signatureDataUrl: string;
  termsChecked: boolean[];
  finalChecked: boolean;
  signedAt: Date;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595;
  const pageH = 842;
  const margin = 50;
  const contentW = pageW - margin * 2;
  const teal = rgb(0.0, 0.55, 0.55);
  const text = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.35, 0.35, 0.4);

  let page = doc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin + 30) {
      // footer
      page.drawText("OutSta — Workforce Solutions", { x: margin, y: margin - 10, size: 8, font, color: muted });
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };

  // Header band
  page.drawRectangle({ x: 0, y: pageH - 70, width: pageW, height: 70, color: teal });
  page.drawText("OutSta", { x: margin, y: pageH - 38, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Pre-Pitch Agreement", { x: margin, y: pageH - 58, size: 12, font, color: rgb(1, 1, 1) });
  y = pageH - 90;

  // Intro
  const intro =
    "Before we move forward with presenting you to our client, please read each term carefully and tick the box beside it to confirm your understanding. Sign and print your full name at the bottom. This agreement must be completed before we can proceed with your placement.";
  for (const ln of wrap(intro, font, 10, contentW)) {
    newPageIfNeeded(14);
    page.drawText(ln, { x: margin, y, size: 10, font, color: text });
    y -= 13;
  }
  y -= 10;

  // Terms
  TERMS.forEach((t, i) => {
    const titleLines = wrap(t.title, bold, 11, contentW - 30);
    const bodyLines = wrap(t.body, font, 10, contentW - 30);
    const blockH = 18 + titleLines.length * 14 + bodyLines.length * 13 + 10;
    newPageIfNeeded(blockH);

    // checkbox
    const boxSize = 12;
    const boxY = y - 2;
    page.drawRectangle({ x: margin, y: boxY - boxSize, width: boxSize, height: boxSize, borderColor: text, borderWidth: 1 });
    if (opts.termsChecked[i]) {
      page.drawLine({ start: { x: margin + 2, y: boxY - boxSize / 2 }, end: { x: margin + boxSize / 2, y: boxY - boxSize + 2 }, thickness: 1.4, color: teal });
      page.drawLine({ start: { x: margin + boxSize / 2, y: boxY - boxSize + 2 }, end: { x: margin + boxSize - 1, y: boxY - 1 }, thickness: 1.4, color: teal });
    }

    // term number tag
    page.drawText(`TERM 0${i + 1}`, { x: margin + 22, y, size: 8, font: bold, color: teal });
    y -= 12;
    for (const ln of titleLines) {
      page.drawText(ln, { x: margin + 22, y, size: 11, font: bold, color: text });
      y -= 14;
    }
    for (const ln of bodyLines) {
      page.drawText(ln, { x: margin + 22, y, size: 10, font, color: text });
      y -= 13;
    }
    y -= 10;
  });

  // Final confirmation
  newPageIfNeeded(80);
  page.drawText("Final confirmation", { x: margin, y, size: 12, font: bold, color: teal });
  y -= 18;
  const finalText =
    "I confirm that I have read, understood, and agree to all six terms listed above. I understand that by signing below, I am acknowledging my acceptance of these conditions before being presented to the client.";
  const fcBoxY = y - 2;
  const fcBox = 12;
  page.drawRectangle({ x: margin, y: fcBoxY - fcBox, width: fcBox, height: fcBox, borderColor: text, borderWidth: 1 });
  if (opts.finalChecked) {
    page.drawLine({ start: { x: margin + 2, y: fcBoxY - fcBox / 2 }, end: { x: margin + fcBox / 2, y: fcBoxY - fcBox + 2 }, thickness: 1.4, color: teal });
    page.drawLine({ start: { x: margin + fcBox / 2, y: fcBoxY - fcBox + 2 }, end: { x: margin + fcBox - 1, y: fcBoxY - 1 }, thickness: 1.4, color: teal });
  }
  for (const ln of wrap(finalText, font, 10, contentW - 22)) {
    page.drawText(ln, { x: margin + 22, y, size: 10, font, color: text });
    y -= 13;
  }
  y -= 20;

  // Signature block
  newPageIfNeeded(140);
  // Embed signature
  const m = opts.signatureDataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
  let sigImg: any = null;
  if (m) {
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    sigImg = m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  }
  const colW = (contentW - 20) / 2;

  // Full name
  page.drawText("Full name (printed)", { x: margin, y, size: 9, font: bold, color: muted });
  page.drawText("Signature", { x: margin + colW + 20, y, size: 9, font: bold, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y: y - 40 }, end: { x: margin + colW, y: y - 40 }, thickness: 0.8, color: text });
  page.drawLine({ start: { x: margin + colW + 20, y: y - 40 }, end: { x: margin + colW * 2 + 20, y: y - 40 }, thickness: 0.8, color: text });

  page.drawText(opts.fullName, { x: margin + 4, y: y - 30, size: 12, font, color: text });

  if (sigImg) {
    const scaled = sigImg.scaleToFit(colW - 8, 45);
    page.drawImage(sigImg, {
      x: margin + colW + 24,
      y: y - 40 + 2,
      width: scaled.width,
      height: scaled.height,
    });
  }
  y -= 60;

  const dateStr = opts.signedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " UTC";
  page.drawText(`Signed electronically: ${dateStr}`, { x: margin, y, size: 9, font, color: muted });
  y -= 14;
  page.drawText(`Signer email: ${opts.recipientEmail}`, { x: margin, y, size: 9, font, color: muted });

  // Footer on all pages
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    p.drawText(`OutSta — Workforce Solutions   •   Page ${i + 1} of ${pageCount}`, {
      x: margin,
      y: 24,
      size: 8,
      font,
      color: muted,
    });
  }

  return await doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { token, fullName, signatureDataUrl, terms, finalConfirm, consent } = body as {
      token: string;
      fullName: string;
      signatureDataUrl: string;
      terms: boolean[];
      finalConfirm: boolean;
      consent: boolean;
    };

    if (!token || !consent || !fullName?.trim() || !signatureDataUrl || !Array.isArray(terms) || terms.length !== 6 || !finalConfirm) {
      return new Response(JSON.stringify({ error: "Please complete every term, full name, signature, and confirmation." }), { status: 400, headers: corsHeaders });
    }
    if (terms.some(t => t !== true)) {
      return new Response(JSON.stringify({ error: "All six terms must be checked." }), { status: 400, headers: corsHeaders });
    }

    const { data: envelope } = await admin.from("contract_envelopes").select("*").eq("signing_token", token).maybeSingle();
    if (!envelope) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
    if (envelope.status === "signed") return new Response(JSON.stringify({ error: "Already signed" }), { status: 409, headers: corsHeaders });
    if (envelope.status === "voided" || new Date(envelope.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Envelope unavailable" }), { status: 410, headers: corsHeaders });
    }

    const { data: template } = await admin.from("contract_templates").select("*").eq("id", envelope.template_id).single();
    if (!template || template.name !== PRE_PITCH_TEMPLATE_NAME) {
      return new Response(JSON.stringify({ error: "Wrong endpoint for this template." }), { status: 400, headers: corsHeaders });
    }

    const signedAt = new Date();
    const pdfBytes = await buildPrePitchPdf({
      recipientName: envelope.recipient_name,
      recipientEmail: envelope.recipient_email,
      fullName: fullName.trim(),
      signatureDataUrl,
      termsChecked: terms,
      finalChecked: finalConfirm,
      signedAt,
    });

    const sha = await sha256Hex(pdfBytes);
    const signedPath = `${envelope.id}/signed.pdf`;
    await admin.storage.from("contract-signed").upload(signedPath, pdfBytes, { contentType: "application/pdf", upsert: true });

    // Audit PDF
    const auditDoc = await PDFDocument.create();
    const aPage = auditDoc.addPage([595, 842]);
    const aFont = await auditDoc.embedFont(StandardFonts.Helvetica);
    const aBold = await auditDoc.embedFont(StandardFonts.HelveticaBold);
    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? "unknown";
    let yy = 800;
    const line = (t: string, b = false, size = 11) => {
      aPage.drawText(t, { x: 40, y: yy, size, font: b ? aBold : aFont, color: rgb(0, 0, 0) });
      yy -= size + 6;
    };
    line("Audit Trail — Electronic Signature", true, 16); yy -= 6;
    line(`Document: ${template.name}`);
    line(`Envelope ID: ${envelope.id}`);
    line(`Signer: ${envelope.recipient_name} <${envelope.recipient_email}>`);
    line(`Printed name: ${fullName.trim()}`);
    line(`Signed at: ${signedAt.toISOString()}`);
    line(`IP address: ${ip}`);
    line(`User agent: ${ua.slice(0, 100)}`);
    line(`SHA-256 of signed PDF: ${sha}`);
    const auditBytes = await auditDoc.save();
    const auditPath = `${envelope.id}/audit.pdf`;
    await admin.storage.from("contract-signed").upload(auditPath, auditBytes, { contentType: "application/pdf", upsert: true });

    await admin.from("contract_envelopes").update({
      status: "signed",
      signed_at: signedAt.toISOString(),
      signed_pdf_path: signedPath,
      audit_pdf_path: auditPath,
      signed_pdf_sha256: sha,
    }).eq("id", envelope.id);

    await admin.from("contract_audit_events").insert({
      envelope_id: envelope.id,
      event_type: "signed",
      actor_email: envelope.recipient_email,
      ip_address: ip,
      user_agent: ua,
      metadata: { sha256: sha, full_name: fullName.trim() },
    });

    // Save signature for reuse
    try {
      if (envelope.recipient_email) {
        await admin.from("saved_signatures").upsert({
          recipient_email: envelope.recipient_email.toLowerCase(),
          signature_data_url: signatureDataUrl,
          last_used_at: new Date().toISOString(),
        }, { onConflict: "recipient_email" });
      }
    } catch (_) { /* ignore */ }

    // Email both parties
    try {
      const gmailUser = Deno.env.get("MARK_GMAIL_USER")!;
      const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD")!;
      const smtp = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: gmailUser, password: gmailPassword } } });
      const signedB64 = btoa(String.fromCharCode(...pdfBytes));
      const auditB64 = btoa(String.fromCharCode(...auditBytes));
      const recipients = [envelope.recipient_email];
      if (envelope.sender_email) recipients.push(envelope.sender_email);
      await smtp.send({
        from: `OutSta Contracts <${gmailUser}>`,
        to: recipients,
        subject: `Signed: ${template.name}`,
        html: `<div style="font-family:Arial,sans-serif"><h2>Pre-Pitch Agreement signed</h2><p>${template.name} has been signed by ${envelope.recipient_name}.</p></div>`,
        attachments: [
          { filename: "pre-pitch-signed.pdf", content: signedB64, encoding: "base64", contentType: "application/pdf" },
          { filename: "audit-trail.pdf", content: auditB64, encoding: "base64", contentType: "application/pdf" },
        ],
      });
      await smtp.close();
    } catch (mailErr) {
      console.error("email failed", mailErr);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
