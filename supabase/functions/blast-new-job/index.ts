import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// INTERNAL TEST MODE: only send to these admin emails (not real applicants)
const INTERNAL_RECIPIENTS: { email: string; firstName: string }[] = [
  { email: "czarina@outsta.io", firstName: "Czarina" },
  { email: "kristine@outsta.io", firstName: "Kristine" },
  { email: "eduardo@outsta.io", firstName: "Eduardo" },
  { email: "mark@outsta.io", firstName: "Mark" },
  { email: "liezl@outsta.io", firstName: "Liezl" },
  { email: "jil@outsta.io", firstName: "Jil" },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatRate(rate: string | null, region: string | null): string {
  if (!rate) return "Competitive compensation";
  if (region === "philippines") return `₱${rate}/month`;
  return `$${rate}/hr`;
}

function buildEmailHtml(opts: {
  firstName: string;
  job: {
    id: string;
    title: string;
    rate: string | null;
    region: string | null;
    description: string | null;
    qualifications: string[] | null;
    responsibilities: string[] | null;
  };
}): string {
  const { firstName, job } = opts;
  const applyUrl = `https://outstahub.com/apply/${job.id}`;
  const regionLabel =
    job.region === "philippines" ? "Philippines" : job.region === "us" ? "US" : "Remote";

  const respHtml = (job.responsibilities || [])
    .map(
      (r) =>
        `<li style="margin-bottom:10px;">${escapeHtml(r)}</li>`
    )
    .join("");
  const qualHtml = (job.qualifications || [])
    .map(
      (q) =>
        `<li style="margin-bottom:10px;">${escapeHtml(q)}</li>`
    )
    .join("");

  return `<div style="color:#1a1a2e;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
<p style="margin:0 0 24px;">We're excited to share a new opportunity that matches your profile. Here are the full details:</p>
<h1 style="font-size:28px;font-weight:700;color:#0f172a;margin:0 0 12px;line-height:1.2;">${escapeHtml(job.title)}</h1>
<div style="margin:0 0 20px;font-size:14px;color:#3b6fa0;">
<span style="display:inline-block;margin-right:16px;">○ ${escapeHtml(regionLabel)}</span>
<span style="display:inline-block;margin-right:16px;">○ Full time</span>
<span style="display:inline-block;">○ General</span>
</div>
<p style="font-size:22px;font-weight:700;color:#1e3a5f;margin:0 0 20px;">${escapeHtml(formatRate(job.rate, job.region))}</p>
${job.description ? `<p style="margin:0 0 28px;color:#334155;">${escapeHtml(job.description)}</p>` : ""}
${respHtml ? `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 14px;">Key Responsibilities</h2><ul style="margin:0 0 28px;padding-left:20px;color:#334155;">${respHtml}</ul>` : ""}
${qualHtml ? `<h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 14px;">Key Qualifications</h2><ul style="margin:0 0 32px;padding-left:20px;color:#334155;">${qualHtml}</ul>` : ""}
<div style="text-align:center;margin:0 0 20px;"><a href="${applyUrl}" style="display:inline-block;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:600;font-size:16px;">Apply Now</a></div>
<p style="margin:0 0 24px;color:#64748b;font-size:13px;text-align:center;">Or copy this link: <a href="${applyUrl}" style="color:#3b6fa0;">${applyUrl}</a></p>
<p style="margin:24px 0 0;">Best regards,<br>OutSta Recruitment Team</p>
</div>`;
}

function wrapShell(subject: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f5f5f5;"><table role="presentation" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:40px 0;"><table role="presentation" style="width:600px;max-width:100%;border-collapse:collapse;background-color:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);"><tr><td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:50px 40px;border-radius:12px 12px 0 0;text-align:center;"><h1 style="color:#ffffff;margin:0;font-size:36px;font-weight:700;letter-spacing:3px;">OutSta</h1><p style="color:#e2e8f0;margin:8px 0 0 0;font-size:16px;font-weight:400;letter-spacing:2px;">Recruitment Team</p></td></tr><tr><td style="padding:40px;">${inner}</td></tr><tr><td style="background-color:#f8f9fa;padding:25px 40px;border-radius:0 0 12px 12px;text-align:center;"><p style="color:#999999;font-size:12px;margin:0;line-height:1.6;">This is an automated message from OutSta Recruitment — replies to this email will not be monitored or entertained.<br>To be considered for this role, applications must be submitted exclusively through the assessment link above.</p></td></tr></table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, title, rate, region, description, qualifications, responsibilities")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gmailUser = Deno.env.get("GMAIL_USER")!;
    const gmailPassword = (Deno.env.get("GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: { username: gmailUser, password: gmailPassword },
      },
    });

    const subject = `New Opportunity at OutSta: ${job.title}`;
    const results: Array<{ email: string; ok: boolean; error?: string }> = [];

    const recipients = onlyEmail
      ? INTERNAL_RECIPIENTS.filter((r) => r.email.toLowerCase() === onlyEmail.toLowerCase())
      : INTERNAL_RECIPIENTS;

    for (const r of recipients) {
      try {
        const inner = buildEmailHtml({ firstName: r.firstName, job });
        const html = wrapShell(subject, inner);
        await client.send({
          from: `OutSta Recruitment <${gmailUser}>`,
          to: r.email,
          replyTo: "noreply@outsta.io",
          subject,
          content: "auto",
          html,
          headers: {
            "Auto-Submitted": "auto-generated",
            "X-Auto-Response-Suppress": "All",
          },
        });
        results.push({ email: r.email, ok: true });
      } catch (e) {
        results.push({ email: r.email, ok: false, error: String(e) });
      }
    }

    await client.close();

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("blast-new-job error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
