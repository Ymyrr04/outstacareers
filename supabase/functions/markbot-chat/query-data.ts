// Flexible, read-only lookup over each admin tab's data. Every dataset belongs to a
// tab; a dataset is only offered/answered when the admin is allowed that tab.
// Only whitelisted fields are readable; internal OutSta rows are excluded from
// every count, total and list, matching the reports.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.95.0";
import { authorName, adminIdsByName } from "./authors.ts";

const INTERNAL_CLIENT_ID = "baadbf53-0ca9-4abb-9af1-28f41f415bf1";
const MAX_SCAN = 20000;

type Dataset = {
  tabs: string[]; // any of these tabs grants access
  table: string;
  label: string;
  fields: string[];
  search?: string[]; // text fields used by `search`
  dateField?: string;
  // extra select + predicate that marks an internal (OutSta) row
  internal?: { select: string; isInternal: (r: any) => boolean };
};

const viaAssignment = { select: "contractor_assignments(client_id)", isInternal: (r: any) => r.contractor_assignments?.client_id === INTERNAL_CLIENT_ID };

export const DATASETS: Record<string, Dataset> = {
  jobs: { tabs: ["jobs"], table: "jobs", label: "Job postings", dateField: "created_at", search: ["title", "department", "description"],
    fields: ["id", "title", "department", "rate", "region", "is_active", "assigned_admin_id", "client_id", "created_at", "updated_at", "post_to_linkedin", "linkedin_posted_at"] },
  applicants: { tabs: ["applicants", "funnel", "recruiter-dash", "analytics"], table: "applicants_prescreen", label: "Applicants / candidates", dateField: "submitted_at",
    search: ["full_name", "job_title", "location", "ai_summary", "notes"],
    fields: ["id", "full_name", "email", "phone", "location", "job_title", "job_id", "status", "submitted_at", "created_at", "total_score", "role_experience_score", "skills_tools_score", "availability_setup_score", "ranking_status", "years_of_experience", "job_source", "is_available", "availability_checked_at", "is_starred", "employment_status", "start_availability", "can_work_40_50", "us_timezone_ok", "home_office", "currently_working", "tags", "suitable_roles", "pre_screening_flagged", "interview_invite_sent_at", "device_type"] },
  applicant_notes: { tabs: ["applicants"], table: "applicant_notes", label: "Applicant notes", dateField: "created_at", search: ["content"],
    fields: ["id", "applicant_id", "content", "created_by", "created_at"] },
  status_changes: { tabs: ["applicants", "funnel", "analytics"], table: "applicant_status_history", label: "Applicant status changes", dateField: "created_at",
    fields: ["id", "applicant_id", "from_status", "to_status", "changed_by", "created_at"] },
  interviews: { tabs: ["applicants", "recruiter-dash"], table: "interview_sessions", label: "AI interview sessions", dateField: "completed_at", search: ["ai_summary"],
    fields: ["id", "applicant_id", "job_id", "status", "started_at", "completed_at", "overall_score", "experience_score", "technical_score", "communication_score", "situational_score", "ai_summary", "ai_strengths", "ai_concerns", "created_at"] },
  hiring_requests: { tabs: ["pipeline"], table: "client_hiring_requests", label: "Client hiring requests (Pipeline)", dateField: "created_at", search: ["job_title", "industry", "notes"],
    fields: ["id", "client_id", "job_title", "priority", "industry", "client_status", "pipeline_stage", "source", "start_date", "target_end_date", "assigned_admin_id", "hours_per_week", "comment_count", "created_at", "updated_at", "closed_at", "notes"] },
  hiring_request_comments: { tabs: ["pipeline"], table: "hiring_request_comments", label: "Pipeline comments", dateField: "created_at", search: ["content"],
    fields: ["id", "request_id", "user_id", "content", "linked_applicant_id", "created_at"] },
  sales_leads: { tabs: ["sales-pipeline"], table: "sales_leads", label: "Sales leads", dateField: "created_at", search: ["company_name", "contact_name", "role_title", "industry", "original_message"],
    fields: ["id", "company_name", "contact_name", "role_title", "email", "phone", "industry", "team_size", "hiring_urgency", "temperature", "source", "stage", "converted_client_id", "converted_at", "created_by", "created_at", "updated_at", "estimated_hires", "likelihood_to_close", "hiring_type", "contact_1_at", "contact_2_at", "contact_3_at"] },
  sales_lead_notes: { tabs: ["sales-pipeline"], table: "sales_lead_notes", label: "Sales lead notes", dateField: "created_at", search: ["note"],
    fields: ["id", "lead_id", "note", "created_by", "created_at"] },
  post_hire_tracking: { tabs: ["post-hire"], table: "contractor_pipeline_tracking", label: "Post-hire pipeline position per contractor", dateField: "moved_at", search: ["notes"],
    fields: ["id", "contractor_assignment_id", "current_stage_id", "moved_at", "auto_moved", "notes", "created_at"], internal: viaAssignment },
  post_hire_stages: { tabs: ["post-hire"], table: "contractor_pipeline_stages", label: "Post-hire stages",
    fields: ["id", "name", "slug", "stage_order", "trigger_days", "is_system"] },
  clients: { tabs: ["clients"], table: "clients", label: "Clients", dateField: "created_at", search: ["company_name", "industry", "notes"],
    fields: ["id", "company_name", "industry", "website", "address", "leads_from", "is_hiring", "contractor_count", "yearly_increase", "created_at", "notes"],
    internal: { select: "", isInternal: (r: any) => r.id === INTERNAL_CLIENT_ID } },
  client_contacts: { tabs: ["clients"], table: "client_contacts", label: "Client contacts", search: ["full_name", "email", "role"],
    fields: ["id", "client_id", "full_name", "email", "phone", "role", "is_primary", "notes", "created_at"] },
  client_communications: { tabs: ["clients"], table: "client_communications", label: "Client communications log", dateField: "communication_date", search: ["subject", "content"],
    fields: ["id", "client_id", "contact_id", "communication_type", "subject", "content", "communication_date", "created_by"] },
  contractors: { tabs: ["contractors", "clients"], table: "contractor_assignments", label: "Contractor assignments", dateField: "start_date", search: ["job_title", "notes", "separation_note", "country"],
    fields: ["id", "client_id", "applicant_id", "job_title", "hourly_rate", "client_rate", "hours_per_week", "start_date", "end_date", "status", "status_changed_at", "country", "source", "timezone", "regular_work_shift", "is_replacement", "hired_via", "hired_by", "separation_note", "client_deposit", "contractor_deposit", "client_deposit_text", "contractor_deposit_text", "deposit_per_week", "deposit_target", "created_at"],
    internal: { select: "", isInternal: (r: any) => r.client_id === INTERNAL_CLIENT_ID } },
  timesheets: { tabs: ["contractors"], table: "contractor_timesheets", label: "Contractor weekly timesheets", dateField: "week_ending_date",
    fields: ["id", "contractor_assignment_id", "week_ending_date", "total_hours", "overtime_hours", "pl_actual_hours", "incentive_amount", "status", "outsta_status", "client_approval_status", "client_flag_reason", "submitted_at", "locked"], internal: viaAssignment },
  leave_applications: { tabs: ["contractors"], table: "contractor_leave_applications", label: "Contractor leave applications", dateField: "leave_date", search: ["notes", "leave_type_other"],
    fields: ["id", "contractor_assignment_id", "leave_date", "time_period", "leave_type", "status", "reviewed_at", "compensation_type", "client_informed_approved", "notes", "created_at"], internal: viaAssignment },
  legal_doc_requests: { tabs: ["contractors", "contracts"], table: "contractor_legal_doc_requests", label: "Contractor legal document requests (PDC, COE...)", dateField: "created_at",
    fields: ["id", "contractor_assignment_id", "doc_types", "reason", "status", "created_at", "updated_at"], internal: viaAssignment },
  contracts: { tabs: ["contracts"], table: "contract_envelopes", label: "Contracts sent for signature", dateField: "sent_at", search: ["recipient_name", "recipient_email"],
    fields: ["id", "template_id", "recipient_name", "recipient_email", "applicant_id", "contractor_assignment_id", "status", "sent_at", "viewed_at", "signed_at", "voided_at", "voided_reason", "countersigned_at", "expires_at", "sender_email", "created_at"] },
  contract_templates: { tabs: ["contracts"], table: "contract_templates", label: "Contract templates",
    fields: ["id", "name", "description", "page_count", "is_active", "created_at"] },
  pl_rows: { tabs: ["pl"], table: "historical_pl_rows", label: "Historical P&L weekly rows (per contractor per week)", dateField: "week_start", search: ["contractor_name", "company"],
    fields: ["id", "week_start", "week_end", "contractor_name", "company", "hours", "actual_hours", "contractor_rate", "client_rate", "contractor_cost", "client_billing", "margin", "expense_after_1_percent", "income_after_3_percent", "gross_after_deductions", "client_deposit", "contractor_deposit"],
    internal: { select: "", isInternal: (r: any) => String(r.company ?? "").replace(/[\s.]/g, "").toLowerCase().startsWith("outsta") } },
  calendar_events: { tabs: ["calendar"], table: "calendar_events", label: "Calendar events and tasks", dateField: "event_date", search: ["title", "description", "meeting_notes"],
    fields: ["id", "title", "description", "event_date", "start_time", "end_time", "event_type", "created_by", "assigned_to", "is_done", "is_open_task", "is_recurring", "meeting_notes", "claimed_by"] },
  prospects: { tabs: ["outreach", "external-scout", "talent-scout"], table: "outreach_prospects", label: "Outreach / scouted prospects", dateField: "created_at", search: ["full_name", "headline", "current_title", "current_company", "industry"],
    fields: ["id", "full_name", "headline", "current_title", "current_company", "location", "industry", "status", "source", "imported_by", "notes", "converted_lead_id", "created_at"] },
  scheduled_emails: { tabs: ["workflow"], table: "scheduled_emails", label: "Scheduled candidate emails", dateField: "scheduled_for", search: ["subject", "recipient_email"],
    fields: ["id", "applicant_id", "subject", "recipient_email", "scheduled_for", "status", "canceled_at", "created_at"] },
};

