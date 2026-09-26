"""Fetch remote recipe pages safely: SSRF-guarded, size- and time-capped."""

import logging

import anyio
import httpx

from app.fetching.errors import FetchError, SiteBlockedError
from app.fetching.transport.clients import fetch_via_curl_cffi, fetch_via_httpx
from app.fetching.url_guard import validate_url

# Deadline for the whole fetch: DNS, both attempts, every redirect. The transports'
# TIMEOUT_SECONDS is per-operation and resets on each socket read, so without this a
# drip-feeding server could hold the slot until Vercel's 30s maxDuration kills the
# function.
TOTAL_TIMEOUT_SECONDS = 15.0

logger = logging.getLogger(__name__)


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
            target = validate_url(url)
            try:
                return await fetch_via_httpx(target)
            except SiteBlockedError as exc:
                logger.warning("httpx blocked on %s (%s); retrying via curl_cffi", target, exc)
                return await _retry_via_curl_cffi(target)
    except TimeoutError as exc:
        raise FetchError("Page took too long to fetch") from exc


async def _retry_via_curl_cffi(target: httpx.URL) -> str:
    """The one retry a blocked page gets, logging whether it got through."""
    try:
        html = await fetch_via_curl_cffi(target)
    except SiteBlockedError as exc:
        logger.warning("curl_cffi also blocked on %s (%s)", target, exc)
        raise
    logger.info("curl_cffi fallback succeeded on %s", target)
    return html
