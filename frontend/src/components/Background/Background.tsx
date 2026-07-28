import type { CSSProperties } from "react";

import { ParsleyLogo } from "@/components/ParsleyLogo.tsx";

import styles from "./Background.module.css";

// Faint sprigs drifting up the viewport. CSS does all the motion; this file only
// rolls the dice once per page load for where each one lives and how fast it goes.

const SPRIG_COUNT = 22;

/**
 * One sprig's numbers. Durations are seconds: it takes `rise` to cross the screen,
 * wobbles ±`swayAmp` every `swayDur`, and turns once per `spin`.
 *
 * `phase` is how far along it starts, handed to CSS as a negative animation-delay
 * so the screen is scattered with sprigs at once instead of empty for a minute.
 */
function randomSprig(index: number) {
  return {
    lane: Math.random() * 100, // vw — the vertical path it rises along
    size: 28 + Math.random() * 36, // px
    alpha: 0.22 + Math.random() * 0.2,
    rise: 55 + Math.random() * 70,
    phase: Math.random(),
    swayAmp: 6 + Math.random() * 18,
    swayDur: 26 + Math.random() * 10,
    spin: 30 + Math.random() * 50,
    spinDir: index % 2 ? "normal" : "reverse",
  } as const;
}

const sprigs = Array.from({ length: SPRIG_COUNT }, (_, i) => randomSprig(i));

export function Background() {
  return (
    <div className={styles.bg} aria-hidden>
      {sprigs.map((s, i) => (
        <div
          key={i}
          className={styles.rise}
          style={{
            left: `${s.lane}vw`,
            opacity: s.alpha,
            animationDuration: `${s.rise}s`,
            animationDelay: `${-s.phase * s.rise}s`,
          }}
        >
          <div
            className={styles.sway}
            style={
              {
                "--sway": `${s.swayAmp}px`,
                animationDuration: `${s.swayDur}s`,
                animationDelay: `${-s.phase * s.swayDur}s`,
              } as CSSProperties
            }
          >
            <div
              className={styles.spin}
              style={{
                width: s.size,
                height: s.size,
                animationDuration: `${s.spin}s`,
                animationDirection: s.spinDir,
                animationDelay: `${-s.phase * s.spin}s`,
              }}
            >
              <ParsleyLogo />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
