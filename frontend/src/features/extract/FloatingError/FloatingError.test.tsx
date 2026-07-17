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

// The paste-HTML fallback is the recovery path for the two codes that mean "we
// couldn't read the page" (isFetchProblem). Which slot it lands in is decided by
// intent — retry > paste > edit — so the two codes exercise both slots.
describe("FloatingError (E6 — paste fallback flow)", () => {
  it("makes paste the primary action when the site blocked our reader", async () => {
    const { onPaste } = renderWidget({
      error: new ExtractError("site_blocked", "shut the door"),
    });
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );

    // site_blocked can't be retried (the site will just block us again), so paste
    // is primary — and opening the dialog puts focus straight on it
    const paste = screen.getByRole("button", { name: /paste the page/i });
    expect(paste).toHaveFocus();

    await userEvent.click(paste);
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("keeps paste available as a secondary action when the fetch failed", async () => {
    const { onPaste } = renderWidget({
      error: new ExtractError("fetch_failed", "no answer"),
    });
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );

    // fetch_failed can retry AND paste: retry takes primary, paste drops to the row
    expect(screen.getByRole("button", { name: /try again/i })).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: /^paste page$/i }),
    );
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("does not offer paste for an error the fallback can't fix", async () => {
    // rate_limited is about us, not the page — pasting its HTML would change nothing
    renderWidget();
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    expect(screen.queryByRole("button", { name: /paste/i })).toBeNull();
  });
});
