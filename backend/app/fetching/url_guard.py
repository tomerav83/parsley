"""The SSRF guard: which URLs may be fetched, and which addresses they may reach.

The transports call resolve_public_ips at connect time and connect only to the
IPs it returns. Checking in one step and letting the client resolve again in
another is the DNS-rebinding gap: a short-TTL name answers public to the check
and private to the connect.
"""

import ipaddress
import socket
from functools import partial

import httpx
from anyio import to_thread

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


def validate_url(url: str) -> httpx.URL:
    """Allow only http(s) URLs with a host. Where the host points is checked on connect."""
    try:
        parsed = httpx.URL(url)
    except httpx.InvalidURL as exc:
        raise InvalidUrlError("Not a valid URL") from exc
    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("Only http and https URLs are supported")
    if not parsed.host:
        raise InvalidUrlError("URL has no host")
    return parsed


def ip_allowed(ip: IPAddress) -> bool:
    """Public addresses only: no private, loopback, link-local or reserved ranges."""
    return ip.is_global


async def resolve_public_ips(host: str) -> list[str]:
    """Resolve a host and return the addresses to connect to, in resolver order.

    Every address must pass, so a name mixing public and private answers is
    refused outright. A literal IP resolves to itself.
    """
    # getaddrinfo blocks, so a slow lookup on the event loop would stall every
    # other request on this instance. SOCK_STREAM stops each address coming back
    # once per socket type.
    try:
        infos = await to_thread.run_sync(
            partial(socket.getaddrinfo, host, None, type=socket.SOCK_STREAM)
        )
    except socket.gaierror as exc:
        raise FetchError(f"Could not resolve host {host!r}") from exc
    # Drop any IPv6 zone index (fe80::1%eth0): it names a local interface, and
    # the pinned URL can't carry it.
    ips = [
        ipaddress.ip_address(str(info[4][0]).split("%", 1)[0])
        for info in infos
        if info[0] in (socket.AF_INET, socket.AF_INET6)
    ]
    if not ips:
        raise FetchError(f"Could not resolve host {host!r}")
    if not all(ip_allowed(ip) for ip in ips):
        raise BlockedUrlError(f"Host {host!r} resolves to a non-public address")
    return [str(ip) for ip in ips]
