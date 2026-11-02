# Argus Simulator — Prepared Evidence Streaming MVP Specification

**Repository:** `argus-simulator`  
**Intended repo document:** `SPEC.md`  
**Version:** 0.4 — aligned with Argus instruction sets, session closure and dossier  
**Status:** Proposed for implementation  
**Last updated:** 2026-11-01

## 1. What we are building

**Argus Simulator is a simple, independent replay application.** All media is **already generated and stored on disk**. The simulator merely shows which files it is about to send and streams those files at scheduled intervals into the public Argus API, like a camera and laser scanner would.

**It does not** create CAD geometry, inject defects, generate AI videos, synthesize point clouds, run inference, inspect parts, assign pass/fail results, or write to Argus's database.

**One-sentence demo:** *Open the prepared valve scenario, see its videos/photos/scans, enter the waiting Argus session ID, click “Send Simulated Data”, and watch files go out one after another while Argus analyzes them live.*

## 2. Independence and scope

- A **separate repository**, separate UI and backend, and separate deployment from `argus`.
- Read-only access to a local `scenarios/` directory; no shared code/runtime/database with Argus.
- Communicates **only through the documented Argus v1 HTTP ingestion API**.
- No login, user roles, scenario editor, media generator, defect-editing controls, ground-truth scoring, or simulation of physical scanner optics in the MVP.
- The scenario package can include an optional `ground_truth.private.json` for developer evaluation, but **must never send it or include defect labels in API metadata**.

## 3. Minimal simulator UI

A single clean page:

1. **Title:** Argus Simulator; status indicator for Argus API reachable/unreachable.
2. **Scenario selector:** defaults to a prepared folder (e.g., `CVS 6000D — Blue Valve`).
3. **Media preview:** list/thumbnail gallery of files that will be sent, grouped into `Videos`, `Photographs`, and `Laser point-cloud chunks`; show file counts, sizes and scheduled playback offsets. Video may be previewed in the browser; photos displayed as thumbnails; point clouds can show file name/point count (3D viewer optional, **not required**).
4. **Connection inputs:** `Argus API URL` (default local config) and `Inspection Session ID` copied from Argus.
5. **Primary action:** **Send Simulated Data**.
6. **During replay:** simple counters for video segments sent, photos sent, point-cloud chunks sent, latest file, server acknowledgment and errors. Optional **Stop** and **Replay** actions; no multi-page console.
7. **After completion:** `All files sent / X failed` message. Argus, not the simulator, displays inspection findings.

## 4. Prepared scenario folder — the only source of evidence

```text
scenarios/
  cvs6000d_blue_valve/
    scenario.json                   # media schedule + file paths + metadata
    video/
      shot_01_000.mp4               # pre-split video chunks/segments
      shot_01_001.mp4
      ...
      shot_08_00N.mp4
    photos/
      shot_02_front_flange.jpg
      shot_03_bonnet.jpg
      shot_04_body_nameplate.jpg
      shot_05_actuator.jpg
      shot_06_other_flange.jpg
      shot_07_linkage.jpg
    pointcloud/
      chunk_0001.ply
      chunk_0002.ply
      ...
    ground_truth.private.json       # optional; NEVER transmitted
```

The scenario is **prepared before the demo**. Media generation occurs elsewhere and does not belong to this repo. If only full-length MP4 files exist, split them into 1–2 second segments **once during scenario preparation** (or support one-file uploads initially); do not perform expensive AI generation or 3D processing in the simulator.

The scenario manifest is declarative; no hardcoded file names or demo-specific event logic in application code.

Example `scenario.json`:

```json
{
  "scenarioId": "cvs6000d-blue-v1",
  "displayName": "CVS 6000D — Blue Valve",
  "schemaVersion": "1.0",
  "durationMs": 40000,
  "events": [
    {
      "atMs": 0,
      "eventId": "blue-v1-v0001",
      "sourceId": "camera-01",
      "sequence": 1,
      "mediaType": "video",
      "path": "video/shot_01_000.mp4",
      "featureHint": "overview"
    },
    {
      "atMs": 7200,
      "eventId": "blue-v1-p0001",
      "sourceId": "camera-photos-01",
      "sequence": 1,
      "mediaType": "photo",
      "path": "photos/shot_02_front_flange.jpg",
      "featureHint": "front_flange"
    },
    {
      "atMs": 7600,
      "eventId": "blue-v1-l0001",
      "sourceId": "laser-01",
      "sequence": 1,
      "mediaType": "pointcloud",
      "path": "pointcloud/chunk_0001.ply",
      "units": "mm",
      "coordinateFrame": "cad_world",
      "featureHint": "front_flange"
    }
  ]
}
```