const ADMIN_FIELDS = new Set(["assigned_admin_id", "created_by", "changed_by", "user_id", "imported_by", "claimed_by"]);

export const datasetsFor = (tabs: string[]) =>
  Object.entries(DATASETS).filter(([, d]) => d.tabs.some((t) => tabs.includes(t))).map(([k]) => k);

export function queryDataSpec(tabs: string[]) {
  const names = datasetsFor(tabs);
  const catalog = names.map((n) => `- ${n}: ${DATASETS[n].label}. Fields: ${DATASETS[n].fields.join(", ")}`).join("\n");
  return {
    description: `Flexible read-only lookup over the ATS data this admin may see. Use it for any question no dedicated tool covers. Pick a dataset, add filters, and either count, group_by a field (exact counts, optional sum_field totals), or list rows. Ids for clients, applicants, contractors and admins are shown with names. Admin-id fields (assigned_admin_id, created_by, ...) accept an admin's first name as the filter value. Internal OutSta rows are excluded from all results. Datasets:\n${catalog}`,
    parameters: {
      type: "object",
      properties: {
        dataset: { type: "string", enum: names },
        filters: { type: "array", description: "All must match", items: { type: "object", properties: {
          field: { type: "string" },
          op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "is_null", "not_null"] },
          value: { description: "Value (array for 'in'). Dates as YYYY-MM-DD." },
        }, required: ["field", "op"] } },
        search: { type: "string", description: "Text matched (contains) against the dataset's main text fields" },
        mode: { type: "string", enum: ["count", "group", "list"], description: "count = exact total; group = counts per group_by value; list = rows" },
        group_by: { type: "string" },
        sum_field: { type: "string", description: "Numeric field to total (count/group modes)" },
        fields: { type: "array", items: { type: "string" }, description: "Fields to return in list mode (default: all allowed)" },
        order_by: { type: "string" },
        descending: { type: "boolean" },
        limit: { type: "integer", description: "Rows to list, max 25 (default 10)" },
      },
      required: ["dataset", "mode"],
    },
  };
}

