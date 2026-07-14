import { describe, expect, it } from "vitest";

import { splitQuantity } from "./ingredients";

describe("splitQuantity", () => {
  it("peels a plain amount + unit", () => {
    expect(splitQuantity("2 cups flour")).toEqual({
      qty: "2 cups",
      name: "flour",
    });
  });

  it("keeps size adjectives and ingredient nouns in the name", () => {
    expect(splitQuantity("1 large egg")).toEqual({
      qty: "1",
      name: "large egg",
    });
    expect(splitQuantity("2 carrots, diced")).toEqual({
      qty: "2",
      name: "carrots, diced",
    });
  });

  it("returns empty qty when there is no leading amount", () => {
    expect(splitQuantity("Salt to taste")).toEqual({
      qty: "",
      name: "Salt to taste",
    });
  });

  // --- newly added units (from the 50-site scrape) ---
  it("recognizes the 'c.' cup abbreviation", () => {
    expect(splitQuantity("1 1/2 c. cherry tomatoes")).toEqual({
      qty: "1 1/2 c.",
      name: "cherry tomatoes",
    });
  });

  it.each([
    ["1 packet taco seasoning", "1 packet", "taco seasoning"],
    ["2 ribs celery, sliced", "2 ribs", "celery, sliced"],
    ["1 bulb of garlic", "1 bulb", "of garlic"],
    ["4 rashers streaky bacon", "4 rashers", "streaky bacon"],
    ["1 knob butter", "1 knob", "butter"],
  ])("recognizes count/pack unit in %j", (line, qty, name) => {
    expect(splitQuantity(line)).toEqual({ qty, name });
  });

  // --- parser bug fix: connector words that used to strand the amount ---
  it("handles a spelled-out mixed number ('1 and 1/2')", () => {
    expect(splitQuantity("1 and 1/2 cups mashed bananas")).toEqual({
      qty: "1 and 1/2 cups",
      name: "mashed bananas",
    });
  });

  it("handles a word range ('1/2 to 1')", () => {
    expect(splitQuantity("1/2 to 1 cup broth")).toEqual({
      qty: "1/2 to 1 cup",
      name: "broth",
    });
  });

  it("handles an 'N x' multiplier", () => {
    expect(splitQuantity("2 x 400g tins plum tomatoes")).toEqual({
      qty: "2 x 400g",
      name: "tins plum tomatoes",
    });
  });

  it("does not treat a 'to'-prefixed ingredient word as a range", () => {
    expect(splitQuantity("1 tomato, diced")).toEqual({
      qty: "1",
      name: "tomato, diced",
    });
  });
});
