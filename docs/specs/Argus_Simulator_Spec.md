# ARGUS SIMULATOR — Feature Specification (Prepared Evidence Sender)

**Repo:** `argus-simulator`  
**Version:** 0.9.1 · 03 November 2026 (§§2.1, 3, 4 updated to the implementation)  
**Status:** Hackathon MVP feature requirements  
**Companion:** `argus/SPEC.md` v0.9; communicates **only** through documented Argus API endpoints  
**Purpose:** Standalone specification of Simulator features, prepared-file scheduling, API behavior, operator controls, and acceptance criteria.

## 1. Role and hard boundary

Argus Simulator is an **independent, intentionally minimal media-replay application**. Its operator workflow is to choose a prepared scenario, target an open Argus inspection session, review the scheduled files, and press **Send Simulated Data**. The already-created media files are sent progressively via the same APIs a real client would use.

**Simulator does not:** create, enhance or generate media; inject defects; run Meta AI; inspect video/photos; process CAD; register point clouds; extract rules; send PASS/FAIL or ground truth; manage Argus inspection lifecycle; create dossiers; use a database; process acoustic/audio evidence. No login.

**Separation:** The Simulator has **no shared source code or runtime services** with Argus and no direct MongoDB/GCS access. The two repos deploy separately. Simulator may know the Argus API URL and inspection session ID only.

## 2. Sender Control and Monitoring Features

Top bar: play icon + **Argus Simulator**, descriptor **Prepared evidence replay**, right-side API reachability status (`Argus API reachable` / `Unreachable`). Clean dark theme and compact operational layout.

### 2.1 Left controls

- **Scenario** dropdown populated from actual prepared scenario directories (example: `CVS 6000D — Blue Valve`). No uploaded-media authoring UI is required.
- **Argus API URL** editable input (example: `http://localhost:8000`); persist in browser local state/config if useful, not a separate configuration product.
- **Inspection Session ID** input. Query `GET /api/v1/inspections/:id` and display the **actual lifecycle** (`Session found: Waiting / Receiving / Analyzing / Ready To Close`) or, for `FINALIZING / COMPLETED / TERMINATED`, `Session is Completed. It no longer accepts evidence; start a new inspection in Argus.` Send is enabled only for an accepting lifecycle; do not infer validity from HTTP 200 or the text pattern alone. If the Argus session pins a different `model_id` than the chosen scenario, show a warning.
- One prominent **Send Simulated Data** button enabled only when the manifest is valid, API reachable and target session accepts evidence.
- Caption **Files go out once, at their scheduled offsets**. No hidden media-generation process. While sending, provide **Stop** (plus optional Reset after completion).
- Simulator does **not** create an Argus inspection; operator must first create it from Argus Home.

### 2.2 Right: streaming status panel

- Initial **Ready to send** heading with actual total file count and manifest replay duration (example dataset: `50 files · 40 s`). Progress bar based on *acknowledged scheduled uploads*; show elapsed replay time separately.
- Media counters by type: `Video segments 0/26`, `Photographs 0/6`, `Point-cloud chunks 0/18`, plus `Errors 0` as examples. Computed counts and real success/failure states, never constants.
- **Latest file** and **Server response** fields: actual filename/HTTP code or backend message. `202 Accepted` means bytes accepted into Argus storage/queue; never a successful inspection verdict.
- Tabbed file list: **Videos N**, **Photographs N**, **Laser point-cloud chunks N**.
- Rows: preview thumbnail/icon, exact filename, file size, scheduled replay time offset, status pill (`Scheduled`, `Sending`, `Accepted`, `Retrying`, `Failed`, `Not sent`). Clicking a compatible file opens a local preview (video player or image); point-cloud rows show size/point count when available, optionally simple 3D preview but no geometric analysis.
- No displayed defect labels, analysis findings or accuracy estimates. Those exist only in Argus.

## 3. Prepared scenarios *(updated 03 Nov 2026 to the implementation)*

All content exists **before** the app starts. Scenarios are registered in **`src/available_simulations.json`**; the replay schedule is **computed from the prepared files at load time**, not authored in a per-scenario manifest (the earlier `scenarios/<id>/scenario.json` design is superseded).

```text
src/available_simulations.json        # scenario registry (one entry per scenario)
simulated_data/
  CVS_6000D/                          # model_id CVS6000_VALVE — grey valve before finishing
    CAD/cvs6000_valve.stl
    ImageCaptures/1.png … 6.png
    LaserPointCloud/valve_simulated_laser_scan_180deg.ply
    Video/Valve_Inspection_vid.mp4
  CVS_3000/                           # model_id CVS3000_VALVE — same CAD, after painting and name plating
    CAD/cvs3000_valve.stl             # identical to cvs6000_valve.stl (same sha256)
    ImageCaptures/01_first.png … 06_last.png   (12 photos)
    LaserPointCloud/valve_simulated_laser_scan_180deg.ply
    Video/valve_inspection_afterpaint.mp4
.chunks/<model_id>/                   # generated stream chunks (gitignored cache)
```

