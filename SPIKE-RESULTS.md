# Phase 1a — Thymer-envelope spike results (verified live 2026-06-15)

Driven via chrome-devtools against the live `svy` workspace (`window.__plexusCanvas.spike.*`).
These are ground truth — the roadmap's adversarial-review blockers were all real, and the
corrections hold.

| Assumption | Verified result | Consequence for the build |
|---|---|---|
| **Blocker #1** — `data.createNewRecord(title)` on a global AppPlugin | returns **`null`** | NEVER use it. Create drawings via `collection.createRecord(title)`. |
| `collection.createRecord(title)` (Examples) | returns a **guid string** (`1G9SFN9…`) | This is the new-drawing path. |
| **(new)** `data.getRecord(guid)` immediately after create | returned **falsy** | New record isn't resolvable synchronously — **poll/retry** (a few × ~50 ms) or fetch on next tick before using it. |
| `data.getAllCollections()` | **36** collections, **synchronous** array | Each has `.getName()`/`.createRecord()`. |
| **Blocker #2** — pending-context map (`this._pending`) set before `createPanel`, read in the mount callback | **survived** — token round-tripped, `dequeuedGuid` correct | This is THE channel to pass the drawing record into the canvas panel. Do NOT stash on the panel object (rule 1). |
| **Blocker #3** — `panel.getActiveRecord()` inside a custom-type panel | **`null`** | Canvas panel cannot resolve its own record; resolve at FLIP time from the editor panel + carry via the pending-map. |
| `createPanel({afterPanel})` + `navigateToCustomType(id)` | panel created, mount fired, `panel.getElement()` present | Works. |
| **Blob ceiling** (unproven) — `uploadBlob` + `blob.download()` round-trip | 1 MB **5 ms** · 5 MB **6 ms** · 20 MB **23 ms**, byte-exact | Blobs are local-first and fast. **No gzip needed in v1.** Scene-in-blob is fully validated. (Server-sync latency via `blob.updated` not measured — local save/load is what the editor loop needs.) |

**Net:** the corrected data model (drawing = record + `Scene Blob` PluginBlob; new-drawing via
`collection.createRecord`; panel context via pending-map; `getActiveRecord` unusable in-panel; blobs
fast at any realistic scene size) is ground-truth-verified. Proceed to the engine (Phase 1b+).

Spike artifacts: test record trashed; 3 probe blobs (1/5/20 MB) are orphaned in the workspace
(no blob-delete MCP tool; harmless, unreferenced).
