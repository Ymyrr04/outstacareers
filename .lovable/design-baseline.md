# Design baseline — 2026-08-27

The current admin design (OutSta cyan theme) is saved as a frozen snapshot.

## Where it lives

`src/styles/baseline.css` — a verbatim copy of `src/index.css` as of 2026-08-27,
without the `@tailwind` directives. It is not imported anywhere, so it does not
affect the build, the preview, or the published site.

Covers: design tokens, `.admin-shell` theme, nav tabs, stat cards, buttons,
tables, list-row cards, Kanban pipeline, status badges, filter chips, search
inputs and selects, sub-tabs.

## How to restore the design

Option A (permanent revert of styles only)
1. Open `src/styles/baseline.css` and copy everything below the header comment.
2. Paste it into `src/index.css`, replacing everything after the three
   `@tailwind` lines.

Option B (quick override, for comparing)
1. In `src/main.tsx`, add `import "./styles/baseline.css";` AFTER the
   `./index.css` import.
2. Remove that line when done.

Option C (full project revert)
Use the History tab or the revert button under the chat message from
2026-08-27. This rolls back code as well as styles.

## Rules going forward

- New/experimental design goes in `src/styles/experimental.css`, nested under
  `html.design-preview`. That gate is off by default and never ships unless
  turned on with the floating toggle or `?design=1`.
- Never edit `src/styles/baseline.css`. If a new design is approved and becomes
  the standard, take a fresh dated snapshot instead.
