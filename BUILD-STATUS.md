# Plexus Canvas — build status (resumable)

## ✅ v1.152.0 — C9: spotlight commented cards (review focus mode) (2026-06-26)
A visual review mode bridging both pillars: toggle to dim the whole board EXCEPT cards that carry anchored comments
(their pins draw on top → stay lit, + a soft amber ring), so you see what's been annotated at a glance. `_drawCommentFocus`
faithfully duplicates the v1.138-reviewed `_drawSpotlight` scrim + opaque-`#000` `destination-out` punch (per "three lines >
premature abstraction"); static (no dirty re-arm → idle 0 CPU); auto-off when nothing's commented (no black-void dim);
toggle command + Esc clear. Review: **SHIP, CLEAN** — no HIGH/MED; composite/transform/save balance, opaque punch,
auto-off-no-flash, self-heal, view-state-not-persisted all confirmed. Folded both LOW consistency nits: built ONE O(N)
index instead of per-id `_byId` (parity with the badge siblings), and added `|| this._cmtFocus` to the hub-badge gate so
focus mode suppresses the degree pills like spotlight/trace already do. (Stacking scrims with spotlight/trace left
as-is — LOW/by-design, consistent with their existing mutual stacking; Esc clears all.) Tests `pxc_cmtfocus` 9;
spotlight/hubbadge regress green. **Next: more on-theme features.**

## ✅ v1.151.0 — C8: @mention people in comments (2026-06-26)
The collaborative dimension of @round: in the comment composer, typing `@name` pops a dropdown of workspace people
(`getActiveUsers()` — SYNC, so no async picker), and ArrowUp/Down + Enter/Tab/click inserts "@Name " and records the
person's guid on `c.mentions` (scene-only; cross-surface relation deferred — needs an MCP-created property). Pure helpers
`pxcMentionToken` (email-@ excluded via `(?:^|\s)@`, contiguous token, ReDoS-safe bounded regex) / `pxcFilterMentions`
(prefix-first) / `pxcInsertMention` (no double-space). The node test caught 2 real bugs pre-review (space-in-token broke
"trailing space ends mention"; double-space on mid-text insert) — both fixed. Review: **well-built**, caught **1 MED** —
`mentPick` mutated `c.mentions` without persisting (a pick-then-close on an existing thread could lose it) → fixed with
`dirty`+`scheduleSave` (not `_commentChanged`, which has no mirror surface for mentions); 2 LOW deferred-work flags noted.
Keydown no-double-action (Enter inserts, doesn't also send), mousedown-not-blur, scene-only (NOT mirrored — no unknown
`Mentions` property write), graceful-when-no-users, no leak all confirmed. Tests `pxc_mention` 14; cmtcat/cmtbadge regress green. **Next: more on-theme features.**

## ✅ v1.150.0 — C7: comment-count badges on cards (see annotated records at a glance) (2026-06-26)
Bridges both pillars: any card (or PDF page / text note / image) with anchored comments shows a small amber speech-bubble
pill + count at its top-right, dimmed when all those comments are resolved — the @round "which records carry annotations"
signal without opening the rail. `_drawCommentBadges` mirrors the reviewed-clean hub-badge pattern (overlay, screen-space,
LOD + off-screen cull, no animation); skips free margin-notes (no `anchor.elementId`) + the single-selected card (so the
⇄ chip / rec-panel never overlap). New `commentBadges` setting (default on) + General toggle. Review: caught **1 MED** (the
hook ran a per-frame `_comments()` array alloc even on comment-free boards — GC churn during pan/zoom; the suggested
maintained-flag fix is fragile since scene-load/undo skip `_commentChanged`) → fixed with a single allocation-free scan; +
1 LOW doc note (the index spans ALL element types intentionally — comments anchor to text/image too). save/restore+alpha
balance, no-overlap guarantee, anchor-field, dim semantics, data-safety, settings backfill all confirmed clean. Tests
`pxc_cmtbadge` 11; hubbadge/cmtcat regress green. **Next: more on-theme features.**

## ✅ v1.149.0 — C6b: comment category count chips (distribution at a glance) (2026-06-26)
Refines the v1.148 category filter: bare color dots → labelled **"●Label N"** count chips showing the comment distribution
(respecting the status filter), only for non-empty categories (+ the active one even at 0, so it stays un-toggleable),
with an "All N" total. Also hoisted `statusList` and changed the rail-rebuild `sig` to sign the COUNT BASIS (`statusList`)
instead of the category-filtered `shown` — fixing a staleness bug where a comment added/changed in a NON-active category
wouldn't update the chip counts. Review: **SHIP, CLEAN** — no HIGH/MED; sig correctness (stable, no churn, covers every
rendered element; `_commentChanged` nulls the sig as belt-and-suspenders), the dropped `c.color` verified safe
(`_setCommentCategory` is the only writer of `c.color`; generic recolor touches only `strokeColor`), no duplicate
`statusList`, dead `.pxc-cmt-catdot` CSS fully removed, no leak, theme-safe, empty/edge all confirmed. Tests
`pxc_cmtcounts` 8; cmtcat/cmtreview regress green. **Next: more on-theme features.**

## ✅ v1.148.0 — C6: comment categories (Note/Question/To-do/Idea/Done/Decision) + rail filter (2026-06-26)
The @round "review the comments on a doc" pillar gains organization: anchored comments get named, color-coded categories;
the popover's old free color swatch becomes category chips (sets category + color in one click), and the rail gains a
category filter that ANDs with All/Open/Resolved. Pure `pxcCommentCategory(c)` (explicit `category` → infer-from-color →
Note default), so existing colored comments classify for free (the 6 category colors ARE the old swatch colors — zero
migration). Category is a SCENE field (rides the whole-element scene save) — NOT mirrored, so no unknown-`Category`-property
write (plugin can't create properties). Review: **SHIP, CLEAN** — no HIGH/MED; data-safety (scene-only, mirror untouched),
back-compat, single-active-chip, rail-sig completeness, filter composition, theme-safe CSS all confirmed. Folded all 3
LOWs: deleted the now-dead `_setCommentColor`, filter-aware empty-state copy ("No comments match this filter"), catdot
hover affordance. Tests `pxc_cmtcat` 16; cmtreview/legend regress green. **Next: more on-theme features.**

## ✅ v1.147.0 — P3.12: connection legend (read the visual language) (2026-06-26)
A small theme-aware key (bottom-left, shown only while the connection layer is on) for the edge/badge visual language, so
the rich connection encodings are readable. Pure `_connLegendRows()` reflects the active edge-type filter + badge state;
`_drawConnLegend()` is screen-space, no animation (no dirty re-arm), read-only. New `connLegend` setting (default on) +
Connections toggle. Review caught **1 HIGH + 1 MED + 1 LOW** — all fixed: (HIGH) the first draft claimed a SOLID
"reference" + a phantom "inferred" category, but `_drawGhosts` renders EVERY ghost dashed and the model has only `ge.rel`
(blue=ref/backref, amber=semantic) → collapsed to two truthful dashed rows + fixed the doc/hint; (MED) `py` could go
negative on a short canvas → clamped with `Math.max(8*d, …)` like the minimap so the title never clips; (LOW) the badge
swatch was pure red but the live badge is a slate→red gradient → painted at mid-heat `pxcMixHex(...,0.55)`. Reviewer
confirmed save/restore+lineDash balance, device-px, no idle-CPU, settings persistence/backfill/live-toggle, no writes.
Tests `pxc_legend` 10; hubbadge/connsettings regress green. **Next: more on-theme features.**

## ✅ v1.146.0 — promote ghosts with the ACCURATE relationship (directional connectors) (2026-06-26)
Quality completion of the promote feature (v1.131/v1.140): a promoted ghost→real connector now reflects the edge's
reference DIRECTION instead of a generic "relates to". `_ghostToConnector` reads `aRefsB`/`bRefsA`: a→b → single head at
b + "references"; b→a → head back at a + "references"; mutual → double-headed + "linked"; semantic/no-direction →
neutral "relates to". Geometry still built a→b (direction = arrowhead, not endpoint swap). Single-promote toast reflects
the actual label. Review caught **1 HIGH**: directional connectors kept `relType='relates-to'`, so opening the style
popover (which the toast invites) and clicking any preset re-stamped a single end-head + "relates to", destroying the
direction — fixed by setting `relType=null` (manual style, like `_setConnColor`) on directional connectors so no preset
re-stamps them (neutral keeps the preset, idempotent). Reviewer confirmed arrowhead values, curved-3pt start-head
tangent, `_setConnLabelText` scene-only safety, backward-compat, no batch shared-state leak. Tests `pxc_promotedir` 14;
promote/promoteall regress green. **Next: more on-theme features.**

## ✅ v1.145.0 — P3.11: group linked pages into frames (organize by relatedness) (2026-06-26)
The capstone to the parallel-pages story: cluster cards by REFERENCE relatedness (connected components of the ghost
graph, synchronous — no AI/embeddings) and move each multi-card cluster into a labelled "Linked N" frame. Pure
`pxcConnectedComponents` (union-find, path-compressed); `_frameClusters()` filters edges by the active edge-type filter,
resolves to live record cards, keeps components ≥2, confirm-gated past 6 moves, re-derives the ghost graph after (so the
line-anchored edges re-resolve at the new positions). Reuses the shipped `_aiAutoCluster` layout math (basis = references,
not embeddings). Review: **SHIP, CLEAN** — no HIGH/MED; data-safe (moves cards + appends frames, zero deletes/record
writes), confirm-before-mutation, union-find termination/completeness, resolve/filter, no idle-CPU all confirmed. The only
LOW (a new frame can geometrically "own" a pre-existing off-cluster card it lands on) is inherited verbatim from the
already-shipped `_aiAutoCluster` and is non-destructive/reversible. Tests `pxc_clusters` 11; lineanchor/trace regress green. **Next: more on-theme features.**

## ✅ v1.144.0 — AZLEN SIGNATURE: line-anchored ghost endpoints (2026-06-26)
The core azlen "parallel pages, visibly connected" visual: a reference edge now emerges from the EXACT body line that
holds the ref, not the card center — so you see the connection thread out of the line of text. Build-side `srcLine` map
(additive) records "src>dst → the line guid on src that holds the ref"; edges carry `aLine`/`bLine`. New shared
`_ghostEndpoints(ge,a,b)` originates each SOURCE end at its line's edge facing the target (center otherwise), and is
used by ALL THREE consumers — static `_drawGhosts`, hover `_drawGhostFocus`, AND the `_ghostEdgeAt` click hit-test — so
the drawn curve and the clickable curve always agree (the unify the v1.135 comment promised). `_lineRectWorld` is a cheap
band-map lookup that null-degrades (rotated/below-fold/unmeasured → center). Verified `li.guid` == band `lineGuid` space.
Review: **SHIP, CLEAN** — no HIGH/MED; draw↔hit-test consistency, exit-side math (faces target, normalizes neg-width),
symmetric build, graceful degradation, backward-compat (old/semantic edges → center), data-safety, perf all confirmed.
Tests `pxc_lineanchor` 9; edgelabel/promote/miniconn regress green. **Next: more on-theme features.**

## ✅ v1.143.0 — minimap connections (the graph shape at a glance) (2026-06-26)
The minimap now draws connection LINES, not just card dots: real bound connectors (solid) always, plus inferred ghost
edges (dashed, honoring the P3.5 edge-type filter) when the connection layer is shown — so the whole parallel-page
graph's shape reads in the corner at a glance. `_drawMiniConnections` projects card centers through the SAME `mapp` the
dots/viewport-rect use (verified byte-identical), drawn live in the clipped panel under the viewport rect, O(N+E) via a
one-shot id→el index, capped 600 per kind. Read-only; rides the minimap's existing dirty cadence (no animation, no
`_miniDirty` coupling). Review: **SHIP, CLEAN** — projection exact, transform(identity)/clip/lineDash/save-restore all
balanced, dangling-endpoint + edge-filter cases handled, z-order (dots→lines→rect) correct, no writes. Tests
`pxc_miniconn` 15; polybbox/hubbadge/cmtreview regress green. **Next: more on-theme features.**

## ✅ v1.142.0 — bugfix: unify the duplicate `_polyBBox` (region-anchor precision) (2026-06-26)
A latent bug the C5 review surfaced: there were TWO `_polyBBox` defs on `CanvasView` — an object-form (`p.x/p.y`) and an
array-form (`p[0]/p[1]`). JS keeps the last, so the array-form won and the object-form was dead → every OBJECT-point
caller (`_regionShapeWorld` output, used by region/frac-anchored comments AND connections) got `null` back and silently
fell back to the HOST element bbox instead of the precise region rect. Audited all 5 call sites (the review's "just delete
the array-form" would have inverted the breakage — 3 callers pass array `worldPoly`). Fix: ONE unified def that dispatches
per-point (`Array.isArray(p) ? p[0] : p.x`), dead duplicate removed. Now region-anchored comments/connections resolve their
true region rect (fly-to, sort order, group-frame hull all sharpen). Review: **SHIP, CLEAN** — exactly one def, object
callers repaired, array callers equivalent-or-better (the added finite-y skip is unreachable + strictly safer), every
caller's null-handling traced safe, pure read. Tests `pxc_polybbox` 9 (both shapes, NaN/empty/degenerate). **Next: more on-theme features.**

## ✅ v1.141.0 — C5: comment review navigation (step through comments) (2026-06-26)
The @round "review the comments on a doc" gesture for the comments pillar: three commands — **Next comment**, **Previous
comment**, **Next unresolved comment** — step through the board's anchored comments one at a time in reading order
(top→bottom, left→right by anchor), flying + flashing + opening each thread. `_commentReviewStep(dir, unresolvedOnly)`
reuses `_jumpToComment` (camera reveal+flash) + `_openCommentThread(id,false)`; tracks `_cmtReviewId` so steps advance
from the last, wraps at the ends, restarts cleanly if the tracked comment was deleted/resolved/detached. Read-only.
Review: **SHIP, CLEAN for C5** — no HIGH/MED; data-safety (no writes), stale-id resume, NaN-free comparator, empty-cases,
leak-free all confirmed. (Reviewer surfaced a PRE-EXISTING latent bug — duplicate `_polyBBox` defs; the array-form
shadows the object-form so region anchors fall back to host bbox. Out of scope for C5 → queued as the next focused fix.)
Tests `pxc_cmtreview` 13; promoteall/hubbadge regress green. **Next: fix the `_polyBBox` collision (region-anchor precision).**

## ✅ v1.140.0 — P3.10: "Make all inferred links real" (batch promote) (2026-06-26)
The batch completion of P3.4 (promote one ghost→real connector): after you surface inferred reference links and arrange
pages, one command promotes EVERY currently-shown ghost edge (type-filtered) to a real curved "relates to" connector at
once. Refactored `_promoteGhost` → shared `_ghostToConnector` (append-only build, returns the arrow) + `_dropGhostPair`;
new `_promoteAllGhosts()` snapshots the live type-OK ghosts, promotes each, drops every promoted pair in one pass
(unordered key, so a reversed-stored ghost is dropped too), confirm-gated past 6. Append-only (pushes arrows, filters the
ephemeral `_ghostEdges` index — never deletes scene data, no record/note writes); idempotent (`_buildRelationalGhosts`
excludes already-connected pairs on rebuild → no duplicate connectors). Review: **SHIP, CLEAN** — refactor diffed
byte-equivalent to the original, append-only/idempotent/leak-free/confirm-gate-closure all confirmed; zero findings.
Tests `pxc_promoteall` 10; promote/hubbadge regress green. **Next: more on-theme features.**

## ✅ v1.139.0 — P3.9: hub badges (at-a-glance connection degree) (2026-06-26)
The always-on *structural* complement to the interaction-driven trio (hover-focus / trace / spotlight): while the
connection layer is shown, each connected record card gets a small degree-count pill (top-left, color heating
slate→red with how many pages it links) so you can **see your hubs at a glance**. Overlay-only, screen-space, honors
the P3.5 edge-type filter, gated off during focus modes / gestures and below z=0.4 (LOD) + off-screen cull. New
`connBadges` setting (default on) with a Connections-section toggle (live, no reload — overlay key, no cache invalidate).
Review: **SHIP** — no HIGH/MED; read-only, save/restore+transform balanced, all helper signatures verified, settings
round-trip + legacy-blob backfill confirmed, no idle-CPU (static, never re-arms dirty). Applied the one LOW (perf): the
per-frame degree pass built an `id→el` index once (O(N+E)) instead of a per-node `_byId` linear find (was O(E·N)).
Tests `pxc_hubbadge` 22; spotlight/trace/connsettings regress green. **Next: more on-theme features.**

## ✅ v1.138.0 — P3.8: spotlight a page's connection neighborhood (2026-06-26)
"See how this page connects to everything": select one record card → **"Spotlight this page's connections"** dims the
whole board (overlay scrim) EXCEPT that card and its 1-hop reference neighbors (the pages it references / is referenced
by), which are punched out fully bright with their edges lit + an outward bead (~5s, then settles → idle 0 CPU). Reuses
the proven `_flash` scrim + `destination-out` punch idiom. Esc clears; a ghost rebuild or a deleted focus card
self-clears. Read-only. Review: caught **1 HIGH** — the punch inherited the scrim's 0.55 alpha so kept cards stayed
~half-dimmed (a permanent quality miss on a *persistent* spotlight, unlike the brief `_flash` pulse); fixed with an
opaque punch fill (`fillStyle='#000'` — alpha is all `destination-out` reads → kept cards fully revealed). All
composite/transform/save balance, self-heal early-returns (before `ctx.save()`), DPR space, idle-CPU, read-only,
edge-id consistency confirmed clean. Tests `pxc_spotlight` 14; trace/arrange2 regress green. **Next: more on-theme features.**

## ✅ v1.137.0 — P3.7: trace the connection between two cards ("how are these ideas connected?") (2026-06-26)
The other half of "visibly connected": select two record cards → **"Trace connection between 2 cards"** BFS-walks the
relational ghost graph for the **shortest reference chain** between them and lights it up on the overlay — a glowing
quadratic-bezier path through each intermediate card's center, a bead marching the whole chain for ~5s (then settles →
idle 0 CPU), endpoint rings strong / intermediate rings lighter. Pure `pxcBfsPath(edges,src,dst)` (undirected, fewest
hops, self-loop/malformed-safe, unreachable→null). Esc clears; a ghost rebuild or a deleted traced card self-clears.
Read-only (no record writes). Review: **SHIP** — no HIGH/MED; idle-CPU contract, read-only, BFS correctness, self-heal,
render-state balance all confirmed. Folded all 3 LOW notes: `_tracedPath` nulled in `destroy()` + on every ghost
rebuild (stale-topology guard), and a same-page (`recordGuid===`) guard with a clear toast. Tests `pxc_trace` 19;
arrange2/promote/density regress green. **Next: more on-theme visual-thinking features.**

## ✅ v1.136.0 — 2nd-degree parallel arrange (azlen "many parallel pages, deeper") (2026-06-26)
Extends P3.3: a new command **"Arrange related pages — 2 levels deep"** (`_arrangeParallel(2)`) adds a 4th column —
the pages that the RIGHT (referenced) column itself references — so the canvas fans out two hops of the reference
graph as parallel, ghost-connected columns. `pxcColumnarLayout` gained a `right2` stack at `fx+2*(CW+COLGAP)`
(backward-compatible: depth-1 callers pass no `right2N` → empty). 2nd-degree refs are deduped against
focus∪left∪right (seeded `seen2`), capped 16, fetched in **parallel** (`Promise.all`, page+line order preserved).
The depth-1 command is unchanged (`_arrangeParallel()`). Review: **SHIP** — no HIGH defects; data-safety clean (reads
only — `getRecord`/`getLineItems`/segments; `placeCol` find-or-creates + repositions scene cards, never deletes, no
source write); three columns provably disjoint → no duplicate card; `byGuid` shared+mutated. Applied both reviewer
notes: parallelized the reads (was up to 12 serial round-trips) and the confirm-gate now weighs **moves + creations**
(a fresh-canvas depth-2 pull of many NEW cards now prompts — closes the silent-bulk-create gap), with a label that
states moved/new counts. Tests `pxc_arrange2` 22, `columnar` 14 regress green. **Next: more on-theme visual-thinking features.**

## ✅ v1.135.0 — directional edge labels on hover (2026-06-26)
The "what connects them" half of azlen: hover a card → a crisp pill at each focused edge's midpoint shows the
relationship from the hovered card's view (references / referenced by / linked / related). `_buildRelationalGhosts`
tracks a directed set → `aRefsB`/`bRefsA` per edge; `_drawGhostFocus(ctx,z,d)` renders screen-space labels (≤12-edge
gate). Review: **SHIP** (no defects — direction correct both orderings, backward-compat safe, render-state balanced,
DPR-correct, perf bounded). Tests `pxc_edgelabel` 13. Commit `9d6b1c6`, pushed. **Next: 2nd-degree arrange expansion.**

## ✅ v1.134.0 — Connections settings panel (2026-06-25)
Surfaces the P3.0–P3.6 connection controls (Edge glow / Edge density all↔hovered-only / Inferred-link types
all/references/semantic) in the Settings modal — were command-palette only. `apply()` invalidates the static cache for
these keys (live update, no reload); UI + the P3.5 commands share `this._settings`. Review: **SHIP** (every dropdown value
matches its renderer branch, proven invalidation chain, clean defaults merge, no regression). Tests `pxc_connsettings` 14.
Commit `818137a`, pushed. **The Visual-Thinking Canvas is complete + polished + discoverable (v1.119→1.134, 18 ships).**

## ✅ v1.133.0 — P3.6: glow on REAL connectors (on-theme follow-up) (2026-06-25)
After the roadmap completed, the re-fired /loop ("implement other X-post features") → extend P3.0's ghost glow to
user-drawn arrows/lines: `drawLinear` draws a soft bloom of the same path when `PLEXUS_EDGE_GLOW>0` (module global set
per-render, scale-aware). Review: 2 MED + 1 LOW fixed — scale-aware blur (`min(20,3*zoom*dpr)` like the card glow, was a
flat 7px); export forces glow off (deterministic, matches glow-less SVG); `adaptInk` glow color for dark-mode. 60fps via
the `_drawGesture` gate (0 blur mid-gesture). Tests `pxc_connglow` 16. Commit `bbf18f4`, pushed. **Next follow-ups:
Settings-panel UI for the connection toggles; PDF source-blob re-render for interrupted fills; 2nd-degree arrange.**

## ✅✅✅ VISUAL-THINKING CANVAS ROADMAP COMPLETE (2026-06-25)
The whole plan inspired by azlen's "parallel pages, visibly connected" + round's anchored-comments X posts is shipped end
to end across **16 reviewed feature ships (v1.117 mind-map → v1.132)**:
- **Phase 1 — Anchored comments** (v1.119–1.122): C0 scene `type:'comment'` + pins/rail/thread, C1 durable `Canvas
  Comments` Thymer mirror, C2 cross-surface note backref, C3 polish (pin-drag/hover-preview/entrance-pop).
- **Phase 2 — PDF documents** (v1.123–1.126): D-A document model + cross-runtime blob-worker, D-B lazy placeholder render,
  D-C page-nav + explode/stack, D-D one-click region comment (ties PDF to the comment system).
- **Phase 3 — Parallel pages, visibly connected** (v1.127–1.132): P3.0 gradient/glow edges, P3.1 hover-focus, P3.2 flow
  particle, P3.3 columnar "Arrange related pages" (the azlen gesture), P3.4 promote ghost→real, P3.5 density control.
Every ship: node-extract tests + adversarial code-review + data-safety discipline. All pushed to Svyk/thymer-canvas-plugin.
Reinstall + reload to use it all.

## ✅ v1.132.0 — Phase 3.P3.5: connection-density control (FINAL) (2026-06-25)
`edgeDensity` (all | focus = hovered-only, auto when >150 edges) + `edgeTypes` (all | rel | semantic) gates on the ghost
graph, applied consistently across draw/hover/promote; 2 persisted command toggles. Review: caught a **HIGH** (the
focus-only HIT gate keyed on live `_connHover` which is null at empty-space click time → promote was dead in hovered-only
mode + the auto>150 forced users there) — fixed by removing the focus-only restriction from `_ghostEdgeAt` (kept the type
filter); LOW addressed (honest filter toast). Tests `pxc_density` 20. Commit `3963e3a`, pushed.

## ✅ v1.131.0 — Phase 3.P3.4: promote ghost→real connector (2026-06-25)
Click an inferred ghost edge (empty space) → a persistent "relates to" connector. `_ghostEdgeAt` (samples the ghost's
quad curve, same control point as the renderer, distToSeg ≤ 8/zoom); `_promoteGhost` (curved 3-point arrow bound to both
cards + relates-to preset + real label; removes the pair from the ghost set). APPEND-only, undoable; onDown-gated to
select+empty-space+no-shift (never hijacks a card/pin click); excludes the pair from future ghost rebuilds. Review:
**SHIP** (append-only/undo/gating/re-exclusion sound); 1 MED fixed (2-point curved:true renders straight → added the
perpendicular waypoint so it curves to match the ghost). Tests `pxc_promote` 14. Commit `2f29fb6`, pushed. **Final ship:
P3.5 — connection-density control (only-hovered mode / by-relation-type filter / threshold).**

## ✅ v1.130.0 — Phase 3.P3.3: "Arrange related pages (parallel, connected)" (2026-06-25)
The azlen centerpiece, as a command: select a record card → forward-ref pages stack RIGHT (reading order), referencing
pages stack LEFT, focus centered; existing cards MOVED+sized into columns, missing ones pulled in; relational ghosts
rebuilt → the P3.0/P3.1 gradient/glow edges connect the columns. Pure `pxcColumnarLayout` + `_arrangeParallel` + command
(`ti-layout-board`, bundled). Confirm-gated when relocating >6 cards; fully undoable; geometry-only (never edits/deletes
content); mutual ref stays RIGHT; 12/column cap. Review: **SHIP** (no HIGH/MED — data-safety/undo/confirm/ref-fetch all
correct); 2 LOW fixed (silent ghost rebuild → no double toaster; stale-focus-closure guard). Tests `pxc_columnar` 14.
Commit `90c7bb3`, pushed. **Next: P3.4 — promote ghost→real (click a ghost edge → a persistent labeled connector).**

## ✅ v1.129.0 — Phase 3.P3.2: animated flow on the hovered edge (2026-06-25)
A glowing particle travels along each focused ghost edge OUTWARD from the hovered card (quad-Bezier B(t), 0→1 every
1.4s) — shows relationship direction. `dirty`-rearmed in `_drawGhostFocus` so it animates while hovering; idles to **0%
CPU** when hover clears (the GUARDRAILS animation-leak property — re-arm after all early-returns; verified). Review:
**SHIP** — idle-to-0 + particle-on-curve (both orientations) + state balance pass; MED fixed (per-frame shadowBlur dropped
on a >12-edge hub) + LOW. Tests `pxc_edgeflow` 12. Commit `3148636`, pushed. **Next: P3.3 — columnar "Arrange related
pages (parallel, connected)" — the literal azlen gesture (focus page center, refs right in reading order, backrefs left).**

