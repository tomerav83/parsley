import type { Recipe } from "../api";
import { IngredientList } from "./IngredientList";
import { StepReel } from "./StepReel";
import { TimingRow } from "./TimingRow";
import { SectionCarousel, type CarouselSection } from "./SectionCarousel";

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

function byline(recipe: Recipe): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const value of [recipe.author, recipe.site_name]) {
    if (!value) continue;
    const key = canonical(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(value);
  }
  return parts.join(" — ");
}

// The image URL comes from scraped/pasted page markup, so treat it as untrusted:
// only render real http(s) images, never javascript:/data: or other schemes.
function safeImage(image: string | null): string | null {
  if (!image) return null;
  return /^https?:\/\//i.test(image) ? image : null;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const sections: CarouselSection[] = [
    {
      key: "ingredients",
      label: "Ingredients",
      badge: `${recipe.ingredients.length} items`,
      content: <IngredientList ingredients={recipe.ingredients} />,
    },
    {
      key: "method",
      label: "Method",
      badge: `${recipe.steps.length} steps`,
      content: <StepReel steps={recipe.steps} />,
    },
  ];

  const line = byline(recipe);
  const image = safeImage(recipe.image);

  return (
    <article className="recipe-card">
      {image ? (
        // Photo-behind-glass banner: title + timing sit over the image behind a
        // gradient scrim, reclaiming the height a stacked photo would cost.
        <header className="recipe-hero">
          <img
            className="recipe-hero-img"
            src={image}
            alt={recipe.name}
            loading="lazy"
          />
          <div className="recipe-hero-scrim" aria-hidden />
          <div className="recipe-hero-body">
            <p className="station-kicker on-hero">station · recipe</p>
            <h1 className="recipe-title on-hero">{recipe.name}</h1>
            {line && <p className="recipe-source on-hero">{line}</p>}
            <TimingRow recipe={recipe} variant="chips" />
          </div>
        </header>
      ) : (
        // No photo: fall back to the pinned title + specimen timing strip.
        <header className="recipe-head">
          <p className="station-kicker">station · recipe</p>
          <h1 className="recipe-title">{recipe.name}</h1>
          {line && <p className="recipe-source">{line}</p>}
          <TimingRow recipe={recipe} />
        </header>
      )}

      {/* Ingredients ⇄ Method carousel */}
      <SectionCarousel sections={sections} />

      <footer className="recipe-footer">
        <a href={recipe.source_url} target="_blank" rel="noreferrer noopener">
          VIEW ORIGINAL ↗
        </a>
      </footer>
    </article>
  );
}