### 3.1 Scenario registry (`available_simulations.json`)

```json
{
  "available_simulation_data": [
    {
      "model_id": "CVS3000_VALVE",
      "display_name": "CVS 3000 — Finished Valve (painted, nameplated)",
      "parent_folder_path": "simulated_data/CVS_3000",
      "cad_path": "CAD/cvs3000_valve.stl",
      "image_captures_path": "ImageCaptures/",
      "laser_point_cloud_path": "LaserPointCloud/valve_simulated_laser_scan_180deg.ply",
      "video_path": "Video/valve_inspection_afterpaint.mp4"
    }
  ]
}
```

`model_id` is the connector to Argus's `cad_models.json` (the operator creates the Argus inspection for the same model). The CAD file is listed for reference only and is never sent.

### 3.2 Computed schedule

At load the sender turns one scenario into stream events (all counts computed, none hardcoded):

- **Video** (`camera-01`): the single prepared MP4 is cut into `VIDEO_CHUNK_MS` segments (default 2 s, ffmpeg, keyframe-aligned); segment *i* is scheduled at `i × IMAGE_INTERVAL_MS`.
- **Photographs** (`camera-photos-01`): every file in the image folder, sorted by name; photo *i* at `(i + 1) × IMAGE_INTERVAL_MS`.
- **Point cloud** (`laser-01`): the PLY is split into `POINTCLOUD_CHUNK_POINTS` vertex slices (default 50 000), stride taken from the PLY header; chunk *i* after the photos. Metadata `units: "mm"`, `coordinateFrame: "scanner_local"` (truthful: no pose is claimed).
- Event IDs `video-0001`, `photo-0001`, `pointcloud-0001`… per source with monotonic `sequence`; `atMs` is the intended replay offset, not physical synchronisation.
- Chunks are materialised once into `.chunks/<model_id>/` and regenerated when stale.
- The file list shows every scheduled event with name, size (or point count) and offset before anything is sent; photos preview locally without uploading.
- No filename or metadata encodes a verdict; no ground truth exists in the served data.

## 4. Streaming lifecycle

1. User starts an inspection in **Argus** (e.g. blue-valve recheck) and copies displayed `insp-...` ID.
2. In Simulator, choose prepared scenario, set **Argus API URL** and **Inspection Session ID**. Backend verifies Argus health/target status.
3. Click **Send Simulated Data**. Freeze manifest for the run; start a monotonic scheduler and read/send the *actual bytes* at each event's `atMs`.
4. POST files to three endpoints. **Each source (camera, photographs, laser) is its own ordered queue and the sources run concurrently**, bounded by `MAX_CONCURRENT_UPLOADS` in-flight requests overall (default 3); within a source, `sequence` order is preserved. Display status immediately on `Sending`; after `202` show `Accepted`; retry transient failures only within configured limits.
5. Update aggregate counters/progress and Latest file/Server response after every result. Media is sent at most once per manifest event unless an intentional retry occurs using the **same** event ID.
6. After every manifest event is acknowledged (or intentionally completed in the contractually allowed way), POST `/complete` **once**. Display `Stream complete — Argus inspection remains open.` Do **not** end the Argus inspection.
7. In Argus, users watch video, photos, point cloud and AI findings appear progressively; only Argus operators choose **End Inspection** or **Terminate Now**.

**Do not wait for Meta inference** before sending the next file. Argus's asynchronous event processing is independent of Simulator delivery rate. Simulator may pace/limit concurrent HTTP requests to avoid backpressure while maintaining intended sequence.

### 4.1 Buttons and interruption handling

- **Stop** cancels remaining scheduled events and pending attempts; mark `Stopped — N files not sent`. Never call `/complete` for an aborted schedule.
- **Target inspection terminated/closed**: Argus returns `409 SESSION_CLOSED` or `GET` shows `FINALIZING`, `COMPLETED`, `TERMINATED`. Stop schedule, cancel retries, mark remaining events `Not sent — session closed` and retain log. Simulator cannot reopen it.
- **Retry** bounded for `429`/timeouts/transient `5xx` with exponential backoff and same event ID. Do not retry on `400/404/409/413/415`; clearly display cause.
- **Replay** ideally targets a fresh Argus inspection ID. Because idempotency is `(sessionId,eventId)`, resending the same IDs to the same session will not create new evidence; warn user and recommend starting a new session.
- **Disconnected**: show `Argus API unreachable` and stop/hold appropriately. Never indicate successful delivery before Argus acknowledgment.

## 5. Exact Argus API integration

Only these Argus endpoints are needed:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/inspections/:id` | Validate session and lifecycle |
| `POST` | `/api/v1/inspections/:id/video` | Upload one video file/segment |
| `POST` | `/api/v1/inspections/:id/photos` | Upload one image |
| `POST` | `/api/v1/inspections/:id/pointcloud` | Upload one PLY/PCD chunk |
| `POST` | `/api/v1/inspections/:id/complete` | Producer feed finished; session is still open |

`GET /api/v1/health` may be introduced by Argus as a convenience for the top-right API status indicator, with a documented fallback to a known session query when not implemented. Never require an invented undocumented API for the first implementation.

### 5.1 Multipart upload

```text
Content-Type: multipart/form-data
file: <actual original bytes>
metadata: JSON string with:
  schemaVersion="1.0", eventId, sourceId, sequence,
  relativeTimeMs (= atMs), mediaType, synthetic=true;
  plus units/coordinateFrame/pose (point cloud, if supplied)
