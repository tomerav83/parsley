import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";
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

// Does the active step's text overflow its fixed-height box? Drives the
// stacked-sheets cue: an overflowing card clips with a fade and opens the
// full-step lightbox instead of shrinking its type.
// Re-measures on resize — including a hidden mobile pane becoming visible
// (0 → real height fires the observer) — and once the webfonts land, whose
// metrics change the text's height but not the box's.
function useOverflows(text: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.clientHeight === 0) return; // hidden pane — nothing to measure yet
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text]);
  return { ref, overflows };
}

// The Method panel: one step at a time. The Prev/Next controls live in the panel
// HEADER (not a row under the card), so they never eat into the step card's
// reading area — the concern was they stole height on mobile. The card itself can
// also be swiped. Every step is a real <li> so the whole method is in the DOM
// (and prints); only the current one is shown, the rest carry the `hidden`
// attribute (out of the a11y tree + tab order, not merely aria-hidden). Keys are
// scoped to this element, never window, so they don't hijack the page. The step
// index is controlled so the mobile segment can label it.
//
// A step too long for the card no longer shrinks its type: it clips under a fade,
// grows a stacked-sheets glyph ("more pages under this one"), and the whole card
// becomes a tap target that lifts the full step into a lightbox over a dimmed
// backdrop. Short steps stay clean — no cue, no tap.
export function MethodSteps({ steps, index, onIndex }: MethodStepsProps) {
  const count = steps.length;
  const clamped = Math.max(0, Math.min(count - 1, index));
  const { ref: bodyRef, overflows } = useOverflows(steps[clamped] ?? "");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The lightbox's content only mounts while it's open — a closed <dialog>
  // otherwise keeps a duplicate copy of the step's text in the DOM.
  const [lightOpen, setLightOpen] = useState(false);

  const go = (delta: number) =>
    onIndex(Math.max(0, Math.min(count - 1, clamped + delta)));

  const openFull = () => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    // flushSync so the content exists before showModal picks the dialog's
    // initial focus target.
    flushSync(() => setLightOpen(true));
    d.showModal();
  };

  // Tapping anywhere in the lightbox — backdrop or the step text itself —
  // closes it back to the card.
  const onLightboxClick = () => dialogRef.current?.close();

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
  // drag (e.g. scrolling the open lightbox) is left alone.
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
          const tappable = active && overflows;
          return (
            <li
              key={i}
              className={styles.slide}
              hidden={!active}
              aria-current={active ? "step" : undefined}
            >
              {/* The card-wide click is pointer convenience over a big, forgiving
                  target; the sheets glyph is the real, focusable control, so the
                  step text stays plain readable content rather than becoming a
                  giant button label. */}
              {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
              <article
                className={
                  tappable ? `${styles.card} ${styles.tappable}` : styles.card
                }
                onClick={tappable ? openFull : undefined}
              >
                <div className={styles.cardHead}>
                  <span className={styles.num}>{pad(i + 1)}</span>
                  <div className={styles.cardHeadRight}>
                    {timer && <span className={styles.timer}>⏱ {timer}</span>}
                    {tappable && (
                      <button
                        type="button"
                        className={styles.sheets}
                        aria-label="Read the full step"
                        aria-haspopup="dialog"
                        onClick={openFull}
                      >
                        <span />
                        <span />
                        <span />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className={styles.bodyBox}
                  ref={active ? bodyRef : undefined}
                >
                  <p className={styles.body}>{s}</p>
                  {tappable && <div className={styles.fade} aria-hidden />}
                </div>
              </article>
            </li>
          );
        })}
      </ol>

      {/* The lightbox: the current step in full, zoomed up over a dimmed backdrop.
          A native <dialog> — Escape, focus trapping and the backdrop come free.
          No close button: a tap anywhere in the dialog (backdrop or text) closes
          it, so the whole surface is the dismiss target instead of one small icon.
          Key/touch events are stopped so the carousel behind it doesn't walk.
          Deliberately no timer chip in here: the chip lives on the card. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className={styles.lightbox}
        aria-label={`Step ${pad(clamped + 1)} in full — tap anywhere to close`}
        onClick={onLightboxClick}
        onClose={() => setLightOpen(false)}
        onKeyDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {lightOpen && (
          <div className={styles.lightInner}>
            <span className={`${styles.num} ${styles.lightNum}`}>
              {pad(clamped + 1)}
            </span>
            <p className={styles.lightBody}>{steps[clamped]}</p>
          </div>
        )}
      </dialog>
    </div>
  );
}
