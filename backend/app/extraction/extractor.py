"""Extract a normalized Recipe from a page's HTML."""

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.extraction.html_reducer import reduce_html
from app.models import Recipe, RecipeNotFoundError


def extract_recipe(page_html: str, url: str) -> Recipe:
    """Parse a Recipe out of a page.

    Tries the reduced page first for speed, then the full HTML for sites whose
    recipe lives in body microdata.
    """
    reduced = reduce_html(page_html)
    if reduced is not None:
        try:
            return _scrape(reduced, url)
        except RecipeNotFoundError:
            pass  # JSON-LD present but not a recipe — let the full page have a go
    return _scrape(page_html, url)


def _scrape(page_html: str, url: str) -> Recipe:
    """Run recipe-scrapers over the HTML and validate the scraper into a Recipe.

    Recipe calls only the getters it needs (to_json() would run all ~25, twice on
    the full-page fallback) and raises RecipeNotFoundError when ingredients or
    steps come out empty.
    """
    try:
        scraper = scrape_html(page_html, org_url=url, supported_only=False)
    except RecipeScrapersExceptions as exc:
        raise RecipeNotFoundError(str(exc)) from exc

    return Recipe.model_validate(scraper)
