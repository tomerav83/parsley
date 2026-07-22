// The overlay + module controller in real Chromium: registration, the
// under-cover swap contract, input swallowing, and the whirl showing only
// while an extraction is actually pending. Timing here is real (a full wave
// is ~1.6s), so assertions use generous waitFor windows.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL } from "./celPlayer.ts";
import { LiquidTransition } from "./LiquidTransition.tsx";
import {
  liquidAvailable,
  wavePass,
  waveExtract,
  waveReveal,
} from "./liquidController.ts";

const overlay = () =>
  document.querySelector<HTMLDivElement>('div[aria-hidden="true"]')!;
const emeraldD = () =>
  overlay().querySelectorAll("path")[1]!.getAttribute("d") ?? "";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiquidTransition", () => {
  it("registers on mount, falls back when unmounted", async () => {
    expect(liquidAvailable()).toBe(false);
    const swap = vi.fn();
    await wavePass(1, swap); // no overlay: swap still runs, nothing hangs
    expect(swap).toHaveBeenCalledOnce();
    expect(await waveExtract(async () => "direct")).toBe("direct");
    const revealSwap = vi.fn();
    await waveReveal(1, revealSwap);
    expect(revealSwap).toHaveBeenCalledOnce();

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
    // data-active lands with React's commit, not synchronously
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

  it("an instantly-settling task still shows the whirlpool beat", async () => {
    render(<LiquidTransition />);
    const covered = waveExtract(() => Promise.resolve("fast"));
    // even though the task settled before cover, the whirl must appear
    await vi.waitFor(
      () => {
        const shown = [...overlay().querySelectorAll("g")].filter(
          (g) => g.style.visibility === "visible",
        );
        expect(shown.length).toBe(1);
      },
      { timeout: 5000 },
    );
    expect(await covered).toBe("fast");
    await waveReveal(-1);
  }, 10_000);

  it("a throwing task drains back before rethrowing — never left covered", async () => {
    render(<LiquidTransition />);
    await expect(
      waveExtract(() => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await vi.waitFor(
      () => expect(overlay().hasAttribute("data-stage")).toBe(false),
      { timeout: 5000 },
    );
  }, 10_000);

  it("waveExtract whirls only while the task pends, then reveals on demand", async () => {
    render(<LiquidTransition />);
    let resolveTask!: (v: string) => void;
    const task = new Promise<string>((r) => (resolveTask = r));

    const covered = waveExtract(() => task);

    // once covered and still pending, one whirl pose is visible
    await vi.waitFor(
      () => {
        const shown = [...overlay().querySelectorAll("g")].filter(
          (g) => g.style.visibility === "visible",
        );
        expect(shown.length).toBe(1);
      },
      { timeout: 5000 },
    );

    resolveTask("ok");
    expect(await covered).toBe("ok");

    const swap = vi.fn(() => expect(emeraldD()).toBe(FULL));
    await waveReveal(1, swap);
    expect(swap).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(overlay().hasAttribute("data-stage")).toBe(false),
    );
  }, 10_000);
});
