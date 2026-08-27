// Notify timesheet & leave events via email
// Events: timesheet_submitted, timesheet_resubmitted, timesheet_approved, timesheet_flagged, leave_submitted
import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import nodemailer from "npm:nodemailer@6.9.14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType =
  | "timesheet_submitted"
  | "timesheet_resubmitted"
  | "timesheet_approved"
  | "timesheet_flagged"
  | "leave_submitted"
  | "legal_doc_submitted";

interface Payload {
  event: EventType;
  timesheetId?: string;
  leaveId?: string;
  legalDocRequestId?: string;
  reason?: string;
  reviewerName?: string;
  source?: "client" | "admin";
}

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

function wrap(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,sans-serif;color:#1f2937">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
    <div style="padding:18px 24px;background:#0f172a;color:#fff;font-weight:600;font-size:16px">${title}</div>
    <div style="padding:22px 24px;font-size:14px;line-height:1.6">${inner}</div>
    <div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb">OutSta &mdash; automated notification</div>
  </div></body></html>`;
}

async function send(to: string | string[], cc: string[] | undefined, subject: string, html: string) {
  const recipients = Array.isArray(to) ? to : [to];
  const clean = recipients.filter(Boolean);
  if (clean.length === 0) return;
  try {
    await transporter.sendMail({
      from: FROM,
      to: clean,
      cc: cc?.filter(Boolean),
      subject,
      html,
    });
    console.log("Sent:", subject, "->", clean);
  } catch (e) {
    console.error("Send failed:", subject, e);
  }
}

async function getAdminEmails(): Promise<string[]> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "super_admin"]);
  const ids = Array.from(new Set((roles || []).map((r: any) => r.user_id)));
  const emails: string[] = [];
  for (const id of ids) {
    try {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user?.email) emails.push(data.user.email);
    } catch (e) {
      console.error("admin lookup failed", id, e);
    }
  }
  return Array.from(new Set(emails));
}

async function getClientEmails(clientId: string): Promise<string[]> {
  const { data } = await supabase
    .from("client_portal_users")
    .select("primary_email, secondary_email, email")
    .eq("client_id", clientId);
  const out: string[] = [];
  (data || []).forEach((u: any) => {
    if (u.primary_email) out.push(u.primary_email);
    else if (u.email) out.push(u.email);
    if (u.secondary_email) out.push(u.secondary_email);
  });
  return Array.from(new Set(out.filter(Boolean)));
}

async function loadTimesheet(id: string) {
  const { data, error } = await supabase
    .from("contractor_timesheets")
    .select("id, week_ending_date, total_hours, overtime_hours, incentive_amount, notes, daily_hours, client_flag_reason, contractor_assignment_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Timesheet not found: " + (error?.message || id));

  const { data: assign } = await supabase
    .from("contractor_assignments")
    .select("id, applicant_id, client_id, job_title")
    .eq("id", data.contractor_assignment_id)
    .maybeSingle();

  let applicant: any = null;
  let client: any = null;
  if (assign?.applicant_id) {
    const { data: a } = await supabase
      .from("applicants_prescreen")
      .select("full_name, email")
      .eq("id", assign.applicant_id)
      .maybeSingle();
    applicant = a;
  }
  if (assign?.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("company_name")
      .eq("id", assign.client_id)
      .maybeSingle();
    client = c;
  }
  return { ts: data, assign, applicant, client };
}

function fmtDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

function fmtTime12(t: string) {
  // Convert "HH:MM" or "H:MM" to 12-hour "h:mm AM/PM"
  if (!t || typeof t !== "string") return t;
  const [hStr, mStr] = t.split(":");
  if (!hStr || !mStr) return t;
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = m.toString().padStart(2, "0");
  return `${h}:${mm} ${ampm}`;
}

function dailyTable(daily: Record<string, any> | null | undefined) {
  if (!daily) return "";
  const keys = Object.keys(daily).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  if (!keys.length) return "";
  const hasReason = keys.some((k) => (daily[k]?.reason || "").toString().trim().length > 0);
  const rows = keys.map((k) => {
    const d = daily[k] || {};
    const t1 = d.time_in && d.time_out ? `${fmtTime12(d.time_in)}–${fmtTime12(d.time_out)}` : "";
    const extras = Array.isArray(d.shifts) && d.shifts.length
      ? d.shifts
      : (d.time_in_2 && d.time_out_2 ? [{ time_in: d.time_in_2, time_out: d.time_out_2 }] : []);
    const t2 = extras
      .filter((s: any) => s?.time_in && s?.time_out)
      .map((s: any) => ` &nbsp;|&nbsp; ${fmtTime12(s.time_in)}–${fmtTime12(s.time_out)}${s.note ? ` (${String(s.note).replace(/</g, "&lt;")})` : ""}`)
      .join("");
    const reasonCell = hasReason ? `<td style="padding:8px 12px;border-bottom:1px solid #eef0f3;color:#475569;vertical-align:top">${(d.reason || "").toString().replace(/</g, "&lt;")}</td>` : "";
    return `<tr>
      <td style="width:28%;padding:8px 12px;border-bottom:1px solid #eef0f3;vertical-align:top;white-space:nowrap">${d.weekday || ""} ${fmtDate(k)}</td>
      <td style="width:14%;padding:8px 12px;border-bottom:1px solid #eef0f3;vertical-align:top;white-space:nowrap">${Number(d.hours || 0).toFixed(2)} hrs</td>
      <td style="width:32%;padding:8px 12px;border-bottom:1px solid #eef0f3;color:#475569;vertical-align:top;white-space:nowrap">${t1}${t2}</td>
      ${reasonCell}
    </tr>`;
  }).join("");
  const reasonHead = hasReason ? `<th style="width:26%;padding:8px 12px">Reason</th>` : "";
  return `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px"><thead><tr style="background:#f1f5f9;text-align:left"><th style="width:28%;padding:8px 12px">Day</th><th style="width:14%;padding:8px 12px">Hours</th><th style="width:32%;padding:8px 12px">Time</th>${reasonHead}</tr></thead><tbody>${rows}</tbody></table>`;
}

