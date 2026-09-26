"""fetch_page: the httpx → curl_cffi fallback and the whole-fetch deadline.

TestFetchPage mocks both transports to pin the orchestration down on its own;
TestFetchPageEndToEnd runs the real ones over respx for the paths that only
matter once everything is wired together.
"""

import logging
from collections.abc import Iterator
from unittest import mock

import anyio
import httpx
import pytest
import respx

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError, SiteBlockedError
from app.fetching.fetcher import fetch_page
from app.fetching.transport.body_decoder import MAX_BODY_BYTES
from app.fetching.url_guard import validate_url
from tests.support.dns import PINNED, FakeResolver
from tests.support.pages import URL
from tests.support.transports import stall


@pytest.fixture
def via_httpx() -> Iterator[mock.AsyncMock]:
    with mock.patch("app.fetching.fetcher.fetch_via_httpx", autospec=True) as patched:
        patched.return_value = "<html>httpx</html>"
        yield patched


@pytest.fixture
def via_curl() -> Iterator[mock.AsyncMock]:
    with mock.patch("app.fetching.fetcher.fetch_via_curl_cffi", autospec=True) as patched:
        patched.return_value = "<html>curl</html>"
        yield patched


@pytest.fixture
def short_deadline() -> Iterator[None]:
    with mock.patch("app.fetching.fetcher.TOTAL_TIMEOUT_SECONDS", 0.05):
        yield


class TestFetchPage:
    async def test_returns_what_httpx_fetched(
        self, via_httpx: mock.AsyncMock, via_curl: mock.AsyncMock
    ) -> None:
        assert await fetch_page(URL) == "<html>httpx</html>"
        via_httpx.assert_awaited_once_with(validate_url(URL))
        via_curl.assert_not_awaited()

    async def test_invalid_url_fails_before_any_transport(
        self, via_httpx: mock.AsyncMock, via_curl: mock.AsyncMock
    ) -> None:
        with pytest.raises(InvalidUrlError):
            await fetch_page("ftp://example.com/recipe")
        via_httpx.assert_not_awaited()
        via_curl.assert_not_awaited()

    async def test_blocked_page_is_retried_via_curl_cffi(
        self,
        via_httpx: mock.AsyncMock,
        via_curl: mock.AsyncMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        via_httpx.side_effect = SiteBlockedError("Site refused the request (HTTP 403)")

        with caplog.at_level(logging.INFO, logger="app.fetching.fetcher"):
            assert await fetch_page(URL) == "<html>curl</html>"

        via_curl.assert_awaited_once_with(validate_url(URL))
        assert [r.levelname for r in caplog.records] == ["WARNING", "INFO"]
        assert "retrying via curl_cffi" in caplog.records[0].message
        assert "fallback succeeded" in caplog.records[1].message

    async def test_still_blocked_after_the_retry_is_site_blocked(
        self,
        via_httpx: mock.AsyncMock,
        via_curl: mock.AsyncMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """One retry only: the block is IP reputation, and trying again from the
        same egress only doubles the latency."""
        via_httpx.side_effect = SiteBlockedError("HTTP 403")
        via_curl.side_effect = SiteBlockedError("HTTP 403")

        with pytest.raises(SiteBlockedError):
            await fetch_page(URL)

        via_curl.assert_awaited_once()
        assert "curl_cffi also blocked" in caplog.records[-1].message

    @pytest.mark.parametrize(
        "error", [FetchError("Site returned HTTP 500"), BlockedUrlError("private")]
    )
    async def test_other_failures_are_not_retried(
        self, error: FetchError, via_httpx: mock.AsyncMock, via_curl: mock.AsyncMock
    ) -> None:
        via_httpx.side_effect = error

        with pytest.raises(type(error)):
            await fetch_page(URL)
        via_curl.assert_not_awaited()

    @pytest.mark.usefixtures("short_deadline")
    async def test_deadline_bounds_the_httpx_attempt(self, via_httpx: mock.AsyncMock) -> None:
        via_httpx.side_effect = stall

        with pytest.raises(FetchError, match="too long") as excinfo:
            await fetch_page(URL)
        assert isinstance(excinfo.value.__cause__, TimeoutError)

    @pytest.mark.usefixtures("short_deadline")
    async def test_deadline_spans_the_curl_retry(
        self, via_httpx: mock.AsyncMock, via_curl: mock.AsyncMock
    ) -> None:
        via_httpx.side_effect = SiteBlockedError("HTTP 403")
        via_curl.side_effect = stall

        with pytest.raises(FetchError, match="too long"):
            await fetch_page(URL)


class TestFetchPageEndToEnd:
    async def test_returns_page_html(self, respx_mock: respx.MockRouter) -> None:
        respx_mock.get(f"{PINNED}/recipe").respond(200, text="<html>recipe</html>")

        assert await fetch_page(URL) == "<html>recipe</html>"

    async def test_redirect_to_a_private_host_is_blocked(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        dns.answer("internal-service.local", "10.0.0.5")
        respx_mock.get(f"{PINNED}/sneaky").respond(
            302, headers={"location": "http://internal-service.local/admin"}
        )

        with pytest.raises(BlockedUrlError):
            await fetch_page("https://example.com/sneaky")

    async def test_redirect_loop_fails(self, respx_mock: respx.MockRouter) -> None:
        respx_mock.get(f"{PINNED}/loop").respond(302, headers={"location": "/loop"})

        with pytest.raises(FetchError, match="Too many redirects"):
            await fetch_page("https://example.com/loop")

    async def test_bot_wall_falls_back_to_curl_cffi(
        self, respx_mock: respx.MockRouter, via_curl: mock.AsyncMock
    ) -> None:
        respx_mock.get(f"{PINNED}/recipe").respond(403)

        assert await fetch_page(URL) == "<html>curl</html>"

    async def test_oversized_page_is_rejected(self, respx_mock: respx.MockRouter) -> None:
        respx_mock.get(f"{PINNED}/huge").respond(200, text="x" * (MAX_BODY_BYTES + 1))

        with pytest.raises(FetchError, match="too large"):
            await fetch_page("https://example.com/huge")

    @pytest.mark.usefixtures("short_deadline")
    async def test_drip_feed_hits_the_total_deadline(self, respx_mock: respx.MockRouter) -> None:
        """Per-operation timeouts reset on every read, so only the whole-fetch
        deadline stops a server that drips bytes forever."""

        async def drip(_request: httpx.Request) -> httpx.Response:
            await anyio.sleep(5)
            return httpx.Response(200, text="too late")

        respx_mock.get(f"{PINNED}/slow").mock(side_effect=drip)

        with pytest.raises(FetchError, match="too long"):
            await fetch_page("https://example.com/slow")
