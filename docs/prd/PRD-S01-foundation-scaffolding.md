# PRD-S01 — Foundation Scaffolding (Simulator)

Status: Implemented (React+TS+Vite+Tailwind web, Fastify+TS sender) · Source: Simulator TechStack §§2–3 · Depends on: —

## Specs

- Create target layout: `src/apps/web/` (React+TS+Vite+Tailwind, one-screen sender), `src/apps/sender/` (Node 22+TS+Fastify), `scenarios/`, `tests/`, `scripts/`, `.env.example`.
- Top bar: play icon + **Argus Simulator** · “Prepared evidence replay” · API reachability indicator. Dark compact theme from UX `bundle.css`/`Simulator.dc.html` (reference only, not shipped markup).
- Sender serves web + local APIs; browser never touches filesystem paths directly. No login, no DB, no GCS.

Out of scope: scenario logic (S02), sending (S03), full UI (S04).

## Technical Specs

- **Pattern:** two-process local app (sender API + web) with sender as the only filesystem reader; web talks only to sender APIs + preview URLs.
- **Configuration:** env `ARGUS_BASE_URL` (default `http://localhost:8000`), `SCENARIOS_DIR`, optional `ARGUS_INGEST_TOKEN` in sender env only — never in React bundle. Zod-validated at boot.
- **Testing:** Vitest + Playwright smoke (shell renders, sender health OK).

## Acceptance

- [ ] Both processes run locally; shell matches UX top bar; no token in web bundle.

## References

- Spec: [Argus_Simulator_Spec.md](../specs/Argus_Simulator_Spec.md) §§1–2 · Tech: [Argus_Simulator_TechStack.md](../specs/Argus_Simulator_TechStack.md) §§2–3
- UX: [Simulator.dc.html](../ux/Argus%20Simulator%20click-through-html/Simulator.dc.html) + `ds/argus/components/bundle.css` — replicate values in Tailwind; never ship mockup markup.

## Test Plan (write before implementation — tests fail first)

- Unit: sender config rejects missing/invalid `ARGUS_BASE_URL`/`SCENARIOS_DIR` with named error.
- Contract: sender health/scenario list APIs return documented shapes; web calls only sender APIs (no filesystem paths).
- UI (RTL): shell renders top bar + reachability placeholder, no login.
- Negative: `ARGUS_INGEST_TOKEN` string must not appear in built web bundle (grep build output).

## Verification (after implementation)

- [ ] Run this PRD's full test list + Acceptance above; builds green.
- [ ] Playwright smoke: shell renders, sender health OK. No test red/skipped at sign-off.

## Review gate

Reply `go PRD-S01` to implement, or edit this file first.