function timesheetSummary(ts: any, applicant: any, client: any) {
  return `
    <p><strong>Contractor:</strong> ${applicant?.full_name || "—"}<br/>
    <strong>Client:</strong> ${client?.company_name || "—"}<br/>
    <strong>Week ending:</strong> ${fmtDate(ts.week_ending_date)}<br/>
    <strong>Total hours:</strong> ${Number(ts.total_hours || 0).toFixed(2)}<br/>
    <strong>Overtime hours:</strong> ${Number(ts.overtime_hours || 0).toFixed(2)}<br/>
    <strong>Incentive:</strong> $${Number(ts.incentive_amount || 0).toFixed(2)}</p>
    ${dailyTable(ts.daily_hours)}
    ${ts.notes ? `<p><strong>Notes:</strong><br/>${String(ts.notes).replace(/\n/g, "<br/>")}</p>` : ""}
  `;
}

// Client-facing summary — mirrors the client portal view.
// Excludes pay/rate/incentive fields. Strips payoneer links and placeholder note links from notes.
function timesheetSummaryForClient(ts: any, applicant: any, client: any) {
  const cleanedNotes = (ts.notes || "")
    .replace(/https?:\/\/(?:www\.)?payoneer\.com\/[^\s<>"']*/gi, "")
    .replace(/https?:\/\/[^\s<>"']*/gi, "")
    .replace(/payoneer\.com\/[^\s<>"']*/gi, "")
    .trim();
  return `
    <p><strong>Contractor:</strong> ${applicant?.full_name || "—"}<br/>
    <strong>Client:</strong> ${client?.company_name || "—"}<br/>
    <strong>Week ending:</strong> ${fmtDate(ts.week_ending_date)}<br/>
    <strong>Total hours:</strong> ${Number(ts.total_hours || 0).toFixed(2)}</p>
    ${dailyTable(ts.daily_hours)}
    ${cleanedNotes ? `<p><strong>Contractor notes:</strong><br/>${cleanedNotes.replace(/\n/g, "<br/>")}</p>` : ""}
  `;
}

async function handleTimesheetEvent(event: EventType, timesheetId: string, reason?: string, reviewerName?: string) {
  const { ts, applicant, client, assign } = await loadTimesheet(timesheetId);
  const contractorEmail = applicant?.email;
  const contractorName = applicant?.full_name || "Contractor";
  const company = client?.company_name || "your client";
  const summary = timesheetSummary(ts, applicant, client);

  if (event === "timesheet_submitted" || event === "timesheet_resubmitted") {
    const isResub = event === "timesheet_resubmitted";

    // Auto-fire Payoneer verification server-side (guarantees it runs even if
    // the contractor's browser cached old code or closed the tab).
    try {
      const payoneerMatch = (ts.notes || "").match(/https?:\/\/(?:link\.|app\.)?payoneer\.com\/\S+/i);
      if (payoneerMatch) {
        supabase.functions
          .invoke("verify-payoneer-invoice", {
            body: { url: payoneerMatch[0], timesheetId: ts.id },
          })
          .catch((e) => console.error("payoneer auto-verify failed:", e));
      }
    } catch (e) {
      console.error("payoneer auto-verify setup failed:", e);
    }

    // Contractor confirmation
    await send(
      contractorEmail,
      undefined,
      isResub
        ? `Your updated timesheet was received — week ending ${fmtDate(ts.week_ending_date)}`
        : `Timesheet submitted — week ending ${fmtDate(ts.week_ending_date)}`,
      wrap(
        isResub ? "Updated timesheet received" : "Timesheet submitted",
        `<p>Hi ${contractorName},</p><p>${isResub ? "We received your updated timesheet for the previously flagged week." : "We received your timesheet submission. Here's a quick summary:"}</p>${summary}<p>If anything looks off, log in to the portal and edit before it gets approved.</p>`
      )
    );

    // Client notification
    const clientEmails = assign?.client_id ? await getClientEmails(assign.client_id) : [];
    if (clientEmails.length) {
      await send(
        clientEmails,
        undefined,
        isResub
          ? `Updated timesheet from ${contractorName} — week ending ${fmtDate(ts.week_ending_date)}`
          : `New timesheet from ${contractorName} — week ending ${fmtDate(ts.week_ending_date)}`,
        wrap(
          isResub ? "Updated timesheet to review" : "New timesheet to review",
          `<p>Hello,</p><p>${contractorName} ${isResub ? "submitted an updated timesheet for the previously flagged week" : "submitted a new timesheet"}. Please review and approve or flag in your client portal.</p>${timesheetSummaryForClient(ts, applicant, client)}<p><a href="https://outstaworkforce.com/client" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px">Open client portal</a></p>`
        )
      );
    }
    return;
  }

  if (event === "timesheet_approved") {
    await send(
      contractorEmail,
      ["liezl@outsta.io"],
      `Timesheet approved — week ending ${fmtDate(ts.week_ending_date)}`,
      wrap(
        "Timesheet approved ✅",
        `<p>Hi ${contractorName},</p><p>Your timesheet for the week ending <strong>${fmtDate(ts.week_ending_date)}</strong> has been approved${reviewerName ? ` by ${reviewerName}` : ""}.</p>${summary}<p>Thanks for keeping things on time!</p>`
      )
    );
    return;
  }

  if (event === "timesheet_flagged") {
    const reasonHtml = reason ? `<p><strong>Reason:</strong><br/>${reason.replace(/\n/g, "<br/>")}</p>` : "";
    await send(
      contractorEmail,
      undefined,
      `Action needed: timesheet flagged — week ending ${fmtDate(ts.week_ending_date)}`,
      wrap(
        "Your timesheet was flagged ⚠️",
        `<p>Hi ${contractorName},</p><p>Your timesheet for the week ending <strong>${fmtDate(ts.week_ending_date)}</strong> (with ${company}) has been flagged${reviewerName ? ` by ${reviewerName}` : ""} and requires your attention.</p>${reasonHtml}${summary}<p>Please log in to the contractor portal, edit your submission, and resubmit.</p><p><a href="https://outstahub.com/portal" style="display:inline-block;padding:10px 16px;background:#b45309;color:#fff;text-decoration:none;border-radius:6px">Open contractor portal</a></p>`
      )
    );
    return;
  }
}

async function handleLeaveSubmitted(leaveId: string) {
  const { data: leave, error } = await supabase
    .from("contractor_leave_applications")
    .select("*")
    .eq("id", leaveId)
    .maybeSingle();
  if (error || !leave) throw new Error("Leave not found");

  const { data: assign } = await supabase
    .from("contractor_assignments")
    .select("applicant_id, client_id, job_title")
    .eq("id", leave.contractor_assignment_id)
    .maybeSingle();

  let contractorName = "Contractor";
  let contractorEmail: string | null = null;
  let companyName = "—";
  if (assign?.applicant_id) {
    const { data: a } = await supabase
      .from("applicants_prescreen")
      .select("full_name, email")
      .eq("id", assign.applicant_id)
      .maybeSingle();
    if (a?.full_name) contractorName = a.full_name;
    if (a?.email) contractorEmail = a.email;
  }
  if (assign?.client_id) {
    const { data: c } = await supabase.from("clients").select("company_name").eq("id", assign.client_id).maybeSingle();
    if (c?.company_name) companyName = c.company_name;
  }

  const summary = `
    <p><strong>Contractor:</strong> ${contractorName}<br/>
    <strong>Client:</strong> ${companyName}<br/>
    <strong>Role:</strong> ${assign?.job_title || "—"}<br/>
    <strong>Leave date:</strong> ${fmtDate(leave.leave_date)}<br/>
    <strong>Time period:</strong> ${leave.time_period}${leave.specific_time ? ` (${leave.specific_time})` : ""}<br/>
    <strong>Leave type:</strong> ${leave.leave_type || "—"}<br/>
    <strong>Compensation:</strong> ${leave.compensation_type || "—"}${leave.compensation_note ? ` — ${leave.compensation_note}` : ""}</p>
    ${leave.notes ? `<p><strong>Notes:</strong><br/>${String(leave.notes).replace(/\n/g, "<br/>")}</p>` : ""}
    <p><em>Client informed & approved:</em> ${leave.client_informed_approved ? "Yes" : "No"}</p>
  `;

  const subject = `Leave request: ${contractorName} — ${fmtDate(leave.leave_date)}`;
  const html = wrap("New leave request", `<p>A new leave request has been submitted.</p>${summary}`);

  const clientEmails = assign?.client_id ? await getClientEmails(assign.client_id) : [];
  const recipients = [contractorEmail, ...clientEmails].filter(Boolean);
  const cc = ["mark@outsta.io", "liezl@outsta.io"];

  await send(recipients, cc, subject, html);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: Payload = await req.json();
    if (!body?.event) throw new Error("event is required");

    if (body.event === "leave_submitted") {
      if (!body.leaveId) throw new Error("leaveId is required");
      await handleLeaveSubmitted(body.leaveId);
    } else {
      if (!body.timesheetId) throw new Error("timesheetId is required");
      await handleTimesheetEvent(body.event, body.timesheetId, body.reason, body.reviewerName);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    console.error("notify-timesheet-event error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
