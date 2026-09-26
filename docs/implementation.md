# Implementation

How the pieces actually work. [architecture.md](architecture.md) covers the shape;
this covers the mechanics. Why any of it is this way is in
[decisions.md](decisions.md).

Four terms recur below, all from the UI:

- **the transition screen** — `/extract`, where a submit lands. It holds the
  screen while the request is pending, and becomes the failure panel in place if
  the request fails.
- **the mascot** — the parsley leaf character (`LeafCharacter`), drawn as a CSS
  cut-out puppet. It works at a laptop while extracting and changes pose as a
  failure escalates. Decorative and `aria-hidden` throughout.
- **the orb** — the porthole the mascot sits in (`LeafOrb`), which is also the
  frame the failure panel morphs out of.
- **the wave** — the liquid overlay that covers the screen during a navigation,
  swaps the route underneath, then reveals. Every navigation goes through it;
  reduced-motion and tests fall back to a plain view-transition slide.

## Extraction

`extract_recipe(html, url)` in `backend/app/extraction/extractor.py`:

1. **Reduce.** `reduce_html` (`backend/app/extraction/html_reducer.py`) parses the page with lxml's C parser and rebuilds it
   as `<head>` plus every `application/ld+json` script. Returns `None` when there
   is no JSON-LD or the page won't parse.
2. **Scrape.** `recipe_scrapers.scrape_html(html, org_url=url, supported_only=False)`
   over the reduced page. If it raises `RecipeNotFoundError`, the full page gets
   one attempt — that covers sites whose recipe lives in body microdata.
3. **Require the essentials.** No ingredients or no steps is a `no_recipe`
   failure, not a half-empty recipe.
4. **Map fields.** recipe-scrapers' strings are used as-is — it already strips
   tags, unescapes entities and collapses whitespace. The scraper's `to_json()`
   swallows the exception a getter raises for a field the site omits and leaves
   that key out; `Recipe.model_validate` maps the rest through validation aliases
   (`title` → `name`, `instructions_list` → `steps`, `prep_time` →
   `prep_time_minutes`…), and a missing or empty field takes its default.

Missing name falls back to "Untitled recipe". Everything else is nullable.

## Fetching

`fetch_page(url)` in `backend/app/fetch.py` runs inside an
`anyio.fail_after(15 s)` deadline covering DNS, both attempts and every redirect
— the per-operation timeouts (6 s) reset on each socket read, so a drip-feeding
server could otherwise hold a slot until Vercel's 30 s `maxDuration` kills the
function.

**Validation.** http/https only, host must resolve entirely to global addresses.
`socket.getaddrinfo` is blocking, so it runs in a worker thread.

**Transports.** Plain httpx first, with a full browser header set. On 401, 402,
403 or 429 it retries once through curl_cffi with `impersonate="chrome"`, which
carries a real Chrome TLS fingerprint. curl_cffi is imported inside the function
— it bundles ~30 MB of compiled libcurl and only a minority of requests get here.

**One driver, two transports.** `_drive_fetch` owns the redirect loop, the
per-hop SSRF re-validation, the blocked/error status mapping and the size cap;
each transport supplies only "open a stream" and "read the body". The
security-critical parts are written once and can't drift between transports.

**Caps.** 5 redirects, 3 MB body enforced *during* the download (`_read_capped_text`
fails as soon as the accumulated body crosses the limit, so an oversized page
never fully lands in memory), and a decode that survives a bogus `charset=`.

`Accept-Encoding` must only advertise codings httpx can actually decode —
advertising brotli without the dependency yields undecodable bytes rather than an
error. gzip and deflate are built in; `br` and `zstd` come from the `brotli` and
`zstandard` extras. A test guards this.

## Errors and recovery

Each error code carries the recovery the UI offers for it
(`frontend/src/features/extract/errorInfo.ts`):

| Code | Retry | Paste | Edit link | Report |
|---|:---:|:---:|:---:|:---:|
| `invalid_url` | | | ✓ | |
| `blocked_url` | | | ✓ | |
| `no_recipe` | | | ✓ | |
| `site_blocked` | | ✓ | | |
| `fetch_failed` | ✓ | ✓ | | ✓ |
| `rate_limited` | ✓ | | | |
| `network` | ✓ | | | |
| `unknown` | ✓ | | | ✓ |

Every code offers at least one of retry/paste/edit, so the panel always has a
primary action. Actions are ordered by intent — retry, then paste, then edit —
and the first eligible one becomes the full-width primary; the rest share a
secondary row. "Report" only appears for codes flagged `unexpected`, meaning a
likely bug on our side rather than an expected outcome, and opens a prefilled
GitHub issue tagged `extraction-failure`.

**Escalation.** Retry is one-shot. When it fails and a fallback remains, retry
disappears and the fallback takes the primary slot. When it fails with nothing
left to take over (`unexpected`, no paste), the panel collapses to report-only.
A failed *paste* is terminal from the start — the pasted page itself gave us
nothing.

The mascot's mood tracks that journey: `hmm` on a fresh failure, `weird` once the
retry has failed too, `flat` when a paste failed, `over` for rate limiting.

**Accessibility.** The panel is `role="alert"` — it appears in place of the
working orb, which is a state change rather than a route change, so it announces
itself and moves focus to its primary action. Escape is bound on a wrapper so it
only fires while focus is inside the panel. Focus restoration afterwards belongs
to the parent, which returns it to the URL field.

## The extraction flow

