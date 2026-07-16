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

  it("labels the current step in the segment and advances it", async () => {
    render(<RecipeSections ingredients={INGREDIENTS} steps={STEPS} />);
    // the Method segment badge carries the current step number on mobile
    expect(
      screen.getByRole("button", { name: /method 01 \/ 03/i }),
    ).toBeInTheDocument();

    // reveal the Method pane (hidden behind the segment on mobile), then advance
    // via the header Next button
    await userEvent.click(screen.getByRole("button", { name: /^method/i }));
    await userEvent.click(screen.getByRole("button", { name: /next step/i }));

    expect(
      screen.getByRole("button", { name: /method 02 \/ 03/i }),
    ).toBeInTheDocument();
  });
});
