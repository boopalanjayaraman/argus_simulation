# PRD-S01 — Foundation Scaffolding (Simulator)

Status: Awaiting review · Source: Simulator TechStack §§2–3 · Depends on: —

## Specs

- Create target layout: `apps/web/` (React+TS+Vite+Tailwind, one-screen sender), `apps/sender/` (Node 22+TS+Fastify), `scenarios/`, `tests/`, `scripts/`, `.env.example`.
- Top bar: play icon + **Argus Simulator** · “Prepared evidence replay” · API reachability indicator. Dark compact theme from UX `bundle.css`/`Simulator.dc.html` (reference only, not shipped markup).
- Sender serves web + local APIs; browser never touches filesystem paths directly. No login, no DB, no GCS.

Out of scope: scenario logic (S02), sending (S03), full UI (S04).

## Technical Specs

- **Pattern:** two-process local app (sender API + web) with sender as the only filesystem reader; web talks only to sender APIs + preview URLs.
- **Configuration:** env `ARGUS_BASE_URL` (default `http://localhost:8000`), `SCENARIOS_DIR`, optional `ARGUS_INGEST_TOKEN` in sender env only — never in React bundle. Zod-validated at boot.
- **Testing:** Vitest + Playwright smoke (shell renders, sender health OK).

## Acceptance

- [ ] Both processes run locally; shell matches UX top bar; no token in web bundle.

## Review gate

Reply `go PRD-S01` to implement, or edit this file first.
