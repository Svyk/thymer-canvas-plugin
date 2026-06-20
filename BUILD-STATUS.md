# Plexus Canvas — build status (resumable)

## ✅ v1.27.0 — two live-found bug fixes (2026-06-19, chrome-devtools session on svyat.thymer.com)
Caught via live inspection of the day-page drawing (debug-Chrome MCP attach), root-caused, fixed, and the user's existing
chips live-corrected.
- **REF-LABEL: a caret-only `@`/`@@` chip showed the typed query, not the picked target.** `_applyRefChip`'s caret-only
  branch does `_configureRef(el)` (sets `el.text = pfx + label`) then `_refCommit()` → `commit()` → `syncRuns()` which ran
  `el.text = ta.value`, **overwriting** the label with the stale textarea query (`@@jimm`, `@jim`). The binding
  (`refGuid`/`refLineGuid`/`refLabel`) was always correct — only the DISPLAY text was clobbered (so flyback + open both
  worked, but the chip read truncated). Fix: `ta.value = el.text;` after `_configureRef`, before `_refCommit()`, so the
  commit re-derives the same full text. (Live-corrected the two existing chips via `_configureRef` re-run + saveNow.)
- **`_scheduleBannerText` was CALLED in 3 places but never DEFINED → `TypeError` thrown on EVERY `scheduleSave`.** Saves
  still persisted (the save-timer is armed one line before the throw), but the throw aborted the rest of each action — most
  visibly **transclude** (the card pushed, but the throw killed the confirm toaster + clean teardown → "transclude isn't
  working"), and the banner-preview + `Canvas Text` search mirror never refreshed, plus uncaught-error spam every edit.
  Proven live: stubbing the method made transclude produce a clean linecard with no error. Fix: define `_scheduleBannerText()`
  as the intended debounced (1200ms) wrapper around `_writeBannerTextInline(this.plugin, this.rec, this.scene)`; `_btTimer`
  was already cleared in `destroy()`.
- **Not a bug:** record/line cards are LIVE READ-ONLY embeds — you edit the SOURCE record (double-click the card → `_openCard`
  opens it), and the card mirrors it. Inline-editing a card on the canvas is intentionally not a thing.
- Verify: `node --check` clean; flyback node test (5 groups) still green; live confirmation on svyat.thymer.com (both chips
  now render the full label; transclude toaster fired; scene cleaned of probe artifacts).

## ✅ v1.26.0 — FLYBACK: note/record→canvas ↗ for inline @@/@ + record refs (2026-06-19, plan: staged-finding-ritchie FOLLOW-UP)
The forward-nav refs (inline `@@` line, inline `@` record, whole-element record chips) now also get a **note-side ↗ flyback**
— the symmetric half we'd scoped out of CANVAS-SEG/Phase D. Extends the proven Phase-D DOM-injection mechanism (synced
backref store + `_scanRefBadges`), no editor API.
- **Index everything (rebuild-on-save):** new view `_reindexBackrefs()` walks the scene's CURRENT refs — whole-element
  chips (`el.isRef`) AND inline runs (`el.runs` `{t:'ref'}`) — line targets keyed by `refLineGuid`/`run.lineGuid`, record
  targets keyed by `refGuid`/`run.guid`; image chips skipped (the xref/`_scanImageBadges` path owns those). First ref to a
  target wins (one ↗ per note line/record). Called from `saveNow()` → self-heals edited-away/deleted refs each save.
  Plugin `_setDrawingBackrefs(drawing, map)` replaces ONE drawing's sub-map wholesale (concurrency-safe per-drawing; empty
  → delete). `_indexBackref` generalized line-only → also record chips (immediate badge on insert).
- **Record-page badge:** `_scanRefBadges` gains a 2nd loop over **`.listview-items[data-guid]`** (org-remark-verified open
  record root) for `kind==='record'` entries → injects the same `↗`, distinct `.plexus-backref-rec` marker class so it
  can't shadow/double with line badges. Line loop dedupe excludes that class (`:not(.plexus-backref-rec)`). Title host =
  defensive chain (`.page-props-editor`/`.page-title`/`.record-title`) → else the root (prepended).
