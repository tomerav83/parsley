"""The two HTTP clients a fetch can go through; each plugs into drive_fetch."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx

from app.fetching.transport.body_decoder import decode_body
from app.fetching.transport.browser_headers import BROWSER_HEADERS
from app.fetching.transport.drive import drive_fetch
from app.fetching.url_guard import resolve_public_ips

TIMEOUT_SECONDS = 6.0


class PublicOnlyTransport(httpx.AsyncHTTPTransport):
    """An httpx transport that only connects to checked public IPs.

    Resolves the host once, checks it, and rewrites the URL to an IP, so httpx
    never resolves the name itself. The name stays everywhere the server looks for
    it: the Host header (set from the original URL, which this leaves alone) and
    the TLS server name, which is also what the certificate is verified against.
    Every request goes through here, so redirect hops are covered too.

    Keep-alive is off: the pool keys connections on the rewritten origin (IP and
    port), so a redirect to another name on the same IP would otherwise reuse a
    TLS session negotiated for the first name.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(limits=httpx.Limits(max_keepalive_connections=0), **kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        request.extensions = {**request.extensions, "sni_hostname": host}
        ips = await resolve_public_ips(host)
        # The same fallback across addresses the resolver's own connect would give.
        for ip in ips:
            request.url = request.url.copy_with(host=ip)
            try:
                return await super().handle_async_request(request)
            except (httpx.ConnectError, httpx.ConnectTimeout):
                if ip == ips[-1]:
                    raise
        raise AssertionError("resolve_public_ips returned no address")


async def fetch_via_httpx(target: httpx.URL) -> str:
    """Plain httpx client, pinned to the checked IP on every hop.

    trust_env is off because an HTTP(S)_PROXY in the environment would route
    around the pinned transport.
    """
    async with httpx.AsyncClient(
        transport=PublicOnlyTransport(),
        timeout=TIMEOUT_SECONDS,
        headers=BROWSER_HEADERS,
        follow_redirects=False,
        trust_env=False,
    ) as client:
        return await drive_fetch(
            lambda t: client.stream("GET", t),
            lambda r: decode_body(r.aiter_bytes(), r.charset_encoding),
            httpx.HTTPError,
            target,
        )


async def fetch_via_curl_cffi(target: httpx.URL) -> str:
    """Retry with an impersonated Chrome TLS fingerprint and header order.

    What trips bot walls is httpx's TLS signature, not its User-Agent.

    curl_cffi is imported here rather than at module level: it bundles a ~30MB
    compiled libcurl against httpx's ~700KB, and only the minority of requests
    httpx can't handle ever reach this. Importing it eagerly would put that on
    every cold start.
    """
    from curl_cffi import CurlOpt
    from curl_cffi.requests import AsyncSession
    from curl_cffi.requests.exceptions import RequestException as CurlRequestException

    async with AsyncSession(
        timeout=TIMEOUT_SECONDS, impersonate="chrome", trust_env=False
    ) as session:

        @asynccontextmanager
        async def open_stream(t: httpx.URL) -> AsyncIterator[Any]:
            # curl's own answer to PublicOnlyTransport: CURLOPT_RESOLVE seeds its DNS
            # cache with the checked IPs (curl tries them in turn), so it never looks
            # the name up itself and the URL, SNI and certificate check all keep the
            # name. The session lives for one fetch and hops run in turn, so
            # resetting it per hop is safe.
            ips = await resolve_public_ips(t.host)
            port = t.port or (443 if t.scheme == "https" else 80)
            addresses = ",".join(f"[{ip}]" if ":" in ip else ip for ip in ips)
            # curl_cffi types curl_options values as str, but setopt iterates
            # RESOLVE's value, so it has to be a list; a str would go char by char.
            session.curl_options[CurlOpt.RESOLVE] = [f"{t.host}:{port}:{addresses}"]  # pyright: ignore[reportArgumentType]
            async with session.stream("GET", str(t), allow_redirects=False) as response:
                yield response

        return await drive_fetch(
            open_stream,
            lambda r: decode_body(r.aiter_content(), r.charset_encoding),
            CurlRequestException,
            target,
        )
