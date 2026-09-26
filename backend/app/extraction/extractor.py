"""Extract a normalized Recipe from a page's HTML."""

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.extraction.html_reducer import reduce_html
from app.models import AppError, ErrorCode, Recipe


class RecipeNotFoundError(AppError):
    """The page has no usable schema.org/Recipe markup.

    The client sees `detail`; the message passed at each raise site is for logs.
    """

    code = ErrorCode.NO_RECIPE
    status = 422
    detail = "No recipe found on that page"


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
    """Run recipe-scrapers over the HTML and validate what it gives back into a Recipe.

    Ingredients and steps are the two fields a recipe can't do without, so a page
    missing either counts as no recipe at all.
    """
    try:
        scraper = scrape_html(page_html, org_url=url, supported_only=False)
    except RecipeScrapersExceptions as exc:
        raise RecipeNotFoundError(str(exc)) from exc

    # Every field a getter raised on (recipe-scrapers raises for a missing field
    # rather than returning None) is simply absent from the dict.
    data = scraper.to_json()
    if not data.get("ingredients") or not data.get("instructions_list"):
        raise RecipeNotFoundError("Recipe markup is missing ingredients or instructions")

    return Recipe.model_validate({**data, "source_url": url})
