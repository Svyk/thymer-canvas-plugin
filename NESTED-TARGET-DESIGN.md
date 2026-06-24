# Nested / drill-down target — design (validated 2026-06-23)

Unify "target a Section as a whole, then drill DEEPER (a card inside → an image inside → a region of that
image)" across BOTH the connection (arrow) system AND the cite/reference system. Validated by a 3-angle
design workflow (connections · references · sections). The whole thing is **additive + backward-compatible
by construction**.

## Core insight
Today's binding tail `{lineGuid?, frac?, fracPoly?, refGuidTarget?, refKindTarget?}` and the cite target spec
`{el, frac, fracPoly}` are ALREADY the same primitive: **a sub-target on ONE element** whose geometry resolves
against that element's own bbox (`_imgRegionWorld`/`_lineRectWorld`/`_refRunRectWorld`). So nesting adds exactly
**ONE optional field, `sectionId`** (the owning frame's guid — pure CONTEXT for highlight/collapse/breadcrumb,
NEVER used in geometry resolution). The leaf still resolves via `_bindTargetShape(b, lookup(b.elementId))` where
`b.elementId` is the **child** for nested targets. No `childPath` wrapper, no recursion, no new resolver branch.

## Data model (3 states, all expressible, no migration)
Binding (`arrow.startBinding`/`endBinding`) and cite target gain ONE field:
- **whole section** = `{elementId: frameId}` — today's frame-fallback, byte-identical.
- **child-in-section** = `{sectionId: frameId, elementId: childId}`.
- **region-in-child-in-section** = `{sectionId: frameId, elementId: childId, frac/fracPoly}`.
Cite: `_imgRefClip` (+ each `extra[]`) gains `sec?`; filename codec gains one optional `S<frameId>` segment
(strip-FIRST-to-fit; region survives via `frac/el`); xref/backref entries gain `sec?` (breadcrumb only — the
backref still keys the LEAF guid so ↗ lands deepest). Drop the field → exactly today's behavior.

## Two shared helpers (no parallel system)
- **`_drillTarget(frame, wx, wy)`** → iterate `_frameChildren(frame)` (skip `secHidden`), pick the child under
  (wx,wy) via `hitElement` z-order (child wins over frame), DELEGATE the leaf-locator to the EXISTING
  `_bindingFor(child, wx, wy)`, stamp `sectionId = frame.id`. No child → `{elementId: frame.id}`. Both
  connections AND cite call this.
- **`_showNestingChoice(rows, sx, sy)`** = generalize `_showRegionChoice` to take `[{label, on?, fn}]` rows
  (same `pxc-region-choice` DOM/classes/clamp/dismiss). The 3 existing menus become thin callers (zero behavior
  change). Rows: "Whole section" · per child "Card/Image/Text · <name>" · for image children "Region of <name>"
  (re-arms the EXISTING `_pendingRegionLink` + "Pick a region" flow scoped to the child). Cap the list (≤8 +
  "more…"), keyboard digit-select + Esc (stopPropagation).

## Phased plan (the loop builds these)
- **Phase 0** — model + helpers, NO behavior change: add `sectionId` field; `_drillTarget`; generalize
  `_showRegionChoice → _showNestingChoice` (pure refactor); in `_updateBindings` index loop also add the arrow to
  `byEl[b.sectionId]` (section highlights when its bound). Verify old scenes + all menus look identical.
- **Phase 1 — FIRST SHIP: connection drill-into-section.** onUp: when the target is a frame WITH children, call
  `_drillTarget` + `_showNestingChoice` (whole / child / region-of-image-child). `_bindTargetShape` unchanged
  (resolves `b.elementId` = the child). **MUST: collapse clamp** in `tgt()` — if the resolved child is `secHidden`
  (or its `sectionId` frame is collapsed), route the endpoint to the section title-bar bbox (not off-screen).
  **MUST: self-loop guard** — extend the 3073 exclude logic so a section can't connect to a card inside itself
  (treat `{sectionId,elementId}` and `{elementId:sectionId}` as the same node).
- **Phase 2 — reference parity.** `sec?` on cite targets via the SAME `_drillTarget`; `S<frameId>` filename
  segment (strip-first); carry `sec` through xref/backref (breadcrumb; backref keys the leaf); SAME
  `_showNestingChoice` on Cite; note breadcrumb gains an "in <section>" prefix.
- **Phase 3 — polish (deferred):** per-child sub-menu (drill to a child's lines/regions before committing);
  `_frameChildren` cache keyed by frameId (perf for 100+ child sections; only needed if drill goes per-pointermove —
  keep it drop-time-only until then); collapsed "expand to drill" affordance; depth visual cues.

## Reuse (no duplicates)
`_frameChildren` `:2636` · `_centerIn` `:2635` · `_bindingFor` `:1930` (delegate the child leaf) · `_bindTargetShape`
`:1920` (NO new branch, just the collapse clamp) · `_showRegionChoice`/`_showRefChoice` `:1940/2025` (generalize +
chain) · `_imgRegionWorld`/`_imgRegionFrac` `:1870/1863` · `_updateBindings` byEl index `:2722` · `_copyImageRefToClip`
`:5849` · `_encodeRefFilename`/`_parseRefFilename` `:7151/7179` · xref store `:6900/6912/2439` · `hitFrameBorder`/
`_gridTopFirst` z-order child-wins.

## Locked risks
- Collapsed section + nested binding → clamp to the section title bar (don't route to a hidden child). [Phase 1 MUST]
- Self-loop: section↔its-own-child guard. [Phase 1 MUST]
- Filename length: `S<frameId>` strips FIRST (sec is breadcrumb; degrades to a flat ref). [Phase 2]
- Backward-compat: a flat `{elementId: childId}` made BEFORE this feature stays flat — do NOT auto-promote to
  nested on load. Only NEW menu drops carry `sectionId`.
- Menu bloat: cap rows + scroll/"more" + keyboard select (mirror the Task-Board tall-column guardrail).
- Perf: `_drillTarget` runs `_frameChildren` (O(n)) — drop-time only in Phase 1; cache before any hover preview.
- Nesting assumes non-overlapping frames (the existing frames-as-slides model); overlap → top frame via z-order.
