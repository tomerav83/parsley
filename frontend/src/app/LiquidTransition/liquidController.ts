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

/**
 * Wave-only pass-through: cover in `dir`, swap the route under full cover, reveal.
 * The one navigation primitive the app uses — every screen change (submit,
 * landing, paste, back) rides one. The extraction itself no longer runs under
 * cover: the transition screen (ExtractScreen) shows the work orb while it pends.
 */
export async function wavePass(dir: Dir, swap: () => void): Promise<void> {
  const c = controller;
  if (!c) return void swap();
  await c.begin(dir);
  await c.reveal(dir, swap);
}
