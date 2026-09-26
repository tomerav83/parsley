# Why Parsley exists

## The problem

You search for a recipe, open the first result, and get an essay. Two thousand
words about a trip to Sicily, a video that follows you down the page, a cookie
banner, three newsletter modals, an ad between every paragraph. The recipe is
down there somewhere — usually a "Jump to recipe" link away, sometimes not even
that.

This is not an accident of bad design. Long-form preamble is what makes a recipe
page rank and what makes the ad inventory worth selling. The incentives point
away from the thing you came for, and they are not going to change.

## Why it's solvable

Those same incentives left an opening. To get a rich-result card in Google,
publishers embed a machine-readable `schema.org/Recipe` object in the page — the
ingredients, the steps, the times, the yield, already structured. The clean
recipe is sitting in the HTML of the page you're squinting at.

So the work isn't parsing prose or guessing at layout. It's reading a standard
that nearly every recipe site already publishes, and rendering it properly. One
extraction path covers almost the whole web, with no per-site scrapers to
maintain and no model to pay per request
([decision 1](decisions.md#1--extract-from-schemaorgrecipe-json-ld-not-per-site-scrapers)).

## Goals

- **Paste a link, get the recipe.** One input, one output, no account.
- **Cook from it.** The recipe view is the product: ingredients in a scannable
  column, one method step at a time, timers surfaced, legible at arm's length on
  a phone propped against a bag of flour.
- **Fail honestly.** When extraction can't work, say which of the handful of
  reasons it is and offer the specific recovery that fits — never a wrong recipe,
  never a shrug ([implementation.md](implementation.md#errors-and-recovery)).
- **Run anywhere.** Self-hostable with one command, no secrets, no database.
- **Be a real codebase.** This is also a portfolio project. It carries the things
  production software carries — a typed contract asserted from both sides, load
  tests with recorded numbers, visual regression, a performance budget in CI —
  because that's the point of building it in the open.

## Non-goals

- **Not a recipe database.** Parsley extracts what a page already published; it
  doesn't host, index, or republish anyone's recipes.
- **Not a scaling or conversion tool.** No "serves 4 → serves 6", no metric
  toggle. That's a different product with a different ingredient parser
  ([decision 19](decisions.md#19--own-ingredient-splitter-instead-of-npm-parse-ingredient)).
- **Not an LLM wrapper.** Structured data is already there. Paying a model per
  request to re-derive it would be slower, costlier and less reliable.
- **Not an arms race.** A site that blocks datacenter IPs stays blocked; the
  answer is the paste fallback, not rotating proxies
  ([decision 3](decisions.md#3--paste-html-fallback-for-sites-that-block-server-side-fetching)).
- **Not a general web scraper.** Only public http(s) recipe pages
  ([decision 8](decisions.md#8--ssrf-guard-checks-at-connect-time-and-pins-the-ip)).

## Roadmap

The saved recipe box: accounts and a personal collection, which is where
Postgres, auth and a real persistence layer enter. `ExtractionService` is
deliberately the seam where a repository dependency would be injected, so this
lands as a constructor argument rather than orchestration inlined into route
handlers.

One defect stays open until then: rate limiting is per-instance and therefore
best-effort on serverless. The intended fix is an edge rule, not more code
([decision 12](decisions.md#12--rate-limiting-is-best-effort-by-design--for-now)).
