import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ExtractError } from "@/lib/api";
import { ErrorWindow } from "./ErrorWindow";

// A `rate_limited` error offers only "Try again" — the simplest single-action
// layout, so the primary control is unambiguous when asserting focus.
function renderWindow(
  overrides: Partial<Parameters<typeof ErrorWindow>[0]> = {},
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
  render(<ErrorWindow {...props} />);
  return props;
}

describe("ErrorWindow (alertdialog)", () => {
  it("exposes a named, described alertdialog", () => {
    renderWindow();
    const dialog = screen.getByRole("alertdialog");
    // named by the title, described by the hint (aria-labelledby/-describedby)
    expect(dialog).toHaveAccessibleName(/one at a time/i);
    expect(dialog).toHaveAccessibleDescription(/lot of requests/i);
  });

  it("moves focus to the primary action when it appears", () => {
    renderWindow();
    expect(screen.getByRole("button", { name: /try again/i })).toHaveFocus();
  });

  it("a terminal (failed-paste) error is report-only with focus on the report action", () => {
    renderWindow({
      error: new ExtractError("unknown", "boom"),
      terminal: true,
    });
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName(/not today/i);
    expect(dialog).toHaveAttribute("data-mood", "flat");
    expect(
      screen.getByRole("link", { name: /report on github/i }),
    ).toHaveFocus();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("Escape from inside the window dismisses it", async () => {
    const { onDismiss } = renderWindow();
    // focus landed inside on mount — Escape is scoped to the window
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

// The paste-HTML fallback is the recovery path for the two codes that mean "we
// couldn't read the page". Which slot it lands in is decided by intent —
// retry > paste > edit — so the two codes exercise both slots.
describe("ErrorWindow (paste fallback flow)", () => {
  it("makes paste the primary action when the site blocked our reader", async () => {
    const { onPaste } = renderWindow({
      error: new ExtractError("site_blocked", "shut the door"),
    });

    // site_blocked can't be retried (the site will just block us again), so paste
    // is primary — and the window puts focus straight on it
    const paste = screen.getByRole("button", { name: /paste the page/i });
    expect(paste).toHaveFocus();

    await userEvent.click(paste);
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("keeps paste available as a secondary action when the fetch failed", async () => {
    const { onPaste } = renderWindow({
      error: new ExtractError("fetch_failed", "no answer"),
    });

    // fetch_failed can retry AND paste: retry takes primary, paste drops to the row
    expect(screen.getByRole("button", { name: /try again/i })).toHaveFocus();

    await userEvent.click(
      screen.getByRole("button", { name: /^paste page$/i }),
    );
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it("does not offer paste for an error the fallback can't fix", () => {
    // rate_limited is about us, not the page — pasting its HTML would change nothing
    renderWindow();
    expect(screen.queryByRole("button", { name: /paste/i })).toBeNull();
  });
});

describe("ErrorWindow (retry escalation)", () => {
  it("spends the one-shot retry and promotes paste after a failed retry", async () => {
    const onRetry = vi.fn().mockResolvedValue("error" as const);
    renderWindow({
      error: new ExtractError("fetch_failed", "no answer"),
      onRetry,
    });

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    // the retry came back failed: retry is gone, paste is now the primary,
    // and the mascot escalates to the "weird" double-take
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: /try again/i })).toBeNull(),
    );
    const paste = screen.getByRole("button", { name: /paste the page/i });
    expect(paste).toHaveFocus();
    expect(screen.getByRole("alertdialog")).toHaveAttribute(
      "data-mood",
      "weird",
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("collapses to report-only when a retry fails with no fallback left", async () => {
    // `unknown` is unexpected with no paste/edit fallback — the dead end
    const onRetry = vi.fn().mockResolvedValue("error" as const);
    renderWindow({
      error: new ExtractError("unknown", "boom"),
      onRetry,
    });

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    const report = await screen.findByRole("link", {
      name: /report on github/i,
    });
    expect(report).toHaveFocus();
    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
      /still nothing/i,
    );
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });
});
