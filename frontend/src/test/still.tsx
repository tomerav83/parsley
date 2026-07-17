import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { page } from "vitest/browser";

interface StillOptions {
  /** Viewport to shoot at. Pinned per-spec: several components are responsive. */
  width: number;
  height: number;
  /** Force a theme, rather than inheriting the host's prefers-color-scheme. */
  theme?: "light" | "dark";
}

// Render a component and wait until it has stopped moving, then hand back a
// locator to screenshot. Vitest re-captures until two consecutive shots match, so
// this doesn't have to be perfect — but every settle it does here is one the
// matcher doesn't have to burn its 5s stability timeout discovering.
export async function renderStill(
  ui: ReactElement,
  { width, height, theme = "light" }: StillOptions,
) {
  await page.viewport(width, height);
  document.documentElement.dataset.theme = theme;

  const { container } = render(ui);
  await settle(container);

  return page.elementLocator(container.firstElementChild!);
}

// Wait for everything that can still move after a render (or after an interaction
// that changes what's on screen — see FloatingError's open state).
export async function settle(root: ParentNode = document) {
  // Fonts first: the webfonts are preloaded in ./vrt.ts, but a component can ask
  // for a family/weight combination that wasn't preloaded, and MethodSteps' fit
  // routine re-runs off this same promise — so resolve it before measuring.
  await document.fonts.ready;

  // Then images. RecipeCard's hero is a real <img>; decode() resolves once the
  // pixels are actually ready to paint, not merely fetched.
  await Promise.all(
    [...root.querySelectorAll("img")].map((img) =>
      img.decode().catch(() => undefined),
    ),
  );

  // Then layout: two frames, so anything that measured in a layout effect (the
  // step-text fit) has been applied and painted.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
}
