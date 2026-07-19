import { useLayoutEffect, useRef } from "react";

// Shrink the visible step's text just enough to fit its fixed-height card, so a
// long step is never clipped and the pane never scrolls (the whole recipe lives
// in one window). Re-runs whenever the shown text or the card's size changes —
// including when a hidden mobile pane becomes visible (0 → real height fires the
// observer). Only the visible <li> carries this ref; the hidden ones measure 0.
export function useFitText(text: string, base: number) {
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
