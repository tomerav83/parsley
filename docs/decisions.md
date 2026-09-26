# Decisions

Why Parsley is built the way it is. Each record states the decision, what was
rejected, what it costs, and the trigger that would reopen it. Newest last.

Where a decision is load-bearing in the code, the comment there points back at
its number here.

**Product and extraction** — [1 schema.org JSON-LD](#1--extract-from-schemaorgrecipe-json-ld-not-per-site-scrapers)
· [2 stateless](#2--stateless-v1--no-database-no-accounts)
· [3 paste fallback](#3--paste-html-fallback-for-sites-that-block-server-side-fetching)
· [9 reduce before parse](#9--reduce-the-page-to-head--json-ld-before-parsing)
· [11 curl_cffi](#11--curl_cffi-chrome-impersonation-on-a-bot-block)

**API and backend** — [4 same-origin](#4--same-origin-relative-api-no-cors)
· [5 one Vercel project](#5--one-vercel-project-with-two-services)
· [6 contract.json](#6--contractjson-at-the-root-asserted-from-both-sides)
· [7 typed errors](#7--errors-carry-their-own-status-one-handler-renders-them)
· [8 SSRF guard](#8--ssrf-guard-checks-at-connect-time-and-pins-the-ip)
· [10 off the event loop](#10--cpu-bound-work-runs-off-the-event-loop)
· [12 rate limiting](#12--rate-limiting-is-best-effort-by-design--for-now)
· [13 one config file](#13--environment-variables-are-read-in-exactly-one-file)

**Frontend** — [14 no TanStack Query](#14--hand-rolled-extraction-data-layer-not-tanstack-query)
· [15 router data mode](#15--react-router-data-mode-the-recipe-route-uses-a-loader)
· [16 failures on the transition screen](#16--failures-surface-on-the-transition-screen)
· [17 session cache](#17--sessionstorage-recipe-cache-ten-entry-lru)
· [18 validate at the boundary](#18--validate-api-responses-at-the-network-boundary)
· [19 own ingredient splitter](#19--own-ingredient-splitter-instead-of-npm-parse-ingredient)
· [20 no barrels](#20--one-folder-per-component-no-barrel-files)
· [21 recipe view code-split](#21--the-recipe-view-stays-off-the-first-paint-enforced-by-lint)
· [22 wave choreography](#22--liquid-wave-choreography-with-the-view-transition-as-fallback)

**Testing, CI and operations** — [23 two test environments](#23--two-test-environments-split-by-what-they-need)
· [24 Argos VRT](#24--visual-regression-through-argos-no-baselines-in-git)
· [25 coverage ratchet](#25--coverage-thresholds-ratchet-themselves)
· [26 step-level CI skips](#26--ci-skips-are-step-level-if-never-workflow-paths)
· [27 local load testing](#27--load-testing-runs-locally-against-a-prod-like-container)
· [28 k6](#28--k6-and-its-thresholds-are-the-gate)
· [29 trend-based baseline](#29--the-nightly-baseline-compares-trend-not-absolute-numbers)
· [30 Compose dev stack](#30--docker-compose-for-dev-with-a-proxy-that-mirrors-production-routing)

---

## 1 · Extract from `schema.org/Recipe` JSON-LD, not per-site scrapers

**Context.** Recipe pages bury the recipe under a personal essay, ads and pop-ups.
Getting the recipe out is the whole product.

**Decision.** Use [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers)
with `supported_only=False`, which reads the `schema.org/Recipe` JSON-LD that
sites already embed for Google rich results. One standards-based path covers
almost every site.

**Rejected.** Per-site scrapers (a maintenance treadmill: every site redesign
breaks one). An LLM extraction pass (per-request cost and latency, non-deterministic
output, for a problem structured data already solves).

**Consequences.** Sites with no recipe markup fail with `no_recipe` rather than
degrading — accepted, because a wrong recipe is worse than an honest failure.
`extract_recipe` falls back to parsing the full page for the minority of sites
whose recipe is in body microdata.

**Reopen when.** Real-world failures cluster on sites that have machine-readable
recipes in some other form.

## 2 · Stateless v1 — no database, no accounts

**Context.** The app takes a URL and returns a recipe. Nothing about that needs
to be remembered server-side.

**Decision.** No database, no sessions, no auth. Every request is self-contained,
which is also what makes serverless deployment free of state concerns.

**Rejected.** Building the saved-recipe box up front.

**Consequences.** No recipe survives the tab beyond the session cache
([#17](#17--sessionstorage-recipe-cache-ten-entry-lru)).

**Reopen when.** The saved recipe box gets built — see
[motivation.md](motivation.md#roadmap). `ExtractionService` is where the
repository dependency would be injected.

## 3 · Paste-HTML fallback for sites that block server-side fetching

**Context.** Some publishers block datacenter IPs outright (People Inc. sites
answer 402). Their pages open fine in a person's own browser.

**Decision.** A second endpoint, `POST /api/extract-html`, runs the identical
extraction over HTML the user pasted from their browser. The UI offers it exactly
when the error code says fetching is the problem (`site_blocked`, `fetch_failed`).

**Rejected.** A proxy or residential-IP service (cost, and it escalates an arms
race). Giving up on those sites (they are some of the most-linked recipe sites
there are).

**Consequences.** Recovery is manual — view source, copy, paste. It is the last
resort in a ladder that tries everything automatic first
([#11](#11--curl_cffi-chrome-impersonation-on-a-bot-block)). A pasted recipe can
never be re-fetched, which is why the cache exists.

## 4 · Same-origin: relative `/api/*`, no CORS

**Context.** The SPA and the API are separate deployables.

**Decision.** The frontend only ever calls relative `/api/*`. A rewrite in front
of both routes `/api` to the backend: `vercel.json` in production, `nginx.conf`
locally at `:8080`, the Vite dev-server proxy at `:5173`.

**Rejected.** An absolute API base URL with CORS — that means a `VITE_API_BASE`
per environment, a preflight on every request, and an allowlist to keep in sync.

**Consequences.** No CORS configuration anywhere, and no environment variable is
required for the app to work. The cost is that "how does `/api` get to the
backend" is answered in three places, one per environment, and they have to agree.
`nginx.conf` exists specifically so local QA exercises the production routing shape.

## 5 · One Vercel project with two services

**Context.** Deploying the SPA and the API as two Vercel projects put them on two
origins, which breaks [#4](#4--same-origin-relative-api-no-cors).

**Decision.** One project rooted at the repo, with `services.frontend` and
`services.backend` declared in `vercel.json` and top-level rewrites in front of
them. Vercel builds each service independently.

**Consequences.** A frontend-only change doesn't rebuild the backend. Routing
*into* a service is final, so the SPA history fallback has to live inside the
frontend service's own `rewrites` — without it, a hard load of `/recipe?url=…`
404s. See [deploy.md](deploy.md).

## 6 · `contract.json` at the root, asserted from both sides

**Context.** The `Recipe` shape and the error-code taxonomy are duplicated by
necessity: pydantic models on one side, a zod schema and a code union on the other.
Drift is silent until something breaks in the UI.

**Decision.** A single `contract.json` at the repo root lists the recipe field
names and the backend error codes. `backend/tests/test_contract.py` fails if the
pydantic models drift from it; `frontend/src/lib/contract.test.ts` fails if the
client does.

**Rejected.** Generating a client from the OpenAPI schema (a build step and a
generated artifact to keep current, for one endpoint pair). Trusting review to
catch drift.

**Consequences.** An intentional contract change is a three-file commit:
`contract.json`, the models, the schema. The failing test prints the current
values, so updating it is mechanical.

## 7 · Errors carry their own status; one handler renders them

**Context.** Every failure the API returns needs a stable machine-readable code
so the UI can choose the right recovery affordance, plus an HTTP status.

**Decision.** `AppError` subclasses set `code` (from the `ErrorCode` enum),
`status`, and optionally `detail` to pin the user-facing message. One handler in
`main.py` renders any `AppError` to an `ErrorResponse`.

**Rejected.** A code→status lookup table (two things to keep in sync). Raising
`HTTPException` at each site (loses the typed taxonomy).

**Consequences.** Adding an error is a class with two class attributes, and it is
automatically enumerable for [#6](#6--contractjson-at-the-root-asserted-from-both-sides).

## 8 · SSRF guard checks at connect time and pins the IP

**Context.** The service fetches URLs supplied by anyone on the internet.

**Decision.** `validate_url` allows only http/https. At connect time,
`resolve_public_ips` resolves the host and rejects it if any answer isn't a global
address, and the client then connects only to those IPs: httpx through
`PublicOnlyTransport` (URL rewritten to the IP, name kept in the Host header and TLS
server name, no keep-alive so hops never share a connection), curl_cffi through
`CURLOPT_RESOLVE`. Runs on every redirect hop. Plus a 3 MB body cap enforced mid-stream, a 6 s per-operation
timeout, a 15 s whole-fetch deadline, and a 5-redirect limit.

**Rejected.** Checking the literal host string only (a hostname pointing at
127.0.0.1 walks straight through).

**Consequences.** DNS rebinding is closed: neither client resolves the name
itself, so a short-TTL answer that turns private after the check never reaches a
socket. Both clients run with `trust_env` off, since an env proxy would route
around the pin. The first version resolved, checked, then let the client resolve
again, and accepted that window; it was closed when the fetch layer was split up.
Only the first resolved address is tried — no fallback to the next when it's
unreachable.

## 9 · Reduce the page to `<head>` + JSON-LD before parsing

**Context.** `recipe-scrapers` builds a BeautifulSoup tree over the whole page
with the pure-Python parser. Real recipe pages are multi-megabyte. A profile
showed 7.5 s of a 7.6 s parse spent building that tree — used only for `<head>`
opengraph fallbacks, because the recipe itself is read out of the JSON-LD string.

**Decision.** `reduce_html` (`extraction/html_reducer.py`) uses lxml's C parser to cut the page down to `<head>`
plus its `ld+json` scripts and parses that instead. No JSON-LD, or a parse
failure, returns `None` and the full page is used.

**Consequences.** Measured 2377 ms → 52 ms on a 2.5 MB page, byte-identical
output. Sites whose recipe lives in body microdata pay one extra reduced-parse
attempt before the full-page fallback.

## 10 · CPU-bound work runs off the event loop

**Context.** Under concurrency, one slow parse stalled every other request on the
instance — a 50-VU run measured `/api/health` p95 at 1.07 s.

**Decision.** `ExtractionService` runs the parse through `anyio.to_thread.run_sync`,
and `resolve_public_ips` does the same for the blocking `socket.getaddrinfo`.

**Consequences.** Health p95 under a 50-VU parse-heavy load dropped to 546 ms,
and the remaining elevation is single-core CPU contention rather than a blocked
loop. Measurements in [load-testing.md](load-testing.md#recorded-baselines).

## 11 · curl_cffi Chrome impersonation on a bot block

**Context.** Browser-like headers get past most WordPress and Cloudflare
configurations, but not all — what trips the rest is the TLS/JA3 fingerprint of
the HTTP client, which no header can disguise.

**Decision.** On a blocked status (401/402/403/429), retry once through
`curl_cffi` with `impersonate="chrome"`. Imported lazily: it bundles ~30 MB of
compiled libcurl against httpx's ~700 KB, and only a minority of requests reach
this path.

**Rejected.** Retrying the whole httpx→curl_cffi cycle on a still-blocked result.
Verified against EatingWell that these blocks are IP-reputation based, not
transient — a fresh Cloudflare Worker IP was flagged too. Retrying from the same
egress pool doubles latency for no better odds.

**Consequences.** Both transports share `drive_fetch`, so the redirect loop, the
per-hop SSRF re-validation and the size cap are written once and can't drift on
the security-critical parts. A still-blocked page goes straight to
[#3](#3--paste-html-fallback-for-sites-that-block-server-side-fetching).

## 12 · Rate limiting is best-effort, by design — for now

**Context.** `slowapi` keeps its counters in memory. On Vercel's elastic instances
that means the limit is per instance, so the effective cap is
`10/min × live instances` and resets on every cold start.

**Decision.** Ship the in-memory limiter anyway. It is abuse control for a
low-traffic demo, not a quota system. `RATE_LIMIT_STORAGE_URI` is wired through
to `Limiter(storage_uri=…)` so pointing it at Redis is a config change.

**Consequences.** The `10/minute` cap in `main.py` is a rough ceiling, not a
guarantee — this is an open defect, tracked in
[load-testing.md](load-testing.md#stage-2--measure-then-fix-the-code). The
preferred fix is a Vercel WAF rate-limit rule at the edge: it deletes the problem
rather than adding a dependency.

**Reopen when.** The demo attracts enough traffic for the cap to matter.

## 13 · Environment variables are read in exactly one file

**Decision.** `backend/app/config.py` is the only module that touches
`os.environ`. Everything else imports the resolved value.

**Consequences.** The app's entire tunable surface is one short file, mirrored by
`.env.example`. Nothing is required — the app runs on defaults and uses no
secrets. Tests never toggle these; they're deployment-time settings.

## 14 · Hand-rolled extraction data layer, not TanStack Query

**Context.** The conventional answer for server state in React is TanStack Query,
and its documentation catalogues exactly the bugs hand-rolled fetching produces:
race conditions, StrictMode double-fires, loading-state gaps.

**Decision.** Keep the ~250 tested lines in `features/extract/`: a pure reducer
for the state machine and an `AbortController` that supersedes any in-flight
request.

**Rejected — with the migration actually costed.** The signature interaction
("stay put until the recipe lands") stays imperative under TanStack Query —
`queryClient.fetchQuery` plus local pending state, structurally the same code.
Its cancellation is per-key, so submitting URL B while URL A is in flight does
*not* cancel A; the "a superseded submit can never navigate later" guarantee would
still need a hand-rolled guard. Defaults become footguns against a POST-backed
pseudo-query: `retry: 3`, `refetchOnWindowFocus` and `refetchOnReconnect` each
re-POST the extract endpoint until disabled, and the paste flow gets forced into
`setQueryData` seeding with `staleTime: Infinity` pinned so a refetch can't hit a
URL that is unfetchable by definition. Cost: three dependencies, ~17 kB gzipped,
into an app whose runtime dependencies are React, React Router and zod.

**Reopen when.** A second server resource appears, or the app needs background
refetch, stale management or optimistic updates. Then adopt it wholesale rather
than running two layers.

## 15 · React Router data mode; the recipe route uses a loader

**Context.** `/recipe?url=…` has to work as a deep link, a refresh and a shared
URL.

**Decision.** `createBrowserRouter` (data mode — the minimum mode supporting route
`lazy` and `viewTransition` navigations). The recipe route resolves its data in
`recipeLoader` before the screen renders, and a thrown `ExtractError` is caught by
the route's `ErrorBoundary`.

**Supersedes an earlier decision.** This was previously done with an effect inside
the screen plus a `requestedFor` guard, deliberately, because a throwing loader
renders the error on the *destination* route while the failure UI at the time
lived on Home and spanned routes. [#16](#16--failures-surface-on-the-transition-screen)
moved the failure surface onto a route of its own, which removed the objection —
so the loader became the right tool and the effect was deleted.

**Consequences.** No hand-written revalidation guard: the router re-runs the
loader on search-param changes and aborts superseded navigations via
`request.signal`.

## 16 · Failures surface on the transition screen

**Context.** The failure UI was a floating widget that outlived route changes so
that an error could keep its retry and paste state while the user was sent back
Home. It was the most intricate component in the app: an effect watching the
`error` prop's identity, coordinated with a `didRetry` ref, to tell a failed retry
from a fresh error.

**Decision.** A submit navigates to `/extract`, a screen that shows the working
mascot while the request is pending and morphs the same porthole into the failure
panel in place. `retry()` returns its outcome to the caller, so the handler knows
what happened without inferring it from a prop change.

**Consequences.** The error never travels across routes, so no cross-route state
machine is needed. `/extract` is reachable only through `submitUrl`, so a stray
landing bounces itself home. History is arranged so every screen after Home
replaces the previous one — Back from anywhere lands on Home, never back on a
transition screen.

## 17 · sessionStorage recipe cache, ten-entry LRU

**Context.** A refresh or a back-navigation to `/recipe?url=…` would re-run a
multi-second extraction for a recipe already on screen — and a *pasted* recipe
can't be re-fetched at all, so a reload would lose it outright.

**Decision.** `lib/recipeCache.ts` keeps the ten most recent recipes in
`sessionStorage`, keyed by source URL. `recipeExtractor` writes on every success,
synchronously, before the caller navigates; `getRecipeByUrl` reads cache-first.
Reads are re-validated against the same zod schema API responses use, so a cache
written by an older deploy can't crash the UI.

**Rejected.** `localStorage` — the cache should behave like in-memory state that
survives a reload, not a durable store serving a days-old recipe.

**Consequences.** Only a cold deep-link to an uncached URL touches the network.
Storage being unavailable (private mode, quota) degrades to a re-fetch.

## 18 · Validate API responses at the network boundary

**Decision.** `lib/api.ts` parses every response through a zod schema, and the
`Recipe` type is inferred from that schema so the validator and the type can't
drift. A 2xx response that isn't a recipe becomes a named `ExtractError`.

**Consequences.** Backend shape drift fails at the boundary with a reportable
error instead of crashing somewhere in the recipe UI where the cause is
unrecognisable. Pairs with [#6](#6--contractjson-at-the-root-asserted-from-both-sides),
which catches the same drift at test time.

## 19 · Own ingredient splitter instead of npm `parse-ingredient`

**Context.** `IngredientList` needs to split "1½ tbsp olive oil" into a quantity
and a name for display.

**Decision.** Keep `features/recipe/ingredients.ts`.

**Rejected — measured.** `parse-ingredient` v2.2.0 was run locally against the
existing test cases:

| Input | `parse-ingredient` | `splitQuantity` |
|---|---|---|
| `1½ tbsp olive oil` | ✓ (as a normalized float) | ✓ |
| `1 and 1/2 cups flour` | ✗ name becomes "and 1/2 cups flour" | ✓ |
| `2 x 400g chopped tomatoes` | ✗ name becomes "x 400g chopped tomatoes" | ✓ |
| `juice of 1 lemon` | ✗ mangled to "juice of lemon", qty 1 | ✓ passed through |
| `1 to 2 pears` | separator lost (reconstructs "1-2") | ✓ preserved |
| `salt to taste` | ✓ | ✓ |

It also returns normalized floats rather than the display substring the UI needs,
so reconstruction wants a second dependency plus glue, and 22 of the unit forms
already handled (rashers, tins, knobs) would need ~100 lines of `additionalUOMs`
config. Net lines of code roughly zero, with behaviour regressions.

**Reopen when.** Recipe scaling or unit conversion becomes a feature —
`parse-ingredient` is best-in-class for that job, which is not this one.

## 20 · One folder per component, no barrel files

**Decision.** Each component gets a folder holding the component, its CSS module,
and its co-located tests. Imports are direct — there are no `index.ts`
re-exports. Layout follows the `shared → features → app` direction:
`components/` (shared) → `features/{extract,recipe}` → `app/`.

**Rejected.** Barrel files. The reference this layout is drawn from
([bulletproof-react](https://github.com/alan2207/bulletproof-react)) reversed its
own barrel advice for Vite tree-shaking, and barrels would undermine
[#21](#21--the-recipe-view-stays-off-the-first-paint-enforced-by-lint) by giving
eager code an import path into lazy modules.

## 21 · The recipe view stays off the first paint, enforced by lint

**Context.** Home is the landing screen. Bundling the recipe view — the largest
feature, with its carousel and lightbox — into the initial chunk delays first
paint for every visitor, including the ones who never extract anything.

**Decision.** `/paste` and `/recipe` are lazy route chunks. `.oxlintrc.json` bans
static imports of `@/features/recipe/**` and `**/screens/RecipeScreen/**` from
eager code; `app/router/router.tsx` is the one exempted importer.

**Consequences.** The invariant is mechanically enforced rather than remembered.
Home and `/extract` stay eager — a submit must paint the working mascot without
waiting on a chunk fetch.

## 22 · Liquid wave choreography, with the view transition as fallback

**Context.** Route changes needed to feel like one continuous surface rather than
a cut.

**Decision.** `go(dir, to)` in `useRouteChoreography` is the single navigation
primitive: cover with the wave, swap the route under full cover, reveal. When the
overlay isn't mounted or the user prefers reduced motion, `liquidAvailable()` is
false and it falls through to `navigate(to, { viewTransition: true })`. The
browser's own back/forward is a POP that would skip the wave, so a `useBlocker`
scoped to POP plays the wave and lets `proceed()` commit under cover.

**Consequences.** The animation plumbing is separated from the extraction journey
— `useExtractionFlow` reads as the journey, `useRouteChoreography` as the
choreography. Tests mount `App` without the overlay and take the fallback path,
so behaviour tests never depend on animation.

## 23 · Two test environments, split by what they need

**Decision.** `*.test.ts` runs in the `unit` project (node, no DOM) for pure
logic — reducers, parsers, schemas. `*.test.tsx` runs in the `browser` project,
real Chromium via Playwright. Logic that needs Web Storage but not layout uses a
per-file jsdom docblock.

**Rejected.** jsdom for everything. `ResizeObserver`, `matchMedia`, `inert` and
real layout measurement either don't exist or don't behave, and this UI measures
text to fit it.

**Consequences.** `npm test` needs a Chromium install
(`npx playwright install chromium`), once.

## 24 · Visual regression through Argos; no baselines in git

**Context.** Behaviour tests assert by role and can't see a dropped CSS rule, a
token hardcoded back to a literal, or text that clips.

**Decision.** `*.vrt.tsx` specs in a third Vitest project capture component
screenshots; Argos holds the baselines and does the diffing. Nothing binary is
committed. Argos posts its own PR check — that check, not the CI step, is the
visual verdict.

**Rejected.** Committed reference images: history grows by a megabyte every
legitimate UI change, and the classic dev-box-versus-CI font rendering mismatch
follows.

**Consequences.** Every source of nondeterminism is closed rather than papered
over with a tolerance — see [visual-regression.md](visual-regression.md). CI
authenticates tokenlessly, which also works on fork PRs where GitHub blocks
secrets; do not add `id-token: write` without first enabling OIDC on the Argos
project, because the SDK then treats OIDC as available and stops falling back.

## 25 · Coverage thresholds ratchet themselves

**Decision.** `vitest.config.ts` sets `thresholds.autoUpdate: true`. A run that
exceeds the numbers rewrites them upward; CI fails only on a regression.

**Rejected.** A static target. Set above today's coverage it blocks every PR
until someone pays down the whole backlog; set below, it's a no-op.

**Consequences.** Don't hand-edit the numbers — run `npm run test:coverage` and
commit what it writes. The one legitimate manual edit is rebasing *down* after
deleting covered code, since `autoUpdate` only raises. VRT specs are excluded
from coverage: screenshotting a component can hit ~90% line coverage while
asserting no behaviour at all.

## 26 · CI skips are step-level `if:`, never workflow `paths:`

**Context.** Several jobs should skip work the PR didn't touch — Argos uploads
cost quota, and the smoke load test costs ~90 s.

**Decision.** Each does its own change detection with one `gh api` call and gates
a *step*.

**Rejected.** A workflow-level `paths:` filter. GitHub reports a `paths`-skipped
workflow as Pending forever, which silently blocks every PR the day those checks
become required. A step skipped by `if:` reports Success.

**Consequences.** Both gates fail toward running: if the API call can't tell what
changed, the work runs. `master` is never skipped — it's the baseline other runs
resolve against.

## 27 · Load testing runs locally against a prod-like container

**Context.** Vercel prohibits load testing on Hobby and Pro — a Fair Use Policy
violation with documented IP blocks — and its DDoS firewall plus burst-scaling
ramp would distort the results anyway.

**Decision.** `docker-compose.loadtest.yml` runs the backend sized like one Vercel
Fluid instance (1 vCPU, 2 GB, plain uvicorn) against a local mock upstream
serving the test fixtures with ~500 ms injected latency. What gets measured is
per-instance capacity; Vercel's horizontal scaling is treated as a platform
property, not something to verify.

**Rejected.** Testing against a deployment (prohibited). Fetching real recipe
sites under load (that is DoSing someone else, and it would measure their servers).
Load-testing the static SPA (that tests a CDN; frontend performance is a latency
question, so it gets a Lighthouse budget instead).

**Consequences.** The harness has to lift two safety rails: the SSRF guard (the
mock upstream sits on a private compose-network IP) and the rate limiter (10/min
would measure slowapi, not the app). It does so in its own entrypoint,
`loadtest/backend_app.py`, which wraps `app.main:app` and lives outside `backend/`,
so it is never deployed. Production code has no switch that turns either rail off.
The first version used `LOADTEST_*` env flags checked inside the fetcher and
`rate_limit.py`. They were dropped because a single stray variable in a deployment
disabled the SSRF guard, and `bool(os.environ.get(...))` read `=0` as on. The cost
is that the entrypoint patches `url_guard.ip_allowed` by name, so a rename
there breaks the load-test smoke job, not production.

## 28 · k6, and its thresholds are the gate

**Decision.** Grafana k6: a single static binary, and declarative `thresholds`
that exit non-zero on breach, so a load test *is* a CI gate with no glue code.

**Rejected.** Locust (Python-native, but needs hand-rolled exit-code hooks for
gating), Gatling and JMeter (too heavy for two endpoints), oha/hey/wrk (no SLO
gating).

## 29 · The nightly baseline compares trend, not absolute numbers

**Context.** Hosted runners have variable shared CPUs. Their millisecond figures
are not comparable to the locally recorded baselines and vary run to run.

**Decision.** The nightly workflow compares each run against the *previous* run,
kept in the Actions cache, and opens or comments on one deduplicated issue when
p95 regresses past a wide relative threshold. k6's absolute thresholds stay
enabled — they create the tagged sub-metrics the comparator reads — but are not
allowed to fail the job.

**Consequences.** Each run becomes the next run's reference even after a
regression, so a sustained slowdown flags once rather than nightly. The trade-off
is that a slow multi-night creep below the threshold can go unflagged; a
rolling-median baseline is the upgrade.

## 30 · Docker Compose for dev, with a proxy that mirrors production routing

**Decision.** `make start` runs both services in containers with the source
live-mounted (uvicorn `--reload`, Vite HMR) plus an nginx `proxy` service on
`:8080` reproducing the production rewrite shape.

**Consequences.** Day-to-day work happens at `:5173` with HMR, where `/api` is
proxied by Vite's dev server. `:8080` is where routing itself gets QA'd, because
that path is the one production uses — see [#4](#4--same-origin-relative-api-no-cors).
Under WSL, Docker Desktop writes a Windows credential helper into
`~/.docker/config.json` that BuildKit can't exec, breaking every build; the `make`
targets point `DOCKER_CONFIG` at a regenerated project-local config with the
helpers stripped, scoped to `make` so direct `docker` commands are untouched.
