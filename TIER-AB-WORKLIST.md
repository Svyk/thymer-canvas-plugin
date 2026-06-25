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
- [x] A4 Templates: clone the full appState.colorPalette on "New from template" — COVERED (reimagined), NO SHIP. No `appState.colorPalette` field nor a drawing-template-clone exists in Plexus for the audit's premise to apply. Palette inheritance is already shipped + wired two ways, both inherited by every new drawing: (1) the localStorage `recentColors` shared palette (pushRecentColor@5841 on apply → "Recent (across drawings)" swatch row@5857), (2) the user-configurable toolbar palette (`c.palette`@352). Building a literal colorPalette-clone would mean first inventing a per-drawing palette object + a drawing-template system = low-value invention. Audit mischaracterized this item.
- [x] A5 Backlinks panel — "drawings referencing this record" via getBackReferences() — SHIPPED v1.109.0
- [x] A6 Elbow / orthogonal arrows — ALREADY SHIPPED (audit-resolved, NO SHIP). `routedPoints()`@912 = right-angle 4-pt orthogonal route; `_toggleElbow`@1977 / `_setConnRouting('elbow')`@1980 (straight|elbow|curved, mutually exclusive); connector flyout "⌐ Elbow (right-angle)"@2290 + command "Plexus: Toggle elbow arrow"@7209; full render(938)/hit-test(1248)/SVG-export-honors-routing(1452)/`_updateBindings` re-route. Right-angle routing is complete (obstacle-avoidance is a separate advanced feature, not this item). Worklist self-noted the audit mis-tag.
- [x] A7 TEST_HOOKS strip — gate ALREADY EXISTED (`TEST_HOOKS` const@270 + single `if (TEST_HOOKS) this._installTestHooks()`@7329). Made it self-documenting as the release toggle (flip to false → strips the whole window.__plexusCanvas.test.* debug surface; kept TRUE for the live chrome-devtools verification this loop relies on). Comment-only, no behavior change, no version bump. Review-agent skipped (zero behavior risk; node --check + gate test green).

## Tier B — polish (lower value; probe-gated → if platform-blocked, log to backlog + check off as deferred)
- [x] B1 Interactive image crop handles — SHIPPED v1.110.0 (in-place crop: command arms a one-shot crop marquee on the selected image → drag a box → crops it in place via el.crop; non-destructive, undoable; reuses the proven region-reference math)
- [x] B2 7 pen profiles (highlighter/finetip/fountain/marker/thick-thin/thin-thick-thin + default) — SHIPPED v1.111.0 (profile table drives radius shape + width + opacity; default byte-identical; "Pen profile…" command, persisted). NOTE: per-profile *custom user-defined* pen buttons (10 slots) NOT built — the 7 fixed profiles cover the Excalidraw set; custom-pen-slot config is a deferrable enthusiast extra.
- [x] B3 Layer-manager panel — DEFERRED to backlog (low-value, NO SHIP). NOT Excalidraw parity (Excalidraw has no layers); roadmap-deprioritized P2; organization already covered by frames (named, collapsible via `secHidden`) + groups + z-order. Useful atom = per-element lock (revisit if wanted; needs indicator + click-to-unlock + gating `_hitTopAt`/`_selectAll`/`_elsInLoop`). Logged to the Thymer backlog. Audit rated low marginal value.
- [x] B4 Frame settings + clip-on-render + marker frames — AUDIT-RESOLVED (settings shipped) + residuals DEFERRED, NO SHIP. Frame name-render@5163, **rename** (dblclick → "Section name:" prompt)@3568, color (flyout→strokeColor), collapse (cmd@7342 + arrow), move-as-unit, slide-order all already ship. Residuals — clip-on-render (roadmap-deferred, render-loop-invasive) + marker frames (niche) — logged to the Thymer backlog.
- [x] B5 Companion Drawings CollectionPlugin + gallery — gallery AUDIT-RESOLVED (already ships), companion-plugin DEFERRED, NO SHIP. Gallery = `GALLERY_PANEL_ID='plexus-gallery'` + `_openGallery`/`_mountGallery`@8090 + "Gallery (all drawings)" cmd@7277 (verified v0.26.0). Companion `collection_plugin` (declares Scene/Assets fields) deferred to backlog: separate plugin artifact, one-time-setup value only, properties already exist via MCP, conflict-risk declaring fields over the LIVE collection → user-gated test-collection-first task.
- [x] B6 Restored-panel auto-reopen — PROBED → DEFERRED-pending-hands-on-session, NO SHIP. SDK signature SUPPORTS it (`navigateTo({...subId, state})` types.d.ts:2736 + `getNavigation()`; Plugins-Manager custom-nav persists with subId) → LIKELY buildable, not platform-blocked. But the fix swaps the CORE mount call (`navigateToCustomType`@7615 → `navigateTo` custom+subId/state) — a wrong custom `type` breaks ALL panel mounting, and reload-round-trip needs hands-on chrome-devtools verification. Not autopilot-safe. Logged to backlog with the ~20-min recipe.
- [x] B7 Auto-export banner keep-in-sync + light/dark variants — AUDIT-RESOLVED, NO SHIP. Banner keep-in-sync already ships: `_scheduleBannerText`@7175 (debounced off the save path) → `_writeBannerTextInline`@1692 → `exportPng(scene)` → `setBannerFromBlob` on every save@7170. `exportPng` fills the bg with the canvas's actual `viewBackgroundColor` → the banner already MATCHES the canvas, so a separate light/dark variant is moot for Thymer's single banner slot. Record-owned blob (no orphan body siblings). Optional Scene-SVG-in-sync has no consumer (low-value). No code change.
- [x] B8 Render drawing inline in notes — PROBED → PLATFORM-BLOCKED, DEFERRED, NO SHIP. No markdown/inline-render hook exists: plugin.js has none and the SDK (`thymer-types.d.ts`) exposes no `MarkdownPostProcessor`/`registerMarkdown`/`renderMarkdown`/`inlineRender`/`decorateLine`/`registerRenderer`. Needs a Thymer inline-decoration/post-render API (C-tier editor-API class). Logged to the Thymer backlog.
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
