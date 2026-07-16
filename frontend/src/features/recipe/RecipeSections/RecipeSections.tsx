import { useEffect, useState } from "react";
import { IngredientList } from "@/features/recipe/IngredientList/IngredientList";
import { MethodSteps } from "@/features/recipe/MethodSteps/MethodSteps";
import styles from "./RecipeSections.module.css";

interface RecipeSectionsProps {
  ingredients: string[];
  steps: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

// Ingredients + Method in one window. On mobile a segment switch shows one at a
// time (the Method segment carries the current step number); on desktop both sit
// side by side as columns with no switch. Either way the Method is one step at a
// time, walked by ←/→ or the visible buttons (MethodSteps). The active step lives
// here so the segment can label it.
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
      {/* Mobile-only section switch. On desktop both panes show, so it's hidden. */}
      {/* role="group" labels the segmented control for AT; fieldset (the rule's
          suggestion) is for form field sets, not a view switch. */}
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
          <p className={styles.slabel}>
            <span>Method</span>
            <span>
              step {pad(current + 1)} of {pad(stepCount)}
            </span>
          </p>
          <MethodSteps steps={steps} index={current} onIndex={setStep} />
        </section>
      </div>
    </div>
  );
}
