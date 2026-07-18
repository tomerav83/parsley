import { useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router";
import { RecipeCard } from "@/features/recipe/RecipeCard/RecipeCard";
import { RecipeSkeleton } from "@/features/recipe/RecipeSkeleton/RecipeSkeleton";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import { readCachedRecipe } from "@/lib/recipeCache.ts";
import styles from "./RecipeScreen.module.css";
import btn from "@/components/Button.module.css";

// Source label for the recipe bar: the site name if the backend gave one, else the
// bare host of the source URL (falls back to the raw string if it won't parse).
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The recipe view: a fixed top bar (back to search + source) over a frame that
// holds the card (or its skeleton while a request is in flight). Also the
// deep-link entry point — /recipe?url=… on a hard load extracts that URL in place.
export function RecipeScreen() {
  const { extract, requestRecipe, backToSearch } = useAppOutlet();
  const [params] = useSearchParams();
  const target = params.get("url") ?? "";
  const { recipe, loading, restore } = extract;

  // Load the recipe for the URL in the query when it isn't the one already on
  // screen. On the normal flow the recipe is loaded before we navigate here, so
  // this is a no-op; it only fires for a hard load / back-forward to a
  // /recipe?url=… we don't yet hold. Prefer the sessionStorage cache — an instant,
  // API-free restore that also revives a paste-sourced recipe (whose URL can't be
  // re-fetched); only truly-uncached targets hit the network. Runs in a layout
  // effect so a cache restore paints the card in the first frame, with no blank
  // flash. The one-shot `requestedFor` guard means we act on a given target at
  // most once, so a backend that canonicalises the URL (redirect, trailing slash)
  // — making source_url differ from what we asked for — can't spin us into a loop.
  // requestRecipe and restore are stable (useCallback).
  const requestedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!target) return;
    if (recipe?.source_url === target) return; // already have it
    if (requestedFor.current === target) return; // already acted on it
    requestedFor.current = target;
    const cached = readCachedRecipe(target);
    if (cached) restore(cached);
    else requestRecipe(target);
  }, [target, recipe, requestRecipe, restore]);

  return (
    <div className={styles.recipeScreen}>
      <title>{recipe ? `${recipe.name} — Parsley` : "Parsley — recipe"}</title>
      <div className={styles.recipeBar}>
        <button type="button" className={btn.back} onClick={backToSearch}>
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
    </div>
  );
}
