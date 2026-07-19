import { useEffect, useId, useReducer, useRef } from "react";
import type { ExtractError } from "@/lib/api";
import type { RunResult } from "@/features/extract/recipeExtractor.ts";
import {
  errorInfo,
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
  onRetry: () => Promise<RunResult>; // re-run the extraction, returning its outcome
  onDismiss: () => void; // clear the error and hide the widget
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
// A11y (REDESIGN A7): the open bubble is a `role="alertdialog"` (not the old
// read-only `role="alert"`, which mustn't wrap interactive controls) named by its
// title and described by its hint. Opening it — via the sprite toggle or the
// auto-open terminal case — moves focus to the primary action; collapsing returns
// focus to the sprite. Escape is scoped to the widget root (it only fires while
// focus is already inside, never page-wide). Focus restoration on full dismissal
// (fly-away → URL field) is the parent's job, in onDismiss.
//
// Retry flow: clicking "Try again" calls onRetry (which re-runs the extract
// WITHOUT clearing `error`, so this component stays mounted) and returns the
// outcome. A failed retry dispatches `retryFailed`; success/abort resolve by the
// widget unmounting (a newer run owns the screen). All transitions live in
// ./state/state.ts; the post-retry layout is derived below from the error.
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

  // Focus targets for the alertdialog (A7): the bubble is where focus moves on
  // open, the sprite is where it returns on collapse.
  const bubbleRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLButtonElement>(null);
  // Previous open/retrying, so the focus effect can tell an open/collapse edge
  // (and a resolved retry) apart from an unrelated re-render.
  const prev = useRef({ open: false, retrying: false });

  // Stable ids tying the dialog to its title/hint (aria-labelledby/-describedby).
  const titleId = useId();
  const hintId = useId();

  const info = errorInfo(error.code);
  // Post-retry layout, derived from the current error's affordances (R1). A
  // terminal paste is failed from the start; otherwise a failed retry collapses
  // to report-only only when nothing else can take over (unexpected, no paste),
  // and spends the retry when a fallback (paste/edit) exists to hand off to.
  const failed =
    terminal || (state.retryFailed && info.unexpected && !info.canPaste);
  const retryUsed = state.retryFailed && (info.canPaste || info.canEdit);
  const copy = failed ? SPRITE_FAILED : info;

  // Play the cartoon fly-away, then clear the error (onDismiss fires from the
  // root's onAnimationEnd when the fly-away finishes). Used by "Not now" + Escape.
  const flyAway = () => dispatch({ type: "flyAway" });

  // Move focus with the dialog (A7). Opening moves focus to the primary action
  // (APG alertdialog default = first focusable, which the layout puts first);
  // collapsing returns it to the sprite that toggles it. A resolved retry re-homes
  // focus too, since the retry button disables mid-flight and drops it to <body>.
  // The fly-away restores focus itself (via the parent's onDismiss), so skip it.
  useEffect(() => {
    if (!state.leaving) {
      const opened = state.open && !prev.current.open;
      const retryResolved =
        state.open && prev.current.retrying && !state.retrying;
      if (opened || retryResolved) {
        bubbleRef.current
          ?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
          ?.focus();
      } else if (!state.open && prev.current.open) {
        spriteRef.current?.focus();
      }
    }
    prev.current = { open: state.open, retrying: state.retrying };
  }, [state.open, state.retrying, state.leaving]);

  async function handleRetry() {
    dispatch({ type: "retryStart" });
    // "success" unmounts the widget; "aborted" means a newer run owns the screen.
    if ((await onRetry()) === "error") dispatch({ type: "retryFailed" });
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
  // gone and the fallback becomes primary (see `retryUsed` above).
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
      className={`${styles.efloat}${state.open ? ` ${styles.isOpen}` : ""}${
        state.leaving ? ` ${styles.isLeaving}` : ""
      }`}
      aria-hidden={state.leaving}
      // presentation: the root is a positioning wrapper; the handlers below only
      // catch events bubbling from the real controls (satisfies jsx-a11y).
      role="presentation"
      // Escape dismisses (a keyboard escape route for the non-modal dialog).
      // Bound on the root so it only fires while focus is inside the widget —
      // never hijacking Escape page-wide.
      onKeyDown={(e) => e.key === "Escape" && flyAway()}
      // The fly-away finished (the .isLeaving animation on this element, not a
      // bubbled child animation) → actually clear the error. Under reduced motion
      // the global index.css net shrinks the animation to ~0ms, so this still fires.
      onAnimationEnd={(e) =>
        state.leaving && e.target === e.currentTarget && onDismiss()
      }
    >
      <div
        ref={bubbleRef}
        className={styles.bubble}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={hintId}
      >
        <h2 id={titleId} className={styles.title}>
          {copy.title}
        </h2>
        <p id={hintId} className={styles.hint}>
          {copy.hint}
        </p>

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
        ref={spriteRef}
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
          {state.leaving ? "bye!" : failed ? "help?" : "oops!"}
        </span>
      </button>
    </div>
  );
}
