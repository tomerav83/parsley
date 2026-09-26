import importlib
from collections.abc import Iterator
from types import ModuleType

import pytest

from app import rate_limit
from app.rate_limit import _client_ip, limiter
from tests.support.asgi import request


class TestClientIp:
    @pytest.mark.parametrize(
        ("forwarded", "client"),
        [
            ("203.0.113.7", "203.0.113.7"),
            ("203.0.113.7, 10.0.0.1, 10.0.0.2", "203.0.113.7"),  # first hop is the client
            ("  203.0.113.7  ,10.0.0.1", "203.0.113.7"),
            ("2001:db8::7", "2001:db8::7"),
        ],
    )
    def test_keys_on_the_first_forwarded_hop(self, forwarded: str, client: str) -> None:
        assert _client_ip(request(x_forwarded_for=forwarded)) == client

    def test_falls_back_to_the_peer_without_the_header(self) -> None:
        assert _client_ip(request(peer="198.51.100.9")) == "198.51.100.9"

    def test_empty_header_falls_back_to_the_peer(self) -> None:
        assert _client_ip(request(peer="198.51.100.9", x_forwarded_for="")) == "198.51.100.9"


@pytest.fixture
def reloaded_rate_limit(monkeypatch: pytest.MonkeyPatch) -> Iterator[ModuleType]:
    """app.rate_limit re-imported with RATELIMIT_ENABLED=false in the environment.

    The module's original objects are put back afterwards, since app.main's routes
    are bound to the original limiter.
    """
    original = dict(rate_limit.__dict__)
    monkeypatch.setenv("RATELIMIT_ENABLED", "false")
    yield importlib.reload(rate_limit)
    rate_limit.__dict__.update(original)


class TestLimiter:
    def test_environment_cannot_switch_it_off(self, reloaded_rate_limit: ModuleType) -> None:
        """slowapi reads RATELIMIT_ENABLED from the environment itself; the app
        pins it so no variable outside config.py can switch the limiter off."""
        assert reloaded_rate_limit.limiter.enabled is True

    def test_is_on(self) -> None:
        assert limiter.enabled is True

    def test_keys_on_the_client_ip(self) -> None:
        assert limiter._key_func is _client_ip
