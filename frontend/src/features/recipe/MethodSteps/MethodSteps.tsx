import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import styles from "./MethodSteps.module.css";

interface MethodStepsProps {
  steps: string[];
  /** Current step (controlled — the parent owns it so the mobile segment can label it). */
  index: number;
  onIndex: (index: number) => void;
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

// Shrink the visible step's text just enough to fit its fixed-height card, so a
// long step is never clipped and the pane never scrolls (the whole recipe lives
// in one window). Re-runs whenever the shown text or the card's size changes —
// including when a hidden mobile pane becomes visible (0 → real height fires the
// observer). Only the visible <li> carries this ref; the hidden ones measure 0.
function useFitText(text: string, base: number) {
  const min = 11.5;
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${base}px`;
      if (el.clientHeight === 0) return; // hidden pane — nothing to measure yet
      let fs = base;
      while (el.scrollHeight > el.clientHeight && fs > min) {
        fs -= 0.5;
        el.style.fontSize = `${fs}px`;
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // Re-fit once the webfonts load: their metrics differ from the fallback, and
    // a font swap changes the text's height but not the card's, so the observer
    // (which watches the card-constrained box) wouldn't otherwise catch it.
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) fit();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, base]);
  return ref;
}

const pad = (n: number) => String(n).padStart(2, "0");

// Chevron icons kept inline so stroke/size stay in sync with the buttons.
function Chevron({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        d={dir === "prev" ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The Method panel: one step at a time. The Prev/Next controls live in the panel
// HEADER (not a row under the card), so they never eat into the step card's
// reading area — the concern was they stole height on mobile. The card itself can
// also be swiped left/right. Every step is a real <li> so the whole method is in
// the DOM (and prints); only the current one is shown, the rest carry the `hidden`
// attribute (out of the a11y tree + tab order, not merely aria-hidden). Keys are
// scoped to this element, never window, so they don't hijack the page. The step
// index is controlled so the mobile segment can label it.
export function MethodSteps({ steps, index, onIndex }: MethodStepsProps) {
  const count = steps.length;
  const clamped = Math.max(0, Math.min(count - 1, index));
  const bodyRef = useFitText(steps[clamped] ?? "", 15.5);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (delta: number) =>
    onIndex(Math.max(0, Math.min(count - 1, clamped + delta)));

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  // Horizontal swipe walks the steps — the thumb-friendly path that keeps the
  // controls out of the card. Only clearly-horizontal swipes count, so a vertical
  // drag (e.g. scrolling a very long step) is left alone.
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: TouchEvent) {
    const end = e.changedTouches[0];
    if (!touch.current || !end) return;
    const dx = end.clientX - touch.current.x;
    const dy = end.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) {
      go(dx < 0 ? 1 : -1); // swipe left → next
    }
  }

  return (
    // A focusable, labelled carousel region walked by ←/→ or swipe — the APG
    // Carousel keyboard pattern. The rules assume a non-interactive group
    // shouldn't be focusable, take key handlers, or use role="group", but a
    // carousel container legitimately does all three (the header Prev/Next stay
    // the primary, always-available control).
    // https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={styles.method}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-roledescription="carousel"
      aria-label="Method steps — swipe, use the arrow keys, or the previous and next buttons"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.head}>
        <span className={styles.label}>Method</span>
        <div className={styles.nav}>
          <span className={styles.count}>
            step {pad(clamped + 1)} of {pad(count)}
          </span>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => go(-1)}
            disabled={clamped === 0}
            aria-label="Previous step"
          >
            <Chevron dir="prev" />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => go(1)}
            disabled={clamped === count - 1}
            aria-label="Next step"
          >
            <Chevron dir="next" />
          </button>
        </div>
      </div>

      {/* aria-live so pressing Next/Prev (focus stays on the button) announces the
          step that comes into view. */}
      <ol className={styles.stage} aria-live="polite">
        {steps.map((s, i) => {
          const timer = timerOf(s);
          const active = i === clamped;
          return (
            <li
              key={i}
              className={styles.slide}
              hidden={!active}
              aria-current={active ? "step" : undefined}
            >
              <article className={styles.card}>
                <div className={styles.cardHead}>
                  <span className={styles.num}>{pad(i + 1)}</span>
                  {timer && <span className={styles.timer}>⏱ {timer}</span>}
                </div>
                <p className={styles.body} ref={active ? bodyRef : undefined}>
                  {s}
                </p>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
