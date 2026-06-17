'use strict';
/*
 * Plexus Canvas — native Thymer infinite-canvas whiteboard (from scratch, no @excalidraw).
 * Single-file plugin.js. Build order: ~/plexus/CANVAS-ROADMAP.md. See BUILD-STATUS.md.
 *
 *   Phase 0/1a/1b/2 — DONE (skeleton · envelope spike · camera+rough+persistence · toolbar+tools).
 *   Phase 3   THIS: transform — 8 resize handles + rotate handle, OBB resize in the element's local
 *             frame (works rotated), rotation rendering + rotated hit-testing, 15° rotate snap (Shift).
 *
 * Rules: 45 · 53 · 21/27 · 1 · 6 · 18/48 · 2 · 28 · icons validated.
 */

const PLEXUS_VERSION = '0.19.0';
const PANEL_ID = 'plexus-canvas';
const DRAWINGS_COLLECTION = 'Plexus Drawings';
const SCENE_SCHEMA = 1;
const SCENE_FILENAME = 'plexus-scene.json'; // sentinel: the file line item that carries a record's scene
const TEST_HOOKS = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PALETTE = ['#1e1e1e', '#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
const FILLS = { '#1e1e1e': 'transparent', '#7c5cff': '#efeaff', '#0ea5e9': '#e0f2fe', '#10b981': '#dcfce7', '#f59e0b': '#fef3c7', '#ef4444': '#fee2e2' };
const TOOLS = [
  { id: 'select', icon: 'ti-pointer', title: 'Select (V)' },
  { id: 'rectangle', icon: 'ti-square', title: 'Rectangle (R)' },
  { id: 'ellipse', icon: 'ti-circle', title: 'Ellipse (O)' },
  { id: 'diamond', icon: 'ti-diamond', title: 'Diamond (D)' },
  { id: 'arrow', icon: 'ti-arrow-right', title: 'Arrow (A)' },
  { id: 'pen', icon: 'ti-pencil', title: 'Pen (P)' },
  { id: 'text', icon: 'ti-cursor-text', title: 'Text (T)' },
  { id: 'eraser', icon: 'ti-eraser', title: 'Eraser (E)' },
  { id: 'crop', icon: 'ti-scissors', title: 'Reference a region of an image (C) — drag a box over an image' },
];
const HANDLE_KEYS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const OPP = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };

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
    ctx.beginPath(); ctx.moveTo(x1 + o(), y1 + o());
    ctx.quadraticCurveTo(mx + o(), my + o(), x2 + o(), y2 + o()); ctx.stroke();
  }
}
function hachure(ctx, x, y, w, h, color, sw, rng) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, sw * 0.5);
  const gap = 8;
  for (let d = -h; d < w + h; d += gap) { const j = (rng() * 2 - 1) * 1.5; ctx.beginPath(); ctx.moveTo(x + d + j, y); ctx.lineTo(x + d - h + j, y + h); ctx.stroke(); }
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
  roughSeg(ctx, x, y, x + w, y, rng, r); roughSeg(ctx, x + w, y, x + w, y + h, rng, r);
  roughSeg(ctx, x + w, y + h, x, y + h, rng, r); roughSeg(ctx, x, y + h, x, y, rng, r);
  ctx.restore();
}
function roughEllipse(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const r = (opts.roughness == null ? 1 : opts.roughness) * 1.2;
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, 7); ctx.clip(); hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  const N = 18; let started = false; ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = cx + Math.cos(a) * rx + (rng() * 2 - 1) * r, py = cy + Math.sin(a) * ry + (rng() * 2 - 1) * r;
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.stroke(); ctx.restore();
}
function roughDiamond(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const r = (opts.roughness == null ? 1 : opts.roughness) * 1.4;
  const mx = x + w / 2, my = y + h / 2;
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(x + w, my); ctx.lineTo(mx, y + h); ctx.lineTo(x, my); ctx.closePath(); ctx.clip(); hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  roughSeg(ctx, mx, y, x + w, my, rng, r); roughSeg(ctx, x + w, my, mx, y + h, rng, r);
  roughSeg(ctx, mx, y + h, x, my, rng, r); roughSeg(ctx, x, my, mx, y, rng, r);
  ctx.restore();
}
function drawFreedraw(ctx, el) {
  const pts = el.points; if (!pts || !pts.length) return; // points are ABSOLUTE world coords
  ctx.save();
  ctx.strokeStyle = el.strokeColor || '#1e1e1e'; ctx.lineWidth = el.strokeWidth || 3;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
  if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], (el.strokeWidth || 3) / 2, 0, 7); ctx.fillStyle = el.strokeColor; ctx.fill(); ctx.restore(); return; }
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1]; ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2); }
  const last = pts[pts.length - 1]; ctx.lineTo(last[0], last[1]);
  ctx.stroke(); ctx.restore();
}
function textFont(el) { return (el.fontSize || 24) + 'px ' + (el.fontFamily || 'system-ui, sans-serif'); }
function measureText(el) { // updates el.width/height from el.text; uses a shared offscreen ctx
  if (!measureText._c) measureText._c = document.createElement('canvas').getContext('2d');
  const ctx = measureText._c; ctx.font = textFont(el);
  const lines = String(el.text || '').split('\n'); let w = 0;
  for (const ln of lines) w = Math.max(w, ctx.measureText(ln || ' ').width);
  el.width = Math.max(w, 8); el.height = Math.max(lines.length, 1) * (el.fontSize || 24) * 1.25;
}
function drawText(ctx, el) {
  if (el.text == null || el.text === '') return;
  ctx.save();
  ctx.fillStyle = el.strokeColor || '#1e1e1e'; ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
  ctx.font = textFont(el); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const fs = el.fontSize || 24, lh = fs * 1.25, lines = String(el.text).split('\n');
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], el.x, el.y + i * lh);
  ctx.restore();
}
function drawArrowhead(ctx, fromX, fromY, toX, toY, size) {
  const ang = Math.atan2(toY - fromY, toX - fromX), len = size || 14, spread = 0.45;
  ctx.beginPath();
  ctx.moveTo(toX, toY); ctx.lineTo(toX - len * Math.cos(ang - spread), toY - len * Math.sin(ang - spread));
  ctx.moveTo(toX, toY); ctx.lineTo(toX - len * Math.cos(ang + spread), toY - len * Math.sin(ang + spread));
  ctx.stroke();
}
function drawLinear(ctx, el) {
  const pts = el.points; if (!pts || pts.length < 2) return; // points are ABSOLUTE world coords
  const rng = mulberry32((el.seed | 0) || 1);
  ctx.save(); applyStroke(ctx, { stroke: el.strokeColor, strokeWidth: el.strokeWidth, opacity: el.opacity });
  const rgh = (el.roughness == null ? 1 : el.roughness) * 1.1;
  for (let i = 0; i < pts.length - 1; i++) roughSeg(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rng, rgh);
  const ah = (el.strokeWidth || 2) * 5 + 6;
  if (el.endArrowhead) { const a = pts[pts.length - 2], b = pts[pts.length - 1]; drawArrowhead(ctx, a[0], a[1], b[0], b[1], ah); }
  if (el.startArrowhead) { const a = pts[1], b = pts[0]; drawArrowhead(ctx, a[0], a[1], b[0], b[1], ah); }
  ctx.restore();
}
function drawElement(ctx, el) {
  const opts = { stroke: el.strokeColor, strokeWidth: el.strokeWidth, fill: el.backgroundColor, fillStyle: el.fillStyle, roughness: el.roughness, opacity: el.opacity };
  const rotated = !!el.angle && el.type !== 'arrow' && el.type !== 'line' && el.type !== 'freedraw';
  if (rotated) { ctx.save(); const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
  if (el.type === 'rectangle') roughRect(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'ellipse') roughEllipse(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'diamond') roughDiamond(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'freedraw') drawFreedraw(ctx, el);
  else if (el.type === 'text') drawText(ctx, el);
  else if (el.type === 'arrow' || el.type === 'line') drawLinear(ctx, el);
  if (rotated) ctx.restore();
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
function makeFreedraw(wx, wy, style) {
  return {
    id: newId(), type: 'freedraw', x: wx, y: wy, width: 0, height: 0, angle: 0,
    points: [[wx, wy]], pressures: [], strokeColor: style.stroke || '#1e1e1e', backgroundColor: 'transparent',
    fillStyle: 'solid', strokeWidth: style.strokeWidth || 3, roughness: 0, opacity: 1, seed: newSeed(),
    index: 'a0', isDeleted: false, groupIds: [],
  };
}
function freedrawBBox(el) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [px, py] of el.points) { if (px < minx) minx = px; if (py < miny) miny = py; if (px > maxx) maxx = px; if (py > maxy) maxy = py; }
  if (isFinite(minx)) { el.x = minx; el.y = miny; el.width = maxx - minx; el.height = maxy - miny; }
}
function makeText(wx, wy, style) {
  return {
    id: newId(), type: 'text', x: wx, y: wy, width: 8, height: (style.fontSize || 24) * 1.25, angle: 0,
    text: '', fontSize: style.fontSize || 24, fontFamily: 'system-ui, sans-serif', textAlign: 'left',
    strokeColor: style.stroke || '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: 1, roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
function makeLinear(wx, wy, type, style) {
  return {
    id: newId(), type, x: wx, y: wy, width: 0, height: 0, angle: 0, points: [[wx, wy], [wx, wy]], // ABSOLUTE
    startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: type === 'arrow' ? 'arrow' : null,
    strokeColor: style.stroke || '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: style.strokeWidth || 2, roughness: 1, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
function linearBBox(el) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [px, py] of el.points) { if (px < minx) minx = px; if (py < miny) miny = py; if (px > maxx) maxx = px; if (py > maxy) maxy = py; }
  if (isFinite(minx)) { el.x = minx; el.y = miny; el.width = maxx - minx; el.height = maxy - miny; }
}
let _fileIdC = 0;
function newFileId() { return 'f' + Date.now().toString(36) + (_fileIdC++).toString(36); }
function makeImage(x, y, w, h, fileId, style) {
  return {
    id: newId(), type: 'image', x, y, width: w, height: h, angle: 0, fileId,
    strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [], scale: [1, 1],
    crop: (style && style.crop) || null,      // {x,y,w,h} in NATURAL image pixels — renders just that region
    cropOf: (style && style.cropOf) || null,  // provenance: element id this region was referenced from
  };
}
// Phase 9 E1: a LIVE record card — embeds a Thymer record (title + content), repaints on record change.
function makeRecordCard(x, y, w, h, recordGuid) {
  return {
    id: newId(), type: 'record', x, y, width: w, height: h, angle: 0, recordGuid,
    strokeColor: '#7c5cff', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
function lineTextOf(li) {
  try { const segs = li.segments || []; return segs.map((s) => (typeof s.text === 'string') ? s.text : (s.text && s.text.title) ? s.text.title : '').join('').trim(); } catch (_e) { return ''; }
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy; return Math.hypot(px - cx, py - cy);
}
// Point on a shape's bbox edge in the direction of (fx,fy), with a small gap — where a bound arrow attaches.
function bindPoint(shape, fx, fy) {
  const cx = shape.x + shape.width / 2, cy = shape.y + shape.height / 2;
  const hw = Math.abs(shape.width) / 2 + 5, hh = Math.abs(shape.height) / 2 + 5;
  const dx = fx - cx, dy = fy - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: cy - hh };
  const s = Math.min(hw / (Math.abs(dx) || 1e-6), hh / (Math.abs(dy) || 1e-6));
  return { x: cx + dx * s, y: cy + dy * s };
}
function newScene(blank = false) {
  return {
    type: 'plexus-canvas', schema: SCENE_SCHEMA,
    appState: { viewBackgroundColor: '#ffffff', gridModeEnabled: false, gridSize: 20, theme: 'light', scroll: { x: -60, y: -50 }, zoom: 1 },
    elements: blank ? [] : [makeRect(40, 40, 220, 140, { stroke: '#7c5cff', fill: '#efeaff', fillStyle: 'hachure' })],
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
    // approximate rotated bbox via the 4 rotated corners
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2, a = el.angle || 0, c = Math.cos(a), s = Math.sin(a);
    for (const [lx, ly] of [[el.x, el.y], [el.x + el.width, el.y], [el.x + el.width, el.y + el.height], [el.x, el.y + el.height]]) {
      const dx = lx - cx, dy = ly - cy; const wx = cx + dx * c - dy * s, wy = cy + dx * s + dy * c;
      minX = Math.min(minX, wx); minY = Math.min(minY, wy); maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy);
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 100, h: 100 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function hitElement(el, wx, wy, tol) {
  if (el.type === 'arrow' || el.type === 'line') {
    const pts = el.points || []; const t = tol + (el.strokeWidth || 2);
    for (let i = 0; i < pts.length - 1; i++) if (distToSeg(wx, wy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= t) return true;
    return false;
  }
  if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, c = Math.cos(-el.angle), s = Math.sin(-el.angle), dx = wx - cx, dy = wy - cy; wx = cx + dx * c - dy * s; wy = cy + dx * s + dy * c; }
  const minx = Math.min(el.x, el.x + el.width), maxx = Math.max(el.x, el.x + el.width);
  const miny = Math.min(el.y, el.y + el.height), maxy = Math.max(el.y, el.y + el.height);
  if (wx < minx - tol || wx > maxx + tol || wy < miny - tol || wy > maxy + tol) return false;
  if (el.type === 'freedraw' || el.type === 'text' || el.type === 'image' || el.type === 'record') return true; // within bbox is good enough for selection
  const filled = el.backgroundColor && el.backgroundColor !== 'transparent';
  if (el.type === 'ellipse') {
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, rx = (maxx - minx) / 2 || 1, ry = (maxy - miny) / 2 || 1;
    const v = ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2;
    if (filled) return v <= 1.04;
    return Math.abs(Math.sqrt(v) - 1) < (tol / Math.min(rx, ry)) + 0.14;
  }
  if (filled) return true;
  return Math.abs(wx - minx) < tol || Math.abs(wx - maxx) < tol || Math.abs(wy - miny) < tol || Math.abs(wy - maxy) < tol;
}

/* ───────────────────────────────── camera ───────────────────────────────── */
class Camera {
  constructor(x = 0, y = 0, zoom = 1) { this.x = x; this.y = y; this.zoom = zoom; }
  screenToWorld(sx, sy) { return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y }; }
  worldToScreen(wx, wy) { return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom }; }
  zoomAt(sx, sy, factor) {
    const nz = Math.min(30, Math.max(0.05, this.zoom * factor));
    const wx = sx / this.zoom + this.x, wy = sy / this.zoom + this.y;
    this.x = wx - sx / nz; this.y = wy - sy / nz; this.zoom = nz;
  }
}

/* ─────────── persistence — scene lives in a `file` LINE ITEM on the record ───────────
 * Universal storage: works on ANY record (a Plexus Drawings record OR any flipped note),
 * because it needs no collection-defined `Scene` property — just one `file` line item whose
 * blob is named SCENE_FILENAME. This is the "back of the card": the record keeps its text
 * line items (the note) AND carries the drawing scene as an attached file. (Legacy Drawings
 * records that stored the scene in a `Scene` file-property are still read as a fallback.) */
async function getRecordPoll(plugin, guid, tries = 25) {
  for (let i = 0; i < tries; i++) { try { const r = await plugin.data.getRecord(guid); if (r) return r; } catch (_e) {} await sleep(60); }
  return null;
}
// Find the record's scene-carrying file line item (the one whose blob is named SCENE_FILENAME).
async function findSceneLine(rec) {
  let items = null;
  try { items = await rec.getLineItems(); } catch (_e) { return null; }
  for (const li of (items || [])) {
    let b = null; try { b = await li.getBlob(); } catch (_e) {} // text/heading items return null fast
    if (b && b.fileName === SCENE_FILENAME) return li;
  }
  return null;
}
async function loadSceneFromLine(line, tries = 1) {
  for (let i = 0; i < tries; i++) {
    try { const blob = await line.getBlob(); if (blob) { const ab = await blob.download(); if (ab) return JSON.parse(new TextDecoder().decode(ab)); } } catch (_e) {}
    if (i < tries - 1) await sleep(120);
  }
  return null;
}
// Legacy fallback: scene stored in a `Scene` FILE PROPERTY (pre-0.14 Plexus Drawings records).
async function loadScene(rec, tries = 1) {
  for (let i = 0; i < tries; i++) {
    try { const blob = await rec.prop('Scene').fileBlob(); if (blob) { const ab = await blob.download(); if (ab) return JSON.parse(new TextDecoder().decode(ab)); } } catch (_e) {}
    if (i < tries - 1) await sleep(120);
  }
  return null;
}
function exportPng(scene, maxPx = 1024) {
  return new Promise((resolve) => {
    try {
      const b = sceneBounds(scene); const pad = 24;
      const w = b.w + pad * 2, h = b.h + pad * 2, scale = Math.min(2, maxPx / Math.max(w, h, 1));
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
function svgEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Phase 8: export the scene to a standalone SVG string (clean shapes — not the hand-drawn rough look).
function exportSvg(scene) {
  const b = sceneBounds(scene), pad = 24;
  const W = Math.max(1, Math.round(b.w + pad * 2)), H = Math.max(1, Math.round(b.h + pad * 2));
  const p = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  p.push(`<rect width="100%" height="100%" fill="${svgEsc((scene.appState && scene.appState.viewBackgroundColor) || '#ffffff')}"/>`);
  p.push(`<g transform="translate(${(-b.x + pad).toFixed(2)},${(-b.y + pad).toFixed(2)})">`);
  for (const el of scene.elements) {
    if (el.isDeleted) continue;
    const sw = el.strokeWidth || 2, sc = el.strokeColor || '#1e1e1e';
    const fillc = (el.backgroundColor && el.backgroundColor !== 'transparent') ? el.backgroundColor : 'none';
    const op = el.opacity == null ? 1 : el.opacity;
    const rot = el.angle ? ` transform="rotate(${(el.angle * 180 / Math.PI).toFixed(2)} ${(el.x + el.width / 2).toFixed(2)} ${(el.y + el.height / 2).toFixed(2)})"` : '';
    const common = `stroke="${sc}" stroke-width="${sw}" fill="${fillc}" opacity="${op}"`;
    if (el.type === 'rectangle') p.push(`<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="2" ${common}${rot}/>`);
    else if (el.type === 'ellipse') p.push(`<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${Math.abs(el.width / 2)}" ry="${Math.abs(el.height / 2)}" ${common}${rot}/>`);
    else if (el.type === 'diamond') { const mx = el.x + el.width / 2, my = el.y + el.height / 2; p.push(`<polygon points="${mx},${el.y} ${el.x + el.width},${my} ${mx},${el.y + el.height} ${el.x},${my}" ${common}${rot}/>`); }
    else if (el.type === 'text') { const fs = el.fontSize || 24, lines = String(el.text || '').split('\n'); const ts = lines.map((ln, i) => `<tspan x="${el.x}" dy="${i === 0 ? fs : (fs * 1.25).toFixed(1)}">${svgEsc(ln)}</tspan>`).join(''); p.push(`<text font-family="system-ui,sans-serif" font-size="${fs}" fill="${sc}" opacity="${op}">${ts}</text>`); }
    else if (el.type === 'arrow' || el.type === 'line') { const pts = (el.points || []).map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' '); p.push(`<polyline points="${pts}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`); }
    else if (el.type === 'freedraw') { const pts = el.points || []; if (pts.length) { const d = 'M' + pts.map((q) => q.map((n) => n.toFixed(1)).join(' ')).join(' L'); p.push(`<path d="${d}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`); } }
    else if (el.type === 'image') { const f = scene.files && scene.files[el.fileId]; if (f && f.dataURL) p.push(`<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${svgEsc(f.dataURL)}" opacity="${op}" preserveAspectRatio="none"/>`); }
  }
  p.push('</g></svg>');
  return p.join('');
}
async function saveScene(plugin, rec, scene, camera, view) {
  scene.appState.scroll = { x: camera.x, y: camera.y }; scene.appState.zoom = camera.zoom;
  const file = new File([JSON.stringify(scene)], SCENE_FILENAME, { type: 'application/json' });
  const blob = await plugin.data.uploadBlob(file);
  if (!blob) return { ok: false, reason: 'uploadBlob null' };
  // Reuse the view's cached scene line; else find it; else create it. setBlob REPLACES the file.
  let line = view && view._sceneLine ? view._sceneLine : null;
  if (!line) { try { line = await findSceneLine(rec); } catch (_e) {} }
  // createLineItem can fail on a record created <1s ago (writes lag creation, rule 18) — retry briefly.
  if (!line) { let err = null; for (let i = 0; i < 5 && !line; i++) { try { line = await rec.createLineItem(null, null, 'file', null, null); } catch (e) { err = e; } if (!line) await sleep(150); } if (!line) return { ok: false, reason: 'createLineItem ' + err }; }
  if (view) view._sceneLine = line;
  let ok = false;
  try { ok = await line.setBlob(blob); } catch (e) { return { ok: false, reason: 'setBlob ' + e }; }
  // Best-effort legacy metadata (only Plexus Drawings records have these props; silently skipped elsewhere).
  try { if (rec.prop('Scene Rev')) { const cur = rec.prop('Scene Rev').number() || 0; rec.prop('Scene Rev').set(cur + 1); rec.prop('Scene Schema').set(scene.schema || SCENE_SCHEMA); } } catch (_e) {}
  // Banner = PNG preview (the card's cover image — the visual "drawing face" of the record).
  try { const png = await exportPng(scene); if (png) { const pb = await plugin.data.uploadBlob(new File([png], 'preview.png', { type: 'image/png' })); if (pb) rec.setBannerFromBlob(pb); } } catch (_e) {}
  return { ok, blobGuid: blob.guid, lineGuid: line.guid };
}

/* ──────────────────────────────── canvas view ──────────────────────────────── */
class CanvasView {
  constructor(plugin, panel, recordGuid, opts) {
    this.plugin = plugin; this.panel = panel; this.recordGuid = recordGuid;
    this.host = panel.getElement(); this.rec = null; this._sceneLine = null;
    this._blank = !!(opts && opts.blank); // flipped-from-note: start with an empty canvas
    this.scene = newScene(this._blank); this.camera = new Camera();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.dirty = true; this.destroyed = false; this._saveTimer = null; this._localDisposers = [];
    this.tool = 'select'; this.selected = new Set();
    this.strokeColor = '#7c5cff'; this.fillColor = FILLS['#7c5cff']; this.fillStyle = 'hachure';
    this._undo = []; this._redo = []; this._committed = undefined; // snapshot history
  }
  mount() {
    try { this.panel.setTitle('Plexus'); } catch (_e) {}
    const host = this.host; host.innerHTML = ''; host.classList.add('pxc-host');
    const wrap = document.createElement('div'); wrap.className = 'pxc-root';
    this.staticCv = document.createElement('canvas'); this.staticCv.className = 'pxc-layer pxc-static';
    this.iCv = document.createElement('canvas'); this.iCv.className = 'pxc-layer pxc-interactive'; this.iCv.tabIndex = 0;
    wrap.appendChild(this.staticCv); wrap.appendChild(this.iCv);
    wrap.appendChild(this._buildToolbar());
    wrap.appendChild(this._buildPropPanel());
    const hint = document.createElement('div'); hint.className = 'pxc-hint';
    hint.textContent = 'V select · R/O/D shapes · handles resize/rotate · drag = pan · scroll = zoom · ⌫ delete';
    wrap.appendChild(hint); host.appendChild(wrap); this.wrap = wrap;
    this._resize();
    const ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    ro.observe(this.host.closest('.panel-scroller-y') || wrap); this._localDisposers.push(() => ro.disconnect());
    this._wirePointer(); this.loadOrInit();
  }
  _buildToolbar() {
    const bar = document.createElement('div'); bar.className = 'pxc-toolbar'; this._toolBtns = {};
    for (const t of TOOLS) {
      const b = document.createElement('button'); b.className = 'pxc-tool'; b.title = t.title;
      b.innerHTML = '<span class="ti ' + t.icon + '"></span>';
      b.addEventListener('click', () => { this.tool = t.id; this._syncToolbar(); this.iCv.focus(); });
      bar.appendChild(b); this._toolBtns[t.id] = b;
    }
    const sep = document.createElement('div'); sep.className = 'pxc-sep'; bar.appendChild(sep); this._swatches = {};
    for (const c of PALETTE) {
      const s = document.createElement('button'); s.className = 'pxc-swatch'; s.title = c; s.style.background = c;
      s.addEventListener('click', () => {
        this.strokeColor = c; this.fillColor = FILLS[c] || 'transparent'; let changed = false;
        for (const id of this.selected) { const el = this._byId(id); if (el) { el.strokeColor = c; el.backgroundColor = FILLS[c] || 'transparent'; changed = true; } }
        this._syncToolbar(); this.dirty = true; if (changed) this.scheduleSave();
      });
      bar.appendChild(s); this._swatches[c] = s;
    }
    const sep2 = document.createElement('div'); sep2.className = 'pxc-sep'; bar.appendChild(sep2);
    const note = document.createElement('button'); note.className = 'pxc-tool pxc-flipnote'; note.title = 'Flip to the note (open this record’s text)';
    note.innerHTML = '<span class="ti ti-arrow-back-up"></span>'; note.appendChild(document.createTextNode(' Note'));
    note.addEventListener('click', () => this._flipToNote());
    bar.appendChild(note);
    const cite = document.createElement('button'); cite.className = 'pxc-tool pxc-flipnote'; cite.title = 'Copy the selected image as a block reference, to paste into a note';
    cite.innerHTML = '<span class="ti ti-link"></span>'; cite.appendChild(document.createTextNode(' Cite'));
    cite.addEventListener('click', () => this._copyImageRefToClip());
    bar.appendChild(cite);
    setTimeout(() => this._syncToolbar(), 0); return bar;
  }
  // Flip back: open this drawing's source record as a normal note editor, side-by-side (rule 16).
  async _flipToNote() {
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) { try { panel = await this.plugin.ui.createPanel(); } catch (_e) {} }
    if (!panel) return;
    try { panel.navigateTo({ type: 'edit_panel', rootId: this.recordGuid, workspaceGuid: ws }); } catch (e) { console.error('[Plexus] flipToNote', e); }
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
    for (const cv of [this.staticCv, this.iCv]) { cv.width = Math.round(w * this.dpr); cv.height = Math.round(h * this.dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    this.cssW = w; this.cssH = h;
  }
  _byId(id) { return this.scene.elements.find((e) => e.id === id && !e.isDeleted); }
  _singleSel() { if (this.selected.size !== 1) return null; return this._byId([...this.selected][0]); }
  // Phase 8: snap-to-grid (active only when the grid is on).
  _gridOn() { return !!(this.scene.appState && this.scene.appState.gridModeEnabled); }
  _gridSize() { return (this.scene.appState && this.scene.appState.gridSize) || 20; }
  _snap(n) { if (!this._gridOn()) return n; const gs = this._gridSize(); return Math.round(n / gs) * gs; }
  _toggleGrid() { if (!this.scene.appState) this.scene.appState = {}; this.scene.appState.gridModeEnabled = !this._gridOn(); this.dirty = true; this.scheduleSave(); return this.scene.appState.gridModeEnabled; }
  _drawGrid(ctx) {
    if (!this._gridOn()) return;
    const gs = this._gridSize(), z = this.camera.zoom;
    const x0 = this.camera.x, y0 = this.camera.y, x1 = x0 + this.cssW / z, y1 = y0 + this.cssH / z;
    const sx = Math.floor(x0 / gs) * gs, sy = Math.floor(y0 / gs) * gs;
    ctx.save(); ctx.fillStyle = 'rgba(124,92,255,0.28)'; const r = Math.max(0.5, 1 / z);
    for (let x = sx; x <= x1; x += gs) for (let y = sy; y <= y1; y += gs) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // Phase 8: download the current scene as a standalone SVG file.
  _exportSvg() {
    try {
      const svg = exportSvg(this.scene);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'plexus-drawing.svg'; document.body.appendChild(a); a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) {} }, 1000);
      try { this.plugin.ui.addToaster({ title: 'Exported drawing as SVG.', dismissible: true }); } catch (_e) {}
      return svg.length;
    } catch (e) { console.error('[Plexus] exportSvg', e); return 0; }
  }
  // Phase 8: contextual property panel — stroke width / opacity / fill style for the selection.
  _buildPropPanel() {
    const p = document.createElement('div'); p.className = 'pxc-props'; this._propEl = p;
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    const lab = (t) => { const s = document.createElement('span'); s.className = 'pxc-prop-label'; s.textContent = t; return s; };
    const sep = () => { const s = document.createElement('span'); s.className = 'pxc-prop-sep'; return s; };
    p.appendChild(lab('Width')); this._swBtns = {};
    for (const [t, v] of [['S', 1], ['M', 2], ['L', 4], ['XL', 8]]) { const b = document.createElement('button'); b.className = 'pxc-prop-btn'; b.textContent = t; b.addEventListener('click', () => this._applyProp('strokeWidth', v)); p.appendChild(b); this._swBtns[v] = b; }
    p.appendChild(sep()); p.appendChild(lab('Opacity'));
    const op = document.createElement('input'); op.type = 'range'; op.min = '10'; op.max = '100'; op.value = '100'; op.className = 'pxc-prop-range'; this._opRange = op;
    op.addEventListener('input', () => this._applyProp('opacity', Math.round(+op.value) / 100)); p.appendChild(op);
    p.appendChild(sep()); p.appendChild(lab('Fill')); this._fillBtns = {};
    for (const [t, v] of [['Solid', 'solid'], ['Hachure', 'hachure'], ['None', 'none']]) { const b = document.createElement('button'); b.className = 'pxc-prop-btn'; b.textContent = t; b.addEventListener('click', () => this._applyFill(v)); p.appendChild(b); this._fillBtns[v] = b; }
    return p;
  }
  _applyProp(key, val) { let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el) { el[key] = val; ch = true; } } this.dirty = true; if (ch) { this.scheduleSave(); this._syncPropPanel(true); } }
  _applyFill(style) { let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el) { if (style === 'none') el.backgroundColor = 'transparent'; else { el.backgroundColor = FILLS[el.strokeColor] || '#efeaff'; el.fillStyle = style; } ch = true; } } this.dirty = true; if (ch) { this.scheduleSave(); this._syncPropPanel(true); } }
  _syncPropPanel(force) {
    if (!this._propEl) return;
    const has = this.selected.size > 0; this._propEl.classList.toggle('show', has);
    const sig = [...this.selected].join(','); if (!force && sig === this._propSig) return; this._propSig = sig;
    if (!has) return; const el = this._byId([...this.selected][0]); if (!el) return;
    if (this._opRange) this._opRange.value = String(Math.round((el.opacity == null ? 1 : el.opacity) * 100));
    for (const v in this._swBtns) this._swBtns[v].classList.toggle('active', +v === (el.strokeWidth || 2));
    const fs = (!el.backgroundColor || el.backgroundColor === 'transparent') ? 'none' : (el.fillStyle || 'solid');
    for (const v in this._fillBtns) this._fillBtns[v].classList.toggle('active', v === fs);
  }
  // Phase 8 (gap #10): in-canvas text search — find/centre text elements; Cmd/Ctrl+F or the command.
  _searchScene(q) { q = (q || '').trim().toLowerCase(); if (!q) return []; return this.scene.elements.filter((el) => !el.isDeleted && el.type === 'text' && String(el.text || '').toLowerCase().includes(q)).map((el) => el.id); }
  _focusMatch(id) { const el = this._byId(id); if (!el) return; this.selected = new Set([id]); const cx = el.x + Math.abs(el.width) / 2, cy = el.y + Math.abs(el.height) / 2; this.camera.x = cx - (this.cssW / this.camera.zoom) / 2; this.camera.y = cy - (this.cssH / this.camera.zoom) / 2; this.dirty = true; }
  _closeSearch() { if (this._searchEl) { try { this._searchEl.remove(); } catch (_e) {} this._searchEl = null; } }
  _openSearch() {
    if (this._searchEl) { const i = this._searchEl.querySelector('input'); if (i) i.focus(); return; }
    const box = document.createElement('div'); box.className = 'pxc-search'; this._searchEl = box;
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Find text…'; inp.className = 'pxc-search-input';
    const count = document.createElement('span'); count.className = 'pxc-search-count';
    const close = document.createElement('button'); close.className = 'pxc-tool'; close.innerHTML = '<span class="ti ti-x"></span>';
    let matches = [], idx = 0;
    const run = () => { matches = this._searchScene(inp.value); idx = 0; count.textContent = matches.length ? ('1/' + matches.length) : (inp.value ? '0' : ''); if (matches.length) this._focusMatch(matches[0]); };
    const step = (d) => { if (!matches.length) return; idx = (idx + d + matches.length) % matches.length; count.textContent = (idx + 1) + '/' + matches.length; this._focusMatch(matches[idx]); };
    inp.addEventListener('input', run);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') step(e.shiftKey ? -1 : 1); if (e.key === 'Escape') this._closeSearch(); });
    close.addEventListener('click', () => this._closeSearch());
    box.appendChild(inp); box.appendChild(count); box.appendChild(close);
    this.wrap.appendChild(box); setTimeout(() => inp.focus(), 0);
  }
  _hitTopAt(wx, wy) {
    const tol = 6 / this.camera.zoom;
    for (let i = this.scene.elements.length - 1; i >= 0; i--) { const el = this.scene.elements[i]; if (!el.isDeleted && hitElement(el, wx, wy, tol)) return el; }
    return null;
  }
  _bindableAt(wx, wy, excludeId) {
    const tol = 8 / this.camera.zoom;
    for (let i = this.scene.elements.length - 1; i >= 0; i--) { const el = this.scene.elements[i]; if (el.isDeleted || el.id === excludeId) continue; if ((el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond') && hitElement(el, wx, wy, tol)) return el; }
    return null;
  }
  _updateBindings() {
    for (const el of this.scene.elements) {
      if (el.isDeleted || (el.type !== 'arrow' && el.type !== 'line') || !el.points || el.points.length < 2) continue;
      let changed = false;
      if (el.startBinding) { const s = this._byId(el.startBinding.elementId); if (s) { const o = el.points[el.points.length - 1]; const p = bindPoint(s, o[0], o[1]); el.points[0] = [p.x, p.y]; changed = true; } else el.startBinding = null; }
      if (el.endBinding) { const s = this._byId(el.endBinding.elementId); if (s) { const o = el.points[0]; const p = bindPoint(s, o[0], o[1]); el.points[el.points.length - 1] = [p.x, p.y]; changed = true; } else el.endBinding = null; }
      if (changed) linearBBox(el);
    }
  }
  _cloneEl(el, dx, dy) {
    const c = JSON.parse(JSON.stringify(el)); c.id = newId(); c.x = (c.x || 0) + dx; c.y = (c.y || 0) + dy; c.seed = newSeed();
    if (c.points) c.points = c.points.map(([px, py]) => [px + dx, py + dy]);
    c.startBinding = null; c.endBinding = null; return c; // image fileId is shared on purpose
  }
  _copy() { this.plugin._clipboard = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map((el) => JSON.parse(JSON.stringify(el))); }
  _paste() { const cb = this.plugin._clipboard; if (!cb || !cb.length) return; this.selected.clear(); for (const c of this._cloneBatch(cb, 24, 24)) { this.scene.elements.push(c); this.selected.add(c.id); } this.dirty = true; this.scheduleSave(); }
  _duplicate() { if (!this.selected.size) return; const els = [...this.selected].map((id) => this._byId(id)).filter(Boolean); this.selected.clear(); for (const c of this._cloneBatch(els, 24, 24)) { this.scene.elements.push(c); this.selected.add(c.id); } this.dirty = true; this.scheduleSave(); }
  _selectAll() { this.selected = new Set(this.scene.elements.filter((x) => !x.isDeleted).map((x) => x.id)); this.dirty = true; }
  _topGroup(el) { return el.groupIds && el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : null; }
  _groupMembers(gid) { return gid ? this.scene.elements.filter((e) => !e.isDeleted && e.groupIds && e.groupIds.includes(gid)).map((e) => e.id) : []; }
  _cloneBatch(els, dx, dy) { const gmap = {}; return els.map((el) => { const c = this._cloneEl(el, dx, dy); if (c.groupIds && c.groupIds.length) c.groupIds = c.groupIds.map((g) => (gmap[g] || (gmap[g] = 'g' + newId()))); return c; }); }
  _group() { const ids = [...this.selected]; if (ids.length < 2) return; const gid = 'g' + newId(); for (const id of ids) { const el = this._byId(id); if (el) { if (!el.groupIds) el.groupIds = []; el.groupIds.push(gid); } } this.dirty = true; this.scheduleSave(); }
  _ungroup() { let changed = false; for (const id of this.selected) { const el = this._byId(id); if (el && el.groupIds && el.groupIds.length) { el.groupIds.pop(); changed = true; } } if (changed) { this.dirty = true; this.scheduleSave(); } }
  _bringToFront() { if (!this.selected.size) return; const sel = this.scene.elements.filter((e) => this.selected.has(e.id)); const rest = this.scene.elements.filter((e) => !this.selected.has(e.id)); this.scene.elements = rest.concat(sel); this.dirty = true; this.scheduleSave(); }
  _sendToBack() { if (!this.selected.size) return; const sel = this.scene.elements.filter((e) => this.selected.has(e.id)); const rest = this.scene.elements.filter((e) => !this.selected.has(e.id)); this.scene.elements = sel.concat(rest); this.dirty = true; this.scheduleSave(); }
  _nudge(dx, dy) { if (!this.selected.size) return; let shp = false; for (const id of this.selected) { const el = this._byId(id); if (!el) continue; el.x += dx; el.y += dy; if (el.points) el.points = el.points.map(([px, py]) => [px + dx, py + dy]); if (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond') shp = true; } if (shp) this._updateBindings(); this.dirty = true; this.scheduleSave(); }
  _worldAt(e) { const r = this.wrap.getBoundingClientRect(); return this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top); }
  // Handle positions in WORLD coords for a single selected element (local bbox corners/edges rotated).
  _handles(el) {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2, a = el.angle || 0, c = Math.cos(a), s = Math.sin(a);
    const rp = (lx, ly) => { const dx = lx - cx, dy = ly - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; };
    const x = el.x, y = el.y, w = el.width, h = el.height;
    const H = { nw: rp(x, y), n: rp(cx, y), ne: rp(x + w, y), e: rp(x + w, cy), se: rp(x + w, y + h), s: rp(cx, y + h), sw: rp(x, y + h), w: rp(x, cy) };
    H.rot = rp(cx, y - 26 / this.camera.zoom);
    return H;
  }
  _wirePointer() {
    const host = this.iCv;
    let mode = null, sx = 0, sy = 0, cx0 = 0, cy0 = 0, down = null, created = null, moveEls = null, moved = false;
    let rsEl = null, rsHandle = null, rs0 = null, rotEl = null, rotCenter = null, rotStart = 0, rotPtr0 = 0;
    const onDown = (e) => {
      host.focus();
      if (e.button === 1 || (e.button === 0 && e.altKey)) { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.wrap.classList.add('pxc-panning'); return; }
      if (e.button !== 0) return;
      moved = false; down = this._worldAt(e);
      const rect = this.wrap.getBoundingClientRect(); const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (this.tool === 'select') {
        const sel = this._singleSel();
        if (sel && (sel.type === 'rectangle' || sel.type === 'ellipse' || sel.type === 'diamond' || sel.type === 'record' || sel.type === 'image')) {
          const H = this._handles(sel);
          const near = (k) => { const s2 = this.camera.worldToScreen(H[k].x, H[k].y); return Math.hypot(s2.x - sp.x, s2.y - sp.y) < 10; };
          if (near('rot')) { mode = 'rotate'; rotEl = sel; rotCenter = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 }; rotStart = sel.angle || 0; rotPtr0 = Math.atan2(down.y - rotCenter.y, down.x - rotCenter.x); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
          for (const k of HANDLE_KEYS) if (near(k)) { mode = 'resize'; rsEl = sel; rsHandle = k; rs0 = { x: sel.x, y: sel.y, w: sel.width, h: sel.height, a: sel.angle || 0 }; try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
        }
        const hit = this._hitTopAt(down.x, down.y);
        if (hit) {
          if (!this.selected.has(hit.id)) { if (!e.shiftKey) this.selected.clear(); const gid = this._topGroup(hit); if (gid) { for (const id of this._groupMembers(gid)) this.selected.add(id); } else this.selected.add(hit.id); }
          mode = 'move'; moveEls = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map((el) => ({ el, x0: el.x, y0: el.y, pts0: (el.type === 'freedraw' || el.type === 'arrow' || el.type === 'line') ? el.points.map((p) => [p[0], p[1]]) : null }));
        } else { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; if (!e.shiftKey) this.selected.clear(); this.wrap.classList.add('pxc-panning'); }
      } else if (this.tool === 'pen') {
        mode = 'pen'; created = makeFreedraw(down.x, down.y, { stroke: this.strokeColor, strokeWidth: 3 }); this.scene.elements.push(created); this.selected.clear();
      } else if (this.tool === 'eraser') {
        mode = 'erase'; const hit = this._hitTopAt(down.x, down.y); if (hit) { hit.isDeleted = true; this.scheduleSave(); }
      } else if (this.tool === 'text') {
        const el = makeText(down.x, down.y, { stroke: this.strokeColor, fontSize: 24 });
        this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
        this.tool = 'select'; this._syncToolbar(); this._editText(el); this.dirty = true; return;
      } else if (this.tool === 'arrow' || this.tool === 'line') {
        mode = 'linear'; created = makeLinear(down.x, down.y, this.tool, { stroke: this.strokeColor, strokeWidth: 2 }); this.scene.elements.push(created); this.selected.clear();
      } else if (this.tool === 'crop') {
        mode = 'crop'; this._cropRect = { x: down.x, y: down.y, w: 0, h: 0 }; this.selected.clear();
      } else {
        mode = 'create'; created = makeRect(down.x, down.y, 0, 0, { type: this.tool, stroke: this.strokeColor, fill: this.fillColor, fillStyle: this.fillStyle }); this.scene.elements.push(created); this.selected.clear();
      }
      try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.dirty = true;
    };
    const onMove = (e) => {
      if (!mode) return; moved = true;
      if (mode === 'pan') { this.camera.x = cx0 - (e.clientX - sx) / this.camera.zoom; this.camera.y = cy0 - (e.clientY - sy) / this.camera.zoom; this.dirty = true; return; }
      const w = this._worldAt(e);
      if (mode === 'pen' && created) { created.points.push([w.x, w.y]); freedrawBBox(created); this.dirty = true; return; }
      if (mode === 'erase') { const hit = this._hitTopAt(w.x, w.y); if (hit && !hit.isDeleted) { hit.isDeleted = true; this.dirty = true; this.scheduleSave(); } return; }
      if (mode === 'linear' && created) { created.points[1] = [w.x, w.y]; linearBBox(created); this.dirty = true; return; }
      if (mode === 'create' && created) { const x0 = this._snap(down.x), y0 = this._snap(down.y), x1 = this._snap(w.x), y1 = this._snap(w.y); created.x = x0; created.y = y0; created.width = x1 - x0; created.height = y1 - y0; this.dirty = true; return; }
      if (mode === 'crop') { this._cropRect = { x: Math.min(down.x, w.x), y: Math.min(down.y, w.y), w: Math.abs(w.x - down.x), h: Math.abs(w.y - down.y) }; this.dirty = true; return; }
      if (mode === 'move' && moveEls) { let dx = w.x - down.x, dy = w.y - down.y; if (this._gridOn()) { dx = this._snap(dx); dy = this._snap(dy); } let shp = false; for (const m of moveEls) { if (m.pts0) { m.el.points = m.pts0.map(([px, py]) => [px + dx, py + dy]); } m.el.x = m.x0 + dx; m.el.y = m.y0 + dy; if (m.el.type === 'rectangle' || m.el.type === 'ellipse' || m.el.type === 'diamond') shp = true; } if (shp) this._updateBindings(); this.dirty = true; return; }
      if (mode === 'rotate' && rotEl) { const ang = Math.atan2(w.y - rotCenter.y, w.x - rotCenter.x); let na = rotStart + (ang - rotPtr0); if (e.shiftKey) na = Math.round(na / (Math.PI / 12)) * (Math.PI / 12); rotEl.angle = na; this._updateBindings(); this.dirty = true; return; }
      if (mode === 'resize' && rsEl) { const pw = this._gridOn() ? { x: this._snap(w.x), y: this._snap(w.y) } : w; this._applyResize(rsEl, rsHandle, rs0, pw); this._updateBindings(); this.dirty = true; return; }
    };
    const onUp = (e) => {
      if (!mode) return;
      if (mode === 'create' && created) {
        normRect(created);
        if (created.width < 4 && created.height < 4) created.isDeleted = true;
        else { if (created.width < 2) created.width = 8; if (created.height < 2) created.height = 8; this.selected.clear(); this.selected.add(created.id); this.tool = 'select'; this._syncToolbar(); this.scheduleSave(); }
        created = null;
      } else if (mode === 'linear' && created) {
        linearBBox(created);
        const dx = created.points[1][0] - created.points[0][0], dy = created.points[1][1] - created.points[0][1];
        if (Math.hypot(dx, dy) < 4) created.isDeleted = true;
        else {
          const lp = created.points[created.points.length - 1];
          const s0 = this._bindableAt(created.points[0][0], created.points[0][1], created.id);
          const s1 = this._bindableAt(lp[0], lp[1], created.id);
          if (s0) created.startBinding = { elementId: s0.id };
          if (s1) created.endBinding = { elementId: s1.id };
          this._updateBindings();
          this.selected.clear(); this.selected.add(created.id); this.tool = 'select'; this._syncToolbar(); this.scheduleSave();
        }
        created = null;
      } else if (mode === 'pen' && created) { freedrawBBox(created); this.scheduleSave(); created = null; }
      else if (mode === 'crop') {
        const rect = this._cropRect; this._cropRect = null;
        if (rect && rect.w > 3 && rect.h > 3) { const img = this._topImageIn(rect); if (img) { this._referenceRegion(img, rect); this.tool = 'select'; this._syncToolbar(); } else { try { this.plugin.ui.addToaster({ title: 'Plexus: drag the crop box over an image.', dismissible: true }); } catch (_e) {} } }
      }
      else if (mode === 'move' && moveEls) { if (moved) this.scheduleSave(); }
      else if ((mode === 'resize' || mode === 'rotate') && moved) { this.scheduleSave(); }
      else if (mode === 'pan' && moved) { this._saveCamera(); }
      this.wrap.classList.remove('pxc-panning'); try { host.releasePointerCapture(e.pointerId); } catch (_e) {}
      mode = null; moveEls = null; rsEl = null; rotEl = null; this.dirty = true;
    };
    const onWheel = (e) => { e.preventDefault(); const rect = this.wrap.getBoundingClientRect(); this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012)); this.dirty = true; this._saveCamera(); };
    const onKey = (e) => {
      if (this.editingId) return; // a text overlay is open — let it handle keys
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); this.redo(); return; }
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'c') { e.preventDefault(); e.stopPropagation(); this._copy(); return; }
        if (k === 'v') { e.preventDefault(); e.stopPropagation(); this._paste(); return; }
        if (k === 'd') { e.preventDefault(); e.stopPropagation(); this._duplicate(); return; }
        if (k === 'a') { e.preventDefault(); e.stopPropagation(); this._selectAll(); return; }
        if (k === 'g') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this._ungroup(); else this._group(); return; }
        if (k === ']') { e.preventDefault(); e.stopPropagation(); this._bringToFront(); return; }
        if (k === '[') { e.preventDefault(); e.stopPropagation(); this._sendToBack(); return; }
        if (k === 'f') { e.preventDefault(); e.stopPropagation(); this._openSearch(); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selected.size) { e.preventDefault(); for (const id of this.selected) { const el = this._byId(id); if (el) el.isDeleted = true; } this.selected.clear(); this.dirty = true; this.scheduleSave(); } return; }
      if (this.selected.size && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; const dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0); const dy = (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0); this._nudge(dx, dy); return; }
      const map = { v: 'select', r: 'rectangle', o: 'ellipse', d: 'diamond', a: 'arrow', p: 'pen', t: 'text', e: 'eraser', c: 'crop' };
      if (map[e.key]) { this.tool = map[e.key]; this._syncToolbar(); }
      if (e.key === 'Escape') { this.selected.clear(); this.tool = 'select'; this._syncToolbar(); this.dirty = true; }
    };
    const onDblClick = (e) => {
      const w = this._worldAt(e); const hit = this._hitTopAt(w.x, w.y);
      if (hit && hit.type === 'text') { this.selected.clear(); this.selected.add(hit.id); this._editText(hit); }
      else if (hit && hit.type === 'record') { this._openRecord(hit.recordGuid); }
      else if (!hit) { const el = makeText(w.x, w.y, { stroke: this.strokeColor, fontSize: 24 }); this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this._editText(el); }
    };
    host.addEventListener('pointerdown', onDown); host.addEventListener('pointermove', onMove); host.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { passive: false }); host.addEventListener('keydown', onKey); host.addEventListener('dblclick', onDblClick);
    this._localDisposers.push(() => { host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerup', onUp); host.removeEventListener('wheel', onWheel); host.removeEventListener('keydown', onKey); host.removeEventListener('dblclick', onDblClick); });
    // images: drag-drop onto the canvas, or paste while the canvas is focused
    const onDragOver = (e) => { if (e.dataTransfer && [...(e.dataTransfer.items || [])].some((it) => it.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const onDrop = (e) => { const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return; e.preventDefault(); const w = this._worldAt(e); let i = 0; for (const f of files) if (f.type && f.type.startsWith('image/')) { this._addImageFromFile(f, w.x + i * 24, w.y + i * 24); i++; } };
    const onPaste = (e) => { if (this.destroyed || this.editingId) return; if (document.activeElement !== host && !this.wrap.contains(document.activeElement)) return; const items = (e.clipboardData && e.clipboardData.items) || []; for (const it of items) if (it.kind === 'file' && it.type && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); this._addImageFromFile(f, c.x, c.y); } } };
    this.wrap.addEventListener('dragover', onDragOver); this.wrap.addEventListener('drop', onDrop); document.addEventListener('paste', onPaste);
    this._localDisposers.push(() => { this.wrap.removeEventListener('dragover', onDragOver); this.wrap.removeEventListener('drop', onDrop); document.removeEventListener('paste', onPaste); });
  }
  // OBB resize in the element's local frame — works for rotated elements (keeps the opposite handle fixed).
  _applyResize(el, handle, rs0, ptr) {
    const a = rs0.a, ux = Math.cos(a), uy = Math.sin(a), vx = -Math.sin(a), vy = Math.cos(a);
    const cx0 = rs0.x + rs0.w / 2, cy0 = rs0.y + rs0.h / 2, HW = rs0.w / 2, HH = rs0.h / 2;
    const OFF = { nw: [-HW, -HH], n: [0, -HH], ne: [HW, -HH], e: [HW, 0], se: [HW, HH], s: [0, HH], sw: [-HW, HH], w: [-HW, 0] };
    const ao = OFF[OPP[handle]];
    const anchor = { x: cx0 + ao[0] * ux + ao[1] * vx, y: cy0 + ao[0] * uy + ao[1] * vy };
    const dx = ptr.x - anchor.x, dy = ptr.y - anchor.y;
    const along = dx * ux + dy * uy, perp = dx * vx + dy * vy;
    const movesX = handle !== 'n' && handle !== 's', movesY = handle !== 'e' && handle !== 'w';
    const nw = movesX ? Math.max(6, Math.abs(along)) : rs0.w;
    const nh = movesY ? Math.max(6, Math.abs(perp)) : rs0.h;
    const sgnX = movesX ? Math.sign(along) || 1 : 0, sgnY = movesY ? Math.sign(perp) || 1 : 0;
    const ncx = anchor.x + sgnX * (nw / 2) * ux + sgnY * (nh / 2) * vx;
    const ncy = anchor.y + sgnX * (nw / 2) * uy + sgnY * (nh / 2) * vy;
    el.width = nw; el.height = nh; el.x = ncx - nw / 2; el.y = ncy - nh / 2; el.angle = a;
  }
  _editText(el) {
    if (this._ta) { try { this._ta.remove(); } catch (_e) {} this._ta = null; }
    this.editingId = el.id;
    const ta = document.createElement('textarea'); ta.className = 'pxc-textedit'; this._ta = ta;
    ta.value = el.text || ''; ta.spellcheck = false;
    const place = () => {
      const z = this.camera.zoom, s = this.camera.worldToScreen(el.x, el.y);
      ta.style.left = s.x + 'px'; ta.style.top = s.y + 'px';
      ta.style.fontSize = ((el.fontSize || 24) * z) + 'px'; ta.style.color = el.strokeColor || '#1e1e1e';
      ta.style.minWidth = Math.max(20, (el.width || 40) * z) + 'px';
    };
    place(); this.wrap.appendChild(ta);
    const grow = () => { ta.style.height = '0px'; ta.style.height = ta.scrollHeight + 'px'; };
    setTimeout(() => { ta.focus(); ta.select(); grow(); }, 0);
    const onInput = () => { el.text = ta.value; measureText(el); place(); grow(); this.dirty = true; };
    const commit = () => {
      el.text = ta.value; measureText(el);
      if (!String(el.text).trim()) el.isDeleted = true;
      this.editingId = null; this._ta = null; try { ta.remove(); } catch (_e) {}
      this.dirty = true; this.scheduleSave();
    };
    ta.addEventListener('input', onInput);
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); } if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); ta.blur(); } });
    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    ta.addEventListener('wheel', (ev) => ev.stopPropagation());
  }
  _imgFor(fileId) {
    if (!this._imgCache) this._imgCache = new Map();
    const e = this._imgCache.get(fileId);
    if (e) return e.ready ? e.img : null;
    const file = this.scene.files && this.scene.files[fileId];
    if (!file || !file.dataURL) return null;
    const img = new Image(); const entry = { img, ready: false }; this._imgCache.set(fileId, entry);
    img.onload = () => { entry.ready = true; this.dirty = true; };
    img.src = file.dataURL; return null;
  }
  _drawImage(ctx, el) {
    const img = this._imgFor(el.fileId);
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    if (img) {
      try {
        const c = el.crop;
        if (c && c.w > 0 && c.h > 0) ctx.drawImage(img, c.x, c.y, c.w, c.h, el.x, el.y, el.width, el.height);
        else ctx.drawImage(img, el.x, el.y, el.width, el.height);
      } catch (_e) {}
    }
    else { const z = this.camera.zoom; ctx.fillStyle = 'rgba(124,92,255,0.08)'; ctx.fillRect(el.x, el.y, el.width, el.height); ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = 1 / z; ctx.setLineDash([5 / z, 4 / z]); ctx.strokeRect(el.x, el.y, el.width, el.height); ctx.setLineDash([]); }
    ctx.restore();
  }
  async _addImageFromFile(file, wx, wy) {
    const dataURL = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(file); });
    if (!dataURL) return null;
    const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 200, h: 150 }); im.src = dataURL; });
    let w = dims.w || 200, h = dims.h || 150; const max = 480; if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w *= s; h *= s; }
    const fileId = newFileId(); if (!this.scene.files) this.scene.files = {};
    this.scene.files[fileId] = { dataURL, mimeType: file.type || 'image/png', w: dims.w, h: dims.h };
    const el = makeImage(wx - w / 2, wy - h / 2, w, h, fileId);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // Phase 9 E1: live-record card cache + render. _recFor fetches title + first line items async;
  // the plugin invalidates this cache on record.updated / lineitem.* so cards repaint live.
  _recFor(guid) {
    if (!this._recCache) this._recCache = new Map();
    const c = this._recCache.get(guid);
    if (c) return c.ready ? c : null;
    const entry = { ready: false, title: '', lines: [] }; this._recCache.set(guid, entry);
    (async () => {
      try {
        const rec = await this.plugin.data.getRecord(guid);
        if (!rec) { entry.title = '(record not found)'; entry.ready = true; this.dirty = true; return; }
        entry.title = (rec.getName && rec.getName()) || 'Untitled';
        try { const items = await rec.getLineItems(); entry.lines = (items || []).map(lineTextOf).filter(Boolean).slice(0, 8); } catch (_e) {}
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.title = '(error)'; entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateRec(guid) { if (this._recCache && this._recCache.has(guid)) { this._recCache.delete(guid); this.dirty = true; } }
  _clipText(ctx, s, maxW) { s = String(s == null ? '' : s); if (ctx.measureText(s).width <= maxW) return s; while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  _drawRecordCard(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#ffffff'; ctx.fill();
    ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#7c5cff'; ctx.stroke();
    ctx.save(); ctx.clip(); ctx.fillStyle = el.strokeColor || '#7c5cff'; ctx.fillRect(x, y, 4, h); // accent bar
    const rec = this._recFor(el.recordGuid); const pad = 10, tx = x + pad + 4, maxW = w - pad * 2 - 4; let ty = y + pad;
    ctx.textBaseline = 'top';
    if (!rec) { ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#9aa0a6'; ctx.fillText('Loading…', tx, ty); ctx.restore(); ctx.restore(); return; }
    ctx.font = '600 15px system-ui, sans-serif'; ctx.fillStyle = '#1e1e1e'; ctx.fillText(this._clipText(ctx, rec.title, maxW), tx, ty); ty += 23;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#5f6368';
    for (const ln of rec.lines) { if (ty > y + h - 14) break; ctx.fillText(this._clipText(ctx, ln, maxW), tx, ty); ty += 16; }
    ctx.restore(); ctx.restore();
  }
  _insertRecordCard(guid, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeRecordCard(this._snap(wx - 130), this._snap(wy - 80), 260, 160, guid);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  async _openRecord(guid) {
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) { try { panel = await this.plugin.ui.createPanel(); } catch (_e) {} }
    if (!panel) return;
    try { panel.navigateTo({ type: 'edit_panel', rootId: guid, workspaceGuid: ws }); } catch (e) { console.error('[Plexus] openRecord', e); }
  }
  // Topmost image element whose box overlaps the given world rect (for the crop marquee).
  _topImageIn(rect) {
    for (let i = this.scene.elements.length - 1; i >= 0; i--) {
      const el = this.scene.elements[i]; if (el.isDeleted || el.type !== 'image') continue;
      const ex0 = Math.min(el.x, el.x + el.width), ex1 = Math.max(el.x, el.x + el.width);
      const ey0 = Math.min(el.y, el.y + el.height), ey1 = Math.max(el.y, el.y + el.height);
      if (rect.x + rect.w > ex0 && rect.x < ex1 && rect.y + rect.h > ey0 && rect.y < ey1) return el;
    }
    return null;
  }
  // "Reference PART of an image": create a NEW image element showing just the world-rect region of
  // imgEl. Shares the same fileId (no data copy) + carries a `crop` in natural pixels. Handles
  // crop-of-crop (referencing a region of an already-cropped element).
  _referenceRegion(imgEl, rect) {
    if (!imgEl || imgEl.type !== 'image' || !imgEl.width || !imgEl.height) return null;
    const file = this.scene.files && this.scene.files[imgEl.fileId];
    const natW = (file && file.w) || Math.abs(imgEl.width), natH = (file && file.h) || Math.abs(imgEl.height);
    const baseX = imgEl.crop ? imgEl.crop.x : 0, baseY = imgEl.crop ? imgEl.crop.y : 0;
    const baseW = imgEl.crop ? imgEl.crop.w : natW, baseH = imgEl.crop ? imgEl.crop.h : natH;
    const ex0 = Math.min(imgEl.x, imgEl.x + imgEl.width), ex1 = Math.max(imgEl.x, imgEl.x + imgEl.width);
    const ey0 = Math.min(imgEl.y, imgEl.y + imgEl.height), ey1 = Math.max(imgEl.y, imgEl.y + imgEl.height);
    const ix0 = Math.max(rect.x, ex0), iy0 = Math.max(rect.y, ey0);
    const ix1 = Math.min(rect.x + rect.w, ex1), iy1 = Math.min(rect.y + rect.h, ey1);
    if (ix1 - ix0 < 2 || iy1 - iy0 < 2) return null;
    const sx = baseW / Math.abs(imgEl.width), sy = baseH / Math.abs(imgEl.height);
    const crop = { x: baseX + (ix0 - ex0) * sx, y: baseY + (iy0 - ey0) * sy, w: (ix1 - ix0) * sx, h: (iy1 - iy0) * sy };
    const nw = ix1 - ix0, nh = iy1 - iy0;
    const el = makeImage(ex1 + 24, ey0, nw, nh, imgEl.fileId, { crop, cropOf: imgEl.id });
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // Render one image element (honoring its crop) to a standalone PNG Blob — for embedding into a note.
  _snapshotElement(el) {
    return new Promise((resolve) => {
      if (!el || el.type !== 'image') return resolve(null);
      const W = Math.max(1, Math.round(Math.abs(el.width))), H = Math.max(1, Math.round(Math.abs(el.height)));
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
      const draw = (im) => { try { const c = el.crop; if (c && c.w > 0 && c.h > 0) ctx.drawImage(im, c.x, c.y, c.w, c.h, 0, 0, W, H); else ctx.drawImage(im, 0, 0, W, H); } catch (_e) {} cv.toBlob((b) => resolve(b), 'image/png'); };
      const cached = this._imgFor(el.fileId);
      if (cached) return draw(cached);
      const file = this.scene.files && this.scene.files[el.fileId];
      if (file && file.dataURL) { const im = new Image(); im.onload = () => draw(im); im.onerror = () => resolve(null); im.src = file.dataURL; }
      else resolve(null);
    });
  }
  // Copy the selected image (or a given element) onto the plugin's image-ref clipboard, so it can be
  // pasted as a block reference into any note. Stores a PNG snapshot + the source record + element id.
  async _copyImageRefToClip(el) {
    el = el || this._singleSel();
    if (!el || el.type !== 'image') { try { this.plugin.ui.addToaster({ title: 'Plexus: select an image (or a cropped region) first.', dismissible: true }); } catch (_e) {} return false; }
    const png = await this._snapshotElement(el);
    if (!png) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not snapshot the image (still loading?).', dismissible: true }); } catch (_e) {} return false; }
    this.plugin._imgRefClip = { png, sourceRecordGuid: this.recordGuid, elementId: el.id, crop: el.crop || null, w: Math.round(Math.abs(el.width)), h: Math.round(Math.abs(el.height)) };
    try { this.plugin.ui.addToaster({ title: 'Image reference copied — run “Plexus: Paste image reference” inside a note.', dismissible: true }); } catch (_e) {}
    return true;
  }
  async loadOrInit() {
    this.rec = await getRecordPoll(this.plugin, this.recordGuid);
    if (this.destroyed) return;
    let fresh = true;
    if (this.rec) {
      // Universal existence check: a scene exists iff the record has a SCENE_FILENAME file line item.
      const line = await findSceneLine(this.rec);
      if (line) {
        this._sceneLine = line;
        const loaded = await loadSceneFromLine(line, 10);
        if (loaded && loaded.elements) { this.scene = loaded; fresh = false; }
      } else {
        // Legacy fallback: a pre-0.14 Drawings record with the scene in a `Scene` file-property.
        let rev = 0; try { rev = this.rec.prop('Scene Rev').number() || 0; } catch (_e) {}
        if (rev > 0) { const loaded = await loadScene(this.rec, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
      }
    }
    const a = this.scene.appState || {};
    this.camera = new Camera(a.scroll ? a.scroll.x : -60, a.scroll ? a.scroll.y : -50, a.zoom || 1);
    this._committed = JSON.stringify(this.scene);
    this.dirty = true; if (fresh && this.rec) this.saveNow();
  }
  _snapshot() { return JSON.stringify(this.scene); }
  _restore(json) {
    try { this.scene = JSON.parse(json); } catch (_e) { return; }
    this._committed = json; this.selected.clear(); if (this.editingId) { try { this._ta && this._ta.remove(); } catch (_e) {} this.editingId = null; this._ta = null; }
    this.dirty = true; if (this.rec && !this.destroyed) saveScene(this.plugin, this.rec, this.scene, this.camera, this).then((r) => { this._lastSave = r; });
  }
  undo() { if (!this._undo.length) return; this._redo.push(this._snapshot()); this._restore(this._undo.pop()); }
  redo() { if (!this._redo.length) return; this._undo.push(this._snapshot()); this._restore(this._redo.pop()); }
  _saveCamera() { this.scene.appState.scroll = { x: this.camera.x, y: this.camera.y }; this.scene.appState.zoom = this.camera.zoom; if (this._saveTimer) clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.saveNow(), 700); }
  render() {
    if (this.destroyed || !this.staticCv) return;
    this._syncPropPanel();
    const z = this.camera.zoom, d = this.dpr;
    const sctx = this.staticCv.getContext('2d');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = (this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff';
    sctx.fillRect(0, 0, this.staticCv.width, this.staticCv.height);
    sctx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    this._drawGrid(sctx);
    for (const el of this.scene.elements) { if (el.isDeleted || el.id === this.editingId) continue; if (el.type === 'image') this._drawImage(sctx, el); else if (el.type === 'record') this._drawRecordCard(sctx, el); else drawElement(sctx, el); }
    // interactive layer — selection + transform handles
    const ictx = this.iCv.getContext('2d');
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, this.iCv.width, this.iCv.height);
    if (this._cropRect) {
      const r = this._cropRect;
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      ictx.fillStyle = 'rgba(245,158,11,0.12)'; ictx.fillRect(r.x, r.y, r.w, r.h);
      ictx.strokeStyle = '#f59e0b'; ictx.lineWidth = 1.4 / z; ictx.setLineDash([6 / z, 4 / z]);
      ictx.strokeRect(r.x, r.y, r.w, r.h); ictx.setLineDash([]);
      ictx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (!this.selected.size) return;
    ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    ictx.strokeStyle = '#7c5cff'; ictx.fillStyle = '#ffffff'; ictx.lineWidth = 1.2 / z;
    const single = this._singleSel();
    if (single && (single.type === 'rectangle' || single.type === 'ellipse' || single.type === 'diamond' || single.type === 'record' || single.type === 'image')) {
      const H = this._handles(single);
      ictx.setLineDash([]);
      ictx.beginPath(); ictx.moveTo(H.nw.x, H.nw.y); ictx.lineTo(H.ne.x, H.ne.y); ictx.lineTo(H.se.x, H.se.y); ictx.lineTo(H.sw.x, H.sw.y); ictx.closePath(); ictx.stroke();
      ictx.beginPath(); ictx.moveTo(H.n.x, H.n.y); ictx.lineTo(H.rot.x, H.rot.y); ictx.stroke();
      const hs = 8 / z;
      for (const k of HANDLE_KEYS) { const p = H[k]; ictx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs); ictx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs); }
      ictx.beginPath(); ictx.arc(H.rot.x, H.rot.y, hs / 1.5, 0, 7); ictx.fill(); ictx.stroke();
    } else {
      ictx.setLineDash([6 / z, 4 / z]); const pad = 4 / z;
      for (const id of this.selected) { const el = this._byId(id); if (!el) continue; const x = Math.min(el.x, el.x + el.width), y = Math.min(el.y, el.y + el.height); ictx.strokeRect(x - pad, y - pad, Math.abs(el.width) + pad * 2, Math.abs(el.height) + pad * 2); }
      ictx.setLineDash([]);
    }
  }
  scheduleSave() {
    // edit save: record an undo step (push the prior committed state, snapshot the new one)
    if (this._committed !== undefined) { this._undo.push(this._committed); if (this._undo.length > 80) this._undo.shift(); this._redo = []; }
    this._committed = this._snapshot();
    if (this._saveTimer) clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.saveNow(), 700);
  }
  async saveNow() { if (!this.rec || this.destroyed) return null; const res = await saveScene(this.plugin, this.rec, this.scene, this.camera, this); this._lastSave = res; return res; }
  destroy() { this.destroyed = true; if (this._saveTimer) clearTimeout(this._saveTimer); if (this._ta) { try { this._ta.remove(); } catch (_e) {} } for (const d of this._localDisposers.splice(0)) { try { d(); } catch (_e) {} } }
}

/* ─────────────────────────────────── plugin ─────────────────────────────────── */
class Plugin extends AppPlugin {
  onLoad() {
    try { window.__plexusCanvas && window.__plexusCanvas.dispose(); } catch (_e) {}
    const reg = freshRegistry(); this._reg = reg;
    this._pendingQueue = []; this._views = new Set(); this._drawingsCol = null; this._imgRefClip = null;
    window.__plexusCanvas = { version: PLEXUS_VERSION, dispose: () => this._teardown() };
    console.log('%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded', 'color:#7c5cff;font-weight:bold');
    this.ui.injectCSS(BASE_CSS);
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New Drawing', icon: 'ti-photo', onSelected: () => this._newDrawing() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Flip to drawing', icon: 'ti-pencil', onSelected: () => this._flipActiveRecord() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Paste image reference', icon: 'ti-link', onSelected: () => this._pasteImageRef() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle grid', icon: 'ti-layout-grid', onSelected: () => { const v = this._activeView(); if (v) v._toggleGrid(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Export drawing as SVG', icon: 'ti-download', onSelected: () => { const v = this._activeView(); if (v) v._exportSvg(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Search in drawing', icon: 'ti-search', onSelected: () => { const v = this._activeView(); if (v) v._openSearch(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert record card', icon: 'ti-cards', onSelected: () => this._cmdInsertCard() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Open Canvas (blank panel)', icon: 'ti-pencil', onSelected: () => this._openPanelFor(null) });
    // Phase 9 E1: track the last-focused record (the card-insert target) + keep cards LIVE.
    this._lastRecordGuid = null;
    const trackFocus = (e) => { try { const r = e.panel && e.panel.getActiveRecord && e.panel.getActiveRecord(); if (r && r.guid) this._lastRecordGuid = r.guid; } catch (_e) {} };
    try { this.events.on('panel.focused', trackFocus); this.events.on('panel.navigated', trackFocus); } catch (_e) {}
    const onRecChange = (e) => { const g = e && e.recordGuid; if (!g) return; for (const v of this._views) v._invalidateRec(g); };
    try { for (const ev of ['record.updated', 'lineitem.updated', 'lineitem.created', 'lineitem.deleted', 'lineitem.moved']) this.events.on(ev, onRecChange); } catch (_e) {}
    let raf = 0;
    const tick = () => {
      for (const v of this._views) { if (!v.host || !v.host.isConnected) { v.destroy(); this._views.delete(v); continue; } if (v.dirty) { try { v.render(); } catch (e) { console.error('[Plexus] render', e); } v.dirty = false; } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); reg.add(() => cancelAnimationFrame(raf));
    const onScroll = () => { if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' }); };
    window.addEventListener('scroll', onScroll, { passive: true }); reg.add(() => window.removeEventListener('scroll', onScroll));
    if (TEST_HOOKS) this._installTestHooks();
  }
  _teardown() { for (const v of this._views) { try { v.destroy(); } catch (_e) {} } this._views.clear(); try { this._reg.dispose(); } catch (_e) {} }
  onUnload() { this._teardown(); window.__plexusCanvas = undefined; }
  _activeView() { const p = this.ui.getActivePanel(); const v = [...this._views].find((x) => x.panel === p); return v || [...this._views].pop() || null; }
  _cmdInsertCard() {
    const v = this._activeView();
    if (!v) { try { this.ui.addToaster({ title: 'Plexus: open a drawing first.', dismissible: true }); } catch (_e) {} return; }
    if (!this._lastRecordGuid) { try { this.ui.addToaster({ title: 'Plexus: open or click a note first, then insert its live card.', dismissible: true }); } catch (_e) {} return; }
    v._insertRecordCard(this._lastRecordGuid);
  }
  async _drawingsCollection() {
    if (this._drawingsCol) return this._drawingsCol;
    const cols = await this.data.getAllCollections();
    this._drawingsCol = (cols || []).find((c) => c.getName && c.getName() === DRAWINGS_COLLECTION) || null;
    return this._drawingsCol;
  }
  async _newDrawing() {
    const col = await this._drawingsCollection(); if (!col) return null;
    let guid = null; try { guid = col.createRecord('Untitled drawing'); } catch (e) { console.error('[Plexus] createRecord', e); }
    if (typeof guid !== 'string') return null; await this._openPanelFor(guid); return guid;
  }
  // Flip the ACTIVE note (whatever record the focused editor panel shows) into a drawing.
  // The note's text line items stay its "front"; the scene rides along as a file line item.
  async _flipActiveRecord() {
    const panel = this.ui.getActivePanel();
    let rec = null; try { rec = panel && panel.getActiveRecord ? panel.getActiveRecord() : null; } catch (_e) {}
    if (!rec || !rec.guid) { try { this.ui.addToaster({ title: 'Plexus: open a note first, then flip it to a drawing.', dismissible: true }); } catch (_e) {} return null; }
    let existing = null; try { existing = await findSceneLine(rec); } catch (_e) {}
    await this._openPanelFor(rec.guid, { blank: !existing });
    return rec.guid;
  }
  // Paste a copied image reference (from a canvas "Cite") into a note: an `image` line item carrying a
  // PNG snapshot (the visual — possibly a cropped region) + a `ref` line back to the source drawing.
  async _pasteImageRef(targetGuid) {
    const clip = this._imgRefClip;
    if (!clip) { try { this.ui.addToaster({ title: 'Plexus: no image reference copied yet — use “Cite” in a drawing first.', dismissible: true }); } catch (_e) {} return { ok: false, reason: 'no clip' }; }
    let rec = null;
    if (targetGuid) rec = await getRecordPoll(this, targetGuid);
    else { const panel = this.ui.getActivePanel(); try { rec = panel && panel.getActiveRecord ? panel.getActiveRecord() : null; } catch (_e) {} }
    if (!rec || !rec.guid) { try { this.ui.addToaster({ title: 'Plexus: open a note (editor panel) first, then paste.', dismissible: true }); } catch (_e) {} return { ok: false, reason: 'no record' }; }
    let blob = null; try { blob = await this.data.uploadBlob(new File([clip.png], 'plexus-image-ref.png', { type: 'image/png' })); } catch (_e) {}
    let imgLine = null; for (let i = 0; i < 5 && !imgLine; i++) { try { imgLine = await rec.createLineItem(null, null, 'image', null, null); } catch (_e) {} if (!imgLine) await sleep(150); }
    if (imgLine && blob) { try { await imgLine.setBlob(blob); } catch (_e) {} }
    const label = clip.crop ? '↗ region of drawing' : '↗ source drawing';
    let refLine = null; try { refLine = await rec.createLineItem(null, imgLine, 'ulist', [{ type: 'text', text: label + ' ' }, { type: 'ref', text: { guid: clip.sourceRecordGuid } }], null); } catch (_e) {}
    try { this.ui.addToaster({ title: 'Image reference pasted into the note.', dismissible: true }); } catch (_e) {}
    return { ok: !!(imgLine && refLine), imgLineGuid: imgLine ? imgLine.guid : null, refLineGuid: refLine ? refLine.guid : null, recordGuid: rec.guid };
  }
  async _openPanelFor(recordGuid, opts) {
    if (recordGuid) this._pendingQueue.push({ guid: recordGuid, at: Date.now(), blank: !!(opts && opts.blank) });
    const here = this.ui.getActivePanel();
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (!panel) { this._pendingQueue.pop(); return null; }
    panel.navigateToCustomType(PANEL_ID); return panel;
  }
  _mountPanel(panel) {
    // Time-windowed pending: consume only a guid queued in the last ~4s, dropping stale entries.
    // A panel RESTORED on reload (no recent open) gets the blank state and never steals a fresh open.
    let recordGuid = null, blank = false;
    while (this._pendingQueue.length) { const e = this._pendingQueue.shift(); if (Date.now() - e.at < 4000) { recordGuid = e.guid; blank = !!e.blank; break; } }
    if (!recordGuid) { panel.setTitle('Plexus'); const host = panel.getElement(); host.innerHTML = ''; host.classList.add('pxc-host'); const r = document.createElement('div'); r.className = 'pxc-root'; r.innerHTML = '<div class="pxc-empty">Plexus Canvas<br><small>run “Plexus: New Drawing”, or “Plexus: Flip to drawing” on a note</small></div>'; host.appendChild(r); return; }
    const view = new CanvasView(this, panel, recordGuid, { blank }); this._views.add(view); view.mount();
  }
  _installTestHooks() {
    window.__plexusCanvas.test = {
      newDrawing: () => this._newDrawing(),
      views: () => [...this._views].map((v) => ({ record: v.recordGuid, tool: v.tool, elements: v.scene.elements.filter((e) => !e.isDeleted).length, selected: v.selected.size, zoom: +v.camera.zoom.toFixed(3), w: v.cssW, h: v.cssH, lastSave: v._lastSave || null })),
      addShapes: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const specs = [['rectangle', 60, 300, 160, 90, '#10b981'], ['ellipse', 260, 300, 120, 120, '#f59e0b'], ['diamond', 60, 430, 140, 100, '#ef4444']];
        for (const [type, x, y, w, h, c] of specs) v.scene.elements.push(makeRect(x, y, w, h, { type, stroke: c, fill: FILLS[c] }));
        v.dirty = true; const saved = await v.saveNow(); return { elements: v.scene.elements.filter((e) => !e.isDeleted).length, saved };
      },
      selectFirst: () => { const v = [...this._views].pop(); if (!v) return null; const el = v.scene.elements.find((e) => !e.isDeleted); if (el) { v.selected.clear(); v.selected.add(el.id); v.dirty = true; } return { selected: v.selected.size }; },
      drawStroke: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = makeFreedraw(100, 560, { stroke: '#7c5cff', strokeWidth: 4 });
        for (let i = 1; i <= 40; i++) { const t = i / 40; el.points.push([100 + t * 260, 560 + Math.sin(t * Math.PI * 3) * 40]); }
        freedrawBBox(el); v.scene.elements.push(el); v.dirty = true; const saved = await v.saveNow();
        return { type: el.type, points: el.points.length, bbox: { x: Math.round(el.x), y: Math.round(el.y), w: Math.round(el.width), h: Math.round(el.height) }, saved };
      },
      addText: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = makeText(80, 700, { stroke: '#0ea5e9', fontSize: 28 });
        el.text = 'Hello Plexus\nfrom scratch'; measureText(el);
        v.scene.elements.push(el); v.dirty = true; const saved = await v.saveNow();
        return { type: el.type, text: el.text, w: Math.round(el.width), h: Math.round(el.height), saved };
      },
      addArrow: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = makeLinear(420, 320, 'arrow', { stroke: '#7c5cff', strokeWidth: 3 });
        el.points = [[420, 320], [560, 420]]; linearBBox(el);
        v.scene.elements.push(el); v.dirty = true; const saved = await v.saveNow();
        const tol = 6; const onLine = hitElement(el, 490, 370, tol), offLine = hitElement(el, 420, 420, tol);
        return { type: el.type, endArrowhead: el.endArrowhead, bbox: { x: Math.round(el.x), y: Math.round(el.y), w: Math.round(el.width), h: Math.round(el.height) }, hitTest: { onLine, offLine }, saved };
      },
      undoTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        v._committed = v._snapshot(); v._undo = []; v._redo = []; // clean baseline (test hooks bypass scheduleSave)
        const before = v.scene.elements.filter((e) => !e.isDeleted).length;
        v.scene.elements.push(makeRect(500, 600, 80, 80, { stroke: '#ef4444' })); v.scheduleSave();
        const afterAdd = v.scene.elements.filter((e) => !e.isDeleted).length;
        v.undo(); const afterUndo = v.scene.elements.filter((e) => !e.isDeleted).length;
        v.redo(); const afterRedo = v.scene.elements.filter((e) => !e.isDeleted).length;
        return { before, afterAdd, afterUndo, afterRedo, undoOk: afterUndo === before, redoOk: afterRedo === afterAdd };
      },
      bindTest: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const rect = makeRect(700, 300, 100, 80, { stroke: '#10b981', fill: FILLS['#10b981'] }); v.scene.elements.push(rect);
        const arr = makeLinear(500, 340, 'arrow', { stroke: '#7c5cff', strokeWidth: 3 }); arr.points = [[500, 340], [740, 340]]; v.scene.elements.push(arr);
        arr.endBinding = { elementId: rect.id }; v._updateBindings();
        const endBefore = arr.points[1].map((n) => Math.round(n));
        rect.x += 120; v._updateBindings();
        const endAfter = arr.points[1].map((n) => Math.round(n));
        v.dirty = true; const saved = await v.saveNow();
        return { endBefore, endAfter, followed: endAfter[0] > endBefore[0], saved };
      },
      addImage: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const c = document.createElement('canvas'); c.width = 120; c.height = 80; const cx = c.getContext('2d');
        cx.fillStyle = '#7c5cff'; cx.fillRect(0, 0, 120, 80); cx.fillStyle = '#fff'; cx.font = '18px sans-serif'; cx.fillText('IMG', 40, 47);
        const dataURL = c.toDataURL('image/png'); const fileId = 'ftest';
        if (!v.scene.files) v.scene.files = {}; v.scene.files[fileId] = { dataURL, mimeType: 'image/png', w: 120, h: 80 };
        v.scene.elements.push(makeImage(150, 760, 120, 80, fileId)); v.dirty = true;
        await new Promise((r) => setTimeout(r, 350));
        const cached = v._imgCache && v._imgCache.get(fileId);
        const saved = await v.saveNow();
        return { type: 'image', fileId, hasDataURL: !!v.scene.files[fileId].dataURL, imgReady: !!(cached && cached.ready), saved };
      },
      copyTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = v.scene.elements.find((e) => !e.isDeleted); if (!el) return { error: 'no element' };
        v.selected.clear(); v.selected.add(el.id);
        const before = v.scene.elements.filter((e) => !e.isDeleted).length;
        v._duplicate(); const afterDup = v.scene.elements.filter((e) => !e.isDeleted).length;
        v._copy(); v.selected.clear(); v._paste(); const afterPaste = v.scene.elements.filter((e) => !e.isDeleted).length;
        v._selectAll(); const allSel = v.selected.size;
        return { before, afterDup, afterPaste, dupOk: afterDup === before + 1, pasteOk: afterPaste === afterDup + 1, selectAllOk: allSel === afterPaste };
      },
      groupTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const r1 = makeRect(900, 300, 80, 60, { stroke: '#10b981' }); const r2 = makeRect(1000, 300, 80, 60, { stroke: '#0ea5e9' });
        v.scene.elements.push(r1, r2); v.selected = new Set([r1.id, r2.id]);
        v._group(); const gid = v._topGroup(r1);
        const grouped = !!gid && v._topGroup(r2) === gid;
        v.selected.clear(); const members = v._groupMembers(gid); for (const id of members) v.selected.add(id);
        const expandOk = v.selected.size === 2;
        v.selected = new Set([r1.id, r2.id]); v._ungroup();
        const ungrouped = !v._topGroup(r1) && !v._topGroup(r2);
        v.dirty = true;
        return { grouped, expandOk, memberCount: members.length, ungrouped };
      },
      zorderTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const a = makeRect(1100, 300, 60, 60, { stroke: '#10b981' }); const b = makeRect(1130, 320, 60, 60, { stroke: '#ef4444' });
        v.scene.elements.push(a, b); const lastId = v.scene.elements[v.scene.elements.length - 1].id;
        v.selected = new Set([a.id]); v._bringToFront();
        const frontOk = v.scene.elements[v.scene.elements.length - 1].id === a.id;
        v._sendToBack();
        const backOk = v.scene.elements[0].id === a.id;
        return { frontOk, backOk, wasLast: lastId === b.id };
      },
      nudgeTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = makeRect(1200, 400, 50, 50, { stroke: '#0ea5e9' }); v.scene.elements.push(el);
        v.selected = new Set([el.id]); const x0 = el.x, y0 = el.y;
        v._nudge(1, 0); v._nudge(0, 10);
        return { dx: el.x - x0, dy: el.y - y0, ok: (el.x - x0 === 1) && (el.y - y0 === 10) };
      },
      // flip-a-card storage: scene saved to a `file` LINE ITEM on a record, reloaded from it.
      // Proves universal storage that works on ANY record (proxy here = a throwaway Drawings record).
      flipTest: async () => {
        const col = await this._drawingsCollection(); if (!col) return { error: 'no collection' };
        let guid = null; try { guid = col.createRecord('Flip storage test'); } catch (e) { return { error: 'createRecord ' + e }; }
        if (typeof guid !== 'string') return { error: 'guid not string' };
        const rec = await getRecordPoll(this, guid); if (!rec) return { error: 'record not resolvable', guid };
        const scene = newScene(true); scene.elements.push(makeRect(10, 10, 50, 50, { stroke: '#10b981' }), makeRect(80, 10, 40, 40, { stroke: '#ef4444' }));
        const holder = { _sceneLine: null };
        const saved = await saveScene(this, rec, scene, new Camera(), holder);
        const line = await findSceneLine(rec);
        const reloaded = line ? await loadSceneFromLine(line, 10) : null;
        return {
          guid, saved: !!saved.ok, reason: saved.reason || null, lineGuid: saved.lineGuid || null, cachedLine: !!holder._sceneLine,
          foundLineOnRescan: !!line, reloadEls: reloaded ? reloaded.elements.length : -1,
          roundTripOk: !!(saved.ok && line && reloaded && reloaded.elements.length === 2),
        };
      },
      // Reopen an existing record in a FRESH canvas panel; report what the new view loaded from the line item.
      reopenTest: async (guid) => {
        const before = [...this._views].length;
        await this._openPanelFor(guid);
        for (let i = 0; i < 30; i++) { await sleep(150); const v = [...this._views].filter((x) => x.recordGuid === guid).pop(); if (v && v.rec && v._committed !== undefined) break; }
        const vs = [...this._views].filter((x) => x.recordGuid === guid); const last = vs[vs.length - 1];
        return { viewsForGuid: vs.length, panelsTotal: [...this._views].length - before + before, loadedEls: last ? last.scene.elements.filter((e) => !e.isDeleted).length : -1, foundLine: !!(last && last._sceneLine), lineGuid: last && last._sceneLine ? last._sceneLine.guid : null };
      },
      // Flip an ARBITRARY record guid (proxy for "any note"): open it as a canvas, add a shape, save.
      // Proves the scene lands as a file line item on a record that is NOT in Plexus Drawings.
      flipRecordTest: async (guid) => {
        const rec = await getRecordPoll(this, guid); if (!rec) return { error: 'record not resolvable', guid };
        const existing = await findSceneLine(rec);
        await this._openPanelFor(guid, { blank: !existing });
        let v = null; for (let i = 0; i < 30; i++) { await sleep(150); v = [...this._views].filter((x) => x.recordGuid === guid).pop(); if (v && v.rec) break; }
        if (!v) return { error: 'no view mounted', guid };
        v.scene.elements.push(makeRect(40, 40, 90, 60, { stroke: '#7c5cff' }), makeRect(150, 40, 90, 60, { stroke: '#10b981' }));
        v.dirty = true; const saved = await v.saveNow();
        const line = await findSceneLine(rec); const reloaded = line ? await loadSceneFromLine(line, 10) : null;
        return { guid, hadSceneBefore: !!existing, startedBlank: !existing, saved: !!(saved && saved.ok), reason: saved ? saved.reason : 'no save', sceneLineGuid: line ? line.guid : null, reloadEls: reloaded ? reloaded.elements.filter((e) => !e.isDeleted).length : -1 };
      },
      // crop / image part-reference: a 200x100 image (left purple, right green); reference the RIGHT
      // half in world coords -> a new element sharing the fileId with crop {x:100,w:100,h:100}.
      cropTest: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const c = document.createElement('canvas'); c.width = 200; c.height = 100; const cx = c.getContext('2d');
        cx.fillStyle = '#7c5cff'; cx.fillRect(0, 0, 100, 100); cx.fillStyle = '#10b981'; cx.fillRect(100, 0, 100, 100);
        const dataURL = c.toDataURL('image/png'); const fileId = 'fcrop' + v.scene.elements.length;
        if (!v.scene.files) v.scene.files = {}; v.scene.files[fileId] = { dataURL, mimeType: 'image/png', w: 200, h: 100 };
        const src = makeImage(0, 0, 200, 100, fileId); v.scene.elements.push(src);
        const cropEl = v._referenceRegion(src, { x: 100, y: 0, w: 100, h: 100 }); // world right half
        const cropOfCrop = cropEl ? v._referenceRegion(cropEl, { x: cropEl.x, y: cropEl.y, w: cropEl.width / 2, h: cropEl.height }) : null;
        v.dirty = true; await v.saveNow();
        return {
          srcId: src.id, cropId: cropEl ? cropEl.id : null, crop: cropEl ? cropEl.crop : null,
          sharesFile: cropEl ? cropEl.fileId === src.fileId : false, cropOf: cropEl ? cropEl.cropOf : null,
          cropOk: !!(cropEl && Math.round(cropEl.crop.x) === 100 && Math.round(cropEl.crop.w) === 100 && Math.round(cropEl.crop.h) === 100),
          // crop-of-crop: left half of the green region -> natural x 100..150
          cropOfCropX: cropOfCrop ? Math.round(cropOfCrop.crop.x) : null, cropOfCropW: cropOfCrop ? Math.round(cropOfCrop.crop.w) : null,
          cropOfCropOk: !!(cropOfCrop && Math.round(cropOfCrop.crop.x) === 100 && Math.round(cropOfCrop.crop.w) === 50),
        };
      },
      // block-reference an image into a note: snapshot a cropped image -> clip -> paste into `noteGuid`.
      imageRefTest: async (noteGuid) => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        let cropEl = v.scene.elements.filter((e) => e.type === 'image' && e.crop).pop();
        if (!cropEl) { await window.__plexusCanvas.test.cropTest(); cropEl = v.scene.elements.filter((e) => e.type === 'image' && e.crop).pop(); }
        if (!cropEl) return { error: 'no cropped image' };
        v.selected = new Set([cropEl.id]);
        const copied = await v._copyImageRefToClip(cropEl);
        const clip = this._imgRefClip;
        const pasted = await this._pasteImageRef(noteGuid);
        return { copied, hadClip: !!clip, clipHasCrop: !!(clip && clip.crop), clipPngBytes: clip && clip.png ? clip.png.size : 0, sourceGuid: clip ? clip.sourceRecordGuid : null, pasted };
      },
      // Phase 8 grid/snap: snapping rounds to gridSize when grid on, passthrough when off.
      gridSnapTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        v.scene.appState.gridModeEnabled = true; v.scene.appState.gridSize = 20;
        const on = [v._snap(13), v._snap(27), v._snap(31)]; // -> 20, 20, 40
        v.scene.appState.gridModeEnabled = false; const off = v._snap(13);
        v.dirty = true;
        return { on, off, snapOk: on[0] === 20 && on[1] === 20 && on[2] === 40, offOk: off === 13 };
      },
      // Phase 8 SVG export: scene -> standalone <svg> string with shape elements.
      svgExportTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        if (!v.scene.elements.filter((e) => !e.isDeleted).length) v.scene.elements.push(makeRect(0, 0, 100, 80, { stroke: '#7c5cff', fill: '#efeaff' }));
        const svg = exportSvg(v.scene);
        return { len: svg.length, startsOk: svg.startsWith('<svg'), endsOk: svg.endsWith('</svg>'), hasShape: /<(rect|ellipse|polygon|text|path|image|polyline)\b/.test(svg) };
      },
      // Phase 8 property panel: apply stroke width / opacity / fill to the selection.
      propPanelTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = makeRect(0, 0, 80, 60, { stroke: '#7c5cff' }); v.scene.elements.push(el); v.selected = new Set([el.id]);
        v._applyProp('strokeWidth', 4); v._applyProp('opacity', 0.5); v._applyFill('hachure');
        return { sw: el.strokeWidth, op: el.opacity, fillStyle: el.fillStyle, ok: el.strokeWidth === 4 && el.opacity === 0.5 && el.fillStyle === 'hachure' && el.backgroundColor !== 'transparent' };
      },
      // Phase 8 in-canvas search: match text elements, focus the first.
      searchTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const mk = (y, txt) => { const t = makeText(0, y, { fontSize: 24 }); t.text = txt; measureText(t); v.scene.elements.push(t); return t; };
        mk(0, 'apple pie'); mk(100, 'banana bread'); mk(200, 'apple sauce');
        const m = v._searchScene('apple'); if (m.length) v._focusMatch(m[0]);
        return { matchCount: m.length, ok: m.length === 2, focusedOne: v.selected.size === 1 };
      },
      // Phase 9 E1 live-record card: insert a card for `guid`, confirm it fetches title + content,
      // then invalidate (simulating a record.updated) and confirm it re-fetches (the "live" path).
      recordCardTest: async (guid) => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = v._insertRecordCard(guid, 100, 100);
        let rec = null; for (let i = 0; i < 40; i++) { await sleep(150); rec = v._recCache && v._recCache.get(guid); if (rec && rec.ready) break; }
        v._invalidateRec(guid);
        let rec2 = null; for (let i = 0; i < 40; i++) { await sleep(150); rec2 = v._recCache && v._recCache.get(guid); if (rec2 && rec2.ready) break; }
        return { cardId: el ? el.id : null, type: el ? el.type : null, title: rec ? rec.title : null, lineCount: rec ? rec.lines.length : -1, ready: !!(rec && rec.ready), invalidatedThenReloaded: !!(rec2 && rec2.ready), reloadedTitle: rec2 ? rec2.title : null };
      },
      // transform: select first element, resize via the 'se' handle math, then rotate 30°, verify geometry.
      transform: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = v.scene.elements.find((e) => !e.isDeleted); if (!el) return { error: 'no element' };
        v.selected.clear(); v.selected.add(el.id);
        const before = { x: el.x, y: el.y, w: el.width, h: el.height, a: el.angle };
        const rs0 = { x: el.x, y: el.y, w: el.width, h: el.height, a: el.angle || 0 };
        v._applyResize(el, 'se', rs0, { x: el.x + el.width + 40, y: el.y + el.height + 30 }); // drag se by (+40,+30)
        const resized = { w: el.width, h: el.height };
        el.angle = Math.PI / 6; // 30°
        v.dirty = true;
        return { before, resized, expectedW: before.w + 40, expectedH: before.h + 30, angleDeg: Math.round(el.angle * 180 / Math.PI), handles: Object.keys(v._handles(el)) };
      },
    };
  }
}

