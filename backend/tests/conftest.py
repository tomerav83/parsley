import socket

import pytest

PUBLIC_IP = "93.184.216.34"


@pytest.fixture(autouse=True)
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    """Resolve every hostname to a public IP, so no test does a real DNS lookup.
    SSRF tests override it per case."""

    def _fake(host: str, port: object, **_: object) -> list:
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (PUBLIC_IP, 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake)
