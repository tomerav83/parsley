"""Cut a recipe page down to the part recipe-scrapers actually reads."""

from lxml import html as lxml_html
from lxml.etree import ParserError
from lxml.html import HtmlElement


def reduce_html(page_html: str) -> str | None:
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
    # The exact match extruct (recipe-scrapers' JSON-LD reader) uses — a script it
    # wouldn't read is no use to keep.
    if not root.xpath('boolean(//script[@type="application/ld+json"])'):
        return None

    # The head is kept whole, so only JSON-LD from outside it is added.
    body_scripts = root.xpath('//script[@type="application/ld+json"][not(ancestor::head)]')
    return _build_reduced_page(root.find("head"), body_scripts)


def _build_reduced_page(head: HtmlElement | None, scripts: list[HtmlElement]) -> str:
    """A new <html> holding the head and the given scripts.

    The elements are moved, not copied — the page they came from loses them.
    """
    reduced = lxml_html.Element("html")
    if head is not None:
        reduced.append(head)

    for script in scripts:
        script.tail = None  # or the text between </script> and the next tag comes along
        reduced.append(script)

    return lxml_html.tostring(reduced, encoding=str)
