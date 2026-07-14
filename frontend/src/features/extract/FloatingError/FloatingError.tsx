import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ExtractError } from "@/lib/api";
import {
  errorInfo,
  spriteCopy,
  SPRITE_FAILED,
  reportIssueUrl,
} from "@/features/extract/errorInfo";
import { SadParsley } from "./SadParsley/SadParsley.tsx";
import { RetryIcon, PasteIcon, EditIcon, GithubIcon } from "./Icons";
import { floatingErrorReducer, initFloatingError } from "./state/state.ts";
import styles from "./FloatingError.module.css";
import btn from "@/components/Button.module.css";

interface FloatingErrorProps {
  error: ExtractError;
  sourceUrl: string; // the URL that failed — used for the prefilled GitHub issue
  terminal: boolean; // start opened in the report-only state (a failed paste)
  onPaste: () => void; // open the paste-HTML fallback
  onEdit: () => void; // refocus the URL field to fix the link
  onRetry: () => void; // re-run the extraction (must NOT clear `error` first)
  onDismiss: () => void; // clear the error and hide the widget
}

// How long the cartoon fly-away plays before we actually unmount (must match the
// .efloat.isLeaving animation in FloatingError.module.css). Short under reduced motion.
const FLY_MS = 620;
const FLY_MS_REDUCED = 120;

