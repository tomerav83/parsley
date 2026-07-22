import { useEffect, useRef, useState } from "react";
import { createCelPlayer, type LiquidFrame } from "./celPlayer.ts";
import { registerLiquid, type Dir } from "./liquidController.ts";
import { WHIRL_POSES } from "./whirlPoses.ts";
import styles from "./LiquidTransition.module.css";

// The liquid route transition (approved v5.1 prototype): a fixed overlay that
// plays the rotoscoped wave. Mounted once in main.tsx — deliberately OUTSIDE
// the router so it has no route coupling and so tests that mount App keep the
// plain (view-transition slide) code path. Callers reach it through
// liquidController.ts; useExtractionFlow guards with liquidAvailable().
export function LiquidTransition() {
  // "cover" swallows input (enter + hold); "exit" is decorative — the revealed
  // screen underneath is already interactive
  const [stage, setStage] = useState<"cover" | "exit" | null>(null);
  const waveRef = useRef<SVGSVGElement>(null);
  const emRef = useRef<SVGPathElement>(null);
  const amRef = useRef<SVGPathElement>(null);
  const poseRefs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    let coveredResolve: (() => void) | null = null;
    let finishedResolve: (() => void) | null = null;

    const player = createCelPlayer({
      onFrame({ em, emDx, am, amDx, whirlPose }: LiquidFrame) {
        emRef.current?.setAttribute("d", em);
        emRef.current?.setAttribute("transform", `translate(${emDx} 0)`);
        amRef.current?.setAttribute("d", am);
        amRef.current?.setAttribute("transform", `translate(${amDx} 0)`);
        poseRefs.current.forEach((g, i) => {
          if (g) g.style.visibility = i === whirlPose ? "visible" : "hidden";
        });
      },
      onCovered() {
        coveredResolve?.();
        coveredResolve = null;
      },
      onFinished() {
        finishedResolve?.();
        finishedResolve = null;
      },
    });

    const pump = () => {
      raf = requestAnimationFrame((now) => {
        if (player.tick(now)) pump();
      });
    };
    const mirror = (dir: Dir) => {
      if (waveRef.current)
        waveRef.current.style.transform = dir === -1 ? "scaleX(-1)" : "";
    };

    const unregister = registerLiquid({
      begin(dir) {
        if (!alive) return Promise.resolve();
        // a begin while active would corrupt the sequence; input is swallowed
        // while covered, so this only defends programmatic races
        if (player.phase !== "idle") player.stop();
        setStage("cover");
        mirror(dir);
        return new Promise<void>((resolve) => {
          coveredResolve = resolve;
          player.start();
          pump();
        });
      },
      reveal(dir, swap) {
        // a caller can hold this handle across an unmount (cleanup resolves
        // its covered await) — degrade to running the swap directly
        if (!alive) return Promise.resolve(void swap?.());
        mirror(dir); // invisible under full cover, so flipping here is safe
        swap?.();
        setStage("exit"); // frees input; the swap's screen is live under the wave
        return new Promise<void>((resolve) => {
          finishedResolve = () => {
            setStage(null);
            resolve();
          };
          player.release();
        });
      },
    });

    return () => {
      alive = false;
      unregister();
      cancelAnimationFrame(raf);
      player.stop();
      // never strand a caller mid-await
      coveredResolve?.();
      finishedResolve?.();
    };
  }, []);

  return (
    <div
      className={styles.overlay}
      data-stage={stage ?? undefined}
      aria-hidden="true"
    >
      <svg
        ref={waveRef}
        className={styles.wave}
        viewBox="0 0 1280 720"
        preserveAspectRatio="xMinYMid slice"
      >
        <path ref={amRef} className={styles.amber} fillRule="evenodd" d="" />
        <path ref={emRef} className={styles.emerald} fillRule="evenodd" d="" />
      </svg>
      <svg className={styles.whirl} viewBox="0 0 400 400">
        {WHIRL_POSES.map((pose, i) => (
          <g
            key={i}
            ref={(g) => {
              poseRefs.current[i] = g;
            }}
            style={{ visibility: "hidden" }}
          >
            <path className={styles.foam} d={pose.arcs} />
            <circle
              className={styles.foam}
              cx={pose.hub.x}
              cy={pose.hub.y}
              r={pose.hub.r}
            />
            {pose.pills.map((p, k) => (
              <ellipse
                key={k}
                className={styles.pill}
                cx={p.x}
                cy={p.y}
                rx={p.rx}
                ry={p.ry}
                transform={`rotate(${p.rot} ${p.x} ${p.y})`}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
