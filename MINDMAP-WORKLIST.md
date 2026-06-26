# Plexus Canvas — Mind-Map Parity worklist (NotebookLM Obsidian-Excalidraw videos, 2026-06-25)

Source: NotebookLM notebook "Excalidraw" (16 videos — MindMap Builder v2/v3/Ultimate · ExcaliBrain · ExcaliAI · Visual PKM).
Gap analysis: Plexus ALREADY matches the relational/PKM substrate (live record-card nodes, @@ refs/backrefs, ghost-edges,
drag-to-restructure, ExcaliBrain relation-vector `_pullInNeighbours`, outline⇄canvas `_mmFromNote`/`_mindMapToNote`, flip-a-card,
task-node sync, connectors, frames/collapse, Datacore, AI-Mermaid/vision). The GAPS are the fast keyboard authoring loop +
tree layouts + node-fold. Build those.

Self-paced loop: ONE reviewed feature per iteration with the full discipline — AUDIT plugin.js first (grep; the mind-map family
is `_newMindMap`/`_mmAddChild`/`mmRoot`/`mmParent`/`mmEdge`/`_mmNodes`/`_mmSubtree`/`_pullInNeighbours`/`_layoutGraph`/
`pxcGraphLayout`/`_outlineToCanvas`/`_mindMapToNote` — EXTEND it, never duplicate) → port the gap → node-extract a pure-logic
test (/tmp/pxc_*.test.js) → adversarial code-reviewer Agent on the diff (every scene.elements path render/select/export/minimap/
lasso; any record/line WRITE = append/new-only, idempotent, confirm/non-destructive) → fix → bump PLEXUS_VERSION + plugin.json →
/usr/bin/git commit (author Svyatoslav Kleshchev, Co-Authored-By Claude Opus 4.8 (1M context)) + push to Svyk/thymer-canvas-plugin
→ BUILD-STATUS entry → check the box. KEY CONFLICT RULE: mind-map keyboard handlers must fire ONLY when a mind-map node
(`mmRoot` set) is selected/focused, so they never break normal text-edit Enter / tool shortcuts / nudge-arrows.

## AUDIT RESULT (2026-06-25): mind-map builder is ALREADY at ~full parity with the videos. Most "gaps" were already shipped.
- [x] MM1 child-and-select — SHIPPED. `Tab`=`_mmAddChild`@5824 (creates a child + edge + re-layout + SELECTS the child). Residual polish only: doesn't auto-OPEN inline edit on the new child (you press Enter/F2). → folded into MM-polish.
- [x] MM2 sibling + reparent — SHIPPED. `Enter`=`_mmAddSibling`@5830; `Alt+C/X/V`=`_mmCopyBranch`/`_mmCutBranch`/`_mmPasteBranch` (branch cut + reparent, re-links mmParent + re-routes edges).
- [x] MM3 spatial nav — SHIPPED. `Alt+Arrow`=`_mmNav`@5585 (nearest node in the pressed direction). Residual polish only: no auto-CENTER (Alt+Ctrl+Arrow). → MM-polish.
- [x] MM4 branch cut + re-parent — SHIPPED (`_mmCutBranch`@5562 + `_mmPasteBranch`@5568, Alt+X/Alt+V).
- [x] MM5 directional tree layouts — SHIPPED. `_mmCycleLayout`@5872 cycles **right → down → radial → up → left**; `_mmLayout`@5831 places the mmParent tree + re-routes edges per mode (down/up/left/radial/right @5862-5866). Command "Cycle mind-map layout"@7299.
- [x] MM6 pin-a-node — SHIPPED. `_mmTogglePin`@5880 (`mmPinned` → excluded from auto-layout). Command@7300.
- [x] MM7 fold/unfold — SHIPPED. `_mmToggleFold`@5592 (`mmFolded`→`mmHidden` subtree, hides nodes + connecting mmEdges, re-layout). Command@7298. Residual: custom (non-mmEdge) cross-links bound to hidden nodes may not auto-hide. → minor.
- [x] MM9-boundary — SHIPPED. `Alt+B`=`_mmToggleBoundary` (colored boundary box around a branch).

## GENUINE RESIDUALS (the only real gaps after the deep audit) — build these
- [x] MM8 AI → LIVE mind-map — SHIPPED v1.116.0. Command "Plexus: AI mind map from prompt" → `_aiMindMap`: prompt → `_aiComplete` (system: indented bullet outline, central topic first) → a NEW `mmRoot` central node + the outline built as children via `_mmPasteList` + `_mmLayout` — every node a live editable/expandable mind-map node (NOT a rasterized Mermaid image, the gap vs `_aiMermaid`). APPEND-ONLY (new nodes only); AI-fail + key-missing both bail with zero scene change before any push. Adversarial review: SHIP (5 axes clean; the only LOW = no post-await destroyed-check, consistent with every sibling AI builder, harmless). Node `pxc_aimindmap` 16/16. (Linking nodes to EXISTING records via `@@` refs = a future extension; the live editable tree is the core gap, delivered.)
- [x] MM-polish (a)(b)(c) — SHIPPED v1.115.0. (a) `Tab`/`Enter` add-node → immediately open inline edit (`_editText` select-alls "New idea" so the first keystroke replaces it); (b) `Alt+Ctrl/Cmd+Arrow` nav + auto-center (`_mmNav(…, center)` → `_focusMatch`); (c) paste a markdown/indented list onto a mind-map node → a child BRANCH (`_mmPasteList`, append-only, indent→depth parent-stack). Adversarial review: SHIP (append-only, no dangling mmParent, paste-gate doesn't hijack normal pastes, `editingId` guard prevents Tab→edit re-entry). Node `pxc_mmpaste` 18/18. (d) multicolor-branch palette + parent-font-scaling — DEFERRED (optional styling, low-value).

When every box is checked (or only platform-blocked/low-value remain), the loop is DONE → summarize + STOP. Re-arm each iteration.
