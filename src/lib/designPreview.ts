/**
 * Design preview gate.
 *
 * All experimental CSS lives in `src/styles/experimental.css` and is scoped
 * under `html.design-preview`. That class is only ever added at runtime when a
 * user explicitly opts in, so experimental styles never affect the production
 * build unless enabled.
 *
 * Enable via:
 *  - URL param: ?design=1  (disable with ?design=0)
 *  - localStorage key: outsta:design-preview = "1"
 *  - the floating toggle (visible in dev, or after ?design=1)
 */

export const DESIGN_PREVIEW_CLASS = "design-preview";
const STORAGE_KEY = "outsta:design-preview";

export function isDesignPreviewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setDesignPreviewEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  applyDesignPreviewClass(enabled);
}

function applyDesignPreviewClass(enabled: boolean): void {
  document.documentElement.classList.toggle(DESIGN_PREVIEW_CLASS, enabled);
}

/** Call once on app boot, before render. */
export function initDesignPreview(): void {
  if (typeof window === "undefined") return;

  const param = new URLSearchParams(window.location.search).get("design");
  if (param === "1" || param === "true") {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } else if (param === "0" || param === "false") {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  applyDesignPreviewClass(isDesignPreviewEnabled());
}

/** Whether the on-screen toggle should be rendered at all. */
export function isDesignPreviewToggleVisible(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  const param = new URLSearchParams(window.location.search).get("design");
  return param !== null || isDesignPreviewEnabled();
}
