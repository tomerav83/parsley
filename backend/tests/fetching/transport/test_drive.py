"""drive_fetch against a scripted transport: redirects, status mapping and error
wrapping, with no HTTP client underneath."""

from unittest.mock import AsyncMock

import httpx
import pytest

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError, SiteBlockedError
from app.fetching.transport.drive import MAX_REDIRECTS, drive_fetch
from app.fetching.url_guard import validate_url
from tests.support.transports import ScriptedTransport, TransportError, redirect

START = validate_url("https://example.com/start")


@pytest.fixture
def read_body() -> AsyncMock:
    return AsyncMock(return_value="<html>page</html>")


async def drive(transport: ScriptedTransport, read_body: AsyncMock) -> str:
    return await drive_fetch(transport.open_stream, read_body, TransportError, START)


class TestSuccess:
    async def test_reads_the_body_of_a_2xx(self, read_body: AsyncMock) -> None:
        response = httpx.Response(200)
        transport = ScriptedTransport({str(START): response})

        assert await drive(transport, read_body) == "<html>page</html>"
        read_body.assert_awaited_once_with(response)
        assert transport.closed == [str(START)]


class TestRedirects:
    @pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
    async def test_follows_each_redirect_status(self, status: int, read_body: AsyncMock) -> None:
        transport = ScriptedTransport(
            {
                str(START): redirect(status, "https://example.org/end"),
                "https://example.org/end": httpx.Response(200),
            }
        )

        assert await drive(transport, read_body) == "<html>page</html>"
        assert transport.opened == [str(START), "https://example.org/end"]

    @pytest.mark.parametrize(
        ("location", "resolved"),
        [
            ("/moved", "https://example.com/moved"),
            ("../up", "https://example.com/up"),
            ("?page=2", "https://example.com/start?page=2"),
            ("//cdn.example.org/r", "https://cdn.example.org/r"),
        ],
    )
    async def test_resolves_relative_locations_against_the_current_hop(
        self, location: str, resolved: str, read_body: AsyncMock
    ) -> None:
        transport = ScriptedTransport(
            {str(START): redirect(302, location), resolved: httpx.Response(200)}
        )

        await drive(transport, read_body)

        assert transport.opened[-1] == resolved

    @pytest.mark.parametrize(
        "location", ["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)"]
    )
    async def test_revalidates_every_hop(self, location: str, read_body: AsyncMock) -> None:
        transport = ScriptedTransport({str(START): redirect(302, location)})

        with pytest.raises(InvalidUrlError):
            await drive(transport, read_body)
        assert transport.opened == [str(START)]

    async def test_redirect_without_location_fails(self, read_body: AsyncMock) -> None:
        transport = ScriptedTransport({str(START): httpx.Response(302)})

        with pytest.raises(FetchError, match="without a Location"):
            await drive(transport, read_body)

    async def test_follows_up_to_the_redirect_limit(self, read_body: AsyncMock) -> None:
        hops = [f"https://example.com/{i}" for i in range(MAX_REDIRECTS + 1)]
        responses: dict[str, httpx.Response | Exception] = {
            str(START): redirect(302, hops[1]),
            **{hops[i]: redirect(302, hops[i + 1]) for i in range(1, MAX_REDIRECTS)},
            hops[MAX_REDIRECTS]: httpx.Response(200),
        }

        assert await drive(ScriptedTransport(responses), read_body) == "<html>page</html>"

    async def test_one_redirect_past_the_limit_fails(self, read_body: AsyncMock) -> None:
        loop = ScriptedTransport({str(START): redirect(302, str(START))})

        with pytest.raises(FetchError, match="Too many redirects"):
            await drive(loop, read_body)
        assert len(loop.opened) == MAX_REDIRECTS + 1
        read_body.assert_not_awaited()


class TestStatusMapping:
    @pytest.mark.parametrize("status", [401, 402, 403, 429])
    async def test_bot_wall_statuses_are_site_blocked(
        self, status: int, read_body: AsyncMock
    ) -> None:
        transport = ScriptedTransport({str(START): httpx.Response(status)})

        with pytest.raises(SiteBlockedError, match=f"HTTP {status}"):
            await drive(transport, read_body)
        read_body.assert_not_awaited()

    @pytest.mark.parametrize("status", [400, 404, 410, 500, 503])
    async def test_other_error_statuses_are_fetch_errors(
        self, status: int, read_body: AsyncMock
    ) -> None:
        transport = ScriptedTransport({str(START): httpx.Response(status)})

        with pytest.raises(FetchError, match=f"HTTP {status}") as excinfo:
            await drive(transport, read_body)
        assert not isinstance(excinfo.value, SiteBlockedError)


class TestErrors:
    async def test_transport_error_on_connect_becomes_fetch_error(
        self, read_body: AsyncMock
    ) -> None:
        cause = TransportError("connection reset")
        transport = ScriptedTransport({str(START): cause})

        with pytest.raises(FetchError, match="Could not fetch page") as excinfo:
            await drive(transport, read_body)
        assert excinfo.value.__cause__ is cause

    async def test_transport_error_mid_body_becomes_fetch_error(self, read_body: AsyncMock) -> None:
        read_body.side_effect = TransportError("read timeout")
        transport = ScriptedTransport({str(START): httpx.Response(200)})

        with pytest.raises(FetchError, match="Could not fetch page"):
            await drive(transport, read_body)
        assert transport.closed == [str(START)]

    async def test_guard_errors_pass_through_unwrapped(self, read_body: AsyncMock) -> None:
        """The transport raises BlockedUrlError when a hop resolves privately; it
        must reach the client as blocked_url, not as a generic fetch failure."""
        transport = ScriptedTransport({str(START): BlockedUrlError("private")})

        with pytest.raises(BlockedUrlError):
            await drive(transport, read_body)

    async def test_body_cap_closes_the_response(self, read_body: AsyncMock) -> None:
        read_body.side_effect = FetchError("Page is too large")
        transport = ScriptedTransport({str(START): httpx.Response(200)})

        with pytest.raises(FetchError, match="too large"):
            await drive(transport, read_body)
        assert transport.closed == [str(START)]
