'use strict';
/*
 * Plexus Canvas — native Thymer infinite-canvas whiteboard (from scratch, no @excalidraw).
 * Single-file plugin.js (esbuild monorepo comes when vendored libs push it past the MCP ceiling).
 * Build order: ~/plexus/CANVAS-ROADMAP.md.
 *
 *   Phase 0   skeleton + custom panel + command + hot-reload-safe dispose.
 *   Phase 1a  envelope spike — VERIFIED (see SPIKE-RESULTS.md).
 *   Phase 1b  camera (pan/zoom), hand-drawn rough rect/ellipse/diamond, dual-canvas renderer + 1
 *             disposable RAF, scene<->blob persistence (Scene = FILE property via setFileFromBlob/
 *             fileBlob — no getBlob(guid) exists), banner PNG preview. Panel height taken from the
 *             scroller ancestor (host collapses to ~0; rule 2 — never height:100%).
 *
 * Rules: 45 · 53 · 21/27 · 1 (pending-map) · 6 (H-scroll guard) · 18/48 (gate on write returning,
 *        never a renderer read-back) · 2 (measured/vh height, not height:100%).
 */

const PLEXUS_VERSION = '0.2.2';
const PANEL_ID = 'plexus-canvas';
const DRAWINGS_COLLECTION = 'Plexus Drawings';
const SCENE_SCHEMA = 1;
const TEST_HOOKS = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── hot-reload singleton ───────────────────────── */
function freshRegistry() {
  return {
    disposers: [],
    add(fn) { if (typeof fn === 'function') this.disposers.push(fn); return fn; },
    dispose() { for (const d of this.disposers.splice(0)) { try { d(); } catch (_e) {} } },
  };
}

/* ─────────────────────────── rough (hand-drawn) ─────────────────────────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function roughSeg(ctx, x1, y1, x2, y2, rng, r) {
  for (let p = 0; p < 2; p++) {
    const o = () => (rng() * 2 - 1) * r;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1 + o(), y1 + o());
    ctx.quadraticCurveTo(mx + o(), my + o(), x2 + o(), y2 + o());
    ctx.stroke();
  }
}
function hachure(ctx, x, y, w, h, color, sw, rng) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, sw * 0.5);
  const gap = 8;
  for (let d = -h; d < w + h; d += gap) {
    const j = (rng() * 2 - 1) * 1.5;
    ctx.beginPath(); ctx.moveTo(x + d + j, y); ctx.lineTo(x + d - h + j, y + h); ctx.stroke();
  }
  ctx.restore();
}
function applyStroke(ctx, opts) {
  ctx.lineWidth = opts.strokeWidth || 2;
  ctx.strokeStyle = opts.stroke || '#1e1e1e';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.globalAlpha = opts.opacity == null ? 1 : opts.opacity;
}
function roughRect(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const r = (opts.roughness == null ? 1 : opts.roughness) * 1.4;
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') {
    if (opts.fillStyle === 'solid') { ctx.save(); ctx.globalAlpha = (opts.opacity == null ? 1 : opts.opacity); ctx.fillStyle = opts.fill; ctx.fillRect(x, y, w, h); ctx.restore(); }
    else hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng);
  }
  roughSeg(ctx, x, y, x + w, y, rng, r);
  roughSeg(ctx, x + w, y, x + w, y + h, rng, r);
  roughSeg(ctx, x + w, y + h, x, y + h, rng, r);
  roughSeg(ctx, x, y + h, x, y, rng, r);
  ctx.restore();
}
function roughEllipse(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const r = (opts.roughness == null ? 1 : opts.roughness) * 1.2;
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 7); ctx.clip(); hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  const N = 18; let started = false;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx + (rng() * 2 - 1) * r;
    const py = cy + Math.sin(a) * ry + (rng() * 2 - 1) * r;
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke(); ctx.restore();
}
function roughDiamond(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const r = (opts.roughness == null ? 1 : opts.roughness) * 1.4;
  const mx = x + w / 2, my = y + h / 2;
  ctx.save(); applyStroke(ctx, opts);
  roughSeg(ctx, mx, y, x + w, my, rng, r);
  roughSeg(ctx, x + w, my, mx, y + h, rng, r);
  roughSeg(ctx, mx, y + h, x, my, rng, r);
  roughSeg(ctx, x, my, mx, y, rng, r);
  ctx.restore();
}
function drawElement(ctx, el) {
  const opts = { stroke: el.strokeColor, strokeWidth: el.strokeWidth, fill: el.backgroundColor, fillStyle: el.fillStyle, roughness: el.roughness, opacity: el.opacity };
  switch (el.type) {
    case 'rectangle': return roughRect(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
    case 'ellipse': return roughEllipse(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
    case 'diamond': return roughDiamond(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
    default: return;
  }
}

/* ─────────────────────────────── scene model ─────────────────────────────── */
let _idCounter = 0;
function newId() { return 'el' + Date.now().toString(36) + (_idCounter++).toString(36); }
function newSeed() { return (Math.random() * 1e9) | 0; }
function makeRect(x, y, w, h, style) {
  return {
    id: newId(), type: style.type || 'rectangle', x, y, width: w, height: h, angle: 0,
    strokeColor: style.stroke || '#1e1e1e', backgroundColor: style.fill || 'transparent',
    fillStyle: style.fillStyle || 'hachure', strokeWidth: style.strokeWidth || 2,
    roughness: 1, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
function newScene() {
  return {
    type: 'plexus-canvas', schema: SCENE_SCHEMA,
    appState: { viewBackgroundColor: '#ffffff', gridModeEnabled: false, gridSize: 20, theme: 'light', scroll: { x: -60, y: -50 }, zoom: 1 },
    elements: [
      makeRect(40, 40, 220, 140, { stroke: '#7c5cff', fill: '#efeaff', fillStyle: 'hachure' }),
      makeRect(300, 110, 150, 110, { type: 'ellipse', stroke: '#0ea5e9', fill: '#e0f2fe' }),
    ],
    files: {},
  };
}
function sceneBounds(scene) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of scene.elements) {
    if (el.isDeleted) continue;
    minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width); maxY = Math.max(maxY, el.y + el.height);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ───────────────────────────────── camera ───────────────────────────────── */
class Camera {
  constructor(x = 0, y = 0, zoom = 1) { this.x = x; this.y = y; this.zoom = zoom; }
  screenToWorld(sx, sy) { return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y }; }
  zoomAt(sx, sy, factor) {
    const nz = Math.min(30, Math.max(0.05, this.zoom * factor));
    const wx = sx / this.zoom + this.x, wy = sy / this.zoom + this.y;
    this.x = wx - sx / nz; this.y = wy - sy / nz; this.zoom = nz;
  }
}

