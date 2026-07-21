"""Fetch remote recipe pages safely: SSRF-guarded, size- and time-capped."""

import ipaddress
import logging
import os
import socket

import anyio
import httpx
from curl_cffi.requests import AsyncSession
from curl_cffi.requests.exceptions import RequestException as CurlRequestException

# Many recipe sites sit behind Cloudflare/WP firewalls that reject default
# python client headers; a full browser-like header set gets the same HTML a
# person would. (IP-level blocks are handled by the paste-HTML fallback, not here.)
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
TIMEOUT_SECONDS = 10.0
MAX_REDIRECTS = 5
MAX_BYTES = 3 * 1024 * 1024
BLOCKED_STATUSES = (401, 402, 403, 429)
BLOCKED_RETRY_ATTEMPTS = 2
BLOCKED_RETRY_BACKOFF_SECONDS = 1.5

logger = logging.getLogger(__name__)


class FetchError(Exception):
    """Base fetch failure; `code` keys the API error response."""

    code = "fetch_failed"


class InvalidUrlError(FetchError):
    code = "invalid_url"


class BlockedUrlError(FetchError):
    """URL points at a non-public address (SSRF attempt or misconfiguration)."""

    code = "blocked_url"


class SiteBlockedError(FetchError):
    """The site refused the request — likely bot protection."""

    code = "site_blocked"


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
    """
    # Load-test escape hatch (off unless explicitly set): the mock upstream in
    # docker-compose.loadtest.yml resolves to a private compose-network IP the
    # guard would otherwise reject. Never set in prod — see LOADTEST.md.
    if os.environ.get("LOADTEST_ALLOW_PRIVATE_HOSTS"):
        return
    # getaddrinfo is blocking; run it in a thread so a slow DNS lookup can't stall
    # the event loop (which would stall every other request on this instance).
    try:
        infos = await anyio.to_thread.run_sync(socket.getaddrinfo, host, None)
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

    A block can also be down to which IP the current invocation happens to be
    running from (shared serverless egress pool), not the client at all — a
    retry of the whole httpx-then-curl_cffi cycle covers that case.
    """
    target = await validate_url(url)
    for attempt in range(1, BLOCKED_RETRY_ATTEMPTS + 1):
        try:
            return await _fetch_with_fallback(target)
        except SiteBlockedError:
            if attempt == BLOCKED_RETRY_ATTEMPTS:
                raise
            logger.warning(
                "attempt %d/%d blocked on %s; retrying", attempt, BLOCKED_RETRY_ATTEMPTS, target
            )
            await anyio.sleep(BLOCKED_RETRY_BACKOFF_SECONDS)
    raise AssertionError("unreachable")


async def _fetch_with_fallback(target: httpx.URL) -> str:
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


async def _fetch_via_httpx(target: httpx.URL) -> str:
    """Re-validates the target host on every redirect."""
    async with httpx.AsyncClient(
        timeout=TIMEOUT_SECONDS,
        headers=BROWSER_HEADERS,
        follow_redirects=False,
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = await client.get(target)
            except httpx.HTTPError as exc:
                raise FetchError(f"Could not fetch page: {exc}") from exc

            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise FetchError("Redirect response without a Location header")
                target = await validate_url(str(target.join(location)))
                continue

            if response.status_code in BLOCKED_STATUSES:
                raise SiteBlockedError(f"Site refused the request (HTTP {response.status_code})")
            if response.status_code >= 400:
                raise FetchError(f"Site returned HTTP {response.status_code}")
            if len(response.content) > MAX_BYTES:
                raise FetchError("Page is too large")
            return response.text
    raise FetchError("Too many redirects")


async def _fetch_via_curl_cffi(target: httpx.URL) -> str:
    """Retry with an impersonated Chrome TLS fingerprint + header order — what actually
    trips bot walls is the httpx/requests TLS signature, not the User-Agent string.
    """
    async with AsyncSession(timeout=TIMEOUT_SECONDS, impersonate="chrome") as session:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = await session.get(str(target), allow_redirects=False)
            except CurlRequestException as exc:
                raise FetchError(f"Could not fetch page: {exc}") from exc
            logger.info("curl_cffi %s -> HTTP %s", target, response.status_code)

            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("location")
                if not location:
                    raise FetchError("Redirect response without a Location header")
                target = await validate_url(str(target.join(location)))
                continue

            if response.status_code in BLOCKED_STATUSES:
                raise SiteBlockedError(f"Site refused the request (HTTP {response.status_code})")
            if response.status_code >= 400:
                raise FetchError(f"Site returned HTTP {response.status_code}")
            if len(response.content) > MAX_BYTES:
                raise FetchError("Page is too large")
            return response.text
    raise FetchError("Too many redirects")
