# Plexus Canvas — build status (resumable)

## ✅ SCRIPTS-ROADMAP EXECUTED (Canvas v0.60.0 + Brain v0.11.0, 2026-06-17)
**v0.60.0 — micro-setting subsystems built:** **S4 Pen/stylus** (pointerType routing — pen draws
freedraw without the Pen tool, single-finger pan, double-tap-erase, precision crosshair;
`_penActive`/`_penDoubleTap`, all in the pointer handlers, zero per-frame cost) · **S9 image cache**
(one shared bounded LRU decode cache on the plugin — `_imgCacheGet`/`_imgCacheEvict`/`_purgeImageCache`;
N views of M drawings = one decode per unique fileId; Advanced settings + Purge action) · **S10
Interaction** (long-press to open cards via one closure timer; `linkOpacity` dims @@ refs + card accent
chrome via `PLEXUS_LINK_ALPHA` module mirror; `openInNewPanel` side-panel-vs-in-place through `_openCard`).
Earlier baseline:
v0.50–v0.54 added: hybrid visual note + `@@` reference node + **P2 content COMPLETE** (Boolean/
polybool · Mermaid · LaTeX/MathJax-SVG · PDF/pdf.js — all lazy-loaded via `loadLib`/CDN, off the
render loop) + **viewport culling** (`inView`, render is O(visible) — per the user's huge-graph
speed directive). DESIGN PRINCIPLES (user 2026-06-17): build from scratch, speed-first for the huge
graph — see SCRIPTS-ROADMAP top. Remaining = low-value/triaged (Text-to-Path, editor polish,
canvas-text index, Brain P9, a few settings).
Built from `~/plexus/SCRIPTS-ROADMAP.md` under the `/goal` to complete it. Shipped (each its own
commit/version, syntax-checked, pushed to `Svyk/thymer-canvas-plugin`): **UX-1…6** · **P0.0**
encrypted multi-provider key store (`pxEncryptSecret`, passphrase, pagehide-wipe) · **granular
Settings panel** (`_openSettings`, sections S1/2/3/5/6/7/8/11; schema in `PLEXUS_SETTINGS_DEFAULTS`)
· **P0.6** fonts (`PLEXUS_DEFAULT_FONT`) · **P1.0** Frames (`makeFrame`/`_drawFrame`/`_frameChildren`)
· **P0.5** Presentation (`_slideFrames`/`_gotoSlide`) · **P1.3** Pizza Slicer (`_deconstructSelection`)
· **P1.4** Capture Note (`_captureNote`) · **P0.3** Icon Library (`_openIconLibrary`, scans `#icon`)
· **P0.2** MindMap Builder (`_newMindMap`/`_mmAddChild`/`_mmLayout`, Tab/Enter) · **P0.4/b** Colours
(`_openColorTool`, `COLOR_SCHEMES`) · **P1.5** Printable (`_printFrames`/`_renderRegionPng`) · **S6**
Laser (`this._laser` trail) · **P3** multi-provider AI (`_aiComplete`/`_aiKey(provider)`) · **P2**
CSV→chart (`_chartFromCsv`) · **P1.1** PlexusAutomate (`_installAutomate` → `window.__plexusCanvas.automate`).
**Brain v0.9.0:** P8 `layoutCross` (parents-up/children-down/friends-sides) + direction arrowheads.
DEPLOY: git push → Plugins-Manager "Reinstall from source" (Canvas is ~110KB, past MCP echo limit;
Brain deploys via PM reinstall too). **ALL UNVERIFIED by the user as of the build push — needs a
reinstall+spot-check.** Remaining roadmap items are triaged "Deferred" (lib-blocked / subsystem /
covered) in SCRIPTS-ROADMAP.md.

