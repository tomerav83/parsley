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

# Recipe sites behind Cloudflare/WP firewalls reject default python client headers;
# a full browser header set gets the same HTML a person would. IP-level blocks are
# a different problem — those fall through to curl_cffi, then to pasted HTML.
#
# Only advertise Accept-Encoding codings httpx can actually decode: naming one it
# can't returns undecodable bytes rather than an error. gzip/deflate are built in,
# br/zstd come from the extras. A test guards this.
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
# Deadline for the whole fetch: DNS, both attempts, every redirect. TIMEOUT_SECONDS
# is per-operation and resets on each socket read, so without this a drip-feeding
# server could hold the slot until Vercel's 30s maxDuration kills the function.
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
    """Not a URL we can fetch — malformed, or not http(s). The user's mistake, so 400."""

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
    """Reject hosts that resolve to private, loopback, link-local or reserved addresses.

    Resolves first, so a hostname pointing at 127.0.0.1 is caught and not just a
    literal IP.

    Known gap — DNS rebinding: the fetch re-resolves the name, so a short-TTL
    attacker can answer public here and private on the connect. Closing it means
    pinning the validated IP through a custom transport. Worth doing if this ever
    deploys next to a privileged internal network; on Vercel it isn't.
    """
    # Load-test escape hatch: the mock upstream sits on a private compose-network
    # IP. Never set in prod — see config.py.
    if LOADTEST_ALLOW_PRIVATE_HOSTS:
        return
    # getaddrinfo blocks, so a slow lookup on the event loop would stall every
    # other request on this instance.
    try:
        infos = await to_thread.run_sync(socket.getaddrinfo, host, None)
    except socket.gaierror as exc:
        raise FetchError(f"Could not resolve host {host!r}") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise BlockedUrlError(f"Host {host!r} resolves to a non-public address")


async def fetch_page(url: str) -> str:
    """Fetch a page's HTML.

    A site that turns away plain httpx gets one more try with a real Chrome TLS
    fingerprint, which is enough for several major recipe sites' front doors.

    A still-blocked cycle isn't retried. Checked against EatingWell: the block is
    IP reputation, not a fluke — even a fresh Cloudflare Worker IP got flagged
    after one prior use. Trying again from the same egress pool only doubles the
    latency, so a block goes straight to the paste fallback.
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
    """Read a decompressed body, failing the moment it passes MAX_BYTES.

    The cap has to abort mid-download; checking afterwards means the oversized body
    is already in memory.
    """
    body = bytearray()
    async for chunk in chunks:
        body += chunk
        if len(body) > MAX_BYTES:
            raise FetchError("Page is too large")
    try:
        return body.decode(charset or "utf-8", errors="replace")
    except LookupError:  # bogus charset= in Content-Type
        return body.decode("utf-8", errors="replace")


# All a transport has to supply: open_stream starts one streaming GET without
# following redirects, read_body turns the response into capped text.
_OpenStream = Callable[[httpx.URL], Any]
_ReadBody = Callable[[Any], Awaitable[str]]


async def _drive_fetch(
    open_stream: _OpenStream,
    read_body: _ReadBody,
    transport_error: type[Exception],
    target: httpx.URL,
) -> str:
    """Follow redirects to a page and return its text, whatever the transport.

    The redirect loop, the SSRF re-check on every hop, the status mapping and the
    size cap live here so httpx and curl_cffi can't drift apart on the parts that
    matter for security.
    """
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
    """Retry with an impersonated Chrome TLS fingerprint and header order.

    What trips bot walls is httpx's TLS signature, not its User-Agent.

    curl_cffi is imported here rather than at module level: it bundles a ~30MB
    compiled libcurl against httpx's ~700KB, and only the minority of requests
    httpx can't handle ever reach this. Importing it eagerly would put that on
    every cold start.
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
