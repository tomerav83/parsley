import { useRef } from "react";
import { Navigate } from "react-router";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import { LeafOrb } from "@/features/extract/LeafOrb/LeafOrb.tsx";
import { ErrorWindow } from "@/features/extract/ErrorWindow/ErrorWindow";
import styles from "./ExtractScreen.module.css";

// The transition screen: where a submit lands. The leaf works in its porthole
// while the request pends, and — if it fails — the same porthole morphs to the
// failure in place (ErrorWindow), never bouncing the error back over Home. On
// success App has already waved on to the recipe; this screen just holds the work
// orb under that cover.
//
// It's only ever reached through useExtractionFlow.submitUrl, so a stray landing
// (a hard deep-link to /extract, or a re-render after the error cleared) has
// nothing to show and bounces itself home. History keeps it out of the back stack
// (submit pushes it; success/paste replace it), so Back never returns here.
export function ExtractScreen() {
  const { extract, lastUrl, retry, openPaste, editLink, dismissError } =
    useAppOutlet();
  const { error, loading, recipe, pasteFailed } = extract;

  // A stray landing (hard deep-link to /extract) mounts with nothing to show —
  // bounce home. But once we've shown something, a later empty render just means
  // we're leaving (a recovery action cleared the error as it navigates away); sit
  // blank for that beat rather than racing our own navigation with a redirect.
  const shown = useRef(false);
  if (error || loading || recipe) shown.current = true;
  if (!error && !loading && !recipe) {
    return shown.current ? null : <Navigate to="/" replace />;
  }

  return (
    <div className={styles.extractScreen}>
      <title>Parsley — extracting…</title>
      {/* Stable route-heading for App's route-change focus. The work→error morph
          isn't a route change, so the ErrorWindow moves focus to its own primary
          action and announces via role="alert". */}
      <h1 className={styles.srHeading} data-route-heading tabIndex={-1}>
        {error ? "Extraction failed" : "Extracting your recipe"}
      </h1>
      {error ? (
        <div className={styles.panelWrap}>
          <ErrorWindow
            error={error}
            sourceUrl={lastUrl}
            terminal={pasteFailed}
            onPaste={openPaste}
            onEdit={editLink}
            onRetry={retry}
            onDismiss={dismissError}
          />
        </div>
      ) : (
        <div className={styles.working}>
          <LeafOrb
            mood="work"
            state="work"
            status="working"
            className={styles.orb}
          />
          <p className={styles.caption}>
            Reading the page and lifting out the recipe…
          </p>
        </div>
      )}
    </div>
  );
}