async function labelIds(sb: SupabaseClient, rows: any[]) {
  const collect = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const fetchMap = async (ids: string[], table: string, col: string) => {
    const m = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from(table).select(`id, ${col}`).in("id", ids.slice(i, i + 200));
      for (const d of data ?? []) m.set((d as any).id, (d as any)[col]);
    }
    return m;
  };
  const clientIds = collect("client_id").concat(collect("converted_client_id"));
  const applicantIds = collect("applicant_id").concat(collect("linked_applicant_id"));
  const asgIds = collect("contractor_assignment_id");
  const [clients, asg] = await Promise.all([
    clientIds.length ? fetchMap(clientIds, "clients", "company_name") : new Map(),
    asgIds.length ? (async () => {
      const m = new Map<string, any>();
      for (let i = 0; i < asgIds.length; i += 200) {
        const { data } = await sb.from("contractor_assignments").select("id, job_title, applicants_prescreen(full_name), clients(company_name)").in("id", asgIds.slice(i, i + 200));
        for (const d of data ?? []) m.set((d as any).id, d);
      }
      return m;
    })() : new Map(),
  ]);
  const applicants = applicantIds.length ? await fetchMap(applicantIds, "applicants_prescreen", "full_name") : new Map();
  const stageIds = collect("current_stage_id");
  const stages = stageIds.length ? await fetchMap(stageIds, "contractor_pipeline_stages", "name") : new Map();
  for (const r of rows) {
    if (r.client_id) r.client = clients.get(r.client_id) ?? null;
    if (r.converted_client_id) r.converted_client = clients.get(r.converted_client_id) ?? null;
    if (r.applicant_id) r.applicant = applicants.get(r.applicant_id) ?? null;
    if (r.linked_applicant_id) r.linked_applicant = applicants.get(r.linked_applicant_id) ?? null;
    if (r.current_stage_id) r.stage = stages.get(r.current_stage_id) ?? null;
    if (r.contractor_assignment_id) {
      const a = asg.get(r.contractor_assignment_id);
      r.contractor = a?.applicants_prescreen?.full_name ?? null;
      r.contractor_client = a?.clients?.company_name ?? null;
    }
    for (const k of ADMIN_FIELDS) if (typeof r[k] === "string") r[k.replace(/_id$|_by$/, "") + "_name"] = await authorName(sb, r[k]);
    if (Array.isArray(r.assigned_to)) r.assigned_to_names = await Promise.all(r.assigned_to.map((id: string) => authorName(sb, id)));
  }
}

