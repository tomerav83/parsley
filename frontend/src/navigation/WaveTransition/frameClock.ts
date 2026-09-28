/**
 * @fileoverview The clock that walks waveTimeline.ts: given the current time,
 * it says which frame is due and what to draw. It never reads the time itself,
 * so tests can feed it made-up timestamps; waveManager.ts feeds it
 * requestAnimationFrame's.
 *
 * Edit here to change: playback speed (FRAME_MS), or how far a wave jumps ahead
 * when a background tab comes back (MAX_CATCH_UP_MS).
 */
import { COVER_FRAME, WAVE_TIMELINE } from "./waveTimeline.ts";

/** How long one timeline frame lasts, in ms: the wave plays at 24 frames a second. */
export const FRAME_MS = 1000 / 24;
// A background tab stops requestAnimationFrame, so the first tick back can be
// seconds late. Cap how far one tick advances, so the wave resumes near where it
// stopped instead of jumping to its end.
const MAX_CATCH_UP_MS = 10 * FRAME_MS;

/** A layer ready to draw: its path, slid `x` art pixels sideways. */
export type Layer = { path: string; x: number };
/** What to draw now, and whether this is the moment the screen is fully covered. */
export type Tick = { emerald: Layer; amber: Layer; covered: boolean };

/**
 * The time side of the clock: turns timestamps into whole frames to advance,
 * plus how far the clock is into the current frame. Knows nothing of
 * WAVE_TIMELINE.
 */
class TimelineAccumulator {
  #accumulatedMs = 0;
  #lastNow: number | null = null;

  /**
   * Take in the current time and count the frames it completes. The first call
   * only sets the starting time. After a long gap, it counts at most
   * MAX_CATCH_UP_MS worth of frames.
   *
   * @param now - The current time in ms, e.g. a requestAnimationFrame timestamp.
   *   Must not go backwards between calls.
   * @returns How many whole frames have been completed since the last call
   *   (0 or more, at most MAX_CATCH_UP_MS / FRAME_MS).
   */
  advance(now: number): number {
    const elapsed = this.#lastNow === null ? 0 : now - this.#lastNow;
    this.#lastNow = now;
    const ms = Math.min(this.#accumulatedMs + elapsed, MAX_CATCH_UP_MS);
    const framesToAdvance = Math.floor(ms / FRAME_MS);
    this.#accumulatedMs = ms - framesToAdvance * FRAME_MS;
    return framesToAdvance;
  }

  /** How far into the current frame the clock is, 0 to 1. */
  get progress(): number {
    return this.#accumulatedMs / FRAME_MS;
  }
}

/**
 * Start a clock at the first frame of WAVE_TIMELINE. Make a new one per wave;
 * a clock can't be rewound.
 *
 * @returns A clock with one method, `tick(now)`, to call once per animation
 *   frame with the current time.
 */
export function createFrameClock() {
  const timeline = new TimelineAccumulator();
  let frame = 0; // index into WAVE_TIMELINE

  return {
    /**
     * Move to time `now` and work out what to draw. A late tick never skips the
     * cover frame: it stops there (dropping the frames it would have passed),
     * so exactly one tick reports `covered: true`.
     *
     * @param now - The current time in ms. The first call is frame 0.
     * @returns What to draw now, or null once the timeline has finished (and on
     *   every call after that).
     */
    tick(now: number): Tick | null {
      const next = frame + timeline.advance(now);
      // The route has to swap while the screen is actually covered.
      const covered = frame < COVER_FRAME && next >= COVER_FRAME;
      frame = covered ? COVER_FRAME : next;

      const current = WAVE_TIMELINE[frame];
      if (!current) return null;
      const { emerald, amber } = current;
      const { progress } = timeline;
      return {
        emerald: {
          path: emerald.path,
          x: emerald.xStart + (emerald.xEnd - emerald.xStart) * progress,
        },
        amber: {
          path: amber.path,
          x: amber.xStart + (amber.xEnd - amber.xStart) * progress,
        },
        covered,
      };
    },
  };
}