`useExtractionFlow` (`frontend/src/app/transitions/`) owns the journey. Every
navigation goes through `go(dir, to)` from `useRouteChoreography`.

| Action | What happens |
|---|---|
| `submitUrl` | start the request, wave to `/extract`, then wave to `/recipe?url=…` on success. A failure needs no navigation — the screen morphs in place |
| `retry` | re-run **without** clearing the error, so the panel stays mounted and its retry accounting survives; returns the outcome to the caller |
| `submitPaste` | success lands the recipe; failure replaces the paste screen with `/extract` in its terminal state |
| `openPaste` | replace `/extract` with `/paste`, clearing the error under full cover so the form opens fresh |
| `openPasteFor(url)` | same, from the recipe route's error boundary — seeds `lastUrl`, which that path never set |
| `editLink` | home with the failed URL pre-filled and focus in the field |
| `backToSearch` / `dismissError` | home, field focused |

`submitUrl` holds the working screen for a 600 ms floor so a fast site doesn't
flash the mascot out of existence before it registers.

Dismissal leaves the error in state rather than clearing it: clearing would blank
the transition screen before the home swap commits under the wave, flashing an
empty frame. The next submit clears it.

**History.** Home is pushed onto; every screen after it replaces the previous
one. History stays `[home, current]`, so Back from anywhere lands on Home and
never on a transition screen. `/extract` is reachable only through `submitUrl`,
so a hard deep-link there bounces itself home.

**Aborting.** `useRecipeExtractor` aborts any in-flight request before starting a
new one and reports `"aborted"` — distinct from `"error"` — so a superseded run's
caller does nothing and leaves the screen to the newer one. A `DOMException`
named `AbortError` is never surfaced as a failure, including when the browser
itself aborts the fetch on navigation.

## Caching and deep links

`lib/recipeCache.ts` holds the ten most recent recipes in `sessionStorage`, keyed
by source URL, with a re-insert-on-write LRU. `recipeExtractor` writes on every
success *synchronously, before the caller navigates* — that ordering is what
keeps a Home submit from re-fetching a recipe it already has, since the route
loader reads the cache during navigation. Reads re-validate against the same zod
schema API responses use, so a cache written by an older deploy returns a miss
instead of crashing the UI. Every storage access is wrapped: private mode, a
disabled store or a quota error degrades to a re-fetch.

`lib/recipeRepository.ts` is the single "get the recipe for this URL" seam —
cache first, network otherwise, always caching the result. `recipeLoader` calls
it with `request.signal`, so React Router aborts a superseded navigation.

A failed loader throws its `ExtractError`, and the route's `ErrorBoundary`
(`RecipeError`) renders the same failure UI in place. A non-`ExtractError` is
wrapped as `unknown` rather than leaked.

## Rendering a recipe

- **`ingredients.ts`** splits a leading measurement off each line so quantities
  render in a tight mono column beside the names. Lines with no leading amount
  return an empty quantity and the whole string as the name.
- **`timers.ts`** pulls a duration out of a step ("Roast 18–20 minutes") for the
  timer chip. Deliberately conservative: a number or range must be directly
  followed by a time unit, so `220°C` and `3 tbsp` can't masquerade as timers.
- **`byline.ts`** canonicalises author and site name (`&`→`and`, punctuation
  stripped) so "Dine & Dish" and "Dine and Dish" dedupe into one attribution
  instead of printing twice.
- **`RecipeSections`** shows ingredients and method in one window: side-by-side
  columns on desktop, a segment switch on mobile with the current step number on
  the Method segment. Either way the method is one step at a time, walked by
  ←/→, the visible buttons, or a horizontal swipe. The active step lives in the
  parent so the segment can label it.
- **`MethodSteps`** measures each step and shrinks the text to fit its card;
  overflowing steps open full-size in a lightbox.

The theme is applied before first paint by an inline script in `index.html`
reading `localStorage.theme`, so there's no flash of the wrong theme. Fonts are
self-hosted woff2 and preloaded in the head — without the preload the browser
doesn't discover the `@font-face` rules until it parses the CSS, and the fallback
font is visibly showing until then.

## Tests

Three Vitest projects, split by what they need
([decision 23](decisions.md#23--two-test-environments-split-by-what-they-need)):

| Project | Files | Environment | Run by |
|---|---|---|---|
| `unit` | `src/**/*.test.ts` | node | `npm test` |
| `browser` | `src/**/*.test.tsx` | real Chromium (Playwright) | `npm test` |
| `vrt` | `src/**/*.vrt.tsx` | real Chromium, pinned | `npm run test:vrt` |

Component tests render through a real router and mock at the API boundary, so
they assert behaviour rather than implementation. Coverage is collected only from
`unit` and `browser`, against an auto-updating ratchet
([decision 25](decisions.md#25--coverage-thresholds-ratchet-themselves)).

Backend tests are pytest with `asyncio_mode = "auto"`. Extraction is data-driven:
each directory under `backend/tests/fixtures/` holds a `page.html` and the
`expected.json` the extractor must produce from it, so adding coverage is adding
a directory, not writing test code. The cases cover the JSON-LD variants that
matter — top-level with string instructions, `@graph` with `HowToStep`,
`HowToSection` lists — plus a page with no recipe at all.

**No test touches the network.** `respx` mocks httpx transports in
`test_fetch.py`; `ExtractionService` takes injected fakes elsewhere.

`test_contract.py` and `contract.test.ts` are the two ends of the contract guard
([decision 6](decisions.md#6--contractjson-at-the-root-asserted-from-both-sides)).
