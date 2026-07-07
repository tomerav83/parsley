"""API route tests. The page fetcher is swapped via FastAPI dependency_overrides
(the framework's intended seam for stubbing external services) — no network."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.fetch import FetchError, SiteBlockedError
from app.main import app, get_fetch_page, limiter

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
    async def fake_fetch(url: str) -> str:
        if error is not None:
            raise error
        assert html is not None
        return html

    app.dependency_overrides[get_fetch_page] = lambda: fake_fetch


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


def test_rate_limit_returns_429() -> None:
    override_fetch(html=(FIXTURES / "toplevel_string_instructions" / "page.html").read_text())

    responses = [client.post("/api/extract", json={"url": URL}) for _ in range(11)]

    assert all(r.status_code == 200 for r in responses[:10])
    assert responses[10].status_code == 429
