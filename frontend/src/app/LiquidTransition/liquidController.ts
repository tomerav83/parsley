// Module-level handle to the mounted LiquidTransition overlay. Kept apart
// from the component so useExtractionFlow imports no JSX and fast refresh
// keeps working on the component file.
//
// Every entry point degrades when no overlay is registered (not mounted, or
// it unmounted mid-wave): the swap still runs, promises still resolve —
// callers never hang and tests that mount App alone stay on the plain path.

export type Dir = 1 | -1; // 1 = LTR (forward in the filmstrip), -1 = RTL (back)

export type LiquidController = {
  begin(dir: Dir): Promise<void>;
  reveal(dir: Dir, swap?: () => void): Promise<void>;
};

let controller: LiquidController | null = null;

/** Called by the overlay on mount; returns the matching unregister. */
export function registerLiquid(c: LiquidController): () => void {
  controller = c;
  return () => {
    // StrictMode double-mounts: only clear the registration we own
    if (controller === c) controller = null;
  };
}

export function liquidAvailable(): boolean {
  return (
    controller !== null &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Wave-only pass-through (no whirl): cover, swap under full cover, reveal. */
export async function wavePass(dir: Dir, swap: () => void): Promise<void> {
  const c = controller;
  if (!c) return void swap();
  await c.begin(dir);
  await c.reveal(dir, swap);
}

// The shortest hold once covered: ~two whirl pose cycles. An instantly
// settling task (a lightning-fast failure, a cached response) would otherwise
// release at cover and skip the whirlpool entirely — the run must still read
// as "it tried": cover → whirl → outcome.
const MIN_WHIRL_MS = 700;

/**
 * Extraction cover: the surge starts WITH the task; the whirlpool cycles
 * while the task pends, and for at least the minimum beat. Resolves under
 * full cover with the task's result — follow with waveReveal to land or
 * drain.
 */
export async function waveExtract<T>(task: () => Promise<T>): Promise<T> {
  const c = controller;
  if (!c) return task();
  const whirled = c
    .begin(1)
    .then(() => new Promise<void>((r) => setTimeout(r, MIN_WHIRL_MS)));
  try {
    const [result] = await Promise.all([task(), whirled]);
    return result;
  } catch (err) {
    // never leave the screen covered: drain back, then let the caller see it
    await whirled;
    await c.reveal(-1);
    throw err;
  }
}

/** Reveal from full cover: optional swap runs under cover, then the wave exits. */
export async function waveReveal(dir: Dir, swap?: () => void): Promise<void> {
  const c = controller;
  if (!c) return void swap?.();
  await c.reveal(dir, swap);
}
