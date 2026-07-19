// recipeLoader is pure routing glue: read ?url, prefer the sessionStorage cache,
// hit the network only for a cold uncached target. Both collaborators are mocked,
// so this stays a fast node unit test (no jsdom, no real fetch/storage).
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/lib/api.ts";
import type { LoaderFunctionArgs } from "react-router";
import { recipeLoader } from "./recipeLoader.ts";

vi.mock("@/lib/api.ts", () => ({ extractRecipe: vi.fn() }));
vi.mock("@/lib/recipeCache.ts", () => ({ readCachedRecipe: vi.fn() }));

const { extractRecipe } = await import("@/lib/api.ts");
const { readCachedRecipe } = await import("@/lib/recipeCache.ts");
const mockedExtract = vi.mocked(extractRecipe);
const mockedRead = vi.mocked(readCachedRecipe);

afterEach(() => vi.clearAllMocks());

const RECIPE = { name: "Toast", source_url: "u" } as Recipe;

// Minimal LoaderFunctionArgs: the loader only reads request.url and request.signal.
function args(target?: string): LoaderFunctionArgs {
  const url = target
    ? `https://app/recipe?url=${encodeURIComponent(target)}`
    : "https://app/recipe";
  return { request: new Request(url), params: {}, context: {} };
}

describe("recipeLoader", () => {
  it("returns a null recipe and touches nothing when no url is given", async () => {
    expect(await recipeLoader(args())).toEqual({ recipe: null });
    expect(mockedRead).not.toHaveBeenCalled();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("serves a cached recipe without hitting the network", async () => {
    mockedRead.mockReturnValue(RECIPE);
    expect(await recipeLoader(args("https://x.com/toast"))).toEqual({
      recipe: RECIPE,
    });
    expect(mockedRead).toHaveBeenCalledWith("https://x.com/toast");
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("extracts over the network for a cold uncached target, forwarding the abort signal", async () => {
    mockedRead.mockReturnValue(null);
    mockedExtract.mockResolvedValue(RECIPE);
    const a = args("https://x.com/toast");
    expect(await recipeLoader(a)).toEqual({ recipe: RECIPE });
    expect(mockedExtract).toHaveBeenCalledWith(
      "https://x.com/toast",
      a.request.signal,
    );
  });

  it("lets an extract failure propagate to the route ErrorBoundary", async () => {
    mockedRead.mockReturnValue(null);
    mockedExtract.mockRejectedValue(new Error("boom"));
    await expect(recipeLoader(args("https://x.com/toast"))).rejects.toThrow(
      "boom",
    );
  });
});
