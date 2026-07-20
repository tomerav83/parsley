// Average-load baseline — 5 RPS on extract (mocked upstream) with 1 RPS
// extract-html as the parse-only control, held 15 min. Arrival-rate executors
// pin throughput regardless of latency, so a slow response shows up as p95
// breach + rising VU count, not as backed-off load. Run manually / on merge,
// not per-PR. Records the numbers that replace the provisional thresholds
// (LOADTEST.md Stage 2). See the KPI table there for the targets below.
import { hitExtract, hitExtractHtml, RECIPES } from './common.js';

const RECIPE_HTML = open('/fixtures/graph_howtostep/page.html');

export const options = {
  scenarios: {
    // extract: brief ramp to 5 RPS so a cold start doesn't skew p95, then hold.
    extract: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      stages: [
        { target: 5, duration: '30s' },
        { target: 5, duration: '15m' },
      ],
      exec: 'extractScenario',
    },
    // extract_html: 1 RPS parse-only control — isolates parse cost from fetch.
    extractHtml: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '15m30s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'extractHtmlScenario',
    },
  },
  // Ratcheted off the 2026-07-20 baseline (commit 0c15303) — see the Recorded
  // baselines table in LOADTEST.md for the numbers and rationale.
  thresholds: {
    'http_req_duration{endpoint:extract}': ['p(95)<1000', 'p(99)<1200'],
    'http_req_duration{endpoint:extract_html}': ['p(95)<100', 'p(99)<150'],
    errors_5xx: ['rate<0.01'],
  },
};

export function extractScenario() {
  hitExtract(RECIPES[__ITER % RECIPES.length]);
}

export function extractHtmlScenario() {
  hitExtractHtml(RECIPE_HTML);
}
