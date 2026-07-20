// Stress test — ramp concurrent users on the primary endpoint to find the
// degradation shape and prove the Stage 2 fix (LOADTEST.md Stage 3). The load
// hits /recipe/large (a ~1.5 MB parse-heavy page) so the CPU-bound parse is real;
// a steady /api/health canary runs alongside as the direct signal that the parse
// stays OFF the event loop — if it ever blocked, health latency would spike into
// seconds. Thresholds are the assertion "the loop stays responsive"; extract
// latency is recorded (degradation under load is expected), not tightly gated.
import { hitExtract, hitHealth } from './common.js';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 50, duration: '1m' }, // ramp up
        { target: 50, duration: '2m' }, // hold at 50 VUs
        { target: 0, duration: '30s' }, // ramp down (recovery)
      ],
      gracefulRampDown: '10s',
      exec: 'loadScenario',
    },
    health: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '3m30s',
      preAllocatedVUs: 5,
      maxVUs: 10,
      exec: 'healthScenario',
    },
  },
  thresholds: {
    // The load-bearing assertion: health stays responsive under stress. On a
    // 1-vCPU instance the single core saturates, so some elevation is expected —
    // but a BLOCKED loop would push health into multiple seconds. <1s cleanly
    // separates "off-loop, just CPU-contended" from "event loop stalled".
    'http_req_duration{endpoint:health}': ['p(95)<1000'],
    // Degradation is allowed; we record the shape. Gate only catches a meltdown.
    'http_req_duration{endpoint:extract}': ['p(95)<8000'],
    errors_5xx: ['rate<0.01'],
  },
};

export function loadScenario() {
  hitExtract('large');
}

export function healthScenario() {
  hitHealth();
}
