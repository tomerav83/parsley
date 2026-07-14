import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";

export interface CarouselSection {
  key: string;
  label: string;
  badge: string; // e.g. "6 items"
  content: ReactNode;
}

interface SectionCarouselProps {
  sections: CarouselSection[];
}

// Scrollable list area for a card. The scrollbar is hidden (it would clash with
// the framed card), so scrollability is signalled instead by fading the content
// out at whichever edge has more beyond it: a bottom fade means "more below", a
// top fade means "you've scrolled". Both vanish at the boundaries, so the fade
// itself tells you where the list starts and ends. The fade lengths are CSS
// custom props toggled via data-* here; App.css animates them.
function CardBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((prev) =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
    );
  }, []);

  // Recompute when the list first lays out and whenever its size changes (window
  // resize, section swap changing available height, fonts loading).
  useLayoutEffect(() => update(), [update, children]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  return (
    <div
      ref={ref}
      className="cf-body"
      data-fade-top={edges.top}
      data-fade-bottom={edges.bottom}
      onScroll={update}
    >
      {children}
    </div>
  );
}

// Coverflow carousel for the recipe sections (Ingredients ⇄ Method). The active
// section faces the reader head-on; the adjacent section recedes at an angle and
// peeks from the side — signalling there's another section without arrows or
// dots. Switch by swipe, ← / → keys, or by tapping the peeking card. The card
// fills the height of the recipe frame; when a section is longer than that, its
// list (.cf-body) scrolls internally so the hero and the page stay put.
// Non-active panels are aria-hidden.
export function SectionCarousel({ sections }: SectionCarouselProps) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const count = sections.length;

  const go = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  // Left/Right arrows switch sections from anywhere on the page — no need to
  // focus the carousel first. Ignore it while the user is typing in a field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      // Bail when the carousel is off-screen (its screen is `inert`, or it sits
      // in an aria-hidden subtree) so it doesn't eat arrow keys on Home while a
      // recipe stays mounted behind it.
      if (rootRef.current?.closest("[inert], [aria-hidden='true']")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIndex((i) => Math.min(count - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const end = e.changedTouches[0];
    if (touchX.current === null || !end) return;
    const dx = end.clientX - touchX.current;
    if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <div className="carousel" ref={rootRef}>
      {/* Explicit switcher. The coverflow's peeking card is the affordance on
          wide screens, but it's flattened away on narrow ones (App.css), so this
          segmented control is what switches sections there. Hidden on desktop. */}
      <div className="cf-tabs" role="tablist" aria-label="Recipe sections">
        {sections.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            className="cf-tab"
            aria-selected={i === index}
            onClick={() => go(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        className="viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="group"
        aria-label="Recipe sections — use arrow keys to switch"
      >
        <div className="stage">
          {sections.map((s, i) => {
            const active = i === index;
            // The inactive section sits on the side it lives on relative to the
            // active one, so the peek points toward where it'll come from.
            const pos = active ? "is-active" : i < index ? "peek-l" : "peek-r";
            return (
              <div
                key={s.key}
                className={`cf-panel ${pos}`}
                role="tabpanel"
                aria-hidden={!active}
                onClick={active ? undefined : () => go(i)}
              >
                <div className="cf-card">
                  <p className="slabel">
                    <span>{s.label}</span>
                    <span>{s.badge}</span>
                  </p>
                  <CardBody>{s.content}</CardBody>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
