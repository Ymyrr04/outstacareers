# Save the current design as a revertible baseline

Goal: lock in today's admin design so you can always come back to it, then experiment freely.

## Two layers of safety

1. **Version history (already automatic)**
   Every message creates a restore point. You can return to the exact current state any time from the History tab or the revert button under this message. No code needed — just note that "this" is the good state.

2. **A saved design snapshot in the project**
   Copy the current styling into a frozen baseline file so the current look can be restored even after many future edits, without rolling back unrelated feature work.

## What gets built

- `src/styles/baseline.css` — a frozen, dated copy of the current admin design rules (the `.admin-shell` styling, stat cards, tables, list rows, Kanban, badges, chips, inputs, sub-tabs) taken from `src/index.css` as it stands now. Not imported by default, so it changes nothing.
- A short header comment in that file recording the date and how to restore it.
- `.lovable/design-baseline.md` — a one-page note explaining what the baseline is, and the exact restore procedure (swap the baseline rules back into `index.css`, or import `baseline.css` after it).

## Then what

All new design work goes into `src/styles/experimental.css` under `html.design-preview`, which stays off by default and never ships unless you turn it on. If you dislike the trial: turn the toggle off, or restore from the baseline/history.

## Technical notes

- No component, query, or logic changes. Only new files.
- `baseline.css` is inert until imported, so the build and published site are unaffected.
