// The mascot's body silhouette, precomputed at module load (same pattern as the
// liquid transition's whirlPoses). One ruffled compound-leaf outline shared by
// every pose, so the character is verifiably the same leaf in every state:
// a lobed radial base, deep notch cuts between the lobes (what makes it read
// as parsley instead of a blob), soft tooth spikes riding the lobe crests, and
// a hand-drawn wobble. The `droop` variant sags the crown for the defeated
// "not today" pose. Coordinates live in the 200×200 box the poses are drawn in;
// the component crops to VIEW_BOX.

export const VIEW_BOX = "8 12 184 152";

const CX = 105;
const CY = 90;
const R = 55;

const RAD = (d: number) => (d * Math.PI) / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// lobe humps: [angle°, amplitude, width] (-90 = straight up)
const LOBES = {
  norm: [
    [-90, 0.42, 0.3],
    [-148, 0.3, 0.26],
    [-32, 0.32, 0.26],
    [172, 0.24, 0.26],
    [8, 0.26, 0.26],
  ],
  droop: [
    [-90, 0.3, 0.3],
    [-150, 0.29, 0.26],
    [-30, 0.29, 0.26],
    [178, 0.24, 0.26],
    [2, 0.25, 0.26],
  ],
} as const;

// deep cuts between the lobes
const NOTCHES = {
  norm: [
    [-119, -0.16, 0.09],
    [-61, -0.16, 0.09],
    [-170, -0.12, 0.1],
    [-11, -0.12, 0.1],
  ],
  droop: [
    [-120, -0.15, 0.09],
    [-60, -0.15, 0.09],
    [-172, -0.11, 0.1],
    [-14, -0.11, 0.1],
  ],
} as const;

function bodyD(droop: boolean): string {
  const key = droop ? "droop" : "norm";
  const pts: { x: number; y: number }[] = [];
  const N = 260;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI + (i / N) * 2 * Math.PI;
    let r = 0.54;
    let env = 0;
    for (const [aD, amp, sg] of LOBES[key]) {
      const d = wrap(th - RAD(aD));
      const g = amp * Math.exp((-d * d) / (2 * sg * sg));
      r += g;
      env = Math.max(env, g);
    }
    for (const [aD, amp, sg] of NOTCHES[key]) {
      const d = wrap(th - RAD(aD));
      r += amp * Math.exp((-d * d) / (2 * sg * sg));
    }
    // pinch the bottom where the legs attach
    const db = wrap(th - Math.PI / 2);
    r -= 0.12 * Math.exp((-db * db) / (2 * 0.5 * 0.5));
    // soft pointed teeth, strongest on the lobe crests, gone in the notches
    const tooth = Math.exp(2.2 * (Math.cos(32 * th + 1.3) - 1));
    r += 0.085 * (env / 0.42) * tooth;
    // hand-drawn wobble
    r *= 1 + 0.012 * Math.sin(3 * th + 0.8);
    const x = CX + Math.cos(th) * R * r * 1.07; // squatter and wider than tall
    let y = CY + Math.sin(th) * R * r * 0.97;
    if (droop && y < CY) y = CY - (CY - y) * 0.8; // sag the crown
    pts.push({ x, y });
  }
  // closed midpoint-quadratic loop: smooth cartoon edges, no SVG filter
  let d = "";
  for (let i = 0; i < N; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % N]!;
    const mx = ((p.x + q.x) / 2).toFixed(1);
    const my = ((p.y + q.y) / 2).toFixed(1);
    d +=
      i === 0
        ? `M${mx} ${my}`
        : `Q${p.x.toFixed(1)} ${p.y.toFixed(1)} ${mx} ${my}`;
  }
  const p0 = pts[0]!;
  const p1 = pts[1]!;
  return (
    d +
    `Q${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${((p0.x + p1.x) / 2).toFixed(1)} ${((p0.y + p1.y) / 2).toFixed(1)}Z`
  );
}

function veinsD(droop: boolean): string {
  const key = droop ? "droop" : "norm";
  let d = "";
  LOBES[key].forEach(([aD, amp], i) => {
    const a = RAD(aD);
    const f0 = 0.3; // outer segment only — keeps the face clear
    const f1 = 0.5 + amp * 0.6;
    const sx = CX + Math.cos(a) * R * f0 * 1.07;
    let sy = CY + Math.sin(a) * R * f0 * 0.97;
    const tx = CX + Math.cos(a) * R * f1 * 1.07;
    let ty = CY + Math.sin(a) * R * f1 * 0.97;
    if (droop) {
      if (sy < CY) sy = CY - (CY - sy) * 0.8;
      if (ty < CY) ty = CY - (CY - ty) * 0.8;
    }
    const bend = aD === -90 ? 0 : Math.cos(a) < 0 ? -5 : 5;
    d += `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${((sx + tx) / 2 + bend).toFixed(1)} ${((sy + ty) / 2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`;
    if (i === 0) {
      // fishbone branches on the central vein
      const b1 = sy - (sy - ty) * 0.4;
      const b2 = sy - (sy - ty) * 0.7;
      d += `M${CX} ${b1.toFixed(1)} L${CX - 11} ${(b1 - 8).toFixed(1)}`;
      d += `M${CX} ${b2.toFixed(1)} L${CX + 10} ${(b2 - 7).toFixed(1)}`;
    }
  });
  return d;
}

export const LEAF_BODY = bodyD(false);
export const LEAF_VEINS = veinsD(false);
export const LEAF_BODY_DROOP = bodyD(true);
export const LEAF_VEINS_DROOP = veinsD(true);
