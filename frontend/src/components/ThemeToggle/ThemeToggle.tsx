import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./Icons";
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

// Light/dark switch. The palette is already theme-aware via tokens (index.css);
// this just sets `data-theme` on <html> (overriding the OS default) and remembers
// the choice in localStorage.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Follow the OS while the user hasn't chosen explicitly, so the icon stays in
  // sync. An explicit choice lives as `data-theme` on <html>; while it's set, OS
  // changes must be ignored or the icon would drift from the visible page.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (document.documentElement.getAttribute("data-theme")) return;
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
      {goingDark ? (
        <MoonIcon className={styles.moon} />
      ) : (
        <SunIcon className={styles.sun} />
      )}
    </button>
  );
}
