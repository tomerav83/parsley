#!/usr/bin/env python3
"""Compare a k6 baseline summary against the previous run's and decide if it
regressed. Trend-only: we compare CI-run-to-CI-run (relative delta), never to a
locally-recorded number, because hosted runners have variable CPU and their
absolute ms are not comparable across machines (see LOADTEST.md).

Signals that flag a regression:
  - error rate (5xx) over the ceiling — runner-independent, a real fault.
  - an endpoint's p95 up more than --threshold vs the previous run.

The first run has no previous to compare against, so it just seeds the store and
reports no regression. Emits a markdown table for the issue body and sets
`regression`/`reason` on GITHUB_OUTPUT. Never exits non-zero (the workflow, not
this script, decides what to do with a regression) unless given bad input.

Self-check: `python check_regression.py --selftest`.
"""

import argparse
import json
import os
import sys

# k6 summary-export keys for the endpoints we gate, plus the error-rate metric.
ENDPOINTS = {
    "extract": "http_req_duration{endpoint:extract}",
    "extract-html": "http_req_duration{endpoint:extract_html}",
}
ERROR_RATE_METRIC = "errors_5xx"
ERROR_CEILING = (
    0.01  # 1% 5xx — the KPI ceiling, absolute because it's runner-independent
)


def p95(summary: dict, metric_key: str) -> float | None:
    m = summary.get("metrics", {}).get(metric_key)
    if not m or "p(95)" not in m:
        return None
    return float(m["p(95)"])


def error_rate(summary: dict) -> float:
    m = summary.get("metrics", {}).get(ERROR_RATE_METRIC, {})
    # Rate metrics export as {"value": <rate 0..1>}; missing => treat as 0.
    return float(m.get("value", 0.0))


def evaluate(current: dict, previous: dict | None, threshold: float) -> dict:
    """Return {regression: bool, reason: str, rows: [(label, prev, cur, delta_pct, flagged)]}."""
    rows = []
    reasons = []

    err = error_rate(current)
    if err > ERROR_CEILING:
        reasons.append(f"5xx rate {err:.2%} > {ERROR_CEILING:.0%} ceiling")

    for label, key in ENDPOINTS.items():
        cur = p95(current, key)
        prev = p95(previous, key) if previous else None
        flagged = False
        delta = None
        if cur is not None and prev is not None and prev > 0:
            delta = (cur - prev) / prev
            if delta > threshold:
                flagged = True
                reasons.append(f"{label} p95 +{delta:.0%} ({prev:.0f}→{cur:.0f} ms)")
        rows.append((label, prev, cur, delta, flagged))

    seeded = previous is None
    if reasons:
        reason = "; ".join(reasons)
    else:
        reason = "seeded (no prior run)" if seeded else "within tolerance"
    return {
        "regression": bool(reasons),
        "reason": reason,
        "rows": rows,
        "seeded": seeded,
        "error_rate": err,
    }


def render_table(result: dict, threshold: float) -> str:
    lines = [
        f"| endpoint | previous p95 | current p95 | Δ | over {threshold:.0%}? |",
        "|---|---|---|---|---|",
    ]
    for label, prev, cur, delta, flagged in result["rows"]:
        prev_s = f"{prev:.0f} ms" if prev is not None else "—"
        cur_s = f"{cur:.0f} ms" if cur is not None else "—"
        delta_s = f"{delta:+.0%}" if delta is not None else "—"
        flag_s = "⚠️ yes" if flagged else "no"
        lines.append(f"| {label} | {prev_s} | {cur_s} | {delta_s} | {flag_s} |")
    lines.append("")
    err_pct = f"{result['error_rate']:.2%}"
    lines.append(f"5xx error rate: **{err_pct}** (ceiling {ERROR_CEILING:.0%})")
    return "\n".join(lines)


def _load(path: str) -> dict | None:
    if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    with open(path) as f:
        return json.load(f)


def _set_output(github_output: str | None, key: str, value: str) -> None:
    if not github_output:
        return
    with open(github_output, "a") as f:
        f.write(f"{key}={value}\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--current")  # required unless --selftest
    ap.add_argument("--previous")  # may not exist on first run
    ap.add_argument("--threshold", type=float, default=0.30)
    ap.add_argument("--out-md", help="write the metrics table here for the issue body")
    ap.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT"))
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()

    if not args.current:
        print("error: --current is required", file=sys.stderr)
        return 2
    current = _load(args.current)
    if current is None:
        print(f"error: no current summary at {args.current}", file=sys.stderr)
        return 1
    previous = _load(args.previous)

    result = evaluate(current, previous, args.threshold)
    table = render_table(result, args.threshold)
    print(f"regression={result['regression']} — {result['reason']}")
    print(table)
    if args.out_md:
        with open(args.out_md, "w") as f:
            f.write(table)
    _set_output(
        args.github_output, "regression", "true" if result["regression"] else "false"
    )
    _set_output(args.github_output, "reason", result["reason"])
    _set_output(args.github_output, "seeded", "true" if result["seeded"] else "false")
    return 0


def _md(key: str, p: float) -> dict:
    return {"metrics": {key: {"p(95)": p}}}


def _selftest() -> int:
    md = _md
    ekey = ENDPOINTS["extract"]

    # no previous → seeded, no regression
    r = evaluate(md(ekey, 500), None, 0.30)
    assert r["regression"] is False and r["seeded"] is True, r

    # within tolerance (+10% < 30%)
    r = evaluate(md(ekey, 550), md(ekey, 500), 0.30)
    assert r["regression"] is False, r

    # p95 regression (+40% > 30%)
    r = evaluate(md(ekey, 700), md(ekey, 500), 0.30)
    assert r["regression"] is True and "extract p95" in r["reason"], r

    # 5xx over ceiling flags regardless of latency
    cur = {"metrics": {ekey: {"p(95)": 500}, ERROR_RATE_METRIC: {"value": 0.05}}}
    r = evaluate(cur, md(ekey, 500), 0.30)
    assert r["regression"] is True and "5xx" in r["reason"], r

    # improvement (faster) is never a regression
    r = evaluate(md(ekey, 300), md(ekey, 500), 0.30)
    assert r["regression"] is False, r

    print("selftest ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
