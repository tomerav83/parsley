// The choreography's invariants, read straight off the built timeline — no clock.
import { describe, expect, it } from "vitest";
import {
  COVER_FRAME,
  WAVE_TIMELINE,
  FULL_COVER,
  type LayerFrame,
} from "./waveTimeline.ts";

const isFull = (l: LayerFrame) =>
  l.path === FULL_COVER && l.xStart === 0 && l.xEnd === 0;
const before = WAVE_TIMELINE.slice(0, COVER_FRAME);
const after = WAVE_TIMELINE.slice(COVER_FRAME + 1);

describe("waveTimeline", () => {
  it("opens with the amber wall alone", () => {
    expect(WAVE_TIMELINE[0]!.amber.path).not.toBe("");
    expect(WAVE_TIMELINE[0]!.emerald.path).toBe("");
  });

  it("swaps under a frame where both walls fully cover", () => {
    expect(isFull(WAVE_TIMELINE[COVER_FRAME]!.emerald)).toBe(true);
    expect(isFull(WAVE_TIMELINE[COVER_FRAME]!.amber)).toBe(true);
  });

  it("holds full cover one more frame after the swap, so its commit is never seen", () => {
    expect(isFull(after[0]!.emerald)).toBe(true);
    expect(isFull(after[0]!.amber)).toBe(true);
  });

  it("can never open a gap at the anchored edge", () => {
    // going in the mass is left-anchored, so the art only glides back of the front;
    // coming out it's right-anchored, so only on past the trailing edge
    const offsets = (frames: typeof WAVE_TIMELINE) =>
      frames.flatMap(({ emerald, amber }) => [
        emerald.xStart,
        emerald.xEnd,
        amber.xStart,
        amber.xEnd,
      ]);
    expect(Math.max(...offsets(before))).toBeLessThanOrEqual(1e-9);
    expect(Math.min(...offsets(after))).toBeGreaterThanOrEqual(-1e-9);
  });

  it("amber trails the reveal and leaves last", () => {
    const opening = after.find(({ emerald }) => !isFull(emerald))!;
    expect(isFull(opening.amber)).toBe(true);
    const last = WAVE_TIMELINE.at(-1)!;
    expect(last.emerald.path).toBe("");
    expect(last.amber.path).not.toBe("");
  });
});