const BASE_CSS = `
.pxc-host { position: relative; }
.pxc-host .pxc-root { position: relative; width: 100%; overflow: hidden; background: var(--color-bg-900); color: var(--color-text-400); font-family: var(--font-family, system-ui, sans-serif); }
.pxc-host .pxc-root .pxc-layer { position: absolute; inset: 0; display: block; }
.pxc-host .pxc-root .pxc-static { z-index: 1; }
.pxc-host .pxc-root .pxc-interactive { z-index: 2; touch-action: none; cursor: crosshair; outline: none; }
.pxc-host .pxc-root .pxc-interactive:focus { outline: none; }
.pxc-host .pxc-root.pxc-panning .pxc-interactive { cursor: grabbing; }
.pxc-host .pxc-root .pxc-toolbar { position: absolute; left: 50%; transform: translateX(-50%); top: 10px; z-index: 5; display: flex; align-items: center; gap: 4px; padding: 5px 7px; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.12); }
.pxc-host .pxc-root .pxc-tool { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--color-text-400); cursor: pointer; font-size: 16px; padding: 0; }
.pxc-host .pxc-root .pxc-tool:hover { background: var(--sidebar-bg-hover); }
.pxc-host .pxc-root .pxc-tool.active { background: var(--button-primary-bg-color, #7c5cff); color: #fff; }
.pxc-host .pxc-root .pxc-sep { width: 1px; align-self: stretch; margin: 2px 4px; background: var(--cards-border-color); }
.pxc-host .pxc-root .pxc-flipnote { width: auto; gap: 4px; padding: 0 9px; font-size: 12px; font-weight: 600; }
.pxc-host .pxc-root .pxc-flipnote:hover { background: var(--sidebar-bg-hover); }
.pxc-host .pxc-root .pxc-props { position: absolute; left: 50%; transform: translateX(-50%); top: 54px; z-index: 5; display: none; align-items: center; gap: 6px; padding: 4px 9px; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 9px; box-shadow: 0 4px 14px rgba(0,0,0,.12); font-size: 12px; }
.pxc-host .pxc-root .pxc-props.show { display: flex; }
.pxc-host .pxc-root .pxc-prop-label { color: var(--color-text-600); font-size: 11px; }
.pxc-host .pxc-root .pxc-prop-sep { width: 1px; height: 18px; background: var(--cards-border-color); }
.pxc-host .pxc-root .pxc-prop-btn { min-width: 26px; height: 24px; padding: 0 6px; border: 1px solid var(--cards-border-color); border-radius: 6px; background: transparent; color: var(--color-text-400); cursor: pointer; font-size: 11px; }
.pxc-host .pxc-root .pxc-prop-btn:hover { background: var(--sidebar-bg-hover); }
.pxc-host .pxc-root .pxc-prop-btn.active { background: var(--button-primary-bg-color, #7c5cff); color: #fff; border-color: transparent; }
.pxc-host .pxc-root .pxc-prop-range { width: 80px; accent-color: var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-search { position: absolute; right: 12px; top: 12px; z-index: 6; display: flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 9px; box-shadow: 0 4px 14px rgba(0,0,0,.12); }
.pxc-host .pxc-root .pxc-search-input { width: 150px; border: 0; outline: none; background: transparent; color: var(--color-text-400); font-size: 13px; }
.pxc-host .pxc-root .pxc-search-count { font-size: 11px; color: var(--color-text-600); min-width: 28px; text-align: right; }
.pxc-host .pxc-root .pxc-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.pxc-host .pxc-root .pxc-swatch.active { box-shadow: 0 0 0 2px var(--cards-bg), 0 0 0 3px var(--color-text-400); }
.pxc-host .pxc-root .pxc-textedit { position: absolute; z-index: 4; margin: 0; padding: 0; border: 0; outline: none; background: transparent; resize: none; overflow: hidden; white-space: pre; line-height: 1.25; min-height: 1em; font-family: system-ui, sans-serif; box-shadow: 0 0 0 1px var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-hint { position: absolute; left: 10px; bottom: 8px; z-index: 3; pointer-events: none; font-size: 11px; opacity: .42; color: var(--color-text-400); }
.pxc-host .pxc-empty { min-height: calc(100vh - 140px); display: flex; align-items: center; justify-content: center; text-align: center; opacity: .65; font-size: 14px; line-height: 1.6; }
.pxc-host .pxc-empty small { opacity: .7; }
`;
