"""fetch_page and transport tests (redirects, statuses, size cap, encodings, IP pinning): respx
intercepts httpx at the transport layer — real client logic runs, no network.
conftest.py resolves every host to a public IP by default."""

import socket
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import anyio
import brotli
import httpx
import pytest
import respx
from httpx._decoders import SUPPORTED_DECODERS

from app.fetching.errors import BlockedUrlError, FetchError, SiteBlockedError
from app.fetching.fetcher import fetch_page
from app.fetching.transport.body_decoder import MAX_BODY_BYTES, decode_body
from app.fetching.transport.browser_headers import HTTPX_DECODABLE_ENCODINGS
from app.fetching.transport.clients import PublicOnlyTransport, fetch_via_curl_cffi
from app.fetching.url_guard import validate_url

# conftest resolves every host to this IP, and the transport connects to the IP,
# so that's the URL respx sees.
PINNED = "https://93.184.216.34"


@respx.mock
async def test_returns_page_html() -> None:
    respx.get(f"{PINNED}/recipe").respond(200, text="<html>recipe</html>")

    assert await fetch_page("https://example.com/recipe") == "<html>recipe</html>"


@respx.mock
async def test_follows_redirect_and_revalidates_target() -> None:
    respx.get(f"{PINNED}/old").respond(301, headers={"location": "https://example.com/new"})
    respx.get(f"{PINNED}/new").respond(200, text="<html>moved</html>")

    assert await fetch_page("https://example.com/old") == "<html>moved</html>"


@respx.mock
async def test_redirect_to_private_address_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get(f"{PINNED}/sneaky").respond(
        302, headers={"location": "http://internal-service.local/admin"}
    )
    resolved = {"example.com": "93.184.216.34", "internal-service.local": "10.0.0.5"}

    def _fake(host: str, port: object, **_: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolved[host], 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake)

    with pytest.raises(BlockedUrlError):
        await fetch_page("https://example.com/sneaky")


@respx.mock
async def test_too_many_redirects() -> None:
    respx.get(url__startswith=f"{PINNED}/loop").respond(
        302, headers={"location": "https://example.com/loop"}
    )

    with pytest.raises(FetchError, match="redirect"):
        await fetch_page("https://example.com/loop")


