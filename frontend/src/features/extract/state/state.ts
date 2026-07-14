// The extraction flow as an explicit state machine, replacing the loading/recipe/
// error boolean trio that could express impossible states (see REDESIGN C2). The
// four statuses are mutually exclusive, so "loading with a stale recipe" or
// "error next to a recipe" simply can't be represented.
//
// One deliberate transition preserves the old behaviour: on a *retry* `submit`
// keeps the current `error` set while the request is in flight, so the floating
// error widget stays mounted and can tell a second failure apart from a fresh one.
// A fresh `submit` clears it.

import type { ExtractError, Recipe } from "@/lib/api.ts";

export type ExtractStatus = "idle" | "submitting" | "success" | "error";

export interface ExtractState {
  status: ExtractStatus;
  recipe: Recipe | null;
  error: ExtractError | null;
  // A failed *paste* is terminal (no fallback left); the flag tells the floating
  // widget to open straight into its report-only state.
  pasteFailed: boolean;
}

export type ExtractAction =
  | { type: "submit"; isRetry: boolean }
  | { type: "success"; recipe: Recipe }
  | { type: "failure"; error: ExtractError; pasteFailed: boolean }
  | { type: "dismiss" };

export const initialExtractState: ExtractState = {
  status: "idle",
  recipe: null,
  error: null,
  pasteFailed: false,
};

export function extractReducer(
  state: ExtractState,
  action: ExtractAction,
): ExtractState {
  switch (action.type) {
    case "submit":
      return {
        status: "submitting",
        recipe: null,
        // Retry keeps the error visible while the request is in flight; a fresh
        // run clears it.
        error: action.isRetry ? state.error : null,
        pasteFailed: false,
      };
    case "success":
      return {
        status: "success",
        recipe: action.recipe,
        error: null,
        pasteFailed: false,
      };
    case "failure":
      return {
        status: "error",
        recipe: null,
        error: action.error,
        pasteFailed: action.pasteFailed,
      };
    case "dismiss":
      // Clear an error back to idle; but when a recipe is on screen (success),
      // dismissing must not drop it — the recipe screen stays mounted.
      return state.status === "error"
        ? initialExtractState
        : { ...state, error: null, pasteFailed: false };
  }
}
