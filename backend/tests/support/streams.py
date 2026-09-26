"""Response bodies as async byte streams, for the size cap and decoding."""

from collections.abc import AsyncIterator

import httpx


async def chunks(*parts: bytes) -> AsyncIterator[bytes]:
    for part in parts:
        yield part


class CountingSource:
    """An effectively endless body that counts how many chunks were pulled."""

    def __init__(self, chunk: bytes, available: int) -> None:
        self.chunk = chunk
        self.available = available
        self.pulled = 0

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for _ in range(self.available):
            self.pulled += 1
            yield self.chunk


async def collect(source: AsyncIterator[bytes]) -> list[bytes]:
    return [chunk async for chunk in source]


class TrackedStream(httpx.AsyncByteStream):
    """A large streamed body that records how much was sent and whether httpx
    closed it."""

    def __init__(self, chunk: bytes = b"x" * 1024 * 1024, available: int = 100) -> None:
        self.chunk = chunk
        self.available = available
        self.sent = 0
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for _ in range(self.available):
            self.sent += len(self.chunk)
            yield self.chunk

    async def aclose(self) -> None:
        self.closed = True
