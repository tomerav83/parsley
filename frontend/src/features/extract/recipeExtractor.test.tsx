// Named .test.tsx (not .ts) so Vitest routes it to the `browser` project, which
// `renderHook` needs — react-dom's test renderer requires a real DOM, and the
// `unit` project runs under `environment: "node"` with none.
//
// Mocked at the `@/lib/api.ts` boundary rather than stubbing `fetch` (contrast
// api.test.ts): this file's job is the hook's OWN abort/race/dispatch wiring —
// api.ts's response parsing and error-code mapping are already covered there.
// Mocking the collaborator directly also gives precise control over *when* each
// call settles, which the supersede tests below depend on.
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExtractError, type Recipe } from "@/lib/api.ts";
import { useRecipeExtractor } from "./recipeExtractor.ts";

vi.mock("@/lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api.ts")>();
  return {
    ...actual,
    extractRecipe: vi.fn(),
    extractRecipeFromHtml: vi.fn(),
  };
});

const { extractRecipe, extractRecipeFromHtml } = await import("@/lib/api.ts");
const mockedExtractRecipe = vi.mocked(extractRecipe);
const mockedExtractRecipeFromHtml = vi.mocked(extractRecipeFromHtml);

afterEach(() => {
  vi.clearAllMocks();
});

// A promise the test drives by hand, so a settle can be sequenced precisely
// against a second call — the only way to exercise the supersede race for real.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const RECIPE: Recipe = {
  name: "Toast",
  image: null,
  author: null,
  ingredients: ["bread"],
  steps: ["Toast the bread."],
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  yields: null,
  source_url: "https://example.com/toast",
  site_name: null,
};

describe("recipeExtractor — request lifecycle", () => {
  it("runs submitting → success and forwards the url + an AbortSignal", async () => {
    const { promise, resolve } = deferred<Recipe>();
    mockedExtractRecipe.mockReturnValueOnce(promise);
    const { result } = renderHook(() => useRecipeExtractor());

    let outcome!: Promise<string>;
    act(() => {
      outcome = result.current.runUrl("https://example.com/toast");
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve(RECIPE);
      await outcome;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.recipe).toEqual(RECIPE);
    expect(await outcome).toBe("success");
    expect(mockedExtractRecipe).toHaveBeenCalledWith(
      "https://example.com/toast",
      expect.any(AbortSignal),
    );
  });

  it("keeps a thrown ExtractError's code as-is", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("rate_limited", "slow down"),
    );
    const { result } = renderHook(() => useRecipeExtractor());

    await act(async () => {
      await result.current.runUrl("https://example.com/toast");
    });

    expect(result.current.error?.code).toBe("rate_limited");
    expect(result.current.recipe).toBeNull();
  });

  it("wraps a non-ExtractError failure as a reportable unknown error", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useRecipeExtractor());

    await act(async () => {
      await result.current.runUrl("https://example.com/toast");
    });

    expect(result.current.error).toBeInstanceOf(ExtractError);
    expect(result.current.error?.code).toBe("unknown");
  });
});

