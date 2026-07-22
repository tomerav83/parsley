import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { useExtractionFlow } from "@/app/transitions/useExtractionFlow.ts";
import { Background } from "@/components/Background/Background.tsx";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import styles from "./App.module.css";
import "@/app/transitions/transitions.css";

// Filmstrip order of the screens: a forward move (higher index) slides in from
// the right, a back move returns to the right. Drives the data-slide attribute
// the view-transition CSS keys off (see transitions.css). The transition screen
// and paste fallback both sit one step in from home.
function orderOf(pathname: string): number {
  if (pathname.startsWith("/recipe")) return 2;
  if (pathname.startsWith("/paste")) return 1;
  if (pathname.startsWith("/extract")) return 1;
  return 0;
}

// The layout route: app chrome (background, theme toggle) around the routed
// screen. The extraction lifecycle — including the failure surface, now the
// transition screen (ExtractScreen), not an overlay — lives in useExtractionFlow.
function App() {
  const flow = useExtractionFlow();
  const location = useLocation();

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

  return (
    <div className={styles.app}>
      <Background />
      <ThemeToggle />
      <main className={styles.screens} data-app-screens="">
        <Outlet context={flow} />
      </main>
    </div>
  );
}

export default App;
