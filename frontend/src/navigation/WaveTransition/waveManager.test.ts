// @vitest-environment jsdom
// The pass contract on bare DOM elements with faked rAF: the swap runs exactly once
// under full cover, input is swallowed only until then, and a missing or
// unmounted overlay never strands a caller.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_COVER } from "./waveTimeline.ts";
import { WaveManager } from "./waveManager.ts";

const SVG = "http://www.w3.org/2000/svg";

function mounted() {
  const els = {
    overlay: document.createElement("div"),
    emerald: document.createElementNS(SVG, "path"),
    amber: document.createElementNS(SVG, "path"),
  };
  const wave = new WaveManager();
  const detach = wave.attach(els);
  return { wave, detach, ...els };
}

const WAVE_MS = 3000; // comfortably longer than one pass

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WaveManager", () => {
  it("covers, swaps once under full cover, reveals and clears", async () => {
    const { wave, overlay, emerald, amber } = mounted();
    const seen: string[] = [];
    const swap = vi.fn(() => {
      seen.push(emerald.getAttribute("d")!, amber.getAttribute("d")!);
      seen.push(overlay.dataset.stage!);
    });

    const done = wave.play(-1, swap);
    // cover swallows input at once, and a backward pass mirrors the art
    expect(overlay.dataset.stage).toBe("cover");
    expect(overlay.style.transform).toBe("scaleX(-1)");

    await vi.advanceTimersByTimeAsync(WAVE_MS);
    await done;
    expect(swap).toHaveBeenCalledOnce();
    expect(seen).toEqual([FULL_COVER, FULL_COVER, "cover"]);
    expect(emerald.getAttribute("d")).toBe("");
    expect(amber.getAttribute("d")).toBe("");
    expect(overlay.dataset.stage).toBeUndefined();
  });

  it("frees input the moment the swap has run", async () => {
    const { wave, overlay } = mounted();
    let stageAfterSwap: string | undefined;
    void wave.play(1, () => {
      queueMicrotask(() => (stageAfterSwap = overlay.dataset.stage));
    });
    await vi.advanceTimersByTimeAsync(WAVE_MS);
    expect(stageAfterSwap).toBe("exit");
    expect(overlay.style.transform).toBe("");
  });

  it("with nothing attached, still swaps and resolves", async () => {
    const wave = new WaveManager();
    const swap = vi.fn();
    await wave.play(1, swap);
    expect(swap).toHaveBeenCalledOnce();
  });

  it("a newer pass abandons the one in flight: its swap is skipped and it never settles", async () => {
    const { wave } = mounted();
    const oldSwap = vi.fn();
    const oldSettled = vi.fn();
    void wave.play(1, oldSwap).then(oldSettled);
    await vi.advanceTimersByTimeAsync(100); // still covering

    const newSwap = vi.fn();
    const done = wave.play(-1, newSwap);
    await vi.advanceTimersByTimeAsync(WAVE_MS);
    await done;
    expect(newSwap).toHaveBeenCalledOnce();
    expect(oldSwap).not.toHaveBeenCalled();
    expect(oldSettled).not.toHaveBeenCalled();
  });

  it("detaching mid-pass runs the pending swap and resolves", async () => {
    const { wave, detach, overlay } = mounted();
    const swap = vi.fn();
    const done = wave.play(1, swap);
    await vi.advanceTimersByTimeAsync(100);

    detach();
    await done;
    expect(swap).toHaveBeenCalledOnce();
    expect(overlay.dataset.stage).toBeUndefined();

    // a caller still holding the pass after unmount gets the plain swap
    const late = vi.fn();
    await wave.play(1, late);
    expect(late).toHaveBeenCalledOnce();
  });
});
