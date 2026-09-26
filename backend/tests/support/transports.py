"""Stand-ins for what the fetch layer drives: drive_fetch's open_stream, and
curl_cffi's AsyncSession."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import anyio
import httpx
from curl_cffi import CurlOpt


class TransportError(Exception):
    """The scripted transport's own failure type."""


class ScriptedTransport:
    """open_stream stand-in: serves canned responses by URL, recording each hop
    and whether its response was closed."""

    def __init__(self, responses: dict[str, httpx.Response | Exception]) -> None:
        self.responses = responses
        self.opened: list[str] = []
        self.closed: list[str] = []

    @asynccontextmanager
    async def open_stream(self, target: httpx.URL) -> AsyncIterator[httpx.Response]:
        url = str(target)
        self.opened.append(url)
        response = self.responses[url]
        if isinstance(response, Exception):
            raise response
        try:
            yield response
        finally:
            self.closed.append(url)


def redirect(status: int, location: str) -> httpx.Response:
    return httpx.Response(status, headers={"location": location})


class FakeCurlResponse:
    def __init__(self, status: int, headers: dict[str, str], body: list[bytes]) -> None:
        self.status_code = status
        self.headers = httpx.Headers(headers)
        self.charset_encoding = httpx.Response(status, headers=headers).charset_encoding
        self.body = body
        self.pulled = 0

    async def aiter_content(self) -> AsyncIterator[bytes]:
        for chunk in self.body:
            self.pulled += 1
            yield chunk


class FakeCurlSession:
    """Stands in for curl_cffi's AsyncSession: serves canned responses by URL and
    records the constructor arguments, each hop's RESOLVE entry and each close."""

    def __init__(self, responses: dict[str, FakeCurlResponse | Exception]) -> None:
        self.responses = responses
        self.kwargs: dict[str, Any] = {}
        self.curl_options: dict[Any, Any] = {}
        self.resolves: list[list[str]] = []
        self.closed: list[str] = []

    def __call__(self, **kwargs: Any) -> "FakeCurlSession":
        self.kwargs = kwargs
        return self

    async def __aenter__(self) -> "FakeCurlSession":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    @asynccontextmanager
    async def stream(
        self, method: str, url: str, allow_redirects: bool
    ) -> AsyncIterator[FakeCurlResponse]:
        assert (method, allow_redirects) == ("GET", False)
        self.resolves.append(self.curl_options[CurlOpt.RESOLVE])
        response = self.responses[url]
        if isinstance(response, Exception):
            raise response
        try:
            yield response
        finally:
            self.closed.append(url)


def curl_ok(
    body: bytes = b"<html>curl</html>", headers: dict[str, str] | None = None
) -> FakeCurlResponse:
    return FakeCurlResponse(200, headers or {}, [body])


async def stall(_target: httpx.URL) -> str:
    """A fetch that never answers in time, for the whole-fetch deadline."""
    await anyio.sleep(5)
    return "too late"
