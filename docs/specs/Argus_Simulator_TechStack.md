# Argus Simulator — Technology Stack & Sender Architecture

**Document version:** 0.9 · 02 November 2026  
**Repository:** `argus-simulator`  
**Authoritative functional contract:** `argus-simulator/SPEC.md` — Simulator Feature Specification v0.9  
**Integration target:** Argus public HTTP API v1, as defined in `argus/SPEC.md` v0.9  
**Status:** Implementation plan for an independent sender of already-generated inspection evidence.

## 1. Exact boundary

Simulator is **a simple prepared-file sender**: it lists local scenario media, validates a target Argus inspection session, and uploads scheduled MP4 video, JPEG/PNG photos and PLY/PCD point-cloud chunks. **It performs no inspection.** It does not generate imagery, insert defects, know expected failures, call Meta, read Argus storage or create dossiers. It runs independently of the main `argus` repository, with no shared code/database/runtime.

## 2. Minimal stack

| Concern | Choice | Responsibility |
|---|---|---|
| Frontend | React + TypeScript + Vite | One-page scenario/session controls, media tabs, preview, progress and errors |
| Styling | Tailwind CSS + simple accessible component library | Compact inspection sender UI matching application branding without duplication of Argus logic |
| Sender/backend | Node.js 22 LTS + TypeScript + Fastify | Read scenario files on disk, validate manifest, issue actual multipart posts |
| Manifest validation | Zod | Validate IDs, paths, types, offsets, sequences, units, frames and missing files |
| Scheduling | Node monotonic time + bounded timers/async concurrency | Preserve `atMs` replay schedule and per-source order; independent streams may overlap |
| HTTP client | Native `fetch`/undici, FormData | Send original file bytes; preserve `eventId` on retries; inspect actual HTTP response |
| Assets | Local or mounted `scenarios/` directory | Prepared files read-only; no database, GCS or CAD processing |
| Local run state | In-memory with optional operational log | Single active run; accepted/failed/unsent counters, errors and last server response |
| Testing | Vitest + Playwright + mock Argus API | Request contract, timing/counts, retries, early closure/stop, absent-media validation |
| Deployment | Local Node/Vite demo or a Node container with mounted assets | No need for background worker, Kubernetes or cloud object storage |

No Python, model SDK, SAM, rule engine, report renderer, robot controller or audio/acoustic pipeline in this repo.

## 3. Source folder and scheduler

```text
argus-simulator/
  src/apps/web/
  src/apps/sender/
  scenarios/
    cvs6000d-blue-demo/
      scenario.json
      video/*.mp4
      photos/*.{jpg,png}
      pointcloud/*.{ply,pcd}
  tests/
  .env.example
  SPEC.md
  TECH_STACK.md
```

`scenario.json` follows Simulator SPEC §3.1: `schemaVersion`, `scenarioId`, `displayName`, `durationMs`, and an `events[]` collection with `eventId`, `sourceId`, per-source `sequence`, `atMs`, `mediaType`, relative file `path`; video can specify segment index/duration; point-cloud entries additionally have truthful `units` and `coordinateFrame` and optional known pose. Counts such as `26/6/18` and 40 s are **illustrative**.

**Validation before send:** reject missing files, path traversal, unknown extensions, invalid/negative offsets, duplicate event IDs or per-source sequence, contradictory scan units, oversize items and a closed target session. Reveal errors rather than silently omitting files. Do not send `ground_truth`, `defect`, `expectedResult`, predicted rules or requested final statuses in filenames, metadata or payloads. If authoring-only ground truth exists, keep it outside served assets and the sender's accessible manifest.

## 4. One-page sender features

- Left pane: **Scenario**, **Argus API URL**, **Inspection Session ID**; query `GET /api/v1/inspections/:id` and show actual session status; **Send Simulated Data**, **Stop**, validation errors.
- Right upper pane: API reachable indicator, **Ready to send / Sending / Stream complete / Stopped / Failed**, accepted-vs-total progress, current file, last HTTP response, error count and replay timer.
- Right lower pane: **Videos**, **Photographs**, **Laser point-cloud chunks**; exact existing filenames, file size, scheduled offset, preview and status pill.
- A valid-looking session ID string is **not** evidence it exists; Send is disabled until the server confirms it is accepting data. No login or external configuration dashboard.

