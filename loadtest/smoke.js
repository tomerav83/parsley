// Smoke test — 1 VU, ~60s, all three endpoints, thresholds on. Cheap enough to
// gate every PR: catches "an endpoint got slow or broke under trivial load"
// before the expensive baseline runs. Thresholds mirror the KPI table in
// LOADTEST.md (provisional until Stage 2 baselines retune them).
import { sleep } from 'k6';
import { hitHealth, hitExtract, hitExtractHtml, RECIPES } from './common.js';

const RECIPE_HTML = open('/fixtures/graph_howtostep/page.html');

export const options = {
  vus: 1,
  duration: '60s',
  thresholds: {
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    'http_req_duration{endpoint:extract}': ['p(95)<4000', 'p(99)<8000'],
    'http_req_duration{endpoint:extract_html}': ['p(95)<1500', 'p(99)<3000'],
    errors_5xx: ['rate<0.01'],
  },
};

export default function () {
  hitHealth();
  hitExtract(RECIPES[__ITER % RECIPES.length]);
  hitExtractHtml(RECIPE_HTML);
  sleep(1);
}
