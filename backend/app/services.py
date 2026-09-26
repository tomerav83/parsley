"""The service layer the routes call.

ExtractionService orchestrates fetch → extract so both endpoints run the same code
path and the handlers stay thin. Its collaborators are constructor arguments, so
tests inject fakes instead of reaching the network.
"""

from collections.abc import Awaitable, Callable

from anyio import to_thread

from app.extraction.extractor import extract_recipe
from app.fetch import fetch_page
from app.models import Recipe

# FetchPage: URL → HTML. Extractor: HTML + its source URL → Recipe.
FetchPage = Callable[[str], Awaitable[str]]
Extractor = Callable[[str, str], Recipe]


class ExtractionService:
    """Turns a URL or a page of HTML into a Recipe."""

    def __init__(
        self,
        fetch: FetchPage = fetch_page,
        extract: Extractor = extract_recipe,
    ) -> None:
        self._fetch = fetch
        self._extract = extract

    async def from_url(self, url: str) -> Recipe:
        """Fetch the page, then extract.

        Extraction is CPU-bound pure Python, so it runs in a thread — parsing a big
        page on the event loop would stall every other request.
        """
        html = await self._fetch(url)
        return await to_thread.run_sync(self._extract, html, url)

    async def from_html(self, html: str, url: str) -> Recipe:
        """Extract from HTML the client pasted in. Threaded for the same reason."""
        return await to_thread.run_sync(self._extract, html, url)
