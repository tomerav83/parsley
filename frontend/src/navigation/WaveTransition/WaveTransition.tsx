/**
 * @fileoverview The overlay the wave is drawn on, and the provider that offers
 * its play function to the app.
 *
 * Edit here to change: the overlay's markup, or when the wave is offered at all
 * (today: withheld under reduced motion).
 */
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { WaveContext } from "./useWave.ts";
import { WaveManager } from "./waveManager.ts";
import styles from "./WaveTransition.module.css";

// Read through useSyncExternalStore so toggling it in the OS applies at once.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/**
 * useSyncExternalStore's subscribe: listen for the preference changing.
 *
 * @param onChange - Called whenever the preference flips.
 * @returns A function that stops listening.
 */
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/** useSyncExternalStore's snapshot: true when the user asks for reduced motion. */
const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/**
 * Renders the wave overlay and provides its play function to everything inside
 * (read it with useWave). Under `prefers-reduced-motion` it provides null
 * instead, so callers change screens without a wave. Wraps the router in
 * main.tsx. A playing wave doesn't re-render it: waveManager.ts draws into the
 * paths directly.
 *
 * @param props.children - The app. It renders under the overlay, and anything
 *   in it can call useWave.
 * @returns The children, then the overlay (hidden until a wave plays), inside
 *   the WaveContext provider.
 */
export function WaveTransition({ children }: { children: ReactNode }) {
  const [wave] = useState(() => new WaveManager());
  const overlayRef = useRef<HTMLDivElement>(null);
  const emeraldRef = useRef<SVGPathElement>(null);
  const amberRef = useRef<SVGPathElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
  );

  useEffect(
    () =>
      wave.attach({
        overlay: overlayRef.current!,
        emerald: emeraldRef.current!,
        amber: amberRef.current!,
      }),
    [wave],
  );

  return (
    <WaveContext value={reducedMotion ? null : wave.play}>
      {children}
      <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
        {/* The drawings' own 1280x720 space. `slice` keeps the shapes
            undistorted at any viewport aspect; xMin pins the leading edge, and a
            backward wave's scaleX(-1) on the overlay mirrors that to xMax. */}
        <svg
          className={styles.wave}
          viewBox="0 0 1280 720"
          preserveAspectRatio="xMinYMid slice"
        >
          <path ref={amberRef} className={styles.amber} fillRule="evenodd" />
          <path
            ref={emeraldRef}
            className={styles.emerald}
            fillRule="evenodd"
          />
        </svg>
      </div>
    </WaveContext>
  );
}
