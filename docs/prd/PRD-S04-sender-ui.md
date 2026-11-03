# PRD-S04 — Sender UI: Controls, Status, Preview (Simulator)

Status: Implemented (v2, 03 Nov 2026: session status shows the real Argus lifecycle; closed sessions disable Send; model mismatch warning; retry count) · Source: Simulator Spec §§2,7 · Depends on: PRD-S02, PRD-S03

## Specs

- Left controls: **Scenario** dropdown (from real scenario folders), **Argus API URL** (persisted locally), **Inspection Session ID** with live session status from Argus's `lifecycleStatus` (`Session found: Waiting/Receiving/Analyzing/Ready To Close`; for Finalizing/Completed/Terminated: “Session is Completed. It no longer accepts evidence; start a new inspection in Argus.”; 404: not found) — never inferred from HTTP 200 or the text pattern; a warning when the session pins a different `model_id` than the scenario, one prominent **Send Simulated Data** button (disabled until S03 readiness), caption “Files go out once, at their scheduled offsets”, **Stop** while sending (+ Reset after completion).
- Right status: `Ready to send / Sending / Stream complete / Stopped / Failed`, real total (`N files · duration`), progress by acknowledged uploads + elapsed replay time, counters `Video segments n/m · Photographs n/m · Point-cloud chunks n/m · Errors n` (all computed), **Latest file** + **Server response** (real filename/HTTP code; `202` never labelled passed).
- Tabs **Videos N / Photographs N / Laser point-cloud chunks N**: rows with thumbnail/icon, exact filename, size, scheduled offset, status pill (`Scheduled/Sending/Accepted/Retrying/Failed/Not sent`); click previews video/image locally; point-cloud rows show size/point count (optional simple 3D preview, no analysis). No defect labels or accuracy estimates anywhere.
- Top-right reachability reflects a real API check, not session validity. Disconnected ⇒ `Argus API unreachable`, no fake success.

Out of scope: engine internals (S03), any authoring/upload-your-own-media UI.

## Technical Specs

- **Pattern:** UI is a pure view over sender run state (S03 APIs); all counts derived from the computed plan + acknowledged event set. Session validation debounced through the sender's `POST /api/validate` → `{reachable, status, lifecycleStatus, model_id, accepting}`; Send gating = plan present ∧ API reachable ∧ `accepting`.
- **Preview pattern:** sender serves local preview bytes/range requests; previewing never triggers an Argus upload.
- **Configuration:** API URL + last session ID in `localStorage` only (no server config product); theme tokens from UX bundle.

## Acceptance

- [ ] Full demo (§9 of Simulator Spec) runs from this one screen against real Argus.
- [ ] Stop/closed/disconnect states show truthful Not sent / error rows.

## References

- Spec: [Argus_Simulator_Spec.md](../specs/Argus_Simulator_Spec.md) §§2,7,9 · Tech: [Argus_Simulator_TechStack.md](../specs/Argus_Simulator_TechStack.md) §4
- UX: [Simulator.dc.html](../ux/Argus%20Simulator%20click-through-html/Simulator.dc.html) (controls, status panel, tabs, pills) + `ds/argus/components/bundle.css` — replicate values/layout, never ship mockup markup.

## Test Plan (write before implementation — tests fail first)

- Unit: view model derives all counters/progress from manifest + acknowledged set (retries don't double-count); Send gating = manifest valid ∧ reachable ∧ session accepting.
- UI (RTL): controls/tabs/pills render real filenames/sizes/offsets; `202` labelled Accepted never Passed; session status from live GET (valid-looking fake ID shows error).
- E2E (Playwright + mock Argus): select scenario → validate → Send → counters/latest-file update; Stop and disconnect show truthful Not sent/unreachable states.
- Negative: preview click triggers zero Argus requests; no defect labels anywhere in rendered DOM.

## Verification (after implementation)

- [ ] Run this PRD's full test list + Acceptance above.
- [ ] Playwright full demo (Simulator Spec §9) against real Argus. No test red/skipped.

## Review gate

v2 approved by the user on 03 Nov 2026 (issue #19). Edit this file to change scope.
