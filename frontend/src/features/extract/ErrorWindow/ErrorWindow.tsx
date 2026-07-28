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

/** One way out, rendered as the primary or a ghost. `href` makes it a link. */
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
  // Tag the primary so the focus effect below can find it without depending on
  // where it happens to sit in the DOM.
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

/**
 * The failure panel: the mascot acting out the state, the cause and the fix, then
 * the ways out — one prominent primary (retry, else paste, else edit), the rest in
 * a quiet row, and "Not now" at the foot.
 *
 * The mood escalates with the journey: hmm for a first failure, weird once the
 * retry has failed too, flat when a paste failed and nothing is left, over for rate
 * limiting.
 *
 * Retry is one-shot — once it has failed and a fallback remains, it disappears and
 * the fallback takes the primary slot. It re-runs without clearing the error, so
 * this component stays mounted through the attempt.
 *
 * It appears without a route change, so it's a role="alert" that announces itself
 * and moves focus to its primary action. Escape and "Not now" both dismiss;
 * restoring focus afterwards is the parent's job in onDismiss.
 */
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
  // Collapse to report-only: a failed paste is dead on arrival, and a failed retry
  // only gets here when nothing else could take the primary slot.
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

  // Focus the primary when the panel appears, and again when a retry resolves —
  // the button disables mid-flight, which drops focus to <body>.
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

  // In intent order — the first eligible one becomes the primary. Every code offers
  // at least one of retry, paste or edit, so there's always something to promote.
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
    // Escape lives on this wrapper rather than the alert or the window: it only
    // catches keys bubbling from the real controls, so it can't hijack Escape
    // page-wide. display:contents, so it doesn't affect the layout.
    <div
      className={styles.keys}
      role="presentation"
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
          {/* quiet marker that this is the second failure, not the first */}
          {retryFailed && !terminal && (
            <span className={styles.retryCount}>×2</span>
          )}
        </h2>
        <p className={styles.hint}>{copy.hint}</p>

        <div className={styles.actions}>
          {failed ? (
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
