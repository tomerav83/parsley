import { argosScreenshot } from "@argos-ci/vitest";
import { describe, it } from "vitest";

import { RECIPE } from "@/test/fixtures";
import { renderStill } from "@/test/still";
import { MethodSteps } from "./MethodSteps";

// MethodSteps is `flex: 1 1 auto; min-height: 0` — it takes its height from the
// pane around it and fits its text to whatever it gets. Rendered bare it has no
// constraint, so the card grows to the text and the shrink-to-fit never runs: the
// baseline would pin a state the app can't show. This host is the smallest thing
// that reproduces the real constraint (a fixed-height flex column, as the pane in
// RecipeSections is).
function Pane({ steps, index }: { steps: string[]; index: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 560,
        height: 320,
      }}
    >
      <MethodSteps steps={steps} index={index} onIndex={() => {}} />
    </div>
  );
}

// Long enough to overflow the card at the 15.5px base size and trigger the
// clipped-under-a-fade + stacked-sheets cue. The fixture's own steps all fit,
// which is why this one is local — the overflow path only exists because
// scraped recipes really do have steps this size. Keeps a
// digit duration ("5 minutes") so the amber timer chip still renders here.
const OVERFLOWING_STEP =
  "Tip the tray's contents into your widest mixing bowl while everything is still blisteringly hot, scraping up the sticky paprika crust from the corners with a stiff spatula — that caramelised layer is most of the flavour and it will set like glue if you let the tray cool. Add the lemon zest now, off the heat but not yet cold, so the oils bloom into the residual warmth rather than flashing off, then fold everything twice and no more: a third pass will break the florets down into something closer to a mash than a traybake. Let it stand for 5 minutes so the chickpeas stop steaming and the dressing thickens against them, then taste it — it will almost certainly want more salt than you think, and a second squeeze of lemon to cut the fat. Serve it straight from the bowl while the edges are still crisp; it holds for about 20 minutes before the broccoli softens and the whole thing turns sullen.";

// `index` is controlled by the parent in the real app, so each case pins a step
// directly rather than clicking to it — a baseline should depend on the rendered
// state, not on a sequence of interactions getting there.
describe("MethodSteps", () => {
  const VIEWPORT = { width: 640, height: 420 };

  it("first step — Prev disabled", async () => {
    const target = await renderStill(
      <Pane steps={RECIPE.steps} index={0} />,
      VIEWPORT,
    );
    await argosScreenshot("MethodSteps/first-step", { element: target });
  });

  // The fit is font-metric dependent, so it is precisely what a behaviour test
  // can't hold: a font swap, a line-height change or a regressed fit loop shows up
  // as clipped or resized text and nothing else catches it. Read against
  // first-step, where the same card renders at the unshrunk base size.
  it("overflowing step — shrunk to fit, with a timer chip", async () => {
    const target = await renderStill(
      <Pane
        steps={[RECIPE.steps[0]!, OVERFLOWING_STEP, RECIPE.steps[2]!]}
        index={1}
      />,
      VIEWPORT,
    );
    await argosScreenshot("MethodSteps/long-step-fitted", { element: target });
  });

  it("last step — Next disabled", async () => {
    const target = await renderStill(
      <Pane steps={RECIPE.steps} index={RECIPE.steps.length - 1} />,
      VIEWPORT,
    );
    await argosScreenshot("MethodSteps/last-step", { element: target });
  });
});