For demonstration repeatability, files have **fixed relative timestamps**. The simulator sends events at those offsets after the operator starts; it sends the raw files and metadata, **never computed findings**.

## 5. Streaming behavior

**Operator flow:**

1. In **Argus**, enter an inspection name and click **Start Inspection**.
2. Argus displays a **Session ID** and `Waiting for evidence`.
3. In **Argus Simulator**, select prepared folder, paste Session ID, and click **Send Simulated Data**.
4. Simulator checks that Argus is reachable and that the session ID is valid.
5. Simulator reads scheduled files from disk and sends **video segments, photographs and point-cloud chunks** to their separate documented endpoints; video and scan may overlap in time.
6. Simulator shows acknowledgment/counts; Argus screen independently starts rendering data and updating findings as analysis completes.
7. When the schedule finishes, simulator calls **Complete** once, shows delivery summary, and stops. **This signals only end-of-feed**. Argus remains open until its operator selects **End Inspection** or **Terminate Now**; only Argus generates the dossier.
8. If the Argus operator terminates or closes a session during replay, simulator must stop its scheduler and report **Inspection closed by Argus**. It must not keep retrying uploads to the closed session.

### Argus public endpoints used

**Lifecycle ownership:** Argus's `/close` and `/terminate` endpoints are **not** simulator commands. Simulator never invokes them or requests dossier generation. The simulator must support `WAITING`, `RECEIVING`, `ANALYZING`, `READY_TO_CLOSE`, `FINALIZING`, `COMPLETED`, and `TERMINATED` when reading Argus session status.

```http
GET  /api/v1/inspections/{sessionId}
POST /api/v1/inspections/{sessionId}/video
POST /api/v1/inspections/{sessionId}/photos
POST /api/v1/inspections/{sessionId}/pointcloud
POST /api/v1/inspections/{sessionId}/complete  # producer finished sending, NOT inspection closed
```

Each upload is `multipart/form-data` containing `file` (actual media bytes) and `metadata` (JSON string). Argus owns this contract; simulator pins schema version `1.0` rather than reaching into Argus internals.

**Required metadata:** `schemaVersion`, `eventId`, `sourceId`, `sequence`, `relativeTimeMs`, `mediaType`, `synthetic: true`; for scans also include `units` and `coordinateFrame`, plus pose when available. `featureHint` is optional *routing assistance*, not a defect label and not proof a criterion passed or failed.

The simulator emits **only evidence**. It must never call a findings endpoint, supply `expectedStatus`, attach a list of known defects, or preemptively signal an inspection outcome.

### Simple transport behavior

- Use an in-process async scheduler that respects relative `atMs`; limited parallel sending across video/photo/point-cloud source streams is enough.
- Send each file **once** and wait for an HTTP acknowledgment or retry transient failures. Use stable event IDs for idempotent retries.
- Keep video segments ordered per camera and PLY chunks ordered per laser source.
- A 40-second scenario is a reasonable default; a demo can also use a longer timeline if analysis needs time.
- Mark missing local files clearly and disable Start rather than pretending data was sent.
- If the operator presses Stop in the **simulator**, stop future uploads; do not report a session as complete unless all files have actually been acknowledged. This does **not** terminate the Argus inspection; operator closes it from Argus.
- Before starting send, GET Argus session and verify it is open. Poll lightweight session state during replay (or react to any `409 SESSION_CLOSED`). If it transitions to `FINALIZING`, `COMPLETED` or `TERMINATED`, cancel scheduled sends, abandon retries, mark unsent events as `not_sent_session_closed`, and show an accurate final delivery summary.
- A `409 SESSION_CLOSED` is a **terminal, non-retryable** response, not a transient network failure. Never auto-create a new session or resend unsent files after operator termination.
- If Argus is `READY_TO_CLOSE` because `/complete` was acknowledged, do not send any more scenario media; show **Stream finished — end inspection in Argus to generate dossier**.
- Show real processing/delivery status, not animations that claim Argus has found a defect.

