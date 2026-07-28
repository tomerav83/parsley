import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";
import { stepTimer } from "@/features/recipe/timers";
import styles from "./MethodSteps.module.css";

interface MethodStepsProps {
  steps: string[];
  /** Current step (controlled — the parent owns it so the mobile segment can label it). */
  index: number;
  onIndex: (index: number) => void;
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

/**
 * Whether the step's text is taller than its box, which is what turns the card
 * into a tappable one with a fade and a sheets glyph.
 *
 * Re-measures on resize, which also covers a hidden mobile pane becoming visible,
 * and again once the webfonts land — their metrics change the text's height but
 * not the box's.
 */
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

/**
 * The Method panel: one step at a time, walked by the header buttons, the arrow
 * keys or a swipe. Prev/Next sit in the header rather than under the card so they
 * never eat into its reading height on mobile.
 *
 * Every step is a real <li> so the whole method is in the DOM and prints; the ones
 * that aren't current are `hidden`, which takes them out of the a11y tree and the
 * tab order rather than just hiding them visually. Key handlers are scoped to this
 * element so they can't hijack the page.
 *
 * A step too long for its card doesn't shrink its type — it clips under a fade,
 * grows a stacked-sheets glyph, and the card becomes a tap target that lifts the
 * full step into a lightbox. Short steps get none of that.
 */
export function MethodSteps({ steps, index, onIndex }: MethodStepsProps) {
  const count = steps.length;
  const clamped = Math.max(0, Math.min(count - 1, index));
  const { ref: bodyRef, overflows } = useOverflows(steps[clamped] ?? "");
  const touch = useRef<{ x: number; y: number } | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Mount the lightbox's content only while it's open; a closed <dialog> would
  // otherwise keep a second copy of the step's text in the DOM.
  const [lightOpen, setLightOpen] = useState(false);

  const go = (delta: number) =>
    onIndex(Math.max(0, Math.min(count - 1, clamped + delta)));

  const openFull = () => {
    const d = dialogRef.current;
    if (!d || d.open) return;
    // flushSync so the content exists before showModal picks what to focus
    flushSync(() => setLightOpen(true));
    d.showModal();
  };

  // Anywhere in the lightbox closes it — backdrop and step text alike.
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

  // Only clearly horizontal swipes walk the steps, so a vertical drag — scrolling
  // the open lightbox, say — is left alone.
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    if (t) touch.current = { x: t.clientX, y: t.clientY };
  }

  // Claim the horizontal drag with a real non-passive listener. React attaches
  // onTouchMove as passive, where preventDefault() is a silent no-op, and an
  // unclaimed horizontal touchmove leaves Android Chrome's gesture recognizer
  // believing a pan is under way — so the next tap anywhere gets swallowed
  // settling it. It shows up as "swipe the steps, then have to tap twice".
  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    function onMove(e: globalThis.TouchEvent) {
      const start = touch.current;
      const cur = e.touches[0];
      if (!start || !cur) return;
      const dx = cur.clientX - start.x;
      const dy = cur.clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        e.preventDefault();
      }
    }
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);
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
    // The APG carousel keyboard pattern. The lint rules below assume a
    // non-interactive group shouldn't be focusable, handle keys or use
    // role="group"; a carousel container legitimately does all three.
    // https://www.w3.org/WAI/ARIA/apg/patterns/carousel/
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={groupRef}
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

      {/* Focus stays on Next/Prev, so aria-live is what announces the step that
          comes into view. */}
      <ol className={styles.stage} aria-live="polite">
        {steps.map((s, i) => {
          const timer = stepTimer(s);
          const active = i === clamped;
          const tappable = active && overflows;
          return (
            <li
              key={i}
              className={styles.slide}
              hidden={!active}
              aria-current={active ? "step" : undefined}
            >
              {/* The card-wide click is just a forgiving pointer target — the
                  sheets glyph is the real focusable control, which keeps the step
                  text as readable content rather than a giant button label. */}
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

      {/* The current step in full. A native <dialog>, so Escape, focus trapping
          and the backdrop come free. No close button — the whole surface
          dismisses. Key and touch events stop here so the carousel behind
          doesn't walk along with them. */}
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
