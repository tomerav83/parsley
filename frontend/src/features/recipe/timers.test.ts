import { describe, expect, it } from "vitest";
import { stepTimer } from "./timers";

describe("stepTimer", () => {
  it("finds a duration followed by a time unit", () => {
    expect(stepTimer("Roast for 18 minutes until golden")).toBe("18 minutes");
  });

  it("finds a range", () => {
    expect(stepTimer("Simmer 18–20 mins, stirring")).toBe("18–20 mins");
  });

  it("ignores numbers that aren't durations", () => {
    expect(stepTimer("Heat the oven to 220°C")).toBeNull();
    expect(stepTimer("Add 3 tbsp olive oil")).toBeNull();
  });

  it("normalises the whitespace between number and unit", () => {
    expect(stepTimer("Bake 30 minutes")).toBe("30 minutes");
  });
});
