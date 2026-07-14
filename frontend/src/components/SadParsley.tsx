import styles from "./SadParsley.module.css";

interface SadParsleyProps {
  className?: string;
}

// A wilted, downcast version of the Parsley sprig — three drooping leaflets over
// a small face with sad slanted brows, a frown, and a single tear. The strokes
// inherit the brand emerald (currentColor via the token), the face is punched out
// with the page background, and the tear keeps its own water-blue. The `.pl-head`
// group is the transform target the widget animates (the head-shake / droop); the
// `.pl-tear` group is faded/dripped separately.
export function SadParsley({ className }: SadParsleyProps) {
  return (
    <svg className={className} viewBox="0 0 100 110" fill="none" aria-hidden>
      <g
        stroke="var(--color-brand)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* drooping stem */}
        <path d="M50 104 C 50 88, 47 82, 50 70" opacity="0.85" />
        <g className={styles.head}>
          {/* three leaflets, faintly filled so the head reads as a mass */}
          <path
            d="M50 70 C 50 48, 34 34, 12 36 C 12 58, 30 70, 50 66 Z"
            fill="var(--color-brand)"
            fillOpacity="0.14"
          />
          <path
            d="M50 66 C 50 40, 66 26, 90 30 C 88 54, 68 66, 50 62 Z"
            fill="var(--color-brand)"
            fillOpacity="0.14"
          />
          <path
            d="M50 72 C 47 54, 33 46, 18 50 C 20 68, 36 76, 50 70 Z"
            fill="var(--color-brand)"
            fillOpacity="0.10"
          />
          {/* face area punched out of the ground */}
          <ellipse
            cx="50"
            cy="58"
            rx="18"
            ry="16"
            fill="var(--color-bg)"
            fillOpacity="0.55"
            strokeOpacity="0.5"
          />
          {/* sad, slanted brows */}
          <path d="M39 50 L 47 53" strokeWidth="2.8" />
          <path d="M61 50 L 53 53" strokeWidth="2.8" />
          {/* eyes */}
          <circle
            cx="43.5"
            cy="58"
            r="2.6"
            fill="var(--color-text)"
            stroke="none"
          />
          <circle
            cx="56.5"
            cy="58"
            r="2.6"
            fill="var(--color-text)"
            stroke="none"
          />
          {/* downturned mouth */}
          <path d="M44 68 C 47 64, 53 64, 56 68" />
          {/* tear */}
          <path
            className={styles.tear}
            d="M43 62 C 41 65, 40 67, 42 68 C 44 68, 43.5 65, 43 62 Z"
            fill="#8fd3ff"
            stroke="#8fd3ff"
            strokeWidth="1"
          />
        </g>
      </g>
    </svg>
  );
}
