import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtractError } from "@/api";
import {
  errorInfo,
  spriteCopy,
  SPRITE_FAILED,
  reportIssueUrl,
} from "@/errorInfo";
import { SadParsley } from "./SadParsley";
import styles from "./FloatingError.module.css";
import btn from "./Button.module.css";

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

// Small inline icons — one visual language (1.9px stroke, rounded) for the actions.
function RetryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
function PasteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-1-2.6c3-.3 6-1.5 6-6.6a5.1 5.1 0 0 0-1.4-3.5 4.8 4.8 0 0 0-.1-3.5s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C6.7 1.9 5.6 2.2 5.6 2.2a4.8 4.8 0 0 0-.1 3.5A5.1 5.1 0 0 0 4 9.2c0 5 3 6.3 5.9 6.6a3.4 3.4 0 0 0-.9 2.6V22" />
    </svg>
  );
}

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
// failed. If that failure is an `unexpected` code AND no paste fallback remains,
// the bubble collapses to just "Report on GitHub" and the tag flips to "help?".
// When paste is still available it stays offered — the paste option should
// survive a failed retry and only fall away once paste itself has no path. A
// success clears `error` upstream, which unmounts us.
export function FloatingError({
  error,
  sourceUrl,
  terminal,
  onPaste,
  onEdit,
  onRetry,
  onDismiss,
}: FloatingErrorProps) {
  // `terminal` (a failed paste) arrives already expanded in the report-only
  // state; a normal error starts collapsed to just the corner sprig.
  const [open, setOpen] = useState(terminal);
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(terminal);
  // Set once a retry has itself failed: "Try again" is a one-shot, so it's dropped
  // afterwards — but only when another fallback (paste/edit) remains to take over.
  const [retryUsed, setRetryUsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // True between clicking "Try again" and the next `error` change — lets the
  // error-identity effect tell a retry failure apart from a fresh error.
  const didRetry = useRef(false);
  // Guards the dismiss so a double click / Escape spam can't fire it twice.
  const leavingRef = useRef(false);
  // Latest onDismiss, so the fly-away timeout and the Escape listener always call
  // the current one without re-subscribing.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const info = errorInfo(error.code);
  const copy = failed ? SPRITE_FAILED : spriteCopy(error.code);

  // Play the cartoon fly-away, then clear the error. Used by "Not now" + Escape.
  const flyAway = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.setTimeout(
      () => onDismissRef.current(),
      reduced ? FLY_MS_REDUCED : FLY_MS,
    );
  }, []);

  useEffect(() => {
    if (terminal) {
      // Failed paste: no retry/paste path remains — sit in the report-only state,
      // opened, so only "Report on GitHub" and "Not now" are offered.
      setRetrying(false);
      setFailed(true);
      setOpen(true);
      return;
    }
    if (didRetry.current) {
      // This error change is the result of a retry that failed again. The bubble
      // was open for the user to click "Try again", so keep it open to show the
      // outcome. Collapse to the report-only "still stuck" state only when there's
      // no fallback left; if paste is still available, keep the normal actions so
      // the paste option survives a failed retry.
      const retryInfo = errorInfo(error.code);
      didRetry.current = false;
      setRetrying(false);
      setOpen(true);
      setFailed(retryInfo.unexpected && !retryInfo.canPaste);
      // Retry has now been spent. Drop it only if there's another way forward;
      // otherwise (rate-limit / network) keep it as the sole repeatable action.
      setRetryUsed(retryInfo.canPaste || retryInfo.canEdit);
    } else {
      // A fresh error — start collapsed to just the corner sprig; the user opens
      // the bubble by clicking it.
      setRetrying(false);
      setFailed(false);
      setRetryUsed(false);
      setOpen(false);
    }
  }, [error, terminal]);

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
    setRetrying(true);
    onRetry();
  }

  // Action renderers, reused as either the full-width primary or a row secondary.
  const retryBtn = (variant: string) => (
    <button
      key="retry"
      type="button"
      className={`${btn.btn} ${btn.compact} ${btn[variant]}`}
      onClick={handleRetry}
      disabled={retrying}
    >
      {retrying ? (
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
  // gone and the fallback becomes primary (see setRetryUsed above).
  const canRetry = info.canRetry && !retryUsed;

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
      className={`${styles.efloat}${open ? ` ${styles.isOpen}` : ""}${
        leaving ? ` ${styles.isLeaving}` : ""
      }`}
      aria-hidden={leaving}
    >
      <div className={styles.bubble} role="alert">
        <h2 className={styles.title}>{copy.title}</h2>
        <p className={styles.hint}>{copy.hint}</p>

        <div className={styles.actions}>
          {failed ? (
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
        aria-expanded={open}
        aria-label={
          open ? `${copy.title} — hide options` : `${copy.title} — show options`
        }
        onClick={() => setOpen((v) => !v)}
      >
        <SadParsley className={styles.face} />
        <span className={styles.tag}>
          {leaving ? "bye!" : failed ? "help?" : "oops!"}
        </span>
      </button>
    </div>
  );
}
