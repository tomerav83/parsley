# Parsley docs

Four documents carry the project, in the order a new reader wants them. The
other three are operational and can wait until you need them.

| | |
| --- | --- |
| [motivation.md](motivation.md) | The problem, the goals, the non-goals, the roadmap |
| [architecture.md](architecture.md) | The shape of the system, the request path, the module layout |
| [implementation.md](implementation.md) | How the pieces work: extraction, fetching, the UI flow, the tests |
| [decisions.md](decisions.md) | Why it's built this way, what was rejected, what would reopen it |

**Operational**

| | |
| --- | --- |
| [deploy.md](deploy.md) | Vercel production, local development, regenerating pinned deps |
| [load-testing.md](load-testing.md) | The k6 plan, the KPIs, the staged runs — local only |
| [visual-regression.md](visual-regression.md) | Screenshot tests, the Argos setup, the shot budget |

Reach for [decisions.md](decisions.md) before re-litigating a design choice: each
entry records what was chosen, what was rejected, and what evidence would reopen
it. The invariants that break the app when violated are listed in
[../CLAUDE.md](../CLAUDE.md), and the API shape those docs describe is pinned by
[../contract.json](../contract.json).
