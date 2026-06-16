# Plexus Canvas — build status (resumable)

Live plugin (svy workspace): **Plexus Canvas** global AppPlugin, guid `197R5JHA5A9Z0ZECNA2GM23KKB`.
Drawings collection: **Plexus Drawings** `1M80FGPHDZ58M4P5AEPBB91B67` — props (by label): `Scene` (file),
`Scene Rev` (number), `Scene Schema` (number).
Repo: `~/plexus-canvas` (local git; not yet pushed to GitHub — deploy is MCP `update_plugin_code` while
small). Roadmap: `~/plexus/CANVAS-ROADMAP.md`. Rules: `~/.claude/skills/thymer-plugin-dev/SKILL.md`.

Deploy loop (current): edit `plugin.js` → `node --check` → `git commit` → MCP `update_plugin_code`
(plugin guid above) → chrome-devtools `navigate_page(reload)` → verify ONE `[Plexus Canvas] vX loaded`
banner → drive `window.__plexusCanvas.test.*`. Switch to git→Plugins-Manager reinstall once plugin.js
passes ~150–200 KB (currently ~65 KB). NOTE (2026-06-16): a FORKED worker can't spawn a push agent (Agent tool errors 'fork inside a forked worker'); deploy via direct MCP `update_plugin_code` instead — it echoes the 62KB code back, but the harness REDIRECTS that oversized result to a tool-result file (harmless to context, ~200 tokens), and the push STILL LANDS. Verify live via chrome-devtools (version banner + test hooks); never trust the echo. git is the canonical source; the live deploy is a reconstructed inline emit of the same edits.

## DONE + verified live (v0.13.0)

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
- **Phase 7a** (v0.8.0) — UNDO/REDO: snapshot history (`_undo`/`_redo` stacks of `JSON.stringify(scene)`,
  cap 80). EDITS push a step via `scheduleSave()` (pushes the prior `_committed` state, snapshots the new);
  CAMERA changes (pan/wheel) use `_saveCamera()` which does NOT push history (panning isn't undoable).
  `Cmd/Ctrl+Z` undo, `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` redo (scoped to the focused canvas; preventDefault+
  stopPropagation so it doesn't hit Thymer's editor). `_restore` re-saves the reverted scene. NOTE: test
  hooks (addShapes/addText/addArrow) use `saveNow` and bypass history — real user gestures all go through
  scheduleSave so `_committed` stays current.
- **Phase 7b-copy** (v0.11.0) — COPY/PASTE/DUPLICATE: `Cmd/Ctrl+C` copies selected to an internal
  per-plugin clipboard (`this.plugin._clipboard`, deep JSON clones); `Cmd/Ctrl+V` pastes (new ids + 24px
  offset, selects them); `Cmd/Ctrl+D` duplicates in place; `Cmd/Ctrl+A` selects all. `_cloneEl` reassigns
  id+seed, offsets x/y AND points (freedraw/linear), drops bindings, shares image fileId. Verified:
  dupOk/pasteOk/selectAllOk all true.
- **Phase 7b-images** (v0.10.0) — IMAGE element: drag-drop an image onto the canvas, or paste while the
  canvas is focused → `_addImageFromFile` reads it as a dataURL, sizes it (cap 480px), stores it INLINE
  in `scene.files[fileId]={dataURL,mimeType,w,h}`, adds an `image` element. Async-loads into `_imgCache`
  (HTMLImage) + repaints; placeholder box until loaded. **Correction:** images are inlined as dataURLs
  (NOT separate per-image blobs as the roadmap said) — because there is no `getBlob(guid)`, separate
  blobs can't be downloaded back on reopen. (Possible later optimization: `data.getBlobFromPropertyFileValue({guid})`
  may download an arbitrary blob — unverified; would let scenes stay small.)
- **Phase 6a** (v0.7.0) — ARROW/LINE linear elements: arrow tool (ti-arrow-right) → click-drag a 2-point
  arrow; ABSOLUTE points (like freedraw); rough segments + a 2-stroke arrowhead at the end (size scales
  with strokeWidth); segment-distance hit-test (`distToSeg`, not bbox); select + move (shifts points);
  `a` shortcut. Linear/text/freedraw show a dashed select box (resize handles only for rect/ellipse/diamond).
- **Phase 6b** (v0.9.0) — arrow BINDING: on create, each endpoint over a bindable shape gets
  startBinding/endBinding={elementId}; bound arrows FOLLOW when the shape moves/resizes/rotates
  (`_updateBindings` → `bindPoint` = shape bbox edge toward the other end + 5px gap). Moving a SHAPE
  updates its arrows; moving an arrow alone stays free. Stale bindings (deleted shape) auto-clear.
