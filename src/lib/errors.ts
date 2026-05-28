// Centralized human-readable error mapping.
// Always log the raw error to the console; show only the friendly string in UI.

const GENERIC = "Something went wrong on our end. Please try again. If the issue continues, contact OutSta support.";

const KNOWN: Array<{ test: RegExp; message: string }> = [
  // Auth / session
  { test: /invalid login|invalid credentials|invalid grant/i, message: "Incorrect username or password. Please try again." },
  { test: /user not found|no user found/i, message: "No account found with that username or email." },
  { test: /user.*(disabled|banned)|account.*(disabled|banned)/i, message: "Your account has been disabled. Please contact your account manager." },
  { test: /jwt|expired|no authorization|invalid session/i, message: "Your session has expired. Please sign in again." },
  { test: /unauthorized/i, message: "You are not authorized to do that. Please sign in again." },
  { test: /forbidden|permission/i, message: "You don't have permission to perform this action." },
  { test: /not found/i, message: "The requested item could not be found. It may have been deleted or moved." },

  // Profile / setup
  { test: /username.*(taken|in use|exists|duplicate)/i, message: "That username is already in use. Please choose a different one." },
  { test: /email.*(taken|in use|already.*registered|duplicate|exists)/i, message: "That email is already linked to another account. Please use a different email." },
  { test: /secondary.*primary|same.*email/i, message: "Secondary email must be different from your primary email." },
  { test: /invalid.*email|email.*invalid/i, message: "Please enter a valid email address (e.g. name@example.com)." },
  { test: /username must be|3-40/i, message: "Username must be 3-40 characters and use lowercase letters, numbers, dot, underscore, or hyphen." },

  // Network
  { test: /failed to fetch|network|networkerror|timeout|timed out/i, message: "Unable to connect. Please check your internet connection and try again." },
];

function pickMessage(text: string | undefined | null): string | null {
  if (!text) return null;
  for (const { test, message } of KNOWN) {
    if (test.test(text)) return message;
  }
  return null;
}

/**
 * Returns a human-readable error message. Always logs the raw error.
 * Reads supabase-js FunctionsHttpError bodies via `error.context.json()` when possible.
 */
export async function getErrorMessage(err: unknown, fallback = GENERIC): Promise<string> {
  // Always log raw for debugging
  // eslint-disable-next-line no-console
  console.error("[error]", err);

  if (!err) return fallback;
  const anyErr = err as any;

  // Try Supabase Edge Function response body
  try {
    if (anyErr?.context && typeof anyErr.context.json === "function") {
      const body = await anyErr.context.json().catch(() => null);
      const fromBody = pickMessage(body?.error || body?.message);
      if (fromBody) return fromBody;
      if (body?.error || body?.message) {
        // Use server-provided message verbatim when it's already user-facing
        const raw = String(body.error || body.message);
        if (raw.length < 240 && !/non-2xx|fetch/i.test(raw)) return raw;
      }
    }
  } catch {
    /* ignore */
  }

  const msg = typeof anyErr === "string" ? anyErr : anyErr?.message || anyErr?.error_description || anyErr?.error || "";
  const status = anyErr?.status ?? anyErr?.statusCode;

  const fromMsg = pickMessage(msg);
  if (fromMsg) return fromMsg;

  if (status === 401) return "You are not authorized to do that. Please sign in again.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested item could not be found. It may have been deleted or moved.";
  if (status === 408 || status === 504) return "The request timed out. Please check your connection and try again.";
  if (typeof status === "number" && status >= 500) return fallback;

  if (msg && !/non-2xx|fetch|edge function/i.test(msg) && msg.length < 240) return msg;
  return fallback;
}

/** Sync version for places that can't await (logs raw, returns best-guess). */
export function getErrorMessageSync(err: unknown, fallback = GENERIC): string {
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  if (!err) return fallback;
  const anyErr = err as any;
  const msg = typeof anyErr === "string" ? anyErr : anyErr?.message || anyErr?.error_description || anyErr?.error || "";
  const status = anyErr?.status ?? anyErr?.statusCode;
  const fromMsg = pickMessage(msg);
  if (fromMsg) return fromMsg;
  if (status === 401) return "You are not authorized to do that. Please sign in again.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested item could not be found. It may have been deleted or moved.";
  if (typeof status === "number" && status >= 500) return fallback;
  if (msg && !/non-2xx|fetch|edge function/i.test(msg) && msg.length < 240) return msg;
  return fallback;
}
