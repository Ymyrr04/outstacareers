// Centralized error extraction.
// Goal: surface the REAL underlying error message to the user.
// Generic fallback is used ONLY when no readable message exists anywhere on the error object.

const GENERIC = "Unexpected error. Please try again.";

// Noise filters — these strings mean "an error happened but no real reason was attached".
// We refuse to show them; we keep digging for something more specific.
const NOISE = /non-2xx|status code|failed to fetch|undefined|edge function returned|networkerror/i;

function clean(text: unknown): string | null {
  if (text == null) return null;
  const s = String(text).trim();
  if (!s) return null;
  if (NOISE.test(s)) return null;
  if (s.length > 500) return s.slice(0, 500);
  return s;
}

function fromJsonBlob(blob: unknown): string | null {
  if (!blob || typeof blob !== "object") return null;
  const b = blob as any;
  return (
    clean(b?.message) ||
    clean(b?.error) ||
    clean(b?.error_description) ||
    clean(b?.details) ||
    clean(b?.hint) ||
    clean(b?.msg) ||
    null
  );
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extract the most specific error message available, in this priority order:
 *   1. error.response.data.message / .error                (axios-style)
 *   2. error.context body (Supabase FunctionsHttpError)    — JSON .error / .message
 *   3. error.message                                       (if not noise)
 *   4. error.error_description                             (Supabase auth)
 *   5. error.details / .hint                               (Postgres)
 *   6. String(error)
 *   7. Generic fallback
 */
export async function getErrorMessage(err: unknown, fallback = GENERIC): Promise<string> {
  // eslint-disable-next-line no-console
  console.error("[error]", err);

  if (err == null) return fallback;
  if (typeof err === "string") return clean(err) || fallback;

  const e = err as any;

  // 1. axios-style: error.response.data.{message|error}
  const fromResponse = fromJsonBlob(e?.response?.data);
  if (fromResponse) return fromResponse;

  // 2. Supabase FunctionsHttpError — context holds the Response object
  try {
    const ctx = e?.context;
    if (ctx) {
      if (typeof ctx.json === "function") {
        const body = await ctx.json().catch(() => null);
        const fromBody = fromJsonBlob(body);
        if (fromBody) return fromBody;
      }
      if (typeof ctx.text === "function") {
        const text = await ctx.text().catch(() => null);
        if (text) {
          const parsed = tryParseJson(text);
          const fromParsed = fromJsonBlob(parsed);
          if (fromParsed) return fromParsed;
          const cleaned = clean(text);
          if (cleaned) return cleaned;
        }
      }
      // Some shapes expose context.responseText directly
      if (typeof ctx.responseText === "string") {
        const parsed = tryParseJson(ctx.responseText);
        const fromParsed = fromJsonBlob(parsed);
        if (fromParsed) return fromParsed;
        const cleaned = clean(ctx.responseText);
        if (cleaned) return cleaned;
      }
    }
  } catch {
    /* keep digging */
  }

  // 3-5. error.message / error_description / details / hint
  const direct =
    clean(e?.message) ||
    clean(e?.error_description) ||
    clean(e?.details) ||
    clean(e?.hint) ||
    clean(e?.error);
  if (direct) return direct;

  // 6. Status-code based hints (last resort before stringifying)
  const status = e?.status ?? e?.statusCode;
  if (status === 401) return "You are not signed in or your session has expired.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 408 || status === 504) return "The request timed out. Please try again.";

  // 7. Final stringification attempt
  const stringified = clean(String(e));
  if (stringified && stringified !== "[object Object]") return stringified;

  return fallback;
}

/** Sync version — same priority order but skips async body parsing. */
export function getErrorMessageSync(err: unknown, fallback = GENERIC): string {
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  if (err == null) return fallback;
  if (typeof err === "string") return clean(err) || fallback;

  const e = err as any;

  const fromResponse = fromJsonBlob(e?.response?.data);
  if (fromResponse) return fromResponse;

  // Sync read of context.responseText if present
  if (typeof e?.context?.responseText === "string") {
    const parsed = tryParseJson(e.context.responseText);
    const fromParsed = fromJsonBlob(parsed);
    if (fromParsed) return fromParsed;
    const cleaned = clean(e.context.responseText);
    if (cleaned) return cleaned;
  }

  const direct =
    clean(e?.message) ||
    clean(e?.error_description) ||
    clean(e?.details) ||
    clean(e?.hint) ||
    clean(e?.error);
  if (direct) return direct;

  const status = e?.status ?? e?.statusCode;
  if (status === 401) return "You are not signed in or your session has expired.";
  if (status === 403) return "You don't have permission to perform this action.";
  if (status === 404) return "The requested item could not be found.";

  const stringified = clean(String(e));
  if (stringified && stringified !== "[object Object]") return stringified;
  return fallback;
}
