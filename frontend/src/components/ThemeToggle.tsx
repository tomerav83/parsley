import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

// The effective theme right now: an explicit choice on <html> wins, otherwise the
// OS preference. The explicit choice is applied pre-paint by the inline script in
// index.html, so this matches what's on screen with no flash.
function currentTheme(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function SunIcon() {
  return (
    <svg
      className={styles.sun}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg
      className={styles.moon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

// Light/dark switch. The palette is already theme-aware via tokens (index.css);
// this just sets `data-theme` on <html> (overriding the OS default) and remembers
// the choice in localStorage.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Follow the OS while the user hasn't chosen explicitly, so the icon stays in
  // sync. Re-check the stored choice on every change (not just at mount): once the
  // user picks a theme their explicit choice wins on <html>, so OS changes must be
  // ignored — otherwise the icon would drift out of sync with the visible page.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let chosen: string | null = null;
      try {
        chosen = localStorage.getItem("theme");
      } catch {
        // storage blocked (e.g. private mode) — treat as no explicit choice
      }
      if (chosen) return;
      setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore storage failures (e.g. private mode) — the in-session theme still applies
    }
    setTheme(next);
  }

  const goingDark = theme === "light";
  const label = goingDark ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      {goingDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
