"""Fetch remote recipe pages safely: SSRF-guarded, size- and time-capped."""

import ipaddress
import logging
import socket
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

import anyio
import httpx
from anyio import to_thread

from app.config import LOADTEST_ALLOW_PRIVATE_HOSTS
from app.models import AppError, ErrorCode

# Many recipe sites sit behind Cloudflare/WP firewalls that reject default
# python client headers; a full browser-like header set gets the same HTML a
# person would. IP-level blocks (our shared datacenter egress being flagged) can't
# be fixed from here — those fall through to the third-party fetchers below, with
# the paste-HTML fallback as the final resort.
#
# Accept-Encoding must only list codings httpx can decode — advertising one we
# can't (e.g. brotli without the `brotli` dep) returns undecodable bytes, not an
# error. gzip/deflate are built in; br/zstd come from the `brotli` and
# `zstandard` deps. This matches what Chrome sends; a test guards the invariant.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}
TIMEOUT_SECONDS = 6.0
# Whole-fetch deadline (DNS + both fetch attempts + all redirects). The per-client
# timeouts above are per-operation — every socket read resets them — so a
# drip-feeding server could otherwise hold a request slot until Vercel's 30s
# maxDuration kills the function. Finishing under it keeps the error a clean 502.
TOTAL_TIMEOUT_SECONDS = 15.0
MAX_REDIRECTS = 5
MAX_BYTES = 3 * 1024 * 1024
BLOCKED_STATUSES = (401, 402, 403, 429)
REDIRECT_STATUSES = (301, 302, 303, 307, 308)

logger = logging.getLogger(__name__)


class FetchError(AppError):
    """Base fetch failure; an upstream problem, so 502 by default."""

    code = ErrorCode.FETCH_FAILED
    status = 502


class InvalidUrlError(FetchError):
    code = ErrorCode.INVALID_URL
    status = 400


class BlockedUrlError(FetchError):
    """URL points at a non-public address (SSRF attempt or misconfiguration)."""

    code = ErrorCode.BLOCKED_URL
    status = 400


class SiteBlockedError(FetchError):
    """The site refused the request — likely bot protection."""

    code = ErrorCode.SITE_BLOCKED


async def validate_url(url: str) -> httpx.URL:
    """Allow only http(s) URLs whose host resolves to public addresses."""
    try:
        parsed = httpx.URL(url)
    except httpx.InvalidURL as exc:
        raise InvalidUrlError("Not a valid URL") from exc
    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("Only http and https URLs are supported")
    if not parsed.host:
        raise InvalidUrlError("URL has no host")
    await _assert_public_host(parsed.host)
    return parsed


