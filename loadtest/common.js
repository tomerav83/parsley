// Shared request helpers + KPI metric for the k6 scripts (LOADTEST.md).
// Every request is tagged by endpoint so thresholds can gate per-endpoint p95/p99.
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

// The KPI is 5xx rate specifically (deliberate 4xx excluded), so we track our own
// Rate rather than http_req_failed, which counts every status >= 400.
export const errors5xx = new Rate('errors_5xx');

export const BASE = __ENV.BASE_URL || 'http://localhost:8000';
export const UPSTREAM = __ENV.UPSTREAM || 'http://mock-upstream';

// Fixture dirs with a page.html (the ones the mock serves at /recipe/<name>).
export const RECIPES = ['graph_howtostep', 'list_howtosection', 'toplevel_string_instructions'];

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

function record(res, name) {
  errors5xx.add(res.status >= 500);
  check(res, { [name]: (r) => r.status === 200 });
}

export function hitHealth() {
  record(http.get(`${BASE}/api/health`, { tags: { endpoint: 'health' } }), 'health 200');
}

export function hitExtract(recipe) {
  const res = http.post(
    `${BASE}/api/extract`,
    JSON.stringify({ url: `${UPSTREAM}/recipe/${recipe}` }),
    { ...JSON_HEADERS, tags: { endpoint: 'extract' } },
  );
  record(res, 'extract 200');
}

export function hitExtractHtml(html) {
  const res = http.post(
    `${BASE}/api/extract-html`,
    JSON.stringify({ html, url: 'https://example.com/recipe' }),
    { ...JSON_HEADERS, tags: { endpoint: 'extract_html' } },
  );
  record(res, 'extract-html 200');
}
