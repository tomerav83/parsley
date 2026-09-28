/**
 * @fileoverview How the rest of the app plays the wave: the one module callers
 * import.
 *
 *   const wave = useWave();
 *   if (wave) await wave(1, () => navigate("/next"));  // swap happens under cover
 *   else navigate("/next");                              // no wave: do it plainly
 *
 * Kept apart from WaveTransition.tsx so callers import no JSX, and so fast
 * refresh keeps working: a file that exports a component shouldn't also export
 * a context and a hook.
 */
import { createContext, use } from "react";

/** Which way the wave travels: 1 = forward (left to right), -1 = back (mirrored). */
export type Dir = 1 | -1;

/**
 * Cover the screen moving in `dir`, call `swap` while nothing is visible, then
 * uncover. Keep `swap` synchronous (change the route right there, don't await
 * inside it): the uncover begins as soon as it returns.
 *
 * @param dir - Which way the wave travels.
 * @param swap - The screen change to make under cover, e.g. a `navigate` call.
 *   Called exactly once, unless a newer wave starts before the cover frame.
 * @returns Resolves once the wave has fully gone; the swap happened earlier, at
 *   full cover. It never rejects. If a newer wave starts first, it never settles.
 * @throws Whatever `swap` throws, straight out of this call, when there's no
 *   overlay to draw on. With an overlay, the error is thrown in a later animation
 *   frame instead: the wave stops on the cover frame, leaving the screen covered
 *   and clicks blocked until the next wave, and the promise doesn't settle. So
 *   `swap` shouldn't throw.
 */
export type PlayWave = (dir: Dir, swap: () => void) => Promise<void>;

/**
 * Carries the play function from `<WaveTransition>` down to useWave. Its value
 * is null when there's no provider, or under reduced motion.
 */
export const WaveContext = createContext<PlayWave | null>(null);

/**
 * The wave, or null when it can't play: there's no `<WaveTransition>` above
 * (e.g. a component rendered alone in a test), or the user prefers reduced
 * motion.
 *
 * @returns The play function, or null. On null, make the change without a wave.
 */
export function useWave(): PlayWave | null {
  // Reduced motion is decided by <WaveTransition>, which provides null, so there
  // is one source of truth and this stays a plain context read.
  return use(WaveContext);
}
