"""ExtractionService with both collaborators injected as mocks, so no network
and no real scraper."""

import threading
from unittest.mock import AsyncMock, Mock

import pytest

from app.fetching.errors import FetchError
from app.models import Recipe, RecipeNotFoundError
from app.services import ExtractionService
from tests.support.pages import RECIPE, URL


@pytest.fixture
def fetch() -> AsyncMock:
    return AsyncMock(return_value="<html>page</html>")


@pytest.fixture
def extract() -> Mock:
    """Returns RECIPE and records, as `.thread`, the thread it was called on."""

    def _extract(html: str, url: str) -> Recipe:
        extract.thread = threading.current_thread()
        return RECIPE

    extract = Mock(side_effect=_extract)
    return extract


@pytest.fixture
def service(fetch: AsyncMock, extract: Mock) -> ExtractionService:
    return ExtractionService(fetch=fetch, extract=extract)


class TestFromUrl:
    async def test_fetches_then_extracts(
        self, service: ExtractionService, fetch: AsyncMock, extract: Mock
    ) -> None:
        assert await service.from_url(URL) is RECIPE

        fetch.assert_awaited_once_with(URL)
        extract.assert_called_once_with("<html>page</html>", URL)

    async def test_extracts_off_the_event_loop(
        self, service: ExtractionService, extract: Mock
    ) -> None:
        """Parsing is CPU-bound; on the loop thread it would stall every request."""
        await service.from_url(URL)

        assert extract.thread is not threading.current_thread()

    async def test_fetch_failure_skips_extraction(
        self, service: ExtractionService, fetch: AsyncMock, extract: Mock
    ) -> None:
        fetch.side_effect = FetchError("Could not fetch page")

        with pytest.raises(FetchError):
            await service.from_url(URL)
        extract.assert_not_called()

    async def test_extraction_failure_propagates(
        self, service: ExtractionService, extract: Mock
    ) -> None:
        extract.side_effect = RecipeNotFoundError("no JSON-LD")

        with pytest.raises(RecipeNotFoundError):
            await service.from_url(URL)


class TestFromHtml:
    async def test_extracts_without_fetching(
        self, service: ExtractionService, fetch: AsyncMock, extract: Mock
    ) -> None:
        assert await service.from_html("<html>pasted</html>", URL) is RECIPE

        extract.assert_called_once_with("<html>pasted</html>", URL)
        fetch.assert_not_awaited()

    async def test_extracts_off_the_event_loop(
        self, service: ExtractionService, extract: Mock
    ) -> None:
        await service.from_html("<html></html>", URL)

        assert extract.thread is not threading.current_thread()


def test_defaults_to_the_real_fetcher_and_extractor() -> None:
    from app.extraction.extractor import extract_recipe
    from app.fetching.fetcher import fetch_page

    service = ExtractionService()

    assert (service._fetch, service._extract) == (fetch_page, extract_recipe)
