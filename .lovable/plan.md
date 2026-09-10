# Plan: Contractor Time Tracking with Desktop Agent

## Goal
Add an integrated time-tracking tool that contractors use from their existing portal, plus a lightweight desktop agent for deeper activity monitoring. Contractors clock in/out, pause/break, and add task notes. The desktop agent captures random screenshots every 15–20 minutes, tracks application/window titles, logs idle time, and records active browser URLs. Admins review aggregated daily/weekly reports inside the ATS rather than downloading timesheets.

## Decisions made
- **Scope:** Web portal tracker first, plus an Electron desktop agent for screenshots, app/window titles, idle detection, and browser URL logs.
- **Screenshot cadence:** Randomized 15–20 minute intervals while the agent is running and a session is active.
- **Admin view:** End-of-day/week reporting, not a live "who's online" dashboard, to keep backend usage low.
- **Storage:** Screenshots uploaded to backend storage; logs written as batched events.

## Phase 1 — Web time tracker in contractor portal

### What it does
- New "Time Tracker" tab inside `/portal` (only for contractors with an active assignment).
- Simple controls: Clock In, Clock Out, Pause/Resume, Start Break / End Break.
- Task notes per work block.
- Detects idle time only while the portal tab is open (mouse/keyboard inactivity), and prompts the contractor to confirm whether idle time should be kept or discarded.
- Stores time entries in a new `contractor_time_entries` table linked to `contractor_assignment_id`.
- A weekly summary view shows total hours, idle time, and manual notes.

### Data model
- `contractor_time_entries`
  - `id` uuid primary key
  - `contractor_assignment_id` uuid -> contractor_assignments(id) on delete cascade
  - `entry_type` enum: 'clock_in', 'clock_out', 'pause', 'resume', 'break_start', 'break_end', 'note'
  - `occurred_at` timestamptz default now()
  - `note` text nullable
  - `source` text default 'web'
  - `idle_seconds` int nullable (when a pause is due to idle detection)
  - created_by, updated_at as usual

### UI changes
- Add `TimeTracker.tsx` component rendered as a tab in `PortalDashboard.tsx`.
- Compact widget: current status, elapsed timer, action buttons, recent activity list.
- Optional: a small floating timer widget contractors can keep open while working.

### Backend
- Migration creates `contractor_time_entries` with GRANTs, RLS enabled.
- Policies: contractors insert/select/update their own rows; admins select all rows for their managed contractors.
- Edge function `submit-time-entry` validates the entry sequence (cannot clock in twice without clocking out, etc.).

### PL integration
- Weekly reported hours from `contractor_time_entries` feed into the existing P&L report as an additional "tracked hours" column, without replacing the current manual timesheet flow until you decide to deprecate it.

## Phase 2 — Desktop agent (Electron)

### What it does
- Contractors install a small desktop app (Windows/Mac/Linux packages as `.zip`/`.tar.gz`).
- The agent asks for explicit consent on first run and runs as a tray app.
- When the contractor clicks "Start tracking" (or it auto-starts based on the portal session), it:
  - Records a timestamped activity log every 60 seconds:
    - active window title
    - active application name
    - current browser URL (via a companion browser extension or OS-level hooks where possible)
  - Detects idle time from mouse/keyboard inactivity.
  - Captures a full-screen screenshot at a random interval between 15 and 20 minutes while the session is active.
  - Batches logs locally and flushes to the backend every 5 minutes or when the batch reaches 100 records.

### Agent architecture
- Built with Electron, `contextIsolation: true`, `nodeIntegration: false`.
- Main process handles screenshots, idle detection, window/app title collection, and uploads.
- Renderer process is a minimal authenticated web view that loads the existing `/portal` tracker UI, so the agent reuses the same session and UI.
- `preload.cjs` exposes a secure IPC API for:
  - `startSession(token, assignmentId)`
  - `stopSession()`
  - `captureScreenshot()`
  - `getIdleTime()`
  - `getActiveWindowInfo()`
  - `flushLogs(logs)`

### Browser URL logging
- A companion browser extension (Manifest V3) sends the active tab URL to the agent via native messaging or a local HTTP/WebSocket server.
- If native messaging is too complex for the first version, the extension can send URLs directly to a dedicated edge function endpoint, authenticated with the same session token.

### Screenshot handling
- Screenshots saved as JPEG, quality 80, resized to 1920px width.
- Uploaded to backend storage under `time-tracking-screenshots/{assignment_id}/{date}/{uuid}.jpg`.
- A `contractor_screenshots` table records metadata: `contractor_assignment_id`, `session_id`, `captured_at`, `storage_path`, `active_window_title`, `idle_at_capture` boolean.
- Old screenshots auto-deleted after 90 days via a nightly edge function or cron.

### Data model additions
- `contractor_activity_logs`
  - `id` uuid primary key
  - `contractor_assignment_id` uuid -> contractor_assignments(id)
  - `session_id` uuid
  - `logged_at` timestamptz
  - `app_name` text
  - `window_title` text
  - `browser_url` text nullable
  - `idle_seconds` int default 0
  - `source` text default 'desktop_agent'
