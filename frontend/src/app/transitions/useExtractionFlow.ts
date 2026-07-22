import { useEffect, useRef, useState } from "react";
import {
  useBlocker,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";
import {
  useRecipeExtractor,
  type RunResult,
} from "@/features/extract/recipeExtractor.ts";
import {
  liquidAvailable,
  wavePass,
  type Dir,
} from "../LiquidTransition/liquidController.ts";

export const EXTRACT_PATH = "/extract";

// Fast sites resolve before the mascot registers. Hold the work screen for a
// beat so the character is actually seen — a deliberate floor, not a stall.
const MIN_WORK_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

// Filmstrip order of the screens (mirrors App's orderOf): higher = further
// forward, so a POP to a lower index is a back move and drains RTL. The transition
// screen and the paste fallback both sit one step in from home.
function screenOrder(pathname: string): number {
  if (pathname.startsWith("/recipe")) return 2;
  if (pathname.startsWith("/paste")) return 1;
  if (pathname.startsWith(EXTRACT_PATH)) return 1;
  return 0;
}

// The Home-side extraction journey, packaged as one hook so App renders chrome:
// submit → move to the transition screen → land the recipe or show the failure
// in that same screen; plus retry and the paste fallback.
//
// History model: home is pushed onto; every screen after it (transition, paste,
// recipe) REPLACES the one before, so history stays [home, current] and Back from
// anywhere lands on home — never back on the transition screen (the ask). The
// transition screen (/extract) is only ever reached through submitUrl, so a stray
// landing bounces itself home (see ExtractScreen).
export function useExtractionFlow() {
  const extract = useRecipeExtractor();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [url, setUrl] = useState("");
  // The URL of the most recent request — the key retry and the paste fallback
  // re-address. The extractor caches each successful recipe by it (so the recipe
  // route's loader can restore from sessionStorage), so we no longer write the
  // cache here.
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);
  // Set when a dismissal (Not now / Edit link) sends us home, so the effect below
  // restores focus to the URL field once Home has mounted (APG: return focus to an
  // element that continues the workflow).
  const refocusField = useRef(false);

  const { runUrl, runPaste, dismiss } = extract;

  // Only the browser's own back/forward buttons ("POP") land on Home without
  // running any of our code, so this only has to cover that case — every other
  // way of reaching "/" already sets `url` itself: backToSearch clears it,
  // RecipeError's "Edit link" deliberately pre-fills it with the failed URL.
  // Scoping to POP keeps this from re-clearing (or worse, stomping) either.
  useEffect(() => {
    if (location.pathname === "/" && navigationType === "POP") setUrl("");
  }, [location.pathname, navigationType]);

  // Restore focus to the URL field after a dismissal returns us home. Runs as an
  // effect (after App's layout-effect route-heading focus), so it wins.
  useEffect(() => {
    if (location.pathname === "/" && refocusField.current) {
      refocusField.current = false;
      urlFieldRef.current?.focus();
    }
  }, [location.pathname]);

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

  // Submit from Home: move to the transition screen (work orb shows while the
  // request pends), then land the recipe on success. A failure needs no
  // navigation — the transition screen reads the error off context and morphs the
  // orb in place. "aborted" (a newer submit superseded this one) leaves the screen
  // to the newer run.
  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);
    const running = runUrl(trimmed);
    await go(1, EXTRACT_PATH);
    const [result] = await Promise.all([running, delay(MIN_WORK_MS)]);
    if (result === "success") {
      await go(1, recipePath(trimmed), { replace: true });
    }
  }

  // "Try again" from the transition screen: re-run WITHOUT clearing the error (so
  // the error panel stays mounted and its one-shot retry accounting survives — the
  // button just spins). Success waves on to the recipe; a second failure flows back
  // to the panel, which escalates the mood.
  async function retry(): Promise<RunResult> {
    const result = await runUrl(lastUrl, { retry: true });
    if (result === "success") {
      await go(1, recipePath(lastUrl), { replace: true });
    }
    return result;
  }

  // Paste fallback submit: success lands the recipe; a failure is the end of the
  // recovery road (terminal), so it returns to the transition screen — replacing
  // the paste screen — where ExtractScreen shows the flat, report-only state.
  // "aborted" leaves the paste screen to the newer run.
  async function submitPaste(html: string) {
    const result = await runPaste(html, lastUrl);
    if (result === "success") {
      await go(1, recipePath(lastUrl), { replace: true });
    } else if (result === "error") {
      await go(1, EXTRACT_PATH, { replace: true });
    }
  }

  function backToSearch() {
    dismiss();
    setUrl(""); // "new search" starts from a clean field
    void go(-1, "/", { replace: true });
  }

  // "Paste page" from the transition screen: replace it with the paste fallback
  // (so Back from paste lands home, not the transition screen), clearing the error
  // under cover so the paste form opens fresh.
  function openPaste() {
    void go(1, "/paste", { replace: true }, dismiss);
  }

  // Paste fallback from the recipe route's ErrorBoundary (a failed cold deep-link):
  // unlike openPaste, `lastUrl` isn't set yet on that path — the loader ran outside
  // this hook — so seed it from the failed URL the boundary read off the route.
  function openPasteFor(url: string) {
    setLastUrl(url);
    void go(-1, "/paste", { replace: true });
  }

  // "Edit link": return home with the failed URL pre-filled so the user can fix it,
  // focus restored to the field. The error is left in state (invisible on Home,
  // and the next submit clears it) rather than cleared here — clearing it would
  // blank the transition screen before the home swap commits under the view
  // transition, flashing an empty frame.
  function editLink() {
    setUrl(lastUrl);
    refocusField.current = true;
    void go(-1, "/", { replace: true });
  }

  // "Not now" / Escape: abandon the failure and return home, focus restored to the
  // URL field (the workflow's next step). Same reason as editLink for not clearing
  // the error here.
  function dismissError() {
    refocusField.current = true;
    void go(-1, "/", { replace: true });
  }

  return {
    extract,
    url,
    setUrl,
    lastUrl,
    urlFieldRef,
    submitUrl,
    submitPaste,
    retry,
    backToSearch,
    openPaste,
    openPasteFor,
    editLink,
    dismissError,
  };
}
