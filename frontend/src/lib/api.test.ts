import { describe, expect, it } from "vitest";

import { recipeSchema } from "./api";

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
