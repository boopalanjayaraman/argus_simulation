# PRD-S02 — Scenario Manifest & Validation (Simulator)

Status: Awaiting review · Source: Simulator Spec §3 · TechStack §3 · Depends on: PRD-S01

## Specs

- Scenario layout: `scenarios/cvs6000d-blue-demo/{scenario.json, video/, photos/, pointcloud/}`. Build the first manifest from the real prepared assets now in `simulated_data/CVS_6000D/` (1 long MP4 sent as one file is valid; 6 PNGs; PLY scan) — counts/duration computed, never assumed (not fixed 26/6/18/40 s).
- `scenario.json`: `{ schemaVersion:"1.0", scenarioId, displayName, durationMs, events[] }`; each event `{ eventId, sourceId, sequence, atMs, mediaType, path }` (+ `segmentIndex/durationMs` video; `units/coordinateFrame` point cloud, truthful only; pose only if known).
- Startup validation: enumerate actual files under scenario root, reject `..` traversal/unknown paths, check extensions (`mp4`, `jpg/png`, `ply/pcd`) + size limits, sort by `atMs` then per-source `sequence`, detect duplicate event IDs/per-source sequences, negative offsets, missing files. Bad items show visible errors — never silently skipped. Local preview without uploading.
- `src/available_simulations.json` carries `model_id` (e.g. `CVS6000_VALVE`) + `display_name` per scenario — the connector to Argus `cad_models.json`. The UI/operator picks the Argus CAD by this ID, not by path. Legacy root-level `available_simulations.json` (Windows backslashes, `Image_Captures`) is superseded by this file; the scenario manifest remains the runtime source once built. Ground truth, if any, lives outside served assets; sender never reads/displays/sends it. No filename/metadata may encode a verdict.

Out of scope: sending (S03), Argus-side handling (Argus PRD-04).

## Technical Specs

- **Pattern:** validate-once-at-startup (Zod schema + filesystem cross-check), manifest frozen per run in S03. Sender APIs: list scenarios, get manifest with per-file size/offset/status, preview bytes.
- **Configuration:** `SCENARIOS_DIR`, `MAX_FILE_MB` per media type in sender env; limits mirrored in error messages.
- **Scripts:** `scripts/build-manifest` generates `scenario.json` from a prepared folder (explicit `atMs` schedule input; tool never invents timing silently — schedule is reviewed data).

## Acceptance

- [ ] Dropdown/list shows exactly the prepared files with real sizes/offsets.
- [ ] Corrupt manifest (missing file, duplicate sequence, traversal) blocks Send with visible errors.

## Review gate

Reply `go PRD-S02` to implement, or edit this file first.
