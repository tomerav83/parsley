import { useEffect, useRef } from "react";
import { splitQuantity } from "@/features/recipe/ingredients";
import styles from "./IngredientList.module.css";

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
      // Off-screen guard: inactive section is aria-hidden, off-route screen is
      // `inert` (no aria-hidden attribute) — check both (see StepReel).
      if (!el || el.closest("[inert], [aria-hidden='true']")) return;
      // The scroll region is a CSS-Modules class, so target the stable data hook
      // the carousel sets rather than the (hashed) class name.
      const scroller = el.closest("[data-scroll-region]") as HTMLElement | null;
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
    <ul ref={ref} className={styles.list}>
      {ingredients.map((ingredient, index) => {
        const { qty, name } = splitQuantity(ingredient);
        const id = `ing-${index}`;
        return (
          <li key={index} className={qty ? undefined : styles.noqty}>
            <input type="checkbox" id={id} />
            {qty && <span className={styles.qty}>{qty}</span>}
            <label htmlFor={id} className={styles.name}>
              {name}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
