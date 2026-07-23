// The cel machine's sequence invariants — ported from the approved prototype's
// smoke test (frontend/.visual-check/liquid-transition/check.cjs) and driven
// with a synthetic clock through tick(), no rAF.
import { describe, expect, it } from "vitest";
import {
  createCelPlayer,
  FRAME_MS,
  FULL,
  type LiquidFrame,
} from "./celPlayer.ts";

function harness() {
  const frames: LiquidFrame[] = [];
  let covered = 0;
  let finished = 0;
  let onCoveredHook: (() => void) | null = null;
  const player = createCelPlayer({
    onFrame: (f) => frames.push(f),
    onCovered: () => {
      covered++;
      onCoveredHook?.();
    },
    onFinished: () => finished++,
  });
  let t = 1000;
  // advance n animation frames' worth of time, one tick per frame
  const advance = (n: number) => {
    for (let i = 0; i < n; i++) {
      t += FRAME_MS + 0.001; // guard against float accumulation shortfall
      player.tick(t);
    }
  };
  const begin = () => {
    player.start();
    player.tick(t); // first tick only arms the clock
  };
  return {
    player,
    frames,
    coveredCount: () => covered,
    finishedCount: () => finished,
    onCovered: (fn: () => void) => (onCoveredHook = fn),
    advance,
    begin,
    tickAt: (ms: number) => {
      t += ms;
      return player.tick(t);
    },
  };
}

function runToEnd(h: ReturnType<typeof harness>, releaseAfter: number) {
  h.onCovered(() => {
    if (releaseAfter === 0) h.player.release();
  });
  h.begin();
  h.advance(200); // enter + hold cap
  if (releaseAfter > 0) {
    h.player.release();
    h.advance(200);
  }
}

describe("celPlayer sequence", () => {
  it("amber wall leads before emerald appears, then both reach full cover", () => {
    const h = harness();
    h.begin();
    h.advance(2);
    expect(h.frames[0]!.am).not.toBe("");
    expect(h.frames[0]!.em).toBe("");

    h.advance(30);
    expect(h.coveredCount()).toBe(1);
    const atCover = h.frames.findIndex((f) => f.em === FULL);
    expect(atCover).toBeGreaterThan(0);
    expect(h.frames[atCover]!.am).toBe(FULL);
  });

  it("immediate release: a full-cover buffer for the swap before reveal", () => {
    const h = harness();
    runToEnd(h, 0);

    expect(h.finishedCount()).toBe(1);

    // between reaching full cover and the first reveal frame there are at
    // least two frames where both layers still fully cover (swap commits here)
    const firstFull = h.frames.findIndex((f) => f.em === FULL);
    const firstOpen = h.frames.findIndex(
      (f, i) => i > firstFull && f.em !== FULL,
    );
    expect(firstOpen - firstFull).toBeGreaterThanOrEqual(2);
  });

  it("amber trails the reveal, then both layers empty and the player stops", () => {
    const h = harness();
    runToEnd(h, 10);

    const firstOpenIdx = h.frames.findIndex((f, i) => i > 17 && f.em !== FULL);
    // emerald has started opening while amber still fully covers (trailing band)
    expect(h.frames[firstOpenIdx]!.am).toBe(FULL);

    const last = h.frames[h.frames.length - 1]!;
    expect(last.em).toBe("");
    expect(last.am).toBe("");
    expect(h.finishedCount()).toBe(1);
    expect(h.player.phase).toBe("idle");
    expect(h.tickAt(FRAME_MS)).toBe(false);
  });

  it("restarts cleanly for a second run", () => {
    const h = harness();
    runToEnd(h, 0);
    runToEnd(h, 0);
    expect(h.coveredCount()).toBe(2);
    expect(h.finishedCount()).toBe(2);
  });

  it("glides the artwork between drawings — moved on ones, drawn on twos", () => {
    const h = harness();
    h.begin();
    h.advance(6); // into the surge
    const a = h.frames[h.frames.length - 1]!;
    h.tickAt(FRAME_MS / 2); // half a frame later
    const b = h.frames[h.frames.length - 1]!;
    // the silhouette swap stays on the film's cadence...
    expect(b.am).toBe(a.am);
    // ...but the artwork has moved in between
    expect(b.amDx).not.toBe(a.amDx);
    // enter glides only backward of the front — the left-anchored mass can
    // never open a gap
    expect(h.frames.every((f) => f.amDx <= 0.001 && f.emDx <= 0.001)).toBe(
      true,
    );
  });

  it("clamps catch-up after a long rAF gap instead of bursting to the end", () => {
    const h = harness();
    h.begin();
    h.tickAt(10_000); // tab was backgrounded mid-enter
    // enter is 17 frames; the clamp allows at most 10 in one tick
    expect(h.coveredCount()).toBe(0);
    expect(h.frames.length).toBeLessThanOrEqual(10);
  });
});
