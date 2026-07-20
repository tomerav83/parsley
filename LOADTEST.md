# Load testing Parsley

Staged plan for verifying the app handles a bare assumption of concurrent
users, and fixing what doesn't. Written 2026-07-19 from parallel research
(frameworks, Vercel platform behavior, KPI practice) — sources cited inline.

## Reality checks that shape the whole plan

1. **Vercel prohibits load testing on Hobby/Pro.** It's a Fair Use Policy
   violation with documented IP blocks ([Vercel KB](https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments),
   [vercel#6134](https://github.com/vercel/vercel/discussions/6134)), and the
   DDoS firewall + burst-scaling ramp (1,000 new concurrent executions per
   10s/region, `503 FUNCTION_THROTTLED` beyond) would distort results anyway.
   → **We load-test the app locally in a prod-like container** sized like one
   Vercel Fluid instance (1 vCPU / 2 GB — [docs](https://vercel.com/docs/functions/limitations)),
   and treat Vercel's horizontal scaling as a platform property we don't verify.
   What we measure is per-instance capacity; Vercel multiplies instances.

2. **"Frontend load testing" for a static SPA on a CDN is a category error.**
   Hammering static assets tests Vercel's CDN, not our code ([k6 guide](https://grafana.com/docs/k6/latest/testing-guides/load-testing-websites/)).
   Frontend performance is a latency question → **Core Web Vitals budget**
   (LCP < 2.5s, INP < 200ms, CLS < 0.1 at p75 — [web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds))
   checked with Lighthouse CI, separate from the load test. The load-bearing
   surface under concurrency is the API.

3. **Load tests must never fetch real recipe sites** (that's DoSing someone
   else, and the results would measure their servers, not our code).
   **`/api/extract` is the primary load target** — the full handler runs
   (validation, SSRF guard, DNS, httpx fetch, redirects, parse); only the far
   end of the outbound socket is swapped for a local mock upstream serving the
   fixture pages with realistic injected latency. `/api/extract-html`
   (parse-only, zero network) runs alongside as the diagnostic control: when
   extract misses p95, it says whether the regression is parse or fetch.

## Tooling: Grafana k6

Single static binary (trivial in CI), declarative `thresholds` that exit
non-zero on breach (a load test *is* a CI gate, no glue code), actively
maintained ([thresholds docs](https://grafana.com/docs/k6/latest/using-k6/thresholds/)).
Locust was the runner-up (Python-native) but needs hand-rolled exit-code
hooks for gating; Gatling/JMeter are too heavy for two endpoints; oha/hey/wrk
have no SLO gating. Frontend budget: **Lighthouse CI** (`lhci autorun`) —
k6-browser hybrid is an optional later add-on, not core.

## KPIs (RED: rate, errors, duration — [Grafana](https://grafana.com/blog/the-red-method-how-to-instrument-your-services/))

Percentiles, not averages ("avg 100ms, p99 2s = two systems" — [qaskills](https://qaskills.sh/blog/performance-test-percentiles-p95-p99-guide)).
p95 is the primary gate; p99 tracked, not gated, at this scale.

| Metric | Target (provisional) | Notes |
|---|---|---|
| `/api/health` p95 | < 100 ms | sanity floor |
| `/api/extract` p95 | < 4 s (p99 < 8 s) | **primary** — full path, mocked upstream at ~500 ms simulated latency |
| `/api/extract-html` p95 | < 1.5 s (p99 < 3 s) | diagnostic control (parse-only); retune both rows to 1.5× measured baseline after Stage 2 |
| Error rate (5xx) | < 1 % | deliberate 4xx excluded |
| Sustained throughput | 5 RPS on extract, 15 min, thresholds green | see sizing below |

**Sizing the "bare assumption".** No traffic data, so per standard practice
([k6 sizing guide](https://grafana.com/docs/k6/latest/testing-guides/calculate-concurrent-users/)):
assume 1,000 visits/day over a 12-h window ≈ 83/h; ~3-min sessions → **~4
concurrent users, ~1 extraction RPS** at peak. Targets are set well above
that (5 RPS sustained, 50-VU stress) so passing means real headroom; the
Stage 4 breakpoint test replaces the assumption with a measured ceiling.

Thresholds are provisional until Stage 2 baselines exist — then re-set at
1.5× baseline p95 (warn) / 2× (fail), per common practice, and ratchet.

## Staged plan

### Stage 0 — prod-like harness (infra)

The dev containers (`--reload`, watchfiles) don't represent production.

- `docker-compose.loadtest.yml`: backend with plain `uvicorn` (no reload),
  `cpus: 1.0`, `mem_limit: 2g` (one Fluid instance); plus a `mock-upstream`
  nginx service serving `backend/tests/fixtures/**/*.html` with ~500 ms
  injected latency (mock-baseline practice: [WireMock](https://www.wiremock.io/post/running-effective-load-tests-using-mocks-and-simulated-environments)).
- Two env escape hatches in the backend, load-env only:
  - `LOADTEST_ALLOW_PRIVATE_HOSTS=1` — the SSRF guard (`fetch.py:_assert_public_host`)
    otherwise rejects the mock upstream's private IP.
  - `LOADTEST_DISABLE_RATE_LIMIT=1` — slowapi's 10/min would 429 the test
    within seconds and measure the limiter, not the app.
- `loadtest/` at repo root: k6 scripts (JS — matches frontend TS fluency),
  fixture payloads, `make loadtest` / `make loadtest-smoke` targets.

### Stage 1 — smoke + baseline scripts

Standard test-type ladder ([Grafana taxonomy](https://grafana.com/load-testing/types-of-load-testing/)),
smallest useful subset:

- `smoke.js` — 1 VU, ~60 s, all three endpoints, thresholds on. Wire into CI
  on PR (cheap, catches "endpoint got slow/broken under trivial load").
- `baseline.js` — average-load: ramp to 5 RPS extract (mocked upstream) +
  1 RPS extract-html as control, hold 15 min, thresholds as the KPI table.
  Run manually / on merge, not per-PR.

### Stage 2 — measure, then fix the code

Run baseline, record numbers in this file, replace provisional thresholds
with measured×1.5. Then fix the known defects, worst first — each fix gets a
before/after baseline run as proof:

1. **Event-loop blocking parse** — ✅ DONE — `extract_recipe` (CPU-bound
   lxml/extruct) ran sync inside `async def` handlers: one slow parse stalled
   every concurrent request on the instance, and Fluid instances routinely
   multiplex dozens of requests ([Fluid docs](https://vercel.com/docs/fluid-compute)).
   Fixed: `extract_html` is now a plain `def` (FastAPI threadpools it) and
   `extract` runs the parse via `anyio.to_thread.run_sync`. Shipped alongside a
   bigger single-request win: `extract_recipe` now reduces the page to
   `<head>` + JSON-LD before handing it to recipe-scrapers, whose default
   BeautifulSoup builds a full Python DOM over the *whole* multi-MB page (7.5 s
   of a 7.6 s parse in a profile) purely for `<head>` opengraph fallbacks.
   Measured: a 2.5 MB JSON-LD page went 2377 ms → 52 ms (~45x), identical
   output, with a full-page fallback for body-microdata sites. Proof is a Stage
   3 stress run (average-load baseline can't surface either — the loop never
   saturates at 5 RPS).
2. **Blocking DNS in async path** — `_assert_public_host` calls sync
   `socket.getaddrinfo` (`fetch.py:79`); same stall, seconds-long on slow DNS.
   Fix: `loop.getaddrinfo()` (or anyio thread) — keeps the SSRF check identical.
3. **Rate limiter is fiction on serverless** — slowapi in-memory counters are
   per-instance; on elastic instances the effective limit is
   `10/min × instance_count`, varying minute to minute, and counters vanish on
   recycle ([slowapi#226](https://github.com/laurentS/slowapi/issues/226)).
   Fix (pick one): Vercel WAF rate-limit rule at the edge (no code, first-party)
   or Upstash Redis as slowapi `storage_uri`. Edge rule preferred — deletes
   the problem instead of adding a dependency.

### Stage 3 — stress, spike, breakpoint

With fixes in: `stress.js` ramp to 50 VUs (find degradation shape),
`spike.js` 0→100 VUs burst (the "recipe link hits HN" case — recovery matters
more than latency), one breakpoint run (ramp until 5xx/timeout) to record the
actual per-instance ceiling here. Soak is skipped: stateless
serverless + static SPA has minimal leak surface, and it's the standard first
cut for small projects.

### Stage 4 — frontend budget (parallel-track, independent of Stages 0-3)

Lighthouse CI against a preview URL with CWV-proxy budget asserts
(LCP < 2.5 s, CLS < 0.1, TBT as INP lab proxy — INP needs field data).
Optional later: k6-browser hybrid (a few browser VUs measuring vitals while
protocol VUs load the API) if we ever want "UX under load" evidence
([k6 hybrid](https://grafana.com/docs/k6/latest/testing-guides/load-testing-websites/)).

## Definition of done

- `make loadtest-smoke` green in CI on every PR.
- `make loadtest` (baseline) green against measured thresholds after the
  Stage 2 fixes, numbers recorded below.
- Breakpoint ceiling recorded below; rate limiting enforced at the edge.

### Recorded baselines

| Date | Commit | Scenario | p50 | p95 | p99 | Error % | Notes |
|---|---|---|---|---|---|---|---|
| 2026-07-20 | 0c15303 | baseline / extract (5 RPS, 15m) | 521 ms | 543 ms | 557 ms | 0 % | pre-fix. p95 ≈ 500 ms mock latency + ~42 ms overhead; instance near-idle (max 3 VUs) so this is the floor, not the ceiling — the blocking-parse defect bites under Stage 3 concurrency, not here |
| 2026-07-20 | 0c15303 | baseline / extract-html (1 RPS, 15m) | 4.1 ms | 13.9 ms | 21.4 ms | 0 % | pre-fix. 7/931 requests hit `connection reset by peer` — uvicorn's 5 s keepalive idle-timeout racing k6 connection reuse at 1 RPS (extract, at 5 RPS, had 0 resets). Not a 5xx, not the blocking-parse defect; a load-gen artifact (reproduced next run: 4 EOF/reset, still 0 5xx). Mitigated by `--timeout-keep-alive 65` on the harness backend |

Thresholds ratcheted off this baseline (commit 0c15303): extract p95 4000→1000 ms,
extract-html p95 1500→100 ms. extract-html's gate is generous relative to its
14 ms baseline (the ×1.5/×2 rule yields a ~28 ms gate that flakes on a
variance-dominated sub-20 ms endpoint); at 100 ms it still catches the
blocking-parse regression decisively (that manifests as hundreds of ms).
