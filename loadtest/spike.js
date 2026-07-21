// Spike test — a sudden 0→100 VU burst on the primary endpoint (the "recipe link
// hits the HN front page" case), then a drop (LOADTEST.md Stage 3). Unlike the
// steady stress test, what matters here is RECOVERY, not peak latency: does the
// instance shed the surge without erroring out, and does it return to normal once
// the crowd leaves? The health canary runs past the end of the spike so its
// tail shows the recovery. Load hits /recipe/large (parse-heavy), like production.
import { hitExtract, hitHealth } from './common.js';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 100, duration: '10s' }, // burst
        { target: 100, duration: '30s' }, // sustain the crowd
        { target: 0, duration: '10s' }, // crowd leaves
      ],
      gracefulRampDown: '10s',
      exec: 'spikeScenario',
    },
    health: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1s',
      duration: '1m20s', // outlives the spike so the tail shows recovery
      preAllocatedVUs: 20, // enough VUs to keep sampling even when each call is slow
      maxVUs: 20,
      exec: 'healthScenario',
    },
  },
  thresholds: {
    // A spike on 1 vCPU saturates the core — latency (even median) degrades
    // during the surge, which is physics, not a defect. So the ONLY assertion is
    // survival: a bounded 5xx rate through the burst. Recovery is read from the
    // health series (median settles back once the crowd leaves), recorded in
    // LOADTEST.md rather than gated — no aggregate threshold captures "recovered".
    errors_5xx: ['rate<0.05'],
  },
};

export function spikeScenario() {
  hitExtract('large');
}

export function healthScenario() {
  hitHealth();
}
