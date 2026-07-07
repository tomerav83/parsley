"""Fetch layer tests.

- URL validation / SSRF guard: socket.getaddrinfo is stubbed with monkeypatch
  (DNS sits below any injectable seam, so monkeypatch is the right tool there).
- fetch_page behavior (redirects, error statuses, size cap): respx intercepts
  httpx at the transport layer — real client logic runs, no network.
"""

import socket

import httpx
import pytest
import respx

from app.fetch import (
    MAX_BYTES,
    BlockedUrlError,
    FetchError,
    InvalidUrlError,
    SiteBlockedError,
    fetch_page,
    validate_url,
)

PUBLIC_IP = "93.184.216.34"


def fake_getaddrinfo(ip: str):
    def _fake(host: str, port: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]

    return _fake


@pytest.fixture(autouse=True)
def public_dns(monkeypatch: pytest.MonkeyPatch):
    """Default every hostname to a public IP; SSRF tests override per-case."""
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo(PUBLIC_IP))


# --- URL validation / SSRF guard ---


@pytest.mark.parametrize(
    "url",
    [
        "ftp://example.com/recipe",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://",
    ],
)
def test_rejects_non_http_or_malformed_urls(url: str) -> None:
    with pytest.raises(InvalidUrlError):
        validate_url(url)


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",  # loopback
        "10.1.2.3",  # private
        "172.16.0.9",  # private
        "192.168.1.1",  # private
        "169.254.169.254",  # link-local (cloud metadata endpoint)
        "0.0.0.0",  # unspecified
    ],
)
def test_rejects_hosts_resolving_to_non_public_addresses(
    ip: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo(ip))
    with pytest.raises(BlockedUrlError):
        validate_url("https://innocent-looking-host.com/recipe")


def test_accepts_public_host() -> None:
    assert validate_url("https://example.com/recipe").host == "example.com"


def test_unresolvable_host_is_fetch_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(host: str, port: object) -> list:
        raise socket.gaierror("no such host")

    monkeypatch.setattr(socket, "getaddrinfo", _raise)
    with pytest.raises(FetchError):
        validate_url("https://does-not-exist.example/recipe")


# --- fetch_page behavior ---


@respx.mock
async def test_returns_page_html() -> None:
    respx.get("https://example.com/recipe").respond(200, text="<html>recipe</html>")

    assert await fetch_page("https://example.com/recipe") == "<html>recipe</html>"


@respx.mock
async def test_follows_redirect_and_revalidates_target() -> None:
    respx.get("https://example.com/old").respond(
        301, headers={"location": "https://example.com/new"}
    )
    respx.get("https://example.com/new").respond(200, text="<html>moved</html>")

    assert await fetch_page("https://example.com/old") == "<html>moved</html>"


@respx.mock
async def test_redirect_to_private_address_is_blocked(monkeypatch: pytest.MonkeyPatch) -> None:
    respx.get("https://example.com/sneaky").respond(
        302, headers={"location": "http://internal-service.local/admin"}
    )
    resolved = {"example.com": PUBLIC_IP, "internal-service.local": "10.0.0.5"}

    def _fake(host: str, port: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolved[host], 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake)

    with pytest.raises(BlockedUrlError):
        await fetch_page("https://example.com/sneaky")


@respx.mock
async def test_too_many_redirects() -> None:
    respx.get(url__startswith="https://example.com/loop").respond(
        302, headers={"location": "https://example.com/loop"}
    )

    with pytest.raises(FetchError, match="redirect"):
        await fetch_page("https://example.com/loop")


@pytest.mark.parametrize("status", [401, 403, 429])
@respx.mock
async def test_bot_protection_statuses_raise_site_blocked(status: int) -> None:
    respx.get("https://example.com/recipe").respond(status)

    with pytest.raises(SiteBlockedError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_server_error_raises_fetch_error() -> None:
    respx.get("https://example.com/recipe").respond(500)

    with pytest.raises(FetchError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_network_failure_raises_fetch_error() -> None:
    respx.get("https://example.com/recipe").mock(side_effect=httpx.ConnectTimeout("timeout"))

    with pytest.raises(FetchError):
        await fetch_page("https://example.com/recipe")


@respx.mock
async def test_oversized_page_rejected() -> None:
    respx.get("https://example.com/huge").respond(200, text="x" * (MAX_BYTES + 1))

    with pytest.raises(FetchError, match="large"):
        await fetch_page("https://example.com/huge")
