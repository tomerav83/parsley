// Module-level handle to the mounted overlay, kept apart from the component so the
// flow hook imports no JSX and fast refresh keeps working over there.
//
// With no overlay registered — never mounted, or unmounted mid-wave — every entry
// point still runs the swap and resolves its promise. Callers can't hang.

export type Dir = 1 | -1; // 1 = forward through the filmstrip, -1 = back

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

/** Whether a wave can actually play: an overlay is mounted and motion is welcome. */
export function liquidAvailable(): boolean {
  return (
    controller !== null &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Cover the screen in `dir`, run `swap` while nothing is visible, then reveal.
 * Every screen change rides one of these.
 */
export async function wavePass(dir: Dir, swap: () => void): Promise<void> {
  const c = controller;
  if (!c) return void swap();
  await c.begin(dir);
  await c.reveal(dir, swap);
}
