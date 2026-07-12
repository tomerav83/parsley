import { useEffect, useRef } from "react";

/* Ambient page background: faint parsley sprigs drifting slowly upward behind the
   whole app — the Leaf mascot dissolved into atmosphere. It's decoration only:
   a fixed, pointer-events-none canvas pinned below the app content (z-index -1,
   above the body's gradient wash). Colour tracks the emerald token so it follows
   light/dark, and it honours prefers-reduced-motion by painting a single static
   frame instead of animating. */

type Sprig = {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  s: number; // scale
  rot: number;
  vr: number; // rotation velocity
  vy: number; // upward velocity (fraction of height per frame)
  drift: number; // horizontal sway amplitude
  phase: number;
  a: number; // alpha
};

function seed(count: number): Sprig[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: 0.7 + Math.random() * 1.2,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.0016,
    vy: 0.00016 + Math.random() * 0.0002,
    drift: 0.5 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    a: 0.22 + Math.random() * 0.2,
  }));
}

/** One parsley leaflet: a broad, rounded blade with a serrated (toothed) edge,
    added as a sub-path from base (ox,oy) growing along `ang` for `len`. The
    half-width follows a sine so the blade is widest mid-leaf (ovate, not a
    spike), with a higher-frequency ripple riding on top for the toothed edge. */
function addLeaflet(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  ang: number,
  len: number,
) {
  const dx = Math.sin(ang);
  const dy = -Math.cos(ang); // leaf axis direction
  const nx = Math.cos(ang);
  const ny = Math.sin(ang); // perpendicular (leaf half-width axis)
  const w = len * 0.46;
  const N = 6;
  const edge = (f: number) =>
    Math.sin(Math.PI * f) * w + Math.sin(f * Math.PI * 3.5) * w * 0.22;
  ctx.moveTo(ox, oy);
  for (let i = 1; i <= N; i++) {
    const f = i / N;
    const o = edge(f);
    ctx.lineTo(ox + dx * len * f + nx * o, oy + dy * len * f + ny * o);
  }
  for (let i = N - 1; i >= 0; i--) {
    const f = i / N;
    const o = edge(f);
    ctx.lineTo(ox + dx * len * f - nx * o, oy + dy * len * f - ny * o);
  }
  ctx.closePath();
}

/** A parsley sprig: a stem carrying a terminal leaflet and two lateral pairs
    (pinnately compound) — an herb sprig, not a palmate 5-point leaf. Drawn as a
    single filled path so overlapping leaflets don't double up the alpha. */
function drawLeaf(ctx: CanvasRenderingContext2D, s: number) {
  const stemLen = 14 * s;
  const stemW = 0.9 * s;
  ctx.beginPath();
  // slightly tapered stem
  ctx.moveTo(-stemW, 0);
  ctx.lineTo(stemW, 0);
  ctx.lineTo(stemW * 0.4, -stemLen);
  ctx.lineTo(-stemW * 0.4, -stemLen);
  ctx.closePath();
  // terminal leaflet, then upper and lower lateral pairs down the stem
  addLeaflet(ctx, 0, -stemLen, 0, 13 * s);
  addLeaflet(ctx, 0, -stemLen * 0.66, -0.85, 11 * s);
  addLeaflet(ctx, 0, -stemLen * 0.66, 0.85, 11 * s);
  addLeaflet(ctx, 0, -stemLen * 0.36, -1.05, 8.5 * s);
  addLeaflet(ctx, 0, -stemLen * 0.36, 1.05, 8.5 * s);
  ctx.fill();
}

/** Read the emerald brand token and return it as an "r,g,b" string. */
function emeraldRgb(el: HTMLElement): string {
  const hex = getComputedStyle(el).getPropertyValue("--e").trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "16,185,129";
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

export function SprigsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const sprigs = seed(22);
    let width = 0;
    let height = 0;
    let color = emeraldRgb(document.documentElement);
    let raf = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame(t: number) {
      ctx!.clearRect(0, 0, width, height);
      for (const p of sprigs) {
        p.y -= p.vy;
        p.rot += p.vr;
        if (p.y < -0.1) {
          p.y = 1.1;
          p.x = Math.random();
        }
        const px = p.x * width + Math.sin(t * 0.0002 + p.phase) * p.drift * 12;
        const py = p.y * height;
        ctx!.save();
        ctx!.translate(px, py);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = `rgba(${color},${p.a})`;
        drawLeaf(ctx!, p.s);
        ctx!.restore();
      }
    }

    // A single static frame (no motion) for reduced-motion users.
    function paintStatic() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of sprigs) {
        ctx!.save();
        ctx!.translate(p.x * width, p.y * height);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = `rgba(${color},${p.a})`;
        drawLeaf(ctx!, p.s);
        ctx!.restore();
      }
    }

    function loop(t: number) {
      frame(t);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      cancelAnimationFrame(raf);
      resize();
      if (reduce.matches) paintStatic();
      else raf = requestAnimationFrame(loop);
    }

    function onResize() {
      resize();
      if (reduce.matches) paintStatic();
    }

    // The emerald token flips with the OS colour scheme; re-read it on change.
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    function onScheme() {
      color = emeraldRgb(document.documentElement);
      if (reduce.matches) paintStatic();
    }

    start();
    window.addEventListener("resize", onResize);
    scheme.addEventListener("change", onScheme);
    reduce.addEventListener("change", start);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      scheme.removeEventListener("change", onScheme);
      reduce.removeEventListener("change", start);
    };
  }, []);

  return <canvas ref={canvasRef} className="sprig-bg" aria-hidden />;
}
