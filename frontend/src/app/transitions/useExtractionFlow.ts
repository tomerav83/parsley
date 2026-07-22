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
  waveExtract,
  wavePass,
  waveReveal,
  type Dir,
} from "../LiquidTransition/liquidController.ts";

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

// Filmstrip order of the screens (mirrors App's orderOf): higher = further
// forward, so a POP to a lower index is a back move and drains RTL.
function screenOrder(pathname: string): number {
  if (pathname.startsWith("/recipe")) return 2;
  if (pathname.startsWith("/paste")) return 1;
  return 0;
}

// The Home-side extraction journey, packaged as one hook so App renders chrome:
// submit → navigate, retry, and the paste fallback. Deep-link entry (/recipe?url=…
// on a hard load) and the recipe read itself are the recipe route's loader now —
// not this hook. App owns the extraction lifecycle and the URL field's text;
// everything else lives in the screens, which mount per-route.
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
  // True while a wave-covered extraction is in flight. The extractor's state
  // settles with the request itself — which can be well before the wave has
  // covered the screen — so App must not surface a FRESH failure (the corner
  // mascot springing in) until the covered run resolves. See errorSurfaced.
  const [waveBusy, setWaveBusy] = useState(false);
  const [errorSurfaced, setErrorSurfaced] = useState(false);

  const { runUrl, runPaste, dismiss } = extract;

  // A fresh error surfaces only once no wave is mid-cover (on the fallback
  // path waveBusy is never set, so it surfaces immediately — the pre-wave
  // behavior). Once surfaced it STAYS surfaced until the error clears: a
  // retry runs under a new wave with the widget still mounted, which is what
  // preserves its one-shot retry accounting.
  useEffect(() => {
    if (!extract.error) setErrorSurfaced(false);
    else if (!waveBusy) setErrorSurfaced(true);
  }, [extract.error, waveBusy]);

  // Only the browser's own back/forward buttons ("POP") land on Home without
  // running any of our code, so this only has to cover that case — every other
  // way of reaching "/" already sets `url` itself: backToSearch clears it,
  // RecipeError's "Edit link" deliberately pre-fills it with the failed URL.
  // Scoping to POP keeps this from re-clearing (or worse, stomping) either.
  useEffect(() => {
    if (location.pathname === "/" && navigationType === "POP") setUrl("");
  }, [location.pathname, navigationType]);

  // Browser back/forward is a POP: it swaps the route without touching go()/
  // runCovered, so on its own it skips the wave. Block the POP, play the wave,
  // and let proceed() commit the swap under full cover — the same cover→reveal
  // the in-app buttons get. Scoped to POP (our PUSH/REPLACE navigations already
  // wave), real screen changes only, and only when the overlay is live: reduced
  // motion and tests fall through to the browser's plain back/forward.
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

  // Liquid-wave navigation (approved v5.1 design) with the view-transition
  // slide as the fallback. liquidAvailable() is false when the overlay isn't
  // mounted (tests mount App without it) or the user prefers reduced motion —
  // both keep the pre-wave behavior exactly.
  //
  // Wave-only pass-through: cover in `dir`, swap the route under full cover,
  // reveal in the same direction. No whirlpool (nothing to wait for).
  function go(dir: Dir, to: string, opts?: { replace?: boolean }) {
    if (!liquidAvailable()) {
      navigate(to, { ...opts, viewTransition: true });
      return;
    }
    void wavePass(dir, () => navigate(to, opts));
  }

  // Extraction under cover: the surge starts with the request, the whirlpool
  // holds while it pends, and the result decides the reveal — land forward on
  // the recipe, or drain back (RTL) to the screen we never left. "aborted"
  // (superseded request) drains too: the newer run owns any navigation.
  async function runCovered(
    run: () => Promise<RunResult>,
    successUrl: string,
  ): Promise<RunResult> {
    if (!liquidAvailable()) {
      const result = await run();
      if (result === "success") {
        navigate(recipePath(successUrl), { viewTransition: true });
      }
      return result;
    }
    setWaveBusy(true);
    try {
      const result = await waveExtract(run);
      // The reveal is deliberately NOT awaited: the outcome must reach the
      // caller as the drain begins, so whatever the wave uncovers (the floating
      // error's retry button, a form's spinner) has already settled — not still
      // spinning under a receding wave. The swap inside waveReveal still runs
      // synchronously, under full cover.
      if (result === "success") {
        void waveReveal(1, () => navigate(recipePath(successUrl)));
      } else {
        void waveReveal(-1);
      }
      return result;
    } finally {
      // clears under full cover (≥2 buffered frames before the reveal opens),
      // so a fresh error mounts its widget beneath the wave, not beside it
      setWaveBusy(false);
    }
  }

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);
    await runCovered(() => runUrl(trimmed), trimmed);
  }

  async function submitPaste(html: string) {
    if (!liquidAvailable()) {
      const result = await runPaste(html, lastUrl);
      if (result === "success") {
        navigate(recipePath(lastUrl), { viewTransition: true });
      } else if (result === "error") {
        // A failed paste is the end of the recovery road — return home, where it
        // surfaces as the corner widget in its report-only terminal state.
        navigate("/", { viewTransition: true });
      }
      return;
    }
    setWaveBusy(true);
    try {
      const result = await waveExtract(() => runPaste(html, lastUrl));
      // reveals not awaited — same reasoning as runCovered
      if (result === "success") {
        void waveReveal(1, () => navigate(recipePath(lastUrl)));
      } else if (result === "error") {
        // paste → home is a back move in the filmstrip, so the wave drains RTL
        void waveReveal(-1, () => navigate("/"));
      } else {
        void waveReveal(-1); // aborted: reveal the paste screen we never left
      }
    } finally {
      setWaveBusy(false);
    }
  }

  // "Try again" from the floating widget re-runs WITHOUT clearing the error, so
  // the widget stays mounted. The outcome flows back to the widget's handler,
  // which folds a failure into its own state — no error-watching effect.
  function retry(): Promise<RunResult> {
    return runCovered(() => runUrl(lastUrl, { retry: true }), lastUrl);
  }

  function backToSearch() {
    dismiss();
    setUrl(""); // "new search" starts from a clean field
    go(-1, "/", { replace: true });
  }

  function openPaste() {
    dismiss();
    go(1, "/paste");
  }

  // Paste fallback from the recipe route's ErrorBoundary (a failed cold deep-link):
  // unlike openPaste, `lastUrl` isn't set yet on that path — the loader ran outside
  // this hook — so seed it from the failed URL the boundary read off the route.
  // recipe (2) → paste (1) is a BACK move in the filmstrip, hence RTL.
  function openPasteFor(url: string) {
    setLastUrl(url);
    go(-1, "/paste");
  }

  // Dismissing the error (fly-away, "Not now", Escape) or picking "Edit link"
  // both land the user back at the URL field — the logical next step once the
  // widget is gone (APG: restore focus to an element that continues the workflow).
  function dismissError() {
    dismiss();
    urlFieldRef.current?.focus();
  }

  return {
    extract,
    errorSurfaced,
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
    dismissError,
  };
}
