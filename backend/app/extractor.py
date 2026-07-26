"""Extract a normalized Recipe from a page's HTML."""

from lxml import html as lxml_html
from lxml.etree import ParserError
from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.models import AppError, ErrorCode, Recipe
from app.normalize import clean_lines, clean_text, safe


class RecipeNotFoundError(AppError):
    """The page has no usable schema.org/Recipe markup.

    The client sees `detail`; the message passed at each raise site is for logs.
    """

    code = ErrorCode.NO_RECIPE
    status = 422
    detail = "No recipe found on that page"


def _reduce_html(page_html: str) -> str | None:
    """Shrink a page to <head> plus its JSON-LD scripts, or None if that won't help.

    recipe-scrapers soups the whole page with the slow pure-Python parser, which
    takes seconds on the multi-MB pages real sites ship. It reads JSON-LD straight
    from the string and only needs the soup for <head> opengraph fallbacks, so for
    the common case this hands it a ~50x smaller parse for identical output.

    None means no JSON-LD (the recipe, if there is one, is body microdata that
    needs the full tree) or the page wouldn't parse — either way the caller retries
    with the original HTML. lxml's C parser runs this in tens of milliseconds.
    """
    try:
        root = lxml_html.fromstring(page_html)
    except (ValueError, ParserError):
        return None
    scripts = [
        lxml_html.tostring(s, encoding=str)
        for s in root.iter("script")
        if (s.get("type") or "").strip().lower() == "application/ld+json"
    ]
    if not scripts:
        return None
    head = root.find("head")
    head_html = lxml_html.tostring(head, encoding=str) if head is not None else ""
    return f"<html>{head_html}{''.join(scripts)}</html>"


def extract_recipe(page_html: str, url: str) -> Recipe:
    """Parse a Recipe out of a page.

    Tries the reduced page first for speed, then the full HTML for sites whose
    recipe lives in body microdata.
    """
    reduced = _reduce_html(page_html)
    if reduced is not None:
        try:
            return _scrape(reduced, url)
        except RecipeNotFoundError:
            pass  # JSON-LD present but not a recipe — let the full page have a go
    return _scrape(page_html, url)


def _scrape(page_html: str, url: str) -> Recipe:
    """Run recipe-scrapers over the HTML and clean up what it gives back.

    Ingredients and steps are the two fields a recipe can't do without, so a page
    missing either counts as no recipe at all.
    """
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