```

**Expected Argus `202`:** `{ "evidenceId": "...", "accepted": true, "processingStatus": "queued" }`. This does not mean analyzed, pass or fail. Payload must never contain defect status, expected rule result or any ground-truth label. Non-file path strings or base64 placeholders are not valid media inputs.

If publicly exposed for the hackathon, configure an ingestion token in the server-side Node sender environment, not in the React bundle. No login UI required.

## 6. Technical implementation and folder layout

| Layer | Recommendation | Responsibility |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | One-screen controls, files, counters, preview and status |
| Backend | Node.js + TypeScript, Fastify (or Express) | Serve selected scenario manifests and asset previews, send scheduled HTTP multipart uploads, expose local run/status stream |
| Persistence | Filesystem scenario folder only | Prepared MP4/JPG/PLY; **no** MongoDB or GCS in Simulator |
| State | In-memory single active run for MVP; optional run log file | Scheduled/accepted/retry/error counts and messages |
| Networking | HTTP(S) to Argus v1 public endpoints | Only cross-repo integration |

**Suggested structure:**

```text
argus-simulator/
  src/apps/web/           # React frontend
  src/apps/sender/        # Node API + scheduler
  simulated_data/     # prepared evidence per scenario
  src/available_simulations.json  # scenario registry
  SPEC.md
```

Use a **local sender backend**, not browser-direct upload, because prepared files are in a folder on the sender's machine. Frontend should not need access to file-system paths beyond the sender APIs. Keep one active replay session for the demo to avoid scheduler complexity.

## 7. UI data and progress semantics

- `totalFiles`: length of the scenario manifest events; not total unique filenames if repeated entries are intentional.
- `sentAccepted`: count of distinct events successfully acknowledged by Argus; retries do not increment twice.
- `elapsedTime`: schedule elapsed time; `replayDuration`: manifest duration; distinguish these from file upload elapsed time.
- `Video segments N/M`, `Photographs N/M`, `Laser point-cloud chunks N/M`: counts of **acknowledged** events vs scheduled events.
- `Errors`: number of events with terminal failure (retries can have warning count separately).
- `Session found: Waiting` is a live **Argus API** result; an invalid/closed session disables Send and explains reason.
- Top-right `Argus API reachable` reflects a successful network/API check, not proof that a target session accepts uploads.

Values such as `50 files · 40 s`, `26/6/18` type counts and sample filenames are **illustrative**, not fixed scenario constraints.

## 8. Completion and acceptance checklist

- [ ] Scenario dropdown discovers folders with valid manifests, and shows exactly their prepared files.
- [ ] The operator can see API reachability, target session and scenario controls, one primary send action, live upload status/counters, media filters, and file rows with actual sizes/times.
- [ ] Validates Argus API URL + session ID against actual status; `Send` disabled until ready.
- [ ] Sends real MP4, JPG/PNG and PLY/PCD bytes through three distinct Argus APIs at configured offsets with correct metadata.
- [ ] No media synthesis or analysis occurs in this repository.
- [ ] Sends concurrently when manifest sources overlap; preserves per-source sequencing and idempotent event ID on retry.
- [ ] Shows real HTTP accept/error state; `202` never labelled “inspection passed”.
- [ ] Stops cleanly on Stop, network error or Argus closure/termination, with remaining rows marked Not sent.
- [ ] `/complete` only after the full schedule is acknowledged and does not terminate the Argus session.
- [ ] New Argus session can replay the prepared dataset; files and manifest need no editing.
- [ ] Argus receives identical contract whether sender is Simulator or a real external integration client.
- [ ] No audio/acoustic or defect-ground-truth transmission anywhere in the sender UI or API.

## 9. Demo sequence

1. In **Argus Home** create a named inspection, optionally show selected work order; `Waiting for evidence` appears with CAD.
2. Switch to **Simulator**; select `CVS 6000D — Blue Valve`, paste Argus session ID; show `Argus API reachable` and `Session found: Waiting`.
3. Review prepared list (`Videos`, `Photographs`, `Laser point-cloud chunks`) and click **Send Simulated Data**.
4. Show real upload counters and per-file state in Simulator while Argus independently populates its four panes, timeline, rule progress and live findings.
5. Leave Simulator at `Stream complete` while Argus operator clicks **End Inspection**, reviews dossier and returns to Reports.
6. Optional second run: user clicks Argus **Terminate Now** midstream; Simulator stops and shows unsent files; Argus generates partial dossier.

**Canonical promise:** Simulator demonstrates the *transport of prepared evidence*. Argus demonstrates the *inspection intelligence*. The two must never be conflated.
