import type { Recipe } from "../api";
import { IngredientList } from "./IngredientList";
import { StepList } from "./StepList";
import { TimingRow } from "./TimingRow";
import { SectionCarousel, type CarouselSection } from "./SectionCarousel";

interface RecipeCardProps {
  recipe: Recipe;
}

function byline(recipe: Recipe): string {
  return [recipe.author, recipe.site_name].filter(Boolean).join(" — ");
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
      content: <StepList steps={recipe.steps} />,
    },
  ];

  return (
    <article className="recipe-card">
      {/* Title + timing pinned on top */}
      <p className="station-kicker">station · recipe</p>
      <h1 className="recipe-title">{recipe.name}</h1>
      {byline(recipe) && <p className="recipe-source">{byline(recipe)}</p>}

      <TimingRow recipe={recipe} />

      {recipe.image && (
        <img
          className="recipe-image"
          src={recipe.image}
          alt={recipe.name}
          loading="lazy"
        />
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