**Counters represent distinct acknowledged event IDs, not processing results.** `202 Accepted` ≠ Meta inference complete and ≠ PASS. `durationMs` is scheduled replay duration, not upload wall time or physical camera capture time.

## 5. Public API v1 integration

| Method | Endpoint | Simulator behavior |
|---|---|---|
| `GET` | `/api/v1/inspections/:id` | Verify lifecycle and read target status |
| `POST` | `/api/v1/inspections/:id/video` | Multipart one original MP4/segment |
| `POST` | `/api/v1/inspections/:id/photos` | Multipart one real JPG/PNG |
| `POST` | `/api/v1/inspections/:id/pointcloud` | Multipart one real PLY/PCD with scan frame and units |
| `POST` | `/api/v1/inspections/:id/complete` | Send **only after** scheduled event acknowledgments; session remains open |

`GET /api/v1/health` is an **optional convenience**, not required unless added to Argus contract. API connectivity can be confirmed with the session GET.

```text
Content-Type: multipart/form-data
file       = real MP4 / JPG / PNG / PLY / PCD bytes
metadata   = JSON string:
  schemaVersion = "1.0"
  eventId       = unique per manifest event, stable on retry
  sourceId      = "camera-01" | "camera-photos-01" | "laser-01" (or actual source ID)
  sequence      = monotonically ordered within source
  relativeTimeMs = event.atMs
  mediaType     = "video" | "photo" | "pointcloud"
  synthetic     = true
  units, coordinateFrame = required for pointcloud
  pose          = optional only if externally known/calibrated
```

An accepted upload receives HTTP `202` with `{ evidenceId, accepted:true, processingStatus:"queued" }`. Do not display that as an inspection result. Target returning `409 SESSION_CLOSED` or `FINALIZING/COMPLETED/TERMINATED` means immediately stop the schedule and all retries. Terminal `400/404/409/413/415` errors are shown; retry transient `429/5xx` and timeouts with exponential backoff and the **same** event ID. Replays should use **a new Argus session ID**; an old session intentionally rejects or deduplicates prior events.

## 6. Replay state machine

```text
READY
  -> VALIDATING (folder + session GET)
  -> SENDING (scheduled, per-source ordered HTTP POSTs)
       -> accepted 202 per event -> increment accepted count
       -> transient error -> bounded retry using same eventId
       -> terminal error -> mark failed / optionally stop run
       -> Stop or Argus 409 -> STOPPED (unsent rows retained)
  -> STREAM_COMPLETE (all scheduled events acknowledged)
       -> send /complete once
       -> display "Stream complete — Argus inspection remains open"
```

No call to Argus close or terminate. No automated session creation. The Simulator must not block on Argus inference or wait for model observations. A stop/aborted run does **not** falsely call `/complete`. After a normal completed send, Argus operator chooses End Inspection or Terminate Now.

**Race handling:** check session at start, treat every per-file POST error as authoritative; stop on first confirmed terminal closed session even if the previous GET still said Waiting. Close near a scheduled send can legitimately produce `409`; show how many files were not sent.

## 7. Integration acceptance tests

1. Prepared manifest is discovered, all media rows preview without uploads and counts match actual files.
2. A real **Waiting** Argus session is validated; a nonexistent/closed one disables Send.
3. Interleaved MP4/JPG/PLY requests post at declared offsets with actual bytes and consistent metadata.
4. A `202` increments accepted count exactly once per unique event, even across retry and a late network acknowledgment.
5. Transient retry retains event ID; terminal `409 SESSION_CLOSED` stops and marks remaining files Not sent.
6. `/complete` is issued only for a fully acknowledged run and does **not** close Argus's inspection.
7. Reset + new Argus session can replay identical prepared files without modification.
8. No Meta calls, model verdicts, defect labels, geometry analysis, Mongo/GCS connection or acoustic processing exist in Simulator.

## 8. Environment and change control

Environment: `ARGUS_BASE_URL`, `SCENARIOS_DIR`, optional `ARGUS_INGEST_TOKEN` in **Node sender** (never React bundle). Limit file reads to validated scenario root; use TLS and a server-to-server token or a private network when Argus is externally reachable. Keep sender backend responsible for filesystem access; browser reads only local UI API and file previews.

`argus-simulator/SPEC.md` v0.9 is authoritative for features, files and API. `argus/SPEC.md` v0.9 is authoritative for the server protocol. If the server contract evolves, coordinate an explicit versioned change; two repos should never need a shared database or import each other's source code.
