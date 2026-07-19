import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  useRecipeExtractor,
  type RunResult,
} from "@/features/extract/recipeExtractor.ts";

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

// The Home-side extraction journey, packaged as one hook so App renders chrome:
// submit → navigate, retry, and the paste fallback. Deep-link entry (/recipe?url=…
// on a hard load) and the recipe read itself are the recipe route's loader now —
// not this hook. App owns the extraction lifecycle and the URL field's text;
// everything else lives in the screens, which mount per-route.
export function useExtractionFlow() {
  const extract = useRecipeExtractor();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  // The URL of the most recent request — the key retry and the paste fallback
  // re-address. The extractor caches each successful recipe by it (so the recipe
  // route's loader can restore from sessionStorage), so we no longer write the
  // cache here.
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);

  const { runUrl, runPaste, dismiss } = extract;

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);

    if ((await runUrl(trimmed)) === "success") {
      navigate(recipePath(trimmed), { viewTransition: true });
    }
  }

  async function submitPaste(html: string) {
    const result = await runPaste(html, lastUrl);
    if (result === "success") {
      navigate(recipePath(lastUrl), { viewTransition: true });
    } else if (result === "error") {
      // A failed paste is the end of the recovery road — return home, where it
      // surfaces as the corner widget in its report-only terminal state.
      navigate("/", { viewTransition: true });
    }
  }

  // "Try again" from the floating widget re-runs WITHOUT clearing the error, so
  // the widget stays mounted. The outcome flows back to the widget's handler,
  // which folds a failure into its own state — no error-watching effect.
  async function retry(): Promise<RunResult> {
    const result = await runUrl(lastUrl, { retry: true });
    if (result === "success") {
      navigate(recipePath(lastUrl), { viewTransition: true });
    }
    return result;
  }

  function backToSearch() {
    dismiss();
    setUrl(""); // "new search" starts from a clean field
    navigate("/", { viewTransition: true });
  }

  function openPaste() {
    dismiss();
    navigate("/paste", { viewTransition: true });
  }

  // Paste fallback from the recipe route's ErrorBoundary (a failed cold deep-link):
  // unlike openPaste, `lastUrl` isn't set yet on that path — the loader ran outside
  // this hook — so seed it from the failed URL the boundary read off the route.
  function openPasteFor(url: string) {
    setLastUrl(url);
    navigate("/paste", { viewTransition: true });
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
