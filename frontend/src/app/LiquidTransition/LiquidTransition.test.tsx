// The overlay + module controller in real Chromium: registration, the
// under-cover swap contract, and input swallowing. Timing here is real (a full
// wave is ~1.6s), so assertions use generous waitFor windows.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL } from "./celPlayer.ts";
import { LiquidTransition } from "./LiquidTransition.tsx";
import { liquidAvailable, wavePass } from "./liquidController.ts";

const overlay = () =>
  document.querySelector<HTMLDivElement>('div[aria-hidden="true"]')!;
const emeraldD = () =>
  overlay()
    .querySelector("svg")!
    .querySelectorAll("path")[1]!
    .getAttribute("d") ?? "";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiquidTransition", () => {
  it("registers on mount, falls back when unmounted", async () => {
    expect(liquidAvailable()).toBe(false);
    const swap = vi.fn();
    await wavePass(1, swap); // no overlay: swap still runs, nothing hangs
    expect(swap).toHaveBeenCalledOnce();

    const { unmount } = render(<LiquidTransition />);
    expect(liquidAvailable()).toBe(true);
    unmount();
    expect(liquidAvailable()).toBe(false);

    // a stale overlay's cleanup must not clear a newer registration
    const first = render(<LiquidTransition />);
    render(<LiquidTransition />);
    first.unmount();
    expect(liquidAvailable()).toBe(true);
  });

  it("honors prefers-reduced-motion", () => {
    render(<LiquidTransition />);
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    expect(liquidAvailable()).toBe(false);
  });

  it("wavePass swaps under full cover, swallows input while active, then clears", async () => {
    render(<LiquidTransition />);
    let coverAtSwap = "";
    let activeAtSwap = false;

    const done = wavePass(-1, () => {
      coverAtSwap = emeraldD();
      activeAtSwap = overlay().hasAttribute("data-stage");
    });

    // RTL mirrors the wave svg (set imperatively, visible at once)
    expect(overlay().querySelector("svg")!.style.transform).toBe("scaleX(-1)");
    // input is swallowed while the wave covers the screen
    await vi.waitFor(() =>
      expect(getComputedStyle(overlay()).pointerEvents).toBe("auto"),
    );

    await done;
    expect(coverAtSwap).toBe(FULL);
    expect(activeAtSwap).toBe(true);
    expect(emeraldD()).toBe("");
    // deactivation lands with React's next commit
    await vi.waitFor(() => {
      expect(overlay().hasAttribute("data-stage")).toBe(false);
      expect(getComputedStyle(overlay()).pointerEvents).toBe("none");
    });
  }, 10_000);
});
