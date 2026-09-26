"""Bare Starlette requests, for code that reads the request without a route."""

from starlette.requests import Request


def request(peer: str = "10.0.0.1", **headers: str) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.replace("_", "-").encode(), v.encode()) for k, v in headers.items()],
            "client": (peer, 12345),
        }
    )
