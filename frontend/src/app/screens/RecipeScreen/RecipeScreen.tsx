import { useLoaderData } from "react-router";
import { RecipeCard } from "@/features/recipe/RecipeCard/RecipeCard";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import { BackButton } from "@/components/BackButton/BackButton";
import type { RecipeLoaderData } from "./recipeLoader.ts";
import styles from "./RecipeScreen.module.css";

// Source label for the recipe bar: the site name if the backend gave one, else the
// bare host of the source URL (falls back to the raw string if it won't parse).
function hostOf(url: string): string {
  return URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
}

// The recipe view: a fixed top bar (back to search + source) over the card. The
// recipe is resolved by the route loader (recipeLoader) before this renders —
// cache-first, network only for a cold deep-link — so there's no in-component
// fetch or loading state. A Home submit caches then navigates, so the loader
// resolves synchronously and the card paints at once; only a cold hard-load
// deep-link waits on the network, showing the root's quiet-blank HydrateFallback
// until it resolves. A failed extract renders the route's ErrorBoundary
// (RecipeError) instead of this.
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
