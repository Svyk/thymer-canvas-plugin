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

const PLEXUS_VERSION = '0.50.0';
const PANEL_ID = 'plexus-canvas';
const GALLERY_PANEL_ID = 'plexus-gallery';
const DRAWINGS_COLLECTION = 'Plexus Drawings';
const SCENE_SCHEMA = 1;
const SCENE_FILENAME = 'plexus-scene.json'; // sentinel: the file line item that carries a record's scene
const PLEXUS_SETTINGS_KEY = 'plexus_settings';
const PLEXUS_SETTINGS_DEFAULTS = {
  // S1 General
  bannerPreview: true, darkMode: false, openMode: 'normal',
  // S2 Canvas behavior
  dblClickText: true,
  // S3 Zoom & Pan
  wheelZoom: true, panRightMouse: false, zoomToFitOnOpen: false, zoomMin: 0.1, zoomMax: 30,
  // S5 Grid
  gridColor: '#7c5cff', gridOpacity: 28, gridDynamic: false,
  // S7 Fonts
  defaultFont: 'system-ui, sans-serif',
  // S8 Export
  pngScale: 2, exportPadding: 24, exportBackground: true,
  // S6 Laser pointer
  laserColor: '#ef4444', laserDecay: 1400, laserWidth: 4,
  // S11 AI
  aiProvider: 'openai', aiModel: '',
};
function loadPlexusSettings() { try { return Object.assign({}, PLEXUS_SETTINGS_DEFAULTS, JSON.parse(localStorage.getItem(PLEXUS_SETTINGS_KEY) || '{}')); } catch (_e) { return Object.assign({}, PLEXUS_SETTINGS_DEFAULTS); } }
function savePlexusSettings(s) { try { localStorage.setItem(PLEXUS_SETTINGS_KEY, JSON.stringify(s)); } catch (_e) {} }
function hexToRgba(hex, a) { const h = (hex || '#7c5cff').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return 'rgba(' + (r || 124) + ',' + (g || 92) + ',' + (b || 255) + ',' + a + ')'; }
// P0.4/P0.4b: light fill tint for a stroke colour + named colour schemes (Shade Master / Color Scheme Manager).
function tintColor(hex) { const h = (hex || '#7c5cff').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const r = parseInt(n.slice(0, 2), 16) || 124, g = parseInt(n.slice(2, 4), 16) || 92, b = parseInt(n.slice(4, 6), 16) || 255; const mix = (c) => Math.round(c + (255 - c) * 0.78); return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join(''); }
const COLOR_SCHEMES = {
  Plexus: ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#1e1e1e'],
  Cloud: ['#FF9900', '#4285F4', '#0089D6', '#326CE5', '#00A4A6'],
  Nature: ['#1b4332', '#2d6a4f', '#52b788', '#74c69d', '#b7e4c7'],
  Sunset: ['#fd7e14', '#ff6b6b', '#f06595', '#cc5de8', '#845ef7'],
  Mono: ['#111111', '#444444', '#777777', '#aaaaaa', '#cccccc'],
  Ocean: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
};
/* P0.0: encrypted secret store — PBKDF2-600k → AES-256-GCM (same crypto as Smart Connections). The AI key is
   stored ENCRYPTED at rest (localStorage), unlocked once per session with a passphrase, wiped on pagehide. */
