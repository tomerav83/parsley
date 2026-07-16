import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MethodSteps } from "./MethodSteps";

const STEPS = [
  "First, preheat the oven.",
  "Then roast for 18–20 minutes.",
  "Finally, serve straight from the pan.",
];

// MethodSteps is controlled; a tiny harness owns the index like RecipeSections does.
function Harness() {
  const [i, setI] = useState(0);
  return <MethodSteps steps={STEPS} index={i} onIndex={setI} />;
}

describe("MethodSteps", () => {
  it("keeps every step in the DOM but shows only the current one", () => {
    render(<Harness />);
    const items = screen.getAllByRole("listitem", { hidden: true });
    expect(items).toHaveLength(3);
    expect(items[0]).not.toHaveAttribute("hidden"); // current step visible
    expect(items[1]).toHaveAttribute("hidden");
    expect(items[2]).toHaveAttribute("hidden");
  });

  it("walks the steps with the Prev/Next buttons and clamps at the ends", async () => {
    render(<Harness />);
    const next = screen.getByRole("button", { name: /next step/i });
    const prev = screen.getByRole("button", { name: /previous step/i });

    expect(prev).toBeDisabled(); // clamped at the first step
    expect(screen.getByText(/preheat/)).toBeVisible();

    await userEvent.click(next);
    expect(screen.getByText(/roast/)).toBeVisible();
    expect(prev).not.toBeDisabled();

    await userEvent.click(next);
    expect(screen.getByText(/serve/)).toBeVisible();
    expect(next).toBeDisabled(); // clamped at the last step
  });

  it("walks the steps with ArrowRight/ArrowLeft while the widget is focused", async () => {
    render(<Harness />);
    screen.getByRole("group", { name: /method steps/i }).focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText(/roast/)).toBeVisible();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText(/preheat/)).toBeVisible();
  });
});
