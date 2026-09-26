"""Turn a streamed, decompressed body into text, capped at MAX_BODY_BYTES."""

import codecs
from collections.abc import AsyncIterator

from app.fetching.errors import FetchError

MAX_BODY_BYTES = 3 * 1024 * 1024


async def decode_body(chunks: AsyncIterator[bytes], charset: str | None) -> str:
    """Read a decompressed body, failing the moment it passes MAX_BODY_BYTES.

    The cap has to abort mid-download; checking afterwards means the oversized body
    is already in memory. Chunks are decoded as they arrive, so the raw bytes are
    never held alongside the text.
    """
    charset = _decodable_charset(charset)
    return "".join([text async for text in decode_chunks(limit_body_size(chunks), charset)])


async def limit_body_size(chunks: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    """Pass chunks through, raising the moment their running total passes MAX_BODY_BYTES."""
    size = 0
    async for chunk in chunks:
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise FetchError("Page is too large")
        yield chunk


async def decode_chunks(chunks: AsyncIterator[bytes], charset: str) -> AsyncIterator[str]:
    """codecs.iterdecode for an async iterator; the stdlib one only takes sync ones.

    The incremental decoder carries a multi-byte character split across two chunks
    over to the next call instead of replacing its halves.
    """
    decoder = codecs.getincrementaldecoder(charset)(errors="replace")
    async for chunk in chunks:
        yield decoder.decode(chunk)
    yield decoder.decode(b"", final=True)


def _decodable_charset(charset: str | None) -> str:
    """The charset if Python can decode text with it, else utf-8.

    A one-byte decode is the public way to ask: it raises LookupError for unknown
    names and for bytes-to-bytes codecs (charset=base64) that would hand the
    incremental decoder's caller bytes instead of str, and ValueError for a name
    with a null byte in it.
    """
    try:
        b"x".decode(charset or "utf-8", errors="replace")
    except (LookupError, ValueError):
        return "utf-8"
    return charset or "utf-8"
