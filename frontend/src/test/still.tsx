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

// Argos takes a string selector, not an element — a Locator can't be serialized
// across the browser/node boundary. So renderStill mounts into a marked wrapper
// and hands back a selector for the component root *inside* it: the wrapper is a
// plain block box (like RTL's own container, so it perturbs no layout), and the
// child is the element whose box we actually want cropped to.
export const COMPONENT = "[data-vrt-root] > *";

// Render a component and wait until it has stopped moving, then hand back the
// selector to shoot. Argos stabilizes before capturing too, but every settle done
// here is one it doesn't have to discover.
export async function renderStill(
  ui: ReactElement,
  { width, height, theme = "light" }: StillOptions,
) {
  await page.viewport(width, height);
  document.documentElement.dataset.theme = theme;

  const { container } = render(<div data-vrt-root>{ui}</div>);
  await settle(container);

  return COMPONENT;
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
