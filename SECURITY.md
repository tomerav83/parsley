# Security policy

## Reporting a vulnerability

Use GitHub's private reporting —
[**Report a vulnerability**](https://github.com/tomerav83/parsley/security/advisories/new)
on the Security tab. It opens a private thread with the maintainer; please don't
open a public issue for anything exploitable.

A useful report says what an attacker can reach, and how you got there. Expect a
first reply within a week. There is one deployment and one supported version:
whatever `master` is.

## What's worth reporting

Parsley has no accounts, no database and no secrets. It stores nothing between
requests, so the interesting surface is small and mostly one thing: **the backend
fetches a URL you give it.**

- **The SSRF guard** (`backend/app/fetch.py`) resolves the host first and rejects
  non-public addresses, re-validating every redirect hop. A way past it — a
  scheme, an encoding, a redirect shape, an address class it doesn't cover — is
  the highest-value bug in this repo.
- **Resource exhaustion** through the fetcher: the size cap, the timeouts, or the
  decompression path.
- **Anything that escapes the recipe rendering.** Recipe text is untrusted
  scraped content; image URLs are filtered to `http(s)` before they reach the
  DOM.

## Already known, on purpose

These are documented decisions rather than oversights — a report is still welcome
if you can show the risk is worse than the write-up assumes:

- **DNS rebinding.** The guard validates the address it resolves, then hands the
  hostname to httpx, which resolves again. The window is accepted rather than
  closed — [decision 8](docs/decisions.md#8--ssrf-guard-resolves-dns-first-the-rebinding-gap-is-accepted).
- **Rate limiting is best-effort.** It is per-instance and in-memory, so it caps
  a single client, not a distributed one —
  [decision 12](docs/decisions.md#12--rate-limiting-is-best-effort-by-design--for-now).
- **`LOADTEST_*` environment variables disable safety rails** —
  `LOADTEST_ALLOW_PRIVATE_HOSTS` turns off the SSRF guard outright. They exist
  for the local load-test harness and must never be set in a deployment. Finding
  them set on a live instance *is* a vulnerability; the mechanism itself isn't.
