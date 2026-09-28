// The player's clock, driven with synthetic timestamps — no rAF. What the frames
// contain is waveTimeline.test.ts; this is about which frame shows when.
import { describe, expect, it } from "vitest";
import { createFrameClock, FRAME_MS, type Tick } from "./frameClock.ts";
import { COVER_FRAME, WAVE_TIMELINE } from "./waveTimeline.ts";

// a frame's worth, plus a hair against float accumulation shortfall
const STEP = FRAME_MS + 0.001;

function play(times: number[]) {
  const clock = createFrameClock();
  return times.map((t) => clock.tick(t));
}

describe("frameClock", () => {
  it("starts on the timeline's first frame and steps one frame per frame of time", () => {
    const [first, second] = play([1000, 1000 + STEP]);
    expect(first!.amber.path).toBe(WAVE_TIMELINE[0]!.amber.path);
    expect(first!.amber.x).toBe(WAVE_TIMELINE[0]!.amber.xStart);
    expect(second!.amber.path).toBe(WAVE_TIMELINE[1]!.amber.path);
  });

  it("glides between frames — drawn on twos, moved on ones", () => {
    const [, a, b] = play([1000, 1000 + 6 * STEP, 1000 + 6.5 * STEP]);
    expect(b!.amber.path).toBe(a!.amber.path);
    expect(b!.amber.x).not.toBe(a!.amber.x);
  });

  it("reports cover once, on the tick that reaches it", () => {
    const ticks = play(
      Array.from(
        { length: WAVE_TIMELINE.length + 2 },
        (_, i) => 1000 + i * STEP,
      ),
    );
    expect(ticks.filter((t) => t?.covered)).toHaveLength(1);
    expect(ticks[COVER_FRAME]!.covered).toBe(true);
  });

  it("never skips the cover frame, however late the tick", () => {
    // walk up to a couple of frames short of cover, then one tick lands well past it
    const walk = Array.from(
      { length: COVER_FRAME - 1 },
      (_, i) => 1000 + i * STEP,
    );
    const ticks = play([...walk, walk.at(-1)! + 5 * FRAME_MS]);
    const late = ticks.at(-1);
    expect(ticks.some((t) => t?.covered && t !== late)).toBe(false);
    expect(late!.covered).toBe(true);
    expect(late!.emerald.path).toBe(WAVE_TIMELINE[COVER_FRAME]!.emerald.path);
  });

  it("clamps catch-up after a long rAF gap instead of bursting to the end", () => {
    const [, back] = play([1000, 11_000]); // tab was backgrounded mid-enter
    expect(back!.covered).toBe(false);
    expect(back!.amber.path).toBe(WAVE_TIMELINE[10]!.amber.path);
  });

  it("plays out: null once the timeline is over", () => {
    const ticks: (Tick | null)[] = [];
    const clock = createFrameClock();
    for (let t = 1000; ticks.at(-1) !== null; t += STEP)
      ticks.push(clock.tick(t));
    expect(ticks).toHaveLength(WAVE_TIMELINE.length + 1);
  });
});
