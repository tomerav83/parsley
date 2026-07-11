// Typed client for the Parsley extraction API. Calls are relative (/api/*) so
// the app is always same-origin: on Vercel a rewrite routes /api to the backend
// service (see vercel.json); in dev Vite proxies /api to the backend.

export interface Recipe {
  name: string;
  image: string | null;
  author: string | null;
  ingredients: string[];
  steps: string[];
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  yields: string | null;
  source_url: string;
  site_name: string | null;
}

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

async function postExtract(path: string, payload: unknown): Promise<Recipe> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ExtractError(
      "network",
      "Couldn't reach the server. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as Recipe;
}

export function extractRecipe(url: string): Promise<Recipe> {
  return postExtract("/api/extract", { url });
}

export function extractRecipeFromHtml(
  html: string,
  url: string,
): Promise<Recipe> {
  return postExtract("/api/extract-html", { html, url });
}
