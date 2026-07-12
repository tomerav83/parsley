import { useEffect, useRef } from "react";
import { splitQuantity } from "../ingredients";

interface IngredientListProps {
  ingredients: string[];
}

// A checklist so a cook can tick items off while shopping or cooking. Each line's
// leading measurement is split into a tight mono column (the "mise en place"
// quantity signature). State is local and not persisted — resets on reload.
export function IngredientList({ ingredients }: IngredientListProps) {
  const ref = useRef<HTMLUListElement>(null);

  // ↑/↓ scroll the list from anywhere on the page — no need to focus/click it
  // first (matching the Method reel). Gated on visibility so it only fires while
  // Ingredients is the active section, and ignored while typing in the URL field.
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
      const el = ref.current;
      if (!el || el.closest("[aria-hidden='true']")) return;
      const scroller = el.closest(".cf-body") as HTMLElement | null;
      if (!scroller) return;
      e.preventDefault();
      scroller.scrollBy({
        top: e.key === "ArrowDown" ? 90 : -90,
        behavior: "smooth",
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ul ref={ref} className="ilist">
      {ingredients.map((ingredient, index) => {
        const { qty, name } = splitQuantity(ingredient);
        const id = `ing-${index}`;
        return (
          <li key={index} className={qty ? undefined : "ilist-noqty"}>
            <input type="checkbox" id={id} />
            {qty && <span className="ilist-qty">{qty}</span>}
            <label htmlFor={id} className="ilist-name">
              {name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
