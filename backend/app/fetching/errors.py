"""Everything the fetch layer can raise; the route maps each to its status and code."""

from app.models import AppError, ErrorCode


class FetchError(AppError):
    """Base fetch failure; an upstream problem, so 502 by default."""

    code = ErrorCode.FETCH_FAILED
    status = 502


class InvalidUrlError(FetchError):
    """Not a URL we can fetch — malformed, or not http(s). The user's mistake, so 400."""

    code = ErrorCode.INVALID_URL
    status = 400


class BlockedUrlError(FetchError):
    """URL points at a non-public address (SSRF attempt or misconfiguration)."""

    code = ErrorCode.BLOCKED_URL
    status = 400


class SiteBlockedError(FetchError):
    """The site refused the request — likely bot protection."""

    code = ErrorCode.SITE_BLOCKED
