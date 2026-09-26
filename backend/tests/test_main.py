"""The HTTP surface. The service is swapped through app.dependency_overrides, the
framework's seam for it: an autospecced mock where the test is about routing and
error rendering, the real service over fixture HTML where it's about the whole
path. No network either way."""

from collections.abc import Callable, Iterator
from unittest.mock import AsyncMock, create_autospec

import pytest
from fastapi.testclient import TestClient

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError, SiteBlockedError
from app.main import app, get_extraction_service
from app.models import MAX_HTML_CHARS, AppError, RecipeNotFoundError
from app.rate_limit import limiter
from app.services import ExtractionService
from tests.support.pages import RECIPE, URL, read_fixture

LEMON_CAKE = "toplevel_string_instructions/page.html"


@pytest.fixture(autouse=True)
def clean_app_state() -> Iterator[None]:
    """Fresh rate-limit counters and no leftover dependency overrides."""
    limiter.reset()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def service() -> AsyncMock:
    mock_service = create_autospec(ExtractionService, instance=True)
    mock_service.from_url.return_value = RECIPE
    mock_service.from_html.return_value = RECIPE
    app.dependency_overrides[get_extraction_service] = lambda: mock_service
    return mock_service


@pytest.fixture
def fetched_page() -> Callable[[str], AsyncMock]:
    """Serve a fixture page as the fetched HTML, keeping the real extractor."""

    def serve(fixture: str) -> AsyncMock:
        fetch = AsyncMock(return_value=read_fixture(fixture))
        app.dependency_overrides[get_extraction_service] = lambda: ExtractionService(fetch=fetch)
        return fetch

    return serve


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


class TestExtract:
    def test_returns_the_recipe(
        self, client: TestClient, fetched_page: Callable[[str], AsyncMock]
    ) -> None:
        fetch = fetched_page(LEMON_CAKE)

        response = client.post("/api/extract", json={"url": URL})

        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "Grandma's Lemon Cake"
        assert len(body["ingredients"]) == 4
        assert body["total_time_minutes"] == 60
        fetch.assert_awaited_once_with(URL)

    def test_page_without_a_recipe_is_422(
        self, client: TestClient, fetched_page: Callable[[str], AsyncMock]
    ) -> None:
        fetched_page("no_recipe.html")

        response = client.post("/api/extract", json={"url": URL})

        assert response.status_code == 422
        assert response.json() == {"code": "no_recipe", "message": "No recipe found on that page"}

    @pytest.mark.parametrize("payload", [{"url": "not-a-url"}, {"url": "ftp://example.com/r"}, {}])
    def test_bad_request_body_is_rejected_before_the_service(
        self, payload: dict[str, str], client: TestClient, service: AsyncMock
    ) -> None:
        response = client.post("/api/extract", json=payload)

        assert response.status_code == 422
        service.from_url.assert_not_awaited()


class TestExtractHtml:
    def test_returns_the_recipe_without_fetching(self, client: TestClient) -> None:
        response = client.post(
            "/api/extract-html", json={"html": read_fixture(LEMON_CAKE), "url": URL}
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Grandma's Lemon Cake"
        assert response.json()["source_url"] == URL

    def test_page_without_a_recipe_is_422(self, client: TestClient) -> None:
        response = client.post(
            "/api/extract-html", json={"html": read_fixture("no_recipe.html"), "url": URL}
        )

        assert response.status_code == 422
        assert response.json()["code"] == "no_recipe"

    def test_oversized_html_is_rejected_before_the_service(
        self, client: TestClient, service: AsyncMock
    ) -> None:
        response = client.post(
            "/api/extract-html", json={"html": "x" * (MAX_HTML_CHARS + 1), "url": URL}
        )

        assert response.status_code == 422
        service.from_html.assert_not_awaited()


class TestErrorRendering:
    @pytest.mark.parametrize(
        ("error", "status", "body"),
        [
            (
                InvalidUrlError("Only http and https URLs are supported"),
                400,
                {"code": "invalid_url", "message": "Only http and https URLs are supported"},
            ),
            (
                BlockedUrlError("Host 'x' resolves to a non-public address"),
                400,
                {"code": "blocked_url", "message": "Host 'x' resolves to a non-public address"},
            ),
            (
                SiteBlockedError("Site refused the request (HTTP 403)"),
                502,
                {"code": "site_blocked", "message": "Site refused the request (HTTP 403)"},
            ),
            (
                FetchError("Page took too long to fetch"),
                502,
                {"code": "fetch_failed", "message": "Page took too long to fetch"},
            ),
            (
                RecipeNotFoundError("internal: NoSchemaFoundInWildMode"),
                422,
                {"code": "no_recipe", "message": "No recipe found on that page"},
            ),
            (AppError("boom"), 500, {"code": "error", "message": "boom"}),
        ],
    )
    def test_app_errors_render_as_error_responses(
        self,
        error: AppError,
        status: int,
        body: dict[str, str],
        client: TestClient,
        service: AsyncMock,
    ) -> None:
        service.from_url.side_effect = error

        response = client.post("/api/extract", json={"url": URL})

        assert response.status_code == status
        assert response.json() == body


class TestRateLimit:
    @pytest.mark.parametrize(
        ("path", "payload"),
        [("/api/extract", {"url": URL}), ("/api/extract-html", {"html": "<p></p>", "url": URL})],
    )
    @pytest.mark.usefixtures("service")
    def test_eleventh_request_in_a_minute_is_429(
        self, path: str, payload: dict[str, str], client: TestClient
    ) -> None:
        statuses = [client.post(path, json=payload).status_code for _ in range(11)]

        assert statuses == [200] * 10 + [429]

    @pytest.mark.usefixtures("service")
    def test_buckets_are_per_forwarded_client_ip(self, client: TestClient) -> None:
        """Behind the Vercel proxy the direct peer is the proxy itself, so one
        busy user must not 429 everyone else."""
        alice = {"x-forwarded-for": "203.0.113.1"}
        bob = {"x-forwarded-for": "203.0.113.2"}

        for _ in range(10):
            assert client.post("/api/extract", json={"url": URL}, headers=alice).status_code == 200
        assert client.post("/api/extract", json={"url": URL}, headers=alice).status_code == 429
        assert client.post("/api/extract", json={"url": URL}, headers=bob).status_code == 200
