# Argus Simulator — Folder Structure (as of 02 Nov 2026)

Repo: `argus_simulation` (this repo) · Prepared-evidence sender to Argus. Status: **specs + prepared media only, no implementation yet** (`src/` is empty).

## Current tree

```text
argus_simulation/
├── README.md                        # "simulate video streaming and laser point cloud, images to argus"
├── available_simulations.json       # LEGACY manifest (Windows paths) — superseded by scenario.json in PRD-S02
├── docs/
│   ├── folder-structure.md          # This file
│   ├── specs/
│   │   ├── Argus_Simulator_Spec.md        # Authoritative feature spec v0.9 (normative)
│   │   └── Argus_Simulator_TechStack.md   # Sender stack, scheduler, retry, API contract
│   ├── ux/
│   │   └── Argus Simulator click-through-html/  # Design reference mockup (not production code)
│   │       ├── Simulator.dc.html
│   │       ├── README.md
│   │       ├── ds/argus/components/bundle.css
│   │       ├── assets/                     # Fonts
│   │       ├── vendor/                     # react.js, react-dom.js (mockup runtime)
│   │       └── support.js                  # Mockup runtime
│   └── prd/                         # Per-feature PRDs — review + go-ahead before each build
├── simulated_data/
│   └── CVS_6000D/                   # Prepared evidence (113 MB) — same valve as Argus CAD
│       ├── Video/Valve_Inspection_vid.mp4          (13 MB, single long file)
│       ├── ImageCaptures/1.png … 6.png             (6 photos)
│       ├── LaserPointCloud/valve_simulated_laser_scan_180deg.ply  (12 MB)
│       ├── LaserPointCloud/valve_scan_build_180deg.mp4
│       └── CAD/cvs6000_valve.stl, valve_CAD_reference_full_surface.ply, 360d cad view.jpeg
├── customer_data/                   # EMPTY
└── src/                             # EMPTY — implementation lands here per PRDs
```

## Reading order

1. [Simulator spec](specs/Argus_Simulator_Spec.md) — what to build (wins on any conflict).
2. [Tech stack](specs/Argus_Simulator_TechStack.md) — scheduler, retry, API contract.
3. [PRDs](prd/README.md) — one feature at a time.

## Target layout (created by PRD-S01, not yet present)

```text
apps/web/  apps/sender/  scenarios/cvs6000d-blue-demo/{video,photos,pointcloud}/  tests/  scripts/
```

Do not create these until PRD-S01 is reviewed and given go-ahead.
Hard boundary: no shared code/DB/runtime with Argus; only Argus public API v1. No media generation, inspection, or ground-truth transmission ever.
