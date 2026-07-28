import {
  useNavigate,
  useRevalidator,
  useRouteError,
  useSearchParams,
} from "react-router";
import { ExtractError, extractRecipe } from "@/lib/api.ts";
import { cacheRecipe } from "@/lib/recipeCache.ts";
import { ErrorWindow } from "@/features/extract/ErrorWindow/ErrorWindow";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";
import styles from "./RecipeError.module.css";

/**
 * The recipe route's ErrorBoundary: when the loader fails, the leaf failure panel
 * takes the recipe's place. useRouteError is the only way to read a thrown loader
 * error, so this adapter exists to wire ErrorWindow up to the router.
 */
export function RecipeError() {
  const error = useRouteError();
  const url = useSearchParams()[0].get("url") ?? "";
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { setUrl, openPasteFor, backToSearch } = useAppOutlet();

  return (
    <div className={styles.screen}>
      <div className={styles.wrap}>
        <ErrorWindow
          error={
            error instanceof ExtractError
              ? error
              : new ExtractError("unknown", "Something went wrong.")
          }
          sourceUrl={url}
          terminal={false}
          onPaste={() => openPasteFor(url)}
          onEdit={() => (setUrl(url), navigate("/", { viewTransition: true }))}
          onRetry={() =>
            extractRecipe(url).then(
              (recipe) => (
                cacheRecipe(url, recipe),
                revalidator.revalidate(),
                "success"
              ),
              () => "error",
            )
          }
          onDismiss={backToSearch}
        />
      </div>
    </div>
  );
}
