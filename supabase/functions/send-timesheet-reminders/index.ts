// Weekly reminder to contractors who have not submitted their timesheet/invoice
// Runs on a schedule (cron) and can also be invoked manually from the PL dashboard.
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import nodemailer from "npm:nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OutSta internal team — excluded from contractor reminders
const INTERNAL_CLIENT_ID = "baadbf53-0ca9-4abb-9af1-28f41f415bf1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const gmailUser = Deno.env.get("MARK_GMAIL_USER") || Deno.env.get("GMAIL_USER")!;
const gmailPassword = Deno.env.get("MARK_GMAIL_APP_PASSWORD") || Deno.env.get("GMAIL_APP_PASSWORD")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: gmailUser, pass: gmailPassword },
});

const FROM = `OutSta <${gmailUser}>`;

function etParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
  };
}

// Sunday that ends the current ET week (today if it's Sunday)
function currentWeekEnding(): string {
  const now = new Date();
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const { date, weekday } = etParts(now);
  const idx = order.indexOf(weekday);
  const add = idx === 0 ? 0 : 7 - idx;
  const base = new Date(date + "T12:00:00Z");
  base.setUTCDate(base.getUTCDate() + add);
  return base.toISOString().slice(0, 10);
}

// Convert a wall-clock time in America/New_York to a UTC instant
function etToUtc(dateStr: string, h: number, m: number) {
  const guess = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`,
  );
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(guess);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const asUtc = Date.UTC(+g("year"), +g("month") - 1, +g("day"), +g("hour") % 24, +g("minute"));
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

// True once the Sunday 6:00 AM ET lock for that week has passed
function lockPassed(weekEnding: string) {
  return new Date() >= etToUtc(weekEnding, 6, 0);
}

function previousWeekEnding(weekEnding: string) {
  const d = new Date(weekEnding + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildEmail(name: string, weekEnding: string, isLocked: boolean) {
  const first = (name || "").split(" ")[0] || "there";
  const subject = isLocked
    ? `Overdue: submit your timesheet & invoice — week ending ${fmtDate(weekEnding)}`
    : `Reminder: submit your timesheet & invoice — week ending ${fmtDate(weekEnding)}`;
  const deadlineLine = isLocked
    ? `<p>The submission deadline (Sunday 6:00 AM ET) for this week has <strong>passed</strong>, so this is now <strong>overdue</strong>. Please submit your hours along with your Payoneer invoice link as soon as possible.</p>`
    : `<p>Please log in to the contractor portal and submit your hours along with your Payoneer invoice link. Submissions lock at <strong>6:00 AM ET on Sunday</strong>.</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
    <div style="padding:18px 24px;background:#0f172a;color:#fff;font-weight:600;font-size:16px">Timesheet reminder</div>
    <div style="padding:22px 24px;font-size:14px;line-height:1.6">
      <p>Hi ${first},</p>
      <p>We haven't received your timesheet and invoice for the week ending <strong>${fmtDate(weekEnding)}</strong>.</p>
      ${deadlineLine}
      <p><a href="https://outstahub.com/portal" style="display:inline-block;padding:10px 16px;background:#0ABEDF;color:#fff;text-decoration:none;border-radius:6px">Open contractor portal</a></p>
      <p>If you've already submitted, you can ignore this message.</p>
      <p>Thanks,<br/>The OutSta Team</p>
    </div>
    <div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb">OutSta &mdash; automated reminder</div>
  </div></body></html>`;
  return { subject, html };
}

// Start of the Monday-based week that ends on `weekEnding` (a Sunday)
function weekStartFor(weekEnding: string) {
  const d = new Date(weekEnding + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6);
  return d.toISOString().slice(0, 10);
}

async function findNonSubmitters(weekEnding: string, onlyIds?: string[]) {
  const { data: assignments, error } = await supabase
    .from("contractor_assignments")
    .select("id, client_id, job_title, status, start_date, applicant_id")
    .in("status", ["active", "rendering"]);
  if (error) throw error;

  let list = (assignments || [])
    .filter((a: any) => a.client_id !== INTERNAL_CLIENT_ID)
    .filter((a: any) => !a.start_date || a.start_date <= weekEnding);
  if (onlyIds) list = list.filter((a: any) => onlyIds.includes(a.id));
  if (!list.length) return [];

  const ids = list.map((a: any) => a.id);
  // Contractors can log a week-ending date anywhere inside the week (Fri/Sat/Sun),
  // so treat any submission within the Mon-Sun window as submitted.
  const { data: submitted } = await supabase
    .from("contractor_timesheets")
    .select("contractor_assignment_id")
    .gte("week_ending_date", weekStartFor(weekEnding))
    .lte("week_ending_date", weekEnding)
    .in("contractor_assignment_id", ids);
  const submittedIds = new Set((submitted || []).map((t: any) => t.contractor_assignment_id));

  const pending = list.filter((a: any) => !submittedIds.has(a.id));
  if (!pending.length) return [];

  const applicantIds = pending.map((a: any) => a.applicant_id).filter(Boolean);
  const { data: applicants } = await supabase
    .from("applicants_prescreen")
    .select("id, full_name, email")
    .in("id", applicantIds.length ? applicantIds : ["00000000-0000-0000-0000-000000000000"]);
  const byId = new Map((applicants || []).map((a: any) => [a.id, a]));

  return pending
    .map((a: any) => ({
      assignmentId: a.id,
      name: byId.get(a.applicant_id)?.full_name || "Contractor",
      email: byId.get(a.applicant_id)?.email || null,
    }))
    .filter((r: any) => !!r.email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const weekEnding: string = body.weekEnding || currentWeekEnding();
    const onlyIds: string[] | undefined = Array.isArray(body.assignmentIds) ? body.assignmentIds : undefined;

    const targets = await findNonSubmitters(weekEnding, onlyIds);
    console.log("reminders", { weekEnding, requested: onlyIds?.length ?? "all", targets: targets.length });
    if (body.dryRun) {
      return new Response(
        JSON.stringify({ success: true, dryRun: true, weekEnding, total: targets.length, targets }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    let sent = 0;
    const failures: string[] = [];

    for (const t of targets) {
      const { subject, html } = buildEmail(t.name, weekEnding);
      try {
        await transporter.sendMail({ from: FROM, to: t.email, subject, html });
        sent++;
        await supabase.from("contractor_email_logs").insert({
          contractor_assignment_id: t.assignmentId,
          subject,
          body_html: html,
          recipient_email: t.email,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      } catch (e: any) {
        console.error("reminder send failed", t.email, e);
        failures.push(t.email);
      }
    }

    return new Response(JSON.stringify({ success: true, weekEnding, total: targets.length, sent, failures }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("send-timesheet-reminders error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