- `contractor_tracking_sessions`
  - `id` uuid primary key
  - `contractor_assignment_id` uuid
  - `started_at` timestamptz
  - `ended_at` timestamptz nullable
  - `total_idle_seconds` int default 0
  - `status` enum: 'active', 'paused', 'ended'
- `contractor_screenshots`
  - `id` uuid primary key
  - `contractor_assignment_id` uuid
  - `session_id` uuid -> contractor_tracking_sessions(id)
  - `captured_at` timestamptz
  - `storage_path` text
  - `window_title` text
  - `idle_at_capture` boolean default false

### Auth & security
- Agent receives a short-lived session token from the portal (e.g., token valid for 24 hours).
- All agent API calls include this token; backend verifies it with a `verify_time_tracking_token` edge function.
- Screenshots and activity logs are only accessible to the assigned contractor and authorized admins.

## Phase 3 — Admin reporting dashboard

### What it does
- New "Time Tracking" sub-tab under the existing PL/contractors section in the admin dashboard.
- Weekly table per contractor: scheduled hours, tracked hours, idle time, break time, screenshots count, flagged gaps.
- Daily drill-down: timeline of clock in/out, breaks, app/URL activity list, and thumbnail gallery of screenshots.
- Filters: client, contractor, date range, flagged-only (e.g., idle > threshold, missing screenshots).
- No real-time "live now" view; data refreshes when the admin opens the report.

### UI changes
- New `TimeTrackingReport.tsx` component.
- Add route `/admin/time-tracking` (or tab inside existing admin layout).
- Screenshot thumbnails lazy-loaded; click to expand.

### Backend
- Edge function `get-time-tracking-summary` aggregates entries, logs, and screenshots for a date range.
- Edge function `flag-tracking-anomalies` identifies contractors with > 30 minutes idle in a session, missing screenshots, or clocked-in time exceeding scheduled hours by a threshold.

## Privacy and consent
- Contractors must opt in via a clear consent dialog before desktop tracking starts.
- Consent is recorded in `contractor_tracking_consents` table with timestamp and version.
- Contractors can pause/stop tracking at any time from the agent or portal.
- Screenshots are accessible only to the contractor and their authorized admins; never shared with clients unless explicitly configured.
- No keystroke logging, no credential capture, no audio/video recording.

## Credit and cost notes
- Web tracker: low credit use — only writes on start/stop/pause/break/note events.
- Desktop agent: moderate credit use from storage uploads and batched log writes. A contractor working 8 hours/day with screenshots every ~17 minutes produces roughly 28 screenshots/day. At 100 contractors, that is ~2,800 screenshots/day plus activity logs.
- Storage and egress will be the main variable cost, not function invocations.
- The existing large Cloud compute instance is a fixed daily cost and will not increase due to this feature.
- Recommendation: add a 90-day screenshot retention policy and batch agent uploads aggressively.

## Monthly per-contractor credit estimate

Assumptions: one active contractor, 22 working days/month, 8 hours/day, 4-6 web tracker events/day, desktop agent logging every 60 seconds, screenshots every 15-20 minutes (avg 28/day), 200 KB JPEG per screenshot.

| Cost driver | Events / month | Estimate per contractor / month | Notes |
|---|---|---|---|
| Web tracker event writes | ~110 events | 0.2 - 1 credit | Clock in/out, breaks, notes. Tiny if no AI involved. |
| Desktop activity log flushes | ~110 batches | 0.5 - 2 credits | Batched every 100 records or 5 minutes. |
| Screenshot uploads | ~616 screenshots | 3 - 8 credits | Storage is the bulk; depends on compression and retention. |
| Screenshot storage (ongoing) | ~12 GB new/month | 2 - 6 credits | Heavily depends on retention period; 90-day retention keeps this bounded. |
| Admin egress (viewing reports) | variable | 1 - 5 credits | Thumbnails and CSV exports; scales with admin usage, not contractor count. |
| **Total per active contractor** | — | **~7 - 22 credits/month** | Lower end = light admin review + efficient compression; higher end = heavy reporting or longer retention. |

### Scaling example
- 10 active contractors: ~70 - 220 credits/month
- 50 active contractors: ~350 - 1,100 credits/month
- 100 active contractors: ~700 - 2,200 credits/month

### How to keep it at the low end
- Compress screenshots to JPEG quality 70-80 and cap width at 1280px.
- Enforce 90-day screenshot retention (auto-delete older captures).
- Batch activity logs into 5-minute or 100-record flushes, not per-minute flushes.
- Build thumbnail proxies so admins do not repeatedly download full-resolution images.
- Cache report summaries; avoid recalculating totals on every page view.

## Rollout order
1. Build the web tracker and `contractor_time_entries` table; let contractors use it immediately.
2. Build the Electron agent with screenshots, idle detection, and activity logs; keep it optional.
3. Add browser extension for URL tracking; if complexity is too high, defer it.
4. Build the admin weekly/daily reporting dashboard.
5. Add anomaly flags and retention cleanup after reporting is stable.

## Out of scope for this plan
- Live admin "who is online now" view.
- Client-facing time reports.
- Payroll automation or automatic invoice generation.
- Mobile time-tracking app.
