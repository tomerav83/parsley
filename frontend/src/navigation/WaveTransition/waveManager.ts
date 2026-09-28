/**
 * @fileoverview Plays a wave on screen: the only file here that writes to the
 * overlay's DOM. It runs a frameClock.ts clock on requestAnimationFrame and
 * writes each frame straight into the overlay's two SVG paths. Nothing goes
 * through React state, so a playing wave never re-renders anything, and there is
 * no React in this file.
 *
 * Edit here to change: what happens around a wave (input blocking, mirroring,
 * what counts as done), or how two overlapping waves resolve.
 */
import { createFrameClock, type Layer, type Tick } from "./frameClock.ts";
import type { Dir, PlayWave } from "./useWave.ts";

/** The overlay's elements, handed over by WaveTransition.tsx once mounted. */
export type WaveElements = {
  /** Gets `data-stage` (which the CSS keys off) and the mirror transform. */
  overlay: HTMLElement;
  /** The front (green) layer's path. */
  emerald: SVGPathElement;
  /** The back (amber) layer's path, drawn under emerald. */
  amber: SVGPathElement;
};

/** An empty layer: drawing it clears a path. */
const NOTHING: Layer = { path: "", x: 0 };

/**
 * Plays waves into one overlay. WaveTransition.tsx makes a single instance,
 * `attach`es the overlay's elements to it and shares `play` through context.
 * At most one wave plays at a time; see `play` for what a second one does.
 */
export class WaveManager {
  // Where waves are drawn. Null until attached, and again after detaching.
  #elements: WaveElements | null = null;
  // The pending requestAnimationFrame id, kept so it can be cancelled.
  #animationFrame = 0;
  // Finishes the wave that's playing, early if need be. Null when none is.
  #finishCurrent: (() => void) | null = null;

  /**
   * Start drawing waves into these elements.
   *
   * @param elements - The mounted overlay and its two SVG paths.
   * @returns A cleanup function for a `useEffect` to return. It finishes any
   *   playing wave at once (running its swap if that hadn't happened yet, and
   *   resolving its promise), then detaches, so later waves just swap without
   *   drawing.
   */
  attach(elements: WaveElements): () => void {
    this.#elements = elements;
    return () => {
      this.#finishCurrent?.();
      this.#elements = null;
    };
  }

  /**
   * Play one wave. Full contract in {@link PlayWave}.
   *
   * Starting a wave while another plays drops the older one: its swap never runs
   * if it hadn't yet, and its promise never settles, so whatever its caller meant
   * to do next is dropped too.
   *
   * @param dir - Which way the wave travels; -1 mirrors the overlay.
   * @param swap - Called once, synchronously, on the cover frame. With no
   *   overlay attached, it's called immediately instead.
   * @returns Resolves once the wave has fully gone (at once with no overlay).
   */
  // An arrow field, not a method: it's handed out unbound as the context value.
  play: PlayWave = (dir, swap) => {
    // A wave can only start mid-wave through a race (browser Back during one),
    // so the newer one simply wins.
    cancelAnimationFrame(this.#animationFrame);
    this.#finishCurrent = null;

    if (!this.#elements) {
      swap(); // overlay not mounted: just swap, so no caller waits forever
      return Promise.resolve();
    }
    this.#setOverlayDirection(dir);
    this.#setOverlayStage("cover");
    const clock = createFrameClock();

    return new Promise<void>((resolve) => {
      let swapped = false;
      const swapUnderCover = () => {
        swapped = true;
        swap();
        this.#setOverlayStage("exit");
      };
      const finish = () => {
        this.#finishCurrent = null;
        cancelAnimationFrame(this.#animationFrame);
        if (!swapped) swapUnderCover();
        this.#updateDOMPaths(NOTHING, NOTHING);
        this.#setOverlayStage(null);
        resolve();
      };
      this.#finishCurrent = finish;

      const onAnimationFrame = (now: number) => {
        const tick: Tick | null = clock.tick(now);
        if (!tick) return finish();
        this.#updateDOMPaths(tick.emerald, tick.amber);
        if (tick.covered) swapUnderCover();
        this.#animationFrame = requestAnimationFrame(onAnimationFrame);
      };
      this.#animationFrame = requestAnimationFrame(onAnimationFrame);
    });
  };

  /**
   * Write both layers into their SVG paths. Does nothing when detached.
   *
   * @param emerald - What the front path shows this frame.
   * @param amber - What the back path shows this frame.
   */
  #updateDOMPaths(emerald: Layer, amber: Layer) {
    if (!this.#elements) return;
    for (const [path, layer] of [
      [this.#elements.emerald, emerald],
      [this.#elements.amber, amber],
    ] as const) {
      path.setAttribute("d", layer.path);
      path.setAttribute("transform", `translate(${layer.x} 0)`);
    }
  }

  /**
   * Set the overlay's `data-stage`, which the CSS keys off. Does nothing when
   * detached.
   *
   * @param stage - "cover": the overlay blocks clicks. "exit": the new screen is
   *   live under the departing wave. null: overlay hidden.
   */
  #setOverlayStage(stage: "cover" | "exit" | null) {
    if (!this.#elements) return;
    if (stage) this.#elements.overlay.dataset.stage = stage;
    else delete this.#elements.overlay.dataset.stage;
  }

  /**
   * Point the overlay the way the wave travels: a backward wave is the forward
   * art mirrored. Does nothing when detached.
   *
   * @param dir - 1 leaves the overlay as drawn; -1 flips it horizontally.
   */
  #setOverlayDirection(dir: Dir) {
    if (!this.#elements) return;
    this.#elements.overlay.style.transform = dir === -1 ? "scaleX(-1)" : "";
  }
}
