"""The SSRF guard. conftest's `dns` fixture fakes getaddrinfo, the one seam below
the guard, so every case controls exactly what a host resolves to."""

import ipaddress
import socket

import pytest

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError
from app.fetching.url_guard import ip_allowed, resolve_public_ips, validate_url
from tests.support.dns import PUBLIC_IP, FakeResolver


class TestValidateUrl:
    @pytest.mark.parametrize(
        "url",
        [
            "ftp://example.com/recipe",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,hi",
            "//example.com/no-scheme",
        ],
    )
    def test_rejects_schemes_other_than_http(self, url: str) -> None:
        with pytest.raises(InvalidUrlError, match="http"):
            validate_url(url)

    @pytest.mark.parametrize("url", ["https://", "http://"])
    def test_rejects_url_without_host(self, url: str) -> None:
        with pytest.raises(InvalidUrlError, match="no host"):
            validate_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "https://[::1",  # unterminated IPv6 literal
            "https://example.com\x00.evil.com",  # null byte smuggled into the host
        ],
    )
    def test_rejects_unparseable_url(self, url: str) -> None:
        with pytest.raises(InvalidUrlError, match="Not a valid URL") as excinfo:
            validate_url(url)
        assert excinfo.value.__cause__ is not None

    def test_normalizes_scheme_and_host_case(self) -> None:
        parsed = validate_url("HTTPS://EXAMPLE.COM/Recipe")
        assert (parsed.scheme, parsed.host, parsed.path) == ("https", "example.com", "/Recipe")

    def test_leaves_address_checks_to_connect_time(self) -> None:
        """A literal private IP is a valid URL; where it points is checked when a
        transport connects, so the check can't be raced by a second lookup."""
        assert validate_url("http://127.0.0.1/admin").host == "127.0.0.1"


class TestIpAllowed:
    @pytest.mark.parametrize(
        "ip",
        [
            "8.8.8.8",
            "172.15.255.255",  # just below 172.16.0.0/12
            "172.32.0.0",  # just above it
            "100.63.255.255",  # just below 100.64.0.0/10 (carrier-grade NAT)
            "100.128.0.0",  # just above it
            "::ffff:8.8.8.8",  # IPv4-mapped public address
            "2606:4700::1111",
        ],
    )
    def test_allows_public_addresses(self, ip: str) -> None:
        assert ip_allowed(ipaddress.ip_address(ip))

    @pytest.mark.parametrize(
        "ip",
        [
            "127.0.0.1",  # loopback
            "10.0.0.0",  # private, first address
            "10.255.255.255",  # private, last address
            "172.16.0.0",  # private, first address
            "172.31.255.255",  # private, last address
            "192.168.1.1",  # private
            "100.64.0.0",  # carrier-grade NAT, first address
            "100.127.255.255",  # carrier-grade NAT, last address
            "169.254.169.254",  # link-local: the cloud metadata endpoint
            "0.0.0.0",  # unspecified
            "192.0.0.1",  # IETF protocol assignments
            "198.18.0.1",  # benchmarking
            "240.0.0.1",  # reserved
            "255.255.255.255",  # broadcast
            "::1",  # IPv6 loopback
            "::",  # IPv6 unspecified
            "fe80::1",  # IPv6 link-local
            "fd12::1",  # IPv6 unique local
            "2001:db8::1",  # documentation
            "::ffff:127.0.0.1",  # IPv4-mapped loopback
            "::ffff:169.254.169.254",  # IPv4-mapped metadata endpoint
            "2002:7f00:1::1",  # 6to4 wrapping 127.0.0.1
        ],
    )
    def test_refuses_non_public_addresses(self, ip: str) -> None:
        assert not ip_allowed(ipaddress.ip_address(ip))


class TestResolvePublicIps:
    async def test_returns_public_ips_in_resolver_order(self, dns: FakeResolver) -> None:
        dns.answer("example.com", "2606:2800:220:1::1", PUBLIC_IP)

        assert await resolve_public_ips("example.com") == ["2606:2800:220:1::1", PUBLIC_IP]

    async def test_resolves_once_for_stream_sockets(self, dns: FakeResolver) -> None:
        """One lookup is the whole check; SOCK_STREAM stops each address coming
        back once per socket type."""
        await resolve_public_ips("example.com")

        dns.mock.assert_called_once_with("example.com", None, type=socket.SOCK_STREAM)

    @pytest.mark.parametrize("ip", ["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1"])
    async def test_refuses_host_resolving_to_non_public_address(
        self, ip: str, dns: FakeResolver
    ) -> None:
        dns.answer("innocent-looking-host.com", ip)

        with pytest.raises(BlockedUrlError, match="non-public"):
            await resolve_public_ips("innocent-looking-host.com")

    async def test_refuses_host_with_any_non_public_answer(self, dns: FakeResolver) -> None:
        """Connecting to the first answer alone isn't enough: the fallback to the
        next address would reach the private one."""
        dns.answer("half-public.com", PUBLIC_IP, "10.0.0.5")

        with pytest.raises(BlockedUrlError):
            await resolve_public_ips("half-public.com")

    async def test_strips_ipv6_zone_index(self, dns: FakeResolver) -> None:
        """A zone index names a local interface; it can't ride in the pinned URL."""
        dns.answer("example.com", "2606:2800:220:1::1%eth0")

        assert await resolve_public_ips("example.com") == ["2606:2800:220:1::1"]

    async def test_zone_index_does_not_hide_a_link_local_address(self, dns: FakeResolver) -> None:
        dns.answer("example.com", "fe80::1%eth0")

        with pytest.raises(BlockedUrlError):
            await resolve_public_ips("example.com")

    async def test_ignores_non_ip_address_families(self, dns: FakeResolver) -> None:
        dns.mock.side_effect = None
        dns.mock.return_value = [
            (socket.AF_UNIX, socket.SOCK_STREAM, 0, "", "/var/run/sock"),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, 0)),
        ]

        assert await resolve_public_ips("example.com") == [PUBLIC_IP]

    async def test_no_usable_address_is_fetch_error(self, dns: FakeResolver) -> None:
        dns.mock.side_effect = None
        dns.mock.return_value = [(socket.AF_UNIX, socket.SOCK_STREAM, 0, "", "/var/run/sock")]

        with pytest.raises(FetchError, match="Could not resolve"):
            await resolve_public_ips("example.com")

    async def test_unresolvable_host_is_fetch_error(self, dns: FakeResolver) -> None:
        dns.mock.side_effect = socket.gaierror("Name or service not known")

        with pytest.raises(FetchError, match="Could not resolve") as excinfo:
            await resolve_public_ips("does-not-exist.example")
        assert isinstance(excinfo.value.__cause__, socket.gaierror)
