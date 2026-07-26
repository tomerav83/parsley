import { useEffect, useRef, useState } from "react";
import {
  useRecipeExtractor,
  type RunResult,
} from "@/features/extract/recipeExtractor.ts";
import { EXTRACT_PATH } from "./screens.ts";
import { useRouteChoreography } from "./useRouteChoreography.ts";

// Re-exported for App, which imported them from here before they moved to screens.ts.
export { EXTRACT_PATH, screenOrder } from "./screens.ts";

// Fast sites resolve before the mascot even registers, so hold the work screen
// long enough for the character to be seen. A floor, not a stall.
const MIN_WORK_MS = 600;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

/**
 * The whole extraction journey: submit, move to the transition screen, then land
 * the recipe or show the failure in that same screen — plus retry and the paste
 * fallback. App holds it and shares it through the outlet context.
 *
 * Every screen after home replaces the one before it, so history stays
 * [home, current] and Back always lands on home rather than back on the transition
 * screen. The wave choreography underneath lives in useRouteChoreography.
 */
export function useExtractionFlow() {
  const extract = useRecipeExtractor();
  const { location, navigationType, go } = useRouteChoreography();
  const [url, setUrl] = useState("");
  // The most recent request's URL — what retry and the paste fallback re-address.
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);
  // Set when a dismissal sends us home, so the effect below can put focus back on
  // the URL field once Home mounts (APG: focus something that continues the work).
  const refocusField = useRef(false);

  const { runUrl, runPaste, dismiss } = extract;

  // Browser back/forward is the only way to reach Home without running our code,
  // so it's the only case that needs clearing here. Every other route home already
  // sets `url` deliberately — backToSearch empties it, "Edit link" pre-fills it —
  // and a wider effect would stomp both.
  useEffect(() => {
    if (location.pathname === "/" && navigationType === "POP") setUrl("");
  }, [location.pathname, navigationType]);

  // Put focus back on the URL field after a dismissal. An effect, not a layout
  // effect, so it runs after App's route-heading focus and wins.
  useEffect(() => {
    if (location.pathname === "/" && refocusField.current) {
      refocusField.current = false;
      urlFieldRef.current?.focus();
    }
  }, [location.pathname]);

  // Submit from Home: move to the transition screen, then land the recipe. A
  // failure needs no navigation — that screen morphs the orb into the error panel
  // in place. "aborted" means a newer submit owns the screen now.
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

  // "Try again": re-run without clearing the error, so the panel stays mounted and
  // remembers that a retry was spent — the button just spins. A second failure
  // flows back to the panel, which escalates the mood.
  async function retry(): Promise<RunResult> {
    const result = await runUrl(lastUrl, { retry: true });
    if (result === "success") {
      await go(1, recipePath(lastUrl), { replace: true });
    }
    return result;
  }

  // Paste fallback submit. A failure here is the end of the road, so it returns to
  // the transition screen for the flat, report-only state.
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

  // "Paste page": replace the transition screen so Back from paste lands on home,
  // clearing the error under cover so the form opens fresh.
  function openPaste() {
    void go(1, "/paste", { replace: true }, dismiss);
  }

  // Same, but from the recipe route's ErrorBoundary, where the loader ran outside
  // this hook and never set `lastUrl` — so seed it from the URL that failed.
  function openPasteFor(url: string) {
    setLastUrl(url);
    void go(-1, "/paste", { replace: true });
  }

  // "Edit link": home with the failed URL pre-filled and focus in the field. The
  // error stays in state — it's invisible on Home and the next submit clears it,
  // whereas clearing it here would blank the transition screen before the swap
  // commits and flash an empty frame.
  function editLink() {
    setUrl(lastUrl);
    refocusField.current = true;
    void go(-1, "/", { replace: true });
  }

  // "Not now" / Escape: give up on the failure and go home, focus back in the URL
  // field. The error is left set for the same reason as editLink.
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
