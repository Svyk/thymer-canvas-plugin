'use strict';
/*
 * Plexus Canvas — native Thymer infinite-canvas whiteboard (from scratch, no @excalidraw).
 * Single-file plugin.js. Build order: ~/plexus/CANVAS-ROADMAP.md.
 *
 *   Phase 0   skeleton + custom panel + command + hot-reload-safe dispose.
 *   Phase 1a  envelope spike — VERIFIED (SPIKE-RESULTS.md).
 *   Phase 1b  camera/pan/zoom · hand-drawn rough rect/ellipse/diamond · dual-canvas + 1 RAF ·
 *             scene<->blob persistence (Scene = FILE prop) · banner preview · reopen verified.
 *   Phase 2   THIS: toolbar + tools (select / rectangle / ellipse / diamond), create-on-drag,
 *             click-select, drag-move, marquee deselect, Delete, color swatches; selection drawn
 *             on the interactive layer; autosave on every mutation.
 *
 * Rules: 45 · 53 · 21/27 · 1 (pending-map) · 6 (H-scroll guard) · 18/48 (gate on write returning) ·
 *        2 (measured height) · 28 (scoped keydown) · icons validated against the bundled set.
 */

const PLEXUS_VERSION = '0.3.0';
const PANEL_ID = 'plexus-canvas';
const DRAWINGS_COLLECTION = 'Plexus Drawings';
const SCENE_SCHEMA = 1;
const TEST_HOOKS = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PALETTE = ['#1e1e1e', '#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
const FILLS = { '#1e1e1e': 'transparent', '#7c5cff': '#efeaff', '#0ea5e9': '#e0f2fe', '#10b981': '#dcfce7', '#f59e0b': '#fef3c7', '#ef4444': '#fee2e2' };
const TOOLS = [
  { id: 'select', icon: 'ti-pointer', title: 'Select (V)' },
  { id: 'rectangle', icon: 'ti-square', title: 'Rectangle (R)' },
  { id: 'ellipse', icon: 'ti-circle', title: 'Ellipse (O)' },
  { id: 'diamond', icon: 'ti-diamond', title: 'Diamond (D)' },
];

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
  if (opts.fill && opts.fill !== 'transparent') {
    ctx.save(); ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(x + w, my); ctx.lineTo(mx, y + h); ctx.lineTo(x, my); ctx.closePath(); ctx.clip();
    hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore();
  }
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
    elements: [makeRect(40, 40, 220, 140, { stroke: '#7c5cff', fill: '#efeaff', fillStyle: 'hachure' })],
    files: {},
  };
}
function normRect(el) {
  if (el.width < 0) { el.x += el.width; el.width = -el.width; }
  if (el.height < 0) { el.y += el.height; el.height = -el.height; }
}
function sceneBounds(scene) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of scene.elements) {
    if (el.isDeleted) continue;
    minX = Math.min(minX, el.x, el.x + el.width); minY = Math.min(minY, el.y, el.y + el.height);
    maxX = Math.max(maxX, el.x, el.x + el.width); maxY = Math.max(maxY, el.y, el.y + el.height);
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function hitElement(el, wx, wy, tol) {
  const minx = Math.min(el.x, el.x + el.width), maxx = Math.max(el.x, el.x + el.width);
  const miny = Math.min(el.y, el.y + el.height), maxy = Math.max(el.y, el.y + el.height);
  if (wx < minx - tol || wx > maxx + tol || wy < miny - tol || wy > maxy + tol) return false;
  const filled = el.backgroundColor && el.backgroundColor !== 'transparent';
  if (el.type === 'ellipse') {
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    const rx = (maxx - minx) / 2 || 1, ry = (maxy - miny) / 2 || 1;
    const v = ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2;
    if (filled) return v <= 1.04;
    return Math.abs(Math.sqrt(v) - 1) < (tol / Math.min(rx, ry)) + 0.14;
  }
  if (filled) return true;
  const nearV = Math.abs(wx - minx) < tol || Math.abs(wx - maxx) < tol;
  const nearH = Math.abs(wy - miny) < tol || Math.abs(wy - maxy) < tol;
  return nearV || nearH;
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
  for (let i = 0; i < tries; i++) {
    try {
      const blob = await rec.prop('Scene').fileBlob();
      if (blob) { const ab = await blob.download(); if (ab) return JSON.parse(new TextDecoder().decode(ab)); }
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
    this.tool = 'select'; this.selected = new Set();
    this.strokeColor = '#7c5cff'; this.fillColor = FILLS['#7c5cff']; this.fillStyle = 'hachure';
  }
  mount() {
    try { this.panel.setTitle('Plexus'); } catch (_e) {}
    const host = this.host; host.innerHTML = ''; host.classList.add('pxc-host');
    const wrap = document.createElement('div'); wrap.className = 'pxc-root';
    this.staticCv = document.createElement('canvas'); this.staticCv.className = 'pxc-layer pxc-static';
    this.iCv = document.createElement('canvas'); this.iCv.className = 'pxc-layer pxc-interactive';
    this.iCv.tabIndex = 0;
    wrap.appendChild(this.staticCv); wrap.appendChild(this.iCv);
    wrap.appendChild(this._buildToolbar());
    const hint = document.createElement('div'); hint.className = 'pxc-hint';
    hint.textContent = 'V select · R/O/D shapes · drag = pan · scroll = zoom · ⌫ delete';
    wrap.appendChild(hint); host.appendChild(wrap);
    this.wrap = wrap;
    this._resize();
    const ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    ro.observe(this.host.closest('.panel-scroller-y') || wrap); this._localDisposers.push(() => ro.disconnect());
    this._wirePointer();
    this.loadOrInit();
  }
  _buildToolbar() {
    const bar = document.createElement('div'); bar.className = 'pxc-toolbar';
    this._toolBtns = {};
    for (const t of TOOLS) {
      const b = document.createElement('button'); b.className = 'pxc-tool'; b.title = t.title;
      b.innerHTML = '<span class="ti ' + t.icon + '"></span>';
      b.addEventListener('click', () => { this.tool = t.id; this._syncToolbar(); this.iCv.focus(); });
      bar.appendChild(b); this._toolBtns[t.id] = b;
    }
    const sep = document.createElement('div'); sep.className = 'pxc-sep'; bar.appendChild(sep);
    this._swatches = {};
    for (const c of PALETTE) {
      const s = document.createElement('button'); s.className = 'pxc-swatch'; s.title = c;
      s.style.background = c;
      s.addEventListener('click', () => {
        this.strokeColor = c; this.fillColor = FILLS[c] || 'transparent';
        // apply to selection if any
        let changed = false;
        for (const id of this.selected) { const el = this._byId(id); if (el) { el.strokeColor = c; el.backgroundColor = FILLS[c] || 'transparent'; changed = true; } }
        this._syncToolbar(); this.dirty = true; if (changed) this.scheduleSave();
      });
      bar.appendChild(s); this._swatches[c] = s;
    }
    setTimeout(() => this._syncToolbar(), 0);
    return bar;
  }
  _syncToolbar() {
    if (this._toolBtns) for (const id in this._toolBtns) this._toolBtns[id].classList.toggle('active', id === this.tool);
    if (this._swatches) for (const c in this._swatches) this._swatches[c].classList.toggle('active', c === this.strokeColor);
  }
  _resize() {
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
  _byId(id) { return this.scene.elements.find((e) => e.id === id && !e.isDeleted); }
  _hitTopAt(wx, wy) {
    const tol = 6 / this.camera.zoom;
    for (let i = this.scene.elements.length - 1; i >= 0; i--) {
      const el = this.scene.elements[i];
      if (!el.isDeleted && hitElement(el, wx, wy, tol)) return el;
    }
    return null;
  }
  _worldAt(e) { const r = this.wrap.getBoundingClientRect(); return this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top); }
  _wirePointer() {
    const host = this.iCv;
    let mode = null, sx = 0, sy = 0, cx0 = 0, cy0 = 0, down = null, created = null, moveEls = null, moved = false;
    const onDown = (e) => {
      host.focus();
      if (e.button === 1 || (e.button === 0 && e.altKey)) { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.wrap.classList.add('pxc-panning'); return; }
      if (e.button !== 0) return;
      moved = false; down = this._worldAt(e);
      if (this.tool === 'select') {
        const hit = this._hitTopAt(down.x, down.y);
        if (hit) {
          if (!this.selected.has(hit.id)) { if (!e.shiftKey) this.selected.clear(); this.selected.add(hit.id); }
          mode = 'move';
          moveEls = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map((el) => ({ el, x0: el.x, y0: el.y }));
        } else { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; if (!e.shiftKey) this.selected.clear(); this.wrap.classList.add('pxc-panning'); }
      } else {
        mode = 'create';
        created = makeRect(down.x, down.y, 0, 0, { type: this.tool, stroke: this.strokeColor, fill: this.fillColor, fillStyle: this.fillStyle });
        this.scene.elements.push(created); this.selected.clear();
      }
      try { host.setPointerCapture(e.pointerId); } catch (_e) {}
      this.dirty = true;
    };
    const onMove = (e) => {
      if (!mode) return; moved = true;
      if (mode === 'pan') { this.camera.x = cx0 - (e.clientX - sx) / this.camera.zoom; this.camera.y = cy0 - (e.clientY - sy) / this.camera.zoom; this.dirty = true; return; }
      const w = this._worldAt(e);
      if (mode === 'create' && created) { created.x = down.x; created.y = down.y; created.width = w.x - down.x; created.height = w.y - down.y; this.dirty = true; return; }
      if (mode === 'move' && moveEls) { const dx = w.x - down.x, dy = w.y - down.y; for (const m of moveEls) { m.el.x = m.x0 + dx; m.el.y = m.y0 + dy; } this.dirty = true; return; }
    };
    const onUp = (e) => {
      if (!mode) return;
      if (mode === 'create' && created) {
        normRect(created);
        if (created.width < 4 && created.height < 4) { created.isDeleted = true; }
        else { if (created.width < 2) created.width = 8; if (created.height < 2) created.height = 8; this.selected.clear(); this.selected.add(created.id); this.tool = 'select'; this._syncToolbar(); this.scheduleSave(); }
        created = null;
      } else if (mode === 'move' && moveEls) { for (const m of moveEls) normRect(m.el); if (moved) this.scheduleSave(); }
      this.wrap.classList.remove('pxc-panning');
      try { host.releasePointerCapture(e.pointerId); } catch (_e) {}
      mode = null; moveEls = null; this.dirty = true;
    };
    const onWheel = (e) => {
      e.preventDefault();
      const rect = this.wrap.getBoundingClientRect();
      this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
      this.dirty = true; this.scheduleSave();
    };
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selected.size) { e.preventDefault(); for (const id of this.selected) { const el = this._byId(id); if (el) el.isDeleted = true; } this.selected.clear(); this.dirty = true; this.scheduleSave(); } return; }
      const map = { v: 'select', r: 'rectangle', o: 'ellipse', d: 'diamond' };
      if (map[e.key]) { this.tool = map[e.key]; this._syncToolbar(); }
      if (e.key === 'Escape') { this.selected.clear(); this.tool = 'select'; this._syncToolbar(); this.dirty = true; }
    };
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('keydown', onKey);
    this._localDisposers.push(() => {
      host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp); host.removeEventListener('wheel', onWheel); host.removeEventListener('keydown', onKey);
    });
  }
  async loadOrInit() {
    this.rec = await getRecordPoll(this.plugin, this.recordGuid);
    if (this.destroyed) return;
    let fresh = true;
    if (this.rec) {
      let rev = 0; try { rev = this.rec.prop('Scene Rev').number() || 0; } catch (_e) {}
      if (rev > 0) { const loaded = await loadScene(this.rec, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
    }
    const a = this.scene.appState || {};
    this.camera = new Camera(a.scroll ? a.scroll.x : -60, a.scroll ? a.scroll.y : -50, a.zoom || 1);
    this.dirty = true;
    if (fresh && this.rec) this.saveNow();
  }
  render() {
    if (this.destroyed || !this.staticCv) return;
    const z = this.camera.zoom, d = this.dpr;
    // static layer — committed art
    const sctx = this.staticCv.getContext('2d');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = (this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff';
    sctx.fillRect(0, 0, this.staticCv.width, this.staticCv.height);
    sctx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    for (const el of this.scene.elements) if (!el.isDeleted) drawElement(sctx, el);
    // interactive layer — selection
    const ictx = this.iCv.getContext('2d');
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.clearRect(0, 0, this.iCv.width, this.iCv.height);
    if (this.selected.size) {
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      ictx.strokeStyle = '#7c5cff'; ictx.lineWidth = 1.2 / z; ictx.setLineDash([6 / z, 4 / z]);
      const pad = 4 / z;
      for (const id of this.selected) {
        const el = this._byId(id); if (!el) continue;
        const x = Math.min(el.x, el.x + el.width), y = Math.min(el.y, el.y + el.height);
        ictx.strokeRect(x - pad, y - pad, Math.abs(el.width) + pad * 2, Math.abs(el.height) + pad * 2);
      }
      ictx.setLineDash([]);
    }
  }
  scheduleSave() { if (this._saveTimer) clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.saveNow(), 700); }
  async saveNow() { if (!this.rec || this.destroyed) return null; const res = await saveScene(this.plugin, this.rec, this.scene, this.camera); this._lastSave = res; return res; }
  destroy() { this.destroyed = true; if (this._saveTimer) clearTimeout(this._saveTimer); for (const d of this._localDisposers.splice(0)) { try { d(); } catch (_e) {} } }
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

    let raf = 0;
    const tick = () => {
      for (const v of this._views) {
        if (!v.host || !v.host.isConnected) { v.destroy(); this._views.delete(v); continue; }
        if (v.dirty) { try { v.render(); } catch (e) { console.error('[Plexus] render', e); } v.dirty = false; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); reg.add(() => cancelAnimationFrame(raf));

    const onScroll = () => { if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' }); };
    window.addEventListener('scroll', onScroll, { passive: true }); reg.add(() => window.removeEventListener('scroll', onScroll));

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
    if (!col) return null;
    let guid = null; try { guid = col.createRecord('Untitled drawing'); } catch (e) { console.error('[Plexus] createRecord', e); }
    if (typeof guid !== 'string') return null;
    await this._openPanelFor(guid); return guid;
  }
  async _openPanelFor(recordGuid) {
    this._pendingQueue.push(recordGuid);
    const here = this.ui.getActivePanel();
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (!panel) { this._pendingQueue.pop(); return null; }
    panel.navigateToCustomType(PANEL_ID); return panel;
  }
  _mountPanel(panel) {
    const recordGuid = this._pendingQueue.length ? this._pendingQueue.shift() : null;
    if (!recordGuid) {
      panel.setTitle('Plexus'); const host = panel.getElement(); host.innerHTML = ''; host.classList.add('pxc-host');
      const r = document.createElement('div'); r.className = 'pxc-root';
      r.innerHTML = '<div class="pxc-empty">Plexus Canvas<br><small>run “Plexus: New Drawing”</small></div>';
      host.appendChild(r); return;
    }
    const view = new CanvasView(this, panel, recordGuid); this._views.add(view); view.mount();
  }

  _installTestHooks() {
    window.__plexusCanvas.test = {
      newDrawing: () => this._newDrawing(),
      views: () => [...this._views].map((v) => ({ record: v.recordGuid, tool: v.tool, elements: v.scene.elements.filter((e) => !e.isDeleted).length, selected: v.selected.size, zoom: +v.camera.zoom.toFixed(3), w: v.cssW, h: v.cssH, lastSave: v._lastSave || null })),
      // simulate: add N shapes to the active view via the engine (proves the create+save+render path)
      addShapes: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const specs = [['rectangle', 60, 300, 160, 90, '#10b981'], ['ellipse', 260, 300, 120, 120, '#f59e0b'], ['diamond', 60, 430, 140, 100, '#ef4444']];
        for (const [type, x, y, w, h, c] of specs) v.scene.elements.push(makeRect(x, y, w, h, { type, stroke: c, fill: FILLS[c] }));
        v.dirty = true; const saved = await v.saveNow();
        return { elements: v.scene.elements.filter((e) => !e.isDeleted).length, saved };
      },
      selectFirst: () => { const v = [...this._views].pop(); if (!v) return null; const el = v.scene.elements.find((e) => !e.isDeleted); if (el) { v.selected.clear(); v.selected.add(el.id); v.dirty = true; } return { selected: v.selected.size }; },
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
.pxc-host .pxc-root .pxc-interactive { z-index: 2; touch-action: none; cursor: crosshair; outline: none; }
.pxc-host .pxc-root .pxc-interactive:focus { outline: none; }
.pxc-host .pxc-root.pxc-panning .pxc-interactive { cursor: grabbing; }
.pxc-host .pxc-root .pxc-toolbar {
  position: absolute; left: 50%; transform: translateX(-50%); top: 10px; z-index: 5;
  display: flex; align-items: center; gap: 4px; padding: 5px 7px;
  background: var(--cards-bg); border: 1px solid var(--cards-border-color);
  border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.12);
}
.pxc-host .pxc-root .pxc-tool {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 7px; background: transparent;
  color: var(--color-text-400); cursor: pointer; font-size: 16px; padding: 0;
}
.pxc-host .pxc-root .pxc-tool:hover { background: var(--sidebar-bg-hover); }
.pxc-host .pxc-root .pxc-tool.active { background: var(--button-primary-bg-color, #7c5cff); color: #fff; border-color: transparent; }
.pxc-host .pxc-root .pxc-sep { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--cards-border-color); }
.pxc-host .pxc-root .pxc-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.pxc-host .pxc-root .pxc-swatch.active { border-color: var(--color-text-400); box-shadow: 0 0 0 2px var(--cards-bg), 0 0 0 3px var(--color-text-400); }
.pxc-host .pxc-root .pxc-hint {
  position: absolute; left: 10px; bottom: 8px; z-index: 3; pointer-events: none;
  font-size: 11px; opacity: .42; color: var(--color-text-400);
}
.pxc-host .pxc-empty {
  min-height: calc(100vh - 140px); display: flex; align-items: center; justify-content: center;
  text-align: center; opacity: .65; font-size: 14px; line-height: 1.6;
}
.pxc-host .pxc-empty small { opacity: .7; }
`;
