# Plexus Canvas — build status (resumable)

Live plugin (svy workspace): **Plexus Canvas** global AppPlugin, guid `197R5JHA5A9Z0ZECNA2GM23KKB`.
Drawings collection: **Plexus Drawings** `1M80FGPHDZ58M4P5AEPBB91B67` — props (by label): `Scene` (file),
`Scene Rev` (number), `Scene Schema` (number).
Repo: `~/plexus-canvas` (local git; not yet pushed to GitHub — deploy is MCP `update_plugin_code` while
small). Roadmap: `~/plexus/CANVAS-ROADMAP.md`. Rules: `~/.claude/skills/thymer-plugin-dev/SKILL.md`.

Deploy loop (current): edit `plugin.js` → `node --check` → `git commit` → MCP `update_plugin_code`
(plugin guid above) → chrome-devtools `navigate_page(reload)` → verify ONE `[Plexus Canvas] vX loaded`
banner → drive `window.__plexusCanvas.test.*`. Switch to git→Plugins-Manager reinstall once plugin.js
passes ~150–200 KB (currently ~30 KB).

## DONE + verified live (v0.3.0)

- **Phase 0** — global AppPlugin, custom panel (`registerCustomPanelType` + `createPanel` +
  `navigateToCustomType`), command palette, window-singleton dispose. Banner fires once.
- **Phase 1a** — envelope spike VERIFIED (SPIKE-RESULTS.md): `createNewRecord`=null on global plugin →
  `collection.createRecord` (guid string); pending-context map survives the custom-panel mount;
  `getActiveRecord`=null in a custom panel; blobs fast to 20 MB (no gzip).
- **Phase 1b** — Camera (pan/zoom, zoom-to-cursor), hand-drawn rough rect/ellipse/diamond (vendored
  `mulberry32` seed PRNG; hachure fill), dual-canvas (static+interactive) + ONE disposable RAF,
  scene↔blob persistence, banner PNG preview, panel height from the scroller ancestor (host collapses;
  rule 2). Reopen (fresh getRecord → fileBlob → parse) verified incl. camera restore.
- **Phase 2** — floating toolbar (select/rectangle/ellipse/diamond + 6 color swatches), create-on-drag,
  click-select, shift-multiselect, drag-move, Delete/Backspace, V/R/O/D/Esc shortcuts (scoped to a
  focusable canvas), selection box on the interactive layer, autosave on mutation.
- **Phase 3** (v0.4.0) — transform: 8 resize handles + rotate handle; OBB resize in the element's LOCAL
  frame (correct for rotated elements, opposite handle stays fixed — `_applyResize`); rotation rendering
  (rotate about center in drawElement) + rotated hit-testing (un-rotate the point); 15° rotate snap (Shift).
  Verified live: drag SE +40/+30 → w 220→260, h 140→170; rotate 30°; 9 handles render.
- **Phase 4** (v0.5.0) — freehand PEN (smoothed quadratic polyline, ABSOLUTE world points, bbox via
  freedrawBBox; move shifts both points + bbox) + ERASER (drag-tombstone hit elements). Toolbar now 6
  tools (added ti-pencil/ti-eraser); P/E shortcuts. freedraw shows a dashed select box (no resize handles yet).
- **Phase 5** (v0.6.0) — TEXT element: text tool (ti-cursor-text) → click places + opens a `<textarea>`
  overlay (our DOM, rule 29) positioned/scaled to the camera; type (multiline) → commits on blur/Esc/
  Cmd-Enter; empty text auto-deletes; double-click a text element (or empty canvas) to edit; canvas
  hides the element while its overlay is open. Render via `ctx.fillText` per line; `measureText` keeps
  bbox in sync. ALSO: time-windowed pending-context (see Known issue) — restored panels no longer steal
  a fresh open's record.

## KEY CORRECTIONS to the roadmap (verified live — supersede the doc)

