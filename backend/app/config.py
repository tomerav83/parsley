"""The one place environment variables are read.

Everything here is a deployment setting, read once at import — nothing tests
toggle. None are required.
"""

import os

# Load-test escape hatches — NEVER set in production (docs/load-testing.md).
# ALLOW_PRIVATE_HOSTS lets the mock upstream's compose-network IP past the SSRF
# guard; DISABLE_RATE_LIMIT stops the limiter 429ing a load test within seconds.
LOADTEST_ALLOW_PRIVATE_HOSTS = bool(os.environ.get("LOADTEST_ALLOW_PRIVATE_HOSTS"))
LOADTEST_DISABLE_RATE_LIMIT = bool(os.environ.get("LOADTEST_DISABLE_RATE_LIMIT"))

# In-memory storage is per instance and resets on cold start, so on Vercel the cap
# is best-effort. Point this at a shared backend (redis://…) to make it global.
RATE_LIMIT_STORAGE_URI = os.environ.get("RATE_LIMIT_STORAGE_URI") or "memory://"