const pxEnc = new TextEncoder(), pxDec = new TextDecoder();
const pxB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const pxUnb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const PLEXUS_SECRET_LS = 'plexus_secret_blob';
async function pxDeriveKey(passphrase, salt) {
  const pw = await crypto.subtle.importKey('raw', pxEnc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, pw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function pxEncryptSecret(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pxDeriveKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pxEnc.encode(plaintext));
  return { v: 1, salt: pxB64(salt), iv: pxB64(iv), ct: pxB64(ct) };
}
async function pxDecryptSecret(blob, passphrase) {
  const key = await pxDeriveKey(passphrase, pxUnb64(blob.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: pxUnb64(blob.iv) }, key, pxUnb64(blob.ct)); // throws (GCM tag) on wrong passphrase
  return pxDec.decode(pt);
}
const TEST_HOOKS = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PALETTE = ['#1e1e1e', '#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
const FILLS = { '#1e1e1e': 'transparent', '#7c5cff': '#efeaff', '#0ea5e9': '#e0f2fe', '#10b981': '#dcfce7', '#f59e0b': '#fef3c7', '#ef4444': '#fee2e2' };
const TAG_COLORS = ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
function tagColor(s) { s = String(s || ''); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return TAG_COLORS[Math.abs(h) % TAG_COLORS.length]; }
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
  { id: 'frame', icon: 'ti-layout-board', title: 'Frame (F) — a named boundary; moves its contents together' },
  { id: 'laser', icon: 'ti-target', title: 'Laser pointer (L) — a fading trail for presenting' },
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
let PLEXUS_DEFAULT_FONT = 'system-ui, sans-serif'; // S7/P0.6: user-chosen default font (set from settings on load + change)
function textFont(el) { return (el.fontSize || 24) + 'px ' + ((el.fontFamily && el.fontFamily !== 'system-ui, sans-serif') ? el.fontFamily : PLEXUS_DEFAULT_FONT); }
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
// Phase 8: elbow arrows — route a 2-point linear element as an orthogonal (right-angle) path.
function routedPoints(el) {
  if (!el.elbowed || !el.points || el.points.length !== 2) return el.points;
  const a = el.points[0], b = el.points[1], ax = a[0], ay = a[1], bx = b[0], by = b[1];
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) { const mx = (ax + bx) / 2; return [[ax, ay], [mx, ay], [mx, by], [bx, by]]; }
  const my = (ay + by) / 2; return [[ax, ay], [ax, my], [bx, my], [bx, by]];
}
function drawLinear(ctx, el) {
  const pts = routedPoints(el); if (!pts || pts.length < 2) return; // points are ABSOLUTE world coords
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
// P1.0: a frame — a named boundary that owns the elements inside it (move together; slide/page unit).
function makeFrame(x, y, w, h) {
  return { id: newId(), type: 'frame', x, y, width: w, height: h, angle: 0, name: 'Frame', strokeColor: '#9aa0a6', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [] };
}
function hitFrameBorder(el, wx, wy, tol, labelH) {
  if (wx >= el.x && wx <= el.x + Math.min(160, el.width) && wy >= el.y - labelH && wy <= el.y) return true; // name-label band
  const inOuter = wx >= el.x - tol && wx <= el.x + el.width + tol && wy >= el.y - tol && wy <= el.y + el.height + tol;
  const inInner = wx >= el.x + tol && wx <= el.x + el.width - tol && wy >= el.y + tol && wy <= el.y + el.height - tol;
  return inOuter && !inInner; // border ring only — interior clicks pass through to contained elements
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
    text: '', fontSize: style.fontSize || 24, fontFamily: style.fontFamily || PLEXUS_DEFAULT_FONT, textAlign: 'left',
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
// Phase 9 E2: a LIVE query node — runs a searchByQuery and lists matching records, re-runs on changes.
function makeQueryNode(x, y, w, h, query) {
  return {
    id: newId(), type: 'query', x, y, width: w, height: h, angle: 0, query: query || '@task',
    strokeColor: '#0ea5e9', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
// Phase 9 E10: a board card — embeds ANOTHER drawing's live preview (its scene banner PNG).
function makeBoardCard(x, y, w, h, recordGuid) {
  return {
    id: newId(), type: 'board', x, y, width: w, height: h, angle: 0, recordGuid,
    strokeColor: '#10b981', backgroundColor: '#0f1117', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
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
    const pts = routedPoints(el) || []; const t = tol + (el.strokeWidth || 2);
    for (let i = 0; i < pts.length - 1; i++) if (distToSeg(wx, wy, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= t) return true;
    return false;
  }
  if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, c = Math.cos(-el.angle), s = Math.sin(-el.angle), dx = wx - cx, dy = wy - cy; wx = cx + dx * c - dy * s; wy = cy + dx * s + dy * c; }
  const minx = Math.min(el.x, el.x + el.width), maxx = Math.max(el.x, el.x + el.width);
  const miny = Math.min(el.y, el.y + el.height), maxy = Math.max(el.y, el.y + el.height);
  if (wx < minx - tol || wx > maxx + tol || wy < miny - tol || wy > maxy + tol) return false;
  if (el.type === 'freedraw' || el.type === 'text' || el.type === 'image' || el.type === 'record' || el.type === 'query' || el.type === 'board') return true; // within bbox is good enough for selection
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
    const nz = Math.min(this.zoomMax || 30, Math.max(this.zoomMin || 0.05, this.zoom * factor));
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
function exportPng(scene, maxPx = 1024, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    try {
      const b = sceneBounds(scene); const pad = opts.padding != null ? opts.padding : 24;
      const w = b.w + pad * 2, h = b.h + pad * 2; // S8: explicit scale, else fit to maxPx
      const scale = opts.scale ? opts.scale : Math.min(2, maxPx / Math.max(w, h, 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
      const ctx = cv.getContext('2d');
      if (opts.background !== false) { ctx.fillStyle = scene.appState.viewBackgroundColor || '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
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
    else if (el.type === 'text') { const fs = el.fontSize || 24, ff = svgEsc((el.fontFamily && el.fontFamily !== 'system-ui, sans-serif') ? el.fontFamily : PLEXUS_DEFAULT_FONT), lines = String(el.text || '').split('\n'); const ts = lines.map((ln, i) => `<tspan x="${el.x}" dy="${i === 0 ? fs : (fs * 1.25).toFixed(1)}">${svgEsc(ln)}</tspan>`).join(''); p.push(`<text font-family="${ff}" font-size="${fs}" fill="${sc}" opacity="${op}">${ts}</text>`); }
    else if (el.type === 'arrow' || el.type === 'line') { const pts = (el.points || []).map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' '); p.push(`<polyline points="${pts}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`); }
    else if (el.type === 'freedraw') { const pts = el.points || []; if (pts.length) { const d = 'M' + pts.map((q) => q.map((n) => n.toFixed(1)).join(' ')).join(' L'); p.push(`<path d="${d}" fill="none" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`); } }
    else if (el.type === 'image') { const f = scene.files && scene.files[el.fileId]; if (f && f.dataURL) p.push(`<image x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" href="${svgEsc(f.dataURL)}" opacity="${op}" preserveAspectRatio="none"/>`); }
  }
  p.push('</g></svg>');
  return p.join('');
}
// Phase 8: SVG import — parse the common SVG subset (incl. our own exportSvg output) into elements.
function parsePathML(d, ox, oy) {
  if (!d) return []; const pts = []; const re = /([MLml])\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g; let m;
  while ((m = re.exec(d))) { pts.push([ox + parseFloat(m[2]), oy + parseFloat(m[3])]); }
  return pts;
}
function importSvg(svgText, ox, oy) {
  ox = ox || 0; oy = oy || 0; const els = [];
  let svg = null; try { svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').querySelector('svg'); } catch (_e) {}
  if (!svg) return els;
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d || 0); };
  const col = (v, d) => (!v || v === 'none') ? (d || 'transparent') : v;
  for (const node of svg.querySelectorAll('rect,circle,ellipse,line,polyline,polygon,path,text')) {
    const stroke = col(node.getAttribute('stroke'), '#1e1e1e'), fill = col(node.getAttribute('fill'), 'transparent'), sw = num(node.getAttribute('stroke-width'), 2), tag = node.tagName.toLowerCase();
    if (tag === 'rect') { if (/%/.test(node.getAttribute('width') || '') || /%/.test(node.getAttribute('height') || '')) continue; els.push(makeRect(ox + num(node.getAttribute('x')), oy + num(node.getAttribute('y')), num(node.getAttribute('width'), 40), num(node.getAttribute('height'), 40), { stroke, fill, fillStyle: 'solid', strokeWidth: sw })); }
    else if (tag === 'circle') { const r = num(node.getAttribute('r'), 20), cx = num(node.getAttribute('cx')), cy = num(node.getAttribute('cy')); els.push(makeRect(ox + cx - r, oy + cy - r, r * 2, r * 2, { type: 'ellipse', stroke, fill, fillStyle: 'solid', strokeWidth: sw })); }
    else if (tag === 'ellipse') { const rx = num(node.getAttribute('rx'), 20), ry = num(node.getAttribute('ry'), 20), cx = num(node.getAttribute('cx')), cy = num(node.getAttribute('cy')); els.push(makeRect(ox + cx - rx, oy + cy - ry, rx * 2, ry * 2, { type: 'ellipse', stroke, fill, fillStyle: 'solid', strokeWidth: sw })); }
    else if (tag === 'line') { const a = makeLinear(0, 0, 'line', { stroke, strokeWidth: sw }); a.points = [[ox + num(node.getAttribute('x1')), oy + num(node.getAttribute('y1'))], [ox + num(node.getAttribute('x2')), oy + num(node.getAttribute('y2'))]]; a.endArrowhead = null; linearBBox(a); els.push(a); }
    else if (tag === 'polyline' || tag === 'polygon') { const pts = (node.getAttribute('points') || '').trim().split(/\s+/).map((q) => q.split(',').map(Number)).filter((q) => q.length === 2 && q.every(isFinite)); if (pts.length >= 2) { const a = makeLinear(0, 0, 'line', { stroke, strokeWidth: sw }); a.points = pts.map((q) => [ox + q[0], oy + q[1]]); if (tag === 'polygon') a.points.push([ox + pts[0][0], oy + pts[0][1]]); a.endArrowhead = null; linearBBox(a); els.push(a); } }
    else if (tag === 'path') { const pts = parsePathML(node.getAttribute('d'), ox, oy); if (pts.length >= 2) { const fd = makeFreedraw(pts[0][0], pts[0][1], { stroke, strokeWidth: sw }); fd.points = pts; freedrawBBox(fd); els.push(fd); } }
    else if (tag === 'text') { const fs = num(node.getAttribute('font-size'), 16); const t = makeText(ox + num(node.getAttribute('x')), oy + num(node.getAttribute('y')) - fs, { stroke, fontSize: fs }); t.text = node.textContent || ''; measureText(t); els.push(t); }
  }
  return els;
}
// Phase 10 E6: turn an LLM's JSON shape list into canvas elements (the verifiable half of AI diagramming).
function elementsFromAiJson(arr, ox, oy) {
  ox = ox || 0; oy = oy || 0; const out = [];
  for (const it of (Array.isArray(arr) ? arr : [])) {
    if (!it || typeof it !== 'object') continue;
    const x = ox + (+it.x || 0), y = oy + (+it.y || 0), w = +it.w || 130, h = +it.h || 70, color = it.color || '#7c5cff', t = String(it.type || 'rectangle').toLowerCase();
    if (t === 'text') { const e = makeText(x, y, { fontSize: +it.fontSize || 20, stroke: color }); e.text = String(it.text || ''); measureText(e); out.push(e); }
    else if (t === 'arrow' || t === 'line') { const e = makeLinear(x, y, t === 'line' ? 'line' : 'arrow', { stroke: color, strokeWidth: 2 }); e.points = [[x, y], [x + w, y + h]]; linearBBox(e); out.push(e); }
    else { const e = makeRect(x, y, w, h, { type: (t === 'ellipse' || t === 'diamond') ? t : 'rectangle', stroke: color, fill: FILLS[color] || '#efeaff', fillStyle: 'solid' }); out.push(e); if (it.text) { const lbl = makeText(x + 9, y + h / 2 - 10, { fontSize: 14, stroke: '#1e1e1e' }); lbl.text = String(it.text); measureText(lbl); out.push(lbl); } }
  }
  return out;
}
async function saveScene(plugin, rec, scene, camera, view) {
  scene.appState.scroll = { x: camera.x, y: camera.y }; scene.appState.zoom = camera.zoom;
  const file = new File([JSON.stringify(scene)], SCENE_FILENAME, { type: 'application/json' });
  const blob = await plugin.data.uploadBlob(file);
  if (!blob) return { ok: false, reason: 'uploadBlob null' };
  let ok = false, mode = 'line';
  // UX-4: prefer the record's `Scene` FILE PROPERTY (clean — not in the note body). prop() is null when the
  // collection has no such property, in which case we fall back to a body `file` line item.
  let sceneProp = null; try { sceneProp = rec.prop('Scene'); } catch (_e) {}
  if (sceneProp && typeof sceneProp.setFileFromBlob === 'function') {
    try { sceneProp.setFileFromBlob(blob); mode = 'prop'; ok = true; } catch (_e) { mode = 'line'; }
    if (mode === 'prop') {
      // Migrate: if the scene was previously stored as a body line item, remove it so the note stays clean.
      try { const old = (view && view._sceneLine) || await findSceneLine(rec); if (old) { try { await old.delete(); } catch (_e) {} if (view) view._sceneLine = null; } } catch (_e) {}
    }
  }
  if (mode !== 'prop') {
    // Fallback: a body `file` line item (collections without a Scene property). setBlob REPLACES the file.
    let line = view && view._sceneLine ? view._sceneLine : null;
    if (!line) { try { line = await findSceneLine(rec); } catch (_e) {} }
    // createLineItem can fail on a record created <1s ago (writes lag creation, rule 18) — retry briefly.
    if (!line) { let err = null; for (let i = 0; i < 5 && !line; i++) { try { line = await rec.createLineItem(null, null, 'file', null, null); } catch (e) { err = e; } if (!line) await sleep(150); } if (!line) return { ok: false, reason: 'createLineItem ' + err }; }
    if (view) view._sceneLine = line;
    try { ok = await line.setBlob(blob); } catch (e) { return { ok: false, reason: 'setBlob ' + e }; }
  }
  // Best-effort metadata (Plexus Drawings + any collection with these props; silently skipped elsewhere).
  try { if (rec.prop('Scene Rev')) { const cur = rec.prop('Scene Rev').number() || 0; rec.prop('Scene Rev').set(cur + 1); rec.prop('Scene Schema').set(scene.schema || SCENE_SCHEMA); } } catch (_e) {}
  // Banner = PNG preview (the card's cover image — the visual "drawing face" of the record). UX-5: gated by setting.
  try { const showBanner = !plugin._settings || plugin._settings.bannerPreview !== false; if (showBanner) { const png = await exportPng(scene); if (png) { const pb = await plugin.data.uploadBlob(new File([png], 'preview.png', { type: 'image/png' })); if (pb) rec.setBannerFromBlob(pb); } } else { try { rec.setBanner(null); } catch (_e2) {} } } catch (_e) {} // UX-5: clear the banner when the preview is disabled
  return { ok, mode, blobGuid: blob.guid };
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
  // Flip back to the plain note. UX-3: open IN PLACE (navigate THIS panel to the note editor), not a side panel.
  async _flipToNote() {
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    try { await this.panel.navigateTo({ type: 'edit_panel', rootId: this.recordGuid, workspaceGuid: ws }); return; } catch (_e) {}
    // Fallback: if in-place nav fails, open in a side panel.
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) { try { panel = await this.plugin.ui.createPanel(); } catch (_e) {} }
    if (panel) { try { panel.navigateTo({ type: 'edit_panel', rootId: this.recordGuid, workspaceGuid: ws }); } catch (e) { console.error('[Plexus] flipToNote', e); } }
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
    // GUARDRAILS: Thymer wraps the custom panel in `empty-msg-panel` (flex + padding + min-height:100%) → the
    // scroller overflows and the absolute toolbar (with the Note button) drifts off as you scroll. CSS neutralizes
    // that box; trim any residual overshoot here so the panel never scrolls.
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) { h = Math.max(160, h - (scroller.scrollHeight - scroller.clientHeight)); this.wrap.style.height = h + 'px'; }
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
  // Phase 8: elbow-arrow toggle on the selected arrow/line elements.
  _toggleElbow() { let ch = false, on = null; for (const id of this.selected) { const el = this._byId(id); if (el && (el.type === 'arrow' || el.type === 'line')) { el.elbowed = !el.elbowed; on = el.elbowed; ch = true; } } if (ch) { this._updateBindings(); this.dirty = true; this.scheduleSave(); } return on; }
  // Phase 8: presentation/view mode — hide chrome, fit the scene, read-only until Esc.
  _fitToBounds(b, pad) {
    pad = pad || 60;
    const zw = this.cssW / (b.w + pad * 2), zh = this.cssH / (b.h + pad * 2);
    this.camera.zoom = Math.min(8, Math.max(0.05, Math.min(zw, zh)));
    this.camera.x = b.x + b.w / 2 - (this.cssW / this.camera.zoom) / 2;
    this.camera.y = b.y + b.h / 2 - (this.cssH / this.camera.zoom) / 2;
    this.dirty = true;
  }
  _fitToScene() { const live = this.scene.elements.filter((e) => !e.isDeleted); if (!live.length) return; this._fitToBounds(sceneBounds(this.scene), 60); }
  // P0.5: frames are slides — ordered by name (natural sort), then by position.
  _slideFrames() {
    const fr = this.scene.elements.filter((e) => !e.isDeleted && e.type === 'frame');
    return fr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }) || (a.y - b.y) || (a.x - b.x));
  }
  _gotoSlide(i) { if (!this._slides || !this._slides.length) return; this._slideIdx = Math.max(0, Math.min(this._slides.length - 1, i)); const f = this._slides[this._slideIdx]; this._fitToBounds({ x: f.x, y: f.y, w: f.width, h: f.height }, 24); }
  _enterPresent() {
    this._present = true; if (this.wrap) this.wrap.classList.add('pxc-present'); this.selected.clear();
    this._slides = this._slideFrames();
    if (this._slides.length) { this._slideIdx = 0; this._gotoSlide(0); } else this._fitToScene(); // P0.5: frame-path slideshow, else fit whole scene
  }
  _exitPresent() { this._present = false; this._slides = null; if (this.wrap) this.wrap.classList.remove('pxc-present'); this.dirty = true; }
  _drawGrid(ctx) {
    if (!this._gridOn()) return;
    const st = this.plugin._settings || {};
    const gs = this._gridSize(), z = this.camera.zoom;
    const x0 = this.camera.x, y0 = this.camera.y, x1 = x0 + this.cssW / z, y1 = y0 + this.cssH / z;
    const sx = Math.floor(x0 / gs) * gs, sy = Math.floor(y0 / gs) * gs;
    const op = Math.max(0, Math.min(100, st.gridOpacity == null ? 28 : st.gridOpacity)) / 100; // S5
    const col = st.gridDynamic ? (st.darkMode ? 'rgba(255,255,255,' + op + ')' : 'rgba(0,0,0,' + op + ')') : hexToRgba(st.gridColor || '#7c5cff', op);
    ctx.save(); ctx.fillStyle = col; const r = Math.max(0.5, 1 / z);
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
  // S8: export the drawing as a PNG, honoring the export settings (scale / padding / background).
  async _exportPngFile() {
    const st = this.plugin._settings || {};
    const blob = await exportPng(this.scene, 4096, { scale: st.pngScale || 2, padding: st.exportPadding != null ? st.exportPadding : 24, background: st.exportBackground !== false });
    if (!blob) { try { this.plugin.ui.addToaster({ title: 'Plexus: PNG export failed.', dismissible: true }); } catch (_e) {} return 0; }
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'plexus-drawing.png'; document.body.appendChild(a); a.click();
    setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) {} }, 1000);
    try { this.plugin.ui.addToaster({ title: 'Exported drawing as PNG.', dismissible: true }); } catch (_e) {}
    return blob.size;
  }
  // P1.5: render a world-bounds region to a PNG dataURL (shapes/text/images; cards via drawElement fallback).
  _renderRegionPng(b, scale) {
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(b.w * scale)); cv.height = Math.max(1, Math.round(b.h * scale));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = (this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    for (const el of this.scene.elements) { if (el.isDeleted || el.type === 'frame') continue; try { drawElement(ctx, el); } catch (_e) {} } // outside-bounds elements clip to canvas
    return cv.toDataURL('image/png');
  }
  // P1.5: Printable Layout — named frames become ordered pages; opens a print view (Save as PDF).
  _printFrames() {
    const frames = this._slideFrames();
    if (!frames.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: add named frames first — each frame is a page.', dismissible: true }); } catch (_e) {} return; }
    const scale = Math.max(1, (this.plugin._settings && this.plugin._settings.pngScale) || 2);
    const pages = frames.map((f) => this._renderRegionPng({ x: f.x, y: f.y, w: f.width, h: f.height }, scale));
    const w = window.open('', '_blank');
    if (!w) { try { this.plugin.ui.addToaster({ title: 'Plexus: allow popups to print, or use Export as PNG per frame.', dismissible: true }); } catch (_e) {} return; }
    const imgs = pages.map((d) => '<div class="pg"><img src="' + d + '"/></div>').join('');
    w.document.write('<html><head><title>Plexus — print</title><style>@page{margin:10mm}body{margin:0}.pg{page-break-after:always;display:flex;align-items:center;justify-content:center;height:100vh}img{max-width:100%;max-height:100%}</style></head><body>' + imgs + '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},350);}</scr' + 'ipt></body></html>');
    w.document.close();
    try { this.plugin.ui.addToaster({ title: frames.length + ' page(s) — use “Save as PDF” in the print dialog.', dismissible: true }); } catch (_e) {}
  }
  // Phase 8: import an SVG string as elements at (wx,wy) (or viewport centre); selects them.
  _importSvgText(svgText, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const els = importSvg(svgText, wx, wy); if (!els.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no importable SVG shapes found.', dismissible: true }); } catch (_e) {} return 0; }
    this.selected.clear(); for (const el of els) { this.scene.elements.push(el); this.selected.add(el.id); }
    this.dirty = true; this.scheduleSave(); return els.length;
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
    const tol = 6 / this.camera.zoom, labelH = 18 / this.camera.zoom;
    for (let i = this.scene.elements.length - 1; i >= 0; i--) { const el = this.scene.elements[i]; if (el.isDeleted) continue; if (el.type === 'frame') { if (hitFrameBorder(el, wx, wy, tol, labelH)) return el; continue; } if (hitElement(el, wx, wy, tol)) return el; }
    return null;
  }
  _centerIn(el, fr) { const cx = el.x + (el.width || 0) / 2, cy = el.y + (el.height || 0) / 2; return cx >= fr.x && cx <= fr.x + fr.width && cy >= fr.y && cy <= fr.y + fr.height; }
  _frameChildren(fr) { return this.scene.elements.filter((e) => !e.isDeleted && e.type !== 'frame' && e.id !== fr.id && this._centerIn(e, fr)); } // P1.0
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
      if (this._present) { if (e.button === 0 && this._slides && this._slides.length) this._gotoSlide((this._slideIdx || 0) + 1); return; } // P0.5: click advances slides
      const stp = this.plugin._settings || {};
      if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 2 && stp.panRightMouse)) { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.wrap.classList.add('pxc-panning'); return; } // S3: right-mouse pan
      if (e.button !== 0) return;
      moved = false; down = this._worldAt(e);
      const rect = this.wrap.getBoundingClientRect(); const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (this.tool === 'select') {
        const sel = this._singleSel();
        if (sel && (sel.type === 'rectangle' || sel.type === 'ellipse' || sel.type === 'diamond' || sel.type === 'record' || sel.type === 'image' || sel.type === 'query' || sel.type === 'board' || sel.type === 'frame')) {
          const H = this._handles(sel);
          const near = (k) => { const s2 = this.camera.worldToScreen(H[k].x, H[k].y); return Math.hypot(s2.x - sp.x, s2.y - sp.y) < 10; };
          if (near('rot')) { mode = 'rotate'; rotEl = sel; rotCenter = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 }; rotStart = sel.angle || 0; rotPtr0 = Math.atan2(down.y - rotCenter.y, down.x - rotCenter.x); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
          for (const k of HANDLE_KEYS) if (near(k)) { mode = 'resize'; rsEl = sel; rsHandle = k; rs0 = { x: sel.x, y: sel.y, w: sel.width, h: sel.height, a: sel.angle || 0 }; try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
        }
        const hit = this._hitTopAt(down.x, down.y);
        if (hit) {
          if (!this.selected.has(hit.id)) { if (!e.shiftKey) this.selected.clear(); const gid = this._topGroup(hit); if (gid) { for (const id of this._groupMembers(gid)) this.selected.add(id); } else this.selected.add(hit.id); }
          const mk = (el) => ({ el, x0: el.x, y0: el.y, pts0: (el.type === 'freedraw' || el.type === 'arrow' || el.type === 'line') ? el.points.map((p) => [p[0], p[1]]) : null });
          mode = 'move'; moveEls = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map(mk);
          // P1.0: moving a frame carries the elements inside it.
          const seen = new Set(this.selected);
          for (const m of [...moveEls]) { if (m.el.type === 'frame') for (const c of this._frameChildren(m.el)) if (!seen.has(c.id)) { seen.add(c.id); moveEls.push(mk(c)); } }
        } else { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; if (!e.shiftKey) this.selected.clear(); this.wrap.classList.add('pxc-panning'); }
      } else if (this.tool === 'frame') {
        mode = 'create'; created = makeFrame(down.x, down.y, 0, 0); this.scene.elements.unshift(created); this.selected.clear(); // P1.0: frames render behind (unshift to array front)
      } else if (this.tool === 'laser') {
        mode = 'laser'; this._laser = [{ x: down.x, y: down.y, t: Date.now() }]; this.dirty = true; // S6: transient trail
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
      if (mode === 'laser') { this._laser.push({ x: w.x, y: w.y, t: Date.now() }); this.dirty = true; return; } // S6
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
    const onWheel = (e) => { e.preventDefault(); const st = this.plugin._settings || {}; const rect = this.wrap.getBoundingClientRect(); const wz = st.wheelZoom !== false; const zoomNow = e.ctrlKey ? !wz : wz; if (zoomNow) { this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012)); } else { this.camera.x += e.deltaX / this.camera.zoom; this.camera.y += e.deltaY / this.camera.zoom; } this.dirty = true; this._saveCamera(); }; // S3: wheel zoom vs scroll
    const onKey = (e) => {
      if (this.editingId) return; // a text overlay is open — let it handle keys
      if (this._present) { // present mode: read-only; Esc exits, arrows/space step through frame-slides (P0.5)
        if (e.key === 'Escape') { e.preventDefault(); this._exitPresent(); return; }
        if (this._slides && this._slides.length) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); this._gotoSlide((this._slideIdx || 0) + 1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); this._gotoSlide((this._slideIdx || 0) - 1); }
        }
        return;
      }
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
      const mmSel = this._singleSel(); // P0.2: Tab/Enter grow the mind map when a node is selected
      if (mmSel && mmSel.mmRoot && mmSel.type === 'text') {
        if (e.key === 'Tab') { e.preventDefault(); this._mmAddChild(mmSel); return; }
        if (e.key === 'Enter') { e.preventDefault(); this._mmAddSibling(mmSel); return; }
      }
      const map = { v: 'select', r: 'rectangle', o: 'ellipse', d: 'diamond', a: 'arrow', p: 'pen', t: 'text', e: 'eraser', c: 'crop', f: 'frame', l: 'laser' };
      if (map[e.key]) { this.tool = map[e.key]; this._syncToolbar(); }
      if (e.key === 'Escape') { this.selected.clear(); this.tool = 'select'; this._syncToolbar(); this.dirty = true; }
    };
    const onDblClick = (e) => {
      const dblText = (this.plugin._settings ? this.plugin._settings.dblClickText !== false : true); // S2
      const w = this._worldAt(e); const hit = this._hitTopAt(w.x, w.y);
      if (hit && hit.type === 'text') { if (hit.refGuid) { this._openRecord(hit.refGuid); return; } if (!dblText) return; this.selected.clear(); this.selected.add(hit.id); this._editText(hit); } // P1.6: ref node opens its record
      else if (hit && hit.type === 'record') { this._openRecord(hit.recordGuid); }
      else if (hit && hit.type === 'query') { this._promptText('Query (Thymer search syntax):', hit.query).then((q) => { if (q != null) { hit.query = q; this.dirty = true; this.scheduleSave(); } }); }
      else if (hit && hit.type === 'board') { this.plugin._openPanelFor(hit.recordGuid); }
      else if (hit && hit.type === 'frame') { this._promptText('Frame name:', hit.name || 'Frame').then((n) => { if (n != null) { hit.name = n; this.dirty = true; this.scheduleSave(); } }); } // P1.0 rename
      else if (!hit && dblText) { const el = makeText(w.x, w.y, { stroke: this.strokeColor, fontSize: 24 }); this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this._editText(el); }
    };
    const onContextMenu = (e) => { if (this.plugin._settings && this.plugin._settings.panRightMouse) e.preventDefault(); }; // S3: suppress menu when right-drag pans
    host.addEventListener('pointerdown', onDown); host.addEventListener('pointermove', onMove); host.addEventListener('pointerup', onUp);
    host.addEventListener('wheel', onWheel, { passive: false }); host.addEventListener('keydown', onKey); host.addEventListener('dblclick', onDblClick); host.addEventListener('contextmenu', onContextMenu);
    this._localDisposers.push(() => { host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerup', onUp); host.removeEventListener('wheel', onWheel); host.removeEventListener('keydown', onKey); host.removeEventListener('dblclick', onDblClick); host.removeEventListener('contextmenu', onContextMenu); });
    // images: drag-drop onto the canvas, or paste while the canvas is focused
    const onDragOver = (e) => { if (e.dataTransfer && [...(e.dataTransfer.items || [])].some((it) => it.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const onDrop = (e) => { const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return; e.preventDefault(); const w = this._worldAt(e); let i = 0; for (const f of files) { const isSvg = (f.type === 'image/svg+xml') || /\.svg$/i.test(f.name || ''); if (isSvg) { const r = new FileReader(); r.onload = () => this._importSvgText(String(r.result || ''), w.x + i * 24, w.y + i * 24); r.readAsText(f); i++; } else if (f.type && f.type.startsWith('image/')) { this._addImageFromFile(f, w.x + i * 24, w.y + i * 24); i++; } } };
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
      ta.style.fontSize = ((el.fontSize || 24) * z) + 'px'; ta.style.color = el.strokeColor || '#1e1e1e'; ta.style.fontFamily = (el.fontFamily && el.fontFamily !== 'system-ui, sans-serif') ? el.fontFamily : PLEXUS_DEFAULT_FONT; // S7
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
        try { const props = (rec.getAllProperties && rec.getAllProperties()) || []; for (const pr of props) { try { const lbl = pr.choiceLabel && pr.choiceLabel(); if (lbl) { entry.tag = lbl; break; } } catch (_e) {} } } catch (_e) {} // Phase 9 E11: encode by a choice property
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
    ctx.save(); ctx.clip();
    const rec = this._recFor(el.recordGuid); const pad = 10, tx = x + pad + 4, maxW = w - pad * 2 - 4; let ty = y + pad;
    ctx.fillStyle = (rec && rec.tag) ? tagColor(rec.tag) : (el.strokeColor || '#7c5cff'); ctx.fillRect(x, y, 4, h); // E11: accent encodes a choice property
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
  // Phase 9 E2: query-node cache + render. Runs searchByQuery; the plugin invalidates on record events.
  _queryFor(q) {
    if (!this._queryCache) this._queryCache = new Map();
    const c = this._queryCache.get(q);
    if (c) return c.ready ? c : null;
    const entry = { ready: false, items: [], count: 0 }; this._queryCache.set(q, entry);
    (async () => {
      try {
        const res = await this.plugin.data.searchByQuery(q, 30);
        const recs = (res && res.records) || [], lines = (res && res.lines) || [];
        const recItems = recs.slice(0, 20).map((r) => ({ guid: r.guid, title: (r.getName && r.getName()) || 'Untitled', kind: 'record' }));
        const lineItems = lines.slice(0, 20).map((li) => { let g = null; try { g = li.getRecord && li.getRecord().guid; } catch (_e) {} return { guid: g, title: lineTextOf(li) || '(line item)', kind: 'line' }; });
        entry.items = recItems.concat(lineItems); entry.count = recs.length + lines.length; entry.ready = true; this.dirty = true;
      } catch (_e) { entry.title = '(query error)'; entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateQueries() { if (this._queryCache && this._queryCache.size) { this._queryCache.clear(); this.dirty = true; } }
  _drawQueryNode(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#ffffff'; ctx.fill(); ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#0ea5e9'; ctx.stroke();
    ctx.save(); ctx.clip();
    const pad = 10, tx = x + pad, maxW = w - pad * 2; let ty = y + pad; ctx.textBaseline = 'top';
    const res = this._queryFor(el.query);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = el.strokeColor || '#0ea5e9';
    ctx.fillText(this._clipText(ctx, '⌕ ' + el.query + (res ? '  (' + res.count + ')' : ''), maxW), tx, ty); ty += 20;
    if (!res) { ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9aa0a6'; ctx.fillText('Searching…', tx, ty); ctx.restore(); ctx.restore(); return; }
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#3c4043';
    if (!res.items.length) { ctx.fillStyle = '#9aa0a6'; ctx.fillText('No matches', tx, ty); }
    for (const it of res.items) { if (ty > y + h - 14) break; ctx.fillText(this._clipText(ctx, '• ' + it.title, maxW), tx, ty); ty += 16; }
    ctx.restore(); ctx.restore();
  }
  _insertQueryNode(query, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeQueryNode(this._snap(wx - 140), this._snap(wy - 100), 280, 200, query);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // Phase 9 E10: board-card cache — fetches another drawing record's banner PNG (its live scene preview).
  _boardFor(guid) {
    if (!this._boardCache) this._boardCache = new Map();
    const c = this._boardCache.get(guid); if (c) return c.ready ? c : null;
    const entry = { ready: false, img: null, title: '' }; this._boardCache.set(guid, entry);
    (async () => {
      try {
        const rec = await this.plugin.data.getRecord(guid); if (!rec) { entry.title = '(not found)'; entry.ready = true; this.dirty = true; return; }
        entry.title = (rec.getName && rec.getName()) || 'Drawing';
        let fv = null; try { fv = rec.getBanner && rec.getBanner(); } catch (_e) {}
        if (fv) {
          const blob = await this.plugin.data.getBlobFromPropertyFileValue(fv);
          if (blob) { const ab = await blob.download(); if (ab) { const url = URL.createObjectURL(new Blob([ab], { type: blob.contentType || 'image/png' })); const im = new Image(); im.onload = () => { entry.img = im; entry.ready = true; this.dirty = true; }; im.onerror = () => { entry.ready = true; this.dirty = true; }; im.src = url; return; } }
        }
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateBoard(guid) { if (this._boardCache && this._boardCache.has(guid)) { this._boardCache.delete(guid); this.dirty = true; } }
  // P1.0: draw a frame — clean rounded border + name label above the top-left.
  _drawFrame(ctx, el) {
    const z = this.camera.zoom;
    ctx.save();
    ctx.strokeStyle = el.strokeColor || '#9aa0a6'; ctx.lineWidth = 1.4 / z;
    const r = 6 / z;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(el.x, el.y, el.width, el.height, r); else ctx.rect(el.x, el.y, el.width, el.height); ctx.stroke();
    ctx.font = (12 / z) + 'px system-ui, sans-serif'; ctx.fillStyle = el.strokeColor || '#9aa0a6'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(el.name || 'Frame', el.x + 2 / z, el.y - 4 / z);
    ctx.restore();
  }
  _drawBoardCard(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#0f1117'; ctx.fill(); ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#10b981'; ctx.stroke();
    ctx.save(); ctx.clip();
    const b = this._boardFor(el.recordGuid); const head = 22;
    if (b && b.img) { // cover-fit the preview below the title bar
      try { const aw = w, ah = h - head, ir = b.img.width / b.img.height, br = aw / ah; let dw, dh; if (ir > br) { dh = ah; dw = ah * ir; } else { dw = aw; dh = aw / ir; } ctx.drawImage(b.img, x + (aw - dw) / 2, y + head + (ah - dh) / 2, dw, dh); } catch (_e) {}
    } else { ctx.fillStyle = '#6b7280'; ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(b ? '(no preview yet)' : 'Loading…', x + 10, y + h / 2); }
    // title bar
    ctx.fillStyle = 'rgba(16,185,129,0.16)'; ctx.fillRect(x, y, w, head);
    ctx.fillStyle = '#d1fae5'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('▦ ' + this._clipText(ctx, (b && b.title) || 'Drawing', w - 18), x + 8, y + head / 2);
    ctx.restore(); ctx.restore();
  }
  _insertBoardCard(guid, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeBoardCard(this._snap(wx - 150), this._snap(wy - 110), 300, 220, guid);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // P1.3: Deconstruct / Pizza Slicer — extract the selection (or a frame's contents) into a new standalone
  // Plexus drawing, leaving a live board-card link behind. Turns whiteboards into reusable modular "bricks".
  async _deconstructSelection() {
    let ids = [...this.selected];
    for (const fr of ids.map((id) => this._byId(id)).filter((e) => e && e.type === 'frame')) for (const c of this._frameChildren(fr)) ids.push(c.id);
    ids = [...new Set(ids)];
    const els = ids.map((id) => this._byId(id)).filter(Boolean);
    if (!els.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: select elements (or a frame) to extract.', dismissible: true }); } catch (_e) {} return null; }
    let minx = Infinity, miny = Infinity; for (const e of els) { minx = Math.min(minx, e.x); miny = Math.min(miny, e.y); }
    const dx = 40 - minx, dy = 40 - miny;
    const scene = newScene(true);
    scene.elements = els.map((e) => { const c = JSON.parse(JSON.stringify(e)); c.id = newId(); c.x = (c.x || 0) + dx; c.y = (c.y || 0) + dy; if (c.points) c.points = c.points.map(([px, py]) => [px + dx, py + dy]); return c; });
    for (const e of scene.elements) if (e.type === 'image' && e.fileId && this.scene.files && this.scene.files[e.fileId]) scene.files[e.fileId] = this.scene.files[e.fileId];
    const col = await this.plugin._drawingsCollection(); if (!col) return null;
    let guid = null; try { guid = col.createRecord('Extracted drawing'); } catch (_e) {}
    if (typeof guid !== 'string') { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the drawing.', dismissible: true }); } catch (_e) {} return null; }
    const rec = await getRecordPoll(this.plugin, guid);
    if (rec) await saveScene(this.plugin, rec, scene, new Camera(), { _sceneLine: null });
    for (const e of els) e.isDeleted = true; // remove the originals from this canvas
    this._insertBoardCard(guid, minx + 150, miny + 110); // drop a live board-card link where the bricks were
    try { this.plugin.ui.addToaster({ title: 'Extracted ' + els.length + ' element(s) to a new drawing + linked back.', dismissible: true }); } catch (_e) {}
    return guid;
  }
  // P1.4: Capture Note (visual GTD) — create a new note, drop it as a record card on the canvas, and link it
  // back to this drawing's record. Capture goes into the Captures (or Notes) collection.
  async _captureNote() {
    const title = await this._promptText('Capture a note (becomes a card on the canvas):', '');
    if (!title) return null;
    let col = null;
    try { const cols = await this.plugin.data.getAllCollections(); col = (cols || []).find((c) => /^captures$/i.test(c.getName())) || (cols || []).find((c) => /^notes$/i.test(c.getName())); } catch (_e) {}
    if (!col) { try { this.plugin.ui.addToaster({ title: 'Plexus: no Captures/Notes collection found.', dismissible: true }); } catch (_e) {} return null; }
    let guid = null; try { guid = col.createRecord(title); } catch (_e) {}
    if (typeof guid !== 'string') return null;
    try { const rec = await getRecordPoll(this.plugin, guid); if (rec && this.recordGuid) await rec.createLineItem(null, null, 'ulist', [{ type: 'text', text: '↗ captured from drawing ' }, { type: 'ref', text: { guid: this.recordGuid } }], null); } catch (_e) {} // link back
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const card = makeRecordCard(this._snap(c.x - 150), this._snap(c.y - 70), 300, 140, guid);
    this.scene.elements.push(card); this.selected.clear(); this.selected.add(card.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Captured + placed on the canvas.', dismissible: true }); } catch (_e) {}
    return guid;
  }
  // ── P0.2: MindMap Builder ── interactive tree. Tab = add child, Enter = add sibling; auto horizontal layout.
  _mmMakeNode(text, x, y, rootId, parentId) { const el = makeText(x, y, { stroke: '#1e1e1e', fontSize: 18 }); el.text = text; measureText(el); el.mmRoot = rootId; el.mmParent = parentId || null; return el; }
  _mmNodes(rootId) { return this.scene.elements.filter((e) => !e.isDeleted && e.mmRoot === rootId && e.type === 'text'); }
  _newMindMap() {
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const root = this._mmMakeNode('Central idea', this._snap(c.x), this._snap(c.y), null, null); root.mmRoot = root.id;
    this.scene.elements.push(root); this.selected.clear(); this.selected.add(root.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Mind map: Tab = child, Enter = sibling, double-click to rename.', dismissible: true }); } catch (_e) {}
    return root.id;
  }
  // P1.6 (v1): insert an @@ REFERENCE NODE — a clickable text chip linked to a record (double-click opens it).
  async _insertRef() {
    const q = await this._promptText('Reference a record — search:', '');
    if (!q) return null;
    let rec = null; try { const res = await this.plugin.data.searchByQuery(q, 6); rec = res && res.records && res.records[0]; } catch (_e) {}
    if (!rec) { try { this.plugin.ui.addToaster({ title: 'Plexus: no record matched “' + q + '”.', dismissible: true }); } catch (_e) {} return null; }
    const name = (rec.getName && rec.getName()) || 'record';
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const el = makeText(this._snap(c.x), this._snap(c.y), { fontSize: 16, stroke: '#7c5cff' });
    el.text = '@' + name; el.refGuid = rec.guid; el.isRef = true; measureText(el);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Reference inserted — double-click to open ' + name + '.', dismissible: true }); } catch (_e) {}
    return el.id;
  }
  _mmAddChild(node) {
    const rootId = node.mmRoot; if (!rootId) return null;
    const child = this._mmMakeNode('New idea', node.x + 200, node.y, rootId, node.id); this.scene.elements.push(child);
    const edge = makeLinear(node.x, node.y, 'arrow', { stroke: '#9aa0a6', strokeWidth: 1.5 }); edge.mmRoot = rootId; edge.mmEdge = { from: node.id, to: child.id }; this.scene.elements.push(edge);
    this._mmLayout(rootId); this.selected.clear(); this.selected.add(child.id); this.dirty = true; this.scheduleSave(); return child;
  }
  _mmAddSibling(node) { if (!node.mmParent) return this._mmAddChild(node); const p = this._byId(node.mmParent); return p ? this._mmAddChild(p) : null; }
  _mmLayout(rootId) {
    const root = this._byId(rootId); if (!root) return;
    const nodes = this._mmNodes(rootId), HGAP = 200, VGAP = 64; let leaf = 0; const rowOf = {};
    const place = (id, depth) => { const n = this._byId(id); if (!n) return 0; n._mmDepth = depth; const kids = nodes.filter((e) => e.mmParent === id); if (!kids.length) { rowOf[id] = leaf++; return rowOf[id]; } const rs = kids.map((k) => place(k.id, depth + 1)); rowOf[id] = (rs[0] + rs[rs.length - 1]) / 2; return rowOf[id]; };
    place(rootId, 0);
    const baseX = root.x, baseY = root.y, rootRow = rowOf[rootId] || 0;
    for (const n of nodes) { n.x = baseX + (n._mmDepth || 0) * HGAP; n.y = baseY + ((rowOf[n.id] || 0) - rootRow) * VGAP; measureText(n); }
    for (const ed of this.scene.elements) { if (ed.isDeleted || ed.mmRoot !== rootId || !ed.mmEdge) continue; const a = this._byId(ed.mmEdge.from), b = this._byId(ed.mmEdge.to); if (a && b) { ed.points = [[a.x + a.width + 4, a.y + a.height / 2], [b.x - 4, b.y + b.height / 2]]; linearBBox(ed); } }
  }
  // P0.4/P0.4b: apply a colour to the selection (stroke + tinted fill if the element is filled).
  _applyColorToSelection(color) {
    let ch = false;
    for (const id of this.selected) { const el = this._byId(id); if (!el) continue; el.strokeColor = color; if (el.backgroundColor && el.backgroundColor !== 'transparent') el.backgroundColor = FILLS[color] || tintColor(color); ch = true; }
    if (ch) { this.dirty = true; this.scheduleSave(); this._syncToolbar && this._syncToolbar(); }
    return ch;
  }
  // P0.4 Shade Master + P0.4b Color Scheme Manager — palette extracted from this drawing + named schemes.
  _openColorTool() {
    const used = [...new Set(this.scene.elements.filter((e) => !e.isDeleted && e.strokeColor && e.type !== 'frame').map((e) => e.strokeColor))].slice(0, 24);
    const overlay = document.createElement('div'); overlay.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box pxc-colortool';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'Colours — Shade Master & Schemes'; box.appendChild(title);
    const note = document.createElement('div'); note.className = 'pxc-il-hint'; note.textContent = this.selected.size ? 'Click a colour to apply it to the ' + this.selected.size + ' selected element(s).' : 'Select element(s) first, then click a colour to recolour them.'; box.appendChild(note);
    const swatchRow = (label, colors) => {
      const sec = document.createElement('div'); sec.className = 'pxc-ct-sec'; const h = document.createElement('div'); h.className = 'pxc-ct-h'; h.textContent = label; sec.appendChild(h);
      const row = document.createElement('div'); row.className = 'pxc-ct-row';
      for (const c of colors) { const sw = document.createElement('button'); sw.className = 'pxc-ct-sw'; sw.style.background = c; sw.title = c; sw.addEventListener('click', () => { this._applyColorToSelection(c); }); row.appendChild(sw); }
      sec.appendChild(row); box.appendChild(sec);
    };
    if (used.length) swatchRow('In this drawing', used);
    for (const name in COLOR_SCHEMES) swatchRow(name, COLOR_SCHEMES[name]);
    const close = document.createElement('button'); close.className = 'pxc-settings-close'; close.textContent = 'Done'; close.addEventListener('click', () => overlay.remove()); box.appendChild(close);
    overlay.appendChild(box); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }
  // Phase 10 E5: drag-to-restructure (explicit + safe) — write REAL ref relations between selected cards.
  // The first selected record/board card becomes the source; a ref line item is added to its record for
  // each other selected card. This is the canvas WRITING real ontology, the Brain graph then shows the edge.
  async _linkSelectedCards() {
    const cards = [...this.selected].map((id) => this._byId(id)).filter((el) => el && (el.type === 'record' || el.type === 'board') && el.recordGuid);
    if (cards.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: select 2+ record/board cards (first = source) to link.', dismissible: true }); } catch (_e) {} return 0; }
    const src = cards[0]; let rec = null; try { rec = await this.plugin.data.getRecord(src.recordGuid); } catch (_e) {}
    if (!rec) return 0;
    let n = 0;
    for (const c of cards.slice(1)) { try { const li = await rec.createLineItem(null, null, 'ulist', [{ type: 'text', text: '→ related: ' }, { type: 'ref', text: { guid: c.recordGuid } }], null); if (li) { n++; this._invalidateRec(src.recordGuid); } } catch (_e) {} }
    try { this.plugin.ui.addToaster({ title: 'Linked ' + n + ' relation(s) from this card.', dismissible: true }); } catch (_e) {}
    return n;
  }
  // Phase 10 E3: outline -> canvas — lay a record's line-item tree out as connected text nodes (a mind-map).
  async _outlineToCanvas(guid) {
    const rec = await this.plugin.data.getRecord(guid); if (!rec) return 0;
    const c = this.camera.screenToWorld(80, 80); const ox = c.x, oy = c.y;
    const created = []; const st = { row: 0 };
    const root = makeText(ox, oy, { fontSize: 20, stroke: '#7c5cff' }); root.text = (rec.getName && rec.getName()) || 'Outline'; measureText(root);
    this.scene.elements.push(root); created.push(root); st.row = 1;
    const connect = (a, b) => { const arr = makeLinear(0, 0, 'arrow', { stroke: '#9aa0a6', strokeWidth: 1.5 }); arr.elbowed = true; arr.endArrowhead = null; arr.points = [[a.x, a.y + a.height], [b.x, b.y + b.height / 2]]; linearBBox(arr); this.scene.elements.push(arr); created.push(arr); };
    const walk = async (parentEl, items, depth) => {
      for (const li of (items || [])) {
        if (st.row > 60) return; // cap to keep the scene sane
        const txt = lineTextOf(li); let node = parentEl;
        if (txt) { node = makeText(ox + depth * 44, oy + st.row * 54, { fontSize: 15, stroke: '#1e1e1e' }); node.text = txt; measureText(node); this.scene.elements.push(node); created.push(node); st.row++; connect(parentEl, node); }
        try { const ch = await li.getChildren(); if (ch && ch.length) await walk(node, ch, txt ? depth + 1 : depth); } catch (_e) {}
      }
    };
    try { const top = await rec.getLineItems(); await walk(root, top, 1); } catch (_e) {}
    this.selected = new Set(created.map((e) => e.id)); this.dirty = true; this.scheduleSave(); return created.length;
  }
  // Phase 10 E9: semantic ghost-edges — embed each text/card, draw faint links between similar ones.
  async _semanticTextOf(el) {
    if (el.type === 'text') return el.text || '';
    if (el.type === 'query') return el.query || '';
    if (el.type === 'record' || el.type === 'board') { try { const r = await this.plugin.data.getRecord(el.recordGuid); return (r && r.getName && r.getName()) || ''; } catch (_e) { return ''; } }
    return '';
  }
  async _computeSemantic() {
    const els = this.scene.elements.filter((e) => !e.isDeleted && (e.type === 'text' || e.type === 'record' || e.type === 'board' || e.type === 'query'));
    if (els.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: add 2+ cards / text elements first.', dismissible: true }); } catch (_e) {} return 0; }
    try { this.plugin.ui.addToaster({ title: 'Plexus: embedding locally… (first run downloads a small model)', dismissible: true }); } catch (_e) {}
    const vecs = [];
    for (const el of els) { let v = null; try { v = await this.plugin._embed(await this._semanticTextOf(el)); } catch (_e) {} vecs.push(v); }
    const cos = (a, b) => { if (!a || !b) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }; // vectors are normalised -> dot = cosine
    const edges = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const s = cos(vecs[i], vecs[j]); if (s > 0.45) edges.push({ a: els[i].id, b: els[j].id, sim: s }); }
    this._ghostEdges = edges; this._showGhosts = true; this.dirty = true;
    try { this.plugin.ui.addToaster({ title: edges.length + ' semantic ghost-edge(s) drawn.', dismissible: true }); } catch (_e) {}
    return edges.length;
  }
  _toggleGhosts() { if (this._ghostEdges && this._ghostEdges.length) { this._showGhosts = !this._showGhosts; this.dirty = true; } else this._computeSemantic(); }
  _drawGhosts(ctx) {
    if (!this._showGhosts || !this._ghostEdges || !this._ghostEdges.length) return;
    const z = this.camera.zoom; ctx.save(); ctx.strokeStyle = '#f59e0b'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4 / z; ctx.setLineDash([5 / z, 5 / z]);
    for (const ge of this._ghostEdges) { const a = this._byId(ge.a), b = this._byId(ge.b); if (!a || !b) continue; const ax = a.x + Math.abs(a.width) / 2, ay = a.y + Math.abs(a.height) / 2, bx = b.x + Math.abs(b.width) / 2, by = b.y + Math.abs(b.height) / 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    ctx.setLineDash([]); ctx.restore();
  }
  // P0.0: fetch the OpenAI key from the ENCRYPTED store (unlock once per session; migrate + delete any legacy
  // plaintext copy). The key never persists in plaintext and is wiped from memory on pagehide.
  // P0.0 + P3: per-PROVIDER encrypted key. One passphrase-locked blob holds all providers' keys; prompts only
  // for the provider you use, reusing the session passphrase. Keys never persist in plaintext; wiped on pagehide.
  async _aiKey(provider) {
    provider = provider || (this.plugin._settings && this.plugin._settings.aiProvider) || 'openai';
    const plug = this.plugin;
    if (plug._secrets && plug._secrets[provider]) return plug._secrets[provider];
    let blob = null; try { blob = JSON.parse(localStorage.getItem(PLEXUS_SECRET_LS) || 'null'); } catch (_e) {}
    if (blob && blob.ct && !plug._secrets) {
      const pass = await this._promptText('Passphrase to unlock your saved API keys:', '');
      if (!pass) return null;
      try { plug._secrets = JSON.parse(await pxDecryptSecret(blob, pass)); plug._secretPass = pass; }
      catch (_e) { try { plug.ui.addToaster({ title: 'Plexus: wrong passphrase.', dismissible: true }); } catch (_e2) {} return null; }
      if (plug._secrets[provider]) return plug._secrets[provider];
    }
    // Need a key for this provider — collect it (migrate a legacy plaintext OpenAI key) and (re)encrypt the blob.
    let key = '';
    if (provider === 'openai' && (!blob || !blob.ct)) { try { key = localStorage.getItem('plexus_llm_key') || ''; } catch (_e) {} }
    if (!key) key = await this._promptText(provider + ' API key (encrypted at rest; sent only to ' + provider + '):', '');
    if (!key) return null; key = key.trim();
    let pass = plug._secretPass;
    if (!pass) { pass = await this._promptText('Create a passphrase to encrypt your key(s) (once per session):', ''); if (!pass) return null; plug._secretPass = pass; }
    plug._secrets = Object.assign({}, plug._secrets || {}, { [provider]: key });
    try { localStorage.setItem(PLEXUS_SECRET_LS, JSON.stringify(await pxEncryptSecret(JSON.stringify(plug._secrets), pass))); } catch (_e) {}
    try { localStorage.removeItem('plexus_llm_key'); } catch (_e) {}
    return key;
  }
  // P3: provider-agnostic text completion (OpenAI / xAI / Anthropic / Gemini), direct client→provider call.
  async _aiComplete(system, user) {
    const provider = (this.plugin._settings && this.plugin._settings.aiProvider) || 'openai';
    const key = await this._aiKey(provider); if (!key) return null;
    const model = (this.plugin._settings && this.plugin._settings.aiModel) || '';
    try {
      if (provider === 'openai' || provider === 'xai') {
        const url = provider === 'xai' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        const m = model || (provider === 'xai' ? 'grok-2-latest' : 'gpt-4o-mini');
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: m, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
        const data = await res.json(); return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      }
      if (provider === 'anthropic') {
        const m = model || 'claude-3-5-haiku-latest';
        const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: m, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }) });
        const data = await res.json(); return (data && data.content && data.content[0] && data.content[0].text) || '';
      }
      if (provider === 'gemini') {
        const m = model || 'gemini-2.0-flash';
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }) });
        const data = await res.json(); return (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
      }
    } catch (e) { console.error('[Plexus] ai', e); }
    return null;
  }
  // Phase 10 E6: AI diagramming — prompt -> (consent + encrypted key) -> LLM -> JSON shapes -> elements.
  async _aiDiagram() {
    const what = await this._promptText('Describe the diagram to generate:', 'a 3-step data pipeline: ingest → transform → store');
    if (!what) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: asking the model…', dismissible: true }); } catch (_e) {}
    const SYS = 'Output ONLY a JSON array of canvas shapes, no prose. Each item: {"type":"rectangle|ellipse|diamond|text|arrow","x":<num>,"y":<num>,"w":<num>,"h":<num>,"text":"<label>","color":"#7c5cff"}. Lay nodes left-to-right ~190px apart; connect them with arrow shapes. Origin 0,0.';
    let txt = null; try { txt = await this._aiComplete(SYS, String(what)); } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: AI request failed (' + e + ').', dismissible: true }); } catch (_e) {} return; }
    if (txt == null) return; // no key / cancelled
    txt = String(txt).replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    let arr = null; try { arr = JSON.parse(txt); } catch (_e) { const m = txt.match(/\[[\s\S]*\]/); if (m) { try { arr = JSON.parse(m[0]); } catch (_e2) {} } }
    if (!arr) { try { this.plugin.ui.addToaster({ title: 'Plexus: the model did not return valid JSON.', dismissible: true }); } catch (_e) {} return; }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const els = elementsFromAiJson(arr, c.x - 240, c.y - 120);
    this.selected.clear(); for (const e of els) { this.scene.elements.push(e); this.selected.add(e.id); }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'AI diagram: ' + els.length + ' element(s).', dismissible: true }); } catch (_e) {}
  }
  // P2: CSV → bar chart. Paste/enter `label,value` rows; generates editable bars + labels.
  async _chartFromCsv() {
    const csv = await this._promptText('Paste CSV (label,value per line):', 'Q1,40\nQ2,65\nQ3,30\nQ4,80');
    if (!csv) return;
    const rows = csv.split(/\n/).map((l) => l.split(',')).map((c) => [String(c[0] || '').trim(), parseFloat(c[1])]).filter((r) => r[0] && !isNaN(r[1]));
    if (!rows.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no label,value rows found.', dismissible: true }); } catch (_e) {} return; }
    const max = Math.max(...rows.map((r) => r[1])) || 1, c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const BW = 56, GAP = 18, H = 200, x0 = c.x - (rows.length * (BW + GAP)) / 2, y0 = c.y - H / 2, cols = COLOR_SCHEMES.Plexus, els = [];
    rows.forEach((r, i) => {
      const bh = Math.max(2, (r[1] / max) * H), bx = this._snap(x0 + i * (BW + GAP)), by = y0 + (H - bh), col = cols[i % cols.length];
      const bar = makeRect(bx, by, BW, bh, { type: 'rectangle', stroke: col, fill: tintColor(col), fillStyle: 'solid' }); bar.roughness = 0; els.push(bar);
      const lbl = makeText(bx, y0 + H + 8, { fontSize: 13, stroke: '#1e1e1e' }); lbl.text = r[0]; measureText(lbl); els.push(lbl);
      const val = makeText(bx, by - 20, { fontSize: 12, stroke: col }); val.text = String(r[1]); measureText(val); els.push(val);
    });
    this.selected.clear(); for (const e of els) { this.scene.elements.push(e); this.selected.add(e.id); }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Chart: ' + rows.length + ' bars.', dismissible: true }); } catch (_e) {}
  }
  // Phase 10 E14: re-date a record card's record in place (the in-plugin core of Day-View binding).
  async _scheduleCard() {
    const el = this._singleSel(); if (!el || (el.type !== 'record' && el.type !== 'board')) { try { this.plugin.ui.addToaster({ title: 'Plexus: select a record/board card to schedule.', dismissible: true }); } catch (_e) {} return; }
    const iso = await this._promptText('Schedule date (e.g. 2026-06-20 14:30, “tomorrow”, “monday 3pm”):', 'tomorrow');
    if (!iso) return;
    const r = await this.plugin._setSchedule(el.recordGuid, iso);
    if (r.ok) { this._invalidateRec(el.recordGuid); try { this.plugin.ui.addToaster({ title: 'Re-dated in place.', dismissible: true }); } catch (_e) {} }
    else { try { this.plugin.ui.addToaster({ title: 'Plexus: could not re-date — ' + (r.reason || '') + '.', dismissible: true }); } catch (_e) {} }
  }
  // Reusable in-panel text prompt (window.prompt is dead on desktop, rule 49). Resolves to string|null.
  _promptText(label, def) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'pxc-modal';
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) { e.stopPropagation(); done(null); } });
      const box = document.createElement('div'); box.className = 'pxc-modal-box';
      box.addEventListener('pointerdown', (e) => e.stopPropagation());
      const lab = document.createElement('div'); lab.className = 'pxc-modal-label'; lab.textContent = label;
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'pxc-modal-input'; inp.value = def || '';
      const row = document.createElement('div'); row.className = 'pxc-modal-row';
      const ok = document.createElement('button'); ok.className = 'pxc-prop-btn'; ok.textContent = 'OK';
      const cancel = document.createElement('button'); cancel.className = 'pxc-prop-btn'; cancel.textContent = 'Cancel';
      const done = (val) => { try { ov.remove(); } catch (_e) {} resolve(val); };
      ok.addEventListener('click', () => done(inp.value.trim() || null));
      cancel.addEventListener('click', () => done(null));
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); });
      row.appendChild(ok); row.appendChild(cancel); box.appendChild(lab); box.appendChild(inp); box.appendChild(row); ov.appendChild(box);
      this.wrap.appendChild(ov); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    });
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
      // UX-4: prefer the `Scene` FILE PROPERTY (clean storage); fall back to a body `file` line item.
      let sceneProp = null; try { sceneProp = this.rec.prop('Scene'); } catch (_e) {}
      if (sceneProp) { const loaded = await loadScene(this.rec, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
      if (fresh) {
        const line = await findSceneLine(this.rec);
        if (line) { this._sceneLine = line; const loaded = await loadSceneFromLine(line, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
      }
    }
    const a = this.scene.appState || {};
    this.camera = new Camera(a.scroll ? a.scroll.x : -60, a.scroll ? a.scroll.y : -50, a.zoom || 1);
    const st = this.plugin._settings || {};
    this.camera.zoomMin = st.zoomMin || 0.1; this.camera.zoomMax = st.zoomMax || 30; // S3
    this._committed = JSON.stringify(this.scene);
    this.dirty = true; if (fresh && this.rec) this.saveNow();
    if (!fresh && st.zoomToFitOnOpen) this._fitToScene(); // S3
    if (st.openMode === 'present') setTimeout(() => { if (!this.destroyed) this._enterPresent(); }, 50); // S1
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
    const dark = !!(this.plugin._settings && this.plugin._settings.darkMode); // UX-6: dark mode (canvas + chrome)
    if (this.wrap) this.wrap.classList.toggle('pxc-dark', dark);
    const z = this.camera.zoom, d = this.dpr;
    const sctx = this.staticCv.getContext('2d');
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = dark ? '#0f1117' : ((this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff'); // UX-6 dark mode override (no scene mutation)
    sctx.fillRect(0, 0, this.staticCv.width, this.staticCv.height);
    sctx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    this._drawGrid(sctx);
    for (const el of this.scene.elements) { if (el.isDeleted || el.type !== 'frame') continue; this._drawFrame(sctx, el); } // P1.0: frames render behind everything
    for (const el of this.scene.elements) { if (el.isDeleted || el.id === this.editingId || el.type === 'frame') continue; if (el.type === 'image') this._drawImage(sctx, el); else if (el.type === 'record') this._drawRecordCard(sctx, el); else if (el.type === 'query') this._drawQueryNode(sctx, el); else if (el.type === 'board') this._drawBoardCard(sctx, el); else drawElement(sctx, el); }
    this._drawGhosts(sctx);
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
    if (this._laser && this._laser.length) { // S6: fading laser trail (transient, not saved)
      const st = this.plugin._settings || {}, now = Date.now(), decay = st.laserDecay || 1400;
      this._laser = this._laser.filter((p) => now - p.t < decay);
      if (this._laser.length > 1) {
        ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d); ictx.lineCap = 'round'; ictx.lineJoin = 'round';
        for (let i = 1; i < this._laser.length; i++) { const p0 = this._laser[i - 1], p1 = this._laser[i], age = (now - p1.t) / decay; ictx.globalAlpha = Math.max(0, 1 - age); ictx.strokeStyle = st.laserColor || '#ef4444'; ictx.lineWidth = ((st.laserWidth || 4) * (1 - age * 0.6)) / z; ictx.beginPath(); ictx.moveTo(p0.x, p0.y); ictx.lineTo(p1.x, p1.y); ictx.stroke(); }
        ictx.globalAlpha = 1; ictx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (this._laser.length) this.dirty = true; // keep animating the fade
    }
    if (!this.selected.size) return;
    ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    ictx.strokeStyle = '#7c5cff'; ictx.fillStyle = '#ffffff'; ictx.lineWidth = 1.2 / z;
    const single = this._singleSel();
    if (single && (single.type === 'rectangle' || single.type === 'ellipse' || single.type === 'diamond' || single.type === 'record' || single.type === 'image' || single.type === 'query' || single.type === 'board')) {
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
    this._settings = loadPlexusSettings();
    PLEXUS_DEFAULT_FONT = this._settings.defaultFont || 'system-ui, sans-serif'; // S7
    this._secrets = null; // P0.0: decrypted AI key cache (session only)
    this._onPageHide = () => { this._secrets = null; }; // wipe the decrypted key from memory on unload
    try { window.addEventListener('pagehide', this._onPageHide); } catch (_e) {}
    window.__plexusCanvas = { version: PLEXUS_VERSION, dispose: () => this._teardown() };
    console.log('%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded', 'color:#7c5cff;font-weight:bold');
    this.ui.injectCSS(BASE_CSS);
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));
    this.ui.registerCustomPanelType(GALLERY_PANEL_ID, (panel) => this._mountGallery(panel));
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New Drawing', icon: 'ti-photo', onSelected: () => this._newDrawing() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New hybrid visual note', icon: 'ti-pencil', onSelected: () => this._newHybridNote() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Flip to drawing', icon: 'ti-pencil', onSelected: () => this._flipActiveRecord() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Paste image reference', icon: 'ti-link', onSelected: () => this._pasteImageRef() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle grid', icon: 'ti-layout-grid', onSelected: () => { const v = this._activeView(); if (v) v._toggleGrid(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Export drawing as SVG', icon: 'ti-download', onSelected: () => { const v = this._activeView(); if (v) v._exportSvg(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Export drawing as PNG', icon: 'ti-download', onSelected: () => { const v = this._activeView(); if (v) v._exportPngFile(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Print frames as pages (PDF)', icon: 'ti-printer', onSelected: () => { const v = this._activeView(); if (v) v._printFrames(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Search in drawing', icon: 'ti-search', onSelected: () => { const v = this._activeView(); if (v) v._openSearch(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert record card', icon: 'ti-id', onSelected: () => this._cmdInsertCard() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert query node', icon: 'ti-search', onSelected: () => { const v = this._activeView(); if (v) v._promptText('Query (Thymer search syntax, e.g. @task):', '@task').then((q) => { if (q != null) v._insertQueryNode(q); }); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert board card (embed a drawing)', icon: 'ti-layout-board', onSelected: () => { const v = this._activeView(); if (v && this._lastRecordGuid) v._insertBoardCard(this._lastRecordGuid); else if (v) { try { this.ui.addToaster({ title: 'Plexus: open a drawing/note first, then embed it as a board card.', dismissible: true }); } catch (_e) {} } } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Extract selection to a new drawing (Pizza Slicer)', icon: 'ti-scissors', onSelected: () => { const v = this._activeView(); if (v) v._deconstructSelection(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Capture note (drop a linked card)', icon: 'ti-id', onSelected: () => { const v = this._activeView(); if (v) v._captureNote(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Outline to canvas (mind-map a note)', icon: 'ti-list-tree', onSelected: () => { const v = this._activeView(); const g = this._lastRecordGuid; if (v && g) v._outlineToCanvas(g); else if (v) { try { this.ui.addToaster({ title: 'Plexus: open a note first, then map its outline.', dismissible: true }); } catch (_e) {} } } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Link selected cards (write relations)', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._linkSelectedCards(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle elbow arrow', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._toggleElbow(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Present drawing', icon: 'ti-presentation', onSelected: () => { const v = this._activeView(); if (v) v._enterPresent(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Open Canvas (blank panel)', icon: 'ti-pencil', onSelected: () => this._openPanelFor(null) });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Gallery (all drawings)', icon: 'ti-layout-grid', onSelected: () => this._openGallery() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Icon Library', icon: 'ti-stack', onSelected: () => this._openIconLibrary() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New mind map', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._newMindMap(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Colours (Shade Master / schemes)', icon: 'ti-palette', onSelected: () => { const v = this._activeView(); if (v) v._openColorTool(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Semantic ghost-edges (local embeddings)', icon: 'ti-affiliate', onSelected: () => { const v = this._activeView(); if (v) v._toggleGhosts(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI diagram from prompt', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiDiagram(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Chart from CSV', icon: 'ti-chart-bar', onSelected: () => { const v = this._activeView(); if (v) v._chartFromCsv(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert reference (@@)', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._insertRef(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Schedule card (re-date in place)', icon: 'ti-calendar', onSelected: () => { const v = this._activeView(); if (v) v._scheduleCard(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Settings', icon: 'ti-settings', onSelected: () => this._openSettings() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Flip to note (back to text)', icon: 'ti-arrow-back-up', onSelected: () => { const v = this._activeView(); if (v) v._flipToNote(); } });
    // Phase 9 E1: track the last-focused record (the card-insert target) + keep cards LIVE.
    this._lastRecordGuid = null;
    const trackFocus = (e) => { try { const r = e.panel && e.panel.getActiveRecord && e.panel.getActiveRecord(); if (r && r.guid) this._lastRecordGuid = r.guid; } catch (_e) {} };
    try { this.events.on('panel.focused', trackFocus); this.events.on('panel.navigated', trackFocus); } catch (_e) {}
    const onRecChange = (e) => { const g = e && e.recordGuid; for (const v of this._views) { if (g) { v._invalidateRec(g); v._invalidateBoard(g); } v._invalidateQueries(); } };
    try { for (const ev of ['record.updated', 'lineitem.updated', 'lineitem.created', 'lineitem.deleted', 'lineitem.moved']) this.events.on(ev, onRecChange); } catch (_e) {}
    let raf = 0;
    const tick = () => {
      for (const v of this._views) { if (!v.host || !v.host.isConnected) { v.destroy(); this._views.delete(v); continue; } if (v.dirty) { try { v.render(); } catch (e) { console.error('[Plexus] render', e); } v.dirty = false; } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); reg.add(() => cancelAnimationFrame(raf));
    const onScroll = () => { if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' }); };
    window.addEventListener('scroll', onScroll, { passive: true }); reg.add(() => window.removeEventListener('scroll', onScroll));
    this._installAutomate();
    if (TEST_HOOKS) this._installTestHooks();
  }
  _teardown() { for (const v of this._views) { try { v.destroy(); } catch (_e) {} } this._views.clear(); try { this._reg.dispose(); } catch (_e) {} try { window.removeEventListener('pagehide', this._onPageHide); } catch (_e) {} this._secrets = null; }
  onUnload() { this._teardown(); window.__plexusCanvas = undefined; }
  _activeView() { const p = this.ui.getActivePanel(); const v = [...this._views].find((x) => x.panel === p); return v || [...this._views].pop() || null; }
  // Phase 10 E9: lazy local embedder (transformers.js from CDN, runs in-browser — nothing leaves the device).
  _getEmbedder() {
    if (this._embedderP) return this._embedderP;
    this._embedderP = (async () => {
      const t = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6');
      try { t.env.allowLocalModels = false; } catch (_e) {}
      return await t.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    })();
    return this._embedderP;
  }
  async _embed(text) { const pipe = await this._getEmbedder(); const out = await pipe(String(text || '').slice(0, 400), { pooling: 'mean', normalize: true }); return Array.from(out.data); }
  // Phase 10 E14: re-date in place — set a record's `Scheduled` datetime via the canonical DateTime build.
  async _setSchedule(guid, iso) {
    try {
      const rec = await this.data.getRecord(guid); if (!rec) return { ok: false, reason: 'no record' };
      const p = rec.prop('Scheduled') || rec.prop('Date') || rec.prop('Due'); if (!p) return { ok: false, reason: 'no Scheduled/Date/Due datetime property' };
      let val = null; try { val = DateTime.parseDateTimeString(String(iso)).value(); } catch (e) { return { ok: false, reason: 'DateTime ' + e }; }
      let ok = false; try { ok = p.set(val); } catch (e) { return { ok: false, reason: 'set ' + e }; }
      return { ok: !!ok };
    } catch (e) { return { ok: false, reason: String(e) }; }
  }
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
  // §6 / P0.1: "every note is a hybrid visual note by default" — create a record in Notes (so it stays a
  // queryable NOTE), born flip-ready. Flip back to type its text; draw on the front. No Templater dependency.
  async _newHybridNote() {
    let col = null;
    try { const cols = await this.data.getAllCollections(); col = (cols || []).find((c) => /^notes$/i.test(c.getName())) || (cols || []).find((c) => /^captures$/i.test(c.getName())); } catch (_e) {}
    if (!col) col = await this._drawingsCollection();
    if (!col) { try { this.ui.addToaster({ title: 'Plexus: no Notes collection found.', dismissible: true }); } catch (_e) {} return null; }
    let guid = null; try { guid = col.createRecord('Visual note'); } catch (_e) {}
    if (typeof guid !== 'string') return null;
    await this._openPanelFor(guid, { blank: true });
    try { this.ui.addToaster({ title: 'Hybrid visual note — draw here, or use “Flip to note” to type its text.', dismissible: true }); } catch (_e) {}
    return guid;
  }
  // Flip the ACTIVE note (whatever record the focused editor panel shows) into a drawing.
  // The note's text line items stay its "front"; the scene rides along as a file line item.
  async _flipActiveRecord() {
    const panel = this.ui.getActivePanel();
    let rec = null; try { rec = panel && panel.getActiveRecord ? panel.getActiveRecord() : null; } catch (_e) {}
    if (!rec || !rec.guid) { try { this.ui.addToaster({ title: 'Plexus: open a note first, then flip it to a drawing.', dismissible: true }); } catch (_e) {} return null; }
    let existing = null; try { existing = await findSceneLine(rec); } catch (_e) {}
    await this._openPanelFor(rec.guid, { blank: !existing, inPlace: true });
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
    // UX-2: flip opens IN PLACE — reuse the active panel instead of spawning a side panel.
    if (opts && opts.inPlace && here) { try { here.navigateToCustomType(PANEL_ID); return here; } catch (_e) {} }
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (!panel) { this._pendingQueue.pop(); return null; }
    panel.navigateToCustomType(PANEL_ID); return panel;
  }
  // UX-5/UX-6: lightweight settings modal (banner-preview toggle + dark canvas). Persisted to localStorage.
  // Granular multi-section settings panel (Excalidraw-parity; see SCRIPTS-ROADMAP "Settings" S1–S14).
  _openSettings() {
    const s = this._settings || (this._settings = loadPlexusSettings());
    const apply = (key) => { savePlexusSettings(s); if (key === 'defaultFont') PLEXUS_DEFAULT_FONT = s.defaultFont || 'system-ui, sans-serif'; for (const v of this._views) { v.dirty = true; if (key === 'bannerPreview') { try { v.saveNow(); } catch (_e) {} } if (key === 'zoomMin') v.camera.zoomMin = s.zoomMin; if (key === 'zoomMax') v.camera.zoomMax = s.zoomMax; } };
    const wrap = document.createElement('div'); wrap.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box pxc-settings-wide';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'Plexus Settings'; box.appendChild(title);
    const section = (name, open) => { const d = document.createElement('details'); d.className = 'pxc-set-section'; if (open) d.open = true; const sm = document.createElement('summary'); sm.textContent = name; d.appendChild(sm); box.appendChild(d); return d; };
    const row = (parent, label, hint, control) => { const r = document.createElement('label'); r.className = 'pxc-settings-row'; const sp = document.createElement('span'); const b = document.createElement('b'); b.textContent = label; sp.appendChild(b); if (hint) { sp.appendChild(document.createElement('br')); const sm = document.createElement('small'); sm.textContent = hint; sp.appendChild(sm); } r.appendChild(sp); r.appendChild(control); parent.appendChild(r); };
    const toggle = (p, label, key, hint) => { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!s[key]; cb.addEventListener('change', () => { s[key] = cb.checked; apply(key); }); row(p, label, hint, cb); };
    const color = (p, label, key, hint) => { const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'pxc-set-color'; inp.value = s[key] || '#7c5cff'; inp.addEventListener('input', () => { s[key] = inp.value; apply(key); }); row(p, label, hint, inp); };
    const range = (p, label, key, hint, mn, mx, st2) => { const inp = document.createElement('input'); inp.type = 'range'; inp.className = 'pxc-set-range'; inp.min = mn; inp.max = mx; inp.step = st2 || 1; inp.value = s[key]; inp.addEventListener('input', () => { s[key] = parseFloat(inp.value); apply(key); }); row(p, label, hint, inp); };
    const select = (p, label, key, hint, opts) => { const sel = document.createElement('select'); sel.className = 'pxc-set-sel'; for (const o of opts) { const op = document.createElement('option'); op.value = o.v; op.textContent = o.l; if (s[key] === o.v) op.selected = true; sel.appendChild(op); } sel.addEventListener('change', () => { s[key] = sel.value; apply(key); }); row(p, label, hint, sel); };
    const text = (p, label, key, hint, ph) => { const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'pxc-set-text'; inp.value = s[key] || ''; inp.placeholder = ph || 'default'; inp.addEventListener('change', () => { s[key] = inp.value.trim(); apply(key); }); row(p, label, hint, inp); };
    const action = (p, label, hint, btnLabel, fn) => { const b = document.createElement('button'); b.className = 'pxc-set-btn'; b.textContent = btnLabel; b.addEventListener('click', fn); row(p, label, hint, b); };

    const gen = section('General', true);
    select(gen, 'Default open mode', 'openMode', 'How a drawing opens.', [{ v: 'normal', l: 'Normal' }, { v: 'present', l: 'Present' }]);
    toggle(gen, 'Show drawing preview as the record banner', 'bannerPreview', 'Off keeps the note header clean; the preview PNG still saves.');
    toggle(gen, 'Dark canvas background', 'darkMode', 'Paints the canvas + toolbar dark; shapes keep their colours.');

    const beh = section('Canvas behavior');
    toggle(beh, 'Double-click to create / edit text', 'dblClickText', 'Off disables double-click text editing (handy on touch).');

    const zp = section('Zoom & Pan');
    toggle(zp, 'Mouse wheel zooms', 'wheelZoom', 'On = wheel zooms (Ctrl scrolls). Off = wheel scrolls (Ctrl zooms).');
    toggle(zp, 'Pan with right mouse button', 'panRightMouse', 'Right-drag pans the canvas (Miro-style).');
    toggle(zp, 'Zoom to fit on open', 'zoomToFitOnOpen', 'Frame the whole drawing when it opens.');
    range(zp, 'Min zoom', 'zoomMin', 'Furthest zoom-out.', 0.05, 1, 0.05);
    range(zp, 'Max zoom', 'zoomMax', 'Furthest zoom-in.', 2, 30, 1);

    const grid = section('Grid');
    color(grid, 'Grid colour', 'gridColor', 'Dot colour (when dynamic is off).');
    range(grid, 'Grid opacity (%)', 'gridOpacity', '0–100.', 0, 100, 1);
    toggle(grid, 'Dynamic grid colour', 'gridDynamic', 'Grid follows light/dark instead of the fixed colour.');

    const fonts = section('Fonts');
    select(fonts, 'Default text font', 'defaultFont', 'Applies to new text (and existing text on the system default).', [
      { v: 'system-ui, sans-serif', l: 'System (default)' },
      { v: 'Helvetica, Arial, sans-serif', l: 'Sans (Helvetica)' },
      { v: 'Georgia, "Times New Roman", serif', l: 'Serif (Georgia)' },
      { v: 'ui-monospace, Menlo, Consolas, monospace', l: 'Mono' },
      { v: '"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive', l: 'Handwriting (Comic)' },
      { v: '"Bradley Hand", "Segoe Print", cursive', l: 'Handwriting (Bradley)' },
    ]);

    const ai = section('AI');
    select(ai, 'AI provider', 'aiProvider', 'Used by “AI diagram”. Key is encrypted at rest; calls go direct to the provider.', [{ v: 'openai', l: 'OpenAI' }, { v: 'anthropic', l: 'Anthropic (Claude)' }, { v: 'gemini', l: 'Google Gemini' }, { v: 'xai', l: 'xAI (Grok)' }]);
    text(ai, 'Model override', 'aiModel', 'Optional — blank uses the provider default.', 'default');
    action(ai, 'Stored keys', 'Clear all saved API keys + passphrase from this device.', 'Reset keys', () => { try { localStorage.removeItem('plexus_secret_blob'); localStorage.removeItem('plexus_llm_key'); } catch (_e) {} this._secrets = null; this._secretPass = null; try { this.ui.addToaster({ title: 'Plexus: stored AI keys cleared.', dismissible: true }); } catch (_e) {} });

    const laser = section('Laser pointer');
    color(laser, 'Laser colour', 'laserColor', 'Trail colour for the laser tool (L).');
    range(laser, 'Trail fade (ms)', 'laserDecay', 'How long the trail lingers.', 500, 4000, 100);
    range(laser, 'Trail width', 'laserWidth', 'Stroke width of the trail.', 2, 12, 1);

    const exp = section('Export');
    range(exp, 'PNG export scale', 'pngScale', 'Resolution multiplier for “Export as PNG”.', 1, 5, 0.5);
    range(exp, 'Export padding (px)', 'exportPadding', 'Margin around exported PNG/SVG.', 0, 50, 1);
    toggle(exp, 'Export with background', 'exportBackground', 'Off = transparent PNG.');

    const close = document.createElement('button'); close.className = 'pxc-settings-close'; close.textContent = 'Done';
    close.addEventListener('click', () => wrap.remove()); box.appendChild(close);
    wrap.appendChild(box); wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
  }
  _mountPanel(panel) {
    // Time-windowed pending: consume only a guid queued in the last ~4s, dropping stale entries.
    // A panel RESTORED on reload (no recent open) gets the blank state and never steals a fresh open.
    let recordGuid = null, blank = false;
    while (this._pendingQueue.length) { const e = this._pendingQueue.shift(); if (Date.now() - e.at < 4000) { recordGuid = e.guid; blank = !!e.blank; break; } }
    if (!recordGuid) { panel.setTitle('Plexus'); const host = panel.getElement(); host.innerHTML = ''; host.classList.add('pxc-host'); const r = document.createElement('div'); r.className = 'pxc-root'; r.innerHTML = '<div class="pxc-empty">Plexus Canvas<br><small>run “Plexus: New Drawing”, or “Plexus: Flip to drawing” on a note</small></div>'; host.appendChild(r); return; }
    const view = new CanvasView(this, panel, recordGuid, { blank }); this._views.add(view); view.mount();
  }
  // Phase 9 E13: gallery — a grid of all drawings' banner thumbnails, click to open.
  async _openGallery() {
    const here = this.ui.getActivePanel();
    const panel = await this.ui.createPanel(here ? { afterPanel: here } : undefined);
    if (panel) panel.navigateToCustomType(GALLERY_PANEL_ID);
    return panel;
  }
  async _mountGallery(panel) {
    try { panel.setTitle('Plexus Gallery'); } catch (_e) {}
    const host = panel.getElement(); host.innerHTML = ''; host.classList.add('pxc-host');
    const root = document.createElement('div'); root.className = 'pxc-gallery'; host.appendChild(root);
    const col = await this._drawingsCollection();
    let recs = []; try { recs = (col && (await col.getAllRecords())) || []; } catch (_e) {}
    if (!recs.length) { root.innerHTML = '<div class="pxc-empty">No drawings yet<br><small>run “Plexus: New Drawing”</small></div>'; return { cards: 0 }; }
    let n = 0;
    for (const rec of recs.slice(0, 60)) {
      const guid = rec.guid; const card = document.createElement('div'); card.className = 'pxc-gcard';
      const thumb = document.createElement('div'); thumb.className = 'pxc-gthumb';
      const cap = document.createElement('div'); cap.className = 'pxc-gcap'; cap.textContent = (rec.getName && rec.getName()) || 'Untitled drawing';
      card.appendChild(thumb); card.appendChild(cap); card.addEventListener('click', () => this._openPanelFor(guid)); root.appendChild(card); n++;
      (async () => {
        try { const fv = rec.getBanner && rec.getBanner(); if (fv) { const blob = await this.data.getBlobFromPropertyFileValue(fv); if (blob) { const ab = await blob.download(); if (ab) { const url = URL.createObjectURL(new Blob([ab], { type: blob.contentType || 'image/png' })); thumb.style.backgroundImage = 'url(' + url + ')'; return; } } } thumb.classList.add('pxc-gempty'); } catch (_e) { thumb.classList.add('pxc-gempty'); }
      })();
    }
    return { cards: n };
  }
  // P0.3: Icon Library — a floating palette of records tagged #icon. Click an icon to drop a live board-card
  // reference onto the canvas; Thymer backlinks then track every drawing that uses that icon (Nicole's loop).
  async _openIconLibrary() {
    const v0 = this._activeView();
    if (!v0) { try { this.ui.addToaster({ title: 'Plexus: open a drawing first, then the Icon Library.', dismissible: true }); } catch (_e) {} return; }
    const overlay = document.createElement('div'); overlay.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box pxc-iconlib';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'Icon Library'; box.appendChild(title);
    const hint = document.createElement('div'); hint.className = 'pxc-il-hint'; hint.textContent = 'Records tagged #icon. Click one to drop it on the canvas — it backlinks to the source.'; box.appendChild(hint);
    const grid = document.createElement('div'); grid.className = 'pxc-il-grid'; box.appendChild(grid);
    const close = document.createElement('button'); close.className = 'pxc-settings-close'; close.textContent = 'Done'; close.addEventListener('click', () => overlay.remove()); box.appendChild(close);
    overlay.appendChild(box); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    let recs = [];
    try { const res = await this.data.searchByQuery('#icon', 200); recs = (res && res.records) || []; } catch (_e) {}
    if (!recs.length) { grid.innerHTML = '<div class="pxc-il-empty">No icons yet — tag any record <b>#icon</b> (its drawing/banner becomes a reusable icon).</div>'; return; }
    for (const rec of recs) {
      const guid = rec.guid; const cell = document.createElement('button'); cell.className = 'pxc-il-cell'; cell.title = (rec.getName && rec.getName()) || 'icon';
      const thumb = document.createElement('div'); thumb.className = 'pxc-il-thumb'; const cap = document.createElement('div'); cap.className = 'pxc-il-cap'; cap.textContent = (rec.getName && rec.getName()) || '';
      cell.appendChild(thumb); cell.appendChild(cap);
      cell.addEventListener('click', () => { const view = this._activeView() || v0; if (view) { const c = view.camera.screenToWorld(view.cssW / 2, view.cssH / 2); const card = makeBoardCard(view._snap(c.x - 50), view._snap(c.y - 50), 100, 100, guid); view.scene.elements.push(card); view.selected.clear(); view.selected.add(card.id); view.dirty = true; view.scheduleSave(); } overlay.remove(); });
      grid.appendChild(cell);
      (async () => { try { const fv = rec.getBanner && rec.getBanner(); if (fv) { const blob = await this.data.getBlobFromPropertyFileValue(fv); if (blob) { const ab = await blob.download(); if (ab) { const url = URL.createObjectURL(new Blob([ab], { type: blob.contentType || 'image/png' })); thumb.style.backgroundImage = 'url(' + url + ')'; return; } } } thumb.classList.add('pxc-gempty'); } catch (_e) { thumb.classList.add('pxc-gempty'); } })();
    }
  }
  // P1.1: PlexusAutomate — a native scripting API (no eval) exposed on window.__plexusCanvas.automate.
  // Scripts/power-users build elements with the factories and add them to the active drawing.
  _installAutomate() {
    const plug = this; const v = () => plug._activeView();
    window.__plexusCanvas.automate = {
      version: 1,
      view: v,
      getScene: () => { const x = v(); return x ? x.scene : null; },
      getSelection: () => { const x = v(); return x ? [...x.selected].map((id) => x._byId(id)).filter(Boolean) : []; },
      add: (...els) => { const x = v(); if (!x) return null; const flat = els.flat(); for (const e of flat) x.scene.elements.push(e); x.selected = new Set(flat.map((e) => e.id)); x.dirty = true; x.scheduleSave(); return flat; },
      rect: (x0, y0, w, h, color) => makeRect(x0, y0, w, h, { type: 'rectangle', stroke: color || '#1e1e1e', fill: color ? tintColor(color) : 'transparent', fillStyle: color ? 'solid' : 'hachure' }),
      ellipse: (x0, y0, w, h, color) => makeRect(x0, y0, w, h, { type: 'ellipse', stroke: color || '#1e1e1e' }),
      diamond: (x0, y0, w, h, color) => makeRect(x0, y0, w, h, { type: 'diamond', stroke: color || '#1e1e1e' }),
      text: (x0, y0, str, size) => { const e = makeText(x0, y0, { fontSize: size || 20, stroke: '#1e1e1e' }); e.text = String(str || ''); measureText(e); return e; },
      arrow: (x0, y0, x1, y1, color) => { const e = makeLinear(x0, y0, 'arrow', { stroke: color || '#1e1e1e', strokeWidth: 2 }); e.points = [[x0, y0], [x1, y1]]; linearBBox(e); return e; },
      frame: (x0, y0, w, h, name) => { const f = makeFrame(x0, y0, w, h); if (name) f.name = name; return f; },
      connect: (a, b, color) => { const e = makeLinear(0, 0, 'arrow', { stroke: color || '#9aa0a6', strokeWidth: 1.5 }); e.points = [[a.x + (a.width || 0), a.y + (a.height || 0) / 2], [b.x, b.y + (b.height || 0) / 2]]; linearBBox(e); return e; },
      newMindMap: () => { const x = v(); return x ? x._newMindMap() : null; },
      recolor: (color) => { const x = v(); return x ? x._applyColorToSelection(color) : false; },
      schemes: COLOR_SCHEMES,
      refresh: () => { const x = v(); if (x) x.dirty = true; },
    };
  }
  _installTestHooks() {
    window.__plexusCanvas.test = {
      newDrawing: () => this._newDrawing(),
      // P1.0: a frame owns the elements whose centre is inside it (move-together unit).
      frameTest: () => {
        const v = this._activeView(); if (!v) return { ok: false, reason: 'no view' };
        const fr = makeFrame(0, 0, 300, 200), inside = makeRect(50, 50, 40, 40, { type: 'rectangle' }), outside = makeRect(900, 900, 40, 40, { type: 'rectangle' });
        v.scene.elements.unshift(fr); v.scene.elements.push(inside, outside);
        const kids = v._frameChildren(fr).map((e) => e.id); v.dirty = true;
        return { ok: kids.includes(inside.id) && !kids.includes(outside.id), childrenCount: kids.length };
      },
      // P0.0: verify the encrypted-secret round-trip (right passphrase decrypts; wrong one throws — GCM tag).
      cryptoTest: async () => {
        const blob = await pxEncryptSecret(JSON.stringify({ openai: 'sk-test-123' }), 'hunter2');
        const ok = JSON.parse(await pxDecryptSecret(blob, 'hunter2')).openai === 'sk-test-123';
        let wrongRejected = false; try { await pxDecryptSecret(blob, 'wrong'); } catch (_e) { wrongRejected = true; }
        return { hasCiphertext: !!blob.ct, isEncrypted: blob.ct !== 'sk-test-123', roundTrip: ok, wrongPassRejected: wrongRejected, plaintextKeyGone: !localStorage.getItem('plexus_llm_key'), ok: ok && wrongRejected };
      },
      // Phase 10 E9 (view-independent): verify the local embedder loads + ranks similar text higher.
      embedTest: async () => {
        try {
          const a = await this._embed('cat dog pet animal companion');
          const b = await this._embed('puppy kitten pets furry friend');
          const c = await this._embed('quarterly budget finance revenue spreadsheet');
          const cos = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s; };
          const petSim = cos(a, b), petFinSim = cos(a, c);
          return { dim: a.length, modelLoaded: !!this._embedderP, petSim: +petSim.toFixed(3), petFinSim: +petFinSim.toFixed(3), ok: petSim > petFinSim };
        } catch (e) { return { error: String(e) }; }
      },
      // Phase 10 E6 (view-independent): the LLM-JSON -> elements parser (the live LLM call needs the user's key).
      aiParseTest: () => {
        const sample = [{ type: 'rectangle', x: 0, y: 0, w: 120, h: 60, text: 'Ingest', color: '#7c5cff' }, { type: 'ellipse', x: 190, y: 0, w: 90, h: 90, text: 'Transform' }, { type: 'arrow', x: 120, y: 30, w: 70, h: 15 }, { type: 'text', x: 0, y: 130, text: 'pipeline' }];
        const els = elementsFromAiJson(sample, 0, 0); const types = els.map((e) => e.type);
        return { count: els.length, types, ok: els.length === 6 && types.includes('rectangle') && types.includes('ellipse') && types.includes('arrow') && types.filter((t) => t === 'text').length === 3 };
      },
      // Phase 10 E14: re-date in place — create an Event, set its Scheduled datetime, return for MCP verify.
      scheduleTest: async () => {
        const cols = await this.data.getAllCollections(); const events = (cols || []).find((c) => c.getName && c.getName() === 'Events'); if (!events) return { error: 'no Events collection' };
        let g = null; try { g = events.createRecord('E14 schedule test'); } catch (e) { return { error: 'create ' + e }; }
        if (typeof g !== 'string') return { error: 'guid not string' };
        await getRecordPoll(this, g);
        const set = await this._setSchedule(g, '2026-06-20 14:30');
        return { guid: g, set };
      },
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
      // Phase 9 E2 query node: insert a node for '@task', confirm searchByQuery returns records,
      // then invalidate (record-event simulation) and confirm it re-runs.
      queryNodeTest: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const el = v._insertQueryNode('@task', 100, 100);
        let res = null; for (let i = 0; i < 40; i++) { await sleep(150); res = v._queryCache && v._queryCache.get('@task'); if (res && res.ready) break; }
        v._invalidateQueries();
        let res2 = null; for (let i = 0; i < 40; i++) { await sleep(150); res2 = v._queryCache && v._queryCache.get('@task'); if (res2 && res2.ready) break; }
        return { nodeId: el ? el.id : null, type: el ? el.type : null, count: res ? res.count : -1, items: res ? res.items.length : -1, ready: !!(res && res.ready), liveReran: !!(res2 && res2.ready) };
      },
      // Phase 8 elbow arrow: toggling .elbowed expands a 2-point arrow to a 4-point orthogonal path.
      elbowTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const arr = makeLinear(0, 0, 'arrow', { stroke: '#7c5cff', strokeWidth: 2 }); arr.points = [[0, 0], [200, 80]]; v.scene.elements.push(arr);
        v.selected = new Set([arr.id]); const straight = routedPoints(arr).length; v._toggleElbow(); const elbow = routedPoints(arr).length;
        return { straight, elbow, on: !!arr.elbowed, ok: straight === 2 && elbow === 4 && !!arr.elbowed };
      },
      // Phase 8 presentation mode: enter hides chrome (.pxc-present) + fits; Esc/exit restores.
      presentTest: () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        if (!v.scene.elements.filter((e) => !e.isDeleted).length) v.scene.elements.push(makeRect(0, 0, 100, 80, { stroke: '#7c5cff' }));
        v._enterPresent(); const inPresent = !!v._present && v.wrap.classList.contains('pxc-present');
        v._exitPresent(); const exited = !v._present && !v.wrap.classList.contains('pxc-present');
        return { inPresent, exited, ok: inPresent && exited };
      },
      // Phase 8 SVG import: round-trip — export a 3-element scene to SVG, re-import, confirm 3 elements back.
      svgImportTest: () => {
        const tmp = newScene(true);
        tmp.elements.push(makeRect(0, 0, 100, 80, { stroke: '#7c5cff', fill: '#efeaff', fillStyle: 'solid' }));
        tmp.elements.push(makeRect(120, 0, 60, 60, { type: 'ellipse', stroke: '#10b981' }));
        const t = makeText(0, 120, { fontSize: 20 }); t.text = 'hello'; measureText(t); tmp.elements.push(t);
        const svg = exportSvg(tmp); const imp = importSvg(svg, 0, 0);
        return { exportedLen: svg.length, importedCount: imp.length, types: imp.map((e) => e.type), ok: imp.length === 3 };
      },
      // Phase 9 E10 board card: a drawing's banner PNG is fetched + embedded; verify title + image load.
      boardCardTest: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        v.scene.elements.push(makeRect(300, 300, 120, 80, { stroke: '#10b981', fill: FILLS['#10b981'] }));
        v.dirty = true; await v.saveNow(); await sleep(1200); // saveScene sets the record banner
        const el = v._insertBoardCard(v.recordGuid, 700, 300);
        let b = null; for (let i = 0; i < 50; i++) { await sleep(150); b = v._boardCache && v._boardCache.get(v.recordGuid); if (b && b.ready) break; }
        return { cardId: el ? el.id : null, type: el ? el.type : null, ready: !!(b && b.ready), title: b ? b.title : null, hasImg: !!(b && b.img) };
      },
      // Phase 10 E3 outline->canvas: map a real record's outline into connected text nodes; expect nodes.
      outlineTest: async (guid) => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const before = v.scene.elements.filter((e) => !e.isDeleted).length;
        const count = await v._outlineToCanvas(guid);
        const texts = v.scene.elements.filter((e) => !e.isDeleted && e.type === 'text').length;
        const arrows = v.scene.elements.filter((e) => !e.isDeleted && e.type === 'arrow').length;
        return { created: count, textNodes: texts, arrows, ok: count > 1 && texts > 1 && arrows > 0 };
      },
      // Phase 10 E5 link-cards: create 2 throwaway records, card them, link, return guids for MCP verify.
      linkCardsTest: async () => {
        const col = await this._drawingsCollection(); if (!col) return { error: 'no col' };
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        let g1 = null, g2 = null; try { g1 = col.createRecord('E5 link src'); g2 = col.createRecord('E5 link tgt'); } catch (e) { return { error: 'create ' + e }; }
        if (typeof g1 !== 'string' || typeof g2 !== 'string') return { error: 'guids not strings' };
        await getRecordPoll(this, g1); await getRecordPoll(this, g2);
        const c1 = v._insertRecordCard(g1, 0, 0), c2 = v._insertRecordCard(g2, 320, 0);
        v.selected = new Set([c1.id, c2.id]);
        const n = await v._linkSelectedCards();
        return { src: g1, tgt: g2, linked: n, ok: n === 1 };
      },
      // Phase 9 E13 gallery: create a drawing with a banner, confirm getAllRecords + banner fetch (gallery data path).
      galleryTest: async () => {
        const col = await this._drawingsCollection(); if (!col) return { error: 'no col' };
        let g = null; try { g = col.createRecord('Gallery test'); } catch (e) { return { error: 'create ' + e }; }
        if (typeof g !== 'string') return { error: 'guid' };
        const rec = await getRecordPoll(this, g); if (!rec) return { error: 'no rec' };
        const scene = newScene(); scene.elements.push(makeRect(10, 10, 80, 60, { stroke: '#10b981', fill: FILLS['#10b981'] }));
        await saveScene(this, rec, scene, new Camera(), { _sceneLine: null }); await sleep(900);
        const recs = (await col.getAllRecords()) || []; let bannerOk = false;
        for (const r of recs) { if (r.guid === g) { try { const fv = r.getBanner && r.getBanner(); if (fv) { const blob = await this.data.getBlobFromPropertyFileValue(fv); if (blob) bannerOk = true; } } catch (_e) {} } }
        return { drawings: recs.length, testGuid: g, bannerFetchOk: bannerOk, ok: recs.length >= 1 && bannerOk };
      },
      // Phase 10 E9 semantic ghost-edges: 2 pet-themed texts + 1 finance text -> the pet pair links, not finance.
      semanticTest: async () => {
        const v = [...this._views].pop(); if (!v) return { error: 'no view' };
        const mk = (y, txt) => { const t = makeText(0, y, { fontSize: 16 }); t.text = txt; measureText(t); v.scene.elements.push(t); return t; };
        const a = mk(0, 'cat dog pet animal companion'); const b = mk(120, 'puppy kitten pets furry friend'); const c = mk(240, 'quarterly budget finance revenue spreadsheet');
        const n = await v._computeSemantic(); const edges = v._ghostEdges || [];
        const pair = (x, y) => edges.find((e) => (e.a === x.id && e.b === y.id) || (e.a === y.id && e.b === x.id));
        const pet = pair(a, b); const petFin = pair(a, c) || pair(b, c);
        return { ghostCount: n, modelLoaded: !!v.plugin._embedderP, petLinked: !!pet, petSim: pet ? +pet.sim.toFixed(3) : null, petFinSim: petFin ? +petFin.sim.toFixed(3) : 0, ok: !!pet && (!petFin || pet.sim > petFin.sim) };
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
/* UX-1: Thymer sets an INLINE empty-message box on the custom-panel host (padding:20px; margin-top:20px;
   display:flex; align-items:center; min-height:100%) — only !important beats an inline style. Neutralize it so
   the canvas fills the panel flush and the toolbar never drifts on scroll. */
.pxc-host { position: relative; display: block !important; padding: 40px 0 0 0 !important; margin: 0 !important; min-height: 0 !important; }
/* Full-bleed: neutralize Thymer's reading-width wrapper so the canvas fills the WHOLE panel (rule 2; self-cleaning
   via :has — reverts to reading width for normal records when no canvas is mounted). */
.layout-margin:has(.pxc-host) { margin-left: 0 !important; margin-right: 0 !important; width: auto !important; max-width: none !important; }
.pxc-host .pxc-root { position: relative; width: 100%; overflow: hidden; background: var(--color-bg-900); color: var(--color-text-400); font-family: var(--font-family, system-ui, sans-serif); }
.pxc-host .pxc-root .pxc-layer { position: absolute; inset: 0; display: block; }
.pxc-host .pxc-root .pxc-static { z-index: 1; }
.pxc-host .pxc-root .pxc-interactive { z-index: 2; touch-action: none; cursor: crosshair; outline: none; }
.pxc-host .pxc-root .pxc-interactive:focus { outline: none; }
.pxc-host .pxc-root.pxc-panning .pxc-interactive { cursor: grabbing; }
.pxc-host .pxc-root .pxc-toolbar { position: absolute; left: 8px; right: 8px; top: 10px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; padding: 5px 7px; width: auto; max-width: calc(100% - 16px); margin: 0 auto; box-sizing: border-box; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.12); }
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
.pxc-host .pxc-root .pxc-modal { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.28); }
.pxc-host .pxc-root .pxc-modal-box { background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 12px; padding: 16px; min-width: 320px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
.pxc-host .pxc-root .pxc-modal-label { font-size: 13px; color: var(--color-text-400); margin-bottom: 8px; }
.pxc-host .pxc-root .pxc-modal-input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid var(--cards-border-color); border-radius: 7px; background: var(--input-bg-color, var(--color-bg-900)); color: var(--color-text-400); font-size: 14px; outline: none; }
.pxc-settings-overlay { position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.32); }
.pxc-settings-box { min-width: 340px; max-width: 440px; padding: 18px 20px; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 12px; box-shadow: 0 12px 36px rgba(0,0,0,.3); color: var(--color-text-400); font-family: var(--font-family, system-ui, sans-serif); }
.pxc-settings-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: var(--color-text-100); }
.pxc-settings-row { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; cursor: pointer; font-size: 13px; line-height: 1.4; }
.pxc-settings-row input { margin-top: 2px; accent-color: var(--button-primary-bg-color, #7c5cff); }
.pxc-settings-row small { color: var(--color-text-600); }
.pxc-settings-close { margin-top: 14px; padding: 7px 16px; border: 0; border-radius: 8px; background: var(--button-primary-bg-color, #7c5cff); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }
/* Granular settings panel (S1–S14): collapsible sections + control types. */
.pxc-settings-wide { min-width: 430px; max-width: 480px; max-height: 82vh; overflow-y: auto; }
.pxc-settings-wide .pxc-settings-row { justify-content: space-between; align-items: center; gap: 14px; }
.pxc-settings-wide .pxc-settings-row > span { flex: 1; }
.pxc-set-section { border-top: 1px solid var(--cards-border-color); }
.pxc-set-section > summary { cursor: pointer; font-weight: 700; font-size: 12px; letter-spacing: .02em; text-transform: uppercase; padding: 10px 0 6px; list-style: none; color: var(--color-text-600); }
.pxc-set-section > summary::-webkit-details-marker { display: none; }
.pxc-set-section > summary::before { content: '▸ '; opacity: .6; }
.pxc-set-section[open] > summary::before { content: '▾ '; }
.pxc-set-section[open] > summary { color: var(--button-primary-bg-color, #7c5cff); }
.pxc-set-color { width: 38px; height: 24px; border: 1px solid var(--cards-border-color); border-radius: 6px; background: none; cursor: pointer; padding: 0; }
.pxc-set-range { width: 130px; accent-color: var(--button-primary-bg-color, #7c5cff); }
.pxc-set-sel { padding: 4px 8px; border: 1px solid var(--cards-border-color); border-radius: 6px; background: var(--input-bg-color, var(--color-bg-900)); color: var(--color-text-400); font-size: 12px; cursor: pointer; }
.pxc-set-text { width: 150px; padding: 4px 8px; border: 1px solid var(--cards-border-color); border-radius: 6px; background: var(--input-bg-color, var(--color-bg-900)); color: var(--color-text-400); font-size: 12px; }
.pxc-set-btn { padding: 4px 10px; border: 1px solid var(--cards-border-color); border-radius: 6px; background: var(--button-bg-color, transparent); color: var(--color-text-400); font-size: 12px; cursor: pointer; }
.pxc-set-btn:hover { background: var(--sidebar-bg-hover); }
/* P0.3: Icon Library palette */
.pxc-iconlib { min-width: 460px; max-width: 540px; }
.pxc-il-hint { font-size: 12px; color: var(--color-text-600); margin-bottom: 10px; }
.pxc-il-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; max-height: 52vh; overflow-y: auto; }
.pxc-il-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 1px solid var(--cards-border-color); border-radius: 8px; background: var(--cards-bg); color: var(--color-text-400); cursor: pointer; }
.pxc-il-cell:hover { border-color: var(--button-primary-bg-color, #7c5cff); }
.pxc-il-thumb { width: 56px; height: 56px; background-size: contain; background-position: center; background-repeat: no-repeat; border-radius: 6px; }
.pxc-il-thumb.pxc-gempty { background: var(--sidebar-bg-hover); }
.pxc-il-cap { font-size: 10px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 76px; }
.pxc-il-empty { color: var(--color-text-600); font-size: 13px; padding: 16px 4px; grid-column: 1 / -1; }
/* P0.4/P0.4b: Colour tool */
.pxc-colortool { min-width: 360px; max-width: 420px; }
.pxc-ct-sec { margin-bottom: 10px; }
.pxc-ct-h { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--color-text-600); margin: 4px 0; }
.pxc-ct-row { display: flex; flex-wrap: wrap; gap: 6px; }
.pxc-ct-sw { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--cards-border-color); cursor: pointer; padding: 0; }
.pxc-ct-sw:hover { transform: scale(1.12); }
.pxc-host .pxc-root .pxc-modal-row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.pxc-host .pxc-root.pxc-present .pxc-toolbar, .pxc-host .pxc-root.pxc-present .pxc-props, .pxc-host .pxc-root.pxc-present .pxc-hint, .pxc-host .pxc-root.pxc-present .pxc-search { display: none !important; }
.pxc-host .pxc-root.pxc-present .pxc-interactive { cursor: default; }
.pxc-host .pxc-root .pxc-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.pxc-host .pxc-root .pxc-swatch.active { box-shadow: 0 0 0 2px var(--cards-bg), 0 0 0 3px var(--color-text-400); }
.pxc-host .pxc-root .pxc-textedit { position: absolute; z-index: 4; margin: 0; padding: 0; border: 0; outline: none; background: transparent; resize: none; overflow: hidden; white-space: pre; line-height: 1.25; min-height: 1em; font-family: system-ui, sans-serif; box-shadow: 0 0 0 1px var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-hint { position: absolute; left: 10px; bottom: 8px; z-index: 3; pointer-events: none; font-size: 11px; opacity: .42; color: var(--color-text-400); }
/* UX-6: dark-mode chrome — toolbar/props/search go dark to match the dark canvas (theme tokens would stay light). */
.pxc-host .pxc-root.pxc-dark .pxc-toolbar, .pxc-host .pxc-root.pxc-dark .pxc-props, .pxc-host .pxc-root.pxc-dark .pxc-search { background: #1c1f26; border-color: #2e323b; box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.pxc-host .pxc-root.pxc-dark .pxc-tool, .pxc-host .pxc-root.pxc-dark .pxc-prop-btn, .pxc-host .pxc-root.pxc-dark .pxc-search-input, .pxc-host .pxc-root.pxc-dark .pxc-flipnote { color: #e6e7ea; }
.pxc-host .pxc-root.pxc-dark .pxc-tool:hover, .pxc-host .pxc-root.pxc-dark .pxc-prop-btn:hover, .pxc-host .pxc-root.pxc-dark .pxc-flipnote:hover { background: #2a2e38; }
.pxc-host .pxc-root.pxc-dark .pxc-sep, .pxc-host .pxc-root.pxc-dark .pxc-prop-sep { background: #2e323b; }
.pxc-host .pxc-root.pxc-dark .pxc-prop-label, .pxc-host .pxc-root.pxc-dark .pxc-search-count, .pxc-host .pxc-root.pxc-dark .pxc-hint { color: #9aa0a6; }
.pxc-host .pxc-empty { min-height: calc(100vh - 140px); display: flex; align-items: center; justify-content: center; text-align: center; opacity: .65; font-size: 14px; line-height: 1.6; }
.pxc-host .pxc-empty small { opacity: .7; }
.pxc-host .pxc-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; padding: 16px; align-content: start; min-height: calc(100vh - 140px); }
.pxc-host .pxc-gcard { cursor: pointer; border: 1px solid var(--cards-border-color); border-radius: 10px; overflow: hidden; background: var(--cards-bg); transition: transform .08s, box-shadow .08s; }
.pxc-host .pxc-gcard:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.14); }
.pxc-host .pxc-gthumb { height: 118px; background-color: #f4f4f6; background-position: center; background-size: cover; background-repeat: no-repeat; }
.pxc-host .pxc-gthumb.pxc-gempty { background-image: repeating-linear-gradient(45deg, #ececf0, #ececf0 8px, #f6f6f9 8px, #f6f6f9 16px); }
.pxc-host .pxc-gcap { padding: 7px 9px; font-size: 12px; color: var(--color-text-400); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
