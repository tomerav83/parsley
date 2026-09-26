"""The headers a real Chrome sends when you open a page, so httpx looks like one.

Recipe sites behind Cloudflare/WP firewalls turn away requests that don't look like
a browser; with these they serve the same HTML a person gets. Blocks on the IP
itself are a different problem: those fall through to curl_cffi, then to pasted HTML.
"""

# Every coding here must have an installed httpx decoder (test_browser_headers checks).
HTTPX_DECODABLE_ENCODINGS = "gzip, deflate, br, zstd"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": HTTPX_DECODABLE_ENCODINGS,
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}
