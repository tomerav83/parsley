import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { recipeExtractor } from "@/features/extract/recipeExtractor.ts";
import { cacheRecipe } from "@/lib/recipeCache.ts";
import { spriteCopy } from "@/features/extract/errorInfo";
import { FloatingError } from "@/features/extract/FloatingError/FloatingError";
import { Background } from "@/components/Background.tsx";
import { ThemeToggle } from "@/components/ThemeToggle/ThemeToggle";
import type { AppOutletContext } from "./router/useAppOutlet.ts";
import styles from "./App.module.css";
import "./transitions.css";

// Filmstrip order of the screens: a forward move (higher index) slides in from
// the right, a back move returns to the right. Drives the data-slide attribute
// the view-transition CSS keys off (see transitions.css).
function orderOf(pathname: string): number {
  if (pathname.startsWith("/recipe")) return 2;
  if (pathname.startsWith("/paste")) return 1;
  return 0;
}

function recipePath(url: string): string {
  return `/recipe?${new URLSearchParams({ url })}`;
}

// The layout route: app chrome (background, theme toggle, floating error) around
// the routed screen. App owns only the extraction lifecycle and the URL field's
// text — everything else lives in the screens, which mount per-route.
function App() {
  const extract = recipeExtractor();
  const navigate = useNavigate();
  const location = useLocation();
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const urlFieldRef = useRef<HTMLInputElement>(null);

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

  // Cache each extracted recipe by its request URL (the one it's addressed by in
  // /recipe?url=…) so a refresh or back/forward restores it from sessionStorage
  // instead of re-hitting the API — and so a paste-sourced recipe, whose URL can't
  // be re-fetched, survives a reload at all (RecipeScreen reads it back). lastUrl
  // is the request URL for every path (submit/retry/paste/deep-link); a fresh load
  // hasn't set it yet, so the empty-key guard in cacheRecipe skips the no-op write.
  useEffect(() => {
    if (extract.recipe) cacheRecipe(lastUrl, extract.recipe);
  }, [extract.recipe, lastUrl]);

  const { runUrl, runPaste, dismiss } = extract;

  async function submitUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLastUrl(trimmed);
    // Stay on home while the request runs; only slide once a recipe lands, so a
    // failed extract doesn't slide in then back.
    if ((await runUrl(trimmed)) === "success") {
      navigate(recipePath(trimmed), { viewTransition: true });
    }
  }

  async function submitPaste(html: string) {
    const result = await runPaste(html, lastUrl);
    if (result === "success") {
      navigate(recipePath(lastUrl), { viewTransition: true });
    } else if (result === "error") {
      // A failed paste is the end of the recovery road — return home, where it
      // surfaces as the corner widget in its report-only terminal state.
      navigate("/", { viewTransition: true });
    }
  }

  // Deep-link entry: /recipe?url=… on a fresh load (or with a different URL than
  // the one on screen) extracts that URL in place. Failures fall back to home,
  // where the corner widget offers the recovery options. Kept in useCallback:
  // RecipeScreen's effect depends on it staying stable (runUrl is stable too).
  const requestRecipe = useCallback(
    async (target: string) => {
      setUrl(target); // mirror into the field so "Edit link" starts from it
      setLastUrl(target);
      if ((await runUrl(target)) === "error") {
        navigate("/", { viewTransition: true });
      }
    },
    [runUrl, navigate],
  );

  // "Try again" from the floating widget re-runs WITHOUT clearing the error, so
  // the widget stays mounted to tell a second failure apart from a fresh one.
  async function retry() {
    if ((await runUrl(lastUrl, { retry: true })) === "success") {
      navigate(recipePath(lastUrl), { viewTransition: true });
    }
  }

  function backToSearch() {
    dismiss();
    setUrl(""); // "new search" starts from a clean field
    navigate("/", { viewTransition: true });
  }

  function openPaste() {
    dismiss();
    navigate("/paste", { viewTransition: true });
  }

  // Dismissing the error (fly-away, "Not now", Escape) or picking "Edit link"
  // both land the user back at the URL field — the logical next step once the
  // widget is gone (APG: restore focus to an element that continues the workflow).
  function dismissError() {
    dismiss();
    urlFieldRef.current?.focus();
  }

  const context: AppOutletContext = {
    extract,
    url,
    setUrl,
    lastUrl,
    urlFieldRef,
    submitUrl,
    submitPaste,
    requestRecipe,
    backToSearch,
  };

  const showError = extract.error !== null && onHome;

  return (
    <div className={styles.app}>
      <Background />
      <ThemeToggle />
      <main className={styles.screens} data-app-screens="">
        <Outlet context={context} />
      </main>

      {/* A fresh failure arrives as the collapsed corner sprite without moving
          focus, so this always-mounted live region announces it to assistive
          tech (WCAG 4.1.3). The terminal case auto-opens the dialog and moves
          focus instead — announcing it here too would double up. */}
      <p className="visually-hidden" role="status">
        {showError && !extract.pasteFailed && extract.error
          ? `${spriteCopy(extract.error.code).title} — recovery options are in the corner of the page.`
          : ""}
      </p>

      {/* Extraction failures on the search flow surface here, as a floating
          mascot fixed to the viewport corner. The paste screen keeps its own
          inline error so the pasted HTML isn't lost. */}
      {extract.error && onHome && (
        <FloatingError
          error={extract.error}
          sourceUrl={lastUrl}
          terminal={extract.pasteFailed}
          onPaste={openPaste}
          onEdit={dismissError}
          onRetry={retry}
          onDismiss={dismissError}
        />
      )}
    </div>
  );
}

export default App;
