"""ExtractionService unit tests — the service is testable without network or a
real scraper because both collaborators are injected."""

from app.models import Recipe
from app.services import ExtractionService

RECIPE = Recipe(name="X", ingredients=["a"], steps=["b"], source_url="u")


async def test_from_url_fetches_then_extracts() -> None:
    calls: dict[str, object] = {}

    async def fake_fetch(url: str) -> str:
        calls["fetched"] = url
        return "<html>page</html>"

    def fake_extract(html: str, url: str) -> Recipe:
        calls["extracted"] = (html, url)
        return RECIPE

    service = ExtractionService(fetch=fake_fetch, extract=fake_extract)

    assert await service.from_url("https://x.com/r") is RECIPE
    assert calls["fetched"] == "https://x.com/r"
    assert calls["extracted"] == ("<html>page</html>", "https://x.com/r")


async def test_from_html_extracts_without_fetching() -> None:
    fetched = False

    async def fake_fetch(url: str) -> str:
        nonlocal fetched
        fetched = True
        return ""

    service = ExtractionService(fetch=fake_fetch, extract=lambda html, url: RECIPE)

    assert await service.from_html("<html>pasted</html>", "https://x.com/r") is RECIPE
    assert fetched is False
