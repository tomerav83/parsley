"""Extract a normalized Recipe from a page's HTML."""

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.models import Recipe
from app.normalize import clean_lines, clean_text, safe


class RecipeNotFoundError(Exception):
    """The page has no usable schema.org/Recipe markup."""


def extract_recipe(page_html: str, url: str) -> Recipe:
    try:
        scraper = scrape_html(page_html, org_url=url, supported_only=False)
    except RecipeScrapersExceptions as exc:
        raise RecipeNotFoundError(str(exc)) from exc

    ingredients = clean_lines(safe(scraper.ingredients) or [])
    steps = clean_lines(safe(scraper.instructions_list) or [])
    if not ingredients or not steps:
        raise RecipeNotFoundError("Recipe markup is missing ingredients or instructions")

    name = safe(scraper.title)
    author = safe(scraper.author)
    yields = safe(scraper.yields)

    return Recipe(
        name=clean_text(name) if name else "Untitled recipe",
        image=safe(scraper.image),
        author=clean_text(author) if author else None,
        ingredients=ingredients,
        steps=steps,
        prep_time_minutes=safe(scraper.prep_time),
        cook_time_minutes=safe(scraper.cook_time),
        total_time_minutes=safe(scraper.total_time),
        yields=clean_text(yields) if yields else None,
        source_url=url,
        site_name=safe(scraper.site_name),
    )
