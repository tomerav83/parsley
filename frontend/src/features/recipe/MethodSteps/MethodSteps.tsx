import {
  useCallback,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
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
function useFitText(text: string, base: number, min = 11.5) {
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
  }, [text, base, min]);
  return ref;
}

const pad = (n: number) => String(n).padStart(2, "0");

// The Method panel's engine: every step is a real <li> so the whole method is in
// the DOM (and prints), but only the current one is shown — the rest carry the
// `hidden` attribute (correctly out of the a11y tree and tab order, not merely
// aria-hidden). Walked by the visible Prev/Next buttons or ←/→ while the widget
// is focused; keys are scoped to this element, never window, so they don't hijack
// the page. The step index is controlled so the mobile segment can label it.
export function MethodSteps({ steps, index, onIndex }: MethodStepsProps) {
  const count = steps.length;
  const clamped = Math.max(0, Math.min(count - 1, index));
  const bodyRef = useFitText(steps[clamped] ?? "", 15.5);

  const go = useCallback(
    (delta: number) =>
      onIndex(Math.max(0, Math.min(count - 1, clamped + delta))),
    [onIndex, count, clamped],
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  return (
    // A focusable, labelled carousel region walked by ←/→ — the APG Carousel
    // keyboard pattern. The rules assume a non-interactive group shouldn't be
    // focusable, take key handlers, or use role="group", but a carousel
    // container legitimately does all three (the visible Prev/Next buttons stay
    // the primary, always-available control).
    // https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={styles.method}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-roledescription="carousel"
      aria-label="Method steps — use the arrow keys or the previous and next buttons"
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
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
              <div className={styles.card}>
                <div className={styles.head}>
                  <span className={styles.num}>{pad(i + 1)}</span>
                  {timer && <span className={styles.timer}>⏱ {timer}</span>}
                </div>
                <p className={styles.body} ref={active ? bodyRef : undefined}>
                  {s}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.nav}
          onClick={() => go(-1)}
          disabled={clamped === 0}
          aria-label="Previous step"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <path
              d="M14 6l-6 6 6 6"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={styles.nav}
          onClick={() => go(1)}
          disabled={clamped === count - 1}
          aria-label="Next step"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden
          >
            <path
              d="M10 6l6 6-6 6"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
