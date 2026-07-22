import styles from "./LeafCharacter.module.css";
import flatBase from "./poses/flat/flat.webp";
import flatCloud from "./poses/flat/flat-cloud.webp";
import flatLids from "./poses/flat/flat-lids.webp";
import hmmBase from "./poses/hmm/hmm.webp";
import hmmLids from "./poses/hmm/hmm-lids.webp";
import hmmQq from "./poses/hmm/hmm-qq.webp";
import overBase from "./poses/over/over.webp";
import overLids from "./poses/over/over-lids.webp";
import overSweat from "./poses/over/over-sweat.webp";
import weirdBang from "./poses/weird/weird-bang.webp";
import weirdBase from "./poses/weird/weird.webp";
import weirdLids from "./poses/weird/weird-lids.webp";
import workBase from "./poses/work/work.webp";
import workLids from "./poses/work/work-lids.webp";
import workTicks from "./poses/work/work-ticks.webp";

// The Parsley mascot — the approved character art cut into a CSS puppet.
// frontend/.visual-check/crop_poses.py slices each img.png pose into a base
// sprite plus the moving parts (and prints the %-geometry below); CSS then
// animates the parts in place: lids blink, ??/?! float, the cloud drifts
// (its rain is redrawn in CSS so it can fall), sweat drips (the falling
// drop is drawn in the pipeline; over's painted bead stays baked in its
// base), and the stressed poses tremble. The pupils stay painted in the
// base — they sit against the glasses rim and laptop ink, so any cut layer
// drags fragments along; eye life comes from the blinks. At rest every
// layer sits exactly where it was cut from, so a static frame is identical
// to the original illustration — which is also the prefers-reduced-motion
// rendering.
//   work  — glasses, laptop, LEAF FOCUS mug; plays while an extraction runs
//   hmm   — puzzled upward glance under ?? (an extract failed)
//   weird — startled double-take under ?!, sweating (the retry failed too;
//           the sheet has no fifth drawing, so crop_poses.py composites it
//           from hmm's art)
//   flat  — rain cloud + puddle, heavy lids (a paste failed; terminal)
//   over  — sweating over the TO-DO scroll, trembling (rate limited)
// Decorative throughout: aria-hidden.
export type LeafMood = "work" | "hmm" | "weird" | "flat" | "over";

interface Part {
  src: string;
  cls: string | undefined;
  left: number;
  top: number;
  width: number;
}

const part = (
  src: string,
  cls: string | undefined,
  left: number,
  top: number,
  width: number,
): Part => ({ src, cls, left, top, width });

const SCENES: Record<
  LeafMood,
  { base: string; parts: Part[]; rain?: boolean }
> = {
  work: {
    base: workBase,
    parts: [
      part(workTicks, styles.ticks, 13.58, 37.82, 9.88),
      part(workLids, styles.lids, 33.54, 50.13, 26.75),
    ],
  },
  hmm: {
    base: hmmBase,
    parts: [
      part(hmmQq, styles.qq, 71.43, 5.63, 28.57),
      part(hmmLids, styles.lids, 21.43, 43.92, 42.29),
    ],
  },
  flat: {
    base: flatBase,
    rain: true,
    parts: [
      part(flatCloud, styles.cloud, 4.29, 0, 84.86),
      part(flatLids, styles.lids, 29.43, 61.49, 40.0),
    ],
  },
  weird: {
    base: weirdBase,
    parts: [
      part(weirdBang, styles.qq, 71.43, 5.63, 28.57),
      part(overSweat, styles.sweat, 84.57, 36.71, 13.14),
      part(weirdLids, styles.lids, 21.43, 43.92, 42.29),
    ],
  },
  over: {
    base: overBase,
    parts: [
      part(overSweat, styles.sweat, 69.43, 43.47, 13.14),
      part(overLids, styles.lids, 31.14, 46.17, 39.71),
    ],
  },
};

// Streak columns cluster beside the crown like the original art's rain —
// none fall across the face. left is % of the rain band; delays de-sync.
const RAIN_DROPS: Array<[left: number, delay: number]> = [
  [3, 0],
  [13, 0.5],
  [26, 0.21],
  [64, 0.74],
  [79, 0.38],
  [93, 0.6],
];

export function LeafCharacter({
  mood,
  className,
}: {
  mood: LeafMood;
  className?: string;
}) {
  const scene = SCENES[mood];
  return (
    <span
      className={`${styles.char}${className ? ` ${className}` : ""}`}
      aria-hidden
      data-mood={mood}
    >
      <span className={styles.fig}>
        {scene.rain && (
          <span className={styles.rainband}>
            {RAIN_DROPS.map(([left, delay]) => (
              <span
                key={left}
                className={styles.drop}
                style={{ left: `${left}%`, animationDelay: `${delay}s` }}
              />
            ))}
          </span>
        )}
        <img
          className={styles.base}
          src={scene.base}
          alt=""
          draggable={false}
        />
        {scene.parts.map((p) => (
          <img
            key={p.src}
            className={`${styles.part} ${p.cls}`}
            src={p.src}
            alt=""
            draggable={false}
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.width}%`,
            }}
          />
        ))}
      </span>
    </span>
  );
}
