import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";

import { ExtractError, type ErrorCode } from "@/lib/api";
import { settle } from "@/test/still";

import { FloatingError } from "./FloatingError";

// The widget is position:fixed to the viewport corner, so unlike the other specs
// there's nothing useful to shoot in its wrapper's box — locate the sprite/bubble
// by role instead and let the element screenshot crop to it.
const VIEWPORT = { width: 900, height: 700 };

function mount(code: ErrorCode, message: string, terminal = false) {
  render(
    <FloatingError
      error={new ExtractError(code, message)}
      sourceUrl="https://example.com/charred-broccoli-traybake"
      terminal={terminal}
      onPaste={vi.fn()}
      onEdit={vi.fn()}
      onRetry={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
}

describe("FloatingError", () => {
  it("collapsed — the sprite and its oops tag", async () => {
    await page.viewport(VIEWPORT.width, VIEWPORT.height);
    document.documentElement.dataset.theme = "light";
    mount("rate_limited", "Slow down a moment");
    await settle();

    // Collapsed, the bubble is visibility:hidden, so the sprite toggle IS the
    // widget as far as a screenshot is concerned.
    const sprite = screen.getByRole("button", { name: /show options/i });
    await expect(page.elementLocator(sprite)).toMatchScreenshot("collapsed");
  });

  // Opened, the action layout is the thing worth pinning: one full-width primary
  // picked by intent, with the rest sharing a secondary row. site_blocked is the
  // case where paste is promoted to primary, so it's the busiest layout.
  it("opened — paste promoted to the primary action", async () => {
    await page.viewport(VIEWPORT.width, VIEWPORT.height);
    document.documentElement.dataset.theme = "light";
    mount("site_blocked", "That site blocked our reader");
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    await settle();

    await expect(
      page.elementLocator(screen.getByRole("alertdialog")),
    ).toMatchScreenshot("opened-site-blocked");
  });

  // The terminal case arrives already open with no fallback left — a different,
  // report-only action set that no other baseline covers.
  it("terminal — report-only, auto-opened", async () => {
    await page.viewport(VIEWPORT.width, VIEWPORT.height);
    document.documentElement.dataset.theme = "light";
    mount("unknown", "That paste didn't contain a recipe", true);
    await settle();

    await expect(
      page.elementLocator(screen.getByRole("alertdialog")),
    ).toMatchScreenshot("terminal-report-only");
  });
});
