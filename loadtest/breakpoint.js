// Breakpoint test — ramp load until the instance breaks, to record the actual
// per-instance ceiling (LOADTEST.md Stage 3). k6 aborts the run the moment the
// error rate or latency crosses the abort thresholds, so the VU count / elapsed
// time at abort IS the ceiling. The ramp is linear to 300 VUs over 5 min, so at
// t seconds VUs ≈ t/1 — read the abort time as the breaking-point VU count. Load
// hits /recipe/large (parse-heavy), like production.
import { hitExtract } from './common.js';

export const options = {
  scenarios: {
    breakpoint: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ target: 300, duration: '5m' }], // abort fires well before the top
      gracefulRampDown: '5s',
      exec: 'loadScenario',
    },
  },
  thresholds: {
    // Stop the moment it breaks. delayAbortEval lets a brief early blip settle so
    // we abort on a real trend, not one unlucky sample. 5xx OR a >15s p95 counts
    // as broken (the upstream httpx timeout is 10s, so timeouts surface as 5xx).
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '10s' }],
    'http_req_duration{endpoint:extract}': [
      { threshold: 'p(95)<15000', abortOnFail: true, delayAbortEval: '10s' },
    ],
  },
};

export function loadScenario() {
  hitExtract('large');
}
