// `recipeExtractor` is a custom hook (it calls useReducer/useRef/useCallback and
// is always invoked unconditionally at a component's top level), but it's named to
// match its module rather than the use* convention — so the Rules-of-Hooks lint,
// which keys off the `use` prefix, is disabled for this file.
/* oxlint-disable react-hooks/rules-of-hooks */
import { useCallback, useReducer, useRef } from "react";
import {
  extractRecipe,
  extractRecipeFromHtml,
  ExtractError,
  type Recipe,
} from "@/lib/api.ts";
import { extractReducer, initialExtractState } from "./state/state.ts";

// The outcome of a run. "aborted" means a newer request superseded this one — the
// caller should do nothing (the newer run owns the navigation), which is why it's
// distinct from "error".
export type RunResult = "success" | "error" | "aborted";

function toExtractError(err: unknown): ExtractError {
  if (err instanceof ExtractError) return err;
  return new ExtractError("unknown", "Something went wrong. Please try again.");
}

// Owns the extraction request lifecycle: the state machine plus an AbortController
// so a new request cancels the one before it (the retry button could otherwise
// race the original and let the slower response win — REDESIGN C3). The screen the
// app slides to on success stays App's concern; this hook only reports the outcome.
export function recipeExtractor() {
  const [state, dispatch] = useReducer(extractReducer, initialExtractState);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      fetcher: (signal: AbortSignal) => Promise<Recipe>,
      isRetry: boolean,
      pasteFailed: boolean,
    ): Promise<RunResult> => {
      controllerRef.current?.abort(); // supersede any in-flight request
      const controller = new AbortController();
      controllerRef.current = controller;
      dispatch({ type: "submit", isRetry });
      try {
        const recipe = await fetcher(controller.signal);
        if (controller.signal.aborted) return "aborted";
        dispatch({ type: "success", recipe });
        return "success";
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return "aborted";
        }
        dispatch({ type: "failure", error: toExtractError(err), pasteFailed });
        return "error";
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [],
  );

  const runUrl = useCallback(
    (url: string, opts?: { retry?: boolean }): Promise<RunResult> =>
      run((signal) => extractRecipe(url, signal), opts?.retry ?? false, false),
    [run],
  );

  const runPaste = useCallback(
    (html: string, url: string): Promise<RunResult> =>
      run((signal) => extractRecipeFromHtml(html, url, signal), false, true),
    [run],
  );

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  // Put a recipe straight into success state without a request — used to rehydrate
  // from the sessionStorage cache on a refresh / deep-link (see lib/recipeCache).
  // Aborts any in-flight request so a slow response can't clobber the restore.
  const restore = useCallback((recipe: Recipe) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    dispatch({ type: "success", recipe });
  }, []);

  return {
    recipe: state.recipe,
    error: state.error,
    loading: state.status === "submitting",
    pasteFailed: state.pasteFailed,
    runUrl,
    runPaste,
    dismiss,
    restore,
  };
}
