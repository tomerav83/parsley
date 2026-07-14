import type { Recipe } from "@/lib/api";
import { RecipeCard } from "@/features/recipe/RecipeCard/RecipeCard";
import { RecipeSkeleton } from "@/features/recipe/RecipeSkeleton/RecipeSkeleton";
import styles from "./RecipeScreen.module.css";
import btn from "@/components/Button.module.css";

interface RecipeScreenProps {
  recipe: Recipe | null;
  loading: boolean;
  onBack: () => void;
}

// Source label for the recipe bar: the site name if the backend gave one, else the
// bare host of the source URL (falls back to the raw string if it won't parse).
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

// The recipe view: a fixed top bar (back to search + source) over a scroll frame
// that holds the card (or its skeleton while a request is in flight).
export function RecipeScreen({ recipe, loading, onBack }: RecipeScreenProps) {
  return (
    <>
      <div className={styles.recipeBar}>
        <button type="button" className={btn.back} onClick={onBack}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          NEW SEARCH
        </button>
        {recipe && (
          <span className={styles.recipeSrc}>
            <span className={styles.recipeSrcDot} aria-hidden />
            {recipe.site_name ?? hostOf(recipe.source_url)}
          </span>
        )}
      </div>
      <div className={styles.recipeScroll}>
        {loading ? (
          <RecipeSkeleton />
        ) : recipe ? (
          <RecipeCard recipe={recipe} />
        ) : null}
      </div>
    </>
  );
}
