"""The transport-agnostic half of a fetch: redirects and status mapping.

Both transports run through here so httpx and curl_cffi can't drift apart on the
parts that matter for security.
"""

from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.fetching.errors import FetchError, SiteBlockedError
from app.fetching.url_guard import validate_url

MAX_REDIRECTS = 5
BLOCKED_STATUSES = (401, 402, 403, 429)
REDIRECT_STATUSES = (301, 302, 303, 307, 308)

# All a transport has to supply: open_stream starts one streaming GET without
# following redirects, read_body turns the response into capped text.
OpenStream = Callable[[httpx.URL], Any]
ReadBody = Callable[[Any], Awaitable[str]]


async def drive_fetch(
    open_stream: OpenStream,
    read_body: ReadBody,
    transport_error: type[Exception],
    target: httpx.URL,
) -> str:
    """Follow redirects to a page and return its text, whatever the transport.

    Every hop is re-validated; the transport checks where each one resolves.
    """
    for _ in range(MAX_REDIRECTS + 1):
        try:
            async with open_stream(target) as response:
                status = response.status_code
                if status in REDIRECT_STATUSES:
                    location = response.headers.get("location")
                    if not location:
                        raise FetchError("Redirect response without a Location header")
                    target = validate_url(str(target.join(location)))
                    continue
                if status in BLOCKED_STATUSES:
                    raise SiteBlockedError(f"Site refused the request (HTTP {status})")
                if status >= 400:
                    raise FetchError(f"Site returned HTTP {status}")
                return await read_body(response)
        except transport_error as exc:
            raise FetchError("Could not fetch page") from exc
    raise FetchError("Too many redirects")
