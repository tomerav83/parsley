import { argosScreenshot } from "@argos-ci/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { describe, it, vi } from "vitest";

import { ExtractError, type ErrorCode } from "@/lib/api";
import { settle } from "@/test/still";

import { ErrorWindow } from "./ErrorWindow";

// The window is position:fixed and centered, so there's nothing useful in its
// wrapper's box — target the dialog directly. Argos needs a CSS selector (not
// a locator): `[role=alertdialog]` is the component's own a11y contract.
const DIALOG = '[role="alertdialog"]';

function mount(
  code: ErrorCode,
  message: string,
  terminal = false,
  onRetry: () => Promise<"success" | "error" | "aborted"> = vi.fn(),
) {
  render(
    <ErrorWindow
      error={new ExtractError(code, message)}
      sourceUrl="https://example.com/charred-broccoli-traybake"
      terminal={terminal}
      onPaste={vi.fn()}
      onEdit={vi.fn()}
      onRetry={onRetry}
      onDismiss={vi.fn()}
    />,
  );
}

async function stage(
  code: ErrorCode,
  message: string,
  terminal = false,
  onRetry?: () => Promise<"success" | "error" | "aborted">,
) {
  await page.viewport(900, 780);
  document.documentElement.dataset.theme = "light";
  mount(code, message, terminal, onRetry);
  await settle();
}

// One shot per mascot mood — each is a different character pose AND a
// different action layout, so together they pin the whole state space.
describe("ErrorWindow", () => {
  it("hmm — fresh failure, the fullest action set", async () => {
    await stage("fetch_failed", "no answer");
    await argosScreenshot("ErrorWindow/hmm-fetch-failed", { element: DIALOG });
  });

  it("weird — the retry failed too, paste promoted to primary", async () => {
    await stage("fetch_failed", "no answer", false, () =>
      Promise.resolve("error" as const),
    );
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByRole("button", { name: /paste the page/i });
    await settle();
    await argosScreenshot("ErrorWindow/weird-retry-failed", {
      element: DIALOG,
    });
  });

  it("flat — terminal paste failure, report-only", async () => {
    await stage("no_recipe", "nothing found", true);
    await argosScreenshot("ErrorWindow/flat-terminal", { element: DIALOG });
  });

  it("over — rate limited", async () => {
    await stage("rate_limited", "slow down");
    await argosScreenshot("ErrorWindow/over-rate-limited", { element: DIALOG });
  });
});
