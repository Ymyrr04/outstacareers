# Build Health Review: Bugs, Risks, and Optimizations

The app builds and type-checks cleanly today. Nothing here is breaking the preview — these are correctness risks, performance drags, and cleanup items found in a full sweep of the frontend, the backend functions, and the database.

## What's actually wrong (bugs / risks)

1. **Everything loads at once.** No route or tab is code-split. The admin dashboard (`Admin.tsx`, 4,367 lines) plus every heavy tab, chart library, PDF renderer, and rich-text editor ships in a single bundle to every visitor — including the public careers page and contractor portal. This is the biggest cause of slow first load.
2. **Missing effect dependencies.** 71 lint warnings, most of them `react-hooks/exhaustive-deps` (e.g. PL dashboard overtime memo, interview session loader). These are the classic source of "stale data until I refresh" bugs.
3. **Over-fetching from the database.** 56 places select every column (`select('*')`), including on large tables like applicants and contractor assignments. Combined with the known 1000-row range loops, this is heavy on the database and on browser memory.
4. **Database security warnings.** 2 tables have RLS on but no policy at all (effectively locked, likely unintentional), 39 `SECURITY DEFINER` functions are executable by anonymous or signed-in users when most should be internal-only, and leaked-password protection is off for auth.
5. **Debug logging left in production.** ~150 `console.log` calls, heaviest in `assess-interview`, `submit-application`, `rescore-cv`, and `bulk-upload-cv` — some log candidate data and payloads into function logs.
6. **Social preview image is wrong.** `index.html` still points `og:image` and `twitter:image` at the default Lovable placeholder, so shared links show a generic image instead of OutSta branding.
7. **Type safety erosion.** 591 lint errors, almost all `any` (Gmail panel, daily check-in, PL dashboard, export utils). Each one is a place the compiler cannot catch a broken field name after a schema change.
8. **Realtime subscriptions in 12+ components.** Several open their own channel and refetch broadly on any change; on a busy dashboard this multiplies network traffic and re-renders.

## Proposed plan (phased, safe to stop after any phase)

### Phase 1 — Performance, biggest win first
- Route-level code splitting: lazy-load every page in `App.tsx` behind `Suspense` with a light loading fallback.
- Tab-level splitting inside the admin dashboard so Analytics, PL, Gmail Inbox, Contracts, Scout, and Calendar load on demand.
- Add manual vendor chunks (React, charts, editor, PDF, Supabase) in `vite.config.ts`.
- Expected: dramatically smaller initial download for the careers page, portal, and first admin paint. No visual or behavioural change.

### Phase 2 — Data-fetch tightening
- Replace `select('*')` with explicit column lists on the heaviest paths: applicants list, contractor assignments, timesheets, client analytics.
- Consolidate duplicate realtime channels and make handlers patch state rather than refetch everything.
- Keep every existing filter, sort, and pagination behaviour identical.

### Phase 3 — Correctness cleanup
- Fix the `react-hooks/exhaustive-deps` warnings one file at a time, verifying each screen still refreshes correctly (this is where a careless fix causes loops, so it goes slow and last among code changes).
- Remove or gate the `console.log` calls in edge functions, keeping genuine error logging.
- Fix the two `no-useless-escape` errors in `SignContract.tsx`.

### Phase 4 — Backend hardening
- Review the 2 policy-less RLS tables and either add proper policies or confirm they should stay closed.
- Revoke `EXECUTE` from `anon`/`authenticated` on the `SECURITY DEFINER` functions that are only ever called by triggers or edge functions.
- Turn on leaked-password protection.

### Phase 5 — Polish
- Set a real OutSta `og:image` (needs an image from you, or I can generate one).
- Optionally chip away at `any` types in the largest offenders, starting with `GmailPanel.tsx` and `PLDashboard.tsx`.

## Notes
- No feature behaviour changes anywhere in this plan; it is performance, correctness, and hardening only.
- Phases 1 and 2 give the visible speed improvement. Phase 4 is the one with real security value.
- Splitting `Admin.tsx` into smaller files is deliberately *not* in this plan — high risk, low payoff right now. It can be a separate effort later.
