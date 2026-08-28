// Shared RFC 2822 / MIME builder for Gmail send + draft functions.
export interface MimeAttachment {
  filename: string;
  mimeType?: string;
  data: string; // base64 (standard, not url-safe)
}

export function b64(s: string): string {
  return btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
}

export function header(v: string): string {
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`;
}

function chunk76(s: string): string {
  return (s.match(/.{1,76}/g) || []).join("\r\n");
}

export function createRawEmail(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  attachments?: MimeAttachment[];
}): string {
  const { to, cc = "", bcc = "", subject, body, inReplyTo = "", references = "" } = opts;
  const attachments = (opts.attachments || []).filter((a) => a?.data && a?.filename);

  const baseHeaders = [
    to ? `To: ${to}` : "",
    cc ? `Cc: ${cc}` : "",
    bcc ? `Bcc: ${bcc}` : "",
    `Subject: ${header(subject)}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    references ? `References: ${references}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);

  let email: string;
  if (attachments.length === 0) {
    email = [...baseHeaders, 'Content-Type: text/html; charset="UTF-8"', "", body].join("\r\n");
  } else {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const parts: string[] = [
      ...baseHeaders,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      body,
    ];
    for (const a of attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${a.mimeType || "application/octet-stream"}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        chunk76(a.data.replace(/\s/g, "")),
      );
    }
    parts.push(`--${boundary}--`, "");
    email = parts.join("\r\n");
  }

  return b64(email).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
