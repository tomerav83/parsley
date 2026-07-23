"""Extract a normalized Recipe from a page's HTML."""

from lxml import html as lxml_html
from lxml.etree import ParserError
from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions

from app.models import AppError, ErrorCode, Recipe
from app.normalize import clean_lines, clean_text, safe


class RecipeNotFoundError(AppError):
    """The page has no usable schema.org/Recipe markup.

    `detail` shows a fixed friendly message; the internal str(exc) passed at the
    raise sites stays for logging/chaining, not the client.
    """

    code = ErrorCode.NO_RECIPE
    status = 422
    detail = "No recipe found on that page"


def _reduce_html(page_html: str) -> str | None:
    """Shrink a page to <head> + its JSON-LD scripts, or None if that can't help.

    recipe-scrapers builds a BeautifulSoup tree over the *whole* page with the
    slow pure-Python parser — seconds on the multi-MB pages real recipe sites
    ship (ads/comments/inline SVG). But the recipe comes from JSON-LD, which it
    reads straight from the string, and the soup is only used for <head>
    opengraph fallbacks. So for the common (JSON-LD) case, head + the ld+json
    scripts is all it needs — a ~50x smaller parse for identical output.

    Returns None when there's no JSON-LD (the recipe, if any, lives in body
    microdata that needs the full tree) or the page won't parse, so the caller
    falls back to the original HTML. lxml's C parser does this pass in ~tens of
    ms even on multi-MB input.
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
    """Parse a Recipe, trying a reduced (head + JSON-LD) page first for speed and
    falling back to the full HTML for sites whose recipe is in body microdata."""
    reduced = _reduce_html(page_html)
    if reduced is not None:
        try:
            return _scrape(reduced, url)
        except RecipeNotFoundError:
            pass  # JSON-LD present but not a recipe — let the full page have a go
    return _scrape(page_html, url)


def _scrape(page_html: str, url: str) -> Recipe:
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
