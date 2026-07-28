import { describe, expect, it } from "vitest";
import { byline } from "./byline";

describe("byline", () => {
  it("joins author and site with an em dash", () => {
    expect(byline({ author: "Ada Lovelace", site_name: "Food Blog" })).toBe(
      "Ada Lovelace — Food Blog",
    );
  });

  it("dedupes when author and site are the same name (case/punctuation-insensitive)", () => {
    expect(byline({ author: "Dine & Dish", site_name: "Dine and Dish" })).toBe(
      "Dine & Dish",
    );
  });

  it("uses whichever one is present", () => {
    expect(byline({ author: "Ada", site_name: null })).toBe("Ada");
    expect(byline({ author: null, site_name: "Food Blog" })).toBe("Food Blog");
  });

  it("is empty when neither is present", () => {
    expect(byline({ author: null, site_name: null })).toBe("");
  });
});