## ✅ v1.128.0 — Phase 3.P3.1: ghost-edge hover-focus (2026-06-25)
Hover a card with ghost edges → its incident edges go BRIGHT+SOLID + the hovered/connected cards get a focus ring.
Two-tiered correctly: bulk gradient/glow ghosts stay in the static raster (P3.0); hover-focus is `_drawGhostFocus` on the
iCv OVERLAY (redraws every frame → live on hover, since `_cacheValid` isn't invalidated by a hover). Reuses `_connHover`;
same world-transform + `/z` convention as the select-glow; gated select-mode/!editing/!gesture/incident-edge-required.
Review: **SHIP** (no defects — focus updates+clears correctly, state/transform balanced, perf bounded, no P3.0 regression).
Tests `pxc_edgefocus` 13. Commit `17c5ee1`, pushed. **Next: P3.2 — animated flow on the hovered edge (marching dashes /
particle, dirty-rearmed, idle→0 CPU when hover clears).**

## ✅ v1.127.0 — Phase 3.P3.0: gradient/glow ghost edges (2026-06-25)
The auto ghost edges (related on-canvas cards) went from flat dashed lines to GRADIENT-along-the-chord (endpoint accent
hue A→B — the azlen "visibly connected" look) + soft GLOW (shadowBlur, A↔B midpoint hue via new `pxcMixHex`) + a gentle
perpendicular CURVE. `edgeGlow` setting (default on); 60fps protected by gating glow OFF during any per-frame gesture via a
new `_drawGesture` flag (onDown shared-bottom set; onUp+onPtrCancel clear) + `_panMode`. Review: caught a **MED** (the
first `_elDrag` gate missed resize/rotate → per-frame glow regression) — fixed with `_drawGesture`; render-state balance,
device-px shadowBlur, zero-length edge all clean; 2 LOW addressed. Tests `pxc_edgeglow` 22. Commit `32f5ea3`, pushed.
**Next: P3.1 — hover-focus mode (hover a card → its connected pages/edges highlight, rest dims; edge label fades in).**

## ✅✅ PHASE 2 COMPLETE — PDF documents (D-A…D-D) (2026-06-25)
The round/PDF pillar is shipped: **D-A** (v1.123) document model + cross-runtime blob-worker; **D-B** (v1.124) lazy
placeholder + bounded background fill; **D-C** (v1.125) page-nav chrome + explode/stack; **D-D** (v1.126) one-click region
comment tying PDF back to the C0–C3 comment system. Next pillar: **Phase 3 — parallel-pages-visibly-connected** (P3.0 first).

## ✅ v1.126.0 — Phase 2.D-D: one-click region comment (2026-06-25)
The Comment tool: CLICK = point/element comment (C0); DRAG a box over an image/PDF page = REGION comment anchored to
`{elementId, frac}` (sits on the region, tracks the page). New `_createCommentAnchored` (shared click+region); onDown starts
`mode='cmtregion'` + the crop marquee; onUp decides drag-vs-click; onPtrCancel clears `_cmtRegionDown` (no wedge). A PDF-page
region comment is canvas-only on the note side (`_commentedRecordGuid` null for an image) but still mirrors with Anchor
Kind='region' + Drawing relation. Review: **SHIP** (no wedge, frac clamped, C0–C3 unaffected, pin-click-to-open still wins);
1 LOW fixed (command toaster). Tests `pxc_cmtregion` 9. Commit `74e7868`, pushed.

## ✅ v1.125.0 — Phase 2.D-C: PDF page-nav chrome + explode/stack (2026-06-25)
Select a PDF page → a world-anchored chrome (`‹ p N/M ›` prev/next via `_focusMatch` to the sibling page in the same
`el.pdf.docId`, + Grid/Stack). Commands "Explode PDF to grid" / "Stack PDF pages" (selected doc, else first PDF doc).
`_pdfPagesOf`/`_pdfGoPage`(bounds→toast)/`_pdfStack`(column)/`_pdfExplode`(ceil√n grid) reposition x/y only (undoable, never
delete/dup, Math.abs-safe). `_syncPdfNav` overlay theme-matched; mutually exclusive with the rec-panel. Review: **SHIP**
(no HIGH/MED); 2 LOW fixed (one-frame width estimate; stale `pdfgrp` comment). Tests `pxc_pdfnav` 18. Commit `f689d7b`,
pushed. **Next: D-D — one-click region comment on a PDF page (the round-demo capstone; ties Phase 2 back to the C0–C3
comment system).**

## ✅ v1.124.0 — Phase 2.D-B: lazy/progressive PDF render + bounded memory (2026-06-25)
A PDF drop returns INSTANTLY with placeholders (cheap `getViewport` pass sizes them; the dashed stub renders until filled),
then a CONC=2 background worker pool rasterizes each page → `_attachBlobToFileId` (asset/cache back-half of
`_addImageFromFile`, targeting an existing placeholder). Cap 20→100 (honest "first 100 of N"); doc kept alive only during
fill then `doc.destroy()`. Review verified pool correctness (each page once, ≤CONC), backing-migrate race (serialized on
`_backingInflight`), doc lifecycle. Caught **MED** (seed never `_imgCacheEvict`'d → 100-page burst left ~100 rasters
resident, breaking the cull guarantee) + **2 LOW** (stretched page if viewport pass failed; post-destroy save re-arm) — all
fixed. Tests `pxc_pdflazy` 16. Commit `37fb68b`, pushed. Known minor: an interrupted fill leaves empty placeholders
(re-render-from-`el.pdf` is D-C). **Next: D-C — page-nav chrome + explode/stack (walk `el.pdf.docId`).**

## ✅ v1.123.0 — Phase 2.D-A: PDF document model + cross-runtime worker (2026-06-25)
Upgraded `_addPdf` from a magic-`y+=520` stack into a real DOCUMENT: pages render to a clean vertical column (real
heights), each tagged `el.pdf={docId,page,pageCount,srcName,renderScale}`. Grouping is by `el.pdf.docId` ONLY (NOT
`el.groupIds` — that makes a click select the whole unit and would break per-page click-to-comment/rec-panel/Cite; the
adversarial HIGH). Pages stay `type:'image'` → region/comment anchoring + GPU LRU + decode-cull + SVG export untouched.
Cross-runtime pdf.js worker (`_pdfSetupWorker`: fetch worker src → same-origin blob: URL, disableWorker fallback; `res.ok`
guard so a CDN error can't poison the cache — the MED); webp render (png fallback); `doc.destroy()`; honest 20-page cap.
Review: HIGH+MED fixed. Tests `pxc_pdfdoc` 19. Commit `305a04b`, pushed. **Next: D-B — lazy render + memory (cull-gated
pages 3..N, doc-proxy lifetime, concurrency cap).**

## ✅✅ PHASE 1 COMPLETE — anchored comments (C0–C3) (2026-06-25)
The round/azlen "anchored threaded comments" pillar is shipped end-to-end: **C0** (v1.119) scene `type:'comment'` element
anchored via `_bindingFor` + speech-bubble pins + thread popover + right rail; **C1** (v1.120) durable Thymer mirror to the
`Canvas Comments` collection (scene = source of truth); **C2** (v1.121) cross-surface — comments surface on the commented
note's Backreferences with fly-to-pin; **C3** (v1.122) polish. Next pillar: **Phase 2 — PDF documents** (D-A first).

## ✅ v1.122.0 — Phase 1.C3: anchored-comment polish (2026-06-25)
Pin DRAG-to-nudge (click-vs-drag at a 4px threshold; nudge persists scene-only + refreshes the mirror's Anchor Data,
debounced); hover PREVIEW (author·first line·reply count, reusing `.pxc-refpreview`); soft hover RING also driven by
rail-row hover; entrance POP (0.55→1 ease-out-cubic 160ms, `_cmtBorn` view Map, never serialized). Adversarial review:
**HIGH** (the GUARDRAILS crop-in-place leak class — `_cmtPinDown` not cleared in `onPtrCancel` → a
lostpointercapture/pointercancel mid-pin-press WEDGED `onMove`) + **2 MED** preview-leaks (mode-drag and @ref→pin
hand-off) — all fixed (`onPtrCancel` + onDown-top clear `_cmtPinDown`; drag/hover paths tear down the previews). Tests
`pxc_cmtpolish` 18. Commit `832f535`, pushed.

## ✅ v1.121.0 — Phase 1.C2: comments surface on the commented note's Backreferences (2026-06-25)
An anchored comment on a record/line now appears in that note's native Backreferences as a "Canvas Comments (N)" group
(💬 amber) → click flips to the drawing, flies to the anchor, and opens the thread. `_reindexBackrefs` comment pass keys
the backref by the commented note guid (`_commentedRecordGuid`); `_scanRefBadges` record-section filter includes kind
`comment`; `_injectCanvasRefSection` renders two groups (References + Comments) with a sig that distinguishes comments;
`_navToCanvasAnchor` routes a comment entry to `_jumpToComment`+`_openCommentThread`; `_commentChanged` also
`_scheduleReindex()`. Adversarial review: **SHIP** (no index-pass regression, no 💬 leak onto a body line — comments key
by record guid not line guid, stale-removal + sig correct, kind round-trips through the synced store); 2 LOW cosmetics
fixed. Tests `pxc_cmtbackref` 14. Commit `8318aea`, pushed. **Phase 1 comments core DONE (C0+C1+C2). Next: C3 polish
(hover preview, pin-drag nudge, detached handling, entrance animations).**

## ✅ v1.120.0 — Phase 1.C1: durable Thymer mirror for anchored comments (2026-06-25)
Each comment now mirrors to a record in the `Canvas Comments` collection (`10V5CTX7WNBY7FTCF9JT4TTY4K`). Scene element =
HOT source of truth; record = durable/queryable/cross-surface mirror, reconciled scene→record. `_mirrorComment` writes
Comment Text/Status/Anchor Kind/Anchor Data/Created At/Author/Drawing+Commented Record relations/Scene Element Id, with
the reply thread as APPEND-ONLY body lines (deduped vs the record's live body-line count). Debounced flusher (800ms,
coalesced) via `_commentChanged`; create-once (in-flight Map + post-await guid re-check); cold-start `_reconcileComments`
(match Scene Element Id under Drawing==recordGuid) rejoins not dupes. Relations via the set→read-back-`pxcRelValues`→retry
idiom; datetime via `parseDateTimeString(pxcTodayISO()).value()`; graceful scene-only no-op if the collection is absent.
Adversarial review: **HIGH** (delete path was dead — `_byId` filtered the deleted element so trash never ran → leaked an
open record per delete) + **MED** (Drawing reconcile-key written last → orphan+dup kill-window) + LOWs; HIGH+MED fixed
(flush resolves deleted comments; both reconcile keys written before any other property). Tests `pxc_cmtmirror` 27 /
`pxc_comments` 21. Commit `80c949f`, pushed. **Next: C2 — surface the comment on the commented note's Backreferences.**

## ✅ v1.119.0 — Phase 1.C0: scene-only anchored comments (2026-06-25)
First ship of the **Visual-Thinking Canvas** roadmap (`~/.claude/plans/staged-finding-ritchie.md`): anchored, threaded
comments / margin notes (azlen "parallel pages, visibly connected" + round's PDF/comment demo). A `type:'comment'`
scene element anchored via the existing `_bindingFor` 5-type binding (whole card / body LINE / image REGION / inline
REF / free margin note); pin derived from the live anchor each frame (`_commentAnchorRect`) so it tracks
move/resize/scroll/rotate; detached anchor → kept in the rail. Speech-bubble PINS (reply-count badge, resolved ✓),
THREAD popover (compose/replies/color/resolve/delete, Enter-send), toggleable right RAIL (All/Open/Resolved,
click-to-fly+flash). Comment tool + palette commands. Inert in the shape pipeline (drawElement no-op + skipped in
hit-test/lasso/grid/sceneBounds/minimap/export); append-only; confirm-gated delete; empty discard; destroy() teardown.
Adversarial review: HIGH (build-time empty-discard soft-deleted a fresh comment + lost the first reply) + 2 MED
(minimap/sceneBounds) + 2 LOW — all fixed; invariant locked by `pxc_comments` (21). Commit `5233706`, pushed.
**Storage is scene-only this ship — the Thymer "Canvas Comments" record mirror is C1 (next).** Reinstall+reload to
use it: pick the Comment tool (or ⌘K "Plexus: Comment") → click a card / body line / image region / empty space →
type → Enter.

### C1 prerequisite DONE (collection provisioned via MCP, workspace `svy` WEJ9EZW6ADT58SJC3EQMNETSW6)
`Canvas Comments` collection = **`10V5CTX7WNBY7FTCF9JT4TTY4K`** (icon ti-message). Fields:
Comment Text (text) · Author (user) · Drawing (record→relation, set to the backing Plexus Drawings `1M80FGPHDZ58M4P5AEPBB91B67`) ·
Commented Record (record→relation, the note the anchor targets) · Anchor Kind (choice element/line/region/ref/free) ·
Anchor Data (text JSON) · Status (choice open/resolved) · Created At (datetime) · Scene Element Id (text, the hot↔durable join key).
C1 plugin work (next ship): `_commentsCollection()` (find-by-name, cache), `_mirrorComment` (create/append-replies-as-body-
lines/resolve via the debounced flusher), `Scene Element Id` join + `_reconcileComments` cold-start rejoin, in-flight guard.
Relation writes via the verified set-object→read-back-`pxcRelValues`-retry idiom; reads via `pxcRelValues` (never linkedRecords).

## ✅ v1.118.0 — transclusions now show up in "Canvas References" (2026-06-25)
User report: a **text ref** to "Ford Five Hundred" appeared under a record's Backreferences → Canvas References, but a
**transclusion** of it on the board did NOT. Root cause: `_reindexBackrefs` indexed inline text refs (`el.runs` `t:'ref'`),
standalone ref chips (`el.isRef`), and arrow-bound cards — but a bare transclusion CARD (`record`/`linecard`/`task`) just
sitting on the board was never registered. Fix (read-only on the scene; backref store is last-writer-wins per drawing):
- A `record` card keys a backref by its `recordGuid` (kind `record`); a `linecard`/`task` card keys by its `lineGuid` (kind
  `line`). Label = the live record title / line text. `query`/`rollup`/`table`/`board` cards embed a QUERY not one record → skipped.
- New `_scheduleReindex()` (debounced 600ms, coalesced, destroy-guarded) — re-runs the index once a card's title resolves
  async (`_recFor.finally`), upgrading the `transclusion` placeholder to the real name + refreshing connection breadcrumbs.
  N cards loading coalesce to ONE reindex. `destroy()` clears the `_reindexT` timer.
Renders + flies back via the existing `_injectCanvasRefSection`/`_navToCanvasAnchor` path (source-agnostic). Adversarial review:
**SHIP** — dedup (card vs arrow = distinct elIds), no write-storm (reindex read-only, never re-arms), persisted-store safe
(full rebuild, self-healing placeholder), `.finally` fires once on all paths, destroy double-guarded, malformed elements safe.
Only LOW: a >800ms-slow record load can leak a `transclusion` placeholder cross-device, self-heals ~1.4s. Tests: `pxc_translink` 17.
Commit `69aac80`, pushed. Reinstall+reload to pick it up.

## 🛠 v1.117.1 — HOTFIX: blank canvas on flip-to-drawing (2026-06-25)
User flipped a note → drawing and got a **completely blank canvas** (no toolbar, no content). Root cause: a 1.117.0 regression —
`mount()` calls `_buildToolbar()` (line 1847) BEFORE assigning `this.wrap` (was line 1851), and the new `_wireToolbarTips`
appended its tip node to `this.wrap` → on a FRESH mount `this.wrap` was `undefined` → `TypeError` → `_buildToolbar` threw →
the whole canvas mounted blank. Slipped through because a toolbar REBUILD already has `this.wrap` set (only first-mount/flip hit it).
Fixes: (1) set `this.wrap = wrap` BEFORE the `_buildToolbar()` append; (2) `try/catch` the `_wireToolbarTips` call — a cosmetic
tooltip must never throw out of the build; (3) `_wireToolbarTips` appends to `this.wrap || bar.parentNode || this.host` and bails
if none, positioning via `tip.offsetParent`. Syntax OK; pxc_mmkeys 11 / pxc_mmpaste 18 / pxc_aimindmap 16. Commit `65676a5`, pushed.

## ✅ v1.117.0 — mind-map discoverability: toolbar button + hover tooltips + keyboard nav (2026-06-25)
Follow-up to the user's "how do I build a mind map? I don't see a button" + "add tooltips on hover" + "shift-tab to go back,
arrows to jump between nodes." Three changes, all UI/keyboard (no scene-data writes beyond the existing append-only `_newMindMap`):
- **Toolbar "New mind map" button** (`ti-graph`, known-bundled) — added to `DEFAULT_TOOLBAR_ORDER`/`TOOLBAR_SPECIAL_LABEL`/
  `toolbarItemIcon` + a builder in `_buildToolbar` that calls `_newMindMap()`. Was command-palette-only before.
- **`_wireToolbarTips`** — instant styled hover tooltips (`.pxc-tip`) on every toolbar button; the native `title` delay is long/
  unreliable in the Electron host. Reads each button's `title`, suppresses the native one while shown, restores on hide; disposer
  in `_toolbarDisposers`; `_tipEl` reused across rebuilds and now removed on `destroy()`.
- **Mind-map keyboard nav** — a selected mind-map node JUMPS between nodes on plain arrows (`_mmNav`; Ctrl/Cmd auto-centers)
  instead of nudging; **Shift+Tab → parent node** (Tab still = add child + open edit). Non-mind-map selections nudge unchanged.
Adversarial review: **SHIP** — title-leak, listener-leak, keydown-regression and Shift+Tab-guard classes all verified clean
(disposers run before every rebuild + on destroy; `_isMM` can't NPE; root/deleted-parent guarded; `preventDefault` unconditional).
Only LOW/cosmetic residuals. Tests: `pxc_mmkeys` 11; regressions `pxc_mmpaste` 18 / `pxc_aimindmap` 16 / `pxc_gridsnap` 13.
Commit `71efc46`, pushed. Reinstall+reload to pick it up.

## ✅✅ MIND-MAP SHORT LOOP COMPLETE — 2/2 shipped (the rest was already at parity) (2026-06-25)
The user asked to port the NotebookLM Obsidian-Excalidraw MindMap Builder features. The AUDIT found the Plexus mind-map
builder **already ~at full parity** (keyboard flow Tab/Enter/Alt+C/X/V/Arrow, `_mmCycleLayout` right/down/radial/up/left tree
strategies, `_mmTogglePin`, `_mmToggleFold`, `_mmToggleBoundary` — all shipped, atop the relational substrate: live cards,
refs/backrefs, ghost-edges, drag-restructure, ExcaliBrain expansion, outline⇄canvas, flip-a-card, task sync). So the loop was
just the two genuine residuals:
- **v1.115.0 MM-polish** — Tab/Enter add-node-and-edit, Alt+Ctrl/Cmd+Arrow nav+center, paste-markdown-list→branch.
- **v1.116.0 MM8** — AI → LIVE mind-map (below).
Run summary: **2 ships + the rest audit-resolved as already-shipped.** Mind-map parity with the videos is effectively complete;
the only remaining future-extension is AI-linking nodes to EXISTING records via `@@` refs (the live editable tree is delivered).

## ✅ v1.116.0 — MM8: AI → LIVE editable mind-map (mind-map short loop, ship 2/2) (2026-06-25)
Command **"Plexus: AI mind map from prompt"** → `_aiMindMap`: a topic → `_aiComplete` (system prompt: an indented bullet
outline, central topic first, 2–4 levels) → a NEW `mmRoot` central text node + the outline built as children via `_mmPasteList`
(the v1.115 append-only outline→tree parser) + `_mmLayout`. Every node is a live editable/expandable mind-map node driven by
the keyboard flow — NOT a flat rasterized Mermaid image (the gap vs `_aiMermaid`). Reuses `_aiComplete`/`_aiKey` + `_mmMakeNode`/
`_mmPasteList`/`_mmLayout`; needs the user's OpenAI/xAI/Anthropic key (Settings).
- **APPEND-ONLY** (only a new root + new children; no overwrite/delete, no record/note write). AI-fail (`_aiComplete` null) +
  key-missing + empty-outline + prompt-cancel all bail with ZERO scene change, each BEFORE the single `scene.elements.push`.
- **Adversarial review: SHIP** — 5 axes clean (append-only, ordered guards, root created+`mmRoot`-stamped+pushed before
  `_mmPasteList` reads it, body-empty places the lone root, ordinary text/arrow primitives so render/select/export already
  handle them). Only LOW = no post-await `destroyed`-check, consistent with every sibling AI builder, harmless no-op. Node
  `pxc_aimindmap` 16/16 + regressions green.

## ✅ v1.115.0 — MM-polish: mind-map keyboard-flow polish (mind-map short loop, ship 1/2) (2026-06-25)
After the mind-map-parity AUDIT found the builder ALREADY ~at parity with the NotebookLM MindMap Builder videos (Tab=child,
Enter=sibling, Alt+C/X/V branch ops, Alt+Arrow nav `_mmNav`, `_mmCycleLayout` right/down/radial/up/left, `_mmTogglePin`,
`_mmToggleFold` — all shipped), the user chose a short loop on the genuine residuals. This ships the small high-flow batch:
- **(a) add-node opens edit:** `Tab`/`Enter` on a selected mind-map node → `_mmAddChild`/`_mmAddSibling` THEN `_editText(new)` —
  which `ta.select()`s, so the first keystroke replaces "New idea" (the video's type-right-away flow). The `editingId` keydown
  guard (3505) means it can't fire mid-edit (no double-textarea).
- **(b) nav + auto-center:** `_mmNav(node, dir, center)` — `Alt+Ctrl/Cmd+Arrow` adds camera-center via `_focusMatch`; plain
  `Alt+Arrow` is unchanged (select-only).
- **(c) paste-list → branch:** `_mmPasteList` — pasting a multi-line markdown/indented list while a single mind-map node is
  selected builds a child BRANCH (one node per line, nested by indent via a pruned parent-stack), instead of one text element.
  APPEND-ONLY (new nodes+edges only); gated on single-mm-selection + multi-line so it never hijacks a normal text paste; sits
  AFTER the `_lastPaste` dedupe + `preventDefault`; capped by the upstream 5000-char `hasText` limit.
- **Adversarial review: SHIP** — all 6 axes clean (append-only, no dangling mmParent across normal/indented-first/mixed-tab/
  non-monotonic/sibling-after-deep cases, paste-gate no-hijack, re-entrancy safe via the editingId guard, nav no-regression,
  ordinary text+arrow elements so render/select/export already handle them). 2 NITs + 1 by-design LOW, none blocking. Node
  `pxc_mmpaste` 18/18 + regressions green.
- Next (short loop 2/2): MM8 — AI → LIVE record-card mind-map (vs the rasterized `_aiMermaid`). Then the loop is done.

## ✅✅ TIER A+B PARITY LOOP COMPLETE — 26/26 (8 code ships + 18 audit-resolved/deferred) (2026-06-24)
The full Tier-A→B worklist (`TIER-AB-WORKLIST.md`, from the 2026-06-24 deferred-audit) is processed. Every item: built /
audit-resolved (already shipped) / deferred-to-backlog. **8 code ships** (v1.105→v1.112), all node-tested + adversarially
reviewed + pushed to `Svyk/thymer-canvas-plugin`:
- **A1** v1.106 live cards in PNG/SVG/print/cite export · **A2** v1.107 concurrency rev-check (multi-device overwrite guard +
  conflict backup) · **A3** v1.108 AI-edit on externalized images · **A5** v1.109 backlinks list · **B1** v1.110 in-place image
  crop · **B2** v1.111 7 pen profiles · **B16** v1.112 grid/snap decouple. (v1.105 mind-map→note was the prior run.)
- **Audit-resolved (already shipped):** A4 palette-inheritance · A6 elbow/orthogonal arrows · B4 frame settings · B5 gallery ·
  B7 banner-sync · B9 deep-link anchors (Cite/xref) · B10 Settings modal.
- **Deferred to the Thymer backlog (project `1ZD714PF7526KQTYQGRN3RK3MH`):** A7 TEST_HOOKS (release-toggle doc) · B3 layer
  panel (not-parity/low-value) · B6 restored-panel reopen (probe → needs hands-on session, recipe logged) · B8 render-in-note
  (platform-blocked, no Thymer render hook) · B11 IndexedDB cache · B12 mermaid-reedit · B13 jspdf PDF · B14 connector
  ergonomics · B15 curved-arrow focus+gap · B17 editable-ontology · B18 dead-code (REAL superseded cache/margin subsystem
  found — render-path removal needs a careful live-verified session, recipe logged) · B19 stencil import. Plus residuals from
  B16 (SVG hachure patterns, arrowhead-none memory).
- **Headline:** the deferred-audit OVER-SCOPED Tier B against a very mature plugin — most "polish" items were already shipped
  or platform-blocked; only the genuine gaps (A1/A2/A3/A5/B1/B2/B16) needed real builds. Net: 8 ships, 18 honest resolutions,
  a fully-documented backlog. **No live verification claimed** — each ship needs the user's Plugins-Manager reinstall + reload.

## ✅ v1.112.0 — B16: GRID / SNAP DECOUPLE (export-fidelity, the most-felt) (Tier-B loop, ship 7/26) (2026-06-24)
Snap-to-grid was coupled to grid VISIBILITY — `_snap` gated on `_gridOn()` (`gridModeEnabled`), so you couldn't show the grid
without snapping, or snap without showing the grid. Now decoupled.
- New **`gridSnap`** appState flag + **`_snapOn()`** = `gridSnap != null ? !!gridSnap : _gridOn()` (explicit gridSnap wins;
  unset → follows the grid → **old scenes byte-identical**). `_snap` + the move/resize/**editpt** (the 4th gate the first pass
  missed) gates now use `_snapOn()`; the ~26 direct `_snap()` auto-layout sites inherit it for free. **`_toggleSnap()`** +
  command "Plexus: Toggle snap-to-grid" (toaster annotates "(grid hidden)" when snap-on-grid-off).
- **Adversarial review: SHIP.** Completeness confirmed (every snap site routes through `_snap`→`_snapOn()`); backward-compat
  byte-identical (live `gridSnapTest` passes unchanged — I added decouple asserts to it too); `gridSnap` persists/round-trips
  gate-free (no appState whitelist; default scene omits it → undefined → safe); no render/export/select/data surface change
  (grid render still on `_gridOn()`). MED was just confirming the intended decouple blast-radius (snap-on snaps placements
  too — intended). Node `pxc_gridsnap` 13/13 + regressions green.
- B16 residuals DEFERRED to backlog: SVG hachure/cross-hatch PATTERNS in export (needs SVG `<pattern>` defs; low-value) +
  arrowhead-'none' memory (small; remember last-used arrowhead). Next (worklist B17): editable shared-ontology record.

## ⏭ B11–B15 — DEFERRED (lower-value Tier-B tail), NO SHIP (Tier-B loop, items 17–21/26) (2026-06-24)
Batch-deferred the lower-value tail to reach the genuine builds (B16/B18). All audit-rated lower-value/partial/large, none a
clean small win: **B11** IndexedDB LocalCache (0 indexedDB refs — genuinely unbuilt, but a cache layer + rev-keyed
invalidation, not a small win; blob fetch is source-of-truth + acceptable for current sizes). **B12** re-editable
Mermaid/LaTeX (shipped rasterized; re-edit = large store-source+re-render contract, rare workflow). **B13** jspdf vector PDF
(`_printFrames`@2688 window.print→Save-as-PDF already covers daily PDF; jspdf = lazy lib for reliable page-sizes, low-freq).
**B14** connector-label ergonomics (nudge-offset/z-order/labels-on-curve/lock — trivial grab-bag, opportunistic). **B15**
curved-arrow exact hit-test + focus+gap binding (multi-point routing already works; curved hit-test benign few-px minor;
focus+gap = large precision-binding lift). All logged to the Thymer backlog; build any on request. No code change.
- Next: **B16 export fidelity — BUILDING the grid/snap decouple** (the genuine gap: `_snap`@1995 gates on `_gridOn()`, so the
  grid can't show without snapping or vice-versa) + arrowhead-none memory; SVG-hachure-pattern deferred (more involved, low-value).

## ℹ️ B9 + B10 — both AUDIT-RESOLVED (already shipped), NO SHIP (Tier-B loop, items 15–16/26) (2026-06-24)
The two items the run-prompt expected as "genuine builds" turned out **already shipped** — the plugin is even more mature
than the deferred-audit indicated.
- **B9 (sub-drawing deep-link anchors)** — shipped (reimagined) as the **Cite/xref** system. `_copyImageRefToClip`@6514
  ("Cite selection" cmd@7254) deep-links ANY selection (pending region · every selected element/shape/text/image/frame via
  bbox · composites) → snapshot + drawing-ref + a `plexus_xref` anchor index@7619. Clicking the cite → `_navToCanvasAnchor`
  @7963 opens the drawing + `_flashAnchor`@2493 fits the camera to the anchored-items **union bbox** + establish-then-zoom
  flight + spotlight. The literal `#group=`/`#area=` URL grammar is the reimagined form the roadmap specified.
- **B10 (in-panel Settings modal)** — already a FULL multi-section modal `_openSettings`@7991 (cmd "Plexus: Settings"@7344):
  General / Canvas-behavior / Pen-Stylus / Interaction / … with toggle/color/range/select/text/action controls, persisted.
- **Tier-B reality check:** of B3–B10, only **B1+B2 needed real builds** (shipped v1.110/v1.111); B4/B5/B7/B9/B10 were
  already shipped, B6/B8 are platform-blocked, B3 is low-value. The deferred-audit over-scoped the Tier-B polish list against
  a mature plugin. The only plausibly-genuine remaining builds: **B16 export fidelity (grid/snap decouple + SVG hachure +
  arrowhead-none memory)** and **B18 dead-code cleanup**; B11 IndexedDB cache + B13 jspdf PDF are lower-value perf/format;
  B12/B14/B17/B19 are low-value/partial. No code change for B9/B10.
- Next (worklist B11): IndexedDB LocalCache (audit-first; lower-value perf — likely defer unless a clean small win).

## ℹ️ B7 audit-resolved + B8 platform-blocked, NO SHIP (Tier-B loop, items 13–14/26) (2026-06-24)
**B7 (auto-export banner keep-in-sync + light/dark variants) — AUDIT-RESOLVED.** Banner keep-in-sync already ships:
`_scheduleBannerText`@7175 (debounced OFF the durable-save hot path) → `_writeBannerTextInline`@1692 → `exportPng(scene)` →
`setBannerFromBlob`, fired on every save@7170 (toggle: `bannerPreview` setting). `exportPng` fills the bg with the canvas's
actual `viewBackgroundColor`, so the banner already MATCHES the user's canvas → a separate light/dark variant is moot for
Thymer's single banner slot. Blob is record-owned (no orphan body siblings). Optional Scene-SVG-in-sync = low-value (no
consumer). No code change.
**B8 (render drawing inline in notes) — PROBED → PLATFORM-BLOCKED.** "A post-render hook swaps a drawing-ref for its banner
inline in a note" needs a Thymer markdown/inline-render API. Probe: NONE exists — plugin.js has no such hook and the SDK
(`thymer-types.d.ts`) exposes no `MarkdownPostProcessor`/`registerMarkdown`/`renderMarkdown`/`inlineRender`/`decorateLine`/
`registerRenderer`. Same class as the C-tier editor-API gaps → deferred to the Thymer backlog (consolidate into the C1
editor-API feature request). No code change.
- **Streak note:** B3–B8 were six consecutive no-ships (3 audit-resolved, 3 deferred) — the worklist's back third is mostly
  already-covered / not-parity / platform-blocked. The GENUINE remaining builds: B9 deep-link anchors · B10 Settings modal ·
  B11 IndexedDB cache · B13 jspdf PDF · B14 connector ergonomics · B16 export fidelity · B18 dead-code. Next: B9 (real build).

## ⏭ B6 — PROBED → DEFERRED-pending-hands-on-session, NO SHIP: restored-panel auto-reopen (Tier-B loop, item 12/26) (2026-06-24)
The most-felt papercut (a Plexus panel saved in the layout reopens BLANK on reload — the drawing guid lives in an in-memory
pending queue, lost on reload, not the panel's persisted nav state). **SDK probe (types.d.ts):** `navigateTo` DOES accept
`{type, rootId, subId, workspaceGuid, state?}` (2736) + `getNavigation()` (2694); prior evidence: the Plugins-Manager panel's
saved nav is `type:"custom", subId:"<ws>-<plugin>-<panelid>"` → custom-panel nav persists. So it's **likely buildable, NOT
platform-blocked.**
- **Why deferred from autopilot:** the fix swaps the CORE panel-mount call (`navigateToCustomType(PANEL_ID)`@7615 →
  `navigateTo({type:'custom'?, subId: PANEL_ID+':'+guid, state:{recordGuid}})` + read it in `_mountPanel`@8075 as a fallback
  before the pending queue). `navigateToCustomType` takes NO subId, and `navigateTo`'s documented `type`s are only
  editor/overview — so the exact custom-type-with-subId shape is undocumented; a wrong `type` value would break ALL
  canvas-panel mounting, and the reload-round-trip must be hands-on chrome-devtools-verified (navigate → reload → inspect
  getNavigation). Not safely autopilot-shippable.
- Logged to the Thymer backlog with a ~20-min hands-on recipe (the read side in `_mountPanel` is additive/zero-risk; only the
  write swap needs the live probe). No code change, no version bump.
- Next (worklist B7): auto-export banner keep-in-sync + light/dark variants (audit-first — banner export may already run on save).

## ℹ️ B5 — gallery AUDIT-RESOLVED + companion-plugin DEFERRED, NO SHIP (Tier-B loop, item 11/26) (2026-06-24)
Worklist B5 ("companion Drawings CollectionPlugin declaring Scene/Assets fields + gallery view"). The **gallery already
ships** — `GALLERY_PANEL_ID='plexus-gallery'`, `registerCustomPanelType`@7248, `_openGallery`/`_mountGallery`@8090 (grid of
all drawings' banner thumbnails, click to open), command "Plexus: Gallery (all drawings)"@7277 (verified v0.26.0 `galleryTest`).
- The **companion CollectionPlugin** half is deferred to the Thymer backlog: it's a SEPARATE plugin artifact (Canvas is a
  `global_plugin`, this would be a `collection_plugin` declaring Scene/Assets/Scene Rev/Scene Schema/Source Note in its
  config.fields); its only value is one-time setup hardening (auto-create the props on a fresh install) but those props
  ALREADY exist on the live workspace via MCP; and declaring the same fields over existing properties on the LIVE drawings
  collection carries conflict/duplication risk that only resolves on install → must be built + tested against a TEST
  collection first, a deliberate user-gated task, not loop-autopilot. No code change, no version bump.
- **Run note:** B3/B4/B5 were consecutive no-ships — expected, the worklist (from the deferred-audit) over-scoped a few
  late items; the plugin is mature so several "polish" items are already covered or low-value. Genuine builds still ahead in
  Tier B: B9 deep-link anchors · B10 in-panel Settings modal · B11 IndexedDB cache · B13 jspdf PDF · B14 connector ergonomics
  · B16 export fidelity (SVG hatch + grid/snap decouple) · B18 dead-code cleanup.
- Next (worklist B6): restored-panel auto-reopen (PROBE-gated — known platform-limited issue; probe first, defer if blocked).

## ℹ️ B4 — AUDIT-RESOLVED + residuals DEFERRED, NO SHIP: frame settings already ship (Tier-B loop, item 10/26) (2026-06-24)
Worklist B4 ("frame settings dialog + clip-on-render + marker frames"). Audit of plugin.js: the useful frame settings are
already shipped — **name** render (`_drawFrame`@5163, default "Section"), **rename** (double-click a frame → "Section name:"
prompt → sets `el.name`@3568), **color** (select + the colour flyout → `strokeColor`), **collapse/expand** (command@7342 +
the ▸ arrow + `secHidden` child-hiding), **move-as-unit** (`_frameChildren` drag), **slide-ordering** (frames→slides). So a
"settings dialog" would just consolidate already-working options (and overlaps B10's in-panel Settings modal).
- Residuals deferred to the Thymer backlog: **clip-on-render** (children cropped to frame bounds) is roadmap-deferred as
  "render-loop-invasive for modest visual gain" — the flat paint order would need a per-element clip-to-owning-frame check in
  the render hot path; revisit as an OPT-IN per-frame toggle if wanted. **Marker frames** (`frameRole:'marker'`) are niche.
- No code change, no version bump. Next (worklist B5): companion Drawings CollectionPlugin (declare Scene/Assets fields) + gallery view.

## ⏭ B3 — DEFERRED to backlog (low-value, NO SHIP): layer-manager panel (Tier-B loop, item 9/26) (2026-06-24)
Worklist B3 ("layer-manager panel: named layers show/hide/lock/reorder") deferred, not built. Audit of plugin.js: no
`el.layer`/`el.locked` exist, BUT a named-layer panel is **not Excalidraw parity** (Excalidraw has no layers — it uses
frames + z-order), is roadmap-deprioritized **P2** ("group+frame cover 80%"), and organization is already well-served by
frames (named, collapsible via `secHidden`), groups, and z-order. The one genuinely-useful Excalidraw-parity atom is
per-element **lock** — but to be usable it needs a locked-indicator + click-to-unlock affordance + gating of every selection
path (`_hitTopAt`, `_selectAll`, `_elsInLoop`), i.e. UI+pointer cost approaching the panel itself, unjustified for an
audit-rated low-marginal-value item the user hasn't specifically requested. **Logged to the Thymer backlog** (project page
`1ZD714PF7526KQTYQGRN3RK3MH`); revisit element-lock if specifically wanted. No code change, no version bump.
- Next (worklist B4): frame settings dialog + clip-on-render + marker frames.

## ✅ v1.111.0 — B2: 7 PEN PROFILES (highlighter/marker/fine-tip/fountain/thick-thin/…) (Tier-B loop, ship 6/26) (2026-06-24)
The pen had ONE freehand profile; now 7 (default · highlighter · finetip · fountain · marker · thickthin · thinthickthin).
- **`PXC_PEN_PROFILES`** table: each profile shapes the per-point radius (`fat`=slow fatten · `thin`=speed thinning ·
  `taper`=tip entry/exit · `swell`=position-based middle bulge) + a base width + opacity. `freedrawRadii(pts, baseW,
  profileId)` is now profile-driven; **`default` is BYTE-IDENTICAL to the pre-B2 ink look** (Node-verified bit-exact across
  200 widths × 1001 speeds). Width+opacity are baked onto the element at create (so render/export/resize work unchanged);
  a new `el.penProfile` field drives only the radius SHAPE (null = default → every existing stroke is unchanged).
- **`_pickPenProfile`** + command "Plexus: Pen profile (highlighter / marker / fine-tip …)" sets `this._penProfile`
  (persisted in localStorage, restored in the ctor); the pen tool stamps the active profile's width/opacity/shape onto each
  new stroke. Highlighter = wide + 0.4 opacity + flat caps; marker = bold constant; fine-tip = thin; fountain/thick-thin =
  strong pressure variation; thin-thick-thin = middle swell.
- **Adversarial review: SHIP.** Bit-exact default/null equivalence; the new field clones (`JSON` _cloneEl) + serializes
  harmlessly; PNG/print export full-fidelity, SVG carries width+opacity (variable-width shape lost = pre-existing freedraw→SVG
  limitation); property-panel width/opacity still override post-create; all edge cases (n=1/2/3, bad id, null) guarded. One
  cosmetic NIT (width-button active-highlight doesn't match profile widths — no fix). Node `pxc_penprofiles` 12/12 + regressions green.
- Scope notes (NOT built, deferrable enthusiast extras): custom user-defined pen-button slots; Excalidraw's highlighter-draws-
  behind-content z-order (this draws translucent at normal paint order).
- Next (worklist B3): layer-manager panel.

## ✅ v1.110.0 — B1: INTERACTIVE in-place image crop (Tier-B loop, ship 5/26) (2026-06-24)
The crop tool only did region-REFERENCE (drag a box → spawn a NEW cropped element). New: crop an image IN PLACE.
- Command **"Plexus: Crop selected image (in place)"** → `_startCropInPlace` arms a one-shot `_cropInPlaceTarget` on the
  single selected image; the next crop-marquee drag calls **`_cropInPlace`** which sets that image's own `el.crop` (natural
  px, composes with any existing crop) + resizes its box to the cropped region. Refactored the crop math out of
  `_referenceRegion` into a shared **`_computeCropRect`** (both paths now share the proven, cropTest-covered mapping).
- **Non-destructive** (source `fileId`/bytes never touched — crop is only a `_drawImage` source rect) + **undoable**
  (scheduleSave commits a history snapshot, like every mutation). Re-routes bound arrows via `_updateBindings`.
- **Adversarial review: FIX-FIRST → both fixed.** (HIGH) the one-shot target leaked through `onPtrCancel`
  (pointercancel/lostpointercapture never reaches the crop pointer-up that clears it) → now cleared there too (+ the
  in-flight marquee), so a cancelled in-place crop can't hijack the next region-reference. (MED) the crop math is
  axis-aligned/angle-blind → in-place crop now BLOCKED on a rotated image (toaster) until it's at 0°. Refactor equivalence,
  non-destructiveness, undo, render/export/hit-test, crop-of-crop composition, and all OTHER leak surfaces confirmed clean.
  Node `pxc_cropinplace` 20/20 + regressions green.
- Next (worklist B2): 7 pen profiles.

## ✅ TIER A COMPLETE (7/7) — A7: TEST_HOOKS documented as the release toggle (Tier-A loop, item 7/26) (2026-06-24)
The `TEST_HOOKS` gate already existed (`const TEST_HOOKS = true`@270 + the single `if (TEST_HOOKS) this._installTestHooks()`
gate@7329 — the worklist's "gate behind a build flag" was already satisfied). Made it **self-documenting as the release
toggle**: a clear comment that flipping the one flag to `false` strips the entire `window.__plexusCanvas.test.*` debug
surface, and that it's kept `true` during active development because the live chrome-devtools verification path (and this
build loop) drives those hooks. **Comment-only — zero behavior change, no version bump.** Heavyweight adversarial review
skipped by judgment (nothing to find: no scene/render/select/export/write/logic surface; `node --check` + a 3-assertion gate
test are the relevant gates, both green).

— **TIER A DONE (7/7):** A1 live-cards-in-export (v1.106) · A2 concurrency rev-check (v1.107) · A3 AI-edit-on-externalized
(v1.108) · A4 palette-inheritance (audit-resolved, already covered) · A5 backlinks list (v1.109) · A6 elbow/orthogonal
arrows (audit-resolved, already shipped) · A7 TEST_HOOKS release-toggle doc (this). **4 code ships + 3 audit-resolved.**
NEXT: Tier B (19 polish items, B1 first — interactive image-crop handles).

## ℹ️ A6 — AUDIT-RESOLVED, NO SHIP: elbow/orthogonal arrows already shipped (Tier-A loop, item 6/26) (2026-06-24)
Worklist A6 ("elbow / orthogonal arrows — right-angle connector routing") is ALREADY shipped + fully wired (the worklist
even self-noted the audit mis-tagged it under later-AI). Grep-audit of plugin.js:
- **`routedPoints(el)`@912** routes a 2-pt connector as an orthogonal right-angle 4-pt path (H-V-H or V-H-V by dominant axis).
- Toggle UI: **`_toggleElbow`@1977** + **`_setConnRouting('elbow')`@1980** (straight | elbow | curved, mutually exclusive);
  the connector style flyout has a **"⌐ Elbow (right-angle)"** button@2290; command **"Plexus: Toggle elbow arrow"**@7209.
- Fully integrated: render@938, hit-test@1248, **SVG export honours the routed path**@1452, `_updateBindings` re-routes
  bound elbow arrows, and diagram generators use it (`arr.elbowed=true`@5900).
- Right-angle routing is complete; obstacle-avoidance routing (Excalidraw's bound-shape avoidance) is a separate, more
  advanced feature — NOT this worklist item. **No code change, no version bump.**
- Next (worklist A7): TEST_HOOKS strip (gate the debug hooks behind a build flag).

## ✅ v1.109.0 — A5: BACKLINKS list — "what references this" (Tier-A loop, ship 4/26) (2026-06-24)
The live ref/card model already produces backref data (used by the CS-4 graph pull-in + ghost-edges), but there was no
LIST surface to answer "which records reference this drawing." New read-only command **"Plexus: Backlinks (what references
this)"** → `_showBacklinks()`.
- Resolves the target (a selected record card's record, else `this.hostGuid || this.recordGuid`), reads `getBackReferences()`,
  dedups by referencing record (skips self/nulls/dupes), and shows a clickable `_pickFromList` picker → `_openRecord` opens
  the chosen one in a side panel. Reuses the proven `getBackReferences` shape (`br.record`), `_pickFromList`, `_openRecord`.
- **Read-only**: no record/line writes, no scene mutation, no render/select/export/minimap surface — just a transient DOM
  picker + a side-panel open. Every async (getRecord/getBackReferences/getName) is try/caught → toaster/empty-list, no throw.
- **Adversarial review: SHIP** — all 8 axes confirmed against live source (no writes, target-resolution admits no
  undefined-guid leak, getBackReferences/`getName`/`_pickFromList`/`_openRecord` contracts correct, `ti-affiliate` bundled,
  no uncaught throw). Zero HIGH/MED/LOW. Node `pxc_backlinks` 15/15 + regressions green.
- Next (worklist A6): elbow / orthogonal arrows.

## ℹ️ A4 — AUDIT-RESOLVED, NO SHIP: palette inheritance already covered (reimagined) (Tier-A loop, item 4/26) (2026-06-24)
The worklist's A4 ("templates clone the full `appState.colorPalette` on New-from-template") was based on an audit
mischaracterization. Grep-audit of plugin.js: there is **NO `appState.colorPalette`/`topPicks` field** and **NO
drawing-template-clone** feature (`_applyTemplate`@4344 is the EDIT-3 *text* Templater feature; `_newDrawing`@7445 makes a
blank "Untitled drawing"). So the premise ("clone-on-new silently drops the palette") has nothing to apply to.
- The real user value — your colours carry across drawings — is ALREADY shipped + wired two ways, both inherited by every
  new drawing: (1) the localStorage **`recentColors`** shared palette (`pushRecentColor`@5841 on every apply → a "Recent
  (across drawings)" swatch row@5857 in the picker, explicitly the "inherited palette"); (2) the user-configurable **toolbar
  palette** (`c.palette`@352, per-user, persisted across drawings).
- Building a literal Excalidraw `colorPalette`-clone would require FIRST inventing a per-drawing palette object AND a
  drawing-template-clone system — exactly the "invent a low-value feature" trap the loop forbids; the roadmap itself frames
  most appState fields as "reimagine," and this one already is. **No code change, no version bump.** Checked off as covered.
- Next (worklist A5): backlinks panel ("drawings referencing this record" via getBackReferenceRecords()).

## ✅ v1.108.0 — A3: AI image-edit works on EXTERNALIZED (blob-backed) images (Tier-A loop, ship 3/26) (2026-06-24)
`_aiEditImage` previously BAILED ("isn't supported for externalized images yet") whenever the selected image was
externalized — it read `file.dataURL`, but a blob-backed image stores only `file.blobGuid`. So AI-edit silently failed on
exactly the large images users externalize.
- **Fix**: resolve the source to a PNG dataURL before the existing OpenAI-edits pipeline — INLINE images use `file.dataURL`
  directly (byte-for-byte unchanged); EXTERNALIZED images `_assetGet(file)` → `Image` → `canvas.toDataURL('image/png')` (the
  proven `_sceneWithInlineImages` resolve-and-revoke pattern). Resolution runs AFTER prompt+key (no download on cancel) and
  the objectURL is revoked exactly once (after draw, safe on load-failure). Entry guard widened to allow blobGuid-only
  images, backstopped by a post-resolve `if (!dataURL) return`.
- **Data-safety**: read-only resolution; the edit result is still INSERTED as a NEW image beside the source (`_addImageFromFile`
  at offset coords) — the source element/blob is never overwritten or deleted. No render/select/export/minimap surface.
- **Adversarial review: SHIP** — all 7 axes confirmed (inline no-regression, single-revoke + no use-after-revoke, guard
  backstop, async ordering reads the local `dataURL` not stale `file.dataURL`, missing-blob/decode-failure bail cleanly).
  Two pre-existing NITs (canvas-taint already-safe via same-origin objectURL; skips the decode-cache — fine on a rare
  network-bound op). Node `pxc_aiedit` 10/10 + regressions green.
- Next (worklist A4): templates clone the full appState.colorPalette.

## ✅ v1.107.0 — A2: CONCURRENCY REV-CHECK — detect + back up a multi-device overwrite (Tier-A loop, ship 2/26) (2026-06-24)
A single user on multiple devices (or a reopened stale tab) could SILENTLY clobber a newer remote save (last-write-wins, no
detection = data loss). Now `saveScene` detects it and preserves both versions.
- **`view._sceneRev`** captured on load (`loadOrInit`) + after every write (chunked + single-blob, in lockstep with the
  `Scene Rev` property). At the TOP of `saveScene` (before any overwrite), if the record's current `Scene Rev` > our
  last-known → a concurrent device wrote after we loaded → **`_backupConflictScene`** copies the about-to-be-overwritten
  REMOTE scene to a NEW `plexus-scene-conflict-r<rev>-<ts>.json` `file` LINE on the **backing Drawings record** (append-only:
  never deletes/overwrites the live Scene, any line, or the user's note body), a toaster warns, and we STILL save
  (last-write-wins for the active editor's continuity — but the other version is preserved, not lost).
- **Data-safety**: backup is best-effort + fully try/caught → NEVER blocks the user's own save; conflict branch only fires
  when `Scene Rev` exists AND `view._sceneRev != null` (no false-positive on fresh/first/view-less saves); single-flight
  `saveNow` guard serializes saves so the rev read/compare/write can't race. Backup lands on the backing record only (the
  one host-record window has no `Scene Rev` prop → branch skipped).
- **Adversarial review: SHIP, all 7 data-safety axes confirmed clean.** Applied the one MED hardening: `Scene Rev` is now
  STRICTLY MONOTONIC across modes (`max(curSceneRev, manifestRev)+1`, not the manifest rev) so a chunked↔single-blob switch
  can't run the counter backwards → closes the only (false-NEGATIVE, never destructive) gap. Softened the toaster wording
  (NIT). Node `pxc_revcheck` 27/27 + regressions green.
- Known best-effort limits (acknowledged, not blocking): chunked-mode backup uses the coarse Scene checkpoint (≤4 saves
  behind); repeated genuine concurrent bumps stack append-only conflict lines (no cap — self-limits in the common case).
- Next (worklist A3): AI image-edit on externalized (blob-backed) images.

## ✅ v1.106.0 — A1: LIVE CARDS in PNG/SVG/print/cite export (Tier-A loop, ship 1/26) (2026-06-24)
TIER-A/B build loop (worklist: `~/plexus-canvas/TIER-AB-WORKLIST.md`; Tier C+D logged as backlog on the Thymer
"Plexus Canvas" project page `1ZD714PF7526KQTYQGRN3RK3MH`). Record/query/linecard/rollup/table/board/task cards were
SKIPPED by every export path (`_renderRegionPng` had an empty card branch; `exportPng` + `exportSvg` only knew the free
`drawElement`) → PNG/print/copy/cite/SVG exported BLANK where cards are. Now they render.
- **`PXC_CARD_TYPES`** (shared set) + **`_drawCardEl(ctx,el)`** (view-method dispatch, the SAME world-space draw the
  on-screen painter uses). `_renderRegionPng` (PNG region / print-to-PDF / cite / board-embed) now draws cards via
  `_drawCardEl`; gained an **`onlyId`** filter for pure single-card rasters. `exportPng` (PNG file + copy-as-PNG) takes a
  `drawCard` callback; `exportSvg` takes a `cardImg` map and emits a per-card `<image>` at the card's **rotated AABB**
  (rotation + el.opacity baked into the raster → no rot transform, no opacity attr). Export-mode glow is
  camera-independent (`this._exporting` → fixed 6px, not `12·zoom·dpr`), so halos don't balloon with the live zoom.
- **Render-only** (no record/line writes, no scene mutation, no new element type, no select/lasso/minimap surface). All
  4 other `exportPng`/`exportSvg` callers (banner preview, slides, AI-vision, test hooks) pass no callback → cards
  degrade gracefully (skipped, no throw) — verified by grep.
- **Adversarial review: 2 MED (SVG-only) + 1 LOW, ALL FIXED** — (1) card `<image>` double-applied opacity (raster already
  bakes globalAlpha=el.opacity) → dropped the attr; (2) a single-card raster filled an opaque AABB bg that occluded
  elements behind a ROTATED card → bg fill now gated on `!onlyId` (transparent outside the card pixels); (3) made the two
  PNG exporters save/restore `_exporting` for full re-entrancy. Flag-lifecycle / rotated-placement / cold-cache /
  no-double-draw / frame-exclusion all verified clean. Node `pxc_cardexport` 40/40 + regressions green.
- Next (worklist A2): concurrency rev-check (re-read Scene Rev before overwrite).

## ⏸ PARITY LOOP iter 7 — AUDIT-ONLY: parity effectively reached, loop PAUSED (no ship) (2026-06-24)
Per the loop's own exit rule ("if the next several roadmap basics are ALL already shipped, say so and pause
rather than invent low-value features"). Grep-audited every basic the loop named against plugin.js — ALL present:
- **Basics shipped:** laser pointer (S6 `_laser`), eraser, frame/section + **frame→slide ordering**
  (`_slideFrames`/`_gotoSlide`/present-mode stepping), image **crop** (`_referenceRegion`/`crop`), **align &
  distribute** (`_align` incl. disth/distv), **stats panel** (`_selectionStats`), **eyedropper** (`_eyedropper`),
  **per-element external link** (`el.link`+`window.open`), **format painter** (`_copyStyles`/`_pasteStyles`),
  relationship presets (`PXC_REL_PRESETS`), **SVG import/export** (`importSvg`/`exportSvg`), **drag-drop**
  (img/SVG/PDF), Mermaid/LaTeX/PDF (lazy `loadLib`), templates+palette (`_applyTemplate`), grid/snap, property
  panel, in-canvas search, **copy-as-PNG** (`ClipboardItem`), natural dates, HEIC, inline-editable properties.
- **Elevation shipped:** E1 live cards · E2 query nodes · E3 outline⇄canvas (bidirectional v1.105) · E5
  drag-to-restructure (v1.104) · E6 AI-diagram · E7/E8 (covered: query nodes + present + live cards) · E9
  semantic + relational ghost-edges (v1.103) · E10 multi-canvas board embed · E11 property encoding
  (Status→border, Priority→scale, Due→urgency) · E13 gallery + drawing-in-drawing · E14 timeline/Gantt re-date.
- **Graph/mind-map family (v1.100–v1.105):** neighbour expansion · ⊕ nub · force-directed layout · ghost-edges
  · drag-to-restructure · mind-map→note export.
- **ONLY residuals = platform-blocked / deferred-by-design / cross-plugin** (NOT loop-buildable basics):
  copy-as-SVG-to-clipboard (browsers reject `image/svg+xml` in ClipboardItem; file export works), Day-View DROP
  UI (cross-plugin — re-date-in-place itself is done), opentype.js/CJK + full PDF export (deliberately lazy /
  later, Scope #5), event-journal time-travel (E7 fidelity, later), AI mask-inpaint over image (E6, behind consent).
- **Decision: PAUSED the self-paced loop** (no ScheduleWakeup re-arm). Resume only on an explicit user-picked
  deferred item; do not invent low-value work.

## ✅ v1.105.0 — OUTLINE⇄CANVAS reverse: mind map → note (export outline) (2026-06-24)
PARITY LOOP iter 6. The missing reverse of `_mmFromNote` (note→canvas): "Mind map → note (export outline)" turns a canvas
mind-map into a NEW Thymer note whose nested outline mirrors the tree.
- **`_mindMapToNote(node)`** — resolves the map root (`node.mmRoot`); DFS-flattens (`_mmNodes` + `mmParent`, seen-set guarded)
  to `[{text,depth}]`; prompts for a collection; `col.createRecord(rootText)` → the TITLE; APPENDS nested line items (depth-1 →
  record top-level, deeper → under `lastAt[d-1]`, the depth stack pruned so a sibling after a deep branch re-parents correctly);
  drops a live linked record card below the map. **NON-DESTRUCTIVE: a FRESH record only — never edits the source note or any
  existing line** (even when the root carries `refGuid`/`isRef`, that's never a write target). Append-only; failed `createLineItem`
  is caught + the honest `wrote` count reported.
- **Adversarial DATA-SAFETY review: clean, NO defects** (new-record-only/never-touches-existing, append-only + parenting stack,
  guards/edge cases, DFS correctness, visibility, cross-cutting). Applied the optional cycle-guard (seen-Set) so a corrupt
  `mmParent` cycle can't hang. Node `pxc_mm2note` 12/12 + all regressions green.
- OUTLINE⇄CANVAS is now bidirectional (note→canvas `_mmFromNote`/`_outlineToCanvas` + canvas→note `_mindMapToNote`).
- Next: remaining Excalidraw/Obsidian basics on the CANVAS-ROADMAP (audit-before-build — the plugin is mature).

## ✅ v1.104.0 — GRAPH DRAG-TO-RESTRUCTURE: drop a card onto another → write a real ref link (2026-06-24)
PARITY LOOP iter 5 — completes the graph/mind-map family. Drag a record card so its CENTER lands on ANOTHER record card →
the target rings (ROLE_HEX.child) during the drag → on release a CONFIRM menu → writes a REAL relation. User chose the
drop-onto-card→confirm gesture (asked, since it mutates notes; Alt/Shift were taken).
- **Write = APPEND-ONLY + idempotent + confirm-gated** (`_confirmDropLink`): on "Link", `createLineItem` a NEW "→ related: @B"
  line on A's record (the SAME tested `{type:'ref',text:{guid,title}}` shape as `_linkSelectedCards`); skipped if A already
  refs B (full segment scan). B is strictly READ-ONLY (only its guid/title used). On confirm: snap A back to its pre-drag
  origin (`moveEls[0].x0/y0`) so it isn't buried + drop a bound arrow A→B (deduped via `_cardsConnected`). On CANCEL: A stays
  dropped = a normal committed move, NO write, no loss. `createLineItem` failure → honest toaster.
- `_recordCardUnder` (topmost record card under a point, excl. the dragged one) sets `_dropLinkTarget` only for a SINGLE
  record-card drag; cleared on link/fall-through/onPtrCancel. Overlay ring is `ictx`-only (not a scene element).
- **Adversarial DATA-SAFETY review: clean, NO defects on all 6 axes** (append-only/B-read-only/failure-reported, confirm gates
  every write, idempotency, no false writes on normal moves, snap-back+arrow, visibility+async-delete graceful). Node
  `pxc_droplink` 16/16 + all regressions green. Removed one dead local the reviewer flagged.

— **GRAPH / MIND-MAP FAMILY COMPLETE (v1.100–v1.104):** direction-aware neighbour expansion (ExcaliBrain relation-vector) ·
interactive ⊕ expand-on-click · force-directed graph auto-layout (FR) · relational ghost-edges (inferred ref/backref links) ·
drag-to-restructure (drop→write a real ref). All relational (live Thymer refs/backrefs), all adversarially reviewed.
NEXT: outline⇄canvas gaps, then Excalidraw/Obsidian basics on the CANVAS-ROADMAP.

## ✅ v1.103.0 — RELATIONAL GHOST-EDGES: inferred ref/backref links (Obsidian/ExcaliBrain) (2026-06-24)
PARITY LOOP iter 4. "Relational ghost-edges (inferred ref/backref links)" surfaces hidden connections: faint BLUE dashes
between on-canvas record cards that ARE related (a forward ref OR a backref) but are NOT already joined by an explicit bound
connector. EXTENDS the existing semantic-ghost system (didn't duplicate it).
- **`_buildRelationalGhosts()`** (read-only): on-canvas record cards → `guid→firstCardElId`; reads each record's forward `ref`
  segments + `getBackReferences()`; an undirected pair when the related record is ALSO on-canvas (sorted-guid dedup, self-ref
  skipped); EXCLUDES pairs already joined by a bound arrow/line (sorted-elId key set). Sets `_ghostEdges = [{a,b,rel:true}]` +
  `_showGhosts`. `_drawGhosts` now colours `rel` edges blue (`#0ea5e9`), semantic edges stay amber.
- Reuses `_ghostEdges`/`_showGhosts`/`_drawGhosts`/`_byId` — NOT scene elements (drawn via the renderer `ghosts()` hook), so
  zero render/select/export/minimap/lasso surface; non-interactive; no record writes.
- **Adversarial review: clean, no defects on all 6 axes** (read-only, pair-building incl. undirected dedup + on-canvas gate +
  explicit-exclusion key consistency, no semantic regression, shared-`_ghostEdges` full-replace, visibility, edge cases). Node
  `pxc_relghosts` 11/11 + all regressions green.
- Next: graph drag-to-restructure (drag a card onto another → write a real ref link), outline⇄canvas gaps.

## ✅ v1.102.0 — GRAPH AUTO-LAYOUT: force-directed (Fruchterman-Reingold) (2026-06-24)
PARITY LOOP iter 3. "Arrange graph (force-directed layout)" untangles the on-canvas record-card mind-map into an organic
graph (Obsidian/NotebookLM graph-view parity), using the bound CONNECTORS as edges.
- **`pxcGraphLayout(nodes, edges, opts)`** — pure, DETERMINISTIC FR relax (no Math.random): edges attract (d²/K), all pairs
  repel (K²/d, cut >1600px), cooled over `iter` steps, then recenters on the original centroid (graph stays in place).
  Coincident nodes get a deterministic per-index nudge so stacked cards separate.
- **`_layoutGraph()`** — nodes = on-canvas record-card centers (scoped to a ≥2 selection, else all); edges = arrows/lines bound
  between two of those cards (null-safe, skips self-loops/free/foreign-bound); K scales with card size. Reposition-only (x/y),
  bound arrows re-route via `_updateBindings`, grid+cache invalidated, undoable via scheduleSave. Read-only on records. Capped
  at 400 cards (O(iter·N²) freeze guard).
- **Adversarial review: clean — no data-safety/visibility defects** (FR stability/no-NaN/determinism/centroid, edge build
  null-safety, bound re-route, frame-ownership lazy-recompute, selection scoping, reposition-only). Applied both optional
  polish one-liners (N≤400 cap + coincident-node jitter). Node `pxc_graphlayout` 12/12 + all regressions green.
- Next iters: semantic/backlink ghost-edges · graph drag-to-restructure · outline⇄canvas gaps.

## ✅ v1.101.0 — MIND MAP: interactive ⊕ expand-on-click nub (2026-06-24)
PARITY LOOP iter 2. The NotebookLM/Heptabase "click to grow the graph" UX: a single selected RECORD card now shows a ⊕ nub
22 screen-px below it; clicking it runs `_pullInNeighbours` (the v1.100 direction-aware expansion) — so you grow the relational
map node-by-node instead of only via the command palette.
- `_expandNubScreen(card)` = `worldToScreen(card.cx, card.bottom + 22/zoom)` (constant 22px at any zoom), null for non-records.
  Render (overlay, world coords under the z·d transform) + hit-test feed the SAME point → the drawn ⊕ is exactly where the
  click lands. onDown hit-test sits AFTER rotate/resize handles (they win on overlap) + BEFORE body-move; a miss falls through
  (no click theft); `mode=null; return` like the task-checkbox idiom.
- Overlay-only affordance (drawn on `ictx`, save/restore-balanced) — NOT a scene element, so zero render/select/export/minimap/
  lasso surface (verified). Reuses the read-only `_pullInNeighbours` (no record writes).
- **Adversarial review: clean, no defects on all 5 axes** (hit-test ordering/no-theft, overlay state balance + no scene mutation,
  render↔hit-test consistency at any zoom/pan, `_pullInNeighbours` re-entrancy = pre-existing+deduped, scope). Node
  `pxc_expandnub` 16/16 + all regressions green. (Cosmetic-only: the ⊕ uses the unrotated bottom-center — fine since render +
  hit stay aligned and record cards are rarely rotated.)
- Next iters: semantic/backlink ghost-edges · graph auto-layout.

## ✅ v1.100.0 — MIND MAP: direction-aware relational neighbour expansion (ExcaliBrain relation-vector port) (2026-06-24)
PARITY LOOP iter 1 (Heptabase/Excalidraw/ExcaliBrain → full parity). Upgraded `_pullInNeighbours` from a flat grey ring
into a direction-aware relational mind-map, porting ExcaliBrain's relation-vector model (`~/excalidraw-port-research/excalibrain`)
onto Thymer's ref/backref graph.
- Select a record card → **Expand neighbours (relational mind-map)**: forward `ref` segments → **CHILDREN** (lower fan, blue),
  `getBackReferences()` → **PARENTS** (upper fan, amber), a guid in BOTH → **FRIEND** (sides, purple). Cards' `strokeColor` +
  their arrows are coloured by the SAME `ROLE_HEX` the Brain subgraph drop uses; arrows point parent→focus / focus→child /
  focus↔friend (double-headed). Symmetric fan layout (≤162° spread, R=330 from the focus center), de-dups against the focus
  itself + on-canvas cards (re-run only adds new), capped 8/role.
- Fully relational + read-only (getRecord/getBackReferences/getLineItems reads + canvas-only scene elements; NO record writes).
  Reuses makeRecordCard/makeLinear/linearBBox/_updateBindings — no new element type or hittable flag.
- **Adversarial review: clean, no defects** (read-only/data-safety, disjoint classification, layout signs, element
  well-formedness incl. friend double-head via makeLinear's default endArrowhead, binding resolution, edge cases all verified).
  Node `pxc_mindmap` 18/18 + all regressions green.
- Next iters: interactive expand-on-click ⊕ affordance · semantic/backlink ghost-edges · graph auto-layout.

## ✅ v1.99.0 — white card REAL fix + inline-EDITABLE card properties (2026-06-24)
Two follow-ups after the user reported the card was STILL white (only the editor popup went dark).
- **White card — the real root cause (diagnosed live via chrome-devtools):** record/line cards are created with an
  explicit `backgroundColor: '#ffffff'` (makeRecordCard/makeLineCard default), and v1.95's fill `el.backgroundColor || surface`
  HONOURED that default → always white, the dark-surface logic never ran (the dark area the user saw was the force-dark
  backdrop). Fix: both card fills are back to `(el.backgroundColor && !== '#ffffff') ? el.backgroundColor : _cardSurfaceColor(dark)`
  — a DEFAULT white card now FOLLOWS the canvas surface; a user-recoloured (non-white) card is still honoured. (Review
  confirmed no regression: the palette maps a white pick → `transparent`, so the ONLY source of literal `#ffffff` is the
  card default — there's no deliberate-white case to override.)
- **Inline-EDITABLE properties (per the user — seamless inline, Title back):** DOUBLE-CLICK a property row in the card to
  edit it — a `<select>` for choice props (Collection, Type), a text `<input>` for the rest — committed straight to the
  record via `_writeRecProp` (invalidates → live re-render). `Title` is shown again (first editable row). `_drawRecordCard`
  stores per-render `_cardPropRects` (dy rel. to card top, like `_lineRects`); `_cardPropAt` resolves the row under a dblclick;
  the `onDblClick` record branch routes a property → `_editCardProp`, else title→open / body→edit-body. Editor shares
  `_cellInp` with the table editor (open-one-closes-other), Escape aborts with no write.
- **Adversarial review: clean, no defects on all 5 axes** — white-card no-regression (palette→transparent), dblclick routing
  (prop vs title vs body band math reconciled), DOM editor + writeback (choice/date/number/text via `_writeRecProp`, Title
  rename = the same path as the side panel, Escape-no-write), state lifecycle, scope. Node `pxc_transclusion` 32/32
  (incl. hit-test + editor-kind) + `pxc_canvasfix` 28/28 + all regressions green.
- Open knob: inline list capped at 8, empties shown as "—" — can hide empties / cap lower if cards get too tall.

## ✅ v1.98.0 — dark-canvas card match · natural dates in @ · HEIC images · properties v2 (2026-06-24)
Four follow-up fixes from the user's transclusion pass.
- **Card STILL white on a dark canvas** — v1.95 keyed the card off `PXC_DARK` (theme/force-dark), but the user's canvas is
  dark via a dark `scene.appState.viewBackgroundColor` while `PXC_DARK` is FALSE → white card on a dark backdrop. New
  `_canvasBgColor()` (mirrors the render fill) + `_canvasDark()` (luminance of the EFFECTIVE backdrop) + `pxcElevate`; both
  card renderers now `const dark = this._canvasDark()` so surface AND text follow the real backdrop; `_cardSurfaceColor`
  returns the theme card colour if dark, else an elevated backdrop. The inline editor popup follows `_canvasDark()` too
  (review fix — was `PXC_DARK`, a white box on a dark card).
- **Natural dates in the @ picker** — `@today`/`@tomorrow`/`@friday`/`@"Jan 1 2015"`/`@in 3 days` previously only searched
  records. New `pxcParseNaturalDate` (keywords + weekday + `in N days` + `Date()`-parseable; `YYYY-MM-DD` parsed LOCAL to dodge
  a UTC off-by-one). A 📅 date row is unshifted onto the record-mode picker; selecting it splices an inline `{t:'datetime'}`
  run (renders the formatted date via `runDisplay`). Review fix: `normalizeRuns` now preserves `datetime` runs (HIGH — they
  were dropped on the next keystroke, losing the date).
- **HEIC images** — `_normalizeImageForInsert`: when native decode fails AND the file is HEIC/HEIF, lazy-load `heic2any`
  (jsdelivr ESM via the existing `loadLib`, CSP-allowed like mermaid/pdfjs), convert to JPEG, retry. Non-HEIC failures fall
  straight to the (reworded) toaster.
- **Inline properties v2** (per the user: hide redundant Title · show empty fields · style distinctly) — `_recFor` now caches
  ALL editable properties except `Title` (cap 8, incl. empty); `_drawRecordCard` renders a DISTINCT block: a faint divider, an
  aligned label column, empty fields as a muted "—" (schema-visible like the side panel). Height still tracked in `_cardPropsH`
  (open-band + editor offset stay in sync).
- **Adversarial review: clean except 2 defects, BOTH FIXED** (normalizeRuns datetime drop — HIGH; editor popup PXC_DARK —
  low-med). White-card render mirror, existing-case no-regression, date hijack/line-mode, HEIC no-regression all verified.
  Node `pxc_canvasfix` 28/28 + `pxc_transclusion` 24/24 (props v2) + all regressions green. (HEIC decode itself is
  browser-only, not node-testable; the non-HEIC path is provably unaffected.)

## ✅ v1.97.0 — HOT-RELOAD GUARD: clear "reload to continue" instead of a dead canvas after reinstall (2026-06-24)
User report: "this update broke things — the toolbar isn't there and I can't pan." **Diagnosed live via chrome-devtools (NOT a
code regression):** opened the user's EXACT "Mon Jun 22 — canvas" (`1NZE16...`) fresh under v1.96.0 → mounted clean, toolbar
present (27 els), the Ford card + properties rendered, `_cardSurfaceColor` returned `#1b1d24` for dark (the v1.95 fix working;
`_cardSurface` was white = the force-dark-over-light-theme case). Direct `_drawRecordCard` on the real card → ok, no throw.
**Root cause = the classic hot-reload-leak trap (GUARDRAILS):** reinstalling the plugin WHILE a canvas was open runs onLoad →
`_teardown` → the old view's `destroy()` removes its pointer + toolbar listeners, but Thymer does NOT re-mount the open panel,
so the canvas is left dead (no working toolbar, no pan) until a reload. A fresh open/reload always works (proven).
- **Fix:** `_teardown` now replaces each orphaned canvas host (one that still holds a `.pxc-root`) with a clear
  "Plexus Canvas was updated — reload this tab (⌘⇧R) to continue" note instead of a silently-dead UI. A real re-mount
  (`mount()` does `host.innerHTML=''`) or a reload wipes it; harmless on actual page-unload. Only fires on whole-plugin
  teardown (reinstall / `onUnload`), never on a normal single-panel close (that path calls `view.destroy()` directly).
- No enumerate-and-re-mount auto-recover is possible (no `getOpenPanels` in the UI API), so a reload is still required — the
  banner just makes that obvious. node `--check` + key regressions green. (The standing remedy after any reinstall remains:
  hard-reload the web tab to clear leaked instances.)

## ✅ v1.96.0 — TRANSCLUSION FIDELITY pass 2: @ / @@ reference insertion in the card-body editor (2026-06-24)
The 4th ask from the "improving transclusions" pass. Typing `@` (record) / `@@` (line) while editing a record-card body now
inserts an inline ref — previously the card editor was plain-text-only (only standalone canvas TEXT elements + the note
itself supported `@/@@`). **DATA-SAFETY was paramount** (this writes ref segments into the user's real note line items).
- **Focused picker** (reuses `searchByQuery`, NOT the textarea-coupled `_editText` picker): `@`/`@@` → a dropdown of records/
  lines; arrow/Enter/click selects; inserts an inline `contenteditable=false` chip span (`.pxc-cardref`, data-kind/guid/line)
  at the caret (zero-width landing node, stripped on read). `pxcParseRefTrigger` reused; `seq`-guarded async; `closePick` on
  commit/Escape/choose/stale-detect.
- **Writeback** (`pxcWriteCardTree` + new `flattenRowRuns`/`pxcRowRunsToSegments`): a ref-bearing row → proper
  `{type:'ref', text:{guid, title}}` segments (the SAME tested shape as `ceEdgeSegments`/`_linkSelectedCards`/capture-to-note);
  `@` targets the record guid, `@@` the line guid. A guidless ref is dropped (never writes a broken ref); empty runs →
  `[{type:'text',text:''}]` (never `[]`).
- **Rich-line preservation (the critical invariant):** an EXISTING line that originally carried a ref/date/format is ALWAYS
  skipped (`if (rich) richSkipped++` BEFORE the `userSegs`/text branches; `rich` computed from the ORIGINAL `li.segments`) —
  even if the user adds a ref to it (the row was seeded as plain title text, so rewriting would DESTROY the original). Only
  PLAIN lines get a ref write; NEW lines can be created with ref segments. The count-decrease/reorder structural guards are
  untouched (operate on the still-present `parsed[i].text`/`depth`).
- **Adversarial review: clean on all 7 sections — no data-safety defects, no correctness defects, no regressions.** The
  rich-line invariant verified under adversarial tracing (no flattened-row → setSegments path on a rich original). Node
  `pxc_cardref` 18/18 (incl. the full writeback decision table) + all regressions green. Plain-text-only sessions are
  byte-identical to before. (v1 limitation: existing ref lines render as plain title text in the editor, not chips — editing
  them still routes to the record; Enter-splitting a chip degrades the ref to text in the editor only, no source corruption.)

## ✅ v1.95.0 — TRANSCLUSION FIDELITY pass 1: card bg + inline properties + datetime render (2026-06-24)
Three record-card transclusion fixes from the user's "improving transclusions" pass (the GIF: white card on a dark canvas).
- **Card body was WHITE on a dark canvas.** Root cause: `_cardSurface` is captured from the theme's `--cards-bg` REGARDLESS
  of luminance (`_themeDark` :6315), so **force-dark (`settings.darkMode`) over a LIGHT theme** left it light → a white card
  on the `#0f1117` backdrop. Fix: new **`_cardSurfaceColor(dark)`** (luminance-gated — dark→`_cardSurface` only if dark else
  `#1b1d24`; light→only if light else `#fff`). Both `_drawRecordCard`/`_drawLineCard` fills → `el.backgroundColor || this._cardSurfaceColor(dark)`,
  so an explicit bg of ANY value now wins (fixes the old `!== '#ffffff'` quirk that silently ignored a chosen white). The
  inline card-body editor popup is dark-aware too (was a hardcoded white box).
- **Inline PROPERTIES bar** (Heptabase/Thymer record-header parity): `_recFor` caches `entry.props = _recPanelFields(rec)`
  (non-empty, capped 4); `_drawRecordCard` renders a read-only "Label  value" row per property UNDER the title. Height tracked
  in `this._cardPropsH` (Map by el.id) so the dblclick open-band (:3400) + the inline editor `titleH` (:4929) stay in sync; the
  body-line `_lineRects` bands are computed from the post-props `ty` (line-level connection targeting unaffected).
- **Dates rendered BLANK.** `lineTextOf`/`runDisplay` dropped datetime segments (no `.text` string, no `.title` → `''`). New
  **`pxcSegText`** (text → ref title → datetime `formatted` → derive from `d`) + **`pxcFmtThymerDate`** (YYYYMMDD/ISO → human,
  local — no UTC off-by-one; empty `formatted` derives per rule 42). Fixes dates in cards + the card editor; ref/text unchanged;
  a titleless ref still flattens to `''` (preserves the rich-line data-safety signal in `pxcWriteCardTree`).
- **Adversarial review: clean, no defects** (full band-consumer sweep — every line-level reader goes through `_lineRects`, only
  the one fixed-28 dblclick band was updated; `_cardPropsH` lifecycle; `_recPanelFields`-in-IIFE `this`; luminance gate +
  export; datetime edge cases; data-safety/commit-guard unaffected). Node `pxc_transclusion` 24/24 + all regressions green.
- **DEFERRED to pass 2 (next):** `@` / `@@` ref insertion INSIDE the card-body editor — it's a real editor change (the card
  editor is multi-row contentEditable → line-item segments under a strict data-safety contract; the `@/@@` picker is coupled to
  `_editText`'s single textarea + `el.runs`). Needs its own design + review (note-corruption risk via the writeback). `@/@@`
  ALREADY works in standalone canvas TEXT elements (`_editText`).

## ✅ v1.94.0 — FEATURE LOOP: format painter — copy / paste styles (Excalidraw) (2026-06-23)
Backlog D (final item of the resumed run). Lift the VISUAL style off one element and stamp it onto others.
- **`_copyStyles`** stashes a single element's style into `plugin._styleClip` via explicit allowlists: `common`
  (strokeColor/backgroundColor/fillStyle/strokeWidth/roughness/opacity) · `line` (lineStyle/startArrowhead/endArrowhead) ·
  `text` (fontSize/fontFamily/textAlign). Only keys `!== undefined` are picked (a `null` arrowhead IS copied — it correctly
  propagates "no head"; truly-absent keys are omitted so they never clobber a target).
- **`_pasteStyles`** applies `common` to every selected non-frame element, `line` only to arrow/line targets, `text` only to
  text targets, then `scheduleSave()` (undoable). NO geometry/content/identity/bindings ever copied or written — pure style.
- Two command-palette entries (Copy style / Paste style, `ti-palette`).
- **Adversarial review: clean, no defects** — allowlist safety (no geometry/content/binding/identity leak), NO new
  visible/hittable state (only re-writes existing style fields every render/export path reads), type-gating, undo +
  canvas-only data-safety (never writes the embedded Thymer record's properties), all edge cases. Node `pxc_formatpainter`
  16/16 + all regressions green.

— **RESUMED-RUN FEATURE LOOP COMPLETE (v1.90–v1.94, 5 ships):** nested/drill-down target [connection drill v1.90 + cite
breadcrumb v1.91] · curved/multi-point arrows v1.92 · section auto-layout v1.93 · format painter v1.94. Every ship:
node pure-logic test + adversarial code-review (full visibility/hittability sweep) + /usr/bin/git push. Backward-compatible
by construction; no migrations. DEFERRED: nested-target Phase 3 polish (note-chip DOM "in section" prefix; whole-section-vs-
leaf Cite menu) — low value. Open candidates for a future loop: lock element, connector labels-on-curve, per-child drill submenu.

## ✅ v1.93.0 — FEATURE LOOP: section AUTO-LAYOUT — grid / stack / row (Heptabase) (2026-06-23)
Backlog C. Arrange a section's child cards into a clean pack. Relational + non-destructive — repositions x/y only
(translates arrow points too), GROWS the frame to contain the pack so every card stays owned (center-in), undoable
via the snapshot history. The underlying Thymer records are untouched; only canvas positions change.
- **`_layoutSection(mode)`** — uniform-cell pack of `_frameChildren` in reading order (top→bottom, then left→right with
  a row tolerance). `grid` fits columns to the section width; `stack` = 1 column; `row` = 1 row. Skips collapsed-hidden
  children, connectors (they follow their bound endpoints via `_updateBindings`), and nested frames. `<2 cards` / collapsed
  → toaster + no-op. Grows `fr.width/height` to contain (never shrinks).
- **`_targetSectionForLayout`** — a selected frame, the owning section of a selected card (`_ownerSection`), or one frame
  in a multi-selection. Reuses `_align`'s `box`/`moveTo` geometry helpers.
- Three command-palette entries (Arrange section: grid / stack / row).
- **Adversarial review: clean on all 6 axes** — ownership-preservation (the rightmost/bottom card's center clears the
  grown frame because cells = MAX card size), visibility/hittability sweep (reposition-only; grid+cache invalidated;
  bindings re-routed), what-moves (connectors/frames excluded), sort/column math (no div-by-0 / NaN; cols,rows ≥ 1),
  undo/data-safety (pure geometry through scheduleSave; no record writes), target resolver (null-safe). Node
  `pxc_sectlayout` 15/15 + all regressions green.

## ✅ v1.92.0 — FEATURE LOOP: curved + multi-point arrow ROUTING (Excalidraw) (2026-06-23)
Backlog B. Connections already stored an N-point `points[]` + an `elbowed` orthogonal route (`routedPoints`); this adds
the curved render mode + interactive waypoint editing the model already supported but had no UI for.
- **Curved mode** — `el.curved` (peer of `elbowed`, mutually exclusive). `drawLinear` strokes a smooth midpoint-quadratic
  path (`pxcSmoothPath`) THROUGH the points when `curved && pts.length>=3` (clean, not rough — rough+curve is messy;
  respects dash). Endpoints are exact, so arrowheads still anchor on the last/first raw chord (tangent matches).
- **Waypoint editing** on a single selected connection: drag a real point handle; press a **ghost mid-dot** to insert a
  bend and drag it out (clears `elbowed` → custom route); **dblclick** an interior waypoint to delete it (endpoints can't
  be deleted; a 2-pt arrow's dblclick still edits its label). New `editpt` pointer mode. Grabbing an endpoint detaches its
  binding (no snap-back) and re-binds on drop if released on an element (small snap); interior drags leave bindings intact.
- **Routing picker** (／ straight · ⌐ elbow · ∿ curved) added to the connection-style panel via `_setConnRouting`.
- **SVG export** now honours routing (`routedPoints` + a curved `<path>`) — elbow/curved/waypoints export faithfully
  (was a flat 2-pt polyline).
- **Adversarial review: clean on all 6 axes** (visibility/hittability sweep of every scene.elements path — render/hit/
  export/minimap; onDown ordering; binding integrity; insert/delete; mutual-exclusion+persistence; `_editPt` lifecycle).
  Fixed the one low-sev finding: `onPtrCancel` now resets `_editPt` (a mid-drag cancel left a detached endpoint). Node
  `pxc_curvedarrow` 21/21 + all regressions green. Known minor: hit-test uses the raw straight segments, so clicking a
  curved arrow's bulge can miss by a few px (benign).

## ✅ v1.91.0 — NESTED/DRILL-DOWN TARGET Phase 2: cite/reference parity (section breadcrumb) (2026-06-23)
Backlog A, final nested-target phase. A citation made from inside a section now records WHICH section as pure
breadcrumb CONTEXT — symmetric with the connection drill's `sectionId` (v1.90.0). Additive + backward-compatible
by construction: the leaf (`el`/`frac`/`fracPoly`) stays the sole geometry source of truth; `sec` is touched only
by the breadcrumb toaster — it changes NOTHING that's drawn, hit, selected, exported, or minimapped.
- **`_ownerSection(el)`** — inverse of `_drillTarget`: the SMALLEST frame whose bounds contain the element's center
  (most specific when sections nest), or null. Runs at cite time on a visible element (collapsed sections naturally
  don't match — benign).
- **`sec`/`secName` on the clip** (`_copyImageRefToClip`) = the owning section of the PRIMARY target. Threaded into
  the filename codec + the xref entry; `_syncImageRefsForRecord` carries it cross-device automatically.
- **Filename codec** gains an OPTIONAL 9th `~`-segment `S<frameId>` (parts[8]). Old 8-segment filenames parse
  byte-identically (old parsers never read parts[8]); a new no-section encode is byte-identical to the pre-feature
  output. Under the 255-char cap the section breadcrumb STRIPS FIRST (region/el/extra survive — navigation still works).
- **Breadcrumb surfaced** in the cite toaster ("· in 'Section'") and on navigate-back (`_navToCanvasAnchor` resolves
  the section NAME live from `view.scene` by guid — only the id travels in the filename, so it's cross-device-safe).
- **Adversarial review: CLEAN — no correctness or backward-compat defects** (codec compat empirically simulated; strip-
  first ordering; `_ownerSection` null/nest/collapse cases; sec threading; live breadcrumb resolution; data-model-only
  sweep all verified). Node `pxc_refparity` 17/17 + all regressions green.
- **NESTED-TARGET FEATURE DONE (phases 0–2, v1.90–v1.91):** connection drill-into-section + cite/reference breadcrumb,
  unified on one `sectionId`/`sec` context field + shared `_drillTarget`/`_ownerSection`/`_showNestingChoice`.
  DEFERRED (Phase 3 polish, low value): note-chip DOM "in section" prefix (needs cross-device name resolution) +
  whole-section-vs-leaf Cite menu (no target ambiguity in select-then-Cite — the section rides as auto context).

## ✅ v1.90.0 — NESTED/DRILL-DOWN TARGET Phase 0+1: drop an arrow on a section → drill into it (2026-06-23)
Backlog A (design: `NESTED-TARGET-DESIGN.md`). Target a Section as a WHOLE, then drill DEEPER — a card inside,
or a REGION of an image inside — unified on ONE optional `sectionId` CONTEXT field. Additive + backward-compatible
by construction: the flat `elementId` stays the geometry resolution source of truth; `_bindTargetShape` gains NO
new resolver branch; pre-existing flat bindings/refs round-trip byte-identically (no migration, no auto-promote).
- **Model (3 states):** whole section `{elementId:frameId}` (today, unchanged) · child-in-section
  `{sectionId:frameId, elementId:childId}` · region-in-child `{sectionId, elementId:childId, frac/fracPoly}`.
  `sectionId` is pure context (highlight/collapse/breadcrumb), NEVER used in geometry resolution.
- **Helpers:** `_drillTarget(frame,wx,wy)` (topmost child under point via `_gridTopFirst`+`_centerIn`+`hitElement`,
  delegates the leaf-locator to the EXISTING `_bindingFor`, stamps `sectionId`; no child → whole section) ·
  `_elShortName(e)` (record→title, text→snippet, image→'image'). `_showRegionChoice`/`_showRegionLinkChoice`
  generalized onto a shared `_showNestingChoice(label, rows, sx, sy)` (rows `[{txt,on?,fn}]`, capped ≤8 + "more…",
  same `pxc-region-choice` DOM) — the 3 existing menus become thin callers, zero behavior change.
- **Phase 1 — connection drill:** onUp, dropping an arrow on a section WITH visible children opens a menu —
  Whole section · per child (Card/Image/Text · name) · for image/shape children "↳ Region of name" (re-arms the
  existing `_pendingRegionLink` region flow scoped to the child). `_updateBindings` indexes the arrow under
  `byEl[b.sectionId]` too (section highlights when a drilled child is bound).
- **MUST-haves (both verified):** collapse-clamp in `_bindTargetShape` — a child hidden by collapse (`el.secHidden`)
  routes the endpoint to its section title-bar (not the off-screen child); falls through gracefully if the section
  was deleted. Self-loop guard on BOTH the auto-resolved path AND the menu-commit path — a section can't connect to
  a card inside itself (`sbId === sectionId` → refuse the end-bind).
- **Adversarial review: §1–7 clean (refactor identical-output, binding backward-compat, collapse-clamp, sectionId
  index, persistence all solid); fixed §8 (high — region-of-image-child drill dropped `sectionId` at the regionmark
  finalizer; now carried on the pending link + re-stamped) + §9 (medium — self-loop guard bypassed the menu path;
  now re-checked in each child/region row's commit).** Node `pxc_nesting` 23/23 + all regressions green.
- **Next (Phase 2, re-armed loop):** cite/reference parity — `sec?` on cite targets via the SAME `_drillTarget`,
  the `S<frameId>` filename segment (strip-first), breadcrumb through xref/backref; same `_showNestingChoice` on Cite.

## ✅ v1.89.0 — FEATURE LOOP iter 6 (final): arrowhead styles — arrow / triangle / dot / bar (2026-06-23)
Backlog C. The head value (`endArrowhead`/`startArrowhead`) now carries a STYLE, not just truthiness.
- `drawArrowhead(...,style)`: dot (●, filled circle) · bar (│, perpendicular) · triangle (▶, filled) · arrow (open V,
  legacy default). Fills use `ctx.strokeStyle` so the head matches the line color. The renderer passes the head value as
  the style; legacy `'arrow'`/`null` render byte-identically (gate unchanged). `_setConnHeads` PRESERVES the style across
  presence toggles; new `_setConnHeadStyle` + a head-style picker row (▷▶●│) in the connection panel; `_applyRelPreset`
  preserves the style too.
- **Adversarial review: clean, ship.** Fill color correct; no `=== 'arrow'` consumer breaks (all read truthiness);
  persists (single-blob + chunked); PNG renders styles, SVG export draws no head as before (no new regression). Node
  `pxc_arrowhead` 11/11 + all regressions green. Known: style memory is the head value → a full "none" toggle resets to
  the default arrow on re-add (persists across single↔double).

— **FEATURE PORT LOOP COMPLETE (6/6, v1.84–v1.89):** Sections (bind to/from whole · color · collapse) · grid dots/lines ·
cross-hatch fill · arrowhead styles. DEFERRED (awaiting Svyat's decision): section→Thymer-record relation (what it should DO).

## ✅ v1.88.0 — FEATURE LOOP iter 5: cross-hatch element fill (Excalidraw) (2026-06-23)
Backlog B (fills). Added a `cross-hatch` `fillStyle` alongside the existing hachure + solid.
- `hachure()` gained a `cross` param → a perpendicular (down-right) second pass over the down-left set = a true
  cross-hatch. All 7 fill renderers (rect/ellipse/diamond/`_roughFillPoly`/roundrect/cylinder/cloud) pass
  `opts.fillStyle === 'cross-hatch'` via one `replace_all`. A "Cross" button joins the fill picker
  (Solid/Hachure/Cross/None); active-highlight already derives from `el.fillStyle`.
- **Adversarial review: clean, no regressions.** replace_all hit exactly the 7 sites; cross pass is a perpendicular
  mirror with balanced ctx state; hachure/solid/undefined render identically to before; `fillStyle` persists
  (single-blob + chunked); PNG export renders it, SVG export emits solid (same as hachure today — no new regression).
  Pure-visual, no scene.elements/visibility change. Node `pxc_crosshatch` 10/10 + regressions green.
- 5 of up to 6 loop iterations shipped. NEXT (final): backlog C — arrowhead styles (dot/triangle/bar).

## ✅ v1.87.0 — FEATURE LOOP iter 4: background grid styles — dots / lines (Excalidraw) (2026-06-23)
Backlog B. The existing grid already drew DOTS at intersections; added a traditional ruled LINES grid.
- `scene.appState.gridStyle` ('dots' default | 'lines'); `_drawGrid` branches on it (lines = O(cols+rows), even
  cheaper than the dots O(cols×rows) loop). `_gridStyle()`/`_setGridStyle()` helpers; a command "Plexus: Grid style —
  dots / lines" cycles it (and enables the grid if off, so the change shows). Persists via `appState` through both the
  single-blob and chunked `__meta` paths; old scenes default to 'dots' (identical to before).
- **Adversarial review: clean, no regressions** (geometry/save-restore balanced, backward-compat confirmed, perf
  strictly better than the dots loop). Known coupling (pre-existing, not introduced): grid-on also enables grid-snapping
  — picking a style turns snapping on. Pure background render — no scene.elements/visibility change. Node `pxc_gridstyle`
  10/10 + regressions green.
- 4 of up to 6 loop iterations shipped. NEXT loop: cross-hatch/dots element FILLS (rest of B) or backlog C (arrowheads).

## ✅ v1.86.0 — FEATURE LOOP iter 3: Sections collapse / expand (Heptabase) (2026-06-23)
A Section now folds to its title bar, hiding its contents (command "Plexus: Collapse / expand section" on the selected
section; a ▸ marks a collapsed one).
- **Hide via the spatial grid, not scattered skip-sites:** collapse marks each child `secHidden = sectionId`; `_ensureGrid`
  skips those elements (a pre-pass collects collapsed-section ids) — the single index every render + hit-test path flows
  through. Self-healing: a child whose owner is deleted/expanded gets un-hidden on the next grid rebuild. Collapse stashes
  `_fullH` + shrinks to a title bar; children stay OWNED by `secHidden` (not geometry) so move/expand work after the shrink;
  moving a collapsed section drags its hidden children. State (`collapsed`/`_fullH`/`secHidden`) is plain element fields →
  persists through save + chunking (children are chunked, never lost).
- **Adversarial review found the grid was NOT the only path — all fixed:** **SEVERE** Select-All / the render selected-
  force-push (6118) revealed hidden children → gated on `!secHidden` (+ `_selectAll` skips them). **HIGH** lasso/marquee
  (`_elsInLoop`, scans the full scene) selected hidden children → skip added. Cosmetic export/minimap leaks (PNG/SVG/region-
  snapshot/free `sceneBounds`/minimap dots all iterate `scene.elements` directly) → `secHidden` skip for screen/export
  parity. Resize-while-collapsed preserved via `max()` on expand. Delete-a-section → un-hides its cards to their original
  spots (intentional, non-destructive); a bound arrow to a card inside a collapsed section still points to its hidden
  location (v2 could re-route). Node `pxc_collapse` 13/13 + all regressions green.
- 3 of up to 6 loop iterations shipped. Sections feature A is now rich (bind to/from whole · color · collapse). REMAINING:
  section→Thymer-record relation (ASK the user — ambiguous UX). NEXT loop: backlog B (backgrounds/fills) or C (arrowheads).

## ✅ v1.85.0 — FEATURE LOOP iter 2: connect FROM a whole section (bidirectional) (2026-06-23)
Completes iter 1's binding: you could point an arrow AT a section; now you can drag a connection FROM one.
- `_connHover` (the hover that shows connect-nubs) previously excluded frames; now it only excludes arrow/line.
  `_hitTopAt` returns a frame ONLY on its border/title (interior passes through → a card inside still wins), so
  hovering a section's edge shows its edge-nubs (clamped into view for a big section) → drag one → a connection whose
  START binds the WHOLE section (`startBinding={elementId:frameId}`, routed center-to-edge of the frame bbox).
- **Adversarial review: CLEAN, no bugs.** No regression to frame select/move/resize/rename (resize/rotate handle
  checks run before the nub check; nub sits +14px outside the border vs the 6px border tol → no overlap); every
  `_connHover` consumer is type-agnostic. Node `pxc_section` 15/15 + regressions green.
- Sections are now first-class BIDIRECTIONAL connection nodes (to + from the whole section / a card inside / part of
  an image inside). REMAINING for Sections: collapse/expand · section→Thymer-record relation. NEXT loop: those, or
  backlog B (backgrounds/fills) / C (arrowheads).

## ✅ v1.84.0 — FEATURE LOOP iter 1: Sections (Heptabase) — bind an arrow to a WHOLE section (2026-06-23)
First iteration of the Excalidraw/Heptabase feature-port loop. The existing `frame` type (a named boundary that moves
its contents together) becomes a **Section** with the relational win the user asked for.
- **Bindable as a whole section:** `_bindableAt` previously EXCLUDED frames; now a frame binds as a **whole-section
  target** via its BORDER or TITLE band (`hitFrameBorder`), as a FALLBACK — a content element inside always wins (the
  loop `continue`s on the frame, only returns it if no card/shape was hit). So an arrow can target: the whole section
  (border/title) · a card inside · part of an image inside (existing region binding) — all three. `_bindTargetShape`
  already routes a frame target to its bbox; move/delete re-route + unbind verified by review.
- **Section tint:** `_drawFrame` fills `backgroundColor` (0.12 alpha) so a section can carry a color; label/tool/rename
  relabeled Frame→Section.
- **Adversarial review: CLEAN, no changes.** Child-wins z-order guaranteed by `continue`-not-`return`; the hover
  indicator + release bind use the identical `_bindableAt()||_nearestBindable()` so they never disagree for a frame
  (v1: a section binds only via a precise border/title hit, not the forgiving 44px fallback — intentional). Node
  `pxc_section` 10/10 + regressions green.
- NEXT loop items: Sections v2 (collapse, section→Thymer-record relation, connect FROM a section via nubs) · backgrounds
  /fills · nicer arrows.

## ✅ v1.83.0 — SCALE Phase 4: render/memory hardening (bounded VRAM + smooth at scale) (2026-06-23)
The render is already O(visible) (spatial grid cull + hit-test), with an image-decode LRU + objectURL revoke (v1.78),
a frozen drag layer, and static-layer caching. The one real UNBOUNDED-growth leak was the WebGL texture cache (`_tex`
Map, never evicted → VRAM grew with every image ever rendered → crash at thousands of images).
- **WebGL texture LRU eviction:** `_texFor` now LRU-touches (Map insertion order) and evicts the least-recently-used
  textures via `gl.deleteTexture` once over the cap (== the decode cache, ~120) → VRAM bounded; an evicted-but-visible
  texture re-uploads next frame from the still-cached `<img>`.
- **Per-frame texture-upload budget (24/frame):** panning into a dense image region no longer uploads hundreds of
  textures in one frame (a hitch) — the overflow renders progressively over the next frame(s) (`view.dirty`).
- Low data-risk (pure render perf). Known edge: >~120 images simultaneously on-screen may briefly cycle textures
  (extreme density); self-heals next frame. Other Phase-4 items (incremental grid insert, move-gated hit-tests) are
  deferred micro-opts — the grid is already O(visible) for queries and rebuilds lazily once per edit. All tests green.
- **SCALE EFFORT COMPLETE (Phases 1–4 + BD-1):** unlimited images (sharded Assets), unlimited text (200KB mirror),
  unlimited shapes (chunked delta saves), bounded RAM/VRAM — all on backing Plexus Drawings records, data-safety
  adversarially reviewed at every phase.

## ✅ v1.82.0 — SCALE Phase 3b: spatial scene CHUNKING (delta saves → unlimited shapes) (2026-06-23)
The single `Scene` blob is rewritten whole on every save — fine to ~thousands of shapes, slow at tens of thousands. Phase
3b adds spatial chunking so only CHANGED tiles re-upload. Confined by a 5000-element threshold (hysteresis exit <3000) →
small drawings keep the proven single-blob path UNTOUCHED.
- **Partition** by element center into 2000px tiles + a `__meta` tile (appState/files/schema/type). Each tile = a JSON
  blob anchored in the `Chunks` many-file property; the `Manifest` text property maps chunkId→blobGuid + rev. Reads
  resolve a chunk by its global guid (`getBlobFromPropertyFileValue`). z-order preserved via `index` + sort-on-load.
- **Delta save** (`saveSceneChunked`): hash each tile (djb2); reuse the blob if unchanged, else upload. CPU per save ==
  the single-blob path's one full serialize; NETWORK becomes O(changed tiles). DATA-SAFETY: **union-then-prune** the
  Chunks anchor (new blobs anchored BEFORE the Manifest points at them; old pruned only AFTER) + **Manifest written
  LAST** + read-back-confirmed. Any failure → the OLD manifest/chunks stay authoritative; a chunked-save failure
  degrades to a full single-blob write + cleared manifest (manifest-present ⟺ chunked, unambiguous).
- **Load** prefers the Manifest (batched 16-wide downloads); a single missing/unreadable chunk refuses the PARTIAL load
  and falls back to the `Scene` blob (a coarse checkpoint refreshed every 5 chunked saves).
- **Multi-angle adversarial review (workflow: crash-consistency · data-safety · scale): design SOUND + crash-safe for
  the single-save path; one MUST-FIX applied** → **single-flight save guard** (plugin-level, keyed by record GUID):
  overlapping saves (reachable single-client via undo-within-debounce, or two panels on one drawing) could desync
  Manifest vs Chunks → silent loss; now saves serialize + coalesce, and undo/redo (`_restore`) routes through it.
  Should-fixes: checkpoint cadence 25→5, `pxcElCenter` NaN guard, 16-wide load batching. Verified non-issues:
  `scene.type` IS captured, tile-crossing re-saves both tiles, tombstone-drop matches load compaction. Node `pxc_chunk`
  20/20 + all regressions green. Known edge (rare, noted): a steady-state save overlapping a one-time backing migration.

## ✅ v1.81.0 — SCALE Phase 3a: unlimited searchable canvas text (Canvas Text cap 4000→200KB, all element text) (2026-06-23)

## ✅ v1.80.0 — SCALE Phase 2: sharded image-asset anchoring (bounded per-insert, unlimited images) (2026-06-23)
Images anchor to the backing drawing's `Assets` property. A single unbounded many-file property risks O(array) cost per
`addValue`. Phase 2 shards anchoring across `Assets` / `Assets 2` / `Assets 3` / `Assets 4` (all created on Plexus Drawings
via MCP), cap 500/shard → each `addValue` array stays bounded → ~constant per-insert cost regardless of total image count.
- **Write-side only.** Reads resolve a blob by its GLOBAL guid (`getBlobFromPropertyFileValue`) — shard-agnostic, unchanged.
- `pxcPickAssetShard(rec)` → lowest non-full shard, else the last (graceful degradation); `pxcAssetGuidsOn(rec)` → union
  of all shards' guids (read-back). `_assetPut` appends to the active shard + confirms across shards. `_reanchorAssets`
  (which gates the BD-1 migration's host-line deletion) distributes a batch fill-and-roll, then confirms across ALL shards
  — a guid enters the confirmed Set ONLY if physically present in some shard's `files()` (data-safe deletion gate).
- Per-drawing distribution (each canvas is its own backing drawing) + 4×500 = 2000 images/drawing bounded; add more
  `Assets N` props to extend. `Assets 2-4` + `Source Note` hidden from the record panel.
- **Adversarial review: clean, data-safe, ship.** Deletion gate can't be tricked into confirming an unstored guid; router
  math off-by-one-clean; degrades correctly to 1 shard; reads guid-based + untouched. Only a LOW bulk-paste latency note
  (pre-existing shape, optimization not a bug). Node `pxc_shard` 12/12 + `pxc_backing` 22/22 + `pxc_scale_p1` 21/21.

## ✅ v1.79.0 — SCALE BD-1: backing-drawing storage (all canvas data off note bodies, fully relational) (2026-06-22)
Problem: a canvas can open on ANY record. On a non-"Plexus Drawings" record (Journal/Notes) the plugin can't create
properties, so the scene — and (since v1.78) each image — fell back to BODY `file` line-items (`plexus-scene.json`,
`IMG_*.webp`) cluttering the note. The user opened a canvas on the Journal page "Mon Jun 22" and got 6+ image lines in
its body. Approved fix (plan `staged-finding-ritchie.md`): every canvas's data lives in PROPERTIES on a **backing Plexus
Drawings record**; the note holds NOTHING; the backing drawing has a `Source Note` relation back to the note.
- **Split identity:** `this.hostGuid` = the note (navigation / flip-back); `this.rec`/`recordGuid` = the backing drawing
  (ALL storage). Host-is-a-drawing → host IS its own backing (byte-identical to before).
- **`_resolveBackingDrawing`** (top of `loadOrInit`): (a) host is a drawing → self; (b) existing backing via the
  `Source Note` relation (`_scanDrawings` cache → `srcMap`, read via `pxcRelValues` not `linkedRecords()`) → reuse;
  (c) else pending (lazy — created on first content, so empty flipped notes never spawn drawings).
- **`_ensureBackingAndMigrate`/`_createBackingAndMigrate`** (race-guarded by `plugin._backingInflight`): create the
  backing, set `Source Note`=note (record-object write + read-back verify + guid retry), switch storage to the backing,
  save scene → confirm, re-anchor assets, trash the host's canvas body lines. Triggered from `saveNow`,
  `_addImageFromFile`, and a migrate-on-open pass (waits out any in-flight inline migration).
- **`Source Note` (record relation) + the v1.76 `Assets` (many-file) properties added to Plexus Drawings via MCP.**
- **Removed** the body-line asset fallback (Anchor #2); inline-small-webp is the only non-property fallback. `_flipToNote`
  → host note. `flipRecordTest` updated to assert scene-on-backing + clean host body + `Source Note` set.
- **Adversarial data-safety review: no data-loss path; all findings fixed.** **(§1 CRITICAL, pre-fixed)** re-anchor now
  read-back-confirms and host asset lines are trashed ONLY for blobs verified on `backing.Assets` (never lose an image's
  only copy). **(F2)** trash gated on the `Source Note` backref being durable (else keep the note's copy + toast — no
  cross-session duplicate). **(F6)** undo/redo (`_restore`) routes through the backing-ensure so it never writes to the
  host body. **(F1)** scene confirmed by blob IDENTITY (`saved.blobGuid`), not mere presence. **(F4)** `_migrating` is a
  counter (`_migBegin`/`_migEnd`) so overlapping migrations don't clear each other's guard. **(F7)** destroy-guard before
  trash. Node tests: `pxc_backing` 22/22 + `pxc_scale_p1` 21/21.
- The user's "Mon Jun 22" Journal canvas migrates to a backing drawing on open, its body is cleaned, and the drawing
  relates back. **NEXT:** Phase 2 (shard `Assets` 64/shard) · Phase 3 (chunk `Scene` → `Chunks_*`/`Manifest`) · Phase 4
  (render/memory hardening) — all now universal since every canvas is a real Drawings record. Known: one-time camera-key
  reset per migrated note (F5, benign); cross-DEVICE concurrent first-open could still duplicate (out of scope).

## ✅ v1.78.0 — SCALE Phase 1: externalized image assets (unblock saving) + HEIC/any-format support (2026-06-22)
Root problem: images were stored as inline base64 INSIDE the scene JSON; one 23MB pasted PNG made the scene 25MB →
the single `Scene` blob save FAILED. Full validated near-unlimited design in `SCALE-ARCHITECTURE.md` (confirmed by a
3-angle workflow: SDK limits / render / persistence). This is Phase 1 — stop inlining, externalize to blobs.
- **Insert-time transcode** (`_normalizeImageForInsert`): ANY image (HEIC/JPEG/PNG/GIF/AVIF/…) → `createImageBitmap`
  (HEIC feature-detected; `<img>` fallback; toast→convert-to-JPEG if undecodable) → cap longest edge to **1600px**
  (Lean) → `toBlob('image/webp', 0.8)` (jpeg→png fallback chain). ~120–250KB each.
- **Externalize** (`_assetPut` / `_assetGet`): upload as its OWN Thymer blob (stable `guid`); scene stores only
  `{blobGuid,w,h}` — NEVER base64. Anchored to the new **`Assets` MANY file-property** on Plexus Drawings (created via
  MCP; "in properties" per the user), verified via `files()` read-back; falls back to a body `file` line-item (the same
  durable fallback `Scene` uses) for any collection without it. Lazy, cull-gated decode into the existing LRU;
  `_imgCacheGet` gained a `blobGuid` branch; objectURLs revoked on evict/purge.
- **Migrate-on-open** (`_migrateBigInlineAssets`): a legacy scene's big inline images are transcoded + externalized
  600ms after load, then the slim scene saves → **25MB → <1MB, saving works again** (toast on confirmed save).
- **Adversarial data-safety review → fixed:** **(CRITICAL)** migration no longer drops the source dataURL unless the
  blob DURABLY anchored — `_assetPut` now returns `ref.anchored`; insert falls to the inline fallback when not anchored;
  migration KEEPS the fat dataURL otherwise (never deletes the only copy). **(HIGH)** migration/save race — a sync
  `_migrating` flag makes the other scheduled saves (500/700ms) skip + re-arm so a fat snapshot can't re-bloat over the
  slim save; the migration awaits its own save before the success toast. **(MED)** evicted-while-downloading orphan leak
  — `.then` bails + revokes if the cache entry was evicted. **Regressions fixed:** SVG export resolves externalized
  images to dataURL first (`_sceneWithInlineImages`); cite/note-embed snapshot resolves them; extract-to-new-record
  re-anchors the shared blob to the new record (`_reanchorAssets`); AI image-edit shows a toast instead of silent no-op.
- Settings: `imageMaxDim:1600, imageQuality:0.8, imageInlineThreshold:65536`. Node test `pxc_scale_p1` 21/21 (downscale
  math + migration predicate + the anchored data-safety gate). `Assets`/`Scene Rev`/`Scene Schema` hidden from the panel.
- **NEXT:** Phase 2 (shard+cap Assets, C=64) · Phase 3 (chunk shapes + delta save + Manifest) · Phase 4 (render/memory
  hardening). Known Phase-1 gaps: AI image-edit on externalized images; the test-only `exportSvg(v.scene)` hook at 7728.

## ✅ v1.77.2 — record/line card surface matches the whiteboard theme (was a fixed navy) (2026-06-21)
- The canvas record + line cards filled with a hardcoded `#1b1d24` navy in dark mode, which didn't match the board background.
  `_themeDark()` (which already reads the live `--cards-bg`/`--color-bg-900`) now caches that resolved color as
  `this._cardSurface`; `_drawRecordCard`/`_drawLineCard` use it as the default dark-mode fill so cards take the theme's own card
  colour (dark on a dark board, light on a light board). Light mode + export stay `#ffffff` (clean export preserved); an
  explicitly-chosen non-white `backgroundColor` is still respected. Guarded against an unresolved `var(...)` value.

## ✅ v1.77.1 — record panel back BESIDE the card (sit-on-card covered it / blocked typing) (2026-06-21)
- The v1.77.0 sit-on-card positioning overlaid the panel opaquely on top of the record card → the card was unreadable and you
  couldn't type into the body. Per the user's fallback ("if you can have it be inside then just have it on the side again"),
  `_syncRecPanel` now anchors the panel **beside** the card: fixed 300px, default to the RIGHT, flip to the LEFT on overflow,
  clamp into the viewport; top tracks the card's top. The card raster stays fully visible. Syntax-checked; positioning-only.

## ✅ v1.77.0 — record cards: apply a template + Datacore (live card + panel query) (EDIT-3/EDIT-4) (2026-06-21)
- **EDIT-3 — apply a template (minimal Templater re-impl, no seam exists):** the record panel's **Template** button →
  `_applyTemplate` finds the **"Recurring Templates"** collection, lists its records in a `.pxc-modal` picker (`_pickFromList`),
  reads the chosen template's `content`/`variables`/`extends`, collects `{{prompt:LABEL ?? def}}` prompts (`_promptText`), renders
  the substitutions (`_renderTemplateStr`: `{{prompt}}`, `{{date[:fmt]}}`, `{{record.Prop}}`, `{{var.Name}}` — all FUNCTION
  replacers so `$`-patterns in values are literal; `<%* %>` JS blocks are STRIPPED, not executed in v1), then
  `rec.insertFromMarkdown(rendered)` (fallback: line-by-line `createLineItem`). `extends` does a single non-recursive prepend
  (no cycle/self-extend loop). Mirrors the real Templater renderer.
- **EDIT-4 — Datacore (both surfaces the user asked for):**
  - **Live Datacore card:** a `datacore` toolbar tool (`ti-table`) + command "Plexus: New Datacore card" drops a `query` node
    seeded `dc: @task`. Selecting any `dc:` query node mounts a **live, interactive** Datacore view over it via
    `window.__plexusDatacore.mountView(host, {query, format:'table'})` (`_syncDcOverlay`/`_buildDcOverlay`/`_closeDcOverlay`,
    tracked per-frame by `worldToScreen`). Editing the overlay's query input calls `mounted.setQuery(...)` (keeps focus, no
    rebuild) and re-rasters. Single-instance (build closes the prior overlay first); `destroy()` on unmount + teardown — no leak.
  - **Panel Datacore field:** the record panel gets a `dc:` query row → results listed beneath via `__plexusDatacore.queryTable`.
  - **`_queryFor` routing:** a canvas `query` node starting `dc:` now runs through the Datacore engine (`queryTable`); non-dc
    queries are byte-for-byte unchanged. Every `window.__plexusDatacore` access is **guarded** — Datacore absent degrades
    gracefully (never throws); the dc-not-installed path still readies the node (no stuck "Searching…").
- **Panel-sits-on-card (user request, mid-build):** the property panel now positions ON the card's top-left in screen space and
  caps its width to the card's on-screen width (220–360px) instead of floating beside it.
- **Adversarial review (code-reviewer, all 6 sections): CLEAN — no bugs or regressions.** Confirmed: no stale-record write if the
  selection changes while the picker/prompts are open (`rec` captured in the panel closure); `_dcMounted` never double-destroyed;
  record-panel (`type==='record'`) and DC overlay (`type==='query'`) are mutually exclusive. One pre-existing cosmetic note (the
  `(Datacore not installed)` title isn't rendered by `_drawQueryNode` — same dead-title pattern as the pre-existing `(query
  error)`) left as-is; doesn't affect this workspace (Datacore is installed). Node tests: `pxc_p34` 9/9 + all regression suites
  green.

## ✅ v1.76.0 — editable record-card property panel + a "new card" toolbar tool (EDIT-1/EDIT-2) (2026-06-21)
- **EDIT-1 — editable transclusion:** selecting ONE record card now shows a DOM **property panel** beside it (`_syncRecPanel`/
  `_buildRecPanel`, synced each frame, built async, positioned via `worldToScreen` with overflow flip). It lists the record's
  editable typed properties (`_recPanelFields` — skips system Created/Modified/Banner/Icon + Plexus's Scene/Canvas Text; infers
  kind from `p.choices()`/`p.date()`/`p.linkedRecords()`/`p.number()`). Edit a choice (dropdown), text/number/date (input), or the
  title → writes via `p.setChoice(label)` / `p.set(...)` and re-rasters the card. Header: **Open**, **Move…** (a REAL lossless
  move — the live probe found `rec.moveToCollection(guid)` exists, so the card re-homes in-place keeping its GUID + links). All
  SDK calls verified live via the `__pxcView` handle. Node test 13/13.
- **EDIT-2 — new card (Heptabase-style):** a `card` toolbar tool (`ti-id`) + command "Plexus: New record card" → click → creates a
  record in the **default Notes/Captures** collection (`_defaultCollection`: Notes→Captures→Inbox→Drawings), drops a live card,
  and the EDIT-1 panel opens on it (rename, set properties, Move… to any collection). Reuses `col.createRecord`/`getRecordPoll`/
  `_insertRecordCard`. (Phases 3–4 — apply a template + Datacore card/query — are next.)
- **Adversarial review: 3 findings → 2 fixed, 1 not-a-bug.** (1) `_newRecordCardAt` called `this._drawingsCollection()` but that
  lives on the Plugin → `this.plugin._drawingsCollection()` (would have thrown when no Notes/Captures exists). (2) a failed initial
  `getRecord` in `_buildRecPanel` wedged the panel null for that selection → now clears `_recPanelId` so a later frame retries.
  (3) the Title-rename via `prop('Title').set()` was flagged as a possible no-op — **verified live** that a record's name === its
  Title property text and `Title.set` exists, so it genuinely renames.

## ✅ v1.75.0 — cite combine: region-marking tools keep your selection (so region + text cite together) (2026-06-21)
- **Root cause (diagnosed LIVE via the `wrap.__pxcView` handle):** the user's stored reference was a **region-ONLY cite**
  (`extraN: 0` — "this is a test" was only the chip *label*, never a target), so the snapshot had no text and the (pre-v1.74)
  flyback framed the far union. A live re-cite with the text selected proved the rest already works: the union snapshot **renders
  the text** (82% bright pixels in the text area) and the v1.74 flyback **frames the region** (`targetIsRegion: true`).
- **The gap was the cite FLOW dropping the text:** the **lasso**, **pen**, and **crop** region-marking tools all cleared the
  selection on press — so "select the text → mark a region → Cite" lost the text. Fixes: pen + crop no longer clear the selection;
  the **lasso restores the prior selection when it marks an image region** (a Cite intent) while pure select-lassos still replace.
  Now selecting a text and lassoing/penning/cropping a region keeps BOTH → the Cite is a true composite (union snapshot shows the
  region AND the text; the ↗ frames the region). Node test 4/4. (No new flyback change — v1.74 already fixed it.)
## ✅ v1.74.0 — cite ref polish: drop the caption, flyback lands on the region (2026-06-21)
- **Removed the editable text caption** (v1.73 Phase A) — the user found it messy/redundant. The cited text now lives only IN
  the combined union snapshot image (the multi-target `_renderRegionPng` already renders the region + the text together), not as
  a separate note line. `_copyImageRefToClip` no longer builds `clip.captions`; `_pasteImageRef` no longer creates caption lines.
- **FIX: the ↗ flyback landed "far away."** `_flashAnchor` flew to the UNION of all flash items — so a region cited together with
  a far-apart text box zoomed way out, leaving the region tiny in a corner. Now a CITE frames the **PRIMARY** cited target (the
  region / first item) and the extras only pulse; a CONNECTION still frames the whole union (arrow + both ends). One-line, scoped
  by `!isConn && main.bbox`.

## ✅ v1.73.0 — granular cite caption (cited text now shows) + start a connection FROM a region (2026-06-21)
- **Phase A — the cited text now shows in the note.** A composite Cite (image region + a text box) pasted only the image; the
  text content was dropped (only el-id + bbox kept; the ↗ flyback worked but nothing rendered the words). Now `_copyImageRefToClip`
  captures each text target's content (`el.text || flattenRuns(el.runs)`, whitespace-collapsed, deduped, capped 280) into
  `clip.captions`; `_pasteImageRef` creates a **quoted, editable text line per caption right after the pasted image** (a real
  persisted note line — searchable/copyable, no filename round-trip needed). One ↗ still flies back to all targets. [confirmed:
  combined image + editable caption]
- **Phase B/F — start an arrow FROM a region.** The binding model already routes a region on either endpoint; this adds the UI.
  Command **"Plexus: Connect from a region"** → Pen/Box chooser → draw a region (over an image → pins to it; empty space → fixed)
  → it shows **green connect nubs** → drag a nub to a target → an arrow whose **START** is the region (`startBinding =
  {group:{ids:[],regions:[region]}}`). `_armRegionDraw`/`_finishRegionDraw` made nullable-arrow + branch (null → `_pendingSourceRegion`);
  reuses `_regionTargetFromPoly`/`_connNubsFor`/`_groupUnionWorld`/`_polyBBox`/`_regionShapeWorld` and the existing connect-drag
  finalize. Cleared on Esc/tool-switch/undo/destroy. Node tests: caption 7/7, source-region 8/8; all prior suites green.
- **Review (2-dim Workflow + verify): 3 LOW findings, all fixed:** (1) a source-region connect whose END is dragged back onto
  the SAME image made a degenerate self-loop — the guard only checked `group.ids`; now it also checks `group.regions[].elId`.
  (2) the keyboard tool-switch (v/r/o/…) didn't clear `_pendingSourceRegion` → orphan green nubs; now cleared (parity with
  `_userToolSwitch`). (3) a sub-4px tap on a source nub discarded the pending region; now a tiny tap **re-arms** it (via a
  transient `_srcRegion` marker, deleted on commit so it never serializes). Fix node-test 6/6.

## ✅ v1.72.0 — round-5 D: Pen/Lasso "draw a region to link to" (link an arrow to ANY area) (2026-06-21)
- Dropping an arrow's end in the **void** (empty canvas) now opens a 3-button menu (`_showRegionLinkChoice`): **✎ Pen a region**,
  **▢ Box a region**, **⬚ Lasso elements (group)** (the existing element-group flow). Pen/Box arm `_pendingRegionDraw` + force the
  pen/lasso tool; the next stroke/loop is captured (not kept) and binds the arrow's endpoint to the drawn region.
- **Auto-anchor:** `_regionTargetFromPoly` → drawn mostly over an image → image-relative `{elId, frac, fracPoly}` (tracks the
  image — "edge of image"); drawn in empty space → an absolute `{worldPoly:[[x,y]…]}` (a fixed world area). Self-loop guard:
  never anchors to the other endpoint's image.
- A region is a one-region **group** (`{ids:[], regions:[…]}`) so it reuses all group machinery. New free-space `worldPoly`
  branches added across `_groupUnionWorld` (+ `_polyBBox`), `_connFlashExtras` + the flash shape resolver (spotlight the
  polygon on flyback), the `_connGroupTargets` overlay (stroke the polygon), `descEnd`/`_connEndpointDesc` (a single region reads
  "region"), `_updateBindings` byEl (skip — no elId), and `test.dump` (`freeRegions` count).
- Pending clears on Esc / **toolbar+keyboard tool-switch** / undo / pointercancel + the void-drop menu dismisses on an outside
  press. Adversarial review caught 1 bug — `_pendingRegionDraw`/`_pendingGroupLink` leaked on a *toolbar* tool-button click (only
  the keyboard path was guarded) → a later stroke could be hijacked; fixed via a shared `_userToolSwitch` (NOT `_syncToolbar`,
  which `_armRegionDraw` calls). Node test 8/8 (image-vs-free decision, worldPoly union, polyBBox, naming, self-loop fallback).
  All prior suites green; every `.regions` consumer traced — none assumes `elId`.

## ✅ v1.71.0 — FIX: lasso region capture (text + image-edge) + a DOM-discoverable view handle (2026-06-21)
- **Bug (user-reported):** lassoing "this is a test" + an image edge captured the text but **not the image region**. Root cause
  (both Cite `_selectFromLoop` and the group-lasso): the region heuristic compared the lasso's **full bounding box** to the
  image area (`(lassoBbox area) < image*0.92`) — when the lasso also encloses a far element the bbox is huge → no region marked.
- **Fix:** new `_imageRegionFromLasso(poly, lassoBbox, excludeId)` derives the region from the **intersection** of the lasso
  bbox with the image (the part actually over the image), marks a region at 1%–95% coverage, and only builds a freehand
  `fracPoly` when the lasso is **mostly over** the image (else a clean rect — avoids distorting the shape when the lasso spans
  far outside). Both the Cite path and the group-lasso route through it. Node test 6/6 (text+image-edge now marks a region;
  whole-image/barely-overlap/self-loop still return null).
- **Debuggability (Phase 0):** the live `CanvasView` was unreachable from the test hook after a hot-reload leak (`_views` empty).
  Now `wrap.__pxcView = this` on the `.pxc-root` wrap; `_activeView()` falls back to `_domView()` which finds the live view via
  the DOM, **preferring the active panel's** (so `automate` writes never hit a non-focused leaked view). Reviewed clean.

## ✅ v1.70.0 — round-5 B follow-up: "part of the image" — image REGIONS inside a group connection (2026-06-21)
- A group connection target can now mix **whole elements + image sub-REGIONS**: `b.group = { ids:[...], regions:[{elId,
  frac, fracPoly}] }`. The **drop-then-lasso** flow now mirrors Cite — when the lasso covers a sub-area of a large top image
  (< 92% of it), that image is captured as a **region** (frac/fracPoly), not the whole image (keeps the union bbox tight and
  matches the user's "connect to *this is a test* AND **part of** the image" intent).
- New `_groupUnionWorld(group, lookup)` unions member bboxes + region world-rects; `_groupBBoxWorld` delegates to it. Routed
  through `_updateBindings` (tgt + byEl indexes the region image), `_bindTargetShape`, `_connFlashExtras` (frames regions as
  `inImage`), the persistent overlay (outlines region polygons + the hull), and `descEnd`/`_connEndpointDesc` ("group of N"
  counts members + regions; the thumbnail prefers a **cropped** region). `_reindexBackrefs` ignores regions (images aren't
  records). `test.dump` reports `regions`. Node test 6/6 (tight region union, region-only group, cropped thumbnail, self-loop).

## ✅ v1.69.0 — FIX: lasso (Cite + group-connect) silently dropped elements (esp. text) (2026-06-21)
- **Bug (user-reported):** lassoing "this is a test" (white canvas text) captured **nothing** — both the **Cite** tool and the
  round-5 **group-connect** lasso. Not a Phase B regression and **not** a colour issue — the root cause is shared:
  `_selectFromLoop`/`_idsInLoop` queried the **spatial grid**, but a text element's width/height are measured **lazily at
  render** (`measureRuns`) and that does **not** flip `_gridDirty` → the grid holds a stale/zero bbox for the text → it drops
  out of the grid query before the (robust) polygon test ever runs.
- **Fix:** new shared `_elsInLoop(poly, excludeId, skipConnectors)` iterates the **full scene** (a lasso is a one-shot gesture,
  O(n) is fine, and it's immune to a stale grid) and calls `measureRuns()` on each text first so its bbox is current; a cheap
  bbox quick-reject keeps it fast. `_selectFromLoop` (lasso SELECT tool + Cite) and `_idsInLoop` (group-connect) both route
  through it. `skipConnectors` preserves the lasso tool's ability to select arrows/lines while the group-lasso skips connectors.
- Node test: the previously-dropped text is now captured (measured bbox + full-scene scan); off-screen elements still rejected;
  arrow exclusion intact. Existing suites (A/B/B-fixes/C) all green. **Next:** "part of the image" as a region inside a group
  (parity with Cite's image-region) — currently a group lasso captures the whole image.

## ✅ v1.68.0 — round-5 Phase C: typed relationship presets + manual connection styling (Heptabase-style) (2026-06-20)
- Selecting a single connection now shows a **style popover** above it with:
  - **6 typed relationship presets** (`PXC_REL_PRESETS`): relates-to (gray), supports (green), contradicts (red, dashed),
    causes (amber), part-of (blue), example-of (violet, dotted). Applying one sets `el.relType` + the connection **color** +
    **line style** + **arrowheads** + a default **midpoint label** (so the note-side breadcrumb reads e.g. "connection: supports").
  - **line style** — solid / dashed / dotted (`el.lineStyle`); **arrowheads** — none `—` / single `→` / double `↔`;
    a manual **colour strip** (overrides the preset, clears `el.relType`).
- `drawLinear` gained dash support: dashed/dotted render a **clean poly-line** (`setLineDash`) instead of the rough double-pass
  (rough + dash = messy); solid is unchanged. Arrowheads always solid (dash reset before them).
- `_setConnLabelText` reuses the existing midpoint-label mechanism (`midBinding`); `relType`/`lineStyle` are plain JSON-safe
  scalars that round-trip. The popover rebuilds only on selected-connection change (`_connStyleId`); `pointerdown`
  stopPropagation so clicks don't deselect. `test.dump()` reports `relType`/`lineStyle`. Pure-logic node test 9/9.

## ✅ v1.67.0 — round-5 Phase B: arrow → a GROUP / REGION of the canvas (bidirectional) (2026-06-20)
- A connection endpoint can now bind to a **set of elements** — new binding shape `b.group = { ids: [...] }` (no single
  `elementId`). The endpoint routes to the **live union bbox** of the members (`_groupBBoxWorld`), so the group target tracks
  as any member moves/resizes; an all-deleted group frees the binding.
- **Two creation interactions (both directions):**
  - *select-then-connect* (group → anything): a ≥2 multi-selection shows a faint hull + **connect nubs** on its union bbox
    (`_groupSelBBox`/`_groupNubAt`); drag a nub → an arrow bound to the whole group. (group-nub arrow keeps the selection;
    a self-loop guard drops an end that snaps back onto a member.)
  - *drop-then-lasso* (anything → group): drop an arrow end on **empty canvas** → `_pendingGroupLink` armed → the next
    press-drag is a **`grouplasso`** (any tool) → `_idsInLoop(poly)` → `endBinding.group`. A click (no drag) cancels.
- **Surfacing (bidirectional):** `_reindexBackrefs` registers the NOTE/record endpoint with `from: "group of N"` + the first
  image member's **thumbnail**; a group endpoint keys no bogus record backref. `descEnd`/`_connEndpointDesc` read "group of N".
  `_connFlashExtras` frames **every member** on flyback; the persistent overlay outlines each member + a faint hull (cyan).
- Routing: `_bindTargetShape` group branch first (null-safe `el`); `_updateBindings` `tgt()` helper resolves group→union
  (no element lookup) and builds `_connGroupTargets`. `test.dump()` reports `{group:N}` endpoints. Pure-logic node test 10/10.
  **Zero source-note mutation** preserved. Reviewed by a 4-dimension adversarial Workflow (binding-regression / interactions /
  backref-flash / perf-render) with per-finding verification — **14 findings → 5 distinct bugs, all fixed before ship:**
  - **A (HIGH):** `_dragMovers` omitted group-bound arrows (no `elementId`) → the arrow rendered **frozen on the static layer**
    while a member was dragged, snapping only on pointer-up. Now `_dragMovers` also matches a dragged id against `b.group.ids`.
  - **E (MED, perf):** `_groupBBoxWorld` resolved members via O(n) `_byId` every frame → O(members×n). Now takes the
    `_updateBindings` O(1) `lookup`; the render overlay resolves members once and unions those bboxes for the hull.
  - **B (MED):** a group whose **members are record/line cards** keyed no ↗. Now each record/line member gets the backref
    (the `extra` breadcrumb hoisted above the `elementId` guard); a group of plain images stays canvas-only by design.
  - **C (LOW):** drop-then-lasso could enclose the arrow's own start-bound element → self-loop. Now excluded (parity w/ nub-drag).
  - **D (LOW):** `_pendingGroupLink` could strand (Escape / tool-switch / undo / pointercancel) and hijack the next gesture.
    Now cleared in all four. Fix node-test 8/8.

## ✅ v1.66.0 — round-5 Phase A: arrow → a SPECIFIC inline ref of a text note (→ the linked record) (2026-06-20)
- A connection dropped on a text note that carries inline `@`/`@@` refs now offers a **drop chooser** — "Whole box" + one
  button per inline ref (e.g. the screenshot's *Pastabilites* / *pasta*). Picking a ref binds the endpoint to that ref's
  **target record/line** — so the **linked record** (not the text box) gets the ↗ back-reference and the flyback frames the run.
- Binding shape gains `refGuidTarget` (record/line guid) + `refKindTarget`. New `_refRunRectWorld(el, targetGuid)` returns the
  ref run's world rect (from `measureRuns`/`_pxcRunLayout`); degrades to whole-box on a rotated text note (mirrors `_lineRectWorld`).
- Routing: `_bindingFor` sets the fields when the drop lands on a ref run; `_bindTargetShape` routes the endpoint to the run rect
  (branch ordered AFTER lineGuid, BEFORE frac); `_updateBindings` builds `_connRefTargets` (textId → Set(guid)) for the overlay;
  `_reindexBackrefs` keys the backref by `refGuidTarget` (else-if after record/linecard); `_connFlashExtras` + `_bindHoverSub` +
  the persistent overlay all draw a **cyan flag** on the targeted run; `descEnd`/`_connEndpointDesc` name the ref in the breadcrumb.
- Chooser `_showRefChoice` reuses the `.pxc-region-choice` DOM + the `_pendingRegionLink` dismiss (new `refOnly:true` so any
  outside press just closes it — no region-mark drag). Pre-checks (`.pxc-rc-on`) whatever the drop landed on. `test.dump()`
  connections now report `ref`/`refKind`. Pure-logic node test (rect math + reindex keying) 7/7. **Canvas-overlay + synced-index
  only — zero source-note mutation** preserved.

## ✅ v1.65.0 — @ref chip hover preview (round 4) (2026-06-20)
- Hovering a record-ref chip on the canvas (a whole-element ref OR an inline `@`/`@@` ref run) now shows a `.pxc-refpreview`
  popover: the referenced record's **title + first body lines** (via the live `_recFor` cache — uncached shows "Loading…" then
  re-shows once the fetch lands). `pointer-events:none`; hidden on hover-off / drag / destroy. (Image refs deferred — they
  resolve through the separate attachment path.)
- DIAGNOSIS via the live dump (`test.dump`): the "blub" was an ellipse and v1.64's edge-only handles already cleaned the
  selection; the "connection has no thumbnail" was a non-issue — `_regionThumb` resolves the image (602×1306) and returns a
  valid `dataURL(5338)`, so the canvas info card DOES render the thumbnail on the text→image connection (the user was hovering
  a text→card connection, which has no image). No code fix needed for the thumbnail.

## ✅ v1.64.0 — shape selection: drop the empty-corner handles (round 4) (2026-06-20)
- LIVE DUMP confirmed the "blub" is an ELLIPSE (758×464 hachure) and the v1.61 outline DID hug it (Image #50) — the remaining
  "box with empty space" was the **4 bbox CORNER handles** sitting in the empty corners. Fix: for shapes whose outline hugs the
  visual (ellipse/diamond/triangle/parallelogram/hexagon/cloud) draw only the 4 EDGE handles (on the shape) + rotate; corner
  resize still works (hit-test keeps all 8), only the empty-corner dots are hidden. Rect/roundrect/cylinder/cards/images keep all 8.
- `test.dump()` extended with a `thumbTest`: per image-bound connection endpoint, reports whether `_imgFor` resolves a loaded
  image + whether `_regionThumb` produces a data URL — to diagnose the "connection has no thumbnail" report (live dump shows a
  real text→image-region connection with frac, so the thumbnail SHOULD render).
- NEXT (pending the thumbTest dump): fix the connection thumbnail if `_regionThumb` returns NULL; wire the @ref preview.

## ✅ v1.63.0 — `test.dump()` diagnostic hook (round 4) (2026-06-20)
- The CanvasView is not reachable from outside (no DOM expando), so debugging "the blub shape's selection still shows a
  rectangle" / "the connection has no thumbnail" was blind guessing. Added `window.__plexusCanvas.test.dump()` → returns the
  active drawing's `{version, n, types histogram, selected[{type,w,h,angle,fill,fillStyle}], connections[{start,end,arrowheads}], imgFiles}`.
  Read-only, via `_activeView()`. Lets a maintainer read the live scene (e.g. the exact type of a shape whose selection looks wrong).
- NEXT (pending a live dump): finish the shape-hug for whatever type the blub actually is (v1.61 covers ellipse/diamond/tri/
  parallelogram/hexagon/cloud; cylinder/roundrect still fall to the bbox rect); diagnose the missing connection thumbnail;
  wire the @ref preview (record banner / image) into the note-side hover popover.

## ✅ v1.62.0 — note-side rich hover popover for canvas references (round 4) (2026-06-20)
- User: the note-side canvas references + line blue-flags should show the source ("Legendary brand"), direction, and an image
  preview — like the canvas info card — on hover, for records AND lines. Confirmed: all refs, hover popover.
- New `_showBrefHover`/`_hideBrefHover`: hovering a line's blue `↗` flag (`_mkBackrefBadge`) OR a record's "Canvas References"
  row (`_injectCanvasRefSection`) shows a `.plexus-bref-hover` popover with, per entry, a BIG cropped image-region thumbnail +
  the `<source> <dir glyph> <label>` breadcrumb (reuses `_regionThumb` + `_dirGlyph`; multi-ref shows one rich row each).
  Connection refs read like the canvas info card; a plain `@`-ref shows just its name. `pointer-events:none` (never blocks the
  click); hidden on mouseleave / nav-click / teardown.
- NOTE: the rich source/direction/thumbnail is connection data — a plain `@`-ref to a record (e.g. "Pastabilites") still shows
  its name (no connection to describe). Image-region CONNECTIONS get the thumbnail.
- Round 4 (shape outline + note-side hover) COMPLETE.

## ✅ v1.61.0 — shape-hugging selection outline (round 4) (2026-06-20)
- User: a non-rectangular shape's selection box is a rectangle with empty "black" corners around the visual. Confirmed choice:
  the selection OUTLINE should hug the shape; resize handles stay on the bounding box.
- `render()` single-select outline (`:5289`) now draws the shape's own outline: an `ctx.ellipse` for ellipse; the rotated
  `shapePolygon(el)` for diamond/triangle/parallelogram/hexagon/cloud; the bbox rect kept for rectangle/roundrect/cylinder +
  all non-rough types (record/image/etc. — their visual IS the box). Rotation-aware. The 8 resize handles + rotate handle stay
  on the bbox `_handles(el)`. node-tested (diamond/triangle vertices, 90° rotation, the rotate-line anchor coincidence).

## ✅ v1.60.0 — canvas connection UX: ref-bar while editing · info card on hover/select · two-button region choice (round 3, C) (2026-06-20)
Round-3 C (design choices confirmed with the user). All node-tested + adversarially reviewed. Canvas-overlay DOM + scene reads only — zero source-note mutation.
- **C1 clickable ↗ ref-bar:** inline links were hard to click in the flat edit textarea. Editing a text box that carries inline
  refs now shows a `.pxc-refbar` beside the editor — one `↗ <label>` chip per ref; click navigates (`_openCard`) without
  leaving edit mode. Rebuilt on edit (ref added/dissolved), repositioned with the editor, torn down on commit/re-entry.
- **C2 connection info card (direction always + source/thumbnail on hover/select):** arrowheads already encode direction;
  now hovering a connection OR single-selecting it shows a `.pxc-conninfo` card at its midpoint — `<start> <dir glyph> <end>`
  (→ ← ↔ — from the arrowheads) + a cropped thumbnail for an image-region endpoint (`_connEndpointDesc` + `_regionThumb`).
  Managed in the render overlay: built on arrow-change, repositioned each frame, hidden when not hovering/selecting a connection.
- **C3 two-button whole-vs-region prompt:** dropping a connection on an image/shape now shows a `.pxc-region-choice` with
  "Whole <x>" (disarms the region link) and "Pick a region" (arms the marquee), replacing the ambiguous toaster. Cleared on
  every path (buttons, region-mark start/cancel, Esc, tool-switch, undo).
- Connection round-3 (A–D, C1–C3) COMPLETE.

## ✅ v1.59.0 — blub-drag: connect-nub viewport-clamp (round 3, D) (2026-06-20)
- "Dragging a connection FROM the blub (a screen-filling ellipse) doesn't work." Root cause: `_connNubsFor` places the 4
  edge-drag nubs at the bbox edge-midpoints; for a huge element those are far off-screen → `_nubAt` (11px screen hit) never
  matches → the connect drag never starts.
- Fix: clamp each nub into the VISIBLE world rect (inset 28px from each viewport edge). No-op for any nub already on-screen
  (small/normal elements unchanged); a huge element's 4 nubs now sit at the screen edges → reachable → drag-to-connect works.
  `_nubAt`, the overlay, and onDown all consume the same clamped positions. node-tested (9: small unchanged, huge clamps in,
  partial-offscreen clamps only the off-screen nub).
- NEXT: C canvas connection UX (v1.60) — clickable ↗ badge while editing, direction-always + source/thumbnail on hover/select, two-button whole-vs-region.

## ✅ v1.58.0 — backref index self-healing (stale/dup refs) + picker dismiss + F3 thumbnail fix (round 3, A+B) (2026-06-20)
Round-3 feedback (plan `~/.claude/plans/staged-finding-ritchie.md`); root-caused via a 4-way parallel investigation + a live `plexus_backref` dump (one line target carried 3 connector entries, two identical). All node-tested + adversarially reviewed.
- **A1 reindex-on-load:** `_reindexBackrefs` ran ONLY in `saveNow`, so a drawing not re-opened/saved never pruned orphaned connector entries. Now also runs on canvas OPEN → opening a drawing self-heals its sub-map from live elements.
- **A2 per-drawing-replace sync:** `pxcBrefMergeNested` was additive-per-elId (no tombstone) → a remote copy RESURRECTED locally-deleted entries. Rewritten to per-DRAWING last-writer-wins on the whole sub-map (keyed by max entry `t`; every reindex re-stamps now) → deletions propagate cross-device, legit updates still win, concurrent different-drawing edits converge. node-tested.
- **A3 prune-on-failed-nav:** clicking a stale `↗` whose connector no longer exists now prunes that entry (`_brefPruneEntry`) + toasts "no longer exists" instead of a dead flight.
- **A4 display-dedup:** two identical connections to one target collapse to one row (signature `label|from|dir|kind|img`); distinct sources still show.
- **B picker dismiss (Plexus + org-remark):** the outside-close listened for `mousedown` only via `setTimeout(0)`, but Thymer drives `pointerdown` → the first outside click never dismissed. Now listens for `pointerdown`+`mousedown`+`Escape` in capture, attached immediately, guarded by a 1-tick `isOpening` flag; `_closeBrefMenu` tears down all listeners. org-remark got the same `pointerdown` addition (separate repo `Svyk/thymer-org-remark`).
- **F3 thumbnail latent-bug fix:** `_regionThumb` (Plugin) called `this._imgFor` (a CanvasView method → undefined) → always threw → thumbnails never rendered; now resolves the image through a live view's cache.
- NEXT: D blub-drag nub viewport-clamp (v1.59); C canvas connection UX (v1.60).

## ✅ v1.57.0 — drop-to-mark precise region linking (F2) (2026-06-20)
- Connecting to **part of an image or a rough shape** is now obvious + precise. Drag a connection and drop its END on an
  image/shape with no pre-marked region → the element outlines cyan ("mark a region here") and the NEXT drag draws a marquee
  that becomes the connection's `endBinding.frac` (a true sub-region link). Esc / click-away keeps the whole-element link.
- Reuses the crop machinery: a new `regionmark` pointer mode shares the marquee (`_cropRect`, cyan in region-mode); on release
  `_imgRegionFrac(el, rect)` → `arrow.endBinding = {elementId, frac}` → `_updateBindings` routes the endpoint to the region.
  Region support generalized from images to rough shapes (`_bindTargetShape` + the Phase 4 region-highlight overlay) since
  `_imgRegionFrac/World`/`_regionShapeWorld` are bbox-generic.
- State: `_pendingRegionLink = {arrowId, elId, key}`, cleared on mark / press-off-target / Esc / tool-switch; the affordance
  overlay self-clears if the target is deleted. The existing "mark region first, then connect" path still works.
- Scene-element binding only (saved in the drawing's scene blob) — zero source-note mutation. adversarially reviewed.
- Connection round-2 (B1–B4, F1–F3) COMPLETE.

## ✅ v1.56.0 — connection backref dialog: direction breadcrumb (F1) + image-region thumbnail (F3) (2026-06-20)
- The note-side backref dialog ("Canvas References" section + the multi-ref picker + the ↗ tooltip) now reads as a
  **breadcrumb**: `<from>  <dir glyph>  <label>` — e.g. `This brand had promise → connection: Test`. `from` = the connection's
  OTHER endpoint (a card title / body-line snippet / text node / shape / "image"); the glyph encodes arrow direction relative
  to this note (→ in · ← out · ↔ both · · plain line) derived from `startArrowhead`/`endArrowhead`.
- **Image-region thumbnail (F3):** when the other endpoint is an image region, the row shows a small cropped `<img>`
  thumbnail (`_regionThumb` → cropped offscreen-canvas `toDataURL`; same-origin blob so not tainted; try/catch → falls back
  to the word "image"). The image lives in the same drawing, so `_imgFor(fileId)` resolves it.
- **Mechanics:** `_reindexBackrefs` enriches each connection entry with `{from, dir, img}` (via a `descEnd(binding)` closure +
  arrowhead-direction); `_appendBrefContent` renders the breadcrumb; `_dirGlyph`/`_brefText` helpers; the section `sig` now
  includes from/dir/img so it re-renders on change. **CRITICAL fix (adversarial review):** `_setDrawingBackrefs` AND
  `pxcBrefFlatten` rebuilt entries keeping only `{label,kind,t}` — they now carry `from/dir/img` through, or the features
  would have been silently inert. node-tested (F1 derivation 8 cases + the full persistence round-trip).
- Reference-only in the synced index (no pixel data); back-compat (old entries / plain refs render as the bare label).
  Canvas-overlay + synced index ONLY — zero source-note mutation.
- NEXT: F2 drop-to-mark precise region linking (v1.57).

## ✅ v1.55.0 — connection bug-fix pass (dark cards · arrow-shrink · delete-clears-ref · centered label) (2026-06-20)
Round-2 user feedback on the connection system (plan: `~/.claude/plans/staged-finding-ritchie.md`). Four fixes, all node-tested + adversarially reviewed clean (zero source-note mutation):
- **B1 dark-mode card surface:** `_drawRecordCard`/`_drawLineCard` treated the hardcoded default `backgroundColor:'#ffffff'` as user-chosen, so cards stayed white on a dark canvas (Image #35). Now the DEFAULT white follows the theme (`#1b1d24` dark); an explicit non-white bg is still respected.
- **B2 arrow-shrink when connecting from a big shape/image:** the forgiving end-snap (`_nearestBindable`) didn't exclude the START-bound element, so a large source whose bbox swallowed the release point snapped the END back onto the source → both ends collapsed onto one shape → tiny stub. Fix: `_bindableAt`/`_nearestBindable` gained `excludeId2` (the source), threaded through onMove + onUp (start bound first so it's known); `_nearestBindable` also prefers the smallest-area element on a containment tie. node-tested.
- **B3 deleting a connection now clears its backref:** `_scanRefBadges` only ever appended badges; it now RECONCILES — removes the stale `↗` / "Canvas References" section when the index no longer cites a line/record (cross-drawing-safe via the flatten). Early-return preserved for the no-refs case.
- **B4 centered label editor:** the connection-label textarea anchored top-left and drifted off the line while typing; now it anchors centered on the connection midpoint (`translate(-50%,-50%)` + center) and tracks the midpoint as it grows.
- NEXT: F1 direction breadcrumb in the dialog + F3 region thumbnail (v1.56); F2 drop-to-mark precise region linking (v1.57).

## ✅ v1.54.0 — CONNECTIONS Phase 5: multi-ref nav polish + see-your-connections (2026-06-20)
- **Flyback frames the WHOLE connection.** Clicking a note-side ↗ for a connection used to spotlight only the arrow's bbox.
  `_connFlashExtras(arrow)` now adds both bound endpoints as flash items, each at the EXACT sub-target it cites (a body-line
  band via `_lineRectWorld`, an image region via `_imgRegionWorld`, else the whole element); `_flashAnchor` unions them and
  (for a connection) skips the image-style establish-then-zoom (`isConn` → fly straight to the union). So you land framed on
  the arrow + both ends + the cited line — unmistakable which connection you returned to.
- **Picker rows already show the connection label** ("connection: Test", post-v1.52) + a kind dot (line cyan / record purple),
  and clicking lands on the exact connector (`entry.el` = the arrow). No change needed — verified.
- **Select-a-card → see its connections.** Selecting ONE element softly glows every connection attached to it (over each
  arrow's routed path) + a purple `⇄ N` count chip at its top-right — the canvas-side "what does this connect to". O(1) via
  a prebuilt `_connByEl` index (elId → Set(arrowId)) rebuilt in `_updateBindings`; no per-frame scene scan. Gated to the
  select tool, single selection, not-editing, not mid-flyback.
- node-tested (11: `_connByEl` index, `_connFlashExtras` line-band/region/whole-element/deleted-endpoint selection). Canvas
  overlay + synced index ONLY — zero source-note mutation. Connections system (Phases 1–5) COMPLETE.
- NEXT: connections feature-complete per the plan; await user feedback (richer chaining, connection styling, etc. if wanted).

## ✅ v1.53.0 — CONNECTIONS Phase 4: line-level + image-region targeting (the blue flag) (2026-06-20)
- A connection endpoint can now bind to a SPECIFIC body line of a record card or a REGION of an image, not just the whole
  element. Binding shape gained optional sub-target fields: `{elementId, lineGuid?, frac?, fracPoly?}`.
- **Card LINE target (Image #25):** drag an arrow onto a specific body row of a record card → it binds to THAT line. The
  endpoint tracks the line live (`_lineRectWorld`, dy relative to card top → follows a move without a re-raster), the line
  gets a canvas-drawn **blue flag** (cyan pole+pennant + subtle band tint, overlay-only), and the note's SOURCE LINE gets
  the `↗` (because `_reindexBackrefs` now keys the backref by `lineGuid` when the binding carries one). Open the record →
  the cited line shows the ↗ → click → flyback to the connection.
- **Image REGION target:** mark a region (crop/lasso → `_pendingImgRegion`), then connect an arrow to the image → it binds
  to the region; the endpoint tracks the region (`_imgRegionWorld`) and the region gets a cyan outline. No region → whole image.
- **Mechanics:** `_recFor` carries `lineGuid` per body row; `_drawRecordCard` captures per-line bands into `_lineRects`;
  `_lineGuidAtCard`/`_regionAt`/`_bindingFor` resolve the sub-target at the release point (onUp) + live hover (onMove,
  `_bindHoverSub` outlines the band/region); `_updateBindings` routes endpoints via `_bindTargetShape` and rebuilds
  `_connLineTargets`/`_connRegionTargets` (drives the flag overlay; cleared when the last connection goes); `_updateBindings`
  also runs once on load so flags show on open. node-tested (12: band hit-test incl. title/below/outside/rotated, move-tracking,
  reindex line-keying vs whole-card). CANVAS-OVERLAY ONLY — zero source-note mutation (the locked constraint).
- NEXT: Phase 5 — multi-ref nav polish (picker rows show the connection label; land on the exact connection).

## ✅ v1.52.0 — connection backref shows the connection's NAME ("connection: Test") (2026-06-20)
- User (Image #31/#32): the note-side "Canvas References" entry read the generic "connection" but should reflect what the
  connection actually SAYS ("Test"). Deduction: if "Test" were a midpoint label, v1.51's reindex would already have shown it
  via `labelByConn` — it showed "connection", so "Test" is a connected TEXT NODE (an endpoint), which `labelByConn`
  (midpoint-labels only) never inspects.
- `_reindexBackrefs` connection pass now derives a `connName` = "what the connection says": the midpoint label if present,
  ELSE the text of a bound text endpoint (`type==='text' && !midBinding`, runs-aware, whitespace-collapsed, 40-char cap with
  ellipsis); the note side reads `connection: <name>` (bare "connection" only when truly unnamed). node-tested 7 scenarios
  (midpoint label, text endpoint, unnamed both sides, text→linecard, label-beats-endpoint, long-truncate, runs-only text).
- NEXT: Phase 4 — target a SPECIFIC body line WITHIN a record card + a REGION of an image (the blue flag), per Image #25.

## ✅ v1.51.0 — CONNECTION → BACKREF: a connection lights up the note side (Connections Phase 3) (2026-06-20)
- A connection (arrow/line) bound to a record/line card now registers a back-reference, so the note/record gets the `↗`
  flag + cinematic flyback — using the EXISTING machinery, NO new note-side code.
- `_reindexBackrefs` (runs on every durable save, `:5106`) extended: PASS-1 builds an id→element + connector→label-text map
  (one scan; the label = the connector's midpoint label, else "connection"); then for each arrow/line, BOTH endpoints that
  bind a `record` card → backref keyed by `recordGuid` (kind 'record'), or a `linecard` → keyed by `lineGuid` (kind 'line'),
  `el` = the connector id. The synced index (`_setDrawingBackrefs` → `_brefSyncFlush`) carries it cross-device; the note side
  renders via `_scanRefBadges` (↗ on the record page / line), the multi-ref `_openBackrefPicker`, and `_navToCanvasAnchor`/
  `_flashAnchor` flies back + flashes the connector. Bidirectional (both ends register) + multi-ref (many connections to one
  target → the picker). node-tested (record/line keys, label, both ends, multi-ref, ignores unbound/deleted).
- So: draw a connection to a card → open the record it transcludes → `↗` → click → fly back to the connection. (A connection
  to a transcluded single-LINE card already targets that line.)
- NEXT: Phase 4 — target a SPECIFIC body line WITHIN a record card + a REGION of an image (the blue flag), per Image #25.

## ✅ v1.50.0 — forgiving connection end-bind (snap to a nearby target) (2026-06-20)
- User (Image #30): a connection's end floated ~40px below the card — it only bound when released EXACTLY on the target.
- `_nearestBindable(wx, wy, radiusPx, excludeId)`: the CLOSEST connectable element whose bbox is within `radiusPx` (screen
  px, zoom-scaled) of the point (distance-to-bbox, 0 if inside; excludes arrow/line/frame). Used as the FALLBACK after the
  precise `_bindableAt` in BOTH the live bind-hover (onMove linear/connect) and the release-bind (onUp) at **44px** — so
  dragging a connection TOWARD a card snaps to it, and the dashed hover indicator shows the snap target. node-tested
  (near binds, far rejects, inside binds, nearest-of-competing wins, zoom-scaled).
- NEXT: Phase 3 (in progress) — connection → backref + line/image-region targeting.

## ✅ v1.49.0 — edge-drag-to-connect (Heptabase ergonomic) + label-editor polish (Phase 2 follow-up) (2026-06-20)
- User feedback on Phase 2: labels look great, but (a) drawing an arrow from a circle to a card "didn't work" (connTest
  PASSES → binding is fine; the real gap is the ERGONOMIC — they expected to drag from an element to connect, not pick the
  arrow tool), and (b) the empty label editor was an ugly bare box on first entry.
- **Edge-drag-to-connect:** hover any element (select tool) → 4 edge "nubs" appear (`_connNubsFor`, 14/zoom px outside the
  bbox) → drag a nub → a BOUND connection from that element (`mode:'connect'` reuses the linear create/draw/finalize; source
  startBinding preset, end binds on release). Nubs drawn on iCv (`_connHover`); `_nubAt` hit-tests. No tool switch needed.
- **Label polish:** the midBinding-label textarea gets a `pxc-connlabel` pill + "Label" placeholder (CSS) so an empty label
  reads as a label-in-progress, not a box.
- Adversarial `code-reviewer` on the hot-input diff → fixed all 3 MED: (1) the top nub overlapped the rotate handle and the
  nub-check ran first → a rotate/resize press could start a connection; moved the nub-check BELOW the handle block so handles
  win. (2) `_connHover` stuck after a keyboard tool-switch → phantom nubs / stale-nub bogus connect; gated the overlay paint
  on `tool==='select' && !editingId` + clear `_connHover` on tool-switch. (3) phantom nubs around the textarea on enter-edit
  → same gate + clear `_connHover` in `_editText`. Vectors 3/4/5 (startBinding survival, device coords, drag-clear) confirmed OK.
- node-tested the nub geometry (4 edge midpoints, zoom-scaled offset, negative-size normalized, all outside the bbox).
- NEXT: Phase 3 — connection → backref (the note side: `↗` flag + flyback) with line- & image-region targeting.

## ✅ v1.48.0 — LABELED CONNECTIONS: arrow binds anything + a connectable midpoint label (Connections Phase 2) (2026-06-20)
- Heptabase-style connections. (1) `_bindableAt` (:2077) now binds an arrow/line endpoint to ANY content element via
  `hitElement` (card/image/linecard/text/board/shape), excluding only arrow/line/frame (was: ROUGH_SHAPES only). (2)
  Double-click a connector (new `onDblClick` arrow/line case → `_editConnLabel`) creates/edits a midpoint LABEL — a normal
  `text` element with `el.midBinding={arrowId}`. The label is selectable, can carry `@`/`@@` refs, and is itself BINDABLE →
  a new arrow can connect FROM it = chaining (text→arrow→text→image). (3) `pxcPolyMidpoint` (arc-length 50%) places it;
  `drawText` draws a light/dark pill behind it. Connections are ordinary scene elements (serialize/undo/O(1)-pan apply).
- 3-lens adversarial review (workflow) → fixed every real bug it found: **HIGH** `_cloneEl` now nulls `midBinding` (was
  cross-linking a cloned label to the ORIGINAL connector); **HIGH** the live-drag rebind was gated on rough shapes only so
  bound cards/images/labels FROZE mid-drag — `onMove`/`_nudge` now always `_updateBindings()` (early-returns when nothing
  bound); **HIGH** chained connectors lagged a pass + never settled on drop — `_updateBindings` restructured to ONE scan +
  early-return + a **fixpoint** (arrows→labels→arrows ×3) that settles chains in one call; **MED** orphan-on-delete +
  display≠saved divergence — `scheduleSave` now `_updateBindings()` BEFORE the snapshot (frees dangling midBindings, settles
  on drop, consistent save); dblclick xref/link branches guarded so the label editor is always reachable.
- node-tested: midpoint (6 cases) + the full `_updateBindings` (early-return, centering, label-as-bind-target, chaining
  fixpoint SETTLES, orphan-free) — the node test caught a real crash (a freed label re-processed in a later fixpoint pass →
  null.arrowId), fixed with an `if(!el.midBinding)return` guard. `test.connLabel`→ `test.connTest()` runtime hook added.
- DEFERRED (noted, not blocking): binding to a large element snaps to its bbox edge anywhere inside it (intended
  connect-anything; the `_bindHover` indicator shows it); a label pins to the connector midpoint (can't be nudged — a
  `midBinding.offset` is a later enhancement); z-order: a label sits on its connector's hot zone.
- NEXT: Phase 3 — connection → backref (the note side lights up via the existing `_scanRefBadges`/`_openBackrefPicker`/`_flashAnchor`).

## ✅ v1.47.0 — transclusion cards: dark-mode + live-transclusion GLOW (Connections plan Phase 1) (2026-06-20)
- User: cards were hardcoded light (`#fff`/`#1e1e1e`/`#5f6368`) → unreadable on a dark theme; wanted a glow so a card reads
  as a live transclusion. Plan: `~/.claude/plans/staged-finding-ritchie.md` (dark-mode+glow → connections, phased).
- `_drawRecordCard` (:2962) + `_drawLineCard` (:3622) now branch on `PXC_DARK` (set per-frame from `_themeDark()`):
  bg → `#1b1d24` (dark) / `#ffffff` (light); title → `#e6e7ea`/`#1e1e1e`; body → `#9aa3ad`/`#5f6368`; loading/title-dim
  → `#8b9096`/`#9aa0a6`. Rainbow markers/guides already saturated; accent stripe already adapts. `el.backgroundColor`
  still wins if explicitly set.
- GLOW: the card fill draws with `shadowColor = accent` (record `#7c5cff`, linecard `#0ea5e9`) + `shadowBlur = 12*z*dpr`
  (~12 world px halo at any zoom), then resets shadow before the stroke/body. STATIC (no per-frame anim → no hot-path cost,
  full-render/settle only). Toggle via `_settings.cardGlow === false`.
- Verified standalone in chrome (light page = subtle glow + readable; dark page = readable dark card + prominent glow).
  Cosmetic-only (no logic/data) → skipped the heavy review; the adversarial gates are reserved for the connection phases.
- NEXT: Phase 2 — labeled connections (arrow/line binds to ANY element + a connectable midpoint label).

## ✅ v1.46.0 — card text WRAPS (no more "…" truncation) + data-safety audit honesty fix (2026-06-20)
- **Text wrap** (user: long lines truncated with "…"): `_drawOutlineRow` now `pxcWrapLines`-wraps to the available width and
  RETURNS its (multi-line) height; the record-card + line-card loops advance `ty` by that. Indent guides span the full
  wrapped height; the marker dot stays on the first line. Verified standalone in chrome (the EMP line wraps to 3 lines).
- **Data-safety audit** (user asked to confirm we're good): adversarial review of the full write-back (pxcWriteCardTree +
  guards + pxcOutlineRows) vs the SDK contract. VERDICT: **safe against data loss/corruption on every vector** — rich
  segments (all 10 non-text types) never flattened (the `!rich` guard checks ORIGINAL segments, skips even if the user
  retyped the row); no `li.move()` cycle/orphan/double-move (moveParent is always a processed ancestor; subtree carry +
  original-depth equality); appends purely additive (createLineItem only, linecard appends land under the main line);
  NO constructible silent wrong-write (count-grow needs unchanged prefix; reorder caught by text-collision; writes target
  line HANDLES by identity → robust even to external reorders); `li.delete()` is NEVER called.
- Only gap = **vector 5 (MED, not data-loss): non-atomic partial failure**. Fixed: `pxcWriteCardTree` now returns
  `{writes, fails, richSkipped}`, `console.warn`s each swallowed SDK error, and the toaster is HONEST — "Saved N; K couldn't
  be written (see console) — open the record to retry" + "M lines with links/dates/formatting left unchanged". Added the
  reorder-heuristic INVARIANT comment (sufficient only because the editor has no drag-to-reorder; make it positional if added).

## ✅ v1.45.0 — FLOW EDITOR: card editor shows the rainbow flow while editing (Phase 2) (2026-06-20)
- User: the rendered transclusion shows the Indent-Rainbow flow (v1.41/42) but the EDITOR was a plain textarea (no markers/
  guides). Replaced it with a per-row DOM outline editor in `_editCardBody`.
- Each row = `[gutter: depth-coloured indent guides + a marker dot][contentEditable text]`, reusing `PXC_RAINBOW` + STEP=13
  (matches the canvas `_drawOutlineRow`). A long line wraps WITHIN its row (marker pinned at top) — why per-row beats a
  textarea+overlay. Box built unscaled + `transform:scale(z)` for zoom. Keys: Tab/Shift+Tab re-indent (clamp prevDepth+1,
  linecard main line stays 0); Enter splits at the caret + carries the tail into a new sibling row; Backspace at line start
  outdents; Esc discards; Cmd/Ctrl+Enter or blur-out commits. Paste = plain text.
- COMMIT reuses the UNCHANGED `pxcWriteCardTree` + the same data-safety guards. node-tested the round-trip + FIXED a latent
  trailing-whitespace false-refuse (parsed.text is now UNTRIMMED = body, so a source line with trailing space doesn't read
  as "changed" and block an append).
- Adversarial `code-reviewer`: fixed the one real data-UX bug it found — a mid-list Enter that the guard refuses used to
  REMOVE the box first → discarded the WHOLE edit session. Commit is now **non-destructive on refuse**: guards run BEFORE
  removing the box; a refused structural change keeps the box + all edits open + a clear toaster (Esc to discard). Also:
  Escape no longer depends on resolving the active row (+ `box._lastRow` fallback); focusout doesn't commit on app/tab
  switch (`document.hasFocus()`); Backspace caret check uses firstLeaf; text `min-width:0` so it wraps not overflows.
- Visually verified the row rendering standalone in chrome (rainbow dots by depth + guides + wrapped first line). The
  behavioral keys (Enter/Esc/focusout) need a live editor → user verifies after reinstall.
- CONTRACT LIMIT (carried from the original safe-commit design, unchanged): editing an existing line AND appending in the
  same session refuses (avoids mid-insert ambiguity) — now NON-destructive. Text-only edits, re-indent, and clean end-appends
  all commit. Relax only with a fresh data-safety review.

## ✅ v1.44.0 — PANNING REDESIGN: O(1) compositor pan (100K shapes as smooth as one image) (2026-06-20)
- Hard requirement: pan must be O(1) regardless of scene size. The old model re-touched/re-uploaded the staticCv bitmap
  every pan frame (cost ∝ canvas pixels) + a fixed ±280px margin snapshot → not bulletproof, doesn't scale.
- REDESIGN (oversized canvas + GPU-compositor CSS-transform; re-raster only on boundary-cross, O(visible)):
  - `staticCv` is OVERSIZED by render-pad `P=clamp(min(cssW,cssH)*0.75,300,800)` each side, CSS-positioned at (-P,-P);
    `iCv` stays viewport-sized (events + overlay). `Canvas2DRenderer.begin(ctx,cam,dpr,pad)` adds `+pad*dpr` (net on-screen
    unchanged: canvas at -P + content +P = 0). `_drawGrid` + the render cull extended to the padded region.
  - `render()`: NEW `compositorPan` fast path — while `_panMode` + within ±0.8P of `_staticRasterCam` at the same zoom, just
    `staticCv.style.transform = translate3d(round(dx),round(dy),0)` and ZERO raster. Else full-raster into the oversized
    canvas (reset transform, update `_staticRasterCam`) culling the padded region (O(visible) via the grid → cheap at 100K).
    The overlay runs every frame so handles/selection track the pan.
  - `_panMode` set in pointer-drag + wheel pan; cleared on pointerup(moved)/pointercancel/`onDown`(new gesture)/zoom/150ms
    `_schedulePanEnd` (wheel has no pointerup). On clear, the next render re-rasters crisp.
- VERIFIED: node — `+P` offset, ≤1px pan accuracy, 0.8P coverage gate, exact re-raster, eyedropper buffer-offset (`+P-tx`).
  LIVE (standalone Chrome harness): at **N=100,000** the CSS-transform pan = **0.02ms/frame** main-thread, 0 long tasks, vs
  per-frame redraw 20.8ms/frame; at N=100 = 0.1ms. → per-frame cost ~0 and FLAT across N = **O(1) pan, proven**. `test.panScaleBench()` added.
- Adversarial `code-reviewer`: core pan math/sign/blank-edges/_camAnim/hit-testing/memory all CONFIRMED correct. Fixed 1 HIGH
  (leaked pan transform froze into an element-drag — reset transform ungated + tear down `_panMode` in onDown), 1 MED
  (eyedropper sampled P px off the oversized buffer — `+P-tx` offset), 1 LOW (zoom-after-wheel-pan dangling state).
- Old blit/margin/settle fns (`_refreshCache`/`_warmMarginCache`/`_scheduleMarginWarm`/`_marginCovers`/`pxcMarginBlitOffset`/
  `_scheduleSettle`) are now DEAD (never called) — left for a later cleanup pass; residual `_cacheValid=false` sets are no-ops.
- ⚠ Couldn't self-verify the FULL integrated path live (594KB > MCP-push; reinstall is a UI action) — user reinstalls +
  runs `test.bench(100000); test.panScaleBench()` + pans a heavy board. Phase 2 (flow editor) next.

## ✅ v1.43.0 — PAN→PAUSE→PAN root cause: settle invalidated the margin cache (2026-06-20)
- User hint (the key): continuous panning is smooth; the glitch only happens on **pan → pause → pan**. Instrumented the
  exact cycle live (longtask observer + per-frame timing) → **ZERO long tasks** → it's NOT a CPU hitch, it's a VISUAL
  fallback to the blank-edged viewport cache.
- ROOT CAUSE: `_refreshCache` (fires on every settle) set `_marginValid=false`, and `useMargin` demanded an EXACT
  `_marginCam===_cacheCam` match. The re-warm is debounced AND `_warmMarginCache` bails while the camera is moving. So:
  pan→pause (settle invalidates the margin) → resume within the re-warm window → blit drops to the exact-viewport cache →
  blank/re-rendered edges. Continuous panning never settles → margin stays valid → smooth. Exactly the reported symptom.
- FIX (first-principles — the margin is a CONTENT snapshot, not a camera-locked one):
  1. `_refreshCache` no longer invalidates the margin (a camera settle doesn't change content). Content changes self-heal
     (`_cacheValid=false` → next full render → `_refreshCache` → re-warm).
  2. New `_marginCovers()` — blit uses the margin for ANY same-zoom camera whose view is within ±M screen px of `_marginCam`
     (node-proven: |dxScreen|≤M-1 keeps the rounded blit covering the viewport; 0 false-positives over 3606 cases).
     `useMargin` now gates on coverage, not exact-camera equality.
  3. Re-center faster after a pause: warm debounce 200→90ms, idle-bail 160→110ms (still off the hot path — bails during
     active motion). Resize now also invalidates the margin (its dims derive from cssW/cssH).
- Stacks with v1.40 (trackpad arms the blit) + v1.39 (crisp rounded blit) + v1.38 (margin cache). node-tested coverage
  predicate; couldn't self-verify live (shared-Chrome tab churn) — user reinstalls + verifies pan→pause→pan.

## ✅ v1.42.0 — transclusion NESTING root cause: depth from parent_guid, not getChildren() (2026-06-20)
- User: transcluded outline rows render FLAT (no visible indentation) even though the record shows clear nesting.
- ROOT CAUSE (proven via live `get_line_items` on record 1ARSM7792BTCP422K0193X7M3H): `rec.getLineItems()` returns the
  body **FLAT in pre-order**, every line carrying a correct **`parent_guid`** (SDK PluginLineItem field), but
  `li.getChildren()` returns **[]** on that flat load — so the old `pxcFlattenTree` getChildren-recursion never added
  depth → every row depth 0 → flat card. (The line-card editor was silently broken the same way: it only ever showed the
  main line, no children.)
- FIX: new synchronous **`pxcOutlineRows(all, root, cap, includeBlank, includeRoot)`** derives depth from the
  **parent_guid chain** (cycle-guarded). root=null → whole record (absolute depth); root=<lineGuid> → that line's subtree.
  Repointed all 3 sites: record card (`entry.lines`), line card (`entry.children`), card editor (`items`). Removed the old
  `pxcFlattenTree`/`pxcFlattenTreeLi`. node-tested 7 cases on the EXACT live data shape (depths 0/1/2, subtree filter,
  blank-skip-but-depth-preserved, cap, cycle no-hang, sibling-branch exclusion). Pairs with v1.41 rainbow markers+guides →
  transclusions now show true indentation with depth-colored dots + guides.

## ✅ v1.41.0 — transclusion outline rows = Indent-Rainbow look (record parity) (2026-06-20)
- User clarified the "flow thymer plugin / bullets" ask: the issue is **on the canvas** — transcluded outline rows
  should look like they do on a record (where the Indent Rainbow plugin paints them). The Indent Rainbow plugin
  CANNOT paint a canvas card (it's a Canvas2D bitmap, not DOM), so the parity is **replicated in the canvas renderer**.
- New `_drawOutlineRow(ctx, text, depth, tx, ty, textColor, maxW)`: per row, a **depth-colored marker dot** +
  **depth-colored vertical indent guides** (one per ancestor level, descending under that level's marker), matching the
  Svyk-fork Indent Rainbow `rainbow` palette `['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6']`
  (module const `PXC_RAINBOW`), guides at lineWidth 1 / alpha 0.45 like the plugin. Replaces the plain `• ` text bullet
  (v1.39) in BOTH `_drawRecordCard` (record card body lines) and `_drawLineCard` (linecard children). STEP=13px/level.
- Verified the VISUAL standalone in chrome-devtools (injected a sample card, screenshotted): red→orange→yellow dots by
  depth + faint rainbow guides, record-like. (Card EDITOR textarea keeps the plain `• ` affordance — a textarea can't
  draw colored dots; edit-vs-view, the v1.39 bullet-strip parse is unchanged.)
- Runs on the full-render/settle path only (cards aren't redrawn per pan frame), so no hot-path cost. Ships with v1.40.

## ✅ v1.40.0 — PAN LAG ROOT CAUSE: trackpad/wheel pan bypassed the camera-blit fast-path (2026-06-20)
- **The real bug** (found by reading the input handlers, not the blit): the camera-blit fast-path (render loop
  line ~4713) is gated on `moving = (now - _lastCamChange < 110)`. **Pointer-drag pan sets `_lastCamChange`
  (line 2301); the `onWheel` handler (line 2369) never did.** So trackpad / two-finger / wheel panning failed the
  `moving` gate every frame → fell through to a FULL crisp re-render + `_refreshCache` per frame. That's the lag —
  and it's worst **zoomed-in with images** because a full render upscales every large image bitmap each frame
  (matches the user's "still laggy, especially zoomed in"). Mouse drag-pan was already smooth (it armed the path).
- **Fix:** the onWheel PAN branch now sets `this._lastCamChange = this._now()` → trackpad pan uses the same cheap
  blit path as drag-pan. ZOOM branch intentionally left unchanged (keeps wheel-zoom's crisp per-frame render — no
  blur regression; zoom-out needs the full render anyway). One line, mirrors the proven pointer-drag path.
- Pairs with v1.39's blit-offset rounding (crisp) + v1.38 margin-cache (no blank edges): trackpad pan now takes the
  rounded, margin-padded blit instead of a full render. The user-approved compositor CSS-transform refactor is held
  as a FOLLOW-UP — only needed if the blit's staticCv re-upload is still the bottleneck AFTER this fix (verify first;
  the v1.34 ~28ms composite was a full-screen element-drag, likely not the cost at a normal panel width).
- ⚠ Couldn't capture a confirming trace: shared debug-Chrome (2 Claude instances + user) kept tearing down the test
  canvas / firing unrelated dialogs. Diagnosis is code-evident (pointer path sets the flag, wheel path didn't).
  User reinstalls v1.40.0 + verifies trackpad pan.

## ✅ v1.39.0 — bullets in cards (Thymer-flow look) + PAN crispness (round blit) (2026-06-20, blind: chrome MCP down)
- **Bullets like Thymer flow** (user: "is there a way to show bullets like flow thymer plugin?"): the rendered RECORD card
  body lines now draw `'• ' + ln.text` (was bare text — `_drawLineCard` already did this), AND the card EDITOR textarea
  shows `'  '*depth + '• ' + text` per line. Commit strips the indent + the literal `/^• ?/` glyph (ONLY my rendered bullet,
  never a user's `-`/`*`) before the data-safety guards run → `parsed[i].text`/`body[i]` stay bullet-free, so
  `prefixTextMatches`/`isReorder`/`pxcWriteCardTree` compare against `lineTextOf` unchanged. node-tested 7 cases (depth+text
  round-trip, user dash/star NOT stripped, literal-`• ` text survives, new no-bullet line tolerant, Tab-before-bullet).
- **Panning crispness — GIF analysis** (user: "analyze this gif and offer a panning fix"): the GIF showed content BLURRY
  in-motion → CRISP on settle. Root cause = the camera-blit offset `tx/ty` is FRACTIONAL device px as the camera pans by
  sub-pixel amounts → `drawImage` bilinear-interpolates (the blur). Fix: `Math.round(o.tx), Math.round(o.ty)` at the blit —
  a pixel-aligned 1:1 blit (s=1 for pure pan) is crisp. Zoom path (s≠1) unaffected (sub-px origin shift is negligible; the
  scale interpolates regardless). Worst case = a ≤1-device-px snap to exact position on settle (imperceptible at 2× DPR).
  Complements v1.38 margin-cache (blank-edge fix); together: crisp + no blank edges while panning.
- ⚠ BLIND (chrome MCP down): geometry/parse node-verified + reviewed; "panning feels crisp now" needs a live confirm.

## ✅ v1.38.0 — Enter-to-edit overlap fix + PAN margin-cache (2026-06-19, blind: chrome MCP down, node+review only)
- **Enter-to-edit "looks odd at first":** entering edit set `editingId` (next render skips the element) but the textarea
  appeared immediately while the canvas still showed the element until the next RAF → a 1-frame "double." `_editText` now
  forces a synchronous `this.render()` right after `editingId`, so the element clears in the same paint the textarea shows.
- **Panning margin-cache (user: "especially the canvas panning"):** the pan-blit cache was exactly viewport-sized → revealed
  edges blank until settle. NEW additive, DEBOUNCED background warm: `_warmMarginCache` (200ms idle, off the keystroke path;
  bails on editing/drag/anim/mid-pan + glMode) renders the scene into a SEPARATE `_marginCv` padded 280px each side, via a
  temporary `this.camera` shift (restored in `finally`). The camera-blit prefers `_marginCv` (via pure
  `pxcMarginBlitOffset(cc,cam,M,dpr)`, node-tested; M=0 == old blit) when warm + at the same camera as the viewport cache,
  else falls back to the viewport `_cacheCv`. **Display path + `_cacheCv` untouched** → worst case is a pan glitch, not a
  display regression. Invalidation rides the existing `_cacheValid` gate; `_marginT`/`_marginCv` freed in destroy.
- Adversarial `code-reviewer`: Change A fine; Change B correct (camera-shift sync, ctx-sharing, staleness, debounce,
  geometry, lifecycle all verified) — fixed 1 MEDIUM (latent WebGL-backend corruption → warm now skips glMode). node-tested.
- ⚠ BLIND this session (chrome MCP died w/ Chrome): geometry verified, but "panning feels smoother" / "overlap gone" need
  a live test or re-profile. Pan-fix candidate notes in the v1.35 NOTE block remain if this approach needs tuning.

## ✅ v1.37.0 — editable cards: SEE + EDIT the nested tree (indent in the card) (2026-06-19)
User: "I should see the tree in the card I edit, and create indentation there." The card editor loaded only top-level
lines, flat; now it loads the full nested subtree and supports re-nesting.
- `pxcFlattenTreeLi(items,depth,out,cap)` (async DFS, keeps the line-item objects + blanks). `_editCardBody` loads the
  subtree (cap 60), the textarea shows `'  '*depth + text` (nesting as indent), **Tab/Shift+Tab** re-indent the row.
- Commit → `pxcWriteCardTree(rec, items, parsed, body, isLine)`: re-parent via SDK **`li.move(parent, after)`** (depth
  changed), `setSegments` (text changed), `createLineItem` (appends) — keyed by a `lastAt[]` parent/after stack. SDK
  `move()` preserves the line + its refs (no data loss).
- Adversarial `code-reviewer` (data-safety, can't live-test — chrome MCP down): verified SAFE by construction (no
  move-under-own-descendant cycle; subtree co-move handled). Fixed **HIGH-1** (a text edit on a no-title-ref/bold/date/
  hashtag line would `setSegments`-flatten it → now rich lines are NEVER rewritten, edit them in the record), **HIGH-2**
  (count-same reorder/swap guard — refuse, the positional map would re-parent the wrong line), **MED-1** (over-indent
  clamps to prev+1, not root), **MED-2** (linecard append stays UNDER the main line). Safe gate still refuses delete/
  reorder. node-tested: reconstruction (6) + rich-no-flatten + clamp + linecard-append.
- NOTE: rendered-card indentation (v1.35) only shows for NESTED source content; a flat record shows none (correct).

## ✅ v1.36.0 — TEXT WRAP: drag a text box's width to wrap (2026-06-19)
User (item 2): "I should have an option to wrap text." A text element now carries `el.wrapW` (serialized px). DRAG a text
element's left/right resize handle → `_applyResize` sets `el.wrapW=max(24,nw)` + re-measures; text word-wraps to that
width, height follows the line count, and the editor textarea wraps to match (`white-space:pre-wrap; width=wrapW*z`).
- `pxcWrapLines(ctx,text,wrapW)` — greedy word-wrap (honors `\n`; a word wider than wrapW overflows, no mid-word break).
  `measureText` + `drawText` (plain) and `measureRuns` (inline-ref runs: text-runs word-wrap, a ref wraps as ONE unit)
  all branch on wrapW. `el.wrapW` unset → byte-identical to before (proven in node tests — the inline refs don't regress).
- Adversarial `code-reviewer`: **no HIGH/MED** (no-wrap path provably unchanged; measure/draw consistent; refs hit/underline
  correctly when wrapped). 3 LOW fixed: bbox `el.width=max(wrapW,maxW)` covers a ref/word wider than wrapW (stays
  clickable); `transform` self-test skips text; editor textarea `box-sizing:border-box`.
- node-tested: pxcWrapLines (fit/wrap/newline/falsy), measureRuns no-wrap==old + wrap (width, multi-line, ref-as-unit).

## ✅ v1.35.0 — transclusion INDENTATION: cards render their nesting like Thymer's outline (2026-06-19)
User (item 1): "mimic the thymer flow plugin so I can see indentation level." Record/line cards rendered their body lines
FLAT; now they show the source's nesting. New `pxcFlattenTree(items, depth, out, cap)` (async, DFS) flattens a line-item
subtree to `[{text, depth}]`; `_recFor`/`_lineFor` build that (cap 10/12); `_drawRecordCard`/`_drawLineCard` indent each
line by `depth*13px` (clip width reduced to match). Node-tested (DFS depth order, cap, blank-parent-keeps-child-depth).
- Shape change: `entry.lines`/`entry.children` went `[string]` → `[{text,depth}]`; the only readers (the two card draws +
  one test using `.length`) updated. The editable-card editor reads the live line ITEMS, unaffected.
- **Deferred:** EDIT-side indent (Tab to re-nest from the canvas) — that's a structural nesting write that conflicts with
  the safe edit-contract; for now you SEE the nesting (read), and restructure in the record. (Revisit with the editor.)

## NOTE — pan "redrawing" speed (deferred per user, to revisit after items 1–3)
User clarified the lag is **panning the canvas (dragging empty space), NOT dragging items**. Root path = the camera-blit
(`render()` ~4583): on pan it blits the cached VIEWPORT bitmap shifted, so newly-revealed edges are blank until
`_scheduleSettle` does a crisp re-render → the visible "redrawing." (v1.32/1.34 fixed ITEM-drag compositing, a different
path — still a valid win.) Fix candidate when we revisit: cache a MARGIN beyond the viewport so normal panning stays
within cached content; re-cache when panning past it. Needs a live chrome re-profile to confirm.

## ✅ v1.34.0 — drag perf, take 2: FREEZE the static canvas, draw movers on the overlay (2026-06-19, trace-driven)
v1.32's static-layer cache wasn't enough — a chrome **performance trace** of a real drag showed the cost was **28ms
presentation/composite delay** (+22ms input delay, only **0.2ms** actual JS): the GPU was re-uploading the big scene
canvas EVERY frame because the cache re-blitted it onto `staticCv` each frame (two full-canvas uploads/frame w/ the
overlay). Confirmed it lagged with EVERYTHING (images/text/shapes), not just the heavy hachure ellipse the GIF showed.
- **Fix (Excalidraw approach):** during a drag, render the static scene to `staticCv` ONCE excluding the movers, then
  FREEZE it (the whole staticCv block is skipped while `frozenDrag`); draw only the moving elements (+ ghosts) on the
  lightweight `iCv` overlay each frame. One canvas upload/frame instead of two. `_dragCv` snapshot removed (staticCv IS
  the frozen layer). Camera-blit gated `!dragMovers`; mover pass on iCv is camera-space, under the handles.
- **Adversarial review HIGH fixed:** a frozen staticCv would miss a non-mover changing mid-drag (esp. a static IMAGE
  finishing decode → stuck placeholder). The async/external paths now clear `_dragLayerValid` (img.onload, onRecChange
  data events, theme flip, _purgeImageCache, _brefSyncLoad) → ONE rebuild frame repaints + re-freezes. 5 risk areas
  (transition/double-draw, iCv transform hygiene, z-order, frame+glMode fallback, lifecycle) all reviewed clean.
- node --check + node tests clean. **Re-profile after install to confirm presentation delay drops.**

## ✅ v1.33.0 — image PASTE fixed; drag-from-panel proven blocked (2026-06-19, live chrome probes)
The two EAPI probes, resolved empirically by attaching document-level drag/paste loggers in the debug Chrome:
- **Image paste — FIXED.** Root cause: the canvas `onKey` handler intercepts Cmd+V and `preventDefault`s it → the native
  `paste` event never fires → the `document` paste listener never runs while the canvas is focused. Fix: `_paste()` now,
  when the internal canvas clipboard is empty, calls `_pasteSystemImage()` → `navigator.clipboard.read()` (the Cmd+V keydown
  is a valid user gesture) → drops any image (incl. SVG) at the viewport centre. Web: one-time `clipboard-read` permission
  prompt, then works (verified `hasClipboardRead`+secure+`permission:prompt` live). Internal element-copy still takes
  priority (paste your last canvas copy first; system image when the internal clipboard is empty).
- **Drag-from-panel — GENUINELY BLOCKED (not buildable).** Proven live: Thymer note lines (`.listitem`) are NOT
  HTML5-draggable (`draggable:false`, no `draggable` attr); dragging one fires NO `dragstart` and places NO `dataTransfer`/
  GUID. The 99 `draggable="true"` nodes are sidebar collection items, not note lines/records. So there is nothing to read —
  it's a true Thymer editor-API gap (EAPI-4), exactly as the roadmap predicted. No DOM hack can recover data never emitted.

## ✅ v1.32.0 — Enter-to-edit + drag-perf static-layer cache (2026-06-19)
Two user-reported items.
- **Enter / F2 → edit the selected text element** (`onKey`): select a text box with ONE click (no navigation — first click
  only selects a ref box; nav needs a second click), then Enter edits it. Fixes "can't enter edit mode on a ref-only box
  without accidentally hitting the link." Excludes image chips (`isRef`) + mind-map nodes (`mmRoot`).
- **Drag-perf:** dragging elements used to fall through to a FULL crisp re-render every frame (re-drawing heavy static
  images/cards = jank). Now a **static-layer cache**: `_dragMovers()` = selection ∪ bound arrows (null when a frame is
  selected → full render). On drag, build the static layer ONCE excluding movers (`_dragExclude`/local `ex`), snapshot to
  `_dragCv`; each frame blit it + draw only the movers (+ ghosts) live. Reset on drag end + `pointercancel`/
  `lostpointercapture` + at the top of a fresh `onDown` (self-heal) + on resize.
- Adversarial `code-reviewer` (render correctness): blit transform / z-order / async-staleness / frame-fallback all sound;
  fixed 1 MEDIUM (no `pointercancel` path → interrupted drag left the blit frozen) + 1 LOW (resize mid-drag). `node --check`
  + node tests clean.

## ✅ v1.31.0 — editable cards: edit a card's body lines inline, written back to the source (2026-06-19)
User (request 1): "inline-editing a card on the canvas isn't a feature — make it one." Double-click a record card's BODY
(or a line-transclude card) → an inline `<textarea>` over the card; commit writes back to the SOURCE via the SDK. The
record TITLE is read-only (SDK has no rename) — its top ~28px band opens the record instead.
- **SAFE write-back contract (data-loss review enforced):** only two positionally-unambiguous ops — (a) line count
  UNCHANGED → rewrite the lines whose TRIMMED text changed (untouched lines, incl. their refs/bold/datetime segments, are
  NEVER rewritten); (b) count GREW with the existing prefix unchanged → APPEND the new rows as line items. Delete / reorder
  / mid-list insert are REFUSED (would require positional diffing that flattens rich segments or hard-deletes real task/
  child lines) → a toast nudges the user to open the record. No blind `.delete()`.
- `_editCardBody`: resolves items (record card → `getLineItems()`; linecard → `[main, ...getChildren()]`), edits via
  `setSegments` / appends via `createLineItem`. Esc aborts (no write); a new editor or `destroy()` calls `abort()` so a
  prior edit can't commit on teardown. Known limit: editing a line replaces it with plain text (that line's own
  formatting/refs are lost — it's the line you edited); structural changes go through the record.
- Adversarial `code-reviewer` (data-safety focus): the FIRST design had 2 HIGH data-loss paths (positional `\n`-diff
  flattened untouched rich lines on any insert/delete; trailing-delete destroyed tasks/children) — REDESIGNED to the safe
  contract above before shipping. `node --check` clean.

## ✅ v1.30.0 — record page: "Canvas References" SECTION instead of the inline ↗ chip (2026-06-19)
User (request 3): "for the record view, instead of the chip, put it in the back ref section." Thymer's record page has a
native **Backreferences** footer (`.tlr-body` inside the panel's `.tlr-footer`, holding `.tlr-section-slot-*` slots:
Property/Linked/Unlinked References). New `_injectCanvasRefSection(root, entries)` injects a **"Canvas References"** slot
there (mirrors the native `.tlr-section-title` look), one clickable row per canvas ref (kind-colored ↗ → `_navToCanvasAnchor`).
- Scoped to THIS record's `.editor-panel` (`root.closest('.editor-panel') → .tlr-body`); idempotent via a content
  signature (`count:el|label,…`) on `data-pxc-sig` so the 1.5s scan rebuilds only when refs change.
- `_scanRefBadges` record loop now calls the section injector first; the inline ↗ badge is a FALLBACK only when the
  Backreferences footer isn't rendered (collapsed/absent). A stale inline `.plexus-backref-rec` badge is removed once the
  section is in place.
- **Live-validated** on svyat.thymer.com (Jimmy's Appointment record): the section rendered inside Backreferences, above
  Property/Linked References, with the two refs as rows (screenshot-confirmed) before baking the exact DOM into the plugin.
- Line refs keep their inline ↗ on the cited note line (unchanged — the user only moved the record-page chip).

## ✅ v1.29.0 — multi-ref flyback picker: same line/record referenced >once → choose which (2026-06-19)
User: "if I ref the same line in a canvas more than once, need an option to pick which one — kinda like thymer remark."
The backref store went from one-entry-per-target to an **element-map** per target.
- **Store v2:** `{ [drawing]: { [target]: { [elId]: {label,kind,t} } } }` (was `{drawing:{target:{el,…}}}`). `pxcBrefMigrate`
  normalizes BOTH legacy shapes (flat `{target:{drawing,el,…}}` + nested-single) → v2; discriminator `typeof val.el==='string'`
  (a v2 entry's value is always an object, so it can't misfire). `pxcBrefFlatten` → `{target:[entries]}` newest-first.
  `pxcBrefMergeNested` unions el-maps per-elId (cross-device read-merge-write keeps both devices' refs). `_reindexBackrefs`
  collects ALL refs (dedup by elId — two runs in one element → one entry).
- **UI:** `_mkBackrefBadge(entries)` shows a red **count** bubble when >1; click → `_openBackrefPicker` (a `position:fixed`
  dropdown listing each ref with a kind-colored dot → fly to the chosen one). Single ref → flies directly, no menu. Picker
  hardened: tracks/removes its outside-click listener on re-open, flips above the badge near the viewport bottom.
- Verify: node `multistore_test` (6 groups) + updated `reindexFlybackTest` (E5 dup → `recMulti` len 2) + `backrefRoundTripTest`
  (array); `node --check` clean; adversarial `code-reviewer`: NO blocking defects (migration discriminator proven safe,
  xref/image path untouched, merge unions correctly); 2 LOW notes (listener + vertical-flip) applied.

## ✅ v1.28.0 — refs are now inline editable runs: no @/@@ marks, underlined, type around them (2026-06-19)
User request: "don't need to show the at marks… these refs should have nice css like underlines… I should be able to
continue to edit these lines and add other text." The inline-run renderer (`drawRuns`) already did all of this (no prefix,
ref color, underline, editable); the picker just wasn't using it for an empty box.
- **`_applyRefChip` always splices an INLINE ref run** now (removed the caret-only `_configureRef` whole-element-chip
  branch). Empty box: `spliceRunRange` over the just-typed `@token` collapses it to a single ref run; the editor stays
  open so you keep typing. Trigger range re-derived from the live caret via `pxcParseRefTrigger` (robust if the caret
  moved while the picker was open).
- **`pxcChipToInlineRun(el)`** migrates existing whole-element line/record chips → inline runs on load (drops the
  `@`/`@@` prefix + `isRef/refKind/refGuid/refLineGuid/refLabel/refAlias` markers, sets `el.runs=[{t:'ref',…}]`,
  re-measures). Image chips + mind-map roots (`isRef` w/o `refKind`) are skipped by the kind-gate. Idempotent; persists
  via a one-shot debounced `saveNow` when anything converted.
- Behavior post-convert: single-click the ref → navigates; double-click the element → EDITS (markers gone → falls to
  `_editText`); flyback ↗ still works (`_reindexBackrefs` keys runs by the same lineGuid/recordGuid).
- Verify: node test (6 groups — caret-only collapse, mid-text splice, line/record/alias migrate, image-skip, idempotent);
  `node --check` clean; adversarial `code-reviewer`: NO blocking defects (kind-gate confirmed load-bearing for mind-map
  roots; the one LOW caret-move edge hardened via the live `pxcParseRefTrigger` re-derive).

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
