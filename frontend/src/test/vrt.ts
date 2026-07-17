// Extra setup for the `vrt` project only (runs after ./setup.ts). Everything here
// removes a source of pixel nondeterminism — a VRT that flakes gets muted, and a
// muted VRT is worth less than no VRT at all.
import { beforeAll, beforeEach } from "vitest";

// The real design tokens and @font-face rules. Nothing else pulls index.css into a
// test — the behaviour tests query by role and don't care how it looks — so
// without this every component would render with no tokens and fallback system
// fonts, baking a lie into every baseline.
import "@/index.css";

// Belt-and-braces animation freeze, as documented by Vitest. The Playwright
// provider already passes `animations: 'disabled'` to the screenshot (finite
// animations are fast-forwarded to their final frame, transitions stopped), which
// covers FloatingError's 0.5s spring entry on its own. This makes the resting
// frame the only thing a baseline can capture, even if that default ever changes.
// Motion itself is out of VRT's scope.
// https://vitest.dev/guide/browser/visual-regression-testing
const FREEZE = `*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}`;

// Force both webfonts into the font set once, up front. `document.fonts.ready`
// only settles the loads already pending, and @font-face + font-display:swap
// doesn't start a load until a glyph needs the family — so awaiting `ready`
// straight after render can resolve against fallback metrics and only *then*
// swap. That matters more here than usual: MethodSteps measures text and shrinks
// the font to fit, so a metrics change doesn't just reflow, it re-runs the fit.
beforeAll(async () => {
  await Promise.all([
    document.fonts.load('400 16px "Inter"'),
    document.fonts.load('700 16px "Inter"'),
    document.fonts.load('400 16px "Space Mono"'),
    document.fonts.load('700 16px "Space Mono"'),
  ]);
});

beforeEach(() => {
  const style = document.createElement("style");
  style.textContent = FREEZE;
  document.head.append(style);
  // ./setup.ts's cleanup() only unmounts React trees — this is ours to remove.
  return () => style.remove();
});
