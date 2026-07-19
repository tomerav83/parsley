// The floating error widget's UI state as one explicit reducer, replacing the
// five useState flags + two coordinating refs the component used to juggle
// (REDESIGN C2). Every transition that used to be scattered across an effect now
// lives here as a named event, so "what happens after a failed retry" is readable
// in one place.

import type { ErrorInfo } from "@/features/extract/errorInfo";

// The subset of an error's recovery affordances the machine needs to decide the
// post-retry layout. Passed in by the view (from errorInfo) so this stays pure.
export type RetryInfo = Pick<ErrorInfo, "unexpected" | "canPaste" | "canEdit">;

export interface FloatingErrorState {
  open: boolean; // action bubble expanded (vs. just the corner sprite)
  retrying: boolean; // a retry is in flight
  failed: boolean; // collapsed to the report-only "still stuck" state
  retryUsed: boolean; // retry spent — dropped once a fallback can take over
  leaving: boolean; // playing the fly-away before unmount
}

export type FloatingErrorEvent =
  | { type: "toggle" }
  | { type: "retryStart" }
  | {
      // The `error` prop changed identity — the result of a retry, a fresh error,
      // or arriving already-terminal (a failed paste).
      type: "errorChanged";
      terminal: boolean;
      didRetry: boolean;
      retryInfo: RetryInfo;
    }
  | { type: "flyAway" };

export function initFloatingError(terminal: boolean): FloatingErrorState {
  // A failed paste (`terminal`) arrives already expanded in the report-only state;
  // a normal error starts collapsed to just the corner sprite.
  return {
    open: terminal,
    retrying: false,
    failed: terminal,
    retryUsed: false,
    leaving: false,
  };
}

export function floatingErrorReducer(
  state: FloatingErrorState,
  event: FloatingErrorEvent,
): FloatingErrorState {
  switch (event.type) {
    case "toggle":
      return { ...state, open: !state.open };

    case "retryStart":
      return { ...state, retrying: true };

    case "errorChanged": {
      if (event.terminal) {
        // Failed paste: no retry/paste path remains — sit opened in report-only.
        return { ...state, retrying: false, failed: true, open: true };
      }
      if (event.didRetry) {
        // A retry failed again. Keep the bubble open to show the outcome. Collapse
        // to the report-only "still stuck" state only when nothing else can take
        // over; if paste is still available, keep the normal actions.
        const { unexpected, canPaste, canEdit } = event.retryInfo;
        return {
          ...state,
          retrying: false,
          open: true,
          failed: unexpected && !canPaste,
          // Retry is spent — drop it if there's another way forward; otherwise
          // (rate-limit / network) keep it as the sole repeatable action.
          retryUsed: canPaste || canEdit,
        };
      }
      // A fresh error — collapse to the corner sprite; the user opens the bubble.
      return {
        ...state,
        retrying: false,
        failed: false,
        retryUsed: false,
        open: false,
      };
    }

    case "flyAway":
      // Idempotent: a double-click / Escape spam can't restart the fly-away.
      return state.leaving ? state : { ...state, leaving: true };
  }
}
