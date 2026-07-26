import { useLoaderData } from "react-router";
import { RecipeCard } from "@/features/recipe/RecipeCard/RecipeCard";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import { BackButton } from "@/components/BackButton/BackButton";
import type { RecipeLoaderData } from "./recipeLoader.ts";
import styles from "./RecipeScreen.module.css";

/** Bare host of a URL, falling back to the raw string if it won't parse. */
function hostOf(url: string): string {
  return URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
}

/**
 * The recipe view: a fixed bar (back to search, source) over the card. recipeLoader
 * has already resolved the recipe, so there's no fetch or loading state here.
 */
export function RecipeScreen() {
  const { recipe } = useLoaderData<RecipeLoaderData>();
  const { backToSearch } = useAppOutlet();

  return (
    <div className={styles.recipeScreen}>
      <title>{recipe ? `${recipe.name} — Parsley` : "Parsley — recipe"}</title>
      <div className={styles.recipeBar}>
        <BackButton onClick={backToSearch} />
        {recipe && (
          <span className={styles.recipeSrc}>
            <span className={styles.recipeSrcDot} aria-hidden />
            {recipe.site_name ?? hostOf(recipe.source_url)}
          </span>
        )}
      </div>
      <div className={styles.recipeScroll}>
        {recipe && <RecipeCard recipe={recipe} />}
      </div>
    </div>
  );
}
