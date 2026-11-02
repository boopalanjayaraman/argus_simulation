# PRD-S04 — Sender UI: Controls, Status, Preview (Simulator)

Status: Awaiting review · Source: Simulator Spec §§2,7 · Depends on: PRD-S02, PRD-S03

## Specs

- Left controls: **Scenario** dropdown (from real scenario folders), **Argus API URL** (persisted locally), **Inspection Session ID** with live session status (`Session found: Waiting/Receiving/Analyzing/Closed` or real error — never inferred from text pattern), one prominent **Send Simulated Data** button (disabled until S03 readiness), caption “Files go out once, at their scheduled offsets”, **Stop** while sending (+ Reset after completion).
- Right status: `Ready to send / Sending / Stream complete / Stopped / Failed`, real total (`N files · duration`), progress by acknowledged uploads + elapsed replay time, counters `Video segments n/m · Photographs n/m · Point-cloud chunks n/m · Errors n` (all computed), **Latest file** + **Server response** (real filename/HTTP code; `202` never labelled passed).
- Tabs **Videos N / Photographs N / Laser point-cloud chunks N**: rows with thumbnail/icon, exact filename, size, scheduled offset, status pill (`Scheduled/Sending/Accepted/Retrying/Failed/Not sent`); click previews video/image locally; point-cloud rows show size/point count (optional simple 3D preview, no analysis). No defect labels or accuracy estimates anywhere.
- Top-right reachability reflects a real API check, not session validity. Disconnected ⇒ `Argus API unreachable`, no fake success.

Out of scope: engine internals (S03), any authoring/upload-your-own-media UI.

## Technical Specs

- **Pattern:** UI is a pure view over sender run state (S03 APIs); all counts derived from manifest + acknowledged event set — no duplicated counters in the browser. Session validation debounced; Send gating computed from (manifest valid ∧ API reachable ∧ session accepting).
- **Preview pattern:** sender serves local preview bytes/range requests; previewing never triggers an Argus upload.
- **Configuration:** API URL + last session ID in `localStorage` only (no server config product); theme tokens from UX bundle.

## Acceptance

- [ ] Full demo (§9 of Simulator Spec) runs from this one screen against real Argus.
- [ ] Stop/closed/disconnect states show truthful Not sent / error rows.

## Review gate

Reply `go PRD-S04` to implement, or edit this file first.
