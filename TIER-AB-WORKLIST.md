# Plexus Canvas — Tier A+B build worklist (parity-audit follow-on, 2026-06-24)

Self-paced loop: ship ONE item per iteration with full discipline — AUDIT plugin.js first
(grep before building; the plugin is mature) → port the gap → node-extract a pure-logic test
(/tmp/pxc_*.test.js) → adversarial code-reviewer on the diff (render/select/export/minimap/lasso
paths; record/line writes = append-only/idempotent/confirm-gated) → fix real findings → bump
PLEXUS_VERSION + plugin.json → /usr/bin/git commit (author Svyatoslav Kleshchev, Co-Authored-By
Claude Opus 4.8 (1M context)) + push → append a BUILD-STATUS.md entry → check the box here.

Tier C (platform-blocked) + Tier D (AI/later) are logged as BACKLOG on the Thymer "Plexus Canvas"
project page (record 1ZD714PF7526KQTYQGRN3RK3MH) — do NOT build them in this loop.

When every box below is checked, the loop is DONE → summarize + stop (omit the wakeup re-arm).
For a PROBE-gated Tier-B item, if the probe shows it's platform-blocked, move it to the Thymer
backlog and check it off as "deferred" rather than forcing a broken build.

## Tier A — real wins (something is broken or lossy today)
- [x] A1 Live cards (record/query/linecard/rollup/table/board/task) in PNG/SVG/print/cite export — SHIPPED v1.106.0
- [x] A2 Concurrency rev-check — re-read Scene Rev before overwrite + conflict guard — SHIPPED v1.107.0
- [x] A3 AI image-edit on externalized (blob-backed) images — resolve blob→dataURL before the existing edit pipeline — SHIPPED v1.108.0
- [ ] A4 Templates: clone the full appState.colorPalette on "New from template" (today silently drops the palette)
- [ ] A5 Backlinks panel — "drawings referencing this record" via getBackReferenceRecords()
- [ ] A6 Elbow / orthogonal arrows — right-angle connector routing (no AI dep; mis-tagged in the audit)
- [ ] A7 TEST_HOOKS strip — gate window.__plexusCanvas.test.* behind a build flag

## Tier B — polish (lower value; probe-gated → if platform-blocked, log to backlog + check off as deferred)
- [ ] B1 Interactive image crop handles (el.crop data model exists; needs the handle-drag UI)
- [ ] B2 7 pen profiles (highlighter/finetip/fountain/marker/thick-thin…) + custom pen buttons
- [ ] B3 Layer-manager panel (named layers: show/hide/lock/reorder)
- [ ] B4 Frame settings dialog + clip-on-render + marker frames
- [ ] B5 Companion Drawings CollectionPlugin (declare Scene/Assets fields in plugin.json) + gallery view
- [ ] B6 Restored-panel auto-reopen (PROBE panel nav-state writability first; if blocked → backlog)
- [ ] B7 Auto-export banner keep-in-sync + light/dark variants (pairs with B5/B8)
- [ ] B8 Render drawing inline in notes (PROBE for a post-render/ref hook; if none → backlog)
- [ ] B9 Sub-drawing deep-link anchors (#group=/#area=/#frame=/#page=&rect= → zoom-select)
- [ ] B10 In-panel Settings modal (consolidate the existing piecemeal settings)
- [ ] B11 IndexedDB LocalCache (instant reopen; Thymer blob stays source of truth)
- [ ] B12 Re-editable Mermaid/LaTeX elements (store source + re-render vs flatten-to-image)
- [ ] B13 PDF vector export via jspdf (replace the window.print path; depends on A1)
- [ ] B14 Connector-label ergonomics (nudge offset, z-order, labels-on-curve, lock element)
- [ ] B15 Curved-arrow accurate hit-test + focus+gap arrow binding + full multi-point editing
- [ ] B16 Export fidelity: SVG hachure/cross-hatch patterns + arrowhead 'none' memory + grid/snap decouple
- [ ] B17 Editable shared-ontology record layer (record-backed config UI vs localStorage)
- [ ] B18 Dead-code cleanup (post-O(1)-pan blit/margin remnants)
- [ ] B19 Stencil .excalidrawlib import/export + embed-scene-JSON round-trip