## 6. Connection to Argus is source-agnostic

```
Prepared folder on disk
        │
        ▼
Argus Simulator UI + small sender service
        │
        ├── video segments ─── POST /video
        ├── photo captures ─── POST /photos
        └── PLY scan chunks ─── POST /pointcloud
                                │
                                ▼
                         ARGUS public API
                                │
                   Owns analysis, SSE and UI
```

No direct data sharing beyond HTTP. In practice the simulator can run a tiny Node/TypeScript backend to read files and post to Argus, plus React UI for previews. No database is needed: replay state and counters can live in memory.

## 7. Suggested implementation (not mandatory)

- Frontend: React + TypeScript; simple thumbnails, video previews and send counters.
- Backend: small Node/TypeScript app reading from a **configured** scenarios folder, validating relative paths to avoid file traversal, and sending multipart requests to Argus.
- Configuration: `ARGUS_BASE_URL`, `SCENARIOS_DIR`; no secrets embedded in files.
- Keep the app usable on one development laptop or two separate local/cloud processes.
- Do not build CAD conversion, camera control, synthetic data generation, point-cloud alignment, ML inference or a scenario editor.

## 8. MVP acceptance criteria

1. App lists **prepared files already on disk** and previews video and photo assets, with point-cloud filenames/point counts.
2. Operator pastes the session ID from Argus and clicks **Send Simulated Data** once.
3. At least one prepared scenario sends video segments, six inspection photographs and multiple PLY point-cloud chunks through the **public** Argus endpoints over time.
4. Status counters match real HTTP acknowledgments; missing files/errors are visibly reported.
5. Simulator sends no pass/fail/defect predictions or known ground-truth labels.
6. Simulator can be developed, run, stopped and redeployed independently of Argus.
7. After successful delivery it invokes the `complete` endpoint; Argus continues any pending analysis, then waits for its operator to close the inspection. Simulator makes **no claim** that a dossier or inspection outcome was produced.
8. If an operator terminates the Argus session midway through a replay, simulator receives/polls `SESSION_CLOSED`, stops pending uploads, and clearly shows which files were acknowledged vs not sent. No retries after closure.
9. No local inspection-history pages or Instruction Set viewer are built in the simulator; these remain solely in Argus.

## 9. Intentionally out of scope

AI video generation, CAD parsing, photo creation, scanner physics simulation, injecting/removing bolts, altering crack placement, 3D rendering of ground truth, login, scenario editing, multi-user collaboration, result scoring dashboards, server-side inspection reporting, database persistence or production device emulation.

**Companion but independent repo:** `argus`. It owns the inspection rules, geometry analysis, persistence and live workbench. This simulator's responsibility ends at **delivering prepared evidence through the public API**.

## 10. Cross-repo demo runbook — session lifecycle

1. Open **Argus Home**, check historical sessions and optionally view **Instruction Sets** (preloaded rules).
2. Create `CVS 6000D — Blue Valve Run` from **Start New Inspection**; Argus shows its CAD and **Waiting for data**.
3. Open simulator and paste the new session ID; preview the files; press **Send Simulated Data**.
4. Argus renders incoming video/photos/point-cloud chunks, displays real analysis events with rule citations, and updates its findings feed. Simulator only shows send progress.
5. Normal case: simulator sends all files and calls `/complete`; Argus becomes `READY_TO_CLOSE`. Operator clicks **End Inspection**; dossier is generated and session appears on Home as **Completed**.
6. Abrupt case: with a new session, operator clicks **Terminate Now** while simulator is still sending; Argus freezes a partial dossier, rejects future media, and simulator stops with **Session closed**. Session appears on Home as **Terminated**, with outcome **Inconclusive** unless a supported failure was already recorded (the report must still say partial).
7. Clicking a historical Home item opens Argus's read-only timeline/report, never the simulator.

**Ownership boundary:** `argus-simulator` owns no UI routes, rule ingestion, session closure, inspection statuses or dossier artifacts inside `argus`. This document only ensures compatibility with the published API lifecycle.