- **Store:** `kind` now carried through `pxcBrefMigrate`/`pxcBrefFlatten`/`_registerBackref` (legacy entries default
  `'line'`); cross-device via the existing synced blob (`_brefSyncFlush`/`_brefSyncLoad`).
- **Verify:** node — bref-store kind round-trip + newest-wins (5 groups). Console — `reindexFlybackTest` (chips+inline runs,
  line/record keying, image-skip, dup→first, self-heal). `node --check` clean. Adversarial `code-reviewer`: 1 MEDIUM fixed
  (line-loop dedupe `:not(.plexus-backref-rec)` so a record badge can't shadow a line badge), 6 risk areas confirmed sound.
- **⚠ Needs live-chrome verification (deferred, per plan):** the record-page **title host** selectors are guesses — the
  badge still appears (falls back to the verified root), but precise placement + the drag-from-panel (EAPI-4) and
  image-paste (EAPI-1) probes wait on a debug-port Chrome session.

## 🆕 Phase E — net-new features (staged-finding-ritchie, user-approved all 4 tiers) — ✅ COMPLETE (12/12)
Each is fully-native, no editor API; node-verified + adversarially reviewed like Phases A–D. Canvas: Minimap, Bulk-Brush,
Quick-capture, Roll-Up, Timeline, AI-relation-suggest, AI-auto-cluster, Subgraph-drop seam, Live Table (v1.17→1.25).
Plexus Brain (`~/plexus-brain`, v0.28→0.31, separate repo): Path-Finder, Multi-hop, Graph-analytics, Subgraph→Canvas.
- **v1.25.0 — Live Table element** (Tier 2). New `table` element: a query → records×properties grid; **double-click a data
  cell → edit it** via a DOM `<input>` overlay that writes the typed property (reuses the schema-safe `_writeProp`:
  choice→setChoice / confirmed-datetime→DateTime / else raw `set`); double-click header/empty → reconfigure (query +
  comma-separated columns). Full new-element-type wiring (both render sites, hitElement, resize hit-test AND handle-draw,
  dblclick, `_invalidateTables`). Pure `pxcTableCellIndex` (8/8 node asserts). `_cellInp` disposed in destroy(); single
  input; idempotent `done`-flag commit. Review: 1 LOW fixed (Esc now aborts with NO write — was a lossy date round-trip).
  Command on `ti-table`.
- **v1.24.0 — Subgraph drop seam** (Tier 3, canvas half). `window.__plexusCanvas.dropSubgraph(payload)` → `_dropSubgraph`
  places role-coloured live record cards + bound arrows from a Brain subgraph. Paired with the Brain `_subgraphToCanvas`
  command (plexus-brain v0.31.0). Cross-plugin review = CLEAN.
- **v1.23.0 — AI auto-cluster into named frames** (Tier 4). Embed each card/text **on-device** (`plugin._embed`, nothing
  leaves the device), single-linkage cluster by cosine (`pxcClusterByThreshold`, union-find), then physically move each
  cluster into a tidy **AI-named frame** (`_aiComplete` names, fallback "Cluster N"). Two degenerate guards (all-one-group,
  all-singletons). Pure clustering + `pxcParseStringArray` (8/8 node asserts: transitive chains, null-vec singletons,
  partition, fence/garbage parsing). Layout simulated zero-overlap; text keeps intrinsic size. Adversarial review = **CLEAN**.
  Command on `ti-sparkles`.
- **v1.22.0 — AI relation-suggest** (Tier 4). "AI suggest relations" → the model reads the board's record-card titles and
  proposes DIRECTED links; a **checkbox modal** (user-gated, nothing written without accept) writes accepted links as a
  real ref on the FROM record → TO (`ceEdgeSegments`, the CE-BRAIN ref-line → a Brain edge). The canvas as a graph-builder
  (net-new links the user hasn't drawn). Pure `pxcParseLinkSuggestions` (tolerant of fenced/prose JSON, drops self-links/
  out-of-range/non-int) + `pxcEsc` (XSS-safe innerHTML) — 6/6 node asserts. Reuses `_aiComplete`. Adversarial review =
  **CLEAN** (XSS surface verified closed; accept-gating + bounds + write-direction all confirmed). Command on `ti-sparkles`.
- **v1.21.0 — Timeline / Gantt lane** (Tier 2). "Arrange cards on a timeline" positions selected record cards on a real
  datetime axis (by Scheduled/Due/Start/…), optional swim-lanes by a 2nd property, draws weekly tick guides; **DRAG a
  card → re-dates the record in place** (`_setSchedule`, the loader-correct `DateTime` write) — two-way typed-data editing
  no whiteboard can do. Pure axis math `pxcTimelineX`/`pxcTimelineMs` (6/6). Re-date gated on `tlBound` + transient
  `_timeline` (no accidental re-dates on normal drags / after reload); prior axis ticks cleared on re-run.
  Review: 2 defects fixed — **HIGH timezone off-by-one** (UTC bucket vs local ISO → now a **local-midnight** bucket so
  dates round-trip exactly, cards sit on ticks) + a **no-op re-date skip** (`tlMs`, only writes when the day changed).
  Command on `ti-calendar`.
- **v1.20.0 — Roll-Up / aggregation (KPI) cards** (Tier 2). New `rollup` element: a query bound to a live aggregate —
  `count` | `%done` | `sum:Prop` | `avg:Prop` | `min/max:Prop` — rendered as a big-number KPI tile, recomputed on
  `record.updated`. Pure `pxcParseAgg`/`pxcComputeAgg` (12/12 node asserts). `_rollupFor` cache (keyed query+agg, one-shot
  async, `%done` walks task line-items bounded by the 200-record search cap); `_invalidateRollups` wired next to
  `_invalidateQueries`. Full new-element-type wiring (both render sites, hitElement, resize hit-test AND handle-draw,
  dblclick-edit) — review audited the COMPLETE per-type checklist incl. export/clone/minimap graceful-degradation.
  Command on `ti-chart-bar`. Adversarial review = **CLEAN**.
- **v1.19.0 — Quick-capture command bar** (Tier 3). "Plexus: Quick-capture" → type a title → creates a typed record in
  the remembered last-used collection (else the picker) → drops a live record card at the viewport centre. Pure reuse of
  reviewed paths (`_promptText`/`_pickCollection`/`createRecord`/`getRecordPoll`/`_insertRecordCard`); structured-from-birth
  (the card immediately joins Brain edges/queries/styling). Command on `ti-plus`. Adversarial review = **CLEAN**.
- **v1.18.0 — Bulk Property Brush** (Tier 2). Marquee-select record cards → "Plexus: Bulk set property" → `Property: value`
  writes ONE typed property across all selected records (spreadsheet fill-down on real records). **Schema-safe routing
  (review-hardened, TS-6):** there's no runtime `PluginProperty.type`, so route only by CONFIDENT signals — `choices()`
  (len-gated) → `setChoice` (replace); a CURRENT `date()` value confirms datetime → `DateTime.parseDateTimeString().value()`;
  **everything else → raw `p.set(string)`** (Thymer coerces per the prop's own type — never forces a Number/DateTime
  object onto an unconfirmed-type field, which was the corruption vector). Per-card try/catch (one failure doesn't abort),
  `done/total` + choice-not-found hint. Pure `pxcClassifyValue`/`pxcToIsoDate` (9/9 node asserts). Command on `ti-checkbox`.
  Review: 3 defects fixed (date-on-non-datetime corruption, false `&& p.number` type-guard, choice-mismatch feedback).
- **v1.17.0 — Minimap / radar navigator** (Tier 4). Corner overlay of the whole scene + draggable viewport rect;
  click/drag teleports the camera. Auto-hidden when everything fits the viewport. Scene **dots cached offscreen**
  (`_miniDots`, rebuilt only on commit/`_miniDirty`, cap 4000) → per-frame cost = blit + one viewport rect (respects the
  speed hot path). Pure `pxcMiniFit` fit math (7/7 node asserts: round-trip, inset, aspect, null-on-empty). Teleport via
  `_miniHit`/`_miniTeleport` in the existing pointer handlers (no new listeners/timers). Toggle command (`ti-map`,
  validated). Review: 2 defects fixed (toggle persistence used a non-existent `_saveSettings` → `savePlexusSettings`;
  viewport rect now clipped to the panel).

## ✅ v1.16.0 — BACKREF-SYNC: cross-client synced backref index (2026-06-19, plan: staged-finding-ritchie Phase D)
The note→canvas backref ↗ index moves off per-device `localStorage` onto a **synced Thymer blob** so it persists +
round-trips across the **desktop app AND Chrome web** (the user's explicit requirement).
- **Structure:** nested **per-drawing sub-maps** `{ [drawing]: { [lineGuid]: {el,label,t} } }` (fixes the design's
  concurrency-clobber: writers never overwrite another drawing's entries; GC = drop one sub-map). Pure helpers
  `pxcBrefMigrate`/`pxcBrefFlatten`/`pxcBrefMergeNested` (node-tested 8/8).
- **localStorage stays the HOT/authoritative path** — `_registerBackref` writes local FIRST, then schedules a
  best-effort sync; all reads (`_loadBackref` flattens for the unchanged `_scanRefBadges`) are sync, never block on the
  network. If every synced call fails, the feature degrades to exactly the old per-device behavior (no regression).
- **Synced mirror:** a JSON blob on a body `file` line of a singleton `⚙ Plexus Backref Index` record (the proven
  `saveScene` blob pattern; resolve = cached guid → marker-title search dedup-by-smallest-guid → create). `_brefSyncLoad`
  merges remote→local on startup. **Review-caught fix:** `_brefSyncFlush` now **read-merge-writes** (pulls the remote
  blob and merges before uploading) so a whole-store write can't wipe another device's entries (newest-`t` wins).
- **GC:** `record.updated` with `trashed` prunes that drawing's sub-map (no ghost ↗). Debounce + load timers disposed.
- **Migration:** old flat localStorage → nested on first load (idempotent).
- **Deferred (DOM-unverifiable solo):** the record-PAGE **header** ↗ badge for `@record` refs needs live chrome-devtools
  DOM verification — left for an in-app pass. The line-level ↗ badge keeps working, now from synced storage.
- **⚠ Needs in-app verification (can't live-test):** the live cross-device blob round-trip + singleton create. The
  data-layer logic is node-verified; the Thymer blob/record calls are all proven-elsewhere + fully defensive.
- **Verify:** 8/8 node asserts (migrate/flatten/newest-wins/merge/prune) + adversarial `code-reviewer` (no-regression,
  migration, singleton safety, GC all CONFIRMED; HIGH flush-clobber found + fixed).

## ✅ v1.15.0 — CE-BRAIN: promote cause-effect to records (2026-06-19, plan: staged-finding-ritchie Phase C2) — Phase C COMPLETE
"Plexus: Promote cause-effect to records (Brain)" materializes ce nodes as real Thymer records + writes each
cause→effect link so Plexus Brain graphs them.
- **Direction (verified against Brain):** the ref line is written on the **CAUSE** record pointing at the **EFFECT**
  (`ceEdgeSegments` → `{type:'ref',text:{guid,title}}` on a `ulist` line). Brain reads an outbound ref as an INFERRED
  child (effect = cause's child) and the incoming ref as an INFERRED parent (cause = effect's parent) → focusing the
  effect surfaces its **causes as parents/roots** (RCA convention). Confirmed against `plexus-brain/plugin.js:52,151,166`.
- **Structure storage:** the import/create callers stamp `box.ceChartId` + `box.ceText` (5th builder param) and store the
  chart in `scene.ceCharts[chartId] = {nodes, edges, promoted, edgesDone}` (plain JSON; rides snapshot/undo/save).
- **Idempotency:** node creation keyed on `meta.promoted[id]` (recreate only a trashed record); edges keyed on
  `edgesDone['effect>cause']`. **Review-caught fix:** recreating a trashed node now **invalidates `edgesDone` for every
  edge touching it** so the link is rewritten against the live record (else the cause→effect ref was silently lost).
  `ceCharts` maps are intentionally not undo-isolated (promote is an external side effect; re-promote self-heals).
- **Targeting:** chartIds from selected ce elements, else all `scene.ceCharts`; old (pre-v1.15) charts → graceful "no
  chart to promote" toaster. `_pickCollection` reused for the target.
- **Verify:** 9/9 node asserts (chartId/ceText stamping, back-compat omit, pentagon-root stamp, ref-segment guid Brain
  reads, tree regression) + adversarial `code-reviewer` (direction CONFIRMED; HIGH stale-edge defect found + fixed).

## ✅ v1.14.0 — CE-FISHBONE: fishbone-spine + pentagon layouts (2026-06-19, plan: staged-finding-ritchie Phase C1)
`elementsFromCauseEffect(chart, ox, oy, layout)` now takes a 4th `layout` arg: `'tree'` (default, unchanged) |
`'fishbone'` | `'pentagon'`. Pure geometry, no SDK.
- **Refactor:** positions precomputed into `pos` (tree + pentagon share the tree grid; fishbone uses `ceFishbonePositions`
  — a central horizontal spine with major bones alternating up/down, sub-causes stacked outward, cycle-safe `placed`
  guard, orphan fallback). The node loop reads `pos[n.id]` → **tree output is byte-identical** (coords, element order,
  ceRole/ceNodeId/ceCategory tags, terminator gate).
- **Fishbone** draws spine+bones as `ceBone` `line` elements (no arrowheads), SKIPS the default horizontal edge arrows,
  keeps the orange `ceConnector` cross-links. **Pentagon** renders the root as a closed 6-point home-plate `line`
  (`cePentagon`) + a backbone spine (`out.unshift`), keeps the default edge arrows.
- All ce elements are existing types (`rectangle`/`ellipse`/`line`/`arrow`/`text`) → render/hit/export/SVG via the
  existing dispatch; **no new element type** (unlike linecard), nothing to wire.
- **Commands:** the 2 old (one mislabeled "(fishbone)" but built tree, on the unvalidated `ti-affiliate`) → 4 on
  guardrail-confirmed **`ti-graph`**: New (tree/fishbone/pentagon) + Import. `_newCauseEffect(layout)` threads it; import
  reads `chart.layout`.
- **Verify:** 18/18 node asserts (tree regression: 8 boxes/7 arrows; fishbone: 8 boxes/≥3 bones/0 plain arrows; pentagon:
  line root/6-pt/spine/no stray heads; all bbox finite) + adversarial `code-reviewer` = **CLEAN**. `ceParseTest` stays
  2-arg (tree guard).

## ✅ v1.13.0 — IMG-REF: image-target references (2026-06-19, plan: staged-finding-ritchie Phase B3) — Phase B COMPLETE
A ref whose target is an **image attachment line**, rendered as a violet `▣` chip, opened in an in-panel **lightbox**.
- **Scope = attachment LINES, not records.** Sidesteps the unreliable `getBanner()` "is-image" detection (Blocker 1) by
  probing the line's `getBlob().contentType` directly (the reliable signal). Image RECORDS (banner) are a coded fallback
  but not surfaced in v1.
- **Detection:** `_probeImageRows` async-probes each `@@` line row's `getBlob()`; image rows show a 🖼 button (replacing
  ⧉). `row._li` (live SDK line item) is transient-on-the-picker-row only — never reaches a scene element / the save path.
- **Resolve (Blocker 2 — no getLineItemByGuid):** the chip stores `refGuid`=PARENT record + `refLineGuid`=attachment
  line; `_openImageRef` resolves via `getRecord(refGuid)→getLineItems()→find(refLineGuid)→getBlob()`. Null-blob → falls
  back to jumping to the line/record.
- **Lightbox `_showLightbox`:** `blob.download()`→ArrayBuffer→Blob→objectURL→`<img>`; capture-phase Esc (beats the
  canvas key handler), backdrop closes, image-click doesn't; `close()` is idempotent and revokes the objectURL + removes
  the listener (no leak). Reuses the existing banner→blob→objectURL pattern.
- **`_configureRef` kind='image':** violet `#a855f7`, `▣ ` prefix; record/line branches byte-unchanged. Image refs are
  forward-only (`_indexBackref` skips refKind!=='line'). No scene-thumbnail (avoids the transient-fileId bloat blocker).
- **Verify:** 8/8 node asserts (`imgRefTest` + record/line back-compat) + adversarial `code-reviewer` = **CLEAN**.

## ✅ v1.12.0 — TRANSCLUDE: live embed vs ref at insert time (2026-06-19, plan: staged-finding-ritchie Phase B2)
The @/@@ picker now offers **ref vs transclude**: every result row has a ⧉ "embed" button (or Shift+Enter) that drops
a **live read-only card** instead of a link.
- **Record transclude** reuses the existing `record` card element wholesale (already a live transclusion — no fork).
- **Line transclude** = NEW `linecard` element (`makeLineCard`): embeds the line's text + its child lines, cyan accent.
  `_lineFor` cache mirrors `_taskFor` (record-gone/line-gone guards); `getLineItems()` AND `getChildren()` both
  awaited + null-normalized (**getChildren returns a Promise — caught in review**). Wired into BOTH render dispatch
  sites, `hitElement` bbox whitelist, the resize-handle hit-test AND **draw** allowlist (review caught the draw
  omission — also fixed the inherited `task` gap), and dblclick (→ jumps to the source line).
- **Live refresh:** `onRecChange` calls `_invalidateLinesForRecord(g)` on record.updated + all lineitem.* — record-
  scoped so a CHILD-line edit (event carries the parent recordGuid) invalidates the card too. `entry.recordGuid` stored.
- **`_applyTranscludeRow`:** strips the @token from the host (re-syncs `el.runs` via the same `applyFlatEdit` machinery),
  drops the card below the editing element. Rejects a line row with no parent record (toaster). Forward-nav-only.
- **Verify:** 4/4 node asserts (`lineCardTest`: shape + bbox hit) + adversarial `code-reviewer` (all 6 invariants;
  fixed the handle-draw omission). Record/ref/create paths byte-unchanged. PNG/SVG export no-op on linecard (like
  record/task today).

## ✅ v1.11.0 — SEARCH-CREATE: create-if-missing in the @-ref picker (2026-06-19, plan: staged-finding-ritchie Phase B1)
When the `@`-ref picker finds no exact-title record, a green "＋ Create '<query>'" row appears; choosing it opens an
in-panel collection picker, creates the record, and binds it as a ref — Thymer-native @-create.
- **Gating:** `pxcHasExactTitle(rows,query)` (pure, module-level) suppresses the row when an exact title already exists;
  record mode only (`@`, never `@@` — a line can't exist without a record); `_runRefSearch` appends the synthetic row.
- **Blur-commit race (the hazard) handled:** `_applyCreateRef` snapshots the splice ctx (start/tokenLen/alias/caretOnly),
  sets `ta.value = before + query + after` (strips only the `@`; the non-empty query keeps commit from deleting the el),
  calls `this._refCommit()` to tear down the editor cleanly BEFORE the modal opens, then binds on the `el` OBJECT in
  `_createRefRecordAndBind` (never the dead textarea). Offsets stay valid (`before.length===start`).
- **Create+bind:** `collection.createRecord(query)` (guid|null guarded) → `getRecordPoll` → caretOnly = whole-element chip
  (`_configureRef`+`_indexBackref`); mid-text = `spliceRunRange` over the plain query text at `[start,start+tokenLen)`.
  `el.isDeleted` re-checked after the awaits.
- **`_pickCollection`:** in-panel modal (no window.prompt), filterable + keyboard-nav + Esc/backdrop cancel, remembers
  the last pick in `localStorage['plexus_create_col']` (convenience default only — NOT cross-device state).
- **Verify:** 7/7 node asserts (`searchCreateTest` + exact-match/bind-offset) + adversarial `code-reviewer` = **CLEAN**.
  Non-create ref paths byte-unchanged (back-compat).

## ✅ v1.10.0 — CANVAS-SEG: mid-sentence INLINE refs (2026-06-19, plan: staged-finding-ritchie Phase A)
Type a `@`/`@@` reference INSIDE a text box without breaking the sentence — no literal `@/@@` remains, the ref
renders as a styled+underlined clickable inline span, click navigates (record vs line). Segment-level, not a
separate chip element.
- **Model:** optional `el.runs` = `[{t:'text',s} | {t:'ref',kind:'record'|'line',guid,lineGuid?,label,alias?}]`.
  `el.text` stays the FLATTENED display string (refs→alias||label) so every existing reader/exporter/SVG/banner
  works unchanged; plain JSON round-trips → NO schema migration; an el without `runs` behaves exactly as before.
- **Layout is NEVER serialized** — per-run x-extents live in a module-level `_pxcRunLayout` WeakMap keyed by el,
  rebuilt lazily by `measureRuns`/`drawRuns` (storing them on the element would corrupt undo/dirty/persistence —
  load-bearing fix flagged by the design review).
- **Pure helpers (module-level, near measureText):** `runsOf`/`runDisplay`/`flattenRuns`/`hasRefRun`/`normalizeRuns`/
  `_runOffsets`/`applyFlatEdit`/`spliceRunRange`/`measureRuns`/`drawRuns`/`hitInlineRef`. `drawText` branches to
  `drawRuns` when `el.runs`.
- **Editing:** the textarea edits the FLAT string; `_editText`'s `syncRuns` maps each edit onto `el.runs` via
  `applyFlatEdit(runs, prevFlat, value)` (a ref the edit touches DISSOLVES to plain text — deterministic, no
  substring guessing). `prevFlat` tracked in onInput/commit and after the inline splice via `this._refSetPrevFlat`.
  `_applyRefChip` mid-text branch now splices a ref RUN into the host (was: spawn a sibling chip); caret-only branch
  UNCHANGED (whole-element chip, back-compat).
- **Click model:** click-once-selects, click-again-on-ref navigates (`downRef.wasSelected` gate); deferred ~230ms
  behind `_pendingNav` which `onDblClick` clears (dblclick = edit) and `destroy()` disposes. Hover shows a pointer
  cursor over a ref run (onMove pre-`!mode` branch; excludes editing/present/eyedropper).
- **Scope:** inline LINE refs are forward-nav-only (no note-side ↗ badge) — the backref store keys one ref per
  element; whole-element chips keep their badge. Folds into Phase D (backref-sync) if wanted.
- **Verify:** 19/19 node asserts (`inlineSegTest`/`inlineHitTest`/`inlineApplyTest`/`inlineEditTest` + multiline/
  splice-edges/dissolve/idempotent-remeasure) + adversarial `code-reviewer` (invariants 1-6 confirmed; fixed the 2
  low findings: eyedropper-cursor clobber + textarea-refresh-after-splice). Existing `refTriggerTest`/`refChipTest`
  untouched (back-compat).

## ✅ v1.9.0 — inline @/@@ references + native cause-effect shapes (2026-06-19, plan: elegant-beaming-harbor)
**A — @/@@ refs:** `@`=record, `@@`=specific LINE. Inline picker dropdown over the text-edit textarea
(`pxcParseRefTrigger` caret scan → debounced `searchByQuery` → ↑↓/Enter/Tab/Esc, `.pxc-refpicker`), alias-on-
highlight (capture selection on the `@` keydown), record(#7c5cff)/line(#0ea5e9) tint. Model: `el.refKind` +
`refLineGuid`/`refAlias`/`refLabel` on a whole text element (back-compat: bare `refGuid` ⇒ record). Shared
`_configureRef`/`_makeRefElement`. **Forward nav:** `_openCard` branches `refKind==='line'` → `_openRefLine`
(`navigateTo({itemGuid})` + panel + parent-record fallback). **Backward nav (cinematic):** line refs index into
`plexus_backref` (`_indexBackref`→plugin `_registerBackref`); `_scanRefBadges` pins a note-side ↗ that flies to
the chip via the **reused** `_navToCanvasAnchor`/`_flashAnchor`. dblclick/cited-guard gate on `isRef`.
**B — cause-effect import:** `elementsFromCauseEffect(chart)` (pure, mirrors `elementsFromAiJson`) → role-coloured
boxes + ★ primary + red/blue leaf terminators (skipped on effects) + grey effect→cause arrows + orange "Connects
to", right-branching layout. `CE_ROLE_COLOR`/`CE_TERM_COLOR`/`CE_CONNECTOR_COLOR` + 'Cause & Effect' scheme.
Commands "New cause-and-effect (fishbone)" + "Import cause-effect chart (JSON)" (`ti-affiliate`). `ce*` tags on
elements for a later Brain-promotion path.
**Verify:** 11/11 node assertions (`refTriggerTest`+`ceParseTest`) + console hooks `refChipTest`/`backrefRoundTripTest`.
Adversarial review (FIX-FIRST) fixed: null-parent line-ref dblclick gate, `_editText` picker leak, record-ref dead
backref storage, empty-query search.
**Deferred (roadmap §8b):** CANVAS-SEG (mid-sentence segment refs), EAPI-3 (record→canvas flyback + cross-device
backref sync — backref is localStorage-only), fishbone-spine view, classic pentagon style, themes, Brain promotion.


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
