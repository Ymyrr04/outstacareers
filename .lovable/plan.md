## Post-Hire Contractor Pipeline

### 1. Database Tables
- **`contractor_pipeline_stages`** — Define milestone columns (e.g., Onboarding → Week 1 Check-in → Month 1 Review → Month 3 Review → Settled). Each has a name, emoji, order, and `trigger_days` (days after start_date to auto-move).
- **`contractor_pipeline_tracking`** — Track each active contractor's current stage, with `contractor_assignment_id`, `current_stage_id`, `moved_at`, and `auto_moved` flag.
- **`contractor_checkin_emails`** — Log check-in emails sent per milestone per contractor, with status and sent_at.

### 2. Milestone Stages (Seeded)
| Stage | Trigger (days after start) |
|---|---|
| Onboarding | 0 |
| Week 1 Check-in | 7 |
| Week 2 Check-in | 14 |
| Month 1 Review | 30 |
| Month 2 Review | 60 |
| Month 3 Review | 90 |
| Settled | 120 |

### 3. Kanban Board UI
- New admin tab: **"Post-Hire Pipeline"**
- Cards grouped by **client** showing contractor name, job title, start date, weeks elapsed
- Drag-and-drop between columns (manual override)
- Auto-advance based on days elapsed from `start_date`

### 4. Client Check-in Emails
- At each milestone, an email is sent to the **client's primary contact** asking about the contractor's performance
- Uses your existing Gmail sending infrastructure (Mark's email)
- Email template with placeholders: `{{client_name}}`, `{{contractor_name}}`, `{{milestone}}`, `{{weeks_elapsed}}`
- Edge function to process milestones daily and send check-in emails

### 5. Auto-Move Logic
- A scheduled edge function runs daily, checks each active contractor's `start_date` vs today
- Moves contractors to the appropriate milestone stage
- Triggers the check-in email when a contractor enters a new stage

Does this plan look good? Any milestones you'd like to add, remove, or rename?