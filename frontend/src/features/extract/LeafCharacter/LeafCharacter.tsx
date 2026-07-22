import { useId } from "react";
import {
  LEAF_BODY,
  LEAF_BODY_DROOP,
  LEAF_VEINS,
  LEAF_VEINS_DROOP,
  VIEW_BOX,
} from "./leafBody.ts";
import styles from "./LeafCharacter.module.css";

// The Parsley mascot (approved character prototype, from the img.png reference):
// one serrated curly-parsley leaf with stick limbs and big close-set eyes, in a
// different pose per extraction state. All poses share the same generated body
// (leafBody.ts); each mood adds its own face, limbs, props, and CSS animation:
//   work  — glasses, laptop, LEAF FOCUS mug; plays while an extraction runs
//   hmm   — puzzled chin-tap (an extract failed)
//   weird — wide-eyed head-scratch (the retry failed too)
//   flat  — rain cloud + puddle, heavy lids (a paste failed; terminal)
//   over  — jittering with a TO-DO scroll (rate limited)
// Colors come from the --color-leaf-* tokens, so the character follows the
// theme like every other component. Decorative throughout: aria-hidden.
export type LeafMood = "work" | "hmm" | "weird" | "flat" | "over";

// The lobed body with its painterly shading and veins. `clip` scopes the
// shading blobs to the silhouette.
function Body({ droop = false }: { droop?: boolean }) {
  const clipId = useId();
  const body = droop ? LEAF_BODY_DROOP : LEAF_BODY;
  const veins = droop ? LEAF_VEINS_DROOP : LEAF_VEINS;
  return (
    <g>
      <clipPath id={clipId}>
        <path d={body} />
      </clipPath>
      <path className={styles.body} d={body} />
      <g clipPath={`url(#${clipId})`}>
        <ellipse className={styles.shadeDk} cx="78" cy="118" rx="30" ry="18" />
        <ellipse
          className={styles.shadeDk2}
          cx="132"
          cy="112"
          rx="26"
          ry="16"
        />
        <ellipse
          className={styles.shadeLt}
          cx="103"
          cy={droop ? 52 : 42}
          rx="32"
          ry="16"
        />
      </g>
      <path className={styles.veins} d={veins} />
    </g>
  );
}

// Big close-set white eyes with oversized pupils and glints. `pupilsClass`
// lets a mood animate the pupils (glance, dart, shake) without re-declaring
// the geometry.
function Eyes({
  r = 8.2,
  pupilR = 4.8,
  cy = 95,
  pupilsClass,
}: {
  r?: number;
  pupilR?: number;
  cy?: number;
  pupilsClass?: string;
}) {
  return (
    <>
      <circle className={styles.eyeW} cx="96" cy={cy} r={r} />
      <circle className={styles.eyeW} cx="114" cy={cy} r={r} />
      <g className={pupilsClass}>
        <circle className={styles.pupil} cx="96" cy={cy} r={pupilR} />
        <circle className={styles.pupil} cx="114" cy={cy} r={pupilR} />
        <circle
          className={styles.glint}
          cx={96 - pupilR * 0.33}
          cy={cy - pupilR * 0.38}
          r={pupilR * 0.3}
        />
        <circle
          className={styles.glint}
          cx={114 - pupilR * 0.33}
          cy={cy - pupilR * 0.38}
          r={pupilR * 0.3}
        />
      </g>
    </>
  );
}

const STANDING_LEGS = (
  <>
    <path className={styles.limb} d="M97 110 L95 139 L87 142" />
    <path className={styles.limb} d="M113 110 L115 139 L123 142" />
  </>
);

