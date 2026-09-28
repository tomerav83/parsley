/**
 * @fileoverview What the wave looks like: a list of frames, built once when the
 * app loads. WAVE_TIMELINE[i] says what both colour layers show during frame i:
 * which traced drawing from drawings.ts, and how far it's slid sideways. Nothing
 * here knows about time, the DOM or React; frameClock.ts walks this list at 24
 * frames a second and waveManager.ts paints it.
 *
 *   amber:    [ coming in ][ full ×3 ] full [ full ×3 ][ going out ]
 *   emerald:  [ blank ×3 ][ coming in ] full [ going out ][ blank ×3 ]
 *                                        ↑
 *              COVER_FRAME: both layers cover the screen, the route swaps here
 *
 * Amber runs AMBER_LEAD frames ahead of emerald on the way in and the same number
 * behind on the way out, so a band of amber leads the green in and trails it out.
 *
 * Edit here to change: which drawings play (the numbers passed to
 * `comingIn`/`goingOut`), the amber/emerald gap (AMBER_LEAD), or how the drawings
 * move.
 */
import { DRAWINGS } from "./drawings.ts";

/**
 * One layer during one frame: the SVG path to draw (empty for nothing), and how
 * far in art pixels to slide it sideways at the frame's start and end.
 * frameClock.ts moves it smoothly between the two, so the drawings (which mostly
 * change every other frame) still move at the display's full refresh rate.
 */
export type LayerFrame = { path: string; xStart: number; xEnd: number };
/** Both colour layers during one frame of the wave. */
export type Frame = { emerald: LayerFrame; amber: LayerFrame };

const AMBER_LEAD = 3; // frames
const ART_WIDTH = 1280; // the drawings' viewBox width

const drawingsByNumber = new Map(DRAWINGS.map((d) => [d.f, d]));

/** The path of the drawing that fills the whole screen. */
export const FULL_COVER = drawing(64).path;
const BLANK: LayerFrame = { path: "", xStart: 0, xEnd: 0 };
const FULL: LayerFrame = { path: FULL_COVER, xStart: 0, xEnd: 0 };

// Drawing numbers are frames of the source clip (see drawings.ts).
const IN = comingIn([52, 53, 56, 57, 59, 61, 63, 64]);
const OUT = [
  // one still, full frame first, so the swapped-in screen has rendered before
  // the first sliver of it shows
  FULL,
  // runs into the clip's spray (13–16) so the last drops fade rather than pop off
  ...goingOut([66, 68, 70, 72, 1, 2, 4, 5, 7, 9, 11, 13, 15, 16]),
];

// The two tracks, spelled out like the diagram at the top of the file. Same
// pieces in a different order, so always the same length.
// prettier-ignore
const EMERALD = [...gap(BLANK), ...IN,        FULL, ...OUT,       ...gap(BLANK)];
// prettier-ignore
const AMBER   = [...IN,         ...gap(FULL), FULL, ...gap(FULL), ...OUT];
//                                            ↑ COVER_FRAME

/** The frame both layers fully cover the screen — the route swaps here. */
export const COVER_FRAME = IN.length + AMBER_LEAD;

const pairs = EMERALD.map((emerald, i) => [emerald, AMBER[i]!] as const);

/** Every frame of one wave, in order. Index `i` plays during frame `i`. */
export const WAVE_TIMELINE: Frame[] = pairs.map(([emerald, amber]) => ({
  emerald,
  amber,
}));

// The helpers below run while the module loads. They're function declarations,
// so they're hoisted and the timeline above can call them, but every const they
// read must be declared above the timeline.

/**
 * Build the frames for the liquid rolling in from the left. Its leading edge sits
 * at coverage × width. Each slot shows the NEXT drawing held back to the current
 * edge, so it can only slide forward and no gap opens behind it. The last drawing
 * is shown still, where it was drawn.
 *
 * @param drawingNumbers - Source-clip frame numbers, in play order.
 * @returns Each drawing's `hold` frames, in order.
 * @throws Error if a number has no drawing in drawings.ts.
 */
function comingIn(drawingNumbers: number[]): LayerFrame[] {
  const drawings = drawingNumbers.map(drawing);
  const leadingEdge = (d: Drawing) => d.coverage * ART_WIDTH;
  return drawings.flatMap((current, i) => {
    const next = drawings[i + 1] ?? current;
    return slide({
      path: next.path,
      edgeInArt: leadingEdge(next),
      fromX: leadingEdge(current),
      toX: leadingEdge(next),
      frames: current.hold,
    });
  });
}

/**
 * Build the frames for the liquid rolling off to the right. Its trailing edge
 * sits at (1 - coverage) × width. Each slot shows the CURRENT drawing sliding on
 * toward where the next one starts (the last one slides off the screen).
 *
 * @param drawingNumbers - Source-clip frame numbers, in play order.
 * @returns Each drawing's `hold` frames, in order.
 * @throws Error if a number has no drawing in drawings.ts.
 */
function goingOut(drawingNumbers: number[]): LayerFrame[] {
  const drawings = drawingNumbers.map(drawing);
  const trailingEdge = (d: Drawing) => (1 - d.coverage) * ART_WIDTH;
  return drawings.flatMap((current, i) => {
    const next = drawings[i + 1];
    return slide({
      path: current.path,
      edgeInArt: trailingEdge(current),
      fromX: trailingEdge(current),
      toX: next ? trailingEdge(next) : ART_WIDTH,
      frames: current.hold,
    });
  });
}

/**
 * Show `path` for `frames` frames while its edge glides from screen x `fromX`
 * to `toX`, at an even pace. All positions are in art pixels.
 *
 * @param options.edgeInArt - Where the moving edge sits in the drawing itself;
 *   subtracting it turns a screen position into a slide offset.
 * @param options.fromX - The edge's screen x at the start of the first frame.
 * @param options.toX - The edge's screen x at the end of the last frame.
 * @param options.frames - How many frames to spread the glide over.
 * @returns `frames` LayerFrames, each ending where the next begins.
 */
function slide({
  path,
  edgeInArt,
  fromX,
  toX,
  frames,
}: {
  path: string;
  edgeInArt: number;
  fromX: number;
  toX: number;
  frames: number;
}): LayerFrame[] {
  const xAt = (k: number) => fromX + ((toX - fromX) * k) / frames - edgeInArt;
  return Array.from({ length: frames }, (_, k) => ({
    path,
    xStart: xAt(k),
    xEnd: xAt(k + 1),
  }));
}

/** A traced drawing under readable names (drawings.ts is generated, so it keeps f/c/d). */
type Drawing = { path: string; coverage: number; hold: number };

/**
 * Look up a traced drawing by its source-clip frame number.
 *
 * @param n - The frame number (`f` in drawings.ts).
 * @returns That drawing, with readable field names.
 * @throws Error if drawings.ts has no drawing `n`, e.g. after a re-trim. This
 *   runs while the module loads, so the app fails at startup, not mid-wave.
 */
function drawing(n: number): Drawing {
  const traced = drawingsByNumber.get(n);
  if (!traced) throw new Error(`drawings.ts is missing drawing ${n}`);
  return { path: traced.d, coverage: traced.c, hold: traced.hold };
}

/**
 * The gap between amber and emerald: one layer repeated.
 *
 * @param layer - What fills the gap (BLANK or FULL).
 * @returns AMBER_LEAD copies of `layer`.
 */
function gap(layer: LayerFrame): LayerFrame[] {
  return Array<LayerFrame>(AMBER_LEAD).fill(layer);
}
