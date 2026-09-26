"""The two HTTP clients. respx intercepts httpx below PublicOnlyTransport, so the
pinning logic runs for real; curl_cffi's AsyncSession is replaced with a fake that
records what the client configured on it."""

from collections.abc import Iterator
from unittest import mock

import brotli
import httpx
import pytest
import respx
from curl_cffi.requests.exceptions import RequestException as CurlRequestException

from app.fetching.errors import BlockedUrlError, FetchError
from app.fetching.transport.body_decoder import MAX_BODY_BYTES
from app.fetching.transport.browser_headers import BROWSER_HEADERS
from app.fetching.transport.clients import (
    TIMEOUT_SECONDS,
    PublicOnlyTransport,
    fetch_via_curl_cffi,
    fetch_via_httpx,
)
from app.fetching.url_guard import validate_url
from tests.support.dns import PINNED, PUBLIC_IP, FakeResolver
from tests.support.streams import TrackedStream
from tests.support.transports import FakeCurlResponse, FakeCurlSession, curl_ok

IPV6 = "2606:2800:220:1::1"


async def get(url: str) -> httpx.Response:
    async with httpx.AsyncClient(transport=PublicOnlyTransport()) as client:
        return await client.get(url)


class TestPublicOnlyTransport:
    async def test_connects_to_the_checked_ip_and_keeps_the_name(
        self, respx_mock: respx.MockRouter
    ) -> None:
        route = respx_mock.get(f"{PINNED}/recipe").respond(200)

        await get("https://example.com/recipe")

        sent = route.calls.last.request
        assert sent.headers["host"] == "example.com"
        assert sent.extensions["sni_hostname"] == "example.com"

    async def test_keeps_an_explicit_port(self, respx_mock: respx.MockRouter) -> None:
        route = respx_mock.get(f"{PINNED}:8443/recipe").respond(200)

        await get("https://example.com:8443/recipe")

        assert route.called

    async def test_brackets_a_pinned_ipv6_address(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        dns.answer("example.com", IPV6)
        route = respx_mock.get(f"https://[{IPV6}]/recipe").respond(200)

        await get("https://example.com/recipe")

        assert route.called

    async def test_refuses_a_non_public_address_before_connecting(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        dns.answer("example.com", "10.0.0.5")
        route = respx_mock.route().respond(200)

        with pytest.raises(BlockedUrlError):
            await get("https://example.com/recipe")
        assert not route.called

    async def test_rebinding_answer_never_reaches_a_socket(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        """A short-TTL name answering public to the check and private to the
        connect: the transport resolves once and connects to what it checked."""
        dns.rebind("example.com", [PUBLIC_IP], ["127.0.0.1"])
        route = respx_mock.get(f"{PINNED}/recipe").respond(200)

        await get("https://example.com/recipe")

        assert route.called
        assert dns.lookups() == ["example.com"]

    @pytest.mark.parametrize("error", [httpx.ConnectError, httpx.ConnectTimeout])
    async def test_falls_through_to_the_next_address(
        self, respx_mock: respx.MockRouter, error: type[httpx.TransportError], dns: FakeResolver
    ) -> None:
        """Pinning must keep the fallback a normal connect has across a host's
        addresses, e.g. an unrouted IPv6 answer ahead of a working IPv4 one."""
        dns.answer("example.com", IPV6, PUBLIC_IP)
        respx_mock.get(f"https://[{IPV6}]/recipe").mock(side_effect=error("unreachable"))
        respx_mock.get(f"{PINNED}/recipe").respond(200, text="v4")

        assert (await get("https://example.com/recipe")).text == "v4"

    async def test_raises_when_every_address_fails(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        dns.answer("example.com", IPV6, PUBLIC_IP)
        respx_mock.get(f"https://[{IPV6}]/recipe").mock(side_effect=httpx.ConnectError("down"))
        respx_mock.get(f"{PINNED}/recipe").mock(side_effect=httpx.ConnectError("down"))

        with pytest.raises(httpx.ConnectError):
            await get("https://example.com/recipe")

    async def test_does_not_retry_once_connected(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        """Only connect failures move on; a read timeout means the server was
        reached, and asking the next address would repeat the request."""
        dns.answer("example.com", IPV6, PUBLIC_IP)
        respx_mock.get(f"https://[{IPV6}]/recipe").mock(side_effect=httpx.ReadTimeout("slow"))
        second = respx_mock.get(f"{PINNED}/recipe").respond(200)

        with pytest.raises(httpx.ReadTimeout):
            await get("https://example.com/recipe")
        assert not second.called

    def test_keeps_no_connection_alive(self) -> None:
        """The pool keys on the rewritten IP, so a redirect to another name on the
        same IP would ride hop 1's TLS session (wrong SNI) if anything were kept."""
        assert PublicOnlyTransport()._pool._max_keepalive_connections == 0


class TestFetchViaHttpx:
    async def test_returns_the_page_with_browser_headers(
        self, respx_mock: respx.MockRouter
    ) -> None:
        route = respx_mock.get(f"{PINNED}/recipe").respond(200, text="<html>recipe</html>")

        assert await fetch_via_httpx(validate_url("https://example.com/recipe")) == (
            "<html>recipe</html>"
        )
        sent = route.calls.last.request.headers
        assert {k: sent[k] for k in BROWSER_HEADERS} == BROWSER_HEADERS

    async def test_ignores_proxy_settings_in_the_environment(
        self, respx_mock: respx.MockRouter, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """An env proxy would carry the request past the pinned transport."""
        monkeypatch.setenv("HTTPS_PROXY", "http://proxy.invalid:3128")
        monkeypatch.setenv("ALL_PROXY", "http://proxy.invalid:3128")
        route = respx_mock.get(f"{PINNED}/recipe").respond(200)

        await fetch_via_httpx(validate_url("https://example.com/recipe"))

        assert route.called

    async def test_decodes_the_declared_charset(self, respx_mock: respx.MockRouter) -> None:
        respx_mock.get(f"{PINNED}/recipe").respond(
            200, headers={"content-type": "text/html; charset=iso-8859-1"}, content=b"caf\xe9"
        )

        assert await fetch_via_httpx(validate_url("https://example.com/recipe")) == "café"

    async def test_decodes_a_brotli_body(self, respx_mock: respx.MockRouter) -> None:
        """What Cloudflare and WordPress sites commonly send."""
        html = "<html><body>brotli recipe</body></html>"
        respx_mock.get(f"{PINNED}/br").respond(
            200, headers={"content-encoding": "br"}, content=brotli.compress(html.encode())
        )

        assert await fetch_via_httpx(validate_url("https://example.com/br")) == html

    async def test_resolves_each_redirect_hop_once(
        self, respx_mock: respx.MockRouter, dns: FakeResolver
    ) -> None:
        dns.answer("cdn.example.org", "93.184.216.35")
        respx_mock.get(f"{PINNED}/old").respond(
            301, headers={"location": "https://cdn.example.org/new"}
        )
        respx_mock.get("https://93.184.216.35/new").respond(200, text="moved")

        assert await fetch_via_httpx(validate_url("https://example.com/old")) == "moved"
        assert dns.lookups() == ["example.com", "cdn.example.org"]

    async def test_connect_failure_is_fetch_error(self, respx_mock: respx.MockRouter) -> None:
        respx_mock.get(f"{PINNED}/recipe").mock(side_effect=httpx.ConnectError("refused"))

        with pytest.raises(FetchError, match="Could not fetch page"):
            await fetch_via_httpx(validate_url("https://example.com/recipe"))

    async def test_size_cap_aborts_and_closes_the_download(
        self, respx_mock: respx.MockRouter
    ) -> None:
        body = TrackedStream()
        respx_mock.get(f"{PINNED}/huge").respond(200, stream=body)

        with pytest.raises(FetchError, match="too large"):
            await fetch_via_httpx(validate_url("https://example.com/huge"))
        assert body.sent <= MAX_BODY_BYTES + 2 * len(body.chunk), "kept downloading past the cap"
        assert body.closed, "the response stream was left open"


@pytest.fixture
def curl() -> Iterator[mock.MagicMock]:
    """Patch AsyncSession where fetch_via_curl_cffi imports it; tests hand the
    patch a FakeCurlSession via `curl.side_effect`."""
    with mock.patch("curl_cffi.requests.AsyncSession") as patched:
        yield patched


def serve(curl: mock.MagicMock, responses: dict[str, FakeCurlResponse | Exception]):
    session = FakeCurlSession(responses)
    curl.side_effect = session
    return session


class TestFetchViaCurlCffi:
    async def test_returns_the_page(self, curl: mock.MagicMock) -> None:
        serve(
            curl,
            {
                "https://example.com/r": curl_ok(
                    b"caf\xe9", {"content-type": "text/html; charset=latin-1"}
                )
            },
        )

        assert await fetch_via_curl_cffi(validate_url("https://example.com/r")) == "café"

    async def test_impersonates_chrome_without_env_proxies(self, curl: mock.MagicMock) -> None:
        session = serve(curl, {"https://example.com/r": curl_ok()})

        await fetch_via_curl_cffi(validate_url("https://example.com/r"))

        assert session.kwargs == {
            "timeout": TIMEOUT_SECONDS,
            "impersonate": "chrome",
            "trust_env": False,
        }

    @pytest.mark.parametrize(
        ("url", "answers", "resolve"),
        [
            ("https://example.com/r", [PUBLIC_IP], "example.com:443:93.184.216.34"),
            ("http://example.com/r", [PUBLIC_IP], "example.com:80:93.184.216.34"),
            ("https://example.com:8443/r", [PUBLIC_IP], "example.com:8443:93.184.216.34"),
            ("https://example.com/r", [IPV6], f"example.com:443:[{IPV6}]"),
            ("https://example.com/r", [IPV6, PUBLIC_IP], f"example.com:443:[{IPV6}],{PUBLIC_IP}"),
        ],
    )
    async def test_pins_the_checked_ips(
        self,
        url: str,
        answers: list[str],
        resolve: str,
        dns: FakeResolver,
        curl: mock.MagicMock,
    ) -> None:
        dns.answer("example.com", *answers)
        session = serve(curl, {url: curl_ok()})

        await fetch_via_curl_cffi(validate_url(url))

        assert session.resolves == [[resolve]]

    async def test_rebinding_answer_never_reaches_curl(
        self, dns: FakeResolver, curl: mock.MagicMock
    ) -> None:
        dns.rebind("example.com", [PUBLIC_IP], ["127.0.0.1"])
        session = serve(curl, {"https://example.com/r": curl_ok()})

        await fetch_via_curl_cffi(validate_url("https://example.com/r"))

        assert session.resolves == [[f"example.com:443:{PUBLIC_IP}"]]
        assert dns.lookups() == ["example.com"]

    async def test_repins_every_redirect_hop(self, dns: FakeResolver, curl: mock.MagicMock) -> None:
        dns.answer("cdn.example.org", "93.184.216.35")
        session = serve(
            curl,
            {
                "https://example.com/old": FakeCurlResponse(
                    301, {"location": "https://cdn.example.org/new"}, []
                ),
                "https://cdn.example.org/new": curl_ok(),
            },
        )

        await fetch_via_curl_cffi(validate_url("https://example.com/old"))

        assert session.resolves == [
            [f"example.com:443:{PUBLIC_IP}"],
            ["cdn.example.org:443:93.184.216.35"],
        ]

    async def test_blocks_a_redirect_to_a_private_host(
        self, dns: FakeResolver, curl: mock.MagicMock
    ) -> None:
        dns.answer("internal-service.local", "10.0.0.5")
        session = serve(
            curl,
            {
                "https://example.com/sneaky": FakeCurlResponse(
                    302, {"location": "http://internal-service.local/admin"}, []
                )
            },
        )

        with pytest.raises(BlockedUrlError):
            await fetch_via_curl_cffi(validate_url("https://example.com/sneaky"))
        # Hop 1 went to the checked IP; hop 2 never opened.
        assert session.resolves == [[f"example.com:443:{PUBLIC_IP}"]]

    async def test_curl_failure_is_fetch_error(self, curl: mock.MagicMock) -> None:
        serve(curl, {"https://example.com/r": CurlRequestException("TLS handshake failed")})

        with pytest.raises(FetchError, match="Could not fetch page"):
            await fetch_via_curl_cffi(validate_url("https://example.com/r"))

    async def test_size_cap_aborts_and_closes_the_download(self, curl: mock.MagicMock) -> None:
        huge = FakeCurlResponse(200, {}, [b"x" * 1024 * 1024] * 100)
        session = serve(curl, {"https://example.com/huge": huge})

        with pytest.raises(FetchError, match="too large"):
            await fetch_via_curl_cffi(validate_url("https://example.com/huge"))
        assert huge.pulled == MAX_BODY_BYTES // (1024 * 1024) + 1
        assert session.closed == ["https://example.com/huge"]