function WorkScene() {
  return (
    <>
      <ellipse className={styles.shadow} cx="102" cy="158" rx="84" ry="5" />
      <g className={styles.fig}>
        <Body />
        {/* round dark-rimmed glasses, pupils on the screen */}
        <circle className={styles.lens} cx="94.5" cy="95" r="10" />
        <circle className={styles.lens} cx="115.5" cy="95" r="10" />
        <g>
          <circle className={styles.pupil} cx="93" cy="97.5" r="5" />
          <circle className={styles.pupil} cx="114" cy="97.5" r="5" />
          <circle className={styles.glint} cx="91.2" cy="95.6" r="1.4" />
          <circle className={styles.glint} cx="112.2" cy="95.6" r="1.4" />
        </g>
        <path className={styles.mouth} d="M103.9 94 Q105 92.2 106.1 94" />
        <path className={styles.mouth} d="M100 110 Q105 113.5 110 110" />
      </g>
      {/* focus ticks near the crown */}
      <path className={styles.tick} d="M50 56 L43 49" />
      <path className={`${styles.tick} ${styles.tick2}`} d="M60 47 L56 38" />
      {/* arms around the laptop sides, hands typing on the deck */}
      <g className={styles.armT}>
        <path className={styles.limb} d="M66 104 C 50 110, 44 130, 54 145" />
        <circle className={styles.hand} cx="56" cy="146" r="3.6" />
      </g>
      <g className={`${styles.armT} ${styles.armT2}`}>
        <path
          className={styles.limb}
          d="M144 106 C 156 114, 156 132, 148 144"
        />
        <circle className={styles.hand} cx="146" cy="145" r="3.6" />
      </g>
      {/* laptop right in front, lid toward us with the leaf logo */}
      <g>
        <rect
          className={styles.lid}
          x="64"
          y="115"
          width="82"
          height="32"
          rx="6"
        />
        <path className={styles.logo} d="M98 131 q8 -9 15 0 q-7 11 -15 0 Z" />
        <path className={styles.deck} d="M56 147 L154 147 L162 158 L48 158 Z" />
      </g>
      {/* the LEAF FOCUS mug */}
      <g>
        <rect
          className={styles.mug}
          x="150"
          y="122"
          width="29"
          height="30"
          rx="4"
        />
        <path className={styles.mugHandle} d="M179 128 a8 8 0 0 1 0 16" />
        <text
          className={styles.htext}
          x="164.5"
          y="135"
          fontSize="6.5"
          textAnchor="middle"
        >
          LEAF
        </text>
        <text
          className={styles.htext}
          x="164.5"
          y="144"
          fontSize="6.5"
          textAnchor="middle"
        >
          FOCUS
        </text>
      </g>
    </>
  );
}

function HmmScene() {
  return (
    <>
      <ellipse className={styles.shadow} cx="105" cy="145" rx="42" ry="5" />
      <g className={styles.fig}>
        {/* limbs emerge from behind the leaf */}
        {STANDING_LEGS}
        <path className={styles.limb} d="M74 100 C 64 108, 62 115, 64 121" />
        <Body />
        {/* one brow up, eyes drifting up-left, small frown */}
        <path className={styles.brow} d="M88 81 Q 94 77.5, 100 81" />
        <path className={styles.brow} d="M111 85 L 122 84" />
        <Eyes pupilsClass={styles.pupilsHmm} />
        <path className={styles.mouth} d="M99 114 Q 104.5 111, 110 114.5" />
        {/* chin hand */}
        <g className={styles.chin}>
          <path
            className={styles.limb}
            d="M137 111 C 132 120, 123 123, 115 119"
          />
          <circle className={styles.hand} cx="114" cy="119" r="3.4" />
        </g>
      </g>
      <text
        className={`${styles.htext} ${styles.q1}`}
        x="146"
        y="46"
        fontSize="30"
      >
        ?
      </text>
      <text
        className={`${styles.htext} ${styles.q2}`}
        x="168"
        y="64"
        fontSize="21"
      >
        ?
      </text>
    </>
  );
}

function WeirdScene() {
  return (
    <>
      <ellipse className={styles.shadow} cx="105" cy="145" rx="42" ry="5" />
      <g className={styles.fig}>
        {STANDING_LEGS}
        <path className={styles.limb} d="M74 100 C 64 108, 62 115, 64 121" />
        <Body />
        {/* brows sky-high, huge eyes, o mouth */}
        <path className={styles.brow} d="M87 78 Q 93 74, 100 77.5" />
        <path className={styles.brow} d="M110 77.5 Q 117 74, 123 78" />
        <Eyes r={9} pupilR={3.2} pupilsClass={styles.pupilsWeird} />
        <circle className={styles.mouthO} cx="105" cy="113" r="2.7" />
        {/* arm up scratching the crown */}
        <g className={styles.scratch}>
          <path className={styles.limb} d="M142 98 C 158 88, 158 64, 142 50" />
          <circle className={styles.hand} cx="141" cy="49" r="3.4" />
        </g>
      </g>
      <text
        className={`${styles.htext} ${styles.qq}`}
        x="156"
        y="40"
        fontSize="20"
      >
        ?!
      </text>
    </>
  );
}

