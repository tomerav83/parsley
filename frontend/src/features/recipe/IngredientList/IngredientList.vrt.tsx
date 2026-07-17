import { argosScreenshot } from "@argos-ci/vitest";
import { describe, it } from "vitest";

import { RECIPE } from "@/test/fixtures";
import { renderStill } from "@/test/still";
import { IngredientList } from "./IngredientList";

// The mono quantity column is a load-bearing piece of the "mise en place"
// identity, and it's pure layout: splitQuantity's unit test proves the string
// splits, only a pixel can prove the two columns still line up. The fixture's
// quantity-less line ("flaky sea salt") pins the .noqty branch, where the name
// slides over into the empty column.
describe("IngredientList", () => {
  it("quantity column, with a quantity-less line", async () => {
    const target = await renderStill(
      <IngredientList ingredients={RECIPE.ingredients} />,
      { width: 420, height: 400 },
    );
    await argosScreenshot("IngredientList/checklist", { element: target });
  });
});
