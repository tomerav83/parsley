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

/**
 * The Parsley mascot: the character art cut into a CSS puppet. crop_poses.py
 * slices each pose into a base sprite plus its moving parts and prints the
 * percentages used below; CSS blinks the lids, floats the ?? and ?!, drifts the
 * cloud, drips the sweat and trembles the stressed poses. The pupils stay painted
 * into the base — cutting them drags the glasses rim along with them, so the eyes
 * get their life from blinking instead.
 *
 * At rest every layer sits where it was cut from, so a still frame is the original
 * illustration. That's also what reduced motion renders. Decorative throughout.
 *
 *   work  — glasses, laptop, LEAF FOCUS mug; runs while an extraction does
 *   hmm   — puzzled glance under ?? (the extract failed)
 *   weird — startled double-take under ?!, sweating (the retry failed too)
 *   flat  — rain cloud and puddle, heavy lids (a paste failed; nothing left)
 *   over  — sweating over the TO-DO scroll, trembling (rate limited)
 */
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
      // the sheet has no sweat drawn for this pose, so borrow over's
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

// Streaks cluster beside the crown the way the original art's rain does — none
// cross the face. left is a % of the rain band; the delays keep them out of step.
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
