import { argosScreenshot } from "@argos-ci/vitest";
import { describe, it } from "vitest";

import { renderStill } from "@/test/still";

import { LeafCharacter } from "./LeafCharacter";

// The four error moods are pinned through ErrorWindow's shots; `work` only ever
// appears inside the liquid transition (unscreenshotable mid-wave), so it gets
// its own still — in both themes, since the dark theme swaps the limb/water
// tokens for background contrast.
describe("LeafCharacter", () => {
  it("work — light", async () => {
    const selector = await renderStill(
      <div style={{ width: 320 }}>
        <LeafCharacter mood="work" />
      </div>,
      { width: 420, height: 340 },
    );
    await argosScreenshot("LeafCharacter/work-light", { element: selector });
  });

  it("work — dark", async () => {
    const selector = await renderStill(
      <div style={{ width: 320 }}>
        <LeafCharacter mood="work" />
      </div>,
      { width: 420, height: 340, theme: "dark" },
    );
    await argosScreenshot("LeafCharacter/work-dark", { element: selector });
  });
});
