- Keep availability-check sender-name selection in one shared dialog and validate the actual sending account on the server, so every send entry point behaves consistently without allowing a forged From address.
- Keep Role Pipeline job identity and legacy unlinked-candidate matching in shared pure helpers; preserve title-valued callbacks for the untouched historical RecruitmentFunnel so its existing title filters remain compatible.
- Store optional historical spreadsheet financial columns as nullable historical P&L row fields, while keeping the weekly table unchanged, so imports retain their values without altering the existing report.
- Store weekly P&L deposit labels separately from numeric deposit amounts on assignments, so notes such as EXEMPT display without corrupting financial values.
- Retain internal-company historical rows for display, but filter them at every headcount and financial aggregation boundary so visibility does not change external reports.
- Keep Historical P&L data helpers (row shape, per-year cache and fetch, internal/markup/headcount/hours rules) in src/lib/historicalData.ts and import them from components, so every view of historical data counts the same way.
- Verify admin access in edge functions with the `is_admin(_user_id)` helper rather than `has_role(..., 'admin')`, so super_admin callers are not wrongly rejected.
- Cache AI-written output by a signature of the prompt plus its input facts in a database table and require an explicit user action to generate, so an unchanged view never spends credits again.
- Build analyst inputs from selected historical row datasets plus weekly observations, using stable anonymous contractor identifiers and client aggregates, so analysis includes cohort and mix differences without disclosing contractor identities or changing report calculations.
- Persist versioned contractor payment-notice acknowledgements through authenticated database functions and enforce them on contractor timesheet submission, so browser bypasses cannot skip consent while admin/client workflows remain unchanged.

- Reuse the same payment announcement content in the acknowledgement dialog and contractor Announcement tab, so rereading never diverges from the accepted notice.
- Carry approved PDC details with staged attachments and select standalone email handling from stored request provenance on the server, so edited certificate details match the email without changing portal reply threads.
- Embed knowledge chunks with the gateway's google/gemini-embedding-2 at 768 dimensions in the internal embed-knowledge job, so stored vectors and future query vectors always match.

- Index the shared RM resource library under the always-allowed "resources" knowledge tab, so every admin and Markbot can use it regardless of tab permissions.
- Resolve Markbot resource links by source ID through authenticated resource reads and short-lived signed storage URLs, so document shortcuts preserve private access without persisting expiring links.

- When adding a new knowledge source type, extend the source_type and entity_type CHECK constraints on knowledge_chunks in the same migration and clear error-marked queue rows, so new sources index instead of failing silently.
- Markbot answers P&L questions through its pl_analytics tool, which aggregates the stored historical_pl_rows (internal OutSta rows excluded, hours preferring actual_hours) and is gated by the "pl" tab permission, so chat figures always match the P&L report.
- Save Markbot user messages (and new conversations) only together with the generated answer, so failed requests leave no unanswered questions in history.
- Gate Markbot tool result fields on the admin's own tab permissions and list hidden fields in the result, so data the admin may not see reads as "cannot check" instead of "none".
- Keep stage-note templates in a shared admin-only store, scoped by stage with reusable question prompts separate from candidate answers; loading resets answers while note and calendar persistence remain unchanged.
- Scope stage-note draft state to a mounted candidate/stage-move session and synchronize external rich-text values without emitting user updates, so resets cannot carry another applicant's draft into the next note.
- Carry the original status through stage-email and stage-note dialogs and restore it with a conditional status update before updating pipeline caches, so cancellation cannot overwrite a subsequent admin move.
- Keep Payoneer extraction mapping, selection and deposit-review classification in pure tested helpers and a dedicated review dialog; derive flags from the unchanged deposit schedule, so payment exports match the weekly table without changing report calculations.
- Store ordered company profile sections on clients with legacy description fallback and a rich-text mirror; use a client-keyed tab, NotesEditor and FormattedNotes to keep summaries separate from contacts and notes.