- **Phase 5** (v0.6.0) — TEXT element: text tool (ti-cursor-text) → click places + opens a `<textarea>`
  overlay (our DOM, rule 29) positioned/scaled to the camera; type (multiline) → commits on blur/Esc/
  Cmd-Enter; empty text auto-deletes; double-click a text element (or empty canvas) to edit; canvas
  hides the element while its overlay is open. Render via `ctx.fillText` per line; `measureText` keeps
  bbox in sync. ALSO: time-windowed pending-context (see Known issue) — restored panels no longer steal
  a fresh open's record.

- **Phase 7b-groups** (v0.12.0) — GROUP/UNGROUP: `Cmd/Ctrl+G` groups the selection (shared `groupIds`
  push; needs >=2), `Cmd/Ctrl+Shift+G` ungroups (pop top gid). Click-select on a grouped element expands
  to the whole top group (`_topGroup`/`_groupMembers`). Paste/duplicate remap group ids per-batch
  (`_cloneBatch`) so a duplicated group is its OWN coherent group, not merged with the originals.
  Verified live: grouped / expandOk(2 members) / ungrouped all true; copy/undo/transform regressions green.
- **Phase 7b-zorder** (v0.13.0) — Z-ORDER + NUDGE: `Cmd/Ctrl+]` bring-to-front (move selected to the END
  of the elements array = top of paint order), `Cmd/Ctrl+[` send-to-back (move to front of array).
  Arrow keys nudge the selection by 1px (Shift = 10px), updating points + arrow bindings. Verified live:
  frontOk/backOk/wasLast; nudge dx=1/dy=10; full regression sweep (copy/undo/bind/image/group) all green.

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

## USER-REQUESTED (2026-06-16, high priority — added to goal)

- **FLIP-A-CARD: any note → visual note.** Like Obsidian-Excalidraw, ANY Thymer record should become a
  drawing by a toggle, and back — the "back of the card" duality. Command **"Plexus: Flip to drawing"**
  on the active editor record. STORAGE DECISION needed: the current Plexus Drawings store the scene in a
  `Scene` FILE PROPERTY, but arbitrary notes' collections don't have that property and an AppPlugin
  CAN'T add stored props (rule 60). So for "ANY note," store the scene as a **file LINE ITEM** on the
  record (`record.createLineItem(...,'file',...)` + `lineItem.setBlob`/`getBlob` — universal, works on
  every record; mark it e.g. filename `plexus-scene.json`, find it on reopen by scanning line items).
  Note's text line items stay the searchable "back"; one file line holds the scene; banner = preview.
  (Unify: migrate Plexus Drawings to the same line-item storage so there's ONE path. Clean slate — no
  real drawings exist yet.)
- **IMAGE part-references (block-ref an image AND a REGION of it).** (a) Reference/embed an image element
  from a note via a `ref` segment to the element (needs line-level element identity — store an anchor in
  customData + navigate at action time, rules 13/26/54). (b) **Crop / region ref:** an image element gets
  a `crop` rect (Excalidraw's `crop` field); a "reference this region" action creates a crop element
  showing just that part + a ref. Render = drawImage with source-rect (sx,sy,sw,sh from crop). This is
  Excalidraw's `#^area=`/crop grammar reimagined on Thymer refs.

## NEXT (roadmap §9, not yet built)

- **Phase 7c** — (later) Excalidraw-grade focus+gap binding + multi-point arrow editing.
  startBinding/endBinding fields already exist on linear elements, unused.
- **Phase 7b-rest** — groups/frames, copy/paste, full property panel, in-panel Settings modal, IndexedDB cache, concurrency rev-check. (undo done 7a; images done 7b-images.)
  Settings modal, copy/paste, IndexedDB cache, concurrency rev-check. (Undo done in 7a.)
- **Phase 8** — parity polish (SVG import, elbow arrows, fonts, Mermaid/LaTeX, in-canvas search, presentation).
- **Phase 9/10** — elevation: live-record cards (E1), query nodes (E2), property encoding (E11),
  outline⇄canvas (E3), drag-to-restructure ontology (E5), Day-View binding (E14), live brain graph (E4).
- Companion **Drawings CollectionPlugin** declaring Scene fields in plugin.json.config.fields
  (reinstall-safe, rule 60) — currently the props are MCP-added to the collection.
- When plugin.js grows: create private GitHub repo `Svyk/thymer-canvas-plugin`, set `__source_repo`,
  switch deploy to Plugins-Manager reinstall.
