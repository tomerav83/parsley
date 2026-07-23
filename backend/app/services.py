"""Application service layer.

`ExtractionService` is the one seam the routes call: it orchestrates fetch →
extract so the route handlers stay thin (parse the request, return the service's
result) and both endpoints share exactly one code path. Its two collaborators are
injected as plain callables with real defaults, so:

  - it's unit-testable without network or a real scraper (inject fakes),
  - either the fetcher or the extraction engine can be swapped without touching a
    route (e.g. adding a JSON-LD/LLM extractor, or a proxy fetcher), and
  - Phase 2 (a saved recipe box + auth, per PLAN.md) has an obvious home: a
    `RecipeRepository`/auth dependency becomes another constructor arg here, not
    new orchestration inlined into the handlers.
"""

from collections.abc import Awaitable, Callable

from anyio import to_thread

from app.extractor import extract_recipe
from app.fetch import fetch_page
from app.models import Recipe

# Fetch a URL's HTML. Extractor: turn HTML + its source URL into a Recipe.
FetchPage = Callable[[str], Awaitable[str]]
Extractor = Callable[[str, str], Recipe]


class ExtractionService:
    def __init__(
        self,
        fetch: FetchPage = fetch_page,
        extract: Extractor = extract_recipe,
    ) -> None:
        self._fetch = fetch
        self._extract = extract

    async def from_url(self, url: str) -> Recipe:
        """Fetch the page, then extract. The fetch is async I/O; the extract is
        CPU-bound pure-Python, so it's offloaded to a thread — otherwise a big page
        parse would block the event loop and stall every other request."""
        html = await self._fetch(url)
        return await to_thread.run_sync(self._extract, html, url)

    async def from_html(self, html: str, url: str) -> Recipe:
        """Extract from HTML the client already has (the paste fallback) — no
        fetch. Offloaded for the same reason as from_url."""
        return await to_thread.run_sync(self._extract, html, url)
