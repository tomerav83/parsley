import { splitQuantity } from "@/features/recipe/ingredients";
import styles from "./IngredientList.module.css";

interface IngredientListProps {
  ingredients: string[];
}

// A checklist so a cook can tick items off while shopping or cooking. Each line's
// leading measurement is split into a tight mono column (the "mise en place"
// quantity signature). State is local and not persisted — resets on reload.
export function IngredientList({ ingredients }: IngredientListProps) {
  return (
    <ul className={styles.list}>
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
