// The whirlpool loader's four cel poses, precomputed at module load. This is
// the one authored (not rotoscoped) part of the liquid transition: three
// tapered foam commas plus orbiting droplet pills, hand-jittered per pose so
// the stepped 12fps cycle churns instead of reading as a rotating spinner.
// Coordinates live in a 400x400 box centered on (200,200).

export type WhirlPill = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
};
export type WhirlPose = {
  /** the three foam commas, one path string */
  arcs: string;
  pills: WhirlPill[];
  hub: { x: number; y: number; r: number };
};

const rad = (d: number) => (d * Math.PI) / 180;

// Closed Catmull-Rom loop through the sampled outline — smooth cartoon edges
// without an SVG filter.
function smoothLoop(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  const at = (k: number) => pts[((k % n) + n) % n]!; // wrapped index, in bounds
  let d = `M${at(0).x.toFixed(1)} ${at(0).y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d +=
      `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ` +
      `${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ` +
      `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + "Z";
}

// A tapered foam arc: pointed tail at a0 swelling to a fat head at a1.
function comma(R: number, w: number, a0: number, a1: number): string {
  const N = 8;
  const out: { x: number; y: number }[] = [];
  const inn: { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const a = rad(a0 + (a1 - a0) * s);
    const wd = w * (0.12 + 0.88 * Math.pow(s, 1.25));
    out.push({
      x: 200 + Math.cos(a) * (R + wd / 2),
      y: 200 + Math.sin(a) * (R + wd / 2),
    });
    inn.push({
      x: 200 + Math.cos(a) * (R - wd / 2),
      y: 200 + Math.sin(a) * (R - wd / 2),
    });
  }
  return smoothLoop(out.concat(inn.reverse()));
}

const ARMS = [
  { a0: -15, R: 118, w: 27 },
  { a0: 105, R: 86, w: 21 },
  { a0: 225, R: 141, w: 15 },
];

type PoseSpec = {
  rot: number;
  j: { da: number; dr: number; dw: number; span: number }[];
  pills: { r: number; a: number; rx: number; ry: number }[];
  hub: { r: number; dx: number; dy: number };
};

// +30° per pose over a 3-arm layout: after four poses each arm lands on the
// next arm's slot, so the cycle loops as continuous churn. The jitters are the
// hand-drawn irregularity — no two poses share arc lengths or radii.
const POSES: PoseSpec[] = [
  {
    rot: 0,
    j: [
      { da: 0, dr: 0, dw: 0, span: 104 },
      { da: 5, dr: -4, dw: -2, span: 88 },
      { da: -6, dr: 3, dw: 1, span: 95 },
    ],
    pills: [
      { r: 158, a: 36, rx: 15, ry: 6 },
      { r: 146, a: 243, rx: 10, ry: 4.5 },
    ],
    hub: { r: 13, dx: 0, dy: 0 },
  },
  {
    rot: 30,
    j: [
      { da: -7, dr: -5, dw: 3, span: 96 },
      { da: 4, dr: 5, dw: -3, span: 101 },
      { da: 8, dr: -2, dw: 2, span: 84 },
    ],
    pills: [
      { r: 154, a: 81, rx: 13, ry: 5.5 },
      { r: 150, a: 288, rx: 11, ry: 5 },
      { r: 168, a: 150, rx: 6, ry: 3.5 },
    ],
    hub: { r: 14, dx: 2, dy: -1 },
  },
  {
    rot: 60,
    j: [
      { da: 6, dr: 4, dw: -2, span: 110 },
      { da: -8, dr: -6, dw: 2, span: 86 },
      { da: 3, dr: 5, dw: -1, span: 90 },
    ],
    pills: [
      { r: 161, a: 126, rx: 14, ry: 6 },
      { r: 143, a: 332, rx: 9, ry: 4 },
    ],
    hub: { r: 12, dx: -2, dy: 1 },
  },
  {
    rot: 90,
    j: [
      { da: 3, dr: -2, dw: 2, span: 99 },
      { da: -4, dr: 2, dw: -2, span: 93 },
      { da: -9, dr: -4, dw: 1, span: 104 },
    ],
    pills: [
      { r: 156, a: 170, rx: 15, ry: 6 },
      { r: 151, a: 17, rx: 10, ry: 4.5 },
      { r: 165, a: 260, rx: 5, ry: 3 },
    ],
    hub: { r: 13, dx: 1, dy: 2 },
  },
];

export const WHIRL_POSES: WhirlPose[] = POSES.map((P) => ({
  arcs: P.j
    .map((jit, k) => {
      const arm = ARMS[k]!; // j is always one jitter per arm
      const a0 = arm.a0 + P.rot + jit.da;
      return comma(arm.R + jit.dr, arm.w + jit.dw, a0, a0 + jit.span);
    })
    .join(""),
  pills: P.pills.map((p) => ({
    x: 200 + Math.cos(rad(p.a)) * p.r,
    y: 200 + Math.sin(rad(p.a)) * p.r,
    rx: p.rx,
    ry: p.ry,
    rot: p.a + 90,
  })),
  hub: { x: 200 + P.hub.dx, y: 200 + P.hub.dy, r: P.hub.r },
}));
