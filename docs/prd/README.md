# Argus Simulator — PRDs

One feature at a time. **Review a PRD, edit it here if needed, then say `go PRD-SXX` before any implementation.** No PRD is implemented without your go-ahead.

| # | PRD | Depends on | Status |
|---|---|---|---|
| S01 | [Foundation scaffolding](PRD-S01-foundation-scaffolding.md) | — | Implemented |
| S02 | [Scenario registry & computed schedule](PRD-S02-scenario-manifest-and-validation.md) | S01 | Implemented v2 (registry, 2 scenarios) |
| S03 | [Sender engine (schedule/retry/complete)](PRD-S03-sender-engine.md) | S02 + Argus PRD-04 | Implemented v2 (concurrent sources, jittered retry) |
| S04 | [Sender UI (controls/status/preview)](PRD-S04-sender-ui.md) | S02, S03 | Implemented v2 (lifecycle-aware validation) |

Each PRD has: **Specs** (functional, from `Argus_Simulator_Spec.md` v0.9.1) and a separate **Technical Specs** section (design patterns, retry, configuration, data/API contracts). Sources: [spec](../specs/Argus_Simulator_Spec.md) · [tech stack](../specs/Argus_Simulator_TechStack.md) · [UX mockup](../ux/Argus%20Simulator%20click-through-html/Simulator.dc.html).
