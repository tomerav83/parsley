"""config.py reads the environment once, at import, so each case reloads it and
the fixture reloads it again afterwards to put the real values back."""

import importlib
from collections.abc import Callable, Iterator
from types import ModuleType

import pytest

from app import config


@pytest.fixture
def load_config(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[..., ModuleType]]:
    def load(**env: str | None) -> ModuleType:
        for name, value in env.items():
            if value is None:
                monkeypatch.delenv(name, raising=False)
            else:
                monkeypatch.setenv(name, value)
        return importlib.reload(config)

    yield load
    monkeypatch.undo()
    importlib.reload(config)


@pytest.mark.parametrize("value", [None, ""], ids=["unset", "empty"])
def test_rate_limit_storage_defaults_to_memory(
    value: str | None, load_config: Callable[..., ModuleType]
) -> None:
    assert load_config(RATE_LIMIT_STORAGE_URI=value).RATE_LIMIT_STORAGE_URI == "memory://"


def test_rate_limit_storage_reads_the_environment(load_config: Callable[..., ModuleType]) -> None:
    loaded = load_config(RATE_LIMIT_STORAGE_URI="redis://cache:6379/0")

    assert loaded.RATE_LIMIT_STORAGE_URI == "redis://cache:6379/0"
