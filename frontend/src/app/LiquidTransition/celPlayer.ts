// The cel playback machine for the liquid transition — framework-free and
// clock-injected (drive it with tick(now)) so it unit-tests without rAF.
//
// Timing is the film's own: drawings swap at its 24fps hold counts (mostly on
// twos). Transport is smoother than the film: "drawn on twos, moved on ones"
// — between swaps the current artwork glides at display rate along the wave's
// travel, using each drawing's measured coverage as its front position. The
// glide directions are chosen so no gap can open at the anchored edge:
//   enter — the NEXT drawing shows through each slot, slid back to the
//           current front and easing forward (mass is left-anchored, so a
//           negative offset never uncovers anything)
//   exit  — the CURRENT drawing slides onward toward the next trailing
//           position (mass is right-anchored, ditto for positive offsets)
// The amber wall runs LEAD frames ahead on the way in and LEAD behind on the
// way out. Direction/mirroring is the component's concern.
import { CEL } from "./celData.ts";

export const FRAME_MS = 1000 / 24;
const LEAD = 3;
const W = 1280; // the art's viewBox width

const byF = new Map(CEL.map((c) => [c.f, c]));
function get(f: number) {
  const c = byF.get(f);
  if (!c) throw new Error(`celData is missing frame ${f}`);
  return c;
}

export const FULL = get(64).d;

// One 24fps frame of a layer: which drawing shows, the drawing's own front
// position, and the interpolated front target across this frame (t0 → t1).
// Render offset = lerp(t0, t1, φ) - xd.
type Sample = { d: string; xd: number; t0: number; t1: number };
const BLANK: Sample = { d: "", xd: 0, t0: 0, t1: 0 };
const FULL_STILL: Sample = { d: FULL, xd: 0, t0: 0, t1: 0 };

// enter: front position = coverage × width; slot i displays drawing i+1
// (offset ≤ 0). The first drawing's silhouette is skipped by the phase shift,
// but its position still shapes the anticipation beat.
function buildEnter(frames: number[]): Sample[] {
  const ds = frames.map(get);
  const pos = ds.map((c) => c.c * W);
  const out: Sample[] = [];
  ds.forEach((c, i) => {
    const next = Math.min(i + 1, ds.length - 1);
    const p0 = pos[i]!;
    const p1 = pos[next]!;
    for (let u = 0; u < c.hold; u++) {
      out.push({
        d: ds[next]!.d,
        xd: p1,
        t0: p0 + ((p1 - p0) * u) / c.hold,
        t1: p0 + ((p1 - p0) * (u + 1)) / c.hold,
      });
    }
  });
  return out;
}

// exit: trailing-edge position = (1 - coverage) × width; slot i displays
// drawing i sliding toward drawing i+1's position (offset ≥ 0). A static
// full-cover frame leads, so the route swap's commit is on screen before the
// first sliver opens.
function buildExit(frames: number[]): Sample[] {
  const ds = frames.map(get);
  const pos = ds.map((c) => (1 - c.c) * W);
  const out: Sample[] = [FULL_STILL];
  ds.forEach((c, i) => {
    const p0 = pos[i]!;
    const p1 = i + 1 < pos.length ? pos[i + 1]! : W;
    for (let u = 0; u < c.hold; u++) {
      out.push({
        d: c.d,
        xd: p0,
        t0: p0 + ((p1 - p0) * u) / c.hold,
        t1: p0 + ((p1 - p0) * (u + 1)) / c.hold,
      });
    }
  });
  return out;
}

const ENTER = buildEnter([52, 53, 56, 57, 59, 61, 63, 64]);
// tail extended into the film's spray decay (f13-f16) so the last specks
// dwindle instead of popping off
const EXIT = buildExit([66, 68, 70, 72, 1, 2, 4, 5, 7, 9, 11, 13, 15, 16]);

export type LiquidFrame = {
  /** emerald layer path ("" = nothing) and its glide offset in art px */
  em: string;
  emDx: number;
  /** amber layer path and glide offset */
  am: string;
  amDx: number;
};

export type CelPlayerEvents = {
  onFrame: (frame: LiquidFrame) => void;
  /** full cover reached — safe to swap what's underneath */
  onCovered: () => void;
  /** exit finished — overlay is empty again */
  onFinished: () => void;
};

export function createCelPlayer(ev: CelPlayerEvents) {
  let phase: "idle" | "enter" | "hold" | "exit" = "idle";
  let fi = 0;
  let acc = 0;
  let last: number | null = null;
  let released = false;

  const offset = (s: Sample, phi: number) => s.t0 + (s.t1 - s.t0) * phi - s.xd;

  // advance discrete state by one 24fps frame; false once the run finished
  function stepFrame(): boolean {
    if (phase === "enter") {
      if (fi - LEAD >= ENTER.length - 1) {
        phase = "hold";
        ev.onCovered();
      }
    } else if (phase === "hold") {
      if (released) {
        phase = "exit";
        fi = -1; // ++ below lands on 0
      }
    } else if (phase === "exit") {
      if (fi - LEAD >= EXIT.length) {
        phase = "idle";
        ev.onFinished();
        return false;
      }
    }
    fi++;
    return true;
  }

  // paint the current instant; phi ∈ [0,1) is progress into the current frame
  function emit(phi: number) {
    if (phase === "enter") {
      const am = ENTER[Math.min(fi, ENTER.length - 1)]!;
      const emJ = fi - LEAD;
      const em = emJ < 0 ? BLANK : ENTER[Math.min(emJ, ENTER.length - 1)]!;
      ev.onFrame({
        em: em.d,
        emDx: offset(em, phi),
        am: am.d,
        amDx: offset(am, phi),
      });
    } else if (phase === "hold") {
      ev.onFrame({ em: FULL, emDx: 0, am: FULL, amDx: 0 });
    } else if (phase === "exit") {
      const em = fi < EXIT.length ? EXIT[fi]! : BLANK;
      const amJ = fi - LEAD;
      const am = amJ < 0 ? FULL_STILL : amJ < EXIT.length ? EXIT[amJ]! : BLANK;
      ev.onFrame({
        em: em.d,
        emDx: offset(em, phi),
        am: am.d,
        amDx: offset(am, phi),
      });
    }
  }

  return {
    get phase() {
      return phase;
    },
    start() {
      phase = "enter";
      fi = 0;
      acc = 0;
      last = null;
      released = false;
    },
    /** allow leaving the hold — call after the under-cover swap */
    release() {
      released = true;
    },
    stop() {
      phase = "idle";
    },
    /** advance to `now` (ms); returns false once idle so the driver can stop */
    tick(now: number): boolean {
      if (phase === "idle") return false;
      if (last === null) {
        last = now;
        emit(0);
        return true;
      }
      // clamp: a backgrounded tab pauses rAF; on return, catch up a few frames,
      // don't replay the whole gap in one burst
      acc = Math.min(acc + (now - last), 10 * FRAME_MS);
      last = now;
      while (acc >= FRAME_MS) {
        acc -= FRAME_MS;
        if (!stepFrame()) {
          ev.onFrame({ em: "", emDx: 0, am: "", amDx: 0 });
          return false;
        }
      }
      emit(acc / FRAME_MS);
      return true;
    },
  };
}