## ✅ CANVAS ROADMAP COMPLETE (v0.29.0, 2026-06-16) — every Phase + every E-item built & MCP-verified
Phases 0–8 (full whiteboard + parity polish, incl. SVG import) + Phase 9 E1/E2/E10/E11/E13 + Phase 10
E3/E5/E6/E7/E8/E9/E14. Notes: **E6** AI-diagram parser verified (live OpenAI call gated on the user's key);
**E9** semantic ghost-edges via in-browser transformers.js embeddings (verified dim=384, related 0.672 vs
unrelated −0.01); **E14** re-date-in-place verified server-side (Scheduled datetime written via
`DateTime.parseDateTimeString().value()`; the Day-View *drop UI* is the only cross-plugin remainder).
Companion **Plexus Brain** plugin at Phases 0/1/2/3/4/5/7 (only Phase-6 semantic-lens UI left; its embedding
engine is the same one proven in canvas E9).


Live plugin (svy workspace): **Plexus Canvas** global AppPlugin, guid `197R5JHA5A9Z0ZECNA2GM23KKB`.
Drawings collection: **Plexus Drawings** `1M80FGPHDZ58M4P5AEPBB91B67` — props (by label): `Scene` (file),
`Scene Rev` (number), `Scene Schema` (number).
Repo: `~/plexus-canvas` (local git; not yet pushed to GitHub — deploy is MCP `update_plugin_code` while
small). Roadmap: `~/plexus/CANVAS-ROADMAP.md`. Rules: `~/.claude/skills/thymer-plugin-dev/SKILL.md`.

Deploy loop (current): edit `plugin.js` → `node --check` → `git commit` → MCP `update_plugin_code`
(plugin guid above) → chrome-devtools `navigate_page(reload)` → verify ONE `[Plexus Canvas] vX loaded`
banner → drive `window.__plexusCanvas.test.*`. Switch to git→Plugins-Manager reinstall once plugin.js
passes ~150–200 KB (currently ~65 KB). NOTE (2026-06-16): a FORKED worker can't spawn a push agent (Agent tool errors 'fork inside a forked worker'); deploy via direct MCP `update_plugin_code` instead — it echoes the 62KB code back, but the harness REDIRECTS that oversized result to a tool-result file (harmless to context, ~200 tokens), and the push STILL LANDS. Verify live via chrome-devtools (version banner + test hooks); never trust the echo. git is the canonical source; the live deploy is a reconstructed inline emit of the same edits.

## DEPLOY (FIXED 2026-06-16) — plugin.js outgrew the MCP push; use Plugins-Manager reinstall

**The MCP `update_plugin_code` path is DEAD above ~80KB** (plugin.js is now 86KB): the tool echoes the
full PREVIOUS code back (~86KB ≈ 24k tokens), which overflows a push-agent's 32k OUTPUT cap, and a direct
emit would need hand-reproducing 86KB byte-exact. **Deploy via git → Plugins-Manager "Reinstall from
source" instead** (byte-exact, no echo):
1. `git push origin main` (repo `Svyk/thymer-canvas-plugin`, private; gh ssh auth).
2. Open **Plugins Manager** (cmd palette → "Open Plugins Manager") → Plexus Canvas card → **Reinstall from
   source (force overwrite)** → accept confirm → **reload the tab** → verify the `v… loaded` banner.

**ROOT-CAUSE GOTCHA (cost ~1h):** PM's stored repo link for Plexus Canvas was the **shorthand**
`Svyk/thymer-canvas-plugin`; PM's fetcher REQUIRES a full URL and silently errored
`Failed to fetch … URL must point to github.com` (console only, no toast, label stuck at "v0.5.0", NO
network request because the fetch is server-side). FIX: PM card → **Edit GitHub repo link** → set
`https://github.com/Svyk/thymer-canvas-plugin`. Every other plugin already had a full URL. PM does the
GitHub fetch server-side (desktop app), so it won't show in chrome-devtools network — check the **console**
for the error. (404s for plugin.css are harmless — Plexus has none.)

## DONE + verified live (v0.27.1)

**MORE elevation (since v0.25.0, verified live 2026-06-16):**
- **E13 drawings gallery** (v0.26.0) — `plexus-gallery` custom panel: responsive grid of all Drawings'
  banner thumbnails, click to open. galleryTest: getAllRecords + banner fetch ok.
- **E9 semantic ghost-edges** (v0.27.1) — `_getEmbedder` lazy-loads transformers.js (Xenova/all-MiniLM-L6-v2)
  from CDN, runs IN-BROWSER (nothing leaves the device); `_computeSemantic` embeds each text/card and draws
  faint amber ghost-edges between cosine-similar pairs (>0.45). **VERIFIED:** embedTest dim=384, modelLoaded,
  petSim 0.672 vs petFinSim −0.01 (the embedder ranks related text far higher). Same engine = Brain Phase 6.



**PHASE 10 elevation (since v0.22.1, all verified live 2026-06-16):**
- **E10 multi-canvas transclusion** (v0.23.0) — `board`-type element embeds ANOTHER drawing's live banner
  PNG (`getBanner`→`getBlobFromPropertyFileValue`→download→Image, cover-fit), live on record.updated.
  boardCardTest hasImg=true.
- **E3 outline→canvas** (v0.24.0) — `_outlineToCanvas` reads a record's line-item tree (recursive
  getChildren) into connected text nodes (indented + elbow arrows) = doc→mind-map. Verified + screenshot:
  real 66-item project page → 121 elements (61 nodes + 60 arrows).
- **E5 drag-to-restructure** (v0.25.0) — `Plexus: Link selected cards` writes REAL ref relations: the
  source card's record gets a `ref` line item to each other selected card's record. **Verified server-side
  via get_line_items** (source got `→ related: <ref guid>` resolving to the target). The Brain graph then
  shows that edge. Explicit+safe (no accidental drag-mutation).