function FlatScene() {
  return (
    <>
      <ellipse className={styles.puddle} cx="105" cy="152" rx="44" ry="7" />
      <g className={styles.fig}>
        <path className={styles.limb} d="M97 112 L95 144 L87 147" />
        <path className={styles.limb} d="M113 112 L115 144 L123 147" />
        <path className={styles.limb} d="M76 104 C 68 112, 66 118, 68 124" />
        <path
          className={styles.limb}
          d="M134 104 C 142 112, 144 118, 142 124"
        />
        <Body droop />
        {/* heavy lids over big tired eyes, deep frown */}
        <path className={styles.brow} d="M86 85 L 98 88.5" />
        <path className={styles.brow} d="M124 85 L 112 88.5" />
        <circle className={styles.eyeW} cx="96" cy="99" r="7.5" />
        <circle className={styles.eyeW} cx="114" cy="99" r="7.5" />
        <circle className={styles.pupil} cx="96" cy="101" r="3.8" />
        <circle className={styles.pupil} cx="114" cy="101" r="3.8" />
        <path className={styles.lidHalf} d="M88.5 99 a7.5 7.5 0 0 1 15 0 Z" />
        <path className={styles.lidHalf} d="M106.5 99 a7.5 7.5 0 0 1 15 0 Z" />
        <path className={styles.mouth} d="M97 117 Q 105 111.5, 113 117" />
      </g>
      {/* rain cloud */}
      <g className={styles.cloud}>
        <path d="M70 30 a13 13 0 0 1 21 -9 a15 15 0 0 1 27 -1 a12 12 0 0 1 19 7 a9 9 0 0 1 -4 16 q-30 2 -59 0 a10 10 0 0 1 -4 -13 Z" />
      </g>
      <g>
        <path className={styles.rain} d="M64 50 l-2 9" />
        <path
          className={styles.rain}
          style={{ animationDelay: "0.25s" }}
          d="M82 52 l-2 9"
        />
        <path
          className={styles.rain}
          style={{ animationDelay: "0.55s" }}
          d="M100 50 l-2 9"
        />
        <path
          className={styles.rain}
          style={{ animationDelay: "0.15s" }}
          d="M118 52 l-2 9"
        />
        <path
          className={styles.rain}
          style={{ animationDelay: "0.7s" }}
          d="M136 50 l-2 9"
        />
        <path
          className={styles.rain}
          style={{ animationDelay: "0.4s" }}
          d="M150 53 l-2 9"
        />
      </g>
    </>
  );
}

function OverScene() {
  return (
    <>
      <ellipse className={styles.shadow} cx="100" cy="145" rx="52" ry="5" />
      <g className={styles.fig}>
        {STANDING_LEGS}
        <Body />
        {/* worried brows, wide eyes, wobbly mouth, sweat */}
        <path className={styles.brow} d="M87 82 L 99 85.5" />
        <path className={styles.brow} d="M123 82 L 111 85.5" />
        <Eyes r={8.8} pupilR={2.8} cy={95} pupilsClass={styles.pupilsOver} />
        <path
          className={styles.mouth}
          d="M97 112 q 2.6 -2.6 5.2 0 q 2.6 2.6 5.2 0 q 1.6 -1.6 2.6 -0.6"
        />
        <path
          className={styles.sweat}
          d="M148 68 c -1.8 2.8, -2.4 4.6, -0.6 5.6 c 1.9 0.9, 2.4 -1.9, 0.6 -5.6 Z"
        />
        {/* arms gripping the to-do scroll, held to the side */}
        <path className={styles.limb} d="M76 100 C 70 105, 66 108, 63 110" />
        <path className={styles.limb} d="M88 112 C 80 120, 72 126, 66 129" />
        <g className={styles.scroll}>
          <path
            className={styles.paper}
            d="M30 82 L66 79 L68 144 Q68 150 60 149 L38 147 Q30 147 30 141 Z"
          />
          <path
            className={styles.paper}
            d="M30 141 c -7 1, -8 9, -1 10 c 5 1, 8 -2, 6 -6"
          />
          <text
            className={styles.todo}
            x="48"
            y="94"
            fontSize="9.5"
            textAnchor="middle"
          >
            TO-DO
          </text>
          <g className={styles.checkbox}>
            <rect x="36" y="101" width="5.5" height="5.5" />
            <rect x="36" y="113" width="5.5" height="5.5" />
            <rect x="36" y="125" width="5.5" height="5.5" />
          </g>
          <g className={styles.todoLine}>
            <path d="M47 104 h 16" />
            <path d="M47 116 h 13" />
            <path d="M47 128 h 17" />
          </g>
          <circle className={styles.hand} cx="63" cy="110" r="3.6" />
          <circle className={styles.hand} cx="66" cy="129" r="3.6" />
        </g>
      </g>
    </>
  );
}

const SCENES: Record<LeafMood, () => React.ReactNode> = {
  work: WorkScene,
  hmm: HmmScene,
  weird: WeirdScene,
  flat: FlatScene,
  over: OverScene,
};

export function LeafCharacter({
  mood,
  className,
}: {
  mood: LeafMood;
  className?: string;
}) {
  const Scene = SCENES[mood];
  return (
    <svg
      className={`${styles.char} ${styles[mood]}${className ? ` ${className}` : ""}`}
      viewBox={VIEW_BOX}
      aria-hidden
      data-mood={mood}
    >
      <Scene />
    </svg>
  );
}
