"""SSRF guard tests. socket.getaddrinfo is stubbed with monkeypatch (DNS sits
below any injectable seam, so monkeypatch is the right tool there); conftest.py
resolves every host to a public IP by default."""

import socket

import pytest

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError
from app.fetching.url_guard import resolve_public_ips, validate_url


def fake_getaddrinfo(*ips: str):
    def _fake(host: str, port: object, **_: object) -> list:
        return [
            (socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))
            for ip in ips
        ]

    return _fake


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


def test_accepts_http_url() -> None:
    assert validate_url("https://example.com/recipe").host == "example.com"


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",  # loopback
        "10.1.2.3",  # private
        "172.16.0.9",  # private
        "192.168.1.1",  # private
        "169.254.169.254",  # link-local (cloud metadata endpoint)
        "0.0.0.0",  # unspecified
        "::1",  # IPv6 loopback
        "fe80::1%eth0",  # IPv6 link-local, with a zone index
    ],
)
async def test_rejects_hosts_resolving_to_non_public_addresses(
    ip: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo(ip))
    with pytest.raises(BlockedUrlError):
        await resolve_public_ips("innocent-looking-host.com")


async def test_rejects_host_with_any_non_public_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", fake_getaddrinfo("93.184.216.34", "10.0.0.5"))
    with pytest.raises(BlockedUrlError):
        await resolve_public_ips("half-public.com")


async def test_returns_public_ips_in_resolver_order(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        socket, "getaddrinfo", fake_getaddrinfo("2606:2800:220:1::1", "93.184.216.34")
    )
    assert await resolve_public_ips("example.com") == ["2606:2800:220:1::1", "93.184.216.34"]


async def test_unresolvable_host_is_fetch_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(host: str, port: object, **_: object) -> list:
        raise socket.gaierror("no such host")

    monkeypatch.setattr(socket, "getaddrinfo", _raise)
    with pytest.raises(FetchError):
        await resolve_public_ips("does-not-exist.example")
