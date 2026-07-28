// The extraction flow as a state machine. The four statuses are mutually exclusive,
// so "loading with a stale recipe" or "error beside a recipe" can't be represented.
//
// The one odd transition: a retry keeps the current error set while the request is
// in flight, so the error panel stays mounted and can tell a second failure apart
// from a fresh one. A fresh submit clears it.

import type { ExtractError, Recipe } from "@/lib/api.ts";

type ExtractStatus = "idle" | "submitting" | "success" | "error";

export interface ExtractState {
  status: ExtractStatus;
  recipe: Recipe | null;
  error: ExtractError | null;
  // A failed paste leaves no fallback, so the error panel opens straight into its
  // report-only state.
  pasteFailed: boolean;
}

type ExtractAction =
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
      // Clearing an error goes back to idle, but dismissing with a recipe on
      // screen must keep it — that screen is still mounted.
      return state.status === "error"
        ? initialExtractState
        : { ...state, error: null, pasteFailed: false };
  }
}
