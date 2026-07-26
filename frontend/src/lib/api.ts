// Typed client for the extraction API. Every call is relative (/api/*) so the app
// stays same-origin — Vercel rewrites /api to the backend, Vite proxies it in dev.
// A base URL or CORS config here would break both.

import { z } from "zod";

/**
 * Runtime shape of an extraction response, checked at the network boundary so a
 * backend change fails here as an ExtractError rather than deep in the recipe UI.
 *
 * Mirrors `Recipe` in backend/app/models.py — change one, change both and
 * contract.json. Optional fields take null or a missing key and give back null.
 */
export const recipeSchema = z.object({
  name: z.string(),
  image: z.string().nullable().default(null),
  author: z.string().nullable().default(null),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  prep_time_minutes: z.number().nullable().default(null),
  cook_time_minutes: z.number().nullable().default(null),
  total_time_minutes: z.number().nullable().default(null),
  yields: z.string().nullable().default(null),
  source_url: z.string(),
  site_name: z.string().nullable().default(null),
});

/** Inferred from the schema, so the validator and the type can't drift apart. */
export type Recipe = z.infer<typeof recipeSchema>;

/**
 * Every error code the UI handles. The first five come from the backend and are
 * pinned to its taxonomy by contract.json; the last three only ever happen here.
 *
 * An array rather than a union so contract.test.ts can enumerate it.
 */
export const ERROR_CODES = [
  "invalid_url",
  "blocked_url",
  "no_recipe",
  "site_blocked",
  "fetch_failed",
  "rate_limited",
  "network",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Any failed extraction. `code` picks the copy and recovery actions the UI offers. */
export class ExtractError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ExtractError";
  }
}

interface ErrorBody {
  code?: string;
  message?: string;
  // FastAPI/pydantic validation errors (e.g. a malformed URL) come back as a
  // `detail` array with no `code` — a user error, not one of our named codes.
  detail?: unknown;
}

/** Turn a failed response into the ExtractError the UI knows how to render. */
async function parseError(response: Response): Promise<ExtractError> {
  if (response.status === 429) {
    return new ExtractError(
      "rate_limited",
      "Too many requests — wait a minute and try again.",
    );
  }
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // Non-JSON error (e.g. a proxy error page).
  }
  // A pydantic validation failure (has `detail`, no `code`) means the input URL
  // was rejected — surface it as invalid_url, not the "unknown" bug bucket.
  if (!body.code && body.detail !== undefined) {
    return new ExtractError(
      "invalid_url",
      "That doesn't look like a valid URL. Check the address and try again.",
    );
  }
  const code = (body.code as ErrorCode) ?? "unknown";
  const message = body.message ?? "Something went wrong. Please try again.";
  return new ExtractError(code, message);
}

/**
 * POST to an extraction endpoint and validate what comes back.
 *
 * Throws an ExtractError for anything that goes wrong except an abort, which is
 * rethrown untouched — the caller superseded its own request and should stay quiet.
 */
async function postExtract(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<Recipe> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    // A caller-initiated abort (the request was superseded by a newer one) is not
    // a network failure — rethrow it untouched so the caller can swallow it
    // instead of surfacing a spurious "couldn't reach the server" error.
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ExtractError(
      "network",
      "Couldn't reach the server. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  const parsed = recipeSchema.safeParse(await response.json());
  if (!parsed.success) {
    // The server answered 2xx but not with a recipe we recognise — treat it as
    // an unexpected (reportable) failure rather than trusting a bad shape.
    throw new ExtractError(
      "unknown",
      "The recipe came back in an unexpected form. Please try again.",
    );
  }
  return parsed.data;
}

/** Extract the recipe at `url` — the backend fetches the page itself. */
export function extractRecipe(
  url: string,
  signal?: AbortSignal,
): Promise<Recipe> {
  return postExtract("/api/extract", { url }, signal);
}

/** Extract from HTML the user pasted. `url` is where it came from, kept as the source link. */
export function extractRecipeFromHtml(
  html: string,
  url: string,
  signal?: AbortSignal,
): Promise<Recipe> {
  return postExtract("/api/extract-html", { html, url }, signal);
}
