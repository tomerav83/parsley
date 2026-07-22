import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ExtractError } from "@/lib/api";
import type { RunResult } from "@/features/extract/recipeExtractor.ts";
import {
  errorInfo,
  PASTE_DEAD,
  RETRY_STUCK,
  reportIssueUrl,
} from "@/features/extract/errorInfo";
import {
  LeafCharacter,
  type LeafMood,
} from "@/features/extract/LeafCharacter/LeafCharacter.tsx";
import { RetryIcon, PasteIcon, EditIcon, GithubIcon } from "./Icons";
import styles from "./ErrorWindow.module.css";
import btn from "@/components/Button.module.css";

interface ErrorWindowProps {
  error: ExtractError;
  sourceUrl: string; // the URL that failed — used for the prefilled GitHub issue
  terminal: boolean; // a failed paste: report-only, the recovery road has ended
  onPaste: () => void; // open the paste-HTML fallback
  onEdit: () => void; // refocus the URL field to fix the link
  onRetry: () => Promise<RunResult>; // re-run the extraction, returning its outcome
  onDismiss: () => void; // clear the error and close the window
}

// One recovery action, rendered by <ActionButton> as either the full-width primary
// or a secondary ghost. `href` makes it a link (Report); otherwise a button.
interface Action {
  key: string;
  icon: ReactNode;
  label: string;
  primaryLabel?: string; // fuller copy when shown as the primary (else `label`)
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

function ActionButton({
  action,
  variant,
}: {
  action: Action;
  variant: "primary" | "ghost";
}) {
  const className = `${btn.btn} ${btn.compact} ${btn[variant]}`;
  const inner = (
    <>
      {action.icon}
      {variant === "primary"
        ? (action.primaryLabel ?? action.label)
        : action.label}
    </>
  );
  return action.href ? (
    <a
      className={className}
      href={action.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={action.onClick}
    >
      {inner}
    </a>
  ) : (
    <button
      type="button"
      className={className}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {inner}
    </button>
  );
}

// The error window: an extraction failure lands as a centered window with the
// leaf mascot acting out the state (character redesign — replaces the corner
// FloatingError widget). The mood escalates with the recovery journey:
// hmm (fresh failure) → weird (the retry failed too) → flat (a paste failed;
// terminal), with over reserved for rate limiting.
//
// Action layout (unchanged from the widget): one full-width primary — the
// likeliest fix, picked by intent retry > paste > edit — then any remaining
// actions share a secondary row. Reporting is always subordinate except in the
// report-only collapse, where it's all that's left.
//
// A11y: the window is a `role="alertdialog"` named by its title and described
// by its hint. It takes focus on its primary action when it appears — it now
// IS the main window, not a corner widget — which also makes the name and
// description announce; no separate live region needed. Escape (scoped to the
// window, it only fires while focus is inside) and "Not now" both dismiss;
// focus restoration afterwards is the parent's job, in onDismiss.
//
// Retry flow: "Try again" calls onRetry (which re-runs the extract WITHOUT
// clearing `error`, so this component stays mounted) and folds a failure into
// local state. It's a one-shot: once a retry has failed and a fallback
// remains, retry is gone and the fallback becomes primary.
export function ErrorWindow({
  error,
  sourceUrl,
  terminal,
  onPaste,
  onEdit,
  onRetry,
  onDismiss,
}: ErrorWindowProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  // Stable ids tying the dialog to its title/hint (aria-labelledby/-describedby).
  const titleId = useId();
  const hintId = useId();

  const info = errorInfo(error.code);
  // Report-only collapse: a terminal paste is dead from the start; otherwise a
  // failed retry collapses only when nothing else can take over (unexpected,
  // no paste) — a live fallback (paste/edit) instead takes the primary slot.
  const failed = terminal || (retryFailed && info.unexpected && !info.canPaste);
  const retryUsed = retryFailed && (info.canPaste || info.canEdit);
  const copy = terminal ? PASTE_DEAD : failed ? RETRY_STUCK : info;

  const mood: LeafMood = terminal
    ? "flat"
    : error.code === "rate_limited"
      ? "over"
      : retryFailed
        ? "weird"
        : "hmm";

  const badge = terminal
    ? `paste failed · ${error.code}`
    : error.code === "rate_limited"
      ? "rate limited · slow down"
      : retryFailed
        ? `retry failed · ${error.code} ×2`
        : `extraction failed · ${error.code}`;

  // Focus the first action when the window appears, and again when a retry
  // resolves (the retry button disables mid-flight, dropping focus to <body>).
  useEffect(() => {
    if (!retrying) {
      windowRef.current
        ?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
        ?.focus();
    }
  }, [retrying]);

  async function handleRetry() {
    setRetrying(true);
    // "success" unmounts the window; "aborted" means a newer run owns the screen.
    if ((await onRetry()) === "error") setRetryFailed(true);
    setRetrying(false);
  }

  const canRetry = info.canRetry && !retryUsed;

  // Recovery actions in intent order: the first eligible is the full-width
  // primary, the rest share the secondary ghost row. Every error code offers at
  // least one of retry/paste/edit, so a primary always exists.
  const reportAction: Action = {
    key: "report",
    icon: <GithubIcon />,
    label: "Report",
    primaryLabel: "Report on GitHub",
    href: reportIssueUrl(error.code, sourceUrl),
    onClick: onDismiss,
  };
  const [primary, ...secondary] = [
    canRetry && {
      key: "retry",
      icon: retrying ? (
        <span className={btn.spin} aria-hidden />
      ) : (
        <RetryIcon />
      ),
      label: retrying ? "Retrying…" : "Try again",
      onClick: handleRetry,
      disabled: retrying,
    },
    info.canPaste && {
      key: "paste",
      icon: <PasteIcon />,
      label: "Paste page",
      primaryLabel: "Paste the page",
      onClick: onPaste,
    },
    info.canEdit && {
      key: "edit",
      icon: <EditIcon />,
      label: "Edit link",
      onClick: onEdit,
    },
    info.unexpected && reportAction,
  ].filter(Boolean) as Action[];

  return (
    <div
      className={styles.overlay}
      // presentation: the overlay is a positioning wrapper; the handler below
      // only catches events bubbling from the real controls (satisfies jsx-a11y).
      role="presentation"
      // Escape dismisses — bound here so it only fires while focus is inside
      // the window, never hijacking Escape page-wide.
      onKeyDown={(e) => e.key === "Escape" && onDismiss()}
    >
      <div
        ref={windowRef}
        className={styles.window}
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        data-mood={mood}
      >
        <div className={styles.charbox}>
          <LeafCharacter mood={mood} className={styles.char} />
        </div>
        <span
          className={`${styles.badge}${mood === "over" ? ` ${styles.warn}` : ""}`}
        >
          {badge}
        </span>
        <h2 id={titleId} className={styles.title}>
          {copy.title}
        </h2>
        <p id={hintId} className={styles.hint}>
          {copy.hint}
        </p>

        <div className={styles.actions}>
          {failed ? (
            // Report-only: a terminal paste, or a second failed retry with no
            // fallback left.
            <ActionButton action={reportAction} variant="primary" />
          ) : (
            <>
              {primary && <ActionButton action={primary} variant="primary" />}
              {secondary.length > 0 && (
                <div className={btn.row}>
                  {secondary.map((a) => (
                    <ActionButton key={a.key} action={a} variant="ghost" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