// The reason this hook exists at all (REDESIGN C3): a retry button firing twice
// — or a deep-link request racing a fresh submit — must never let the stale
// response win.
describe("recipeExtractor — supersede a stale request", () => {
  it("never lets a superseded call's outcome land in state, whichever way it settles", async () => {
    const first = deferred<Recipe>();
    const second = deferred<Recipe>();
    mockedExtractRecipe
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useRecipeExtractor());

    let outcomeA!: Promise<string>;
    let outcomeB!: Promise<string>;
    act(() => {
      outcomeA = result.current.runUrl("https://example.com/a");
    });
    act(() => {
      outcomeB = result.current.runUrl("https://example.com/b");
    });

    await act(async () => {
      // The stale call arrives late and would-be "fail" — must not surface.
      first.reject(new Error("stale response, arrives after the retry"));
      second.resolve(RECIPE);
      await Promise.allSettled([outcomeA, outcomeB]);
    });

    expect(await outcomeA).toBe("aborted");
    expect(await outcomeB).toBe("success");
    expect(result.current.recipe).toEqual(RECIPE);
    expect(result.current.error).toBeNull();
  });

  it("treats a thrown AbortError as aborted, never as a user-visible failure", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    const { result } = renderHook(() => useRecipeExtractor());

    let outcome!: string;
    await act(async () => {
      outcome = await result.current.runUrl("https://example.com/toast");
    });

    expect(outcome).toBe("aborted");
    expect(result.current.error).toBeNull();
  });

  it("restore() aborts any in-flight request and cannot be clobbered by its late response", async () => {
    const stale = deferred<Recipe>();
    mockedExtractRecipe.mockReturnValueOnce(stale.promise);
    const { result } = renderHook(() => useRecipeExtractor());

    let outcome!: Promise<string>;
    act(() => {
      outcome = result.current.runUrl("https://example.com/in-flight");
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.restore(RECIPE);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.recipe).toEqual(RECIPE);

    await act(async () => {
      stale.resolve({ ...RECIPE, name: "Stale Toast" });
      await outcome;
    });

    expect(await outcome).toBe("aborted");
    expect(result.current.recipe).toEqual(RECIPE); // still the restored recipe
  });
});

describe("recipeExtractor — retry vs. fresh submit", () => {
  it("a retry keeps the current error visible while in flight; a fresh submit clears it", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("fetch_failed", "no answer"),
    );
    const { result } = renderHook(() => useRecipeExtractor());
    await act(async () => {
      await result.current.runUrl("https://example.com/x");
    });
    expect(result.current.error?.code).toBe("fetch_failed");

    const retryCall = deferred<Recipe>();
    mockedExtractRecipe.mockReturnValueOnce(retryCall.promise);
    act(() => {
      result.current.runUrl("https://example.com/x", { retry: true });
    });
    expect(result.current.error?.code).toBe("fetch_failed"); // still visible

    const freshCall = deferred<Recipe>();
    mockedExtractRecipe.mockReturnValueOnce(freshCall.promise);
    act(() => {
      result.current.runUrl("https://example.com/y");
    });
    expect(result.current.error).toBeNull(); // a non-retry submit clears it

    await act(async () => {
      retryCall.resolve(RECIPE);
      freshCall.resolve(RECIPE);
    });
  });
});

describe("recipeExtractor — paste vs. URL fetch", () => {
  it("flags pasteFailed only for a failed paste, not a failed URL fetch", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("network", "down"),
    );
    const { result } = renderHook(() => useRecipeExtractor());
    await act(async () => {
      await result.current.runUrl("https://example.com/x");
    });
    expect(result.current.pasteFailed).toBe(false);

    mockedExtractRecipeFromHtml.mockRejectedValueOnce(
      new ExtractError("no_recipe", "nothing found"),
    );
    await act(async () => {
      await result.current.runPaste("<html></html>", "https://example.com/x");
    });
    expect(result.current.pasteFailed).toBe(true);
  });

  it("forwards html + url + an AbortSignal to extractRecipeFromHtml", async () => {
    mockedExtractRecipeFromHtml.mockResolvedValueOnce(RECIPE);
    const { result } = renderHook(() => useRecipeExtractor());

    await act(async () => {
      await result.current.runPaste(
        "<html>x</html>",
        "https://example.com/toast",
      );
    });

    expect(mockedExtractRecipeFromHtml).toHaveBeenCalledWith(
      "<html>x</html>",
      "https://example.com/toast",
      expect.any(AbortSignal),
    );
  });
});

describe("recipeExtractor — dismiss", () => {
  it("clears an error back to idle", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("network", "down"),
    );
    const { result } = renderHook(() => useRecipeExtractor());
    await act(async () => {
      await result.current.runUrl("https://example.com/x");
    });
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.recipe).toBeNull();
  });
});
