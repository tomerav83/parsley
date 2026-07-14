// Typed client for the Parsley extraction API. Calls are relative (/api/*) so
// the app is always same-origin: on Vercel a rewrite routes /api to the backend
// service (see vercel.json); in dev Vite proxies /api to the backend.

import { z } from "zod";

// Runtime schema for the extraction response, validated at the network boundary
// (see postExtract). A backend shape drift then fails HERE as a named
// ExtractError instead of crashing deep in the recipe UI where the mismatch is
// unrecognisable. Mirrors backend/app/models.py::Recipe; the optional fields
// accept null OR an omitted key and normalise both to null.
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

// Single source of truth for the Recipe type — inferred from the schema so the
// validator and the type can never drift apart.
export type Recipe = z.infer<typeof recipeSchema>;

// Error codes the backend can return (app/main.py). "rate_limited" and
// "network" are surfaced by the client for cases the backend can't name.
export type ErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "no_recipe"
  | "site_blocked"
  | "fetch_failed"
  | "rate_limited"
  | "network"
  | "unknown";

export class ExtractError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ExtractError";
  }
}

// True when the failure means "we couldn't reach the site" — the frontend
// offers the paste-HTML fallback for these.
export function isFetchProblem(code: ErrorCode): boolean {
  return code === "site_blocked" || code === "fetch_failed";
}

interface ErrorBody {
  code?: string;
  message?: string;
  // FastAPI/pydantic validation errors (e.g. a malformed URL) come back as a
  // `detail` array with no `code` — a user error, not one of our named codes.
  detail?: unknown;
}

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

export function extractRecipe(
  url: string,
  signal?: AbortSignal,
): Promise<Recipe> {
  return postExtract("/api/extract", { url }, signal);
}

export function extractRecipeFromHtml(
  html: string,
  url: string,
  signal?: AbortSignal,
): Promise<Recipe> {
  return postExtract("/api/extract-html", { html, url }, signal);
}
