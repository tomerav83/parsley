"""The fetch errors' codes and statuses are part of the API contract; their
hierarchy is what lets drive_fetch and fetch_page catch them."""

import pytest

from app.fetching.errors import BlockedUrlError, FetchError, InvalidUrlError, SiteBlockedError
from app.models import AppError, ErrorCode


@pytest.mark.parametrize(
    ("error", "code", "status"),
    [
        (FetchError, ErrorCode.FETCH_FAILED, 502),
        (InvalidUrlError, ErrorCode.INVALID_URL, 400),
        (BlockedUrlError, ErrorCode.BLOCKED_URL, 400),
        (SiteBlockedError, ErrorCode.SITE_BLOCKED, 502),
    ],
)
def test_code_and_status(error: type[FetchError], code: ErrorCode, status: int) -> None:
    assert (error.code, error.status) == (code, status)


@pytest.mark.parametrize("error", [InvalidUrlError, BlockedUrlError, SiteBlockedError])
def test_every_fetch_error_is_a_fetch_error(error: type[FetchError]) -> None:
    assert issubclass(error, FetchError)
    assert issubclass(error, AppError)


@pytest.mark.parametrize("error", [FetchError, InvalidUrlError, BlockedUrlError, SiteBlockedError])
def test_own_message_reaches_the_client(error: type[FetchError]) -> None:
    """No fetch error sets `detail`, so the message raised is what the client sees."""
    assert error.detail is None
