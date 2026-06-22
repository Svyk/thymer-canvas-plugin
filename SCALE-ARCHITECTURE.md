# Plexus Canvas — near-unlimited scale architecture (CONFIRMED 2026-06-22)

Validated by a 3-angle workflow (SDK limits · render/memory · persistence) + synthesis.
Goal: ONE canvas record holding **10k+ images AND 10k+ shapes, staying fast**, with
**everything persisted in Thymer record storage** (properties / record-attached blobs),
not loose blobs.

## The decisive finding
Thymer has **no append for file properties** — `set()`/`setFileFromBlob()` REPLACE the whole
value array (types.d.ts:2989-2995; no `addFile()`). One unbounded `Assets` many-property would
be **O(N) per insert → O(N²)/session**. There IS `addValue(v)` (types.d.ts:2998 — adds ONE value
to a multi-value prop), and a `PropertyFileValue{guid}` can be built from an uploaded blob, so an
API-level append exists — but its backend cost + file support is unverified. **So we SHARD with a
fixed cap regardless** → every write touches at most one capped array → constant per insert →
linear total, fast even if the backend write is O(array).

Plugin **cannot create properties from code** (no `addProperty`/`addField` in the SDK). Existing
`Scene` storage already falls back to a **body `file` line-item** when the property is absent
(plugin.js:1384-1406). So the universal, zero-setup, GC-safe substrate = **prefer a property,
fall back to a body file line-item**. Blobs are resolved by **blob-guid** via
`getBlobFromPropertyFileValue({guid})` → `download()` (O(1), no enumeration; the line-item/property
is just the GC anchor).

Render bonus: a **spatial grid already exists** (`_ensureGrid`/`grid.query`) → cull + hit-test are
already O(visible). Render work is hardening, not a rewrite.

## Confirmed architecture (4 pillars)
1. **ASSETS (images):** 1 Thymer blob per image. Insert-time transcode: HEIC/JPEG/PNG/any →
   `createImageBitmap`/`<img>` decode (HEIC feature-detected; toast→convert-to-JPEG on failure) →
   offscreen canvas capped **1600px longest edge** → `toBlob('image/webp', 0.8)` → ~120-250KB →
   `uploadBlob` → `{guid}`. Referenced as ONE value in a **sharded** many-file property
   `Assets_0..K` (cap **C=64**), or a body file line-item fallback. Scene/chunk JSON stores only
   `{blobGuid,w,h,natW,natH}` — NEVER base64. Decode lazy, **cull-gated**, LRU 120, objectURL-revoke
   + `img.src=''` on evict. → UNLIMITED IMAGES.
2. **SHAPES/CHUNKS:** scene split into **2000px spatial tiles**; each chunk
   `{chunkId,bbox,elements,rev}` → blob → one value in sharded `Chunks_0..M` (cap **C=128**).
   **Delta save:** `_dirtyChunks` filled on edit; debounced save re-uploads only dirty chunks into
   their fixed (shard,slot). Save = O(changed chunks), not O(scene). Drag-across-boundary: move on
   COMMIT (pointerup), both chunks dirtied. → UNLIMITED SHAPES.
3. **INDEX/MANIFEST:** ONE single-valued `Manifest` blob = `{schemaVersion, chunkTable, assetTable,
   arrowsBlobGuid, shardFill, pending[]}`. Written **LAST** (transactional; `pending[]` = crash
   recovery). Cross-chunk **arrows** live in a dedicated single `Arrows` blob (not duplicated into
   tiles). Load: Manifest first → build spatial grid → fetch ONLY viewport-intersecting chunks.
   Backward-compat loader: Manifest → legacy single `Scene` blob/body-line → migrate.
4. **RENDER/MEMORY:** cull-gated decode start; ≤20 GPU texture uploads/frame (queue overflow);
   WebGL texture LRU (`gl.deleteTexture`) mirroring the canvas2d cache + objectURL revoke;
   incremental `grid.insertOne` + debounced batched rebuilds; adaptive cell size; memoized +
   move-gated hit-tests (erase >4px, bind-snap >8px); Promise.all-batched uploads; capped undo;
   idle tombstone compaction.

## Scaling proof (cost model)
- **Images:** per-insert = transcode (~5-30ms) + 1 upload + 1 sharded write O(C=64) = **constant**,
  independent of total. Session = O(N) linear (not O(N²)). Per-frame = cull-gated, LRU 120,
  ≤20 uploads/frame. RAM ≈ 120×~5MB ≈ 600MB worst case; refs ~40B → 100k refs ≈ 4MB.
- **Shapes:** per-save = only dirty chunks. Typical edit = 1 chunk = ~2 blob writes, **independent
  of scene size** (100k-shape canvas saves as fast as 1k when one shape moves). M chunks over life
  = O(M) linear. Per-frame = spatial grid O(visible); only intersecting chunks resident.
- **Speed:** every hot path bounded by a **fixed shard/viewport constant** — never total count.

## Phased build
- **Phase 1 — UNBLOCK SAVING TODAY:** transcode-on-insert (incl. HEIC) in `_addImageFromFile`;
  store `{blobGuid,w,h}` not `{dataURL}`; externalize to the asset store (prefer an `Assets` many
  property via addValue+read-back guard, else body file line-item); MIGRATE legacy inline
  `dataURL` on load/save → transcode → externalize → drop dataURL → the **single `Scene` blob
  shrinks 25MB→<1MB and saves again**; lazy decode from blob into the existing LRU (+ revoke on
  evict). Keep the monolithic Scene save for now.
- **Phase 2 — SHARD + CAP Assets:** enforce C=64; route to active shard, roll at cap; assetTable +
  shardFill bookkeeping; parallel multi-shard read on load + de-dupe by guid.
- **Phase 3 — CHUNK shapes + DELTA save + MANIFEST:** 2000px chunks, sharded `Chunks_*`, `Manifest`,
  `_dirtyChunks`, dedicated `Arrows` blob, transactional save + crash recovery; migrate legacy
  single-Scene → chunks behind `schemaVersion`; viewport-only chunk load.
- **Phase 4 — RENDER/MEMORY hardening:** the pillar-4 list.

## Open risks (all mitigated)
- many-property write cost: de-risked **by construction** (shard cap bounds N); a quick profile
  (write 200 file-values to one prop vs sharded) during P1/P2 picks final C.
- undocumented per-record blob/value cardinality ceiling → fall back to **packing** (10-50 webp per
  container blob with an `[offset,size]` index); Manifest abstracts asset location so packing is
  localized.
- HEIC decode is environment-dependent → **feature-detect**, toast convert-to-JPEG on failure.
- `getBlobFromPropertyFileValue` needs a guid-backed fv (not imgData/imgUrl) → persist guid-backed,
  verify via `files()` read-back (same guard proven for Scene).
- multi-write save crash-consistency → Manifest written LAST + `pending[]` merge on load; needs a
  deliberate kill-mid-save test.
