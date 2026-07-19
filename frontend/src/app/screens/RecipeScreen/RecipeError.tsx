import {
  useNavigate,
  useRevalidator,
  useRouteError,
  useSearchParams,
} from "react-router";
import { ExtractError, extractRecipe } from "@/lib/api.ts";
import { cacheRecipe } from "@/lib/recipeCache.ts";
import { FloatingError } from "@/features/extract/FloatingError/FloatingError";
import { useAppOutlet } from "@/app/router/useAppOutlet.ts";

// Recipe route ErrorBoundary — a loader failure shows the Home sad-parsley in
// place. useRouteError is the only way to read a thrown loader error, so this thin
// adapter just wires FloatingError to the router (retry re-fetches, then revalidates).
export function RecipeError() {
  const error = useRouteError();
  const url = useSearchParams()[0].get("url") ?? "";
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { setUrl, openPasteFor, backToSearch } = useAppOutlet();

  return (
    <FloatingError
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
  );
}
