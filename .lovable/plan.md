# Client Portal for Timesheet Approval

A new client-facing portal (separate from contractor portal and admin) where clients log in, review their assigned contractors' submitted weekly timesheets, and approve or flag them. Admins set a per-contractor "client rate" markup that drives the invoice totals clients see — contractor pay rates stay hidden.

## Database changes

1. **`contractor_assignments`** — add `client_rate numeric` (what the client sees/pays per hour). Existing `hourly_rate` stays as the contractor's pay rate (admin-only).
2. **`contractor_timesheets`** — add:
   - `client_approval_status text default 'pending'` (`pending` | `approved` | `flagged`)
   - `client_reviewed_at timestamptz`
   - `client_reviewed_by uuid` (auth user id of the client user)
   - `client_flag_reason text`
   - `locked boolean default false` (true once approved → blocks contractor edits)
3. **New table `client_portal_users`**: `id`, `user_id` (auth.users), `client_id` (→ clients), `email`, `must_change_password`, timestamps. Mirrors `contractor_portal_users` pattern.
4. **New security-definer function** `get_my_client_id()` returns the `client_id` for the logged-in client portal user (used in RLS).
5. **RLS updates**:
   - `contractor_timesheets`: add SELECT + UPDATE (approve/flag fields only) policies scoped to timesheets whose contractor assignment's `client_id = get_my_client_id()`.
   - `contractor_assignments`: add SELECT policy for own client (so the portal can list contractors assigned to them); only expose `client_rate`, not `hourly_rate`, by handling at the query/UI layer.
   - `clients`: add SELECT policy for `id = get_my_client_id()` so the portal can show the company name.
   - Contractor UPDATE policy on `contractor_timesheets` tightened: contractors can only update rows where `locked = false`.
6. **Trigger** to set `locked = true` and stamp `client_reviewed_at` when `client_approval_status` flips to `approved`.
7. **Notifications**: insert a row into the existing admin notifications table (or `pending_notifications` if used) when a client approves or flags, so admins get an in-app/email ping via the existing notification pipeline.

## Admin dashboard changes

- In the existing contractor edit dialog (`EditContractorDialog`) and add-contractor dialog, add a **Client Rate** input next to the existing hourly (contractor) rate. Helper text: "Rate billed to the client. Hidden from contractor."
- In the admin PL tab (`PLDashboard` / timesheet submissions table), add a **Client Status** column (Pending / Approved / Flagged badge) and show the flag reason on hover/expand.
- Add an admin-only **override** action to reset a timesheet's `client_approval_status` back to `pending` and unlock it.

## Client portal — new pages

Routes added to `App.tsx`:

- `/client-portal/login` — `ClientPortalLogin.tsx` — separate login (verifies the signed-in user is in `client_portal_users`, else signs out).
- `/client-portal/change-password` — `ClientPortalChangePassword.tsx` — reused pattern from `PortalChangePassword`.
- `/client-portal` — `ClientPortalDashboard.tsx` — main page with two views:
  1. **List view (default)**: table of submitted timesheets from assigned contractors
     - Columns: Contractor, Week Ending, Total Hours, Invoice Total (`client_rate × total_hours + incentive`), Status badge, Actions (View / Approve / Flag)
     - Filters: date range, contractor name search, status filter (All / Pending / Approved / Flagged)
  2. **Detail view**: opened by clicking a row's "View"
     - Read-only daily breakdown (Day, Date, Time In, Time Out, Total Hours, Reason) rendered from `daily_hours` jsonb — reuse the same layout primitives as the contractor portal but disabled
     - Right-side summary panel: hours logged vs expected (progress bar), invoice total, client rate, incentives
     - Bottom action bar: **Approve** (confirm dialog) and **Flag for Review** (small modal that captures `client_flag_reason`)
- Header shows the client company name (from `clients`) and Sign Out, matching the OutSta PL Portal look (white bg, blue accents, card layout). Status badges: Pending gray, Approved green, Flagged amber.

## Admin provisioning of client users

Add a small **"Portal Access"** action on the client detail panel (`ClientDetailPanel`) that calls a new edge function `provision-client-accounts` (mirrors `provision-contractor-accounts`): creates the auth user with default password `OutSta2026!`, inserts into `client_portal_users` with `must_change_password = true`. No email is sent — admin shares credentials manually (same convention as contractor portal).

## Edge functions

- `provision-client-accounts` — creates auth user + `client_portal_users` row for one or more contacts of a client.
- `notify-admin-timesheet-review` — invoked after approve/flag; inserts admin notification + (optional) email via existing transactional email path. Falls back to DB row if email infra not configured for this event.

## Frontend file list

- `src/pages/ClientPortalLogin.tsx`
- `src/pages/ClientPortalChangePassword.tsx`
- `src/pages/ClientPortalDashboard.tsx`
- `src/components/client-portal/TimesheetListTable.tsx`
- `src/components/client-portal/TimesheetDetailView.tsx`
- `src/components/client-portal/FlagTimesheetDialog.tsx`
- Edits: `src/App.tsx` (routes), `src/components/clients/EditContractorDialog.tsx` + `AddContractorDialog.tsx` (client rate field), `src/components/PLDashboard.tsx` (client status column + override), `src/components/clients/ClientDetailPanel.tsx` (provision portal access button).

## Rules enforced

- Client queries never select `hourly_rate` from `contractor_assignments` — only `client_rate`. RLS + careful `.select()` lists.
- Once `client_approval_status = approved`, `locked = true` and contractor UPDATE policy blocks edits.
- Clients only see assignments where `client_id = get_my_client_id()`.
- Admins can override approval (reset status + unlock) from PL dashboard.

## Out of scope (call out)

- Bulk approve across multiple weeks (single-week approve only for v1).
- Client-side editing of hours (read-only by design).
- Multi-contact role permissions inside a single client (any client portal user can approve for the company).

Confirm and I'll implement.
