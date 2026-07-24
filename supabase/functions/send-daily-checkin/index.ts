import nodemailer from "npm:nodemailer@6.9.14";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Section { title: string; checked: string[]; }
interface Body {
  contractorName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  date: string;
  sections: Section[];
  additionalNotes?: string;
  checkinId?: string;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const gmailUser = Deno.env.get("MARK_GMAIL_USER");
    const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPassword) throw new Error("Gmail credentials not configured");

    const payload: Body = await req.json();
    const { contractorName, jobTitle, companyName, date, sections, additionalNotes, checkinId } = payload;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const dateStr = new Date(date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const subject = `Daily check-in - ${contractorName} - ${dateStr}`;

    const sectionsHtml = sections.map(s => {
      const items = (s.checked || []).filter(Boolean);
      const inner = items.length === 0
        ? `<p style="margin:4px 0;color:#888;font-style:italic;">None reported</p>`
        : `<ul style="margin:4px 0 12px 20px;padding:0;">${items.map(i => `<li style="margin:2px 0;">${escapeHtml(i)}</li>`).join("")}</ul>`;
      return `<h3 style="margin:14px 0 4px;font-size:15px;color:#222;">${escapeHtml(s.title)}</h3>${inner}`;
    }).join("");

    const notesHtml = additionalNotes?.trim()
      ? `<h3 style="margin:14px 0 4px;font-size:15px;color:#222;">Additional notes</h3><p style="margin:4px 0;white-space:pre-wrap;">${escapeHtml(additionalNotes)}</p>`
      : "";

    const meta = [jobTitle, companyName].filter(Boolean).join(" · ");
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;padding:20px;max-width:640px;">
      <h2 style="margin:0 0 4px;">Daily Check-in</h2>
      <p style="margin:0 0 4px;color:#555;"><strong>${escapeHtml(contractorName)}</strong>${meta ? ` - ${escapeHtml(meta)}` : ""}</p>
      <p style="margin:0 0 12px;color:#888;font-size:13px;">${dateStr}</p>
      <hr style="border:none;border-top:1px solid #eee;"/>
      ${sectionsHtml}
      ${notesHtml}
    </body></html>`;

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPassword },
    });

    await transporter.sendMail({
      from: `"OutSta Portal" <${gmailUser}>`,
      to: ["mark@outsta.io", "Liezl@outsta.io"],
      subject,
      html,
    });

    if (checkinId) {
      await supabase.from("contractor_daily_checkins").update({ email_status: "sent" }).eq("id", checkinId);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error("send-daily-checkin error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
