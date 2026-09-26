from httpx._decoders import SUPPORTED_DECODERS

from app.fetching.transport.browser_headers import BROWSER_HEADERS, HTTPX_DECODABLE_ENCODINGS


def test_every_advertised_encoding_is_decodable() -> None:
    """Advertising a coding with no installed decoder (br without the `brotli`
    dep) makes the server send bytes that come back undecoded: a silent failure,
    not an error."""
    advertised = [c.strip() for c in HTTPX_DECODABLE_ENCODINGS.split(",")]

    assert advertised
    assert set(advertised) <= set(SUPPORTED_DECODERS)


def test_the_headers_advertise_those_encodings() -> None:
    assert BROWSER_HEADERS["Accept-Encoding"] == HTTPX_DECODABLE_ENCODINGS
