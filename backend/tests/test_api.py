"""API route tests. The page fetcher is swapped via FastAPI dependency_overrides
(the framework's intended seam for stubbing external services) — no network."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.fetch import FetchError, SiteBlockedError
from app.main import app, get_extraction_service
from app.rate_limit import limiter
from app.services import ExtractionService

FIXTURES = Path(__file__).parent / "fixtures"
URL = "https://example.com/recipe"

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_app_state() -> Iterator[None]:
    """Reset rate-limit counters and dependency overrides between tests."""
    limiter.reset()
    yield
    app.dependency_overrides.clear()


def override_fetch(*, html: str | None = None, error: Exception | None = None) -> None:
    """Swap the service's fetcher for a stub (fixture HTML or a raised error) while
    keeping the real extractor — so a route test exercises real extraction over
    canned bytes, no network."""

    async def fake_fetch(url: str) -> str:
        if error is not None:
            raise error
        assert html is not None
        return html

    app.dependency_overrides[get_extraction_service] = lambda: ExtractionService(fetch=fake_fetch)


def test_extract_returns_recipe() -> None:
    override_fetch(html=(FIXTURES / "toplevel_string_instructions" / "page.html").read_text())

    response = client.post("/api/extract", json={"url": URL})

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Grandma's Lemon Cake"
    assert len(body["ingredients"]) == 4
    assert body["total_time_minutes"] == 60


def test_page_without_recipe_returns_422() -> None:
    override_fetch(html=(FIXTURES / "no_recipe.html").read_text())

    response = client.post("/api/extract", json={"url": URL})

    assert response.status_code == 422
    assert response.json()["code"] == "no_recipe"


def test_blocked_site_returns_502() -> None:
    override_fetch(error=SiteBlockedError("Site refused the request (HTTP 403)"))

    response = client.post("/api/extract", json={"url": URL})

    assert response.status_code == 502
    assert response.json()["code"] == "site_blocked"


def test_fetch_failure_returns_502() -> None:
    override_fetch(error=FetchError("Could not fetch page: timeout"))

    response = client.post("/api/extract", json={"url": URL})

    assert response.status_code == 502
    assert response.json()["code"] == "fetch_failed"


def test_malformed_url_rejected_by_request_validation() -> None:
    response = client.post("/api/extract", json={"url": "not-a-url"})
    assert response.status_code == 422  # pydantic HttpUrl validation


def test_extract_html_returns_recipe() -> None:
    html = (FIXTURES / "toplevel_string_instructions" / "page.html").read_text()

    response = client.post("/api/extract-html", json={"html": html, "url": URL})

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Grandma's Lemon Cake"
    assert body["source_url"] == URL


def test_extract_html_without_recipe_returns_422() -> None:
    html = (FIXTURES / "no_recipe.html").read_text()

    response = client.post("/api/extract-html", json={"html": html, "url": URL})

    assert response.status_code == 422
    assert response.json()["code"] == "no_recipe"


def test_rate_limit_returns_429() -> None:
    override_fetch(html=(FIXTURES / "toplevel_string_instructions" / "page.html").read_text())

    responses = [client.post("/api/extract", json={"url": URL}) for _ in range(11)]

    assert all(r.status_code == 200 for r in responses[:10])
    assert responses[10].status_code == 429


def test_rate_limit_keys_on_forwarded_client_ip() -> None:
    """Behind the Vercel proxy the direct peer is the proxy itself, so buckets
    must partition on x-forwarded-for — one busy user must not 429 the rest."""
    override_fetch(html=(FIXTURES / "toplevel_string_instructions" / "page.html").read_text())
    alice = {"x-forwarded-for": "203.0.113.1"}
    bob = {"x-forwarded-for": "203.0.113.2"}

    for _ in range(10):
        assert client.post("/api/extract", json={"url": URL}, headers=alice).status_code == 200
    assert client.post("/api/extract", json={"url": URL}, headers=alice).status_code == 429
    assert client.post("/api/extract", json={"url": URL}, headers=bob).status_code == 200