export async function queryData(args: unknown, ctx: { sb: SupabaseClient; allowedTabs: string[] }) {
  const { sb, allowedTabs } = ctx;
  const a = (args ?? {}) as Record<string, any>;
  const name = String(a.dataset ?? "");
  const ds = DATASETS[name];
  if (!ds) return { error: `Unknown dataset "${name}".` };
  if (!ds.tabs.some((t) => allowedTabs.includes(t))) return { error: "no_access", message: "This admin does not have access to that data." };
  const mode = ["count", "group", "list"].includes(a.mode) ? a.mode : "list";
  const allowed = new Set(ds.fields);
  const bad = (f: unknown) => typeof f !== "string" || !allowed.has(f);

  const filters = Array.isArray(a.filters) ? a.filters.slice(0, 12) : [];
  for (const f of filters) if (bad(f?.field)) return { error: `Field "${f?.field}" is not available in ${name}. Available: ${ds.fields.join(", ")}` };
  if (a.group_by && bad(a.group_by)) return { error: `Cannot group by "${a.group_by}".` };
  if (a.sum_field && bad(a.sum_field)) return { error: `Cannot total "${a.sum_field}".` };
  if (a.order_by && bad(a.order_by)) return { error: `Cannot sort by "${a.order_by}".` };
  const listFields = Array.isArray(a.fields) && a.fields.length ? a.fields.filter((f: unknown) => !bad(f)) : ds.fields;
  if (!listFields.includes("id")) listFields.unshift("id");

  // Resolve admin names to ids for admin-id filters.
  const resolved: any[] = [];
  for (const f of filters) {
    let value = f.value;
    if (ADMIN_FIELDS.has(f.field) && typeof value === "string" && !/^[0-9a-f-]{36}$/i.test(value)) {
      const ids = await adminIdsByName(sb, value.slice(0, 100));
      if (!ids.length) return { error: `No admin matched "${value}".` };
      resolved.push({ ...f, op: f.op === "neq" ? "not_in" : "in", value: ids });
      continue;
    }
    resolved.push({ ...f, value });
  }

  const cols = new Set<string>(mode === "list" ? listFields : ["id"]);
  if (a.group_by) cols.add(a.group_by);
  if (a.sum_field) cols.add(a.sum_field);
  if (ds.internal) {
    if (ds.table === "contractor_assignments" || ds.table === "clients") cols.add(ds.table === "clients" ? "id" : "client_id");
    if (ds.table === "historical_pl_rows") cols.add("company");
  }
  const select = [...cols].join(", ") + (ds.internal?.select ? `, ${ds.internal.select}` : "");

  const build = () => {
    let q: any = sb.from(ds.table).select(select);
    for (const f of resolved) {
      const v = f.value;
      switch (f.op) {
        case "eq": q = q.eq(f.field, v); break;
        case "neq": q = q.neq(f.field, v); break;
        case "gt": q = q.gt(f.field, v); break;
        case "gte": q = q.gte(f.field, v); break;
        case "lt": q = q.lt(f.field, v); break;
        case "lte": q = q.lte(f.field, v); break;
        case "contains": q = Array.isArray(v) ? q.contains(f.field, v) : q.ilike(f.field, `%${String(v).replace(/[%_]/g, "")}%`); break;
        case "in": q = q.in(f.field, Array.isArray(v) ? v.slice(0, 200) : [v]); break;
        case "not_in": q = q.not(f.field, "in", `(${(v as string[]).map((x) => `"${x}"`).join(",")})`); break;
        case "is_null": q = q.is(f.field, null); break;
        case "not_null": q = q.not(f.field, "is", null); break;
      }
    }
    if (a.search && ds.search?.length) {
      const s = String(a.search).replace(/[%_,()"]/g, " ").trim().slice(0, 100);
      if (s) q = q.or(ds.search.map((c) => `${c}.ilike."%${s}%"`).join(","));
    }
    return q;
  };

  const limit = Math.min(Math.max(Number(a.limit) || 10, 1), 25);
  const orderBy = a.order_by || ds.dateField || "id";
  const rows: any[] = [];
  let truncated = false;
  if (mode === "list" && !ds.internal) {
    const { data, error } = await build().order(orderBy, { ascending: !a.descending, nullsFirst: false }).limit(limit);
    if (error) return { error: error.message };
    rows.push(...(data ?? []));
  } else {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().order(mode === "list" ? orderBy : "id", { ascending: mode === "list" ? !a.descending : true }).range(from, from + 999);
      if (error) return { error: error.message };
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
      if (rows.length >= MAX_SCAN) { truncated = true; break; }
    }
  }
  const internalCount = ds.internal ? rows.filter(ds.internal.isInternal).length : 0;
  const kept = ds.internal ? rows.filter((r) => !ds.internal!.isInternal(r)) : rows;
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const base: Record<string, unknown> = {
    dataset: name, filters: resolved.map((f) => ({ field: f.field, op: f.op, value: f.value })), search: a.search ?? null,
    ...(internalCount ? { internal_outsta_rows_excluded: internalCount } : {}),
    ...(truncated ? { warning: `Only the first ${MAX_SCAN} rows were scanned; totals may be incomplete.` } : {}),
  };

  if (mode === "count") {
    return { ...base, total: kept.length, ...(a.sum_field ? { [`sum_${a.sum_field}`]: Math.round(kept.reduce((s, r) => s + num(r[a.sum_field]), 0) * 100) / 100 } : {}) };
  }
  if (mode === "group") {
    if (!a.group_by) return { error: "group mode needs group_by." };
    const groups = new Map<string, { count: number; sum: number; sample: any }>();
    for (const r of kept) {
      const raw = r[a.group_by];
      const keys = Array.isArray(raw) ? (raw.length ? raw : [null]) : [raw];
      for (const k of keys) {
        const key = k === null || k === undefined || k === "" ? "(blank)" : String(k);
        const g = groups.get(key) ?? { count: 0, sum: 0, sample: { [a.group_by]: k } };
        g.count++; if (a.sum_field) g.sum += num(r[a.sum_field]);
        groups.set(key, g);
      }
    }
    const samples = [...groups.values()].map((g) => g.sample);
    if (/client_id|applicant_id|assignment_id|stage_id/.test(a.group_by) || ADMIN_FIELDS.has(a.group_by)) await labelIds(sb, samples);
    const out = [...groups.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, 60).map(([key, g]) => {
      const s = g.sample; const label = s.client ?? s.applicant ?? s.contractor ?? s.stage ?? Object.entries(s).find(([k]) => k.endsWith("_name"))?.[1];
      return { value: label ? `${label}` : key, count: g.count, ...(a.sum_field ? { [`sum_${a.sum_field}`]: Math.round(g.sum * 100) / 100 } : {}) };
    });
    return { ...base, total: kept.length, group_by: a.group_by, groups: out, ...(groups.size > 60 ? { note: `${groups.size} groups; showing top 60.` } : {}) };
  }
  const page = kept.slice(0, limit).map((r) => {
    const o: Record<string, unknown> = {};
    for (const f of listFields) o[f] = typeof r[f] === "string" && r[f].length > 600 ? r[f].slice(0, 600) + "…" : r[f];
    return o;
  });
  await labelIds(sb, page);
  return { ...base, ...(ds.internal ? { total_matching: kept.length } : {}), rows: page };
}
