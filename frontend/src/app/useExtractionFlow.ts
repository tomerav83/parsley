import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  useRecipeExtractor,
  type RunResult,
} from "@/features/extract/recipeExtractor.ts";
import { cacheRecipe } from "@/lib/recipeCache.ts";

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

// The extraction journey, packaged as one hook so App renders chrome: submit →
// navigate, retry, paste fallback, deep-link entry, and the sessionStorage cache
// write. App owns only the extraction lifecycle and the URL field's text —
// everything else lives in the screens, which mount per-route.
export function useExtractionFlow() {
  const extract = useRecipeExtractor();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);

  // Cache each extracted recipe by its request URL (the one it's addressed by in
  // /recipe?url=…) so a refresh or back/forward restores it from sessionStorage
  // instead of re-hitting the API — and so a paste-sourced recipe, whose URL can't
  // be re-fetched, survives a reload at all (RecipeScreen reads it back). lastUrl
  // is the request URL for every path (submit/retry/paste/deep-link); a fresh load
  // hasn't set it yet, so the empty-key guard in cacheRecipe skips the no-op write.
  useEffect(() => {
    if (extract.recipe) cacheRecipe(lastUrl, extract.recipe);
  }, [extract.recipe, lastUrl]);

  const { runUrl, runPaste, dismiss } = extract;

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);
    // Stay on home while the request runs; only slide once a recipe lands, so a
    // failed extract doesn't slide in then back.
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

  // Deep-link entry: /recipe?url=… on a fresh load (or with a different URL than
  // the one on screen) extracts that URL in place. Failures fall back to home,
  // where the corner widget offers the recovery options. Kept in useCallback:
  // RecipeScreen's effect depends on it staying stable (runUrl is stable too).
  const requestRecipe = useCallback(
    async (target: string) => {
      setUrl(target); // mirror into the field so "Edit link" starts from it
      setLastUrl(target);
      if ((await runUrl(target)) === "error") {
        navigate("/", { viewTransition: true });
      }
    },
    [runUrl, navigate],
  );

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
    requestRecipe,
    retry,
    backToSearch,
    openPaste,
    dismissError,
  };
}
