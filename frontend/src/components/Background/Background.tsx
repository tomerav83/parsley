import type { CSSProperties } from "react";

import { ParsleyLogo } from "@/components/ParsleyLogo.tsx";

import styles from "./Background.module.css";

/* Ambient page background: faint ParsleyLogo sprigs drifting slowly up the
   viewport. Decoration only. All motion is plain CSS animation (see
   Background.module.css); this file just rolls the dice once per page load for
   where each sprig lives and how fast it moves. */

const SPRIG_COUNT = 22;

/* One random sprig. Durations are seconds: a sprig takes `rise`s to cross the
   screen bottom-to-top, wobbles ±`swayAmp`px every `swayDur`s, and turns once
   per `spin`s. `phase` (0..1) is how far through its journey it starts — fed to
   CSS as a negative animation-delay so the screen is scattered with sprigs
   immediately instead of empty for the first minute. */
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
