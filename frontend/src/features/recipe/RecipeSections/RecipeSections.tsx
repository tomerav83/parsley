import { useEffect, useState } from "react";
import { IngredientList } from "@/features/recipe/IngredientList/IngredientList";
import { MethodSteps } from "@/features/recipe/MethodSteps/MethodSteps";
import styles from "./RecipeSections.module.css";

interface RecipeSectionsProps {
  ingredients: string[];
  steps: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ingredients and Method in one window: a segment switch between them on mobile,
 * side-by-side columns on desktop. The active step lives here rather than in
 * MethodSteps so the Method segment can show which one you're on.
 */
export function RecipeSections({ ingredients, steps }: RecipeSectionsProps) {
  const [section, setSection] = useState<"ingredients" | "method">(
    "ingredients",
  );
  const [step, setStep] = useState(0);
  const stepCount = steps.length;

  // Back to the first step when the recipe changes.
  useEffect(() => setStep(0), [steps]);

  const current = Math.min(step, Math.max(0, stepCount - 1));

  return (
    <div className={styles.sections}>
      {/* Mobile only — both panes show on desktop, so it's hidden there.
          role="group" labels the control; fieldset, which the rule suggests
          instead, is for form fields rather than a view switch. */}
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div className={styles.seg} role="group" aria-label="Recipe section">
        <button
          type="button"
          className={styles.segBtn}
          aria-pressed={section === "ingredients"}
          onClick={() => setSection("ingredients")}
        >
          Ingredients
          <span className={styles.badge}>{ingredients.length}</span>
        </button>
        <button
          type="button"
          className={styles.segBtn}
          aria-pressed={section === "method"}
          onClick={() => setSection("method")}
        >
          Method
          <span className={styles.badge}>
            {pad(current + 1)} / {pad(stepCount)}
          </span>
        </button>
      </div>

      <div className={styles.panes} data-active={section}>
        <section className={`${styles.prep} ${styles.ingPane}`}>
          <p className={styles.slabel}>
            <span>Ingredients</span>
            <span>{ingredients.length} items</span>
          </p>
          <div className={styles.ingScroll}>
            <IngredientList ingredients={ingredients} />
          </div>
        </section>

        <section className={`${styles.prep} ${styles.methodPane}`}>
          {/* MethodSteps renders its own header (label + count + Prev/Next). */}
          <MethodSteps steps={steps} index={current} onIndex={setStep} />
        </section>
      </div>
    </div>
  );
}