@pytest.mark.parametrize("status", [401, 402, 403, 429])
@respx.mock
async def test_bot_protection_status_falls_back_to_curl_cffi(
    status: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    respx.get(f"{PINNED}/recipe").respond(status)

    async def fake_curl_fetch(target: httpx.URL) -> str:
        return "<html>fetched via curl_cffi</html>"

    monkeypatch.setattr("app.fetching.fetcher.fetch_via_curl_cffi", fake_curl_fetch)

    assert await fetch_page("https://example.com/recipe") == "<html>fetched via curl_cffi</html>"


@pytest.mark.parametrize("status", [401, 402, 403, 429])
@respx.mock
async def test_bot_protection_raises_site_blocked_when_curl_cffi_also_blocked(
    status: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    respx.get(f"{PINNED}/recipe").respond(status)

    async def fake_curl_fetch(target: httpx.URL) -> str:
        raise SiteBlockedError("still blocked")

    monkeypatch.setattr("app.fetching.fetcher.fetch_via_curl_cffi", fake_curl_fetch)

    with pytest.raises(SiteBlockedError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_server_error_raises_fetch_error() -> None:
    respx.get(f"{PINNED}/recipe").respond(500)

    with pytest.raises(FetchError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_network_failure_raises_fetch_error() -> None:
    respx.get(f"{PINNED}/recipe").mock(side_effect=httpx.ConnectTimeout("timeout"))

    with pytest.raises(FetchError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_oversized_page_rejected() -> None:
    respx.get(f"{PINNED}/huge").respond(200, text="x" * (MAX_BODY_BYTES + 1))

    with pytest.raises(FetchError, match="large"):
        await fetch_page("https://example.com/huge")


@respx.mock
async def test_size_cap_aborts_mid_download() -> None:
    """The cap must abort the transfer, not buffer an arbitrarily large body
    into memory and check afterwards."""

    class EndlessBody(httpx.AsyncByteStream):
        chunk = b"x" * (1024 * 1024)
        sent = 0

        async def __aiter__(self) -> AsyncIterator[bytes]:
            for _ in range(100):  # 100 MB on offer
                self.sent += len(self.chunk)
                yield self.chunk

    body = EndlessBody()
    respx.get(f"{PINNED}/endless").respond(200, stream=body)

    with pytest.raises(FetchError, match="large"):
        await fetch_page("https://example.com/endless")
    assert body.sent <= MAX_BODY_BYTES + 2 * len(body.chunk), "kept downloading long past the cap"


@respx.mock
async def test_drip_feed_hits_total_deadline(monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-operation timeouts reset on every read, so only the whole-fetch
    deadline stops a server that drips bytes forever."""
    monkeypatch.setattr("app.fetching.fetcher.TOTAL_TIMEOUT_SECONDS", 0.1)

    async def stall(request: httpx.Request) -> httpx.Response:
        await anyio.sleep(5)
        return httpx.Response(200, text="too late")

    respx.get(f"{PINNED}/slow").mock(side_effect=stall)

    with pytest.raises(FetchError, match="too long"):
        await fetch_page("https://example.com/slow")


# --- Content-Encoding ---


def test_advertised_encodings_are_all_decodable() -> None:
    """Every coding in Accept-Encoding must have an installed httpx decoder.
    Advertising one we can't decode (e.g. br without the `brotli` dep) makes the
    server send bytes we hand back undecoded — a silent failure, not an error."""
    advertised = [c.strip() for c in HTTPX_DECODABLE_ENCODINGS.split(",")]
    assert advertised  # guard against an empty/renamed header
    for coding in advertised:
        assert coding in SUPPORTED_DECODERS, f"advertised {coding!r} has no installed decoder"


@respx.mock
async def test_brotli_body_is_decoded() -> None:
    """A brotli-compressed response (what Cloudflare/WP sites commonly send) must
    come back as decoded HTML, not raw compressed bytes."""
    html = "<html><body>brotli recipe</body></html>"
    respx.get(f"{PINNED}/br").respond(
        200,
        headers={"Content-Encoding": "br"},
        content=brotli.compress(html.encode()),
    )

    assert await fetch_page("https://example.com/br") == html


# --- PublicOnlyTransport ---


@respx.mock
async def test_transport_pins_checked_ip_and_keeps_the_name() -> None:
    """The connection goes to the checked IP, so httpx never resolves the name
    again (the DNS-rebinding window); the server and TLS still see the name."""
    route = respx.get("https://93.184.216.34/recipe").respond(200)

    async with httpx.AsyncClient(transport=PublicOnlyTransport()) as client:
        await client.get("https://example.com/recipe")

    sent = route.calls.last.request
    assert sent.headers["host"] == "example.com"
    assert sent.extensions["sni_hostname"] == "example.com"


@respx.mock
async def test_transport_refuses_non_public_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    def _private(host: str, port: object, **_: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _private)
    route = respx.route().respond(200)

    async with httpx.AsyncClient(transport=PublicOnlyTransport()) as client:
        with pytest.raises(BlockedUrlError):
            await client.get("https://example.com/recipe")
    assert not route.called


@respx.mock
async def test_transport_falls_through_to_next_address(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pinning the IP must not lose the fallback a normal connect has across a
    host's addresses (an unrouted IPv6 answer ahead of a working IPv4 one)."""

    def _two(host: str, port: object, **_: object) -> list:
        return [
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("2606:2800:220:1::1", 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0)),
        ]

    monkeypatch.setattr(socket, "getaddrinfo", _two)
    respx.get("https://[2606:2800:220:1::1]/recipe").mock(
        side_effect=httpx.ConnectError("unreachable")
    )
    respx.get("https://93.184.216.34/recipe").respond(200, text="<html>v4</html>")

    assert await fetch_page("https://example.com/recipe") == "<html>v4</html>"


def test_transport_keeps_no_connection_alive() -> None:
    """The pool keys on the rewritten IP, so a redirect to another name on the
    same IP would ride hop 1's TLS session (wrong SNI) if anything were kept."""
    assert PublicOnlyTransport()._pool._max_keepalive_connections == 0


# --- curl_cffi path ---


class FakeCurlSession:
    """Stands in for curl_cffi's AsyncSession: records each hop's RESOLVE entry
    and serves canned responses by URL."""

    def __init__(self, responses: dict[str, tuple[int, dict[str, str]]]) -> None:
        self.responses = responses
        self.curl_options: dict[Any, Any] = {}
        self.resolves: list[Any] = []

    def __call__(self, **_: object) -> "FakeCurlSession":
        return self

    async def __aenter__(self) -> "FakeCurlSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    @asynccontextmanager
    async def stream(self, method: str, url: str, allow_redirects: bool) -> AsyncIterator[Any]:
        from curl_cffi import CurlOpt

        self.resolves.append(self.curl_options[CurlOpt.RESOLVE])
        status, headers = self.responses[url]
        yield httpx.Response(status, headers=headers)


async def test_curl_cffi_pins_every_hop_and_blocks_private_redirects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved = {"example.com": "93.184.216.34", "internal-service.local": "10.0.0.5"}

    def _fake(host: str, port: object, **_: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolved[host], 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake)
    session = FakeCurlSession(
        {"https://example.com/sneaky": (302, {"location": "http://internal-service.local/admin"})}
    )
    monkeypatch.setattr("curl_cffi.requests.AsyncSession", session)

    with pytest.raises(BlockedUrlError):
        await fetch_via_curl_cffi(validate_url("https://example.com/sneaky"))
    # Hop 1 went to the checked IP on the https default port; hop 2 never opened.
    assert session.resolves == [["example.com:443:93.184.216.34"]]


async def _chunks(*parts: bytes) -> AsyncIterator[bytes]:
    for part in parts:
        yield part


@pytest.mark.parametrize(
    ("charset", "expected"),
    [
        ("utf-8", "café"),
        (None, "café"),
        ("bogus", "café"),  # unknown name
        ("base64", "café"),  # bytes-to-bytes codec, not a text encoding
        ("utf\x00x", "café"),  # null byte in the name
    ],
)
async def test_decode_body_across_chunks(charset: str | None, expected: str) -> None:
    # "é" is two bytes in utf-8; splitting them across chunks must not mangle it.
    encoded = "café".encode()
    assert await decode_body(_chunks(encoded[:4], encoded[4:]), charset) == expected
