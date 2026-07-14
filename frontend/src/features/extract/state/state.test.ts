import { describe, expect, it } from "vitest";

import { ExtractError, type Recipe } from "@/lib/api.ts";
import {
  extractReducer,
  initialExtractState,
  type ExtractState,
} from "./state.ts";

const RECIPE = {
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
} satisfies Recipe;

const errored: ExtractState = {
  status: "error",
  recipe: null,
  error: new ExtractError("no_recipe", "none"),
  pasteFailed: false,
};

const succeeded: ExtractState = {
  status: "success",
  recipe: RECIPE,
  error: null,
  pasteFailed: false,
};

describe("extractReducer", () => {
  it("submit (fresh) clears any prior error and enters submitting", () => {
    const next = extractReducer(errored, { type: "submit", isRetry: false });
    expect(next.status).toBe("submitting");
    expect(next.error).toBeNull();
    expect(next.recipe).toBeNull();
    expect(next.pasteFailed).toBe(false);
  });

  it("submit (retry) keeps the current error while in flight", () => {
    const next = extractReducer(errored, { type: "submit", isRetry: true });
    expect(next.status).toBe("submitting");
    expect(next.error).toBe(errored.error);
  });

  it("success stores the recipe and clears the error", () => {
    const submitting = extractReducer(errored, {
      type: "submit",
      isRetry: true,
    });
    const next = extractReducer(submitting, {
      type: "success",
      recipe: RECIPE,
    });
    expect(next.status).toBe("success");
    expect(next.recipe).toBe(RECIPE);
    expect(next.error).toBeNull();
  });

  it("failure records the error and never keeps a recipe", () => {
    const err = new ExtractError("fetch_failed", "nope");
    const next = extractReducer(succeeded, {
      type: "failure",
      error: err,
      pasteFailed: false,
    });
    expect(next.status).toBe("error");
    expect(next.error).toBe(err);
    expect(next.recipe).toBeNull();
  });

  it("failure from a paste flags pasteFailed (terminal)", () => {
    const err = new ExtractError("no_recipe", "nope");
    const next = extractReducer(initialExtractState, {
      type: "failure",
      error: err,
      pasteFailed: true,
    });
    expect(next.pasteFailed).toBe(true);
  });

  it("dismiss from an error resets to idle", () => {
    const next = extractReducer(errored, { type: "dismiss" });
    expect(next).toEqual(initialExtractState);
  });

  it("dismiss from a success preserves the recipe on screen", () => {
    const next = extractReducer(succeeded, { type: "dismiss" });
    expect(next.status).toBe("success");
    expect(next.recipe).toBe(RECIPE);
  });
});
