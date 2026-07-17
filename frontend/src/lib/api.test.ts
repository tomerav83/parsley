import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExtractError,
  extractRecipe,
  extractRecipeFromHtml,
  recipeSchema,
} from "./api";

// A full response as backend/app/models.py::Recipe serialises it.
const FULL = {
  name: "Roast Chicken",
  image: "https://example.com/bird.jpg",
  author: "A. Cook",
  ingredients: ["1 chicken", "2 tbsp butter"],
  steps: ["Preheat oven.", "Roast 60 minutes."],
  prep_time_minutes: 15,
  cook_time_minutes: 60,
  total_time_minutes: 75,
  yields: "4 servings",
  source_url: "https://example.com/roast-chicken",
  site_name: "Example Kitchen",
};

describe("recipeSchema", () => {
  it("accepts a full backend payload unchanged", () => {
    expect(recipeSchema.parse(FULL)).toEqual(FULL);
  });

  it("accepts explicit nulls on the optional fields", () => {
    const nulled = {
      ...FULL,
      image: null,
      author: null,
      prep_time_minutes: null,
      cook_time_minutes: null,
      total_time_minutes: null,
      yields: null,
      site_name: null,
    };
    expect(recipeSchema.parse(nulled)).toEqual(nulled);
  });

  it("normalises omitted optional fields to null", () => {
    const minimal = {
      name: "Toast",
      ingredients: ["bread"],
      steps: ["Toast the bread."],
      source_url: "https://example.com/toast",
    };
    const parsed = recipeSchema.parse(minimal);
    expect(parsed.image).toBeNull();
    expect(parsed.total_time_minutes).toBeNull();
    expect(parsed.site_name).toBeNull();
    expect(parsed.ingredients).toEqual(["bread"]);
  });

  it("rejects a response missing a required field", () => {
    const { name: _omit, ...noName } = FULL;
    expect(recipeSchema.safeParse(noName).success).toBe(false);
  });

  it("rejects a response with the wrong type for a required field", () => {
    expect(
      recipeSchema.safeParse({ ...FULL, steps: "not an array" }).success,
    ).toBe(false);
  });
});

// --- the client itself: request shape + error mapping (REDESIGN E6a) --------
// `fetch` is stubbed rather than a real server: every branch under test is the
// client's own translation of a Response (or a thrown fetch) into an ExtractError,
// so a handcrafted Response exercises it exactly and deterministically.

const URL_IN = "https://example.com/roast-chicken";

// Typed as `fetch` itself (not inferred from the arg-less impl) so `mock.calls`
// carries fetch's real parameter tuple and the request-shape assertions typecheck.
function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Capture the rejection instead of asserting on the promise, so each test can
// make typed assertions about the error's class AND its code/message.
const rejection = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => {
      throw new Error("expected the call to reject, but it resolved");
    },
    (err: unknown) => err,
  );

async function extractError(promise: Promise<unknown>): Promise<ExtractError> {
  const err = await rejection(promise);
  expect(err).toBeInstanceOf(ExtractError);
  return err as ExtractError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractRecipe / extractRecipeFromHtml (request shape)", () => {
  it("posts the url to /api/extract and returns the validated recipe", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, FULL));

    await expect(extractRecipe(URL_IN)).resolves.toEqual(FULL);

    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/extract");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(init!.body as string)).toEqual({ url: URL_IN });
  });

  it("posts the html and url to /api/extract-html", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, FULL));

    await expect(
      extractRecipeFromHtml("<html>…</html>", URL_IN),
    ).resolves.toEqual(FULL);

    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/extract-html");
    expect(JSON.parse(init!.body as string)).toEqual({
      html: "<html>…</html>",
      url: URL_IN,
    });
  });

  it("forwards the caller's AbortSignal to fetch", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, FULL));
    const controller = new AbortController();

    await extractRecipe(URL_IN, controller.signal);

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      signal: controller.signal,
    });
  });
});

describe("extract error mapping", () => {
  it("maps 429 to rate_limited, ahead of whatever the body claims", async () => {
    // The status alone decides here — parseError returns before reading the body.
    stubFetch(async () => jsonResponse(429, { code: "no_recipe" }));

    const err = await extractError(extractRecipe(URL_IN));
    expect(err.code).toBe("rate_limited");
    expect(err.message).toMatch(/too many requests/i);
  });

  it("maps a pydantic `detail` validation error to invalid_url", async () => {
    // FastAPI rejects a malformed URL with a `detail` array and no `code`.
    stubFetch(async () =>
      jsonResponse(422, {
        detail: [
          {
            loc: ["body", "url"],
            msg: "Input should be a valid URL",
            type: "url_parsing",
          },
        ],
      }),
    );

    const err = await extractError(extractRecipe("not-a-url"));
    expect(err.code).toBe("invalid_url");
    expect(err.message).toMatch(/valid url/i);
  });

  it("maps a thrown fetch to network", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const err = await extractError(extractRecipe(URL_IN));
    expect(err.code).toBe("network");
    expect(err.message).toMatch(/couldn't reach the server/i);
  });

  it("passes a named backend code and message through untouched", async () => {
    stubFetch(async () =>
      jsonResponse(502, {
        code: "site_blocked",
        message: "That site blocked our reader.",
      }),
    );

    const err = await extractError(extractRecipe(URL_IN));
    expect(err.code).toBe("site_blocked");
    expect(err.message).toBe("That site blocked our reader.");
  });

  it("prefers a named code over `detail` when the body carries both", async () => {
    stubFetch(async () =>
      jsonResponse(400, {
        code: "blocked_url",
        message: "Private addresses are blocked.",
        detail: "some incidental detail",
      }),
    );

    expect((await extractError(extractRecipe(URL_IN))).code).toBe(
      "blocked_url",
    );
  });

  it("falls back to unknown when the error body isn't JSON", async () => {
    // e.g. a proxy's HTML error page.
    stubFetch(
      async () =>
        new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
    );

    const err = await extractError(extractRecipe(URL_IN));
    expect(err.code).toBe("unknown");
    expect(err.message).toMatch(/something went wrong/i);
  });

  it("maps a 2xx response of the wrong shape to unknown, at the boundary", async () => {
    // C1: shape drift must fail HERE as a named error, not deep in the recipe UI.
    stubFetch(async () => jsonResponse(200, { name: "Toast" }));

    const err = await extractError(extractRecipe(URL_IN));
    expect(err.code).toBe("unknown");
    expect(err.message).toMatch(/unexpected form/i);
  });

  it("rethrows an AbortError untouched rather than calling it a network failure", async () => {
    // C3: an aborted request was superseded by a newer one — the caller swallows
    // it. Wrapping it as `network` would surface a spurious connection error.
    stubFetch(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    const err = await rejection(extractRecipe(URL_IN));
    expect(err).toBeInstanceOf(DOMException);
    expect(err).not.toBeInstanceOf(ExtractError);
    expect((err as DOMException).name).toBe("AbortError");
  });
});
