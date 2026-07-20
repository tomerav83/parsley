// Smoke test — 1 VU, ~60s, all three endpoints, thresholds on. Cheap enough to
// gate every PR: catches "an endpoint got slow or broke under trivial load"
// before the expensive baseline runs. Thresholds mirror the KPI table in
// LOADTEST.md. Thresholds ratcheted off the 2026-07-20 baseline (commit 0c15303,
// see the Recorded baselines table) — a regression gate, not a tight SLO.
import { sleep } from 'k6';
import { hitHealth, hitExtract, hitExtractHtml, RECIPES } from './common.js';

const RECIPE_HTML = open('/fixtures/graph_howtostep/page.html');

export const options = {
  vus: 1,
  duration: '60s',
  thresholds: {
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    // extract baseline p95 543 ms (500 ms mock latency floor + overhead).
    'http_req_duration{endpoint:extract}': ['p(95)<1000', 'p(99)<1200'],
    // extract-html baseline p95 14 ms; gate kept generous — a blocking-parse
    // regression shows as hundreds of ms, so 100 ms catches it without flaking.
    'http_req_duration{endpoint:extract_html}': ['p(95)<100', 'p(99)<150'],
    errors_5xx: ['rate<0.01'],
  },
};

export default function () {
  hitHealth();
  hitExtract(RECIPES[__ITER % RECIPES.length]);
  hitExtractHtml(RECIPE_HTML);
  sleep(1);
}
