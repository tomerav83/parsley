"""Extract a normalized Recipe from a page's HTML."""

import html
import re
from collections.abc import Callable

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.extraction.html_reducer import reduce_html
from app.models import Recipe, RecipeNotFoundError

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


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
    """Run recipe-scrapers over the HTML and clean what it gives back into a Recipe.

    Only the getters the Recipe needs run (to_json() would run all ~25, twice on
    the full-page fallback). Recipe itself raises RecipeNotFoundError when
    ingredients or steps come out empty.
    """
    try:
        scraper = scrape_html(page_html, org_url=url, supported_only=False)
    except RecipeScrapersExceptions as exc:
        raise RecipeNotFoundError(str(exc)) from exc

    return Recipe.model_validate(
        {
            "name": _clean_text(_safe(scraper.title)) or "Untitled recipe",
            "image": _safe(scraper.image),
            "author": _clean_text(_safe(scraper.author)),
            "ingredients": _clean_lines(_safe(scraper.ingredients)),
            "steps": _clean_lines(_safe(scraper.instructions_list)),
            "prep_time_minutes": _safe(scraper.prep_time),
            "cook_time_minutes": _safe(scraper.cook_time),
            "total_time_minutes": _safe(scraper.total_time),
            "yields": _clean_text(_safe(scraper.yields)),
            "source_url": url,
            "site_name": _safe(scraper.site_name),
        }
    )


def _safe[T](getter: Callable[[], T]) -> T | None:
    """Call a scraper getter, returning None when the site omits the field.

    recipe-scrapers raises rather than returning None for a missing field, and
    every field but ingredients and steps is optional to us.
    """
    try:
        return getter()
    except Exception:
        return None


def _clean_text(value: str | None) -> str | None:
    """Strip HTML tags, unescape entities and collapse whitespace.

    recipe-scrapers normalises ingredients and steps this way itself, but not
    author or yields, and site-specific scrapers return whatever they return.
    """
    if not value:
        return None
    text = html.unescape(_TAG_RE.sub(" ", value))
    return _WS_RE.sub(" ", text).strip() or None


def _clean_lines(values: list[str] | None) -> list[str]:
    """Clean each line and drop the empties."""
    return [line for line in map(_clean_text, values or []) if line]
