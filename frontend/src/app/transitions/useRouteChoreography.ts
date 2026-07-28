import { useEffect, useRef } from "react";
import {
  useBlocker,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import {
  liquidAvailable,
  wavePass,
  type Dir,
} from "../LiquidTransition/liquidController.ts";
import { screenOrder } from "./screens.ts";

/**
 * Wave navigation: `go` is the one primitive every screen change uses, and the
 * blocker below makes the browser's back/forward ride the same wave.
 *
 * Split out of useExtractionFlow so that hook stays about the journey rather than
 * the animation. Without the overlay, or under reduced motion, everything here
 * degrades to a plain view-transition navigation.
 */
export function useRouteChoreography() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  // A POP swaps the route without going through go(), so it would skip the wave.
  // Block it, play the wave, and let proceed() commit the swap under full cover —
  // the same cover-then-reveal the in-app buttons get.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      historyAction === "POP" &&
      liquidAvailable() &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const popWaving = useRef(false);
  useEffect(() => {
    if (blocker.state !== "blocked") {
      popWaving.current = false;
      return;
    }
    if (popWaving.current) return; // one wave per blocked POP
    popWaving.current = true;
    const dir: Dir =
      screenOrder(blocker.location.pathname) < screenOrder(location.pathname)
        ? -1
        : 1;
    void wavePass(dir, () => blocker.proceed());
  }, [blocker, location.pathname]);

  // Cover in `dir`, swap the route while the screen is hidden, reveal; the promise
  // resolves once the wave is fully out of the way. `afterSwap` runs under that
  // cover, which is how the transition screen's error clears without flashing its
  // stray-landing guard on the way out.
  function go(
    dir: Dir,
    to: string,
    opts?: { replace?: boolean },
    afterSwap?: () => void,
  ): Promise<void> {
    if (!liquidAvailable()) {
      navigate(to, { ...opts, viewTransition: true });
      afterSwap?.();
      return Promise.resolve();
    }
    return wavePass(dir, () => {
      navigate(to, opts);
      afterSwap?.();
    });
  }

  return { location, navigationType, go };
}
