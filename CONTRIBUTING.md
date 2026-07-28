# Contributing to Parsley

Bug reports and pull requests are welcome. The most useful report is a recipe
page that won't extract — the app's failure screen has a **Report it on GitHub**
button that prefills the
[extraction-failure template](.github/ISSUE_TEMPLATE/extraction-failure.md) with
the error code, the URL and the browser. Filing manually works too.

## Getting set up

`make start` brings up the whole stack in Docker with hot reload on both sides;
[the README](README.md#quick-start) has the no-Docker path. Nothing needs
configuring — there are no required environment variables and no secrets.

## Before you open a PR

CI runs three things. Run the same three locally and it will pass:

```sh
make lint                 # ruff (backend) + oxlint and prettier (frontend)
make test                 # backend: uv run pytest
cd frontend && npm test   # needs `npx playwright install chromium` once
```

CI additionally runs `uv run pyright`, a build, a k6 smoke load test, visual
regression via Argos and a Lighthouse budget. The frontend and load-test jobs
skip themselves on PRs that don't touch their side.

Coverage thresholds in `frontend/vitest.config.ts` are generated — run
`npm run test:coverage` and commit whatever it writes rather than editing them by
hand.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org)
  (`fix(recipe): …`). Short-lived branches, PR into `master`.
- **Frontend**: one folder per component, no barrel files, tests co-located, `@/`
  aliases `src/`, CSS Modules. Dependencies point one way:
  `lib → components → features → app`.
- **Backend**: routes stay thin — parse the request, return `ExtractionService`'s
  result. New error types subclass `AppError` with a `code` and a `status`.
- **Tests never touch the network.** Extraction tests use the HTML fixtures in
  `backend/tests/fixtures/`, `respx` mocks httpx, and `ExtractionService` takes
  injected fakes.

[CLAUDE.md](CLAUDE.md) is the short version of the house rules, and it lists the
invariants that break something non-obvious when violated — same-origin routing,
`contract.json` as the source of truth for the API shape, environment variables
read in exactly one file, the code-split recipe view. It's worth two minutes
before your first change.

## Design decisions

[docs/decisions.md](docs/decisions.md) records what was chosen, what was
rejected, and what evidence would reopen each question. If your change argues
against one of them, that's a fine thing to propose — say which entry, and what
changed.
