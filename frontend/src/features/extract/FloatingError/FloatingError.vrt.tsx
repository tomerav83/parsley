import { argosScreenshot } from "@argos-ci/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { describe, it, vi } from "vitest";

import { ExtractError, type ErrorCode } from "@/lib/api";
import { settle } from "@/test/still";

import { FloatingError } from "./FloatingError";

// The widget is position:fixed to the viewport corner, so unlike the other specs
// there's nothing useful in its wrapper's box — target the sprite/bubble directly.
// Argos needs a CSS selector (not a locator), so these are structural hooks rather
// than the by-role queries the behaviour tests use: `[role=alertdialog]` is the A7
// contract itself, and `button[aria-expanded]` is the sprite toggle — the same
// selector the Phase 1–3 computed-style harness used for this element.
const DIALOG = '[role="alertdialog"]';
const SPRITE = "button[aria-expanded]";

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

async function stage(code: ErrorCode, message: string, terminal = false) {
  await page.viewport(900, 700);
  document.documentElement.dataset.theme = "light";
  mount(code, message, terminal);
  await settle();
}

describe("FloatingError", () => {
  it("collapsed — the sprite and its oops tag", async () => {
    await stage("rate_limited", "Slow down a moment");
    // Collapsed, the bubble is visibility:hidden — the sprite toggle IS the
    // widget as far as a screenshot is concerned.
    await argosScreenshot("FloatingError/collapsed", { element: SPRITE });
  });

  // Opened, the action layout is the thing worth pinning: one full-width primary
  // picked by intent, with the rest sharing a secondary row. site_blocked is the
  // case where paste is promoted to primary, so it's the busiest layout.
  it("opened — paste promoted to the primary action", async () => {
    await stage("site_blocked", "That site blocked our reader");
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    await settle();
    await argosScreenshot("FloatingError/opened-site-blocked", {
      element: DIALOG,
    });
  });

  // The terminal case arrives already open with no fallback left — a different,
  // report-only action set that no other shot covers.
  it("terminal — report-only, auto-opened", async () => {
    await stage("unknown", "That paste didn't contain a recipe", true);
    await argosScreenshot("FloatingError/terminal-report-only", {
      element: DIALOG,
    });
  });
});
