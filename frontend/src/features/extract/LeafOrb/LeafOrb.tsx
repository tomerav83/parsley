import { useId } from "react";
import {
  LeafCharacter,
  type LeafMood,
} from "@/features/extract/LeafCharacter/LeafCharacter.tsx";
import styles from "./LeafOrb.module.css";

/**
 * The leaf in a white porthole — the one anchor shared by the wait and the failure
 * that may follow it. A rim of liquid current churns while `state="work"` and
 * stills to the mood colour on `state="error"`; it's the same element either way,
 * so going from waiting to recovery is an attribute flip, not a remount.
 *
 * The plate under the character doubles as the ground the raster art needs in dark
 * themes. Decorative — the copy around it carries the meaning.
 */
export function LeafOrb({
  mood,
  state,
  status,
  className,
}: {
  mood: LeafMood;
  state: "work" | "error";
  status?: string; // work-state rim caption (e.g. "working"); omit for none
  className?: string;
}) {
  // Unique per instance so multiple orbs never collide on the filter id.
  const rippleId = useId();
  const working = state === "work";
  return (
    <div
      className={`${styles.orb}${className ? ` ${className}` : ""}`}
      data-state={state}
      data-mood={mood}
    >
      <span className={styles.ring} aria-hidden />
      {working && (
        // The waterline: a stroked ring wobbled by turbulence and slowly
        // rotated, so the rim reads as liquid rather than a border.
        <svg className={styles.crest} viewBox="0 0 100 100" aria-hidden>
          <filter id={rippleId} x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.03 0.05"
              numOctaves="2"
              seed="7"
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale="9"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <circle cx="50" cy="50" r="47" filter={`url(#${rippleId})`} />
        </svg>
      )}
      <span className={styles.plate}>
        <LeafCharacter mood={mood} className={styles.char} />
      </span>
      {working && status && (
        <span className={styles.chip}>
          <i className={styles.dot} aria-hidden />
          {status}
        </span>
      )}
    </div>
  );
}
