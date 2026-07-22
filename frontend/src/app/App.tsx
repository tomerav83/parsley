import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { useExtractionFlow } from "@/app/transitions/useExtractionFlow.ts";
import { ErrorWindow } from "@/features/extract/ErrorWindow/ErrorWindow";
import { Background } from "@/components/Background/Background.tsx";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import styles from "./App.module.css";
import "@/app/transitions/transitions.css";

// Filmstrip order of the screens: a forward move (higher index) slides in from
// the right, a back move returns to the right. Drives the data-slide attribute
// the view-transition CSS keys off (see transitions.css).
function orderOf(pathname: string): number {
  if (pathname.startsWith("/recipe")) return 2;
  if (pathname.startsWith("/paste")) return 1;
  return 0;
}

// The layout route: app chrome (background, theme toggle, floating error) around
// the routed screen. The extraction lifecycle lives in useExtractionFlow.
function App() {
  const flow = useExtractionFlow();
  const location = useLocation();
  const onHome = location.pathname === "/";

  // Direction stamp + focus management on every client-side navigation (A6).
  // Stamping data-slide before paint lets the view-transition CSS pick the
  // slide direction; moving focus to the incoming screen's heading is the
  // researched best practice for SPA route changes (Marcy Sutton's assistive-
  // tech user testing). Skipped on the initial page load — the browser already
  // put focus at the document start, and stealing it would skip content.
  const prevOrder = useRef(orderOf(location.pathname));
  const firstKey = useRef(location.key);
  useLayoutEffect(() => {
    const order = orderOf(location.pathname);
    document.documentElement.dataset.slide =
      order < prevOrder.current ? "back" : "forward";
    prevOrder.current = order;
    if (location.key !== firstKey.current) {
      document.querySelector<HTMLElement>("[data-route-heading]")?.focus();
    }
  }, [location.pathname, location.key]);

  // errorSurfaced holds a fresh failure back until its wave has covered the
  // screen, so the window mounts beneath the wave instead of beside it.
  const showError = flow.extract.error !== null && onHome && flow.errorSurfaced;

  return (
    <div className={styles.app}>
      <Background />
      <ThemeToggle />
      <main className={styles.screens} data-app-screens="">
        <Outlet context={flow} />
      </main>

      {/* Extraction failures on the search flow surface here, as the centered
          leaf-mascot window (it moves focus to its primary action, which also
          makes its title/hint announce — no separate live region needed). The
          paste screen keeps its own inline error so the pasted HTML isn't lost. */}
      {flow.extract.error && showError && (
        <ErrorWindow
          error={flow.extract.error}
          sourceUrl={flow.lastUrl}
          terminal={flow.extract.pasteFailed}
          onPaste={flow.openPaste}
          onEdit={flow.dismissError}
          onRetry={flow.retry}
          onDismiss={flow.dismissError}
        />
      )}
    </div>
  );
}

export default App;
