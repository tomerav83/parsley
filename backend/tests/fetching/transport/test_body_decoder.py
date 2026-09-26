import pytest

from app.fetching.errors import FetchError
from app.fetching.transport.body_decoder import (
    MAX_BODY_BYTES,
    _decodable_charset,
    decode_body,
    decode_chunks,
    limit_body_size,
)
from tests.support.streams import CountingSource, chunks, collect

MB = 1024 * 1024


class TestLimitBodySize:
    async def test_body_exactly_at_the_cap_passes(self) -> None:
        body = b"x" * MAX_BODY_BYTES

        assert await collect(limit_body_size(chunks(body))) == [body]

    async def test_one_byte_over_the_cap_fails(self) -> None:
        with pytest.raises(FetchError, match="too large"):
            await collect(limit_body_size(chunks(b"x" * MAX_BODY_BYTES, b"x")))

    async def test_stops_pulling_the_moment_the_cap_is_passed(self) -> None:
        """Checking after the download means the oversized body is already in
        memory; the breaching chunk must be the last one read."""
        source = CountingSource(b"x" * MB, available=100)
        passed: list[bytes] = []

        with pytest.raises(FetchError):
            async for chunk in limit_body_size(source.__aiter__()):
                passed.append(chunk)

        assert source.pulled == MAX_BODY_BYTES // MB + 1
        assert sum(map(len, passed)) <= MAX_BODY_BYTES, "a chunk past the cap was passed on"

    async def test_empty_body_passes(self) -> None:
        assert await collect(limit_body_size(chunks())) == []


class TestDecodeChunks:
    async def test_multibyte_character_split_across_chunks(self) -> None:
        encoded = "café".encode()  # "é" is two bytes

        text = "".join([t async for t in decode_chunks(chunks(encoded[:4], encoded[4:]), "utf-8")])

        assert text == "café"

    async def test_malformed_bytes_become_replacement_characters(self) -> None:
        text = "".join([t async for t in decode_chunks(chunks(b"ok \xff\xfe ok"), "utf-8")])

        assert text == "ok �� ok"

    async def test_truncated_final_character_is_flushed_as_replacement(self) -> None:
        text = "".join([t async for t in decode_chunks(chunks("é".encode()[:1]), "utf-8")])

        assert text == "�"


class TestDecodableCharset:
    @pytest.mark.parametrize("charset", ["utf-8", "latin-1", "windows-1252", "utf-16"])
    def test_keeps_a_text_encoding(self, charset: str) -> None:
        assert _decodable_charset(charset) == charset

    @pytest.mark.parametrize(
        "charset",
        [
            None,  # no charset in Content-Type
            "",
            "bogus",  # unknown name: LookupError
            "base64",  # bytes-to-bytes codec: LookupError from bytes.decode
            "hex",
            "rot13",  # str-to-str codec
            "utf\x00x",  # null byte in the name: ValueError
        ],
    )
    def test_falls_back_to_utf8(self, charset: str | None) -> None:
        assert _decodable_charset(charset) == "utf-8"


class TestDecodeBody:
    async def test_decodes_with_the_declared_charset(self) -> None:
        assert await decode_body(chunks(b"caf\xe9"), "latin-1") == "café"

    @pytest.mark.parametrize("charset", [None, "bogus", "base64", "utf\x00x"])
    async def test_undecodable_charset_falls_back_to_utf8(self, charset: str | None) -> None:
        encoded = "café".encode()

        assert await decode_body(chunks(encoded[:4], encoded[4:]), charset) == "café"

    async def test_enforces_the_size_cap(self) -> None:
        with pytest.raises(FetchError, match="too large"):
            await decode_body(chunks(b"x" * (MAX_BODY_BYTES + 1)), "utf-8")

    async def test_empty_body_is_empty_text(self) -> None:
        assert await decode_body(chunks(), "utf-8") == ""
