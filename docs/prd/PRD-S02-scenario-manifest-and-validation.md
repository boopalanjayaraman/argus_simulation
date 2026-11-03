# PRD-S02 — Scenario Registry & Computed Schedule (Simulator)

Status: Implemented (v2, 03 Nov 2026: spec aligned to the implementation — registry + computed schedule replace per-scenario `scenario.json`; second scenario `CVS3000_VALVE`) · Source: Simulator Spec §3 · TechStack §3 · Depends on: PRD-S01

## Specs

- **Scenario registry:** `src/available_simulations.json`, one entry per scenario: `model_id` (connector to Argus `cad_models.json`), `display_name`, `parent_folder_path`, `cad_path` (reference only, never sent), `image_captures_path`, `laser_point_cloud_path`, `video_path`. Paths are forward-slash, relative to the repo root.
- **Scenarios:** `CVS6000_VALVE` — *CVS 6000D — Blue Valve* (`simulated_data/CVS_6000D`, grey valve before finishing: 1 MP4, 6 photos, 1 PLY). `CVS3000_VALVE` — *CVS 3000 — Finished Valve (painted, nameplated)* (`simulated_data/CVS_3000`: same CAD as CVS 6000D, new evidence after painting and name plating: 1 MP4, 12 photos, 1 PLY). How the finished valve differs from the unfinished one is part of the demo.
- **Computed schedule (decided):** no hand-authored manifest. At load the sender derives events from the files: video cut into `VIDEO_CHUNK_MS` segments, photos in name order, the PLY split into `POINTCLOUD_CHUNK_POINTS` slices using the header's vertex stride; offsets from `IMAGE_INTERVAL_MS`; per-source `sequence` and stable event IDs; point clouds labelled `units: mm`, `coordinateFrame: scanner_local`. Counts and duration are computed, never assumed.
- **Validation:** a missing registry folder/file yields no events for that source and the UI shows what was found; previews never upload. No filename or metadata may encode a verdict; no ground truth is read, displayed or sent.

Out of scope: sending (S03), Argus-side handling (Argus PRD-04), hand-authored per-event schedules.

## Technical Specs

- **Pattern:** `loadSimulations()` reads the registry; `buildEvents()` computes the plan; `materializeChunks()` writes `.chunks/<model_id>/` once (ffmpeg segments; PLY slices regenerated when their size disagrees with the header stride). Sender APIs: `GET /api/simulations` (registry + plan + totals), `GET /preview` (path-checked under the scenario folder).
- **Configuration:** `IMAGE_INTERVAL_MS` (2000), `VIDEO_CHUNK_MS` (2000), `POINTCLOUD_CHUNK_POINTS` (50000).

## Acceptance

- [x] Dropdown lists both scenarios; file tabs show the computed segments, photos and chunks with real sizes/point counts and offsets.
- [x] `CVS3000_VALVE` plans 12 photos and the after-paint video.

## References

- Spec: [Argus_Simulator_Spec.md](../specs/Argus_Simulator_Spec.md) §3 · Tech: [Argus_Simulator_TechStack.md](../specs/Argus_Simulator_TechStack.md) §3 · Connector: `src/available_simulations.json` (`model_id`) ↔ Argus `cad_models.json`

## Test Plan

- Vitest: registry entries load (6 photos for CVS 6000D, 12 + after-paint video for CVS 3000); video and point cloud split into >1 chunks with positive point counts; photo offsets follow the interval; PLY stride from header (17 bytes for x/y/z float + 5 uchar).

## Verification

- [x] Sender Vitest suite green (9/9).

## Review gate

v2 approved by the user on 03 Nov 2026 (issues #20, #22). Edit this file to change scope.
