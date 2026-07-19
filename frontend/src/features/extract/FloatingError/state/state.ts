// The floating error widget's UI state as one explicit reducer (REDESIGN C2).
// Every transition is a named event, so "what happens after a failed retry" is
// readable in one place.
//
// The retry outcome arrives through the click handler (retryFailed), not by
// watching the `error` prop change in an effect. The post-retry layout — whether
// the widget collapses to report-only and whether retry is spent — is a
// render-time derivation from the current error's affordances, not stored state.

export interface FloatingErrorState {
  open: boolean; // action bubble expanded (vs. just the corner sprite)
  retrying: boolean; // a retry is in flight
  retryFailed: boolean; // a retry has come back failed (drives the derived layout)
  leaving: boolean; // playing the fly-away before unmount
}

export type FloatingErrorEvent =
  | { type: "toggle" }
  | { type: "retryStart" }
  | { type: "retryFailed" }
  | { type: "flyAway" };

export function initFloatingError(terminal: boolean): FloatingErrorState {
  // A failed paste (`terminal`) arrives already expanded in the report-only state;
  // a normal error starts collapsed to just the corner sprite.
  return {
    open: terminal,
    retrying: false,
    retryFailed: false,
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

    case "retryFailed":
      // Keep the bubble open to show the outcome; the view derives from the
      // current error whether that's report-only or a live fallback.
      return { ...state, retrying: false, retryFailed: true, open: true };

    case "flyAway":
      // Idempotent: a double-click / Escape spam can't restart the fly-away.
      return state.leaving ? state : { ...state, leaving: true };
  }
}