// The corner "sad parsley" — a small floating mascot that springs into the
// bottom-right when an extraction fails. It starts collapsed: just the sprig plus
// an "oops!" tag, unobtrusive in the corner. Clicking the sprig opens the action
// bubble with the recovery options; clicking again collapses it back. The one
// exception is `terminal` (a failed paste): with no fallback left it arrives
// already open in the report-only state (Report on GitHub / Not now).
//
// Action layout: one full-width primary (the likeliest fix), then any remaining
// actions share a secondary row underneath. The primary is picked by intent —
// retry > paste > edit — and reporting is always a subordinate, never the primary.
//
// Dismissal: if the user wants none of the actions, "Not now" or the Escape key
// sends the sprig leaping off-screen (the .is-leaving fly-away), then calls
// onDismiss to clear the error. Taking an action (paste/edit/report) instead
// clears the error directly and the widget just unmounts.
//
// Retry flow: clicking "Try again" calls onRetry (which re-runs the extract
// WITHOUT clearing `error`, so this component stays mounted). We detect the
// outcome by watching `error`'s identity — a new ExtractError means the retry
// failed. All the resulting state transitions live in ./state/state.ts.
export function FloatingError({
  error,
  sourceUrl,
  terminal,
  onPaste,
  onEdit,
  onRetry,
  onDismiss,
}: FloatingErrorProps) {
  const [state, dispatch] = useReducer(
    floatingErrorReducer,
    terminal,
    initFloatingError,
  );
  // True between clicking "Try again" and the next `error` change — lets the
  // error-identity effect tell a retry failure apart from a fresh error.
  const didRetry = useRef(false);
  // Latest onDismiss, so the fly-away timeout and the Escape listener always call
  // the current one without re-subscribing.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const info = errorInfo(error.code);
  const copy = state.failed ? SPRITE_FAILED : spriteCopy(error.code);

  // Fold each `error`/`terminal` change into the machine (fresh error, failed
  // retry, or an already-terminal paste failure). didRetry is consumed here.
  // retryInfo is recomputed inside so the effect's only inputs are error/terminal.
  useEffect(() => {
    dispatch({
      type: "errorChanged",
      terminal,
      didRetry: didRetry.current,
      retryInfo: errorInfo(error.code),
    });
    didRetry.current = false;
  }, [error, terminal]);

  // Once the fly-away is playing, wait out the animation then clear the error.
  useEffect(() => {
    if (!state.leaving) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const id = window.setTimeout(
      () => onDismissRef.current(),
      reduced ? FLY_MS_REDUCED : FLY_MS,
    );
    return () => window.clearTimeout(id);
  }, [state.leaving]);

  // Play the cartoon fly-away, then clear the error. Used by "Not now" + Escape.
  const flyAway = useCallback(() => dispatch({ type: "flyAway" }), []);

  // Escape dismisses (a keyboard escape route for the non-modal notice).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") flyAway();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyAway]);

  function handleRetry() {
    didRetry.current = true;
    dispatch({ type: "retryStart" });
    onRetry();
  }

  // Action renderers, reused as either the full-width primary or a row secondary.
  const retryBtn = (variant: string) => (
    <button
      key="retry"
      type="button"
      className={`${btn.btn} ${btn.compact} ${btn[variant]}`}
      onClick={handleRetry}
      disabled={state.retrying}
    >
      {state.retrying ? (
        <>
          <span className={btn.spin} aria-hidden />
          Retrying…
        </>
      ) : (
        <>
          <RetryIcon />
          Try again
        </>
      )}
    </button>
  );
  const pasteBtn = (variant: string, label: string) => (
    <button
      key="paste"
      type="button"
      className={`${btn.btn} ${btn.compact} ${btn[variant]}`}
      onClick={onPaste}
    >
      <PasteIcon />
      {label}
    </button>
  );
  const editBtn = (variant: string) => (
    <button
      key="edit"
      type="button"
      className={`${btn.btn} ${btn.compact} ${btn[variant]}`}
      onClick={onEdit}
    >
      <EditIcon />
      Edit link
    </button>
  );
  const reportBtn = (variant: string, label: string) => (
    <a
      key="report"
      className={`${btn.btn} ${btn.compact} ${btn[variant]}`}
      href={reportIssueUrl(error.code, sourceUrl)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onDismiss}
    >
      <GithubIcon />
      {label}
    </a>
  );

  // "Try again" is a one-shot: once a retry has failed and a fallback remains, it's
  // gone and the fallback becomes primary (see the machine's errorChanged).
  const canRetry = info.canRetry && !state.retryUsed;

  // Pick the primary by intent; everything else drops to the secondary row.
  const primaryKind = canRetry
    ? "retry"
    : info.canPaste
      ? "paste"
      : info.canEdit
        ? "edit"
        : null;
  const primary =
    primaryKind === "retry"
      ? retryBtn("primary")
      : primaryKind === "paste"
        ? pasteBtn("primary", "Paste the page")
        : primaryKind === "edit"
          ? editBtn("primary")
          : null;
  const secondary = [
    info.canPaste && primaryKind !== "paste"
      ? pasteBtn("ghost", "Paste page")
      : null,
    info.canEdit && primaryKind !== "edit" ? editBtn("ghost") : null,
    info.unexpected ? reportBtn("ghost", "Report") : null,
  ].filter(Boolean);

  return (
    <div
      className={`${styles.efloat}${state.open ? ` ${styles.isOpen}` : ""}${
        state.leaving ? ` ${styles.isLeaving}` : ""
      }`}
      aria-hidden={state.leaving}
    >
      <div className={styles.bubble} role="alert">
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.hint}>{copy.hint}</p>

        <div className={styles.actions}>
          {state.failed ? (
            // After a second failed retry: reporting is the only path left.
            reportBtn("primary", "Report on GitHub")
          ) : (
            <>
              {primary}
              {secondary.length > 0 && (
                <div className={btn.row}>{secondary}</div>
              )}
            </>
          )}
        </div>

        <button type="button" className={styles.dismiss} onClick={flyAway}>
          Not now
        </button>
      </div>

      <button
        type="button"
        className={styles.sprite}
        aria-expanded={state.open}
        aria-label={
          state.open
            ? `${copy.title} — hide options`
            : `${copy.title} — show options`
        }
        onClick={() => dispatch({ type: "toggle" })}
      >
        <SadParsley className={styles.face} />
        <span className={styles.tag}>
          {state.leaving ? "bye!" : state.failed ? "help?" : "oops!"}
        </span>
      </button>
    </div>
  );
}