1. **Scene storage = a FILE property, not a text-GUID.** There is NO `data.getBlob(guid)`. Save with
   `rec.prop('Scene').setFileFromBlob(blob)`; load with `await rec.prop('Scene').fileBlob()` →
   `blob.download()`. (Banner uses `setBannerFromBlob`/`getBanner`.)
2. **Reads lag writes (rule 18).** `getRecord` right after `createRecord` and `fileBlob` right after
   `setFileFromBlob` return null on the SAME object. Poll (getRecordPoll / loadScene tries=10) and/or
   re-fetch a fresh record. The real reopen path (fresh getRecord) works fine.
3. **Panel content area collapses to ~0 height** (`panel-body`→`layout-margin`→host all auto). Measure
   `host.closest('.panel-scroller-y').clientHeight` and set the root height explicitly; observe the
   scroller (not the wrap) for resize. Never `height:100%`.
4. **Confirmed-bundled toolbar icons**: ti-pointer ti-square ti-circle ti-diamond ti-arrow-right
   ti-trash ti-hand-grab ti-cursor-text ti-photo ti-pencil. (ti-line/ti-typography/ti-text are NOT.)

## Test hooks (window.__plexusCanvas.test, TEST_HOOKS=true — strip before release)

`newDrawing()` · `views()` · `addShapes()` (engine create+save) · `selectFirst()`. Phase-1a spike +
roundTrip/reopen hooks were removed after verification (history in git + SPIKE-RESULTS.md).

## KNOWN ISSUE to fix (found Phase 4, 2026-06-15)

- **PARTIALLY FIXED (v0.6.0):** the mis-pairing (a restored panel STEALING a fresh open's record) is
  fixed via a time-windowed pending queue — `_mountPanel` only consumes a guid queued in the last ~4s.
- **STILL OPEN:** a RESTORED Plexus panel (saved in the layout, reopened on reload) renders the blank
  "New Drawing" state instead of reopening its drawing — because the record guid isn't persisted in the
  panel's nav state. Data is SAFE (in the record); the user just re-opens the drawing. The proper fix
  below makes restored panels reopen automatically.
- **Fix (SDK lead, verified in types.d.ts):** stop using `panel.navigateToCustomType(id)` +
  a queue. Instead persist the record guid in the panel's nav state: `panel.navigateTo({type:"custom",
  subId:"<panelId>:<recordGuid>" (or state:{recordGuid}), rootId:null, workspaceGuid:this.getWorkspaceGuid()})`
  — `navigateTo` accepts `subId`/`state` (types.d.ts:2736) and the layout persists them
  (confirmed: the Plugins-Manager panel's saved nav has `type:"custom", subId:"<ws>-<plugin>-<panelid>"`).
  In `_mountPanel`, read `panel.getNavigation()` (2694) → parse the record guid → mount the CanvasView.
  This makes restored panels reopen their drawing AND removes the order-dependent queue. VERIFY the
  custom-panel route + subId/state round-trip live (probe) before relying on it.

## NEXT (roadmap §9, not yet built)

- **Phase 6** — arrows + binding (focus+gap, boundElements reverse index).
- **Phase 7** — undo/redo (invertible deltas + shouldCreateEntry), groups/frames, images (per-image
  blobs), full property panel, in-panel Settings modal, copy/paste, IndexedDB cache, concurrency rev-check.
- **Phase 8** — parity polish (SVG import, elbow arrows, fonts, Mermaid/LaTeX, in-canvas search, presentation).
- **Phase 9/10** — elevation: live-record cards (E1), query nodes (E2), property encoding (E11),
  outline⇄canvas (E3), drag-to-restructure ontology (E5), Day-View binding (E14), live brain graph (E4).
- Companion **Drawings CollectionPlugin** declaring Scene fields in plugin.json.config.fields
  (reinstall-safe, rule 60) — currently the props are MCP-added to the collection.
- When plugin.js grows: create private GitHub repo `Svyk/thymer-canvas-plugin`, set `__source_repo`,
  switch deploy to Plugins-Manager reinstall.