- **E7 time-travel + E8 presentation-over-live-data are effectively COVERED** by existing features — query
  nodes accept any Thymer query incl. dates (`@scheduled <= @today`); present mode + live cards = live slides.



**PHASE 8 COMPLETE + Phase 9 E1/E2/E11 + Brain v0.1.0 — all verified live 2026-06-16.** Also done since
the list below: **elbow arrows** (v0.21.0, routedPoints orthogonal routing, elbowTest), **presentation mode**
(v0.21.0, hides chrome + fits, presentTest), **SVG import** (v0.22.1, importSvg parses the common subset incl.
our own export, drag-drop .svg, round-trip svgImportTest=3 ok), **E11 property encoding** (v0.22.0, record
cards read getAllProperties→choiceLabel and color the accent by tagColor). Only the deliberately-LAZY Phase-8
bloaters (Mermaid/LaTeX/opentype.js) remain out of core by design. **A SECOND PLUGIN, Plexus Brain v0.1.0, is
live** — radial plex graph (see ~/plexus-brain + project MEMORY).

**Earlier verified-live entries:**
- **Phase 8 grid + snap (v0.17.0):** `appState.gridModeEnabled` dot grid; create/move/resize snap to
  `gridSize`; `Plexus: Toggle grid`. `gridSnapTest` green.
- **Phase 8 SVG export (v0.17.0):** `exportSvg()` → clean SVG (all element kinds); `Plexus: Export drawing
  as SVG` downloads it. `svgExportTest` green.
- **Phase 8 property panel (v0.18.0):** contextual strip on selection — stroke width S/M/L/XL, opacity
  slider, fill solid/hachure/none — applies live. `propPanelTest` green.
- **Phase 8 in-canvas search / gap #10 (v0.18.0):** `Cmd/Ctrl+F` or `Plexus: Search in drawing` → find
  text elements, n/total stepper, centers+selects each match. `searchTest` green.
- **Phase 9 E1 — LIVE-RECORD CARDS (v0.19.0, THE WEDGE):** `record`-type element embeds a Thymer record
  (title + first line items, async-cached). LIVE: plugin subscribes to `record.updated` + `lineitem.*`
  and invalidates the card cache → cards repaint on any change. `Plexus: Insert record card` (uses the
  last-focused note, tracked via `panel.focused`/`panel.navigated`); dbl-click opens the record.
  **Verified live + SCREENSHOT-confirmed** rendering "Plexus Canvas" + 8 real body lines; `recordCardTest`
  title/lineCount/invalidate-reload all green.
- **Phase 9 E2 — LIVE QUERY NODES (v0.20.1):** `query`-type element runs `data.searchByQuery` and lists
  matching **records AND line items** (so `@task` works — returned count 31 live); re-runs on record
  events. `Plexus: Insert query node` + in-panel prompt modal (`_promptText`, rule 49); dbl-click edits
  the query. `queryNodeTest` count/live-reran green.
- Element kinds `record`/`query` are bbox-hit, movable, resizable, group/copy/z-order/persist like any element.

## DONE earlier (v0.16.0 — flip-a-card + image part-refs)

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
- **FLIP-A-CARD** (v0.14.0/0.14.1) — ANY note ⇄ drawing (the "back of the card"). **Storage UNIFIED onto a
  `file` LINE ITEM** (`plexus-scene.json`) on the record — works on every record, no `Scene` collection
  property needed. `findSceneLine`/`loadSceneFromLine`; `saveScene` reuses a view-cached line (no dup) and
  retries `createLineItem` 5× for fresh-record write-lag (rule 18). Command **"Plexus: Flip to drawing"**
  flips the active editor record (blank canvas if no scene yet); in-canvas **"↩ Note"** button opens the
  source note editor side-by-side (rule 16). Banner = PNG preview = the card's drawing face. Legacy
  `Scene`-property records still read as fallback. **VERIFIED LIVE 2026-06-16:** `flipTest` roundTripOk=true;
  `flipRecordTest` on a real Captures note (no Scene prop) → scene saved as line item, reloadEls=2, startedBlank;
  `reopenTest` → fresh panel loads 2 els from the line; **MCP `get_line_items` confirms the note carries a
  `type:file` `plexus-scene.json` line (filesize 733, blob_guid).** All 4 test records trashed after.
