// The provider in real Chromium: who gets a wave, and one real pass through the
// mounted overlay. The pass contract in detail is waveManager.test.ts; timing here is
// real (a full wave is ~1.9s), so assertions use generous windows.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL_COVER } from "./waveTimeline.ts";
import { WaveTransition } from "./WaveTransition.tsx";
import { useWave, type PlayWave } from "./useWave.ts";

let wave: PlayWave | null = null;
function Probe() {
  wave = useWave();
  return null;
}

const overlay = () =>
  document.querySelector<HTMLDivElement>('div[aria-hidden="true"]')!;

afterEach(() => {
  vi.restoreAllMocks();
  wave = null;
});

describe("WaveTransition", () => {
  it("provides a wave to what it wraps, and nothing outside it", () => {
    render(<Probe />);
    expect(wave).toBeNull();
    render(
      <WaveTransition>
        <Probe />
      </WaveTransition>,
    );
    expect(wave).toBeTypeOf("function");
  });

  it("withholds the wave while reduced motion is preferred, live", () => {
    let onChange = () => {};
    const query = {
      matches: true,
      addEventListener: (_: string, cb: () => void) => (onChange = cb),
      removeEventListener: () => {},
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(
      query as unknown as MediaQueryList,
    );
    render(
      <WaveTransition>
        <Probe />
      </WaveTransition>,
    );
    expect(wave).toBeNull();

    query.matches = false;
    onChange();
    return vi.waitFor(() => expect(wave).toBeTypeOf("function"));
  });

  it("plays a real pass: swap under full cover with input swallowed, then clears", async () => {
    render(
      <WaveTransition>
        <Probe />
      </WaveTransition>,
    );
    const emerald = () => overlay().querySelectorAll("path")[1]!;
    let coverAtSwap = "";
    let pointerEventsAtSwap = "";

    await wave!(1, () => {
      coverAtSwap = emerald().getAttribute("d")!;
      pointerEventsAtSwap = getComputedStyle(overlay()).pointerEvents;
    });

    expect(coverAtSwap).toBe(FULL_COVER);
    expect(pointerEventsAtSwap).toBe("auto");
    expect(emerald().getAttribute("d")).toBe("");
    expect(getComputedStyle(overlay()).pointerEvents).toBe("none");
    expect(getComputedStyle(overlay()).visibility).toBe("hidden");
  }, 10_000);

  it("unmounting mid-pass never strands the caller", async () => {
    const { unmount } = render(
      <WaveTransition>
        <Probe />
      </WaveTransition>,
    );
    const swap = vi.fn();
    const done = wave!(1, swap);
    unmount();
    await done;
    expect(swap).toHaveBeenCalledOnce();
  });
});
