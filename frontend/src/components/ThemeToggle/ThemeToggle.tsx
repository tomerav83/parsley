import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./Icons";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

/**
 * The theme on screen right now: an explicit choice on <html> if there is one,
 * else the OS preference. index.html applies the choice before paint, so reading
 * it here can't disagree with what the user sees.
 */
function currentTheme(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Light/dark switch. The tokens in index.css already handle both, so all this does
 * is set `data-theme` on <html> and remember the choice.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Follow the OS until the user picks a side. Once `data-theme` is set, OS changes
  // have to be ignored or the icon drifts away from the page it describes.
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
