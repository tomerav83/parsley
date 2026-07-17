// @vitest-environment jsdom
//
// This one file overrides the `unit` project's default `node` environment: the
// cache uses the real sessionStorage Web Storage API, and jsdom provides a genuine
// implementation — no hand-rolled stub. jsdom is already a devDependency, and the
// per-file docblock keeps this a fast logic test (no Chromium instance).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "./api.ts";
import { cacheRecipe, readCachedRecipe } from "./recipeCache.ts";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  name: "Test",
  image: null,
  author: null,
  ingredients: ["1 egg"],
  steps: ["Mix."],
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  yields: null,
  source_url: "https://example.com/r",
  site_name: null,
  ...over,
});

describe("recipeCache", () => {
  it("round-trips a recipe by its URL", () => {
    const r = recipe({ name: "Shakshuka" });
    cacheRecipe("https://a.test/x", r);
    expect(readCachedRecipe("https://a.test/x")).toEqual(r);
  });

  it("returns null for an unknown URL", () => {
    cacheRecipe("https://a.test/x", recipe());
    expect(readCachedRecipe("https://a.test/other")).toBeNull();
  });

  it("keeps entries for different URLs independent", () => {
    cacheRecipe("https://a.test/1", recipe({ name: "One" }));
    cacheRecipe("https://a.test/2", recipe({ name: "Two" }));
    expect(readCachedRecipe("https://a.test/1")?.name).toBe("One");
    expect(readCachedRecipe("https://a.test/2")?.name).toBe("Two");
  });

  it("ignores an empty URL on both write and read", () => {
    cacheRecipe("", recipe());
    expect(readCachedRecipe("")).toBeNull();
  });

  it("rejects a stored entry that no longer matches the schema", () => {
    // Simulate a cache written by an older deploy: a bad shape lands in storage.
    sessionStorage.setItem(
      "parsley:recipes",
      JSON.stringify({ "https://a.test/x": { name: "no ingredients array" } }),
    );
    expect(readCachedRecipe("https://a.test/x")).toBeNull();
  });

  it("evicts the oldest once past the cap, keeping the most recent", () => {
    for (let i = 0; i < 12; i++) {
      cacheRecipe(`https://a.test/${i}`, recipe({ name: `r${i}` }));
    }
    expect(readCachedRecipe("https://a.test/0")).toBeNull(); // oldest evicted
    expect(readCachedRecipe("https://a.test/1")).toBeNull();
    expect(readCachedRecipe("https://a.test/11")?.name).toBe("r11"); // newest kept
  });

  it("survives a storage write that throws (no cache, no crash)", () => {
    // Induce the real failure mode (private-mode / quota) to exercise the catch.
    // jsdom requires spying on the prototype, not the sessionStorage instance.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => cacheRecipe("https://a.test/x", recipe())).not.toThrow();
    expect(readCachedRecipe("https://a.test/x")).toBeNull();
  });
});
