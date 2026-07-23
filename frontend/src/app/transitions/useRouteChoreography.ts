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

// The wave-navigation choreography, split out of useExtractionFlow so that hook
// stays about the extraction journey rather than the animation plumbing:
//  - `go` is the one navigation primitive the app uses — cover in `dir`, swap the
//    route under full cover, reveal. With the overlay absent or reduced-motion on
//    (liquidAvailable() false) it falls back to the view-transition slide exactly
//    as before, so tests that mount App alone stay on the plain path.
//  - the POP block makes the browser's own back/forward ride the same wave instead
//    of skipping it (a POP swaps the route without ever going through `go`).
export function useRouteChoreography() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();

  // Browser back/forward is a POP: it swaps the route without touching go(), so on
  // its own it skips the wave. Block the POP, play the wave, and let proceed()
  // commit the swap under full cover — the same cover→reveal the in-app buttons
  // get. Scoped to POP, real screen changes only, and only when the overlay is
  // live: reduced motion and tests fall through to the browser's plain back/forward.
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

  // Liquid-wave navigation (approved v5.1 design) with the view-transition slide
  // as the fallback. liquidAvailable() is false when the overlay isn't mounted
  // (tests mount App without it) or the user prefers reduced motion — both keep
  // the pre-wave behavior exactly. `afterSwap` runs under full cover alongside the
  // route commit (used to clear error state as we leave the transition screen, so
  // it never flashes its stray-landing guard on the way out). The returned promise
  // resolves once the wave has fully revealed.
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
