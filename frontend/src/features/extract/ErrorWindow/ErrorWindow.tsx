import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ExtractError } from "@/lib/api";
import type { RunResult } from "@/features/extract/recipeExtractor.ts";
import {
  errorInfo,
  PASTE_DEAD,
  RETRY_STUCK,
  reportIssueUrl,
} from "@/features/extract/errorInfo";
import { LeafOrb } from "@/features/extract/LeafOrb/LeafOrb.tsx";
import type { LeafMood } from "@/features/extract/LeafCharacter/LeafCharacter.tsx";
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
  className: extra,
}: {
  action: Action;
  variant: "primary" | "ghost";
  className?: string;
}) {
  const className = `${btn.btn} ${btn.compact} ${btn[variant]}${extra ? ` ${extra}` : ""}`;
  // The primary is where focus lands when the panel appears (see the effect
  // below) — tagged so focus never depends on DOM position.
  const autofocus = variant === "primary" ? "" : undefined;
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
      data-autofocus={autofocus}
    >
      {inner}
    </a>
  ) : (
    <button
      type="button"
      className={className}
      onClick={action.onClick}
      disabled={action.disabled}
      data-autofocus={autofocus}
    >
      {inner}
    </button>
  );
}

// The failure panel: the leaf mascot acting out the state, over the cause + fix
// copy and the recovery actions. It's the error half of the transition screen
// (ExtractScreen) — a failure morphs the working porthole into this in place, so
// the error sits exactly where the leaf already was, never over Home. The mood
// escalates with the recovery journey: hmm (fresh failure) → weird (the retry
// failed too) → flat (a paste failed; terminal), with over reserved for rate
// limiting.
//
// Layout: an unboxed centered column on the transition screen's own ground (no
// card) — orb, badge, cause, fix, then the actions stacked by importance: one
// prominent primary (the likeliest fix, picked by intent retry > paste > edit),
// any secondaries in a quiet centered row beneath it, and "Not now" as a subtle
// text link at the foot. In the report-only collapse the primary is Report.
//
// A11y: the panel is a `role="alert"` — appearing after the work orb (a state
// change, not a route change), it announces itself, and it moves focus to its
// primary action so the name/hint are read and recovery is one keypress away.
// Escape (scoped to the panel) and "Not now" both dismiss; focus restoration
// afterwards is the parent's job, in onDismiss.
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
  const panelRef = useRef<HTMLDivElement>(null);

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

  // Focus the primary action when the panel appears, and again when a retry
  // resolves (the retry button disables mid-flight, dropping focus to <body>).
  useEffect(() => {
    if (!retrying) {
      const scope = panelRef.current;
      (
        scope?.querySelector<HTMLElement>("[data-autofocus]") ??
        scope?.querySelector<HTMLElement>("button:not([disabled]), a[href]")
      )?.focus();
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
    // presentation wrapper carries the Escape handler (it only catches events
    // bubbling from the real controls, and keeps the key listener off the
    // non-interactive alert). display:contents, so the panel centres as before.
    <div
      className={styles.keys}
      role="presentation"
      // Escape dismisses — bound here so it only fires while focus is inside
      // the panel, never hijacking Escape page-wide.
      onKeyDown={(e) => e.key === "Escape" && onDismiss()}
    >
      <div
        ref={panelRef}
        className={styles.figure}
        role="alert"
        data-mood={mood}
        data-error-panel=""
      >
        <LeafOrb mood={mood} state="error" className={styles.orb} />
        <h2 className={styles.title}>
          {copy.title}
          {/* the second-failure marker the old badge carried, folded into the
              title as a subtle count */}
          {retryFailed && !terminal && (
            <span className={styles.retryCount}>×2</span>
          )}
        </h2>
        <p className={styles.hint}>{copy.hint}</p>

        {/* Actions stacked by importance; focus targets the primary via
            [data-autofocus], which is always rendered first. */}
        <div className={styles.actions}>
          {failed ? (
            // Report-only: a terminal paste, or a second failed retry with no
            // fallback left.
            <ActionButton
              action={reportAction}
              variant="primary"
              className={styles.wide}
            />
          ) : (
            <>
              {primary && (
                <ActionButton
                  action={primary}
                  variant="primary"
                  className={styles.wide}
                />
              )}
              {secondary.length > 0 && (
                <div className={styles.secondary}>
                  {secondary.map((a) => (
                    <ActionButton key={a.key} action={a} variant="ghost" />
                  ))}
                </div>
              )}
            </>
          )}
          <button type="button" className={styles.dismiss} onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
