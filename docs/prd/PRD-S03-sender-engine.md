# PRD-S03 — Sender Engine: Schedule, Retry, Complete (Simulator)

Status: Awaiting review · Source: Simulator Spec §§4–5 · TechStack §§5–6 · Depends on: PRD-S02 + Argus PRD-04 (contract must exist first)

## Specs

- Flow: operator creates session in Argus → pastes `insp-...` ID + Argus API URL here → validate via `GET /api/v1/inspections/:id` (show Waiting/Receiving/Analyzing/Closed or real error) → **Send Simulated Data** (enabled only when manifest valid + API reachable + session accepts evidence) → files sent at `atMs` offsets → `POST .../complete` **once** after full acknowledgement → “Stream complete — Argus inspection remains open.” Simulator never creates/closes/terminates Argus sessions.
- Uploads: `POST .../video|photos|pointcloud`, multipart `file` = original bytes + `metadata { schemaVersion:"1.0", eventId, sourceId, sequence, relativeTimeMs=atMs, mediaType, synthetic:true }` (+ point-cloud units/frame). Payload never contains defect/expected-result data. `202` shown as Accepted (queued), never as PASS.
- Stop: cancels remaining schedule, marks `Stopped — N files not sent`, never calls `/complete`. Session closed mid-run (`409 SESSION_CLOSED` / FINALIZING/COMPLETED/TERMINATED): stop, cancel retries, remaining = `Not sent — session closed`. Replay guidance: same `(sessionId,eventId)` dedupes — recommend fresh Argus session.

Out of scope: UI polish (S04), any media generation/analysis.

## Technical Specs

- **Scheduler pattern:** monotonic clock (`performance.now`-based), per-source ordered queues with bounded cross-source concurrency — independent camera/photo/laser streams overlap without violating per-source `sequence`. Never waits on Meta inference.
- **Retry pattern:** retry only `429`/timeouts/transient `5xx`, exponential backoff with jitter, **same `eventId`** (safe due to Argus idempotency PRD-04); never retry `400/404/409/413/415` — surface cause. Max attempts + backoff base/cap are config, not constants: `RETRY_MAX_ATTEMPTS=3`, `RETRY_BASE_MS=500`, `RETRY_MAX_MS=5000`, `HTTP_TIMEOUT_MS=30000`, `MAX_CONCURRENT_UPLOADS=3`.
- **State machine:** `READY → VALIDATING → SENDING → STREAM_COMPLETE | STOPPED | FAILED`; single active run in-memory (optional run log); progress counts distinct acknowledged `eventId`s (retries never double-count). Sender APIs expose run status stream to web (poll or SSE locally).
- **Configuration:** `ARGUS_BASE_URL`, `ARGUS_INGEST_TOKEN` (sender env only).

## Acceptance

- [ ] Against mock Argus: offsets, ordering, dedupe-on-retry, `409` stop, `/complete` only on full ack (TechStack §7 tests 1–8).

## Review gate

Reply `go PRD-S03` to implement, or edit this file first.
