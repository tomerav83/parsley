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

/**
 * The layout route: app chrome around whichever screen is routed, with the whole
 * extraction lifecycle in useExtractionFlow and shared through the outlet context.
 */
function App() {
  const flow = useExtractionFlow();
  const location = useLocation();

  // Stamp the slide direction before paint so the view-transition CSS can read it,
  // then move focus to the incoming screen's heading — the researched best practice
  // for SPA route changes (Marcy Sutton's assistive-tech testing). Not on first
  // load: focus is already at the top of the document and moving it skips content.
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
