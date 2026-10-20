# Roadmap
- [ ] Add deposit-status review and individual selection before Payoneer extraction; verify selected-only download.
- [x] Add Payoneer extraction to weekly submissions with only name, Payoneer email, invoice amount, bonus amount and invoice week; verified signed-in CSV download and three tests.
- [x] Tick "Add to calendar" by default when a candidate moves from Qualified to For Interview; verified in the browser without moving a real candidate.
- [x] Add Cancel beside Save note to restore the original candidate stage without saving notes or calendar activities; verified cancellation and failed-restore retry with real-record writes blocked.
- [x] Add shared named stage-note templates with save, load, delete and fresh question answers; verify without moving real candidates.

- [x] Show the client in the Role Pipeline "All Roles" candidate card role label, with a full-text tooltip.

- [x] Make Role Pipeline job-based, preserve legacy title links and unlinked candidates, and verify duplicate-job filters.

- [x] Add contractor Announcement tab to reread the acknowledged payment update.

- [x] Add contractor-only payment notice with saved acknowledgement required before portal access and timesheet submission.

- [x] Compare underlying selected weekly datasets in the P&L analyst summary, retaining bullet points and data-sensitive caching.

- [x] Show OutSta rows last in historical weekly details and sync previews without adding them to headcount or external totals.

- [x] Allow text as well as numbers in weekly P&L client and contractor deposit cells.
- [x] List current help desk questions & answers for review
- [ ] Help desk answer review — awaiting user feedback on wording and missing questions
- [x] Let admins choose the display name for availability-check emails across send entry points
- [x] Map historical uploads to the listed 13 spreadsheet columns, including optional financial fields
- [x] Contractors table: add optional hidden-by-default columns (client rate + other hiring fields) to the column toggle
- [x] Move Historical P&L data helpers into src/lib/historicalData.ts without changing cache keys, totals or headcount output.

- [x] RM Resources: shared file uploads for all admins, indexed into Markbot knowledge
- [x] Index RM resource guides: allow resource entries in the knowledge checks and let guides jump the indexing queue
- [x] Tighten Markbot tool access: role requirements open with Jobs access; candidate status hides hiring-request links and assignment details per tab

- [x] Read-only v2 CV scoring comparison on 10 applications (no ATS writes)
- [x] Standardise the assistant's user-facing name to "MarkBot AI" across the dashboard, panel, help desk and Markbot replies
- [x] Remove the Payoneer request link field from the contractor timesheet form and reword the support line, confirmation checkbox and reminder emails to drop Payoneer wording
- [x] Add "How soon can you start?" and "Do you have any plans for the next 3 months?" as text fields to the SIV screening note