- **IMAGE PART-REFERENCES** (v0.15.0 + v0.16.0) — "block reference an image AND PART of an image".
  **Layer 1 — crop primitive (v0.15.0):** image elements gain a `crop` {x,y,w,h} in NATURAL pixels;
  `_drawImage` renders via 8-arg `drawImage` source-rect. **Crop tool** (`C`, `ti-scissors`): drag a
  marquee over an image → `_referenceRegion` creates a NEW element showing just that region, SHARING the
  source `fileId` (zero data copy) + `cropOf` provenance; handles crop-of-crop. Verified: `cropTest`
  cropOk + cropOfCropOk; visually confirmed live (purple/green halves + crop elements rendered).
  **Layer 2 — note-side block reference (v0.16.0):** canvas **"Cite"** button → `_copyImageRefToClip`
  snapshots the selected image (honoring crop) to a PNG on `plugin._imgRefClip`; command **"Plexus: Paste
  image reference"** → on the active note, appends an `image` line (the PNG snapshot) + a `ulist` line with
  a `ref` segment back to the source drawing (`{type:'ref',text:{guid}}`, rule 13). Verified live:
  `imageRefTest` clipHasCrop + pasted.ok; **MCP `get_line_items` confirms the note got a `type:image`
  `plexus-image-ref.png` line (373B blob) + a `ref` line resolving to the source drawing.** Test records trashed.

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

- **FLIP-A-CARD: any note → visual note. ✅ DONE + verified live (v0.14.1, 2026-06-16).** Shipped exactly
  the unified-storage design below: scene = a `file` LINE ITEM (`plexus-scene.json`) on the record, so
  ANY record can flip (no `Scene` prop needed). `record.createLineItem(null,null,'file',null,null)` +
  `lineItem.setBlob(blob)`/`getBlob()` (SDK-verified); reopen scans `getLineItems()` for the blob named
  `plexus-scene.json`. Both Plexus Drawings AND flipped notes use this ONE path; legacy `Scene`-property
  read kept as fallback. See the DONE list above for the verification record.
- **IMAGE part-references (block-ref an image AND a REGION of it). ✅ DONE + verified live (v0.16.0,
  2026-06-16)** — see the DONE list above (crop primitive + Cite/Paste note reference). Implemented as a
  PNG snapshot embed (the visual, honoring crop) + a live `ref` segment back to the source drawing record.
  ORIGINAL design notes (superseded by the shipped approach): (a) Reference/embed an image element
  from a note via a `ref` segment to the element (needs line-level element identity — store an anchor in
  customData + navigate at action time, rules 13/26/54). (b) **Crop / region ref:** an image element gets
  a `crop` rect (Excalidraw's `crop` field); a "reference this region" action creates a crop element
  showing just that part + a ref. Render = drawImage with source-rect (sx,sy,sw,sh from crop). This is
  Excalidraw's `#^area=`/crop grammar reimagined on Thymer refs.

## NEXT (remaining roadmap — Phase 8 tail, Phase 9 rest, Phase 10, + Brain plugin)

DONE so far: Phases 0–7 (full whiteboard) + flip-a-card + image part-refs + Phase 8 core (grid/snap, SVG
export, property panel, in-canvas search) + Phase 9 **E1 live-record cards** + **E2 query nodes**.

- **Phase 8 tail** — SVG IMPORT (read SVG → elements), elbow/orthogonal arrows, presentation/view mode;
  LAZY-loaded (never in core, rule 37/Scope #5): opentype.js (vector text/CJK), Mermaid, LaTeX/KaTeX.
- **Phase 9 rest** — **E11** property encoding (size/color a card by a record property), **E10** multi-canvas
  transclusion (embed another board's live SVG snapshot — `DrawingSnapshot.ts`), **E13** canvas-as-record +
  companion Drawings CollectionPlugin GALLERY view, sub-drawing deep-link anchors.
- **Phase 10 (elevation tier 2)** — **E3** outline⇄canvas, **E5** drag-to-restructure ontology
  (`writeRelationsAsRefs` — drag in the graph rewrites real relations), **E14** Day-View/timeline binding
  (re-date in place, `DateTime.parseDateTimeString(iso).value()`), **E-export** snapshot-into-note, **E9**
  semantic ghost-edges, **E8** presentation over live data, **E6** AI diagramming, **E7** time-travel.
- **PLEXUS BRAIN plugin (E4 / Scope #4) — NOT STARTED.** Separate global AppPlugin: TheBrain-style radial
  graph from Thymer relations/refs/backrefs/hashtags. Roadmap `~/plexus/BRAIN-ROADMAP.md`. Ships its own
  lighter Canvas2D graph renderer; ports ExcaliBrain's Page/Relation + getRelationVector truth-table +
  plex layout + NavigationHistory. ZERO runtime coupling to the canvas.
- **Phase 7c** (later) — Excalidraw-grade focus+gap binding + multi-point arrow editing (fields exist).
- Polish backlog: in-panel Settings modal, IndexedDB cache, concurrency rev-check, restored-panel reopen
  (KNOWN ISSUE above), record/query cards in PNG/SVG export (drawElement has no record/query case),
  companion Drawings CollectionPlugin declaring Scene fields in plugin.json (rule 60).
