import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type TouchEvent,
} from "react";

interface StepReelProps {
  steps: string[];
}

// Pull a cooking duration out of a step ("Roast 18–20 minutes…") so it can be
// surfaced as an amber timer chip. Conservative on purpose: only a number (or a
// range) directly followed by a time unit counts, so stray digits like "220°C"
// or "3 tbsp" never masquerade as timers.
const TIMER_RE =
  /\b\d+(?:[–-]\d+)?\s?(?:seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

function timerOf(step: string): string | null {
  const m = step.match(TIMER_RE);
  return m ? m[0].replace(/\s+/g, " ") : null;
}

// Where each card sits relative to the active one. Offset 0 faces the reader
// head-on; the rest recede up (done) or down (upcoming) along the z-axis, tilting
// away and dimming so two or three steps of context peek past the focused one.
// Beyond ±2 they're fully faded — the reel never shows more than a shallow stack.
function cardStyle(offset: number): CSSProperties {
  const a = Math.abs(offset);
  if (offset === 0)
    return {
      transform: "translateZ(0) scale(1)",
      opacity: 1,
      filter: "none",
      zIndex: 20,
    };
  if (a === 1)
    return {
      transform: `translateY(${offset * 60}%) translateZ(-170px) rotateX(${-offset * 26}deg) scale(0.82)`,
      opacity: 0.5,
      filter: "blur(1.2px)",
      zIndex: 19,
    };
  if (a === 2)
    return {
      transform: `translateY(${offset * 88}%) translateZ(-340px) rotateX(${-offset * 32}deg) scale(0.66)`,
      opacity: 0.16,
      filter: "blur(2.4px)",
      zIndex: 18,
    };
  return {
    transform: `translateY(${offset * 110}%) translateZ(-460px) scale(0.6)`,
    opacity: 0,
    filter: "blur(3px)",
    zIndex: 0,
  };
}

// Method steps as a vertical coverflow ("Depth Reel"): exactly one step faces the
// reader, its neighbours receding above and below so the sequence has a visible
// sense of place without a scrolling list. Advance by vertical swipe/drag, wheel,
// ↑/↓ while focused, or by tapping a peeking card. Horizontal
// swipes are deliberately left untouched — those belong to the section carousel.
export function StepReel({ steps }: StepReelProps) {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<number | null>(null);
  const wheelLock = useRef(false);

  const count = steps.length;
  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count],
  );
  const go = useCallback((i: number) => setIndex(clamp(i)), [clamp]);
  const step = useCallback(
    (d: number) => setIndex((i) => clamp(i + d)),
    [clamp],
  );

  // Reset to the first step whenever the recipe changes.
  useEffect(() => setIndex(0), [steps]);

  // Wheel scrolling over the reel walks the steps. Registered natively (not via
  // React's passive onWheel) so preventDefault actually stops the page scrolling,
  // and throttled so one flick advances one step rather than racing through.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 6) return;
      e.preventDefault();
      if (wheelLock.current) return;
      wheelLock.current = true;
      window.setTimeout(() => (wheelLock.current = false), 260);
      step(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [step]);

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const end = e.changedTouches[0];
    if (!touch.current || !end) return;
    const dx = end.clientX - touch.current.x;
    const dy = end.clientY - touch.current.y;
    touch.current = null;
    // Only claim clearly-vertical swipes; stop them here so the section carousel
    // (which listens for horizontal swipes on the same viewport) stays put.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 40) {
      e.stopPropagation();
      step(dy < 0 ? 1 : -1);
    }
  };

  // Mouse drag is the desktop equivalent of the swipe; touch is handled above.
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    drag.current = e.clientY;
    stageRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (drag.current === null) return;
    const dy = e.clientY - drag.current;
    drag.current = null;
    if (Math.abs(dy) > 34) step(dy < 0 ? 1 : -1);
  };

  // ↑/↓ walk the reel from anywhere on the page — no need to focus/click it first.
  // Gated on visibility: when the Method section is the peeked-away (aria-hidden)
  // panel, this bails so the Ingredients list gets the keystroke instead. Ignored
  // while typing in the URL field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input:not([type='checkbox']):not([type='radio']), textarea, [contenteditable='true']",
        )
      )
        return;
      const el = stageRef.current;
      // Bail when the reel is off-screen: an inactive section is aria-hidden,
      // and an off-route screen is `inert` (which sets no aria-hidden attribute,
      // so both must be checked — otherwise the reel still eats the arrow keys
      // on the Home screen while a recipe stays mounted behind it).
      if (!el || el.closest("[inert], [aria-hidden='true']")) return;
      e.preventDefault();
      step(e.key === "ArrowDown" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="step-reel">
      <div
        ref={stageRef}
        className="reel-stage"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label="Method steps — use up and down arrows"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {steps.map((s, i) => {
          const offset = i - index;
          const active = offset === 0;
          const st = cardStyle(offset);
          const timer = timerOf(s);
          return (
            <div
              key={i}
              className={`reel-card${active ? " on" : ""}`}
              style={{
                ...st,
                pointerEvents: active ? "none" : st.opacity ? "auto" : "none",
              }}
              aria-hidden={!active}
              aria-current={active ? "step" : undefined}
              onClick={
                active ? undefined : () => go(i > index ? index + 1 : index - 1)
              }
            >
              <div className="reel-head">
                <span className="reel-num">{pad(i + 1)}</span>
                {timer && <span className="reel-timer">⏱ {timer}</span>}
              </div>
              <p className="reel-body">{s}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
