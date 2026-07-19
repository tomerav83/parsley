import type { Recipe } from "@/lib/api";
import { TimingRow } from "@/features/recipe/TimingRow/TimingRow";
import { RecipeSections } from "@/features/recipe/RecipeSections/RecipeSections";
import styles from "./RecipeCard.module.css";

interface RecipeCardProps {
  recipe: Recipe;
}

// Collapse "Dine & Dish", "Dine and Dish", "dine  dish" to one canonical form so
// author and site_name that are really the same name get deduped, not printed twice.
function canonical(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function byline({ author, site_name }: Recipe): string {
  if (author && site_name && canonical(author) === canonical(site_name))
    return author;
  return [author, site_name].filter(Boolean).join(" — ");
}

// The image URL comes from scraped/pasted page markup, so treat it as untrusted:
// only render real http(s) images, never javascript:/data: or other schemes.
function safeImage(image: string | null): string | null {
  if (!image) return null;
  return /^https?:\/\//i.test(image) ? image : null;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const line = byline(recipe);
  const image = safeImage(recipe.image);

  return (
    <article className={styles.card}>
      {image ? (
        // Photo-behind-glass banner: title + timing sit over the image behind a
        // gradient scrim, reclaiming the height a stacked photo would cost.
        <header className={styles.hero}>
          <img
            className={styles.heroImg}
            src={image}
            alt={recipe.name}
            fetchPriority="high"
          />
          <div className={styles.heroScrim} aria-hidden />
          <div className={styles.heroBody}>
            <p className={`${styles.stationKicker} ${styles.onHero}`}>
              station · recipe
            </p>
            <h1
              className={`${styles.title} ${styles.onHero}`}
              data-route-heading
              tabIndex={-1}
            >
              {recipe.name}
            </h1>
            {line && (
              <p className={`${styles.source} ${styles.onHero}`}>{line}</p>
            )}
            <TimingRow recipe={recipe} variant="chips" />
          </div>
        </header>
      ) : (
        // No photo: fall back to the pinned title + specimen timing strip.
        <header className={styles.head}>
          <p className={styles.stationKicker}>station · recipe</p>
          <h1 className={styles.title} data-route-heading tabIndex={-1}>
            {recipe.name}
          </h1>
          {line && <p className={styles.source}>{line}</p>}
          <TimingRow recipe={recipe} />
        </header>
      )}

      {/* Ingredients + Method, one window (mobile: segment switch; desktop: columns) */}
      <RecipeSections ingredients={recipe.ingredients} steps={recipe.steps} />

      <footer className={styles.footer}>
        <a href={recipe.source_url} target="_blank" rel="noreferrer noopener">
          VIEW ORIGINAL ↗
        </a>
      </footer>
    </article>
  );
}
