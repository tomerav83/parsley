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

const pad = (n: number) => String(n).padStart(2, "0");

// Horizontal carousel for the recipe sections (Ingredients ⇄ Method). Motion is
// LTR/RTL only. Driven by the segmented switch or a swipe; the viewport height
// animates to the active slide so the card doesn't jump between sections of
// different length. Non-active slides are aria-hidden and kept out of tab order.
export function SectionCarousel({ sections }: SectionCarouselProps) {
  const [index, setIndex] = useState(0);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const touchX = useRef<number | null>(null);

  const count = sections.length;

  // Size the viewport to the active slide so the card animates between sections
  // of different length instead of jumping.
  const measure = useCallback(() => {
    const el = slideRefs.current[index];
    if (el) setHeight(el.offsetHeight);
  }, [index]);

  useLayoutEffect(() => {
    measure();
  }, [measure, sections]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  return (
    <div className="carousel">
      <div className="segbar" role="tablist" aria-label="Recipe sections">
        {sections.map((s, i) => (
          <button
            key={s.key}
            role="tab"
            type="button"
            aria-selected={i === index}
            className="seg"
            onClick={() => go(i)}
          >
            <b>{pad(i + 1)}</b> · {s.label}
          </button>
        ))}
      </div>

      <div
        className="viewport"
        style={{ height }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="track"
          style={{
            width: `${count * 100}%`,
            transform: `translateX(-${(index * 100) / count}%)`,
          }}
        >
          {sections.map((s, i) => (
            <div
              key={s.key}
              className="slide"
              style={{ width: `${100 / count}%` }}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              role="tabpanel"
              aria-hidden={i !== index}
            >
              <p className="slabel">
                <span>{s.label}</span>
                <span>{s.badge}</span>
              </p>
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
