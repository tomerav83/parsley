import cardStyles from "./RecipeCard.module.css";
import styles from "./RecipeSkeleton.module.css";

// Shimmer placeholder shown while an extraction is in flight. Mirrors the recipe
// card's layout (hero banner, section body) so nothing jumps when the real
// content lands. Decorative only — hidden from assistive tech.
export function RecipeSkeleton() {
  return (
    <div className={cardStyles.card} aria-hidden>
      <div className={`${styles.sk} ${styles.hero}`} />
      <div className={`${styles.sk} ${styles.seg}`} />
      <div className={styles.lines}>
        {[82, 64, 90, 71, 58, 78].map((w, i) => (
          <div
            key={i}
            className={`${styles.sk} ${styles.line}`}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </div>
  );
}
