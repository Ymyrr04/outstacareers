# Plan: Update brand color tokens & admin page background

## Goal
Add hex brand color variables to the global stylesheet, set the admin dashboard page background to `#F0FFFE` (very light mint green), and register the brand colors in Tailwind. No component, logic, or functionality changes — only CSS variables and the background color.

## Changes

### 1. `src/index.css` — `:root` block (lines ~63-65)
Add hex brand tokens to the existing `:root`:
```css
--brand: #0ABEDF;
--brand-dark: #0899B5;
--brand-light: #E0F7FC;
--brand-border: #C8F0F8;
--brand-text: #066F85;
--page-bg: #F0FFFE;
```

### 2. `src/index.css` — `.admin-shell` block (lines ~145-167)
- Add `--brand-page-bg: 176 100% 97%;` (HSL equivalent of `#F0FFFE`) next to `--brand-surface`.
- Change `--background` from `var(--brand-surface)` → `var(--brand-page-bg)` so `bg-background` components inherit the new page color.
- Change the explicit `background-color` from `hsl(var(--brand-surface))` → `hsl(var(--brand-page-bg))`.
- `--brand-surface` (`#EDF9FC`) stays as-is for hover/active states, keeping those visually distinct from the lighter page background.

### 3. `tailwind.config.ts` — `theme.extend.colors`
Add alongside the existing color entries:
```ts
brand: '#0ABEDF',
'brand-dark': '#0899B5',
'brand-light': '#E0F7FC',
'brand-text': '#066F85',
'page-bg': '#F0FFFE',
```

## What does NOT change
- No components, no logic, no queries, no functionality.
- Hover/active states keep `--brand-surface` (#EDF9FC).
- All existing `.admin-shell` scoped styling (cards, tables, badges, etc.) remains intact.
- Dark mode and portal routes are untouched.
