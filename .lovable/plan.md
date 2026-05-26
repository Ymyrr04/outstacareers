
# Contract Signing System (Adobe Sign–style, from scratch)

Built entirely inside Lovable Cloud. No external e-sign service. Audit-trail PDF included.

## How this Contractor Agreement becomes a template

The uploaded `Contractor_Agreement_v2.docx` becomes the first **reusable template**. We convert it once to PDF, upload it to the `contract-templates` storage bucket, then use the in-app **Template Builder** to drop fields directly on the PDF pages where the blanks are.

Fields detected in this contract (mapped to placeholders):

| # | Page | Field | Type | Filled by |
|---|------|-------|------|-----------|
| 1 | 1 | Client name ("XYZ") | Text | Admin (pre-fill) |
| 2 | 1 | Client representative | Text | Admin (pre-fill) |
| 3 | 1 | Effective Date | Date (auto) | System |
| 4 | 1 | Start date ("May 22, 2026") | Date | Admin (pre-fill) |
| 5 | 11 | Contractor signature | Signature | Contractor |
| 6 | 11 | Contractor initials | Initials | Contractor |
| 7 | 11 | Residential address + postal | Text | Contractor |
| 8 | 12 | Emergency contact name + number | Text | Contractor |
| 9 | 12 | Sign date | Date (auto) | System |
| 10 | 11 | Acknowledgement checkbox | Checkbox | Contractor |

Admin pre-fills #1, #2, #4 when sending. Contractor fills the rest in the browser. The system auto-stamps #3 and #9.

## Two ways to complete it

1. **Online (browser)** — admin sends a link → new hire opens `/sign/:token` → fills fields directly over the rendered PDF → draws/types signature → submits. They get the flattened signed PDF + audit trail by email.
2. **Download blank PDF** — admin can also download the template as a flat PDF with the blanks visible, for offline printing/signing if ever needed. (Online is the primary path.)

## Build order

1. **Database + storage** (single migration) — 5 tables (`contract_templates`, `contract_template_fields`, `contract_envelopes`, `contract_envelope_field_values`, `contract_audit_events`) + two private buckets (`contract-templates`, `contract-signed`).
2. **Template Builder UI** (Admin) — upload PDF, render with `pdfjs-dist`, drag/drop field palette (signature / initials / date / text / checkbox), save fields with page+x+y+w+h.
3. **Seed this contract as Template #1** — convert `Contractor_Agreement_v2.docx` → PDF, upload, pre-place the 10 fields above so it's ready to use out of the box.
4. **Send Envelope flow** — pick template + recipient (existing applicant/contractor or free email) → admin pre-fills client name / rep / start date → generate token → send via existing Gmail sender.
5. **Signer page `/sign/:token`** — public, no login. Renders PDF + overlay fields, signature canvas (draw + type with script font), progress bar, consent checkbox, submit.
6. **Finalize edge function** — uses `pdf-lib` to flatten typed text + signature PNGs onto the exact coordinates, generates an audit-trail PDF (sender, signer, IP, user-agent, timestamps, SHA-256 hash of signed PDF), stores both in `contract-signed`, emails both parties.
7. **Surface on contractor/applicant detail panels** — show envelope status (sent / viewed / signed / voided), resend, void, download signed PDF + audit PDF.

## Technical details

- **PDF rendering**: `pdfjs-dist` (already used in project for CV preview).
- **PDF flattening**: `pdf-lib` via `npm:pdf-lib` in edge functions.
- **Signature capture**: HTML `<canvas>` for draw mode; `<input>` with script font (e.g., Dancing Script) for type mode; both saved as PNG dataURL.
- **Tokens**: random 32-byte URL-safe token, stored hashed; envelope has `expires_at` (default 14 days).
- **Audit events**: every action (sent, opened, viewed_page, field_filled, signed, voided) logged with IP + user-agent.
- **Legal**: valid ESIGN/UETA-style electronic signature (same as 90% of Adobe Sign small-biz use). Not eIDAS-qualified — not required here.

## Out of scope (v1)

- Multi-signer (countersigning by OutSta admin) — can add later.
- In-place PDF text editing (templates are immutable once uploaded; re-upload to change wording).
- SMS reminders.

---

Ready to start with **Step 1 (database + storage migration)** on approval. After that I'll build the template builder and seed this Contractor Agreement so you can send it immediately.
