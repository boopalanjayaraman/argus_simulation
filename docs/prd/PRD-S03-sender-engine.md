# PRD-S03 — Sender Engine: Schedule, Retry, Complete (Simulator)

Status: Implemented (v2, 03 Nov 2026: per-source concurrent queues with an in-flight cap; configurable jittered retry; lifecycle-aware send gating) · Source: Simulator Spec §§4–5 · TechStack §§5–6 · Depends on: PRD-S02 + Argus PRD-04 (contract must exist first)

## Specs

- Flow: operator creates session in Argus → pastes `insp-...` ID + Argus API URL here → validate via `GET /api/v1/inspections/:id` (show the actual `lifecycleStatus`; only `WAITING / RECEIVING / ANALYZING / READY_TO_CLOSE` accept evidence) → **Send Simulated Data** (enabled only when manifest valid + API reachable + session accepts evidence) → files sent at `atMs` offsets → `POST .../complete` **once** after full acknowledgement → “Stream complete — Argus inspection remains open.” Simulator never creates/closes/terminates Argus sessions.
- Uploads: `POST .../video|photos|pointcloud`, multipart `file` = original bytes + `metadata { schemaVersion:"1.0", eventId, sourceId, sequence, relativeTimeMs=atMs, mediaType, synthetic:true }` (+ point-cloud units/frame). Payload never contains defect/expected-result data. `202` shown as Accepted (queued), never as PASS.
- Stop: cancels remaining schedule, marks `Stopped — N files not sent`, never calls `/complete`. Session closed mid-run (`409 SESSION_CLOSED` / FINALIZING/COMPLETED/TERMINATED): stop, cancel retries, remaining = `Not sent — session closed`. Replay guidance: same `(sessionId,eventId)` dedupes — recommend fresh Argus session.

Out of scope: UI polish (S04), any media generation/analysis.

## Technical Specs

- **Scheduler pattern:** one ordered queue per `sourceId` (camera, photos, laser), all started from a common clock; each event waits for its `atMs`; a shared semaphore caps in-flight uploads at `MAX_CONCURRENT_UPLOADS` (default 3). Independent streams overlap without violating per-source `sequence`. Never waits on Meta inference. A `409` halts every queue; Stop aborts in-flight requests via an AbortController.
- **Retry pattern:** retry only `429`/timeouts/transient `5xx`/network errors, exponential backoff with **full jitter** (`random × min(RETRY_MAX_MS, RETRY_BASE_MS × 2^(n−1))`), **same `eventId`** (safe due to Argus idempotency PRD-04); never retry `400/401/404/409/413/415` — surface cause. All from env: `RETRY_MAX_ATTEMPTS=3`, `RETRY_BASE_MS=500`, `RETRY_MAX_MS=5000`, `HTTP_TIMEOUT_MS=30000` (per request, via `AbortSignal.timeout`), `MAX_CONCURRENT_UPLOADS=3`. Rows show `Retrying` while backing off; the status panel counts retries.
- **State machine:** `READY → VALIDATING → SENDING → STREAM_COMPLETE | STOPPED | FAILED`; single active run in-memory (optional run log); progress counts distinct acknowledged `eventId`s (retries never double-count). Sender APIs expose run status stream to web (poll or SSE locally).
- **Configuration:** `ARGUS_BASE_URL`, `ARGUS_INGEST_TOKEN` (sender env only).

## Acceptance

- [x] Against mock Argus: concurrent sources within the cap, per-source order, `409` stops all sources without `/complete`, closed session refused, `/complete` only on full ack, jittered capped backoff.

## References

- Spec: [Argus_Simulator_Spec.md](../specs/Argus_Simulator_Spec.md) §§4–7 · Tech: [Argus_Simulator_TechStack.md](../specs/Argus_Simulator_TechStack.md) §§5–7 (acceptance tests 1–8) · Argus contract: Argus `docs/specs/Argus_Spec.md` §10.3 / Argus PRD-04 (cross-repo, no relative link)
- UX: status semantics from [Simulator.dc.html](../ux/Argus%20Simulator%20click-through-html/Simulator.dc.html); engine itself is headless.

## Test Plan (write before implementation — tests fail first, against mock Argus)

- Contract: interleaved MP4/JPG/PLY post at declared offsets with real bytes + exact metadata (`synthetic:true`, pointcloud units/frame); per-source order preserved under overlap.
- Retry: `429/5xx`/timeout retries with **same `eventId`** + backoff within `RETRY_MAX_ATTEMPTS`; `400/404/409/413/415` never retried; ack counted once per `eventId`.
- State machine: Stop → no `/complete`, remaining `Not sent`; `409 SESSION_CLOSED` mid-run stops schedule+retries; unreachable Argus → no success shown; `/complete` exactly once only after full ack, session left open.
- Negative: payload contains no defect/ground-truth keys; closed/invalid session disables Send (real GET, not ID pattern).

## Verification (after implementation)

- [ ] Run this PRD's full test list (TechStack §7 tests 1–8) + Acceptance above against mock, then real Argus PRD-04.
- [ ] Manual: full send + mid-run Terminate from Argus. No test red/skipped.

## Review gate

v2 approved by the user on 03 Nov 2026 (issue #21). Edit this file to change scope.
