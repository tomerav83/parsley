import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExtractError } from "@/lib/api";
import { FloatingError } from "./FloatingError";

// A `rate_limited` error offers only "Try again" — the simplest single-action
// layout, so the primary control is unambiguous when asserting focus.
function renderWidget(
  overrides: Partial<Parameters<typeof FloatingError>[0]> = {},
) {
  const props = {
    error: new ExtractError("rate_limited", "slow down"),
    sourceUrl: "https://example.com/recipe",
    terminal: false,
    onPaste: vi.fn(),
    onEdit: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<FloatingError {...props} />);
  return props;
}

describe("FloatingError (A7 — alertdialog)", () => {
  it("exposes the opened bubble as a named, described alertdialog", async () => {
    renderWidget();
    // collapsed, the bubble is visibility:hidden — out of the a11y tree; open it
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    const dialog = screen.getByRole("alertdialog");
    // named by the title, described by the hint (aria-labelledby/-describedby)
    expect(dialog).toHaveAccessibleName(/slow down/i);
    expect(dialog).toHaveAccessibleDescription(/lot of requests/i);
  });

  it("a fresh error starts collapsed and does not steal focus", () => {
    renderWidget();
    // the sprite is present but the bubble's action isn't reachable/focused yet
    expect(
      screen.getByRole("button", { name: /show options/i }),
    ).toBeInTheDocument();
    expect(document.activeElement).toBe(document.body);
  });

  it("opening the bubble moves focus to the primary action", async () => {
    renderWidget();
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    expect(screen.getByRole("button", { name: /try again/i })).toHaveFocus();
  });

  it("collapsing the bubble returns focus to the sprite toggle", async () => {
    renderWidget();
    const toggle = screen.getByRole("button", { name: /show options/i });
    await userEvent.click(toggle);
    // now labelled "hide options" while open
    await userEvent.click(
      screen.getByRole("button", { name: /hide options/i }),
    );
    expect(screen.getByRole("button", { name: /show options/i })).toHaveFocus();
  });

  it("a terminal (failed-paste) error auto-opens with focus on the report action", () => {
    renderWidget({
      error: new ExtractError("unknown", "boom"),
      terminal: true,
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /report on github/i }),
    ).toHaveFocus();
  });

  it("Escape from inside the widget dismisses it", async () => {
    const { onDismiss } = renderWidget();
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    // focus is now inside the widget — Escape triggers the fly-away → onDismiss
    await userEvent.keyboard("{Escape}");
    // the fly-away plays out before onDismiss fires; wait for it
    await vi.waitFor(() => expect(onDismiss).toHaveBeenCalled());
  });
});
