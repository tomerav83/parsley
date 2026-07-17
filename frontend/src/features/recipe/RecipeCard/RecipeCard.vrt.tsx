import { argosScreenshot } from "@argos-ci/vitest";
import { describe, it } from "vitest";

import { HERO_URL, RECIPE } from "@/test/fixtures";
import { renderStill } from "@/test/still";
import { RecipeCard } from "./RecipeCard";

// The whole recipe surface in one shot: hero, byline, timing row, and the
// ingredients/method window. Shot at the component level, which is what keeps the
// app-root sprig canvas — an always-on rAF loop, and the reason full-page shots
// were rejected in E7 — structurally out of frame rather than masked out.
describe("RecipeCard", () => {
  const DESKTOP = { width: 1280, height: 900 };
  const MOBILE = { width: 390, height: 844 };

  it("desktop, photo hero", async () => {
    const target = await renderStill(
      <RecipeCard recipe={{ ...RECIPE, image: HERO_URL }} />,
      DESKTOP,
    );
    await argosScreenshot("RecipeCard/desktop-hero", { element: target });
  });

  // The no-photo fallback is a genuinely different header (pinned title +
  // specimen timing strip, not chips over a scrim), so it earns its own baseline.
  it("desktop, no photo", async () => {
    const target = await renderStill(<RecipeCard recipe={RECIPE} />, DESKTOP);
    await argosScreenshot("RecipeCard/desktop-no-photo", { element: target });
  });

  // Mobile is a different layout, not a narrower one: the sections collapse from
  // two columns to one pane behind a segment switch.
  it("mobile, photo hero", async () => {
    const target = await renderStill(
      <RecipeCard recipe={{ ...RECIPE, image: HERO_URL }} />,
      MOBILE,
    );
    await argosScreenshot("RecipeCard/mobile-hero", { element: target });
  });

  // Dark is a semantic-token flip (REDESIGN B5). Pinning it catches a token that
  // gets hardcoded back to a literal — the regression the two-tier split exists to
  // prevent, and one no light-mode baseline can see.
  it("desktop, dark theme", async () => {
    const target = await renderStill(
      <RecipeCard recipe={{ ...RECIPE, image: HERO_URL }} />,
      { ...DESKTOP, theme: "dark" },
    );
    await argosScreenshot("RecipeCard/desktop-dark", { element: target });
  });
});
