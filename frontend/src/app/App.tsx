import { useLayoutEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import {
  screenOrder,
  useExtractionFlow,
} from "@/app/transitions/useExtractionFlow.ts";
import { Background } from "@/components/Background/Background.tsx";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import styles from "./App.module.css";
import "@/app/transitions/transitions.css";

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
  const prevOrder = useRef(screenOrder(location.pathname));
  const firstKey = useRef(location.key);
  useLayoutEffect(() => {
    const order = screenOrder(location.pathname);
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
