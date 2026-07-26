import { useCallback, useReducer, useRef } from "react";
import {
  extractRecipe,
  extractRecipeFromHtml,
  ExtractError,
  type Recipe,
} from "@/lib/api.ts";
import { extractReducer, initialExtractState } from "./state/state.ts";
import { cacheRecipe } from "@/lib/recipeCache.ts";

/**
 * How a run ended. "aborted" is separate from "error" because a newer request
 * superseded this one and now owns the navigation — the caller should do nothing.
 */
export type RunResult = "success" | "error" | "aborted";

function toExtractError(err: unknown): ExtractError {
  if (err instanceof ExtractError) return err;
  return new ExtractError("unknown", "Something went wrong. Please try again.");
}

/**
 * Owns the request lifecycle: the state machine, plus an AbortController so each
 * new request cancels the one before it. Without that, a retry could race the
 * original and let the slower answer win.
 *
 * Reports an outcome and nothing more — where the app goes next is App's call.
 */
export function useRecipeExtractor() {
  const [state, dispatch] = useReducer(extractReducer, initialExtractState);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      url: string,
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
        // Cache before the caller navigates. The recipe route's loader reads this
        // synchronously, so writing it here rather than in an effect is what keeps
        // a Home submit from re-fetching what we already have.
        cacheRecipe(url, recipe);
        dispatch({ type: "success", recipe });
        return "success";
      } catch (err) {
        // Not only our own signal — the browser aborts fetches on navigation too,
        // and neither should ever surface as a failure.
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
      run(
        url,
        (signal) => extractRecipe(url, signal),
        opts?.retry ?? false,
        false,
      ),
    [run],
  );

  const runPaste = useCallback(
    (html: string, url: string): Promise<RunResult> =>
      run(
        url,
        (signal) => extractRecipeFromHtml(html, url, signal),
        false,
        true,
      ),
    [run],
  );

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  // Drop a recipe straight into success state, for rehydrating from the session
  // cache on a refresh. Aborts anything in flight so a slow response can't land on
  // top of the restored one.
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
