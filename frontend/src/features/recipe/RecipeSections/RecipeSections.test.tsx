import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "@vitest/browser/context";
import { beforeEach, describe, expect, it } from "vitest";

import { RecipeSections } from "./RecipeSections";

const INGREDIENTS = ["400g chickpeas", "3 tbsp olive oil", "6 large eggs"];
const STEPS = ["Preheat the oven.", "Roast 18–20 minutes.", "Serve."];

// Pin a phone-width viewport: the segment switch is the mobile UI (on desktop both
// panes show and the switch is display:none). A fixed width makes it deterministic.
beforeEach(async () => {
  await page.viewport(390, 844);
});

describe("RecipeSections (mobile)", () => {
  it("renders both the ingredients and the method", () => {
    render(<RecipeSections ingredients={INGREDIENTS} steps={STEPS} />);
    // the leading quantity is split into its own column, so match the name part
    expect(screen.getByText("olive oil")).toBeInTheDocument();
    expect(screen.getByText(/preheat the oven/i)).toBeInTheDocument();
  });

  it("switches the active section via the segment control", async () => {
    render(<RecipeSections ingredients={INGREDIENTS} steps={STEPS} />);
    const ing = screen.getByRole("button", { name: /^ingredients/i });
    const method = screen.getByRole("button", { name: /^method/i });

    expect(ing).toHaveAttribute("aria-pressed", "true");
    expect(method).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(method);
    expect(method).toHaveAttribute("aria-pressed", "true");
    expect(ing).toHaveAttribute("aria-pressed", "false");
  });

  it("labels the current step and updates it as the method advances", async () => {
    render(<RecipeSections ingredients={INGREDIENTS} steps={STEPS} />);
    // both the Method segment badge and the panel label carry the step number
    expect(
      screen.getByRole("button", { name: /method 01 \/ 03/i }),
    ).toBeInTheDocument();

    // reveal the Method pane (hidden behind the segment on mobile), then advance
    await userEvent.click(screen.getByRole("button", { name: /^method/i }));
    expect(screen.getByText("step 01 of 03")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /next step/i }));

    expect(screen.getByText("step 02 of 03")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /method 02 \/ 03/i }),
    ).toBeInTheDocument();
  });
});