/* ───────────────────────── persistence (Scene = FILE prop) ───────────────────────── */
async function getRecordPoll(plugin, guid, tries = 25) {
  for (let i = 0; i < tries; i++) {
    try { const r = await plugin.data.getRecord(guid); if (r) return r; } catch (_e) {}
    await sleep(60);
  }
  return null;
}
async function loadScene(rec, tries = 1) {
  // fileBlob() lags right after a write (rule 18) — poll a few times when we expect a scene.
  for (let i = 0; i < tries; i++) {
    try {
      const blob = await rec.prop('Scene').fileBlob();
      if (blob) {
        const ab = await blob.download();
        if (ab) return JSON.parse(new TextDecoder().decode(ab));
      }
    } catch (_e) {}
    if (i < tries - 1) await sleep(120);
  }
  return null;
}
function exportPng(scene, maxPx = 1024) {
  return new Promise((resolve) => {
    try {
      const b = sceneBounds(scene); const pad = 24;
      const w = b.w + pad * 2, h = b.h + pad * 2;
      const scale = Math.min(2, maxPx / Math.max(w, h, 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = scene.appState.viewBackgroundColor || '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(scale, 0, 0, scale, (-b.x + pad) * scale, (-b.y + pad) * scale);
      for (const el of scene.elements) if (!el.isDeleted) drawElement(ctx, el);
      cv.toBlob((blob) => resolve(blob), 'image/png');
    } catch (_e) { resolve(null); }
  });
}
async function saveScene(plugin, rec, scene, camera) {
  // Runtime trust = uploadBlob non-null + setFileFromBlob true; NEVER a renderer read-back (Major #4).
  scene.appState.scroll = { x: camera.x, y: camera.y };
  scene.appState.zoom = camera.zoom;
  const file = new File([JSON.stringify(scene)], 'scene.json', { type: 'application/json' });
  const blob = await plugin.data.uploadBlob(file);
  if (!blob) return { ok: false, reason: 'uploadBlob null' };
  let ok = false;
  try { ok = rec.prop('Scene').setFileFromBlob(blob); } catch (e) { return { ok: false, reason: String(e) }; }
  try {
    const cur = rec.prop('Scene Rev').number() || 0;
    rec.prop('Scene Rev').set(cur + 1);
    rec.prop('Scene Schema').set(scene.schema || SCENE_SCHEMA);
  } catch (_e) {}
  try {
    const png = await exportPng(scene);
    if (png) { const pb = await plugin.data.uploadBlob(new File([png], 'preview.png', { type: 'image/png' })); if (pb) rec.setBannerFromBlob(pb); }
  } catch (_e) {}
  return { ok, blobGuid: blob.guid };
}

/* ──────────────────────────────── canvas view ──────────────────────────────── */
class CanvasView {
  constructor(plugin, panel, recordGuid) {
    this.plugin = plugin; this.panel = panel; this.recordGuid = recordGuid;
    this.host = panel.getElement(); this.rec = null;
    this.scene = newScene(); this.camera = new Camera();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.dirty = true; this.destroyed = false; this._saveTimer = null; this._localDisposers = [];
  }
  mount() {
    try { this.panel.setTitle('Plexus'); } catch (_e) {}
    const host = this.host; host.innerHTML = ''; host.classList.add('pxc-host');
    const wrap = document.createElement('div'); wrap.className = 'pxc-root';
    this.staticCv = document.createElement('canvas'); this.staticCv.className = 'pxc-layer pxc-static';
    this.iCv = document.createElement('canvas'); this.iCv.className = 'pxc-layer pxc-interactive';
    wrap.appendChild(this.staticCv); wrap.appendChild(this.iCv);
    const hint = document.createElement('div'); hint.className = 'pxc-hint';
    hint.textContent = 'drag = pan · scroll = zoom';
    wrap.appendChild(hint); host.appendChild(wrap);
    this.wrap = wrap;
    this._resize();
    // Observe the panel SCROLLER (which has the real height) — the host collapses, so observing
    // the wrap would never catch panel/window resizes (GUARDRAILS: scroller doesn't propagate height).
    const ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    const scroller = this.host.closest('.panel-scroller-y') || wrap;
    ro.observe(scroller); this._localDisposers.push(() => ro.disconnect());
    this._wirePointer();
    this.loadOrInit();
  }
  _resize() {
    // The panel content area collapses to ~0 height; take the height from the scroller ancestor
    // and set it explicitly (rule 2 — measured px, never height:100% which degrades to auto).
    const scroller = this.host.closest('.panel-scroller-y') || this.host.closest('.panel') || this.host.parentElement;
    let h = scroller ? scroller.clientHeight : 0;
    if (!h || h < 80) h = Math.max(320, (window.innerHeight || 800) - 120);
    this.wrap.style.height = h + 'px';
    const w = this.wrap.clientWidth || this.host.clientWidth || 600;
    for (const cv of [this.staticCv, this.iCv]) {
      cv.width = Math.round(w * this.dpr); cv.height = Math.round(h * this.dpr);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
    }
    this.cssW = w; this.cssH = h;
  }
  _wirePointer() {
    const host = this.iCv;
    let panning = false, sx = 0, sy = 0, cx0 = 0, cy0 = 0;
    const down = (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      panning = true; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y;
      try { host.setPointerCapture(e.pointerId); } catch (_e) {}
      this.wrap.classList.add('pxc-panning');
    };
    const move = (e) => {
      if (!panning) return;
      this.camera.x = cx0 - (e.clientX - sx) / this.camera.zoom;
      this.camera.y = cy0 - (e.clientY - sy) / this.camera.zoom;
      this.dirty = true;
    };
    const up = (e) => { if (!panning) return; panning = false; this.wrap.classList.remove('pxc-panning'); try { host.releasePointerCapture(e.pointerId); } catch (_e) {} this.scheduleSave(); };
    const wheel = (e) => {
      e.preventDefault();
      const rect = this.wrap.getBoundingClientRect();
      this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
      this.dirty = true; this.scheduleSave();
    };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('wheel', wheel, { passive: false });
    this._localDisposers.push(() => {
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up); host.removeEventListener('wheel', wheel);
    });
  }
  async loadOrInit() {
    this.rec = await getRecordPoll(this.plugin, this.recordGuid);
    if (this.destroyed) return;
    let fresh = true;
    if (this.rec) {
      let rev = 0; try { rev = this.rec.prop('Scene Rev').number() || 0; } catch (_e) {}
      if (rev > 0) { // existing drawing — poll past the read-lag
        const loaded = await loadScene(this.rec, 10);
        if (loaded && loaded.elements) { this.scene = loaded; fresh = false; }
      }
    }
    const a = this.scene.appState || {};
    this.camera = new Camera(a.scroll ? a.scroll.x : -60, a.scroll ? a.scroll.y : -50, a.zoom || 1);
    this.dirty = true;
    if (fresh && this.rec) this.saveNow();
  }
  render() {
    if (this.destroyed || !this.staticCv) return;
    const ctx = this.staticCv.getContext('2d');
    const cw = this.staticCv.width, ch = this.staticCv.height, z = this.camera.zoom, d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = (this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    for (const el of this.scene.elements) if (!el.isDeleted) drawElement(ctx, el);
  }
  scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 900);
  }
  async saveNow() {
    if (!this.rec || this.destroyed) return null;
    const res = await saveScene(this.plugin, this.rec, this.scene, this.camera);
    this._lastSave = res; return res;
  }
  destroy() {
    this.destroyed = true;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    for (const d of this._localDisposers.splice(0)) { try { d(); } catch (_e) {} }
  }
}

