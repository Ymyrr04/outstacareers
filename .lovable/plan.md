# Help Desk Content Plan — Correct Questions & Coverage

Goal: turn the help assistant's draft answers into a verified, complete knowledge base of the questions admins actually ask, with correct wording that matches the real screens.

## Phase 1 — Verify what's already there (35 answers)

Go through each existing answer against the actual screens and fix any wrong button names, tab names, or steps:

- **Applicants** (7): search/Boolean, status changes, CV/IV/QA scores, rescore, bulk CV upload, "Nx applied" badge, notes, multiple profiles
- **Pipeline** (5): Kanban board, availability check, link to client pipeline, linked-clients badge, pre-pitch
- **Clients** (3): hiring requests, comments & mentions, analytics
- **Contractors** (5): statuses, Hired flow, bulk email, post-hire pipeline, Internal Team visibility
- **Timesheets** (3): weekly flow, portal login, locked timesheets
- **Contracts** (4): send, find/download, resend link, audit trail
- **Legal Docs** (4): requests panel, COE, PDC, approve & send
- **Admin** (5): add admin, tab permissions, forgot password, Gmail app password, notifications

Deliverable: corrected `helpArticles.ts`, every answer matching the real UI labels.

## Phase 2 — Fill the gaps (new questions)

Topic areas not yet covered, drafted from how the features actually work:

- **Interviews & Assessments** — starting an interview session, timers, paste tracking/WPM, 3 voice + 1 text weighting, session retention
- **Talent Pool** — the /talent-pool signup pipeline, statuses, notifications, moving people out of the pool
- **Sourcing / External Scout** — Apollo candidate sourcing, importing external candidates, placeholders
- **Email & Inbox** — threaded replies, Gmail sync, sender accounts (multi-admin), what to do when sync stops
- **Recruiter Dash / Funnel** — funnel view, historical data filter, role selector syncing
- **Client Detail pages** — active vs previous contractors, hiring request duplication
- **Contractors tab extras** — filters, templates, CV image preview, applicant contact editing
- **Portal (contractor side)** — what contractors see, default password, timesheet lock deadline
- **Billing & Plans** — credit usage, downgrade policy
- **Troubleshooting** — "something looks stuck/old" (refresh), who to contact, common error messages

## Phase 3 — Learn the real questions (optional but recommended)

Add a tiny feedback loop so the knowledge base improves itself:

- "Was this helpful?" Yes/No under each answer
- Log every search that returns no good match to a `help_queries` table, so we can see exactly what admins type and add those questions
- Review the log monthly and add the top misses

## Phase 4 — Your review

- You read through the full question list (I'll present it grouped by topic in the help panel order)
- You flag wrong wording, missing questions, or things only certain admins should see
- Final pass applied, build + bug check

## Out of scope

- No AI answers (stays free, keyword-matched)
- No changes to any feature screens — content only
- Admin visibility rules stay as they are

## Technical notes

- Content lives in `src/lib/helpArticles.ts`; UI in `src/components/HelpDeskWidget.tsx`
- Phase 3 adds one table (`help_queries`: id, query, matched boolean, created_at) with RLS + grants, written from the widget
- Bug check after each phase: type check, build log, click-through in preview
