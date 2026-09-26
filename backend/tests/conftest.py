import socket
from collections.abc import Iterator
from unittest import mock

import pytest

from tests.support.dns import FakeResolver


@pytest.fixture(autouse=True)
def dns() -> Iterator[FakeResolver]:
    """Patch DNS for every test, so none does a real lookup."""
    resolver = FakeResolver()
    with mock.patch("socket.getaddrinfo", side_effect=resolver) as patched:
        resolver.mock = patched
        yield resolver


@pytest.fixture(autouse=True)
def no_network() -> Iterator[None]:
    """Fail any test that opens a real connection, rather than let it pass by
    reaching the internet."""
    refuse = AssertionError("test tried to open a network connection")
    with (
        mock.patch.object(socket.socket, "connect", side_effect=refuse),
        mock.patch.object(socket.socket, "connect_ex", side_effect=refuse),
    ):
        yield