/* ─────────────────────────────────── plugin ─────────────────────────────────── */
class Plugin extends AppPlugin {
  onLoad() {
    try { window.__plexusCanvas && window.__plexusCanvas.dispose(); } catch (_e) {}
    const reg = freshRegistry(); this._reg = reg;
    this._pendingQueue = []; this._views = new Set(); this._drawingsCol = null;

    window.__plexusCanvas = { version: PLEXUS_VERSION, dispose: () => this._teardown() };
    console.log('%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded', 'color:#7c5cff;font-weight:bold');

    this.ui.injectCSS(BASE_CSS);
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));

    this.ui.addCommandPaletteCommand({ label: 'Plexus: New Drawing', icon: 'ti-photo', onSelected: () => this._newDrawing() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Open Canvas (blank panel)', icon: 'ti-pencil', onSelected: () => this._openPanelFor(null) });

    // One shared RAF loop for all views (rule: a single disposable loop).
    let raf = 0;
    const tick = () => {
      for (const v of this._views) {
        if (!v.host || !v.host.isConnected) { v.destroy(); this._views.delete(v); continue; }
        if (v.dirty) { try { v.render(); } catch (e) { console.error('[Plexus] render', e); } v.dirty = false; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    reg.add(() => cancelAnimationFrame(raf));

    // H-scroll guard (rule 6): wide content must never shift the sidebar off-screen.
    const onScroll = () => { if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' }); };
    window.addEventListener('scroll', onScroll, { passive: true });
    reg.add(() => window.removeEventListener('scroll', onScroll));

    if (TEST_HOOKS) this._installTestHooks();
  }

  _teardown() { for (const v of this._views) { try { v.destroy(); } catch (_e) {} } this._views.clear(); try { this._reg.dispose(); } catch (_e) {} }
  onUnload() { this._teardown(); window.__plexusCanvas = undefined; }

  async _drawingsCollection() {
    if (this._drawingsCol) return this._drawingsCol;
    const cols = await this.data.getAllCollections();
    this._drawingsCol = (cols || []).find((c) => c.getName && c.getName() === DRAWINGS_COLLECTION) || null;
    return this._drawingsCol;
  }

  async _newDrawing() {
    const col = await this._drawingsCollection();
    if (!col) { try { this.ui.showToaster && this.ui.showToaster({ message: 'Plexus Drawings collection not found' }); } catch (_e) {} return null; }
    let guid = null;
    try { guid = col.createRecord('Untitled drawing'); } catch (e) { console.error('[Plexus] createRecord', e); }
    if (typeof guid !== 'string') return null;
    await this._openPanelFor(guid);
    return guid;
  }

  async _openPanelFor(recordGuid) {
    this._pendingQueue.push(recordGuid); // FIFO: paired with the next mount (Blocker #2 channel)
    const here = this.ui.getActivePanel();
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (!panel) { this._pendingQueue.pop(); return null; }
    panel.navigateToCustomType(PANEL_ID);
    return panel;
  }

  _mountPanel(panel) {
    const recordGuid = this._pendingQueue.length ? this._pendingQueue.shift() : null;
    if (!recordGuid) {
      panel.setTitle('Plexus'); const host = panel.getElement(); host.innerHTML = '';
      host.classList.add('pxc-host');
      const r = document.createElement('div'); r.className = 'pxc-root';
      r.innerHTML = '<div class="pxc-empty">Plexus Canvas<br><small>run “Plexus: New Drawing”</small></div>';
      host.appendChild(r); return;
    }
    const view = new CanvasView(this, panel, recordGuid);
    this._views.add(view);
    view.mount();
  }

  _installTestHooks() {
    window.__plexusCanvas.test = {
      newDrawing: () => this._newDrawing(),
      views: () => [...this._views].map((v) => ({ record: v.recordGuid, elements: v.scene.elements.length, zoom: +v.camera.zoom.toFixed(3), w: v.cssW, h: v.cssH, lastSave: v._lastSave || null, mounted: !!v.staticCv })),
      saveActive: async () => { const v = [...this._views].pop(); return v ? await v.saveNow() : null; },
      reopen: async (guid) => {
        const rec = await getRecordPoll(this, guid);
        if (!rec) return { error: 'no record' };
        let rev = null; try { rev = rec.prop('Scene Rev').number(); } catch (_e) {}
        const s = await loadScene(rec, 15);
        return { rev, loaded: !!s, elements: s && s.elements && s.elements.length, zoom: s && s.appState && s.appState.zoom, scrollX: s && s.appState && s.appState.scroll && s.appState.scroll.x };
      },
      roundTrip: async () => {
        const col = await this._drawingsCollection(); if (!col) return { error: 'no collection' };
        const guid = col.createRecord('RT test (delete me)'); if (typeof guid !== 'string') return { error: 'createRecord', guid };
        const rec = await getRecordPoll(this, guid); if (!rec) return { error: 'getRecord poll failed', guid };
        const scene = newScene(); scene.__marker = 'rt-' + Date.now();
        const cam = new Camera(-12, -34, 1.5);
        const saved = await saveScene(this, rec, scene, cam);
        const rec2 = await getRecordPoll(this, guid); // re-fetch: same-object readback is stale (rule 18)
        const loaded = await loadScene(rec2 || rec, 12);
        return {
          guid, saved,
          loadedOk: !!loaded,
          markerMatch: loaded && loaded.__marker === scene.__marker,
          elementsMatch: loaded && loaded.elements && loaded.elements.length === scene.elements.length,
          cameraRestored: loaded && loaded.appState && loaded.appState.zoom === 1.5 && loaded.appState.scroll && loaded.appState.scroll.x === -12,
        };
      },
    };
  }
}

const BASE_CSS = `
.pxc-host { position: relative; }
.pxc-host .pxc-root {
  position: relative; width: 100%; overflow: hidden;
  background: var(--color-bg-900); color: var(--color-text-400);
  font-family: var(--font-family, system-ui, sans-serif);
}
.pxc-host .pxc-root .pxc-layer { position: absolute; inset: 0; display: block; }
.pxc-host .pxc-root .pxc-static { z-index: 1; }
.pxc-host .pxc-root .pxc-interactive { z-index: 2; touch-action: none; cursor: grab; }
.pxc-host .pxc-root.pxc-panning .pxc-interactive { cursor: grabbing; }
.pxc-host .pxc-root .pxc-hint {
  position: absolute; left: 10px; bottom: 8px; z-index: 3; pointer-events: none;
  font-size: 11px; opacity: .45; color: var(--color-text-400);
}
.pxc-host .pxc-empty {
  min-height: calc(100vh - 140px); display: flex; align-items: center; justify-content: center;
  text-align: center; opacity: .65; font-size: 14px; line-height: 1.6;
}
.pxc-host .pxc-empty small { opacity: .7; }
`;
