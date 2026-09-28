import { useRef } from "react";
import { Navigate } from "react-router";
import { useAppOutlet } from "@/features/extract/useAppOutlet.ts";
import { LeafOrb } from "@/features/extract/LeafOrb/LeafOrb.tsx";
import { ErrorWindow } from "@/features/extract/ErrorWindow/ErrorWindow";
import styles from "./ExtractScreen.module.css";

/**
 * Where a submit lands: the leaf works in its porthole while the request pends,
 * and a failure morphs that same porthole into the error panel in place, so the
 * error never lands back over Home.
 *
 * Only submitUrl navigates here, so a stray landing has nothing to show and sends
 * itself home.
 */
export function ExtractScreen() {
  const { extract, lastUrl, retry, openPaste, editLink, dismissError } =
    useAppOutlet();
  const { error, loading, recipe, pasteFailed } = extract;

  // Nothing to show on mount means a deep-link landed here: go home. Nothing to
  // show *after* we've rendered means we're on our way out (a recovery action
  // cleared the error), so sit blank rather than race our own navigation.
  const shown = useRef(false);
  if (error || loading || recipe) shown.current = true;
  if (!error && !loading && !recipe) {
    return shown.current ? null : <Navigate to="/" replace />;
  }

  return (
    <div className={styles.extractScreen}>
      <title>Parsley — extracting…</title>
      {/* App moves focus here on a route change. The work-to-error morph isn't
          one, so ErrorWindow handles its own focus and announcement. */}
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
