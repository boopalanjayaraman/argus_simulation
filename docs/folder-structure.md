# Argus Simulator — Folder Structure (as of 03 Nov 2026)

Repo: `argus_simulation` (this repo) · Prepared-evidence sender to Argus. Status: implemented (PRD-S01…S04); runs with `npm start` (http://localhost:4173) or `docker compose up --build`.

## Current tree

```text
argus_simulation/
├── README.md
├── package.json                     # build / start / dev / test
├── Dockerfile, docker-compose.yml   # one container (:4173), ffmpeg included; ARGUS_BASE_URL → Argus API
├── .env.example                     # ARGUS_BASE_URL, token, schedule, chunking, concurrency, retry
├── docs/
│   ├── folder-structure.md          # This file
│   ├── specs/
│   │   ├── Argus_Simulator_Spec.md        # Feature spec v0.9.1 (normative)
│   │   └── Argus_Simulator_TechStack.md   # Sender stack, scheduler, retry, API contract
│   ├── prd/                         # PRD-S01 … PRD-S04 + README index
│   └── ux/Argus Simulator click-through-html/   # Design reference mockup
├── simulated_data/                  # Prepared evidence (read-only)
│   ├── CVS_6000D/                   # CVS6000_VALVE — grey valve before finishing
│   │   ├── CAD/cvs6000_valve.stl, valve_CAD_reference_full_surface.ply, 360d cad view.jpeg
│   │   ├── ImageCaptures/1.png … 6.png
│   │   ├── LaserPointCloud/valve_simulated_laser_scan_180deg.ply, valve_scan_build_180deg.mp4
│   │   └── Video/Valve_Inspection_vid.mp4
│   └── CVS_3000/                    # CVS3000_VALVE — same CAD, after painting and name plating
│       ├── CAD/cvs3000_valve.stl    # identical to cvs6000_valve.stl
│       ├── ImageCaptures/01_first.png … 06_last.png   (12)
│       ├── LaserPointCloud/valve_simulated_laser_scan_180deg.ply
│       └── Video/valve_inspection_afterpaint.mp4
├── .chunks/<model_id>/              # Generated video segments + PLY slices (gitignored)
└── src/
    ├── available_simulations.json   # Scenario registry (model_id ↔ Argus cad_models.json)
    └── apps/
        ├── sender/src/server.ts     # Registry, computed schedule, chunking, per-source scheduler, retry, previews
        └── web/src/App.tsx          # One-page UI: scenario, Argus URL, session status, counters, file tabs
```

The customer work order that used to sit in `customer_data/` now lives in the Argus repo's reference pack (`src/reference-data/cvs6000d-48-demo/customer-documents/`), because it is uploaded to Argus through its UI, not sent by the Simulator.

## Reading order

1. [Simulator spec](specs/Argus_Simulator_Spec.md) — what to build (wins on any conflict).
2. [Tech stack](specs/Argus_Simulator_TechStack.md) — scheduler, retry, API contract.
3. [PRDs](prd/README.md).

Hard boundary: no shared code/DB/runtime with Argus; only Argus public API v1. No media generation, inspection, or ground-truth transmission ever.