async def _assert_public_host(host: str) -> None:
    """Reject hosts that resolve to private/loopback/link-local/reserved addresses.

    Checked after DNS resolution so a hostname pointing at 127.0.0.1 or
    169.254.x.x is caught, not just literal IPs.

    Accepted residual gap (DNS rebinding): the fetch itself re-resolves the name,
    so a short-TTL attacker can answer public to this check and private to the
    connect. Closing that means pinning the validated IP via a custom transport;
    deliberately skipped — revisit if this ever deploys beside a privileged
    internal network instead of Vercel's.
    """
    # Load-test escape hatch (off unless explicitly set): the mock upstream in
    # docker-compose.loadtest.yml resolves to a private compose-network IP the
    # guard would otherwise reject. Never set in prod — see config.py / LOADTEST.md.
    if LOADTEST_ALLOW_PRIVATE_HOSTS:
        return
    # getaddrinfo is blocking; run it in a thread so a slow DNS lookup can't stall
    # the event loop (which would stall every other request on this instance).
    try:
        infos = await to_thread.run_sync(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise FetchError(f"Could not resolve host {host!r}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise BlockedUrlError(f"Host {host!r} resolves to a non-public address")


async def fetch_page(url: str) -> str:
    """Fetch a page's HTML. Sites that block a plain httpx client (Cloudflare/Akamai
    bot walls) get a second attempt with a real Chrome TLS/JA3 fingerprint before
    giving up — that's enough to get past several major recipe sites' front doors.

    Deliberately doesn't retry a still-blocked cycle: verified against EatingWell
    that the block is IP-reputation based, not a transient fluke — a fresh
    Cloudflare Worker IP got flagged too, after one prior use elsewhere. Retrying
    from the same shared egress pool just doubles latency for no better odds, so
    a block goes straight to the paste-HTML fallback instead.
    """
    try:
        with anyio.fail_after(TOTAL_TIMEOUT_SECONDS):
            target = await validate_url(url)
            try:
                return await _fetch_via_httpx(target)
            except SiteBlockedError as exc:
                logger.warning("httpx blocked on %s (%s); retrying via curl_cffi", target, exc)
                try:
                    html = await _fetch_via_curl_cffi(target)
                except SiteBlockedError as curl_exc:
                    logger.warning("curl_cffi also blocked on %s (%s)", target, curl_exc)
                    raise
                logger.info("curl_cffi fallback succeeded on %s", target)
                return html
    except TimeoutError as exc:
        raise FetchError("Page took too long to fetch") from exc


async def _read_capped_text(chunks: AsyncIterator[bytes], charset: str | None) -> str:
    """Accumulate a (decompressed) body, failing as soon as it exceeds MAX_BYTES —
    the cap must abort the transfer mid-download, not fire after an arbitrarily
    large body already sits in memory."""
    body = bytearray()
    async for chunk in chunks:
        body += chunk
        if len(body) > MAX_BYTES:
            raise FetchError("Page is too large")
    try:
        return body.decode(charset or "utf-8", errors="replace")
    except LookupError:  # bogus charset= in Content-Type
        return body.decode("utf-8", errors="replace")


# A transport's two variable parts, injected into the shared driver below:
#  - open_stream: start one streaming GET (no redirect-following) as an async
#    context manager yielding a response with .status_code/.headers/.charset_encoding
#  - read_body: turn that response's body stream into capped, decoded text
# Everything else — the redirect loop, per-hop SSRF re-validation, blocked/error
# status mapping, and the size cap — is written once here, so httpx and curl_cffi
# can't drift on the security-critical parts (and a third transport is a few lines).
_OpenStream = Callable[[httpx.URL], Any]
_ReadBody = Callable[[Any], Awaitable[str]]


async def _drive_fetch(
    open_stream: _OpenStream,
    read_body: _ReadBody,
    transport_error: type[Exception],
    target: httpx.URL,
) -> str:
    for _ in range(MAX_REDIRECTS + 1):
        try:
            async with open_stream(target) as response:
                status = response.status_code
                if status in REDIRECT_STATUSES:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchError("Redirect response without a Location header")
                    target = await validate_url(str(target.join(location)))
                    continue
                if status in BLOCKED_STATUSES:
                    raise SiteBlockedError(f"Site refused the request (HTTP {status})")
                if status >= 400:
                    raise FetchError(f"Site returned HTTP {status}")
                return await read_body(response)
        except transport_error as exc:
            raise FetchError("Could not fetch page") from exc
    raise FetchError("Too many redirects")


async def _fetch_via_httpx(target: httpx.URL) -> str:
    """Plain httpx client; re-validates the target host on every redirect."""
    async with httpx.AsyncClient(
        timeout=TIMEOUT_SECONDS,
        headers=BROWSER_HEADERS,
        follow_redirects=False,
    ) as client:
        return await _drive_fetch(
            lambda t: client.stream("GET", t),
            lambda r: _read_capped_text(r.aiter_bytes(), r.charset_encoding),
            httpx.HTTPError,
            target,
        )


async def _fetch_via_curl_cffi(target: httpx.URL) -> str:
    """Retry with an impersonated Chrome TLS fingerprint + header order — what actually
    trips bot walls is the httpx/requests TLS signature, not the User-Agent string.

    Imports curl_cffi lazily: it bundles a ~30MB compiled libcurl (vs. httpx's
    ~700KB), and this path only runs for the minority of requests httpx doesn't
    already handle. An eager module-level import would pay that cold-start cost
    on every single request, blocked or not.
    """
    from curl_cffi.requests import AsyncSession
    from curl_cffi.requests.exceptions import RequestException as CurlRequestException

    async with AsyncSession(timeout=TIMEOUT_SECONDS, impersonate="chrome") as session:
        return await _drive_fetch(
            lambda t: session.stream("GET", str(t), allow_redirects=False),
            lambda r: _read_capped_text(r.aiter_content(), r.charset_encoding),
            CurlRequestException,
            target,
        )
