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

const PLEXUS_VERSION = '1.86.0';
// Indent-Rainbow parity (Svyk fork v1.9.2 `rainbow` palette) — used to draw record-style marker dots + indent guides on
// transcluded outline rows so a canvas transclusion matches how the flow plugin renders the same content on a record.
const PXC_RAINBOW = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'];
const PANEL_ID = 'plexus-canvas';
const GALLERY_PANEL_ID = 'plexus-gallery';
const DRAWINGS_COLLECTION = 'Plexus Drawings';
const SCENE_SCHEMA = 1;
const SCENE_FILENAME = 'plexus-scene.json'; // sentinel: the file line item that carries a record's scene
// SCALE Phase 2: image-asset anchoring is SHARDED across these many-file properties on the backing drawing. This is a
// WRITE-side concern only — reads resolve a blob by its global guid (getBlobFromPropertyFileValue), shard-agnostic. A soft
// cap per shard bounds each addValue's array size (so per-insert cost stays ~constant even if addValue is O(array)); the
// router fills shards in order and degrades gracefully to the last shard. Per-drawing distribution makes this effectively
// unlimited; add more `Assets N` properties (and extend the list) if a single drawing ever needs more.
const PXC_ASSET_SHARDS = ['Assets', 'Assets 2', 'Assets 3', 'Assets 4'];
const PXC_ASSET_SHARD_CAP = 500;
const PLEXUS_SETTINGS_KEY = 'plexus_settings';
const PLEXUS_SETTINGS_DEFAULTS = {
  // S1 General
  bannerPreview: true, darkMode: false, openMode: 'normal', invertImagesDark: true,
  // S2 Canvas behavior
  dblClickText: true,
  // S4 Pen / stylus
  defaultPenMode: 'mobile', penSingleFingerPan: true, penDoubleTapEraser: true, penCrosshair: false,
  // S10 Interaction
  longPressMs: 500, linkOpacity: 100, openInNewPanel: true,
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
  // S9/S14 Advanced
  pdfScale: 2, cullMargin: 80, allowImageCache: true, imageCacheMax: 120,
  // SCALE Phase 1: insert-time transcode + externalized blob assets (see SCALE-ARCHITECTURE.md).
  // Lean defaults — cap the longest edge + recompress to WebP so images never bloat the scene.
  imageMaxDim: 1600, imageQuality: 0.8, imageInlineThreshold: 65536,
};
// S10: module-level mirror of settings.linkOpacity (0..1) for free-function renderers (drawText has no `this`).
let PLEXUS_LINK_ALPHA = 1;
function _pxcLinkAlpha() { return PLEXUS_LINK_ALPHA; }
function loadPlexusSettings() { try { return Object.assign({}, PLEXUS_SETTINGS_DEFAULTS, JSON.parse(localStorage.getItem(PLEXUS_SETTINGS_KEY) || '{}')); } catch (_e) { return Object.assign({}, PLEXUS_SETTINGS_DEFAULTS); } }
function savePlexusSettings(s) { try { localStorage.setItem(PLEXUS_SETTINGS_KEY, JSON.stringify(s)); } catch (_e) {} }
// IO-3: ONE shared ontology read by all three Plexus plugins (Canvas/Brain/Templater) so they agree on
// collection names + relation tags. Default ⊕ localStorage['plexus_ontology'] override, hoisted to
// window.__plexusOntology (first loader wins — like the shared embedder). Editable-record layer is a follow-up.
const PLEXUS_ONTOLOGY_DEFAULT = {
  entityCollections: ['Projects', 'People', 'Books', 'Notes', 'Captures', 'Icons', 'Plexus Drawings'],
  journalCollection: 'Journal', drawingsCollection: 'Plexus Drawings', iconsCollection: 'Icons',
  templatesCollection: 'Templates', capturesCollection: 'Captures',
  relationTags: { captured: 'captured', project: 'project', icon: 'icon' },
  relationBuckets: { // BP-2/BP-3: field-label → relation category (priority order; consumed by Plexus Brain)
    parents: ['parent', 'parents', 'up', 'source', 'origin', 'part of', 'belongs to'],
    children: ['child', 'children', 'down', 'subtask', 'subtasks', 'contains'],
    leftFriends: ['friend', 'friends', 'related', 'similar', 'supports', 'see also', 'attendees', 'people'],
    rightFriends: ['opposes', 'blocks', 'blocked by', 'conflicts with'],
    previous: ['previous', 'prev', 'after'], next: ['next', 'before', 'leads to'],
  },
};
function loadPlexusOntology() {
  try { if (typeof window !== 'undefined' && window.__plexusOntology) return window.__plexusOntology; } catch (_e) {}
  let o; try { o = JSON.parse(JSON.stringify(PLEXUS_ONTOLOGY_DEFAULT)); } catch (_e) { o = PLEXUS_ONTOLOGY_DEFAULT; }
  try { const ov = JSON.parse(localStorage.getItem('plexus_ontology') || '{}'); o = Object.assign(o, ov); } catch (_e) {}
  try { if (typeof window !== 'undefined') window.__plexusOntology = o; } catch (_e) {}
  return o;
}
function hexToRgba(hex, a) { const h = (hex || '#7c5cff').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return 'rgba(' + (r || 124) + ',' + (g || 92) + ',' + (b || 255) + ',' + a + ')'; }
// CS-8: ENUM_COLORS index → hex (per the SDK EnumColors table) + a record skin from its OWN typed properties —
// Status choice → border colour, Priority → 1.4×/0.9× scale, Due-past → urgency ring. "CSS for the graph", live.
const ENUM_COLOR_HEX = ['#ef4444', '#f97316', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#d946ef', '#f43f5e', '#78716c', '#14b8a6', '#0ea5e9', '#6366f1', '#71717a', '#eab308'];
function recordSkin(rec) {
  const skin = { color: null, scale: 1, urgent: false };
  if (!rec || !rec.prop) return skin;
  try { const sp = rec.prop('Status') || rec.prop('State'); if (sp && sp.choice) { const sel = sp.choice(); const opts = (sp.choices && sp.choices()) || []; const opt = (opts || []).find((o) => o && o.id === sel); if (opt && opt.color != null && ENUM_COLOR_HEX[+opt.color]) skin.color = ENUM_COLOR_HEX[+opt.color]; } } catch (_e) {}
  try { const pp = rec.prop('Priority'); if (pp) { const L = String((pp.choiceLabel && pp.choiceLabel()) || (pp.text && pp.text()) || '').toLowerCase(); if (/high|urgent|critical|\bp0\b|\bp1\b/.test(L)) skin.scale = 1.4; else if (/low|\bp3\b|\bp4\b/.test(L)) skin.scale = 0.9; } } catch (_e) {}
  try { const dp = rec.prop('Due') || rec.prop('Due Date') || rec.prop('Deadline'); if (dp && dp.date) { const d = dp.date(); if (d && d.getTime() < Date.now()) skin.urgent = true; } } catch (_e) {}
  return skin;
}
// CP-7/C-CF10: persist recently-used colours across drawings (a shared palette that new drawings inherit).
function pushRecentColor(c) { try { let r = JSON.parse(localStorage.getItem('plexus_recent_colors') || '[]'); r = [c].concat(r.filter((x) => x !== c)).slice(0, 12); localStorage.setItem('plexus_recent_colors', JSON.stringify(r)); } catch (_e) {} }
function recentColors() { try { return JSON.parse(localStorage.getItem('plexus_recent_colors') || '[]'); } catch (_e) { return []; } }
// P0.4/P0.4b: light fill tint for a stroke colour + named colour schemes (Shade Master / Color Scheme Manager).
function tintColor(hex) { const h = (hex || '#7c5cff').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const r = parseInt(n.slice(0, 2), 16) || 124, g = parseInt(n.slice(2, 4), 16) || 92, b = parseInt(n.slice(4, 6), 16) || 255; const mix = (c) => Math.round(c + (255 - c) * 0.78); return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join(''); }
// UX-6 dark mode: perceived luminance (0..1) of a CSS colour (#rgb/#rrggbb/rgb()). null if unparseable.
function _cssLum(css) {
  if (!css) return null; css = String(css).trim(); let r, g, b;
  let m = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join(''); r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
  else { m = css.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i); if (m) { r = +m[1]; g = +m[2]; b = +m[3]; } else return null; }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
// UX-6 dark mode: when PXC_DARK, lighten an INK colour (stroke/text/icon) that's too dark to read on a dark canvas.
// Only touches near-dark inks (L<0.4) — vivid colours and white pass through unchanged, so it adapts, not inverts.
// (Excalidraw/zsviczian-style luminance-aware ink; refine the curve once the NotebookLM research lands.)
// A2: detect an in-progress `@` (record) / `@@` (line) reference at the caret in a text element being edited.
// Requires the `@` to sit at start-of-text or after whitespace (so "email@x" does NOT trigger). Returns
// {mode:'record'|'line', query, triggerStart} (triggerStart = index of the first '@') or null.
function pxcParseRefTrigger(text, caret) {
  const upto = String(text == null ? '' : text).slice(0, Math.max(0, caret | 0));
  const m = upto.match(/(?:^|\s)(@@?)([^\s@]{0,40})$/);
  if (!m) return null;
  return { mode: m[1] === '@@' ? 'line' : 'record', query: m[2], triggerStart: caret - m[1].length - m[2].length };
}
let PXC_DARK = false;
function adaptInk(hex, dark) {
  const d = dark == null ? PXC_DARK : dark;
  if (!d || !hex || hex === 'transparent') return hex;
  const L = _cssLum(hex); if (L == null || L >= 0.4) return hex;
  const h = hex.replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const t = 0.78 - L; // darker ink → blended further toward a bright neutral, preserving a hint of hue
  const mix = (c) => Math.round(c + (232 - c) * t);
  return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
// Read a Tabler icon's glyph CHAR + font-family from the live stylesheet (`.ti-<name>::before { content }`). The
// `tabler-icons` font renders that char on a Canvas2D context via fillText. `ok:false` when the glyph is unresolvable
// (unbundled / empty) so the drawer can reject it instead of dropping an invisible element.
function readGlyph(iconName) {
  try {
    const span = document.createElement('span'); span.className = 'ti ' + iconName;
    span.style.cssText = 'position:absolute;left:-9999px;visibility:hidden';
    document.body.appendChild(span);
    const cs = getComputedStyle(span, '::before');
    let ch = (cs.content || '').replace(/^["']|["']$/g, '');
    const fam = (getComputedStyle(span).fontFamily || 'tabler-icons').replace(/["']/g, '');
    span.remove();
    const ok = !!ch && ch !== 'none' && ch !== 'normal';
    return { glyph: ok ? ch : '', fontFamily: fam || 'tabler-icons', ok };
  } catch (_e) { return { glyph: '', fontFamily: 'tabler-icons', ok: false }; }
}
const COLOR_SCHEMES = {
  Plexus: ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#1e1e1e'],
  Cloud: ['#FF9900', '#4285F4', '#0089D6', '#326CE5', '#00A4A6'],
  Nature: ['#1b4332', '#2d6a4f', '#52b788', '#74c69d', '#b7e4c7'],
  Sunset: ['#fd7e14', '#ff6b6b', '#f06595', '#cc5de8', '#845ef7'],
  Mono: ['#111111', '#444444', '#777777', '#aaaaaa', '#cccccc'],
  Ocean: ['#03045e', '#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
  'Cause & Effect': ['#7c5cff', '#0ea5e9', '#10b981', '#64748b', '#ef4444'],
};
// Cause-&-Effect (Apollo/Sologic RCA) palette: role → box colour; terminator → circle colour; orange cross-link.
const CE_ROLE_COLOR = { primary: '#7c5cff', action: '#0ea5e9', condition: '#10b981', neutral: '#64748b' };
const CE_TERM_COLOR = { end: '#ef4444', question: '#0ea5e9' };
const CE_CONNECTOR_COLOR = '#f97316';
/* P2: heavy libs lazy-loaded from CDN on first use + cached (same pattern Smart Connections uses for
   transformers.js — keeps plugin.js lean, cold start untouched). */
const _libCache = {};
async function loadLib(url) { if (_libCache[url]) return _libCache[url]; _libCache[url] = await import(url); return _libCache[url]; }
const LIB = { polybool: 'https://cdn.jsdelivr.net/npm/polybooljs@1.2.0/+esm', katex: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/+esm', mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/+esm', pdfjs: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs' };
function shapePolygon(el) {
  const x = el.x, y = el.y, w = el.width, h = el.height, t = el.type;
  if (t === 'diamond') return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  if (t === 'triangle') return [[x + w / 2, y], [x + w, y + h], [x, y + h]];
  if (t === 'parallelogram') { const s = Math.abs(w) * 0.22; return [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]]; }
  if (t === 'hexagon') { const i = Math.abs(w) * 0.25; return [[x + i, y], [x + w - i, y], [x + w, y + h / 2], [x + w - i, y + h], [x + i, y + h], [x, y + h / 2]]; }
  if (t === 'cloud') { const cx = x + w / 2, cy = y + h / 2, ax = w * 0.40, ay = h * 0.34, bump = Math.min(Math.abs(w), Math.abs(h)) * 0.18, N = 9, pts = []; for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2 - Math.PI / 2; pts.push([cx + Math.cos(a) * ax, cy + Math.sin(a) * ay]); const ma = a + Math.PI / N; pts.push([cx + Math.cos(ma) * (ax + bump), cy + Math.sin(ma) * (ay + bump)]); } return pts; }
  if (t === 'ellipse') { const pts = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; pts.push([x + w / 2 + Math.cos(a) * w / 2, y + h / 2 + Math.sin(a) * h / 2]); } return pts; }
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}
// Rasterize an SVG string to a PNG File at 2× (white bg, size-capped) — used by Mermaid + LaTeX so the result
// becomes a normal image element (no live SVG/HTML in the render loop → stays fast).
function svgToPngFile(svg, name) {
  return new Promise((resolve) => {
    try {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || 600, h = img.naturalHeight || 400; const max = 900, s = Math.max(w, h) > max ? max / Math.max(w, h) : 1;
        const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * 2 * s)); cv.height = Math.max(1, Math.round(h * 2 * s));
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob((b) => resolve(b ? new File([b], name || 'render.png', { type: 'image/png' }) : null), 'image/png');
      };
      img.onerror = () => resolve(null); img.src = url;
    } catch (_e) { resolve(null); }
  });
}
// LaTeX → SVG via MathJax (classic script; tex-svg outputs self-contained vector paths → rasterizes cleanly).
async function loadMathJax() {
  if (window.MathJax && window.MathJax.tex2svg) return window.MathJax;
  if (!window.__pxcMJ) { window.__pxcMJ = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js'; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  try { await window.__pxcMJ; } catch (_e) { return null; }
  for (let i = 0; i < 60; i++) { if (window.MathJax && window.MathJax.tex2svg) return window.MathJax; await new Promise((r) => setTimeout(r, 100)); }
  return window.MathJax || null;
}
// P2 Text-to-Path: point + tangent angle at arc-length d along a polyline (world coords).
function pointAtArcLength(pts, segLen, d) {
  let acc = 0;
  for (let i = 0; i < segLen.length; i++) { if (acc + segLen[i] >= d) { const t = (d - acc) / (segLen[i] || 1); return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, angle: Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) }; } acc += segLen[i]; }
  return null;
}
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

const PALETTE = ['#1e1e1e', '#64748b', '#7c5cff', '#6366f1', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#92400e', '#ffffff'];
// round-5 C: typed relationship presets (Heptabase-style). relType → connection color + a default midpoint label + line style
// + arrowheads. Applied to an arrow/line; the label drives the note-side breadcrumb (reindex reads the midpoint label).
const PXC_REL_PRESETS = [
  { key: 'relates-to', label: 'relates to', color: '#64748b', lineStyle: 'solid', heads: 'single' },
  { key: 'supports', label: 'supports', color: '#10b981', lineStyle: 'solid', heads: 'single' },
  { key: 'contradicts', label: 'contradicts', color: '#ef4444', lineStyle: 'dashed', heads: 'single' },
  { key: 'causes', label: 'causes', color: '#f59e0b', lineStyle: 'solid', heads: 'single' },
  { key: 'part-of', label: 'part of', color: '#0ea5e9', lineStyle: 'solid', heads: 'single' },
  { key: 'example-of', label: 'example of', color: '#a855f7', lineStyle: 'dotted', heads: 'single' },
];
const FILLS = {
  '#1e1e1e': 'transparent', '#64748b': '#f1f5f9', '#7c5cff': '#efeaff', '#6366f1': '#e0e7ff',
  '#0ea5e9': '#e0f2fe', '#06b6d4': '#cffafe', '#14b8a6': '#ccfbf1', '#10b981': '#dcfce7',
  '#84cc16': '#ecfccb', '#f59e0b': '#fef3c7', '#f97316': '#ffedd5', '#ef4444': '#fee2e2',
  '#ec4899': '#fce7f3', '#a855f7': '#f3e8ff', '#92400e': '#fef0e7', '#ffffff': 'transparent',
};
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
  { id: 'frame', icon: 'ti-layout-board', title: 'Section (F) — a named boundary you can color, move as a unit, and point an arrow at as a WHOLE (or a card inside, or part of an image)' },
  { id: 'laser', icon: 'ti-target', title: 'Laser pointer (L) — a fading trail for presenting' },
  { id: 'lasso', icon: 'ti-select', title: 'Lasso select (S) — drag a freeform loop to select exactly what it encloses' },
  { id: 'card', icon: 'ti-id', title: 'New record card — click to drop a new note/record (edit its properties on the right)' },
  { id: 'datacore', icon: 'ti-table', title: 'Datacore card — click to drop a live query (dc: …); select it for the interactive view' },
];
const HANDLE_KEYS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const OPP = { nw: 'se', n: 's', ne: 'sw', e: 'w', se: 'nw', s: 'n', sw: 'ne', w: 'e' };
// The rough.js bbox-shaped primitives (bindable to arrows, resizable/rotatable, nudge-rebind). Extends across the
// original rect/ellipse/diamond + the visual-thinking shapes so all the membership checks stay in one place.
const ROUGH_SHAPES = ['rectangle', 'ellipse', 'diamond', 'triangle', 'roundrect', 'parallelogram', 'cylinder', 'hexagon', 'cloud'];
function isRoughShape(t) { return ROUGH_SHAPES.indexOf(t) >= 0; }
// The shape-picker flyout — the 6 new shapes. Cells render a MINI HAND-DRAWN PREVIEW of the actual shape (clearer
// than a substitute glyph, and several Tabler shape glyphs aren't bundled). SHAPE_DRAW maps id → its painter
// (function declarations hoist, so referencing them in this const is safe).
const SHAPE_PICKER = [
  { id: 'triangle', title: 'Triangle' },
  { id: 'roundrect', title: 'Rounded rectangle' },
  { id: 'parallelogram', title: 'Parallelogram (I/O)' },
  { id: 'cylinder', title: 'Cylinder (database)' },
  { id: 'hexagon', title: 'Hexagon (module)' },
  { id: 'cloud', title: 'Cloud (network / external)' },
];
const SHAPE_DRAW = { triangle: roughTriangle, roundrect: roughRoundRect, parallelogram: roughParallelogram, cylinder: roughCylinder, hexagon: roughHexagon, cloud: roughCloud };
// ~99 curated Tabler icons for visual thinking — EVERY name validated against Thymer's bundled ~440-glyph subset
// live (2026-06-18), so none render blank. A glyph is dropped as a real `icon` scene element (move/resize/rotate/colour/export).
const ICON_CATALOG = [
  { group: 'People',        names: ['ti-user', 'ti-users', 'ti-id', 'ti-friends', 'ti-mood-happy', 'ti-crown', 'ti-hand-grab', 'ti-eye', 'ti-brain'] },
  { group: 'Arrows & flow', names: ['ti-arrow-right', 'ti-arrow-left', 'ti-arrow-up', 'ti-arrow-down', 'ti-arrows-exchange', 'ti-arrow-back-up', 'ti-arrow-forward-up', 'ti-refresh'] },
  { group: 'Objects',       names: ['ti-adjustments', 'ti-tools', 'ti-bulb', 'ti-key', 'ti-lock', 'ti-paperclip', 'ti-pin', 'ti-trash', 'ti-scissors', 'ti-hammer'] },
  { group: 'Tech & data',   names: ['ti-database', 'ti-server', 'ti-cpu', 'ti-cloud', 'ti-code', 'ti-terminal', 'ti-share', 'ti-chart-bar', 'ti-chart-line', 'ti-table'] },
  { group: 'Status',        names: ['ti-check', 'ti-x', 'ti-alert-triangle', 'ti-circle-check', 'ti-ban', 'ti-flag', 'ti-star', 'ti-heart', 'ti-bell', 'ti-bookmark'] },
  { group: 'Nature',        names: ['ti-sun', 'ti-moon', 'ti-umbrella', 'ti-tree', 'ti-mountain', 'ti-droplet', 'ti-flame', 'ti-leaf', 'ti-map', 'ti-world'] },
  { group: 'Time',          names: ['ti-clock', 'ti-calendar', 'ti-hourglass', 'ti-alarm', 'ti-history', 'ti-calendar-event', 'ti-stopwatch'] },
  { group: 'Communication', names: ['ti-message', 'ti-news', 'ti-mail', 'ti-phone-call', 'ti-microphone', 'ti-speakerphone', 'ti-rocket', 'ti-quote', 'ti-at', 'ti-message-circle'] },
  { group: 'Business',      names: ['ti-coin', 'ti-cash', 'ti-currency-dollar', 'ti-wallet', 'ti-shopping-cart', 'ti-building-store', 'ti-briefcase', 'ti-receipt', 'ti-target', 'ti-trophy'] },
  { group: 'UI & misc',     names: ['ti-settings', 'ti-search', 'ti-filter', 'ti-folder', 'ti-file', 'ti-link', 'ti-plus', 'ti-circle-minus', 'ti-menu-2', 'ti-dots', 'ti-layout-dashboard', 'ti-layout-grid', 'ti-list', 'ti-photo', 'ti-brush'] },
];
// ── Toolbar customization — a per-user config (order/visibility/palette/density/size/position) persisted in
// localStorage['plexus_toolbar']. _buildToolbar renders from it; the settings page edits it + live-rebuilds. ──
const DEFAULT_TOOLBAR_ORDER = TOOLS.map((t) => t.id).concat(['_shapes', '_icons', '_color', '_note', '_cite', '_settings']);
const TOOLBAR_SPECIAL_LABEL = { _shapes: 'Shapes picker', _icons: 'Icons library', _color: 'Colours', _note: 'Note button', _cite: 'Cite button', _settings: 'Toolbar settings' };
function toolbarItemLabel(id) { const t = TOOLS.find((x) => x.id === id); if (t) return t.title.replace(/\s*\(.*$/, '').trim(); return TOOLBAR_SPECIAL_LABEL[id] || id; }
function toolbarItemIcon(id) { const t = TOOLS.find((x) => x.id === id); if (t) return t.icon; return { _shapes: 'ti-box', _icons: 'ti-mood-happy', _color: 'ti-palette', _note: 'ti-arrow-back-up', _cite: 'ti-link', _settings: 'ti-settings' }[id] || 'ti-square'; }
function loadToolbarConfig() {
  let c = null; try { c = JSON.parse(localStorage.getItem('plexus_toolbar') || 'null'); } catch (_e) {}
  if (!c || typeof c !== 'object') c = {};
  c.order = Array.isArray(c.order) ? c.order.filter((id) => DEFAULT_TOOLBAR_ORDER.includes(id)) : [];
  const have = new Set(c.order); for (const id of DEFAULT_TOOLBAR_ORDER) if (!have.has(id)) c.order.push(id); // new items always appear
  c.hidden = (c.hidden && typeof c.hidden === 'object') ? c.hidden : {};
  c.density = c.density === 'compact' ? 'compact' : 'comfortable';
  c.iconSize = Math.max(22, Math.min(44, Math.round(c.iconSize) || 30));
  c.position = c.position === 'left' ? 'left' : 'top';
  if (Array.isArray(c.palette)) { const pal = c.palette.filter((h) => /^#[0-9a-f]{6}$/i.test(h)); c.palette = pal.length ? pal : null; } else c.palette = null;
  return c;
}
function saveToolbarConfig(c) { try { localStorage.setItem('plexus_toolbar', JSON.stringify(c)); } catch (_e) {} }
// Ray-casting point-in-polygon — used by the lasso select to test element centers against the loop.
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Does a freehand loop OVERLAP an axis-aligned bbox at all? (centre-in-loop, any bbox corner in-loop, or any
// loop vertex inside the bbox). Used by the FLEXIBLE lasso so a shape touched only at its EDGE still counts.
function polyHitsRect(poly, bb) {
  if (!poly || poly.length < 3 || !bb) return false;
  if (pointInPoly(bb.x + bb.w / 2, bb.y + bb.h / 2, poly)) return true;
  const corners = [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]];
  for (const c of corners) if (pointInPoly(c[0], c[1], poly)) return true;
  for (const p of poly) if (p[0] >= bb.x && p[0] <= bb.x + bb.w && p[1] >= bb.y && p[1] <= bb.y + bb.h) return true;
  return false;
}
// Uniform hash-grid spatial index — buckets element bboxes into fixed cells so a viewport/point query touches
// only overlapping cells → O(visible) hit-tests/lasso/fit instead of an O(n) full-array scan. Rebuilt lazily
// (on the next query after any committed edit); render-cull keeps the z-ordered array scan for correctness.
class SpatialGrid {
  constructor(cell) { this.cell = cell || 256; this.map = new Map(); }
  insert(el, bb) {
    const c = this.cell, x0 = Math.floor(bb.x / c), y0 = Math.floor(bb.y / c), x1 = Math.floor((bb.x + bb.w) / c), y1 = Math.floor((bb.y + bb.h) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const k = cx + ':' + cy; let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(el); }
  }
  query(rx, ry, rw, rh) {
    const c = this.cell, out = [], seen = new Set(), x0 = Math.floor(rx / c), y0 = Math.floor(ry / c), x1 = Math.floor((rx + rw) / c), y1 = Math.floor((ry + rh) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const a = this.map.get(cx + ':' + cy); if (!a) continue; for (const el of a) if (!seen.has(el)) { seen.add(el); out.push(el); } }
    return out;
  }
}
// Axis-aligned bounds of a bbox rotated by `angle` about its centre — a rotated shape's footprint exceeds its
// un-rotated bbox, and hit-testing un-rotates the click, so the index must bucket the rotated extent or it misses.
function rotatedAABB(bb, angle) {
  const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, ca = Math.cos(angle), sa = Math.sin(angle);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h]]) {
    const dx = px - cx, dy = py - cy, rx = cx + dx * ca - dy * sa, ry = cy + dx * sa + dy * ca;
    if (rx < x0) x0 = rx; if (ry < y0) y0 = ry; if (rx > x1) x1 = rx; if (ry > y1) y1 = ry;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// Even-arclength resample of a polyline [[x,y]…] down to <=maxN points (so a freehand lasso fits the synced filename).
function resamplePoly(pts, maxN) {
  if (!pts || pts.length <= maxN) return pts ? pts.map((p) => p.slice()) : [];
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (!(total > 0)) return [pts[0].slice()];
  const step = total / maxN, out = [pts[0].slice()]; let acc = 0, next = step;
  for (let i = 1; i < pts.length && out.length < maxN; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], seg = Math.hypot(dx, dy);
    while (acc + seg >= next && out.length < maxN) { const f = seg > 0 ? (next - acc) / seg : 0; out.push([pts[i - 1][0] + dx * f, pts[i - 1][1] + dy * f]); next += step; }
    acc += seg;
  }
  return out;
}

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
  ctx.strokeStyle = adaptInk(opts.stroke || '#1e1e1e');
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
// ── Visual-thinking shapes (hand-drawn, reuse roughSeg/hachure; same jitter language as rect/diamond) ──
function _roughFillPoly(ctx, x, y, w, h, pts, opts, rng) { // shared: clip to a polygon path + hachure (or solid)
  if (!opts.fill || opts.fill === 'transparent') return;
  ctx.save(); ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip();
  if (opts.fillStyle === 'solid') { ctx.globalAlpha = opts.opacity == null ? 1 : opts.opacity; ctx.fillStyle = opts.fill; ctx.fill(); }
  else hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng);
  ctx.restore();
}
function roughTriangle(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1), r = (opts.roughness == null ? 1 : opts.roughness) * 1.4;
  const A = [x + w / 2, y], B = [x + w, y + h], C = [x, y + h];
  ctx.save(); applyStroke(ctx, opts); _roughFillPoly(ctx, x, y, w, h, [A, B, C], opts, rng);
  roughSeg(ctx, A[0], A[1], B[0], B[1], rng, r); roughSeg(ctx, B[0], B[1], C[0], C[1], rng, r); roughSeg(ctx, C[0], C[1], A[0], A[1], rng, r);
  ctx.restore();
}
function roughParallelogram(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1), r = (opts.roughness == null ? 1 : opts.roughness) * 1.4, s = Math.abs(w) * 0.22;
  const P = [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]];
  ctx.save(); applyStroke(ctx, opts); _roughFillPoly(ctx, x, y, w, h, P, opts, rng);
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; roughSeg(ctx, a[0], a[1], b[0], b[1], rng, r); }
  ctx.restore();
}
function roughHexagon(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1), r = (opts.roughness == null ? 1 : opts.roughness) * 1.4, i = Math.abs(w) * 0.25;
  const P = [[x + i, y], [x + w - i, y], [x + w, y + h / 2], [x + w - i, y + h], [x + i, y + h], [x, y + h / 2]];
  ctx.save(); applyStroke(ctx, opts); _roughFillPoly(ctx, x, y, w, h, P, opts, rng);
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length]; roughSeg(ctx, a[0], a[1], b[0], b[1], rng, r); }
  ctx.restore();
}
function roughRoundRect(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1), r = (opts.roughness == null ? 1 : opts.roughness) * 1.4;
  const k = Math.min(Math.min(Math.abs(w), Math.abs(h)) * 0.18, 24);
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, k); else ctx.rect(x, y, w, h); ctx.clip(); if (opts.fillStyle === 'solid') { ctx.fillStyle = opts.fill; ctx.fill(); } else hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  roughSeg(ctx, x + k, y, x + w - k, y, rng, r); roughSeg(ctx, x + w, y + k, x + w, y + h - k, rng, r);
  roughSeg(ctx, x + w - k, y + h, x + k, y + h, rng, r); roughSeg(ctx, x, y + h - k, x, y + k, rng, r);
  const corner = (cx, cy, a0) => { ctx.beginPath(); for (let j = 0; j <= 4; j++) { const a = a0 + (j / 4) * (Math.PI / 2); const px = cx + Math.cos(a) * k + (rng() * 2 - 1) * r, py = cy + Math.sin(a) * k + (rng() * 2 - 1) * r; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); };
  corner(x + k, y + k, Math.PI); corner(x + w - k, y + k, -Math.PI / 2); corner(x + w - k, y + h - k, 0); corner(x + k, y + h - k, Math.PI / 2);
  ctx.restore();
}
function roughCylinder(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1), r = (opts.roughness == null ? 1 : opts.roughness) * 1.2;
  const e = Math.min(Math.abs(h) * 0.18, 18), rx = w / 2, cx = x + w / 2;
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); ctx.beginPath(); ctx.rect(x, y + e / 2, w, h - e); ctx.clip(); if (opts.fillStyle === 'solid') { ctx.fillStyle = opts.fill; ctx.fill(); } else hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  const arc = (cy, a0, a1) => { ctx.beginPath(); const N = 18; for (let j = 0; j <= N; j++) { const a = a0 + (j / N) * (a1 - a0); const px = cx + Math.cos(a) * rx + (rng() * 2 - 1) * r, py = cy + Math.sin(a) * (e / 2) + (rng() * 2 - 1) * r; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); };
  roughSeg(ctx, x, y + e / 2, x, y + h - e / 2, rng, r); roughSeg(ctx, x + w, y + e / 2, x + w, y + h - e / 2, rng, r);
  arc(y + h - e / 2, 0, Math.PI);          // bottom front lip
  arc(y + e / 2, 0, Math.PI * 2);          // top cap ellipse
  ctx.restore();
}
function roughCloud(ctx, x, y, w, h, opts, seed) {
  const rng = mulberry32((seed | 0) || 1);
  const cx = x + w / 2, cy = y + h / 2, ax = w * 0.40, ay = h * 0.34, N = 9, bump = Math.min(Math.abs(w), Math.abs(h)) * 0.18;
  const base = []; for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2 - Math.PI / 2; base.push([cx + Math.cos(a) * ax, cy + Math.sin(a) * ay, a]); }
  const path = () => { ctx.beginPath(); for (let k = 0; k < N; k++) { const p0 = base[k], p1 = base[(k + 1) % N]; let a1 = p1[2]; if (a1 < p0[2]) a1 += Math.PI * 2; const ma = (p0[2] + a1) / 2; const b = bump + (rng() * 2 - 1) * 2; const mx = cx + Math.cos(ma) * (ax + b), my = cy + Math.sin(ma) * (ay + b); if (k === 0) ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(mx, my, p1[0], p1[1]); } ctx.closePath(); };
  ctx.save(); applyStroke(ctx, opts);
  if (opts.fill && opts.fill !== 'transparent') { ctx.save(); path(); ctx.clip(); if (opts.fillStyle === 'solid') { ctx.fillStyle = opts.fill; ctx.fill(); } else hachure(ctx, x, y, w, h, opts.fill, opts.strokeWidth || 2, rng); ctx.restore(); }
  path(); ctx.stroke();
  ctx.restore();
}
// Per-point stroke radius from local speed (point spacing): slow strokes go THICK, fast strokes go THIN —
// the natural-ink look (perfect-freehand-lite). Lightly smoothed so width transitions don't stair-step.
function freedrawRadii(pts, baseW) {
  const n = pts.length, rad = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;     // local spacing ≈ pen speed
    const t = Math.min(1, d / 22);                           // 0 (slow) … 1 (fast)
    rad[i] = Math.max(0.4, (baseW * (1.25 - 0.85 * t)) / 2); // thick when slow, taper when fast
  }
  for (let k = 0; k < 2; k++) { const r2 = rad.slice(); for (let i = 1; i < n - 1; i++) rad[i] = (r2[i - 1] + 2 * r2[i] + r2[i + 1]) / 4; }
  // taper the very tips for a pen-like entry/exit
  if (n > 3) { rad[0] *= 0.6; rad[1] *= 0.85; rad[n - 1] *= 0.6; rad[n - 2] *= 0.85; }
  return rad;
}
function drawFreedraw(ctx, el) {
  const pts = el.points; if (!pts || !pts.length) return; // points are ABSOLUTE world coords
  ctx.save();
  ctx.fillStyle = el.strokeColor || '#1e1e1e'; ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
  const baseW = el.strokeWidth || 3, n = pts.length;
  if (n === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], baseW / 2, 0, 7); ctx.fill(); ctx.restore(); return; }
  const rad = freedrawRadii(pts, baseW);
  // Build ONE path: a filled trapezoid per segment + a round dot per point (rounded joins/caps), filled once.
  ctx.beginPath();
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1], rp = rad[i], rq = rad[i + 1];
    let nx = -(q[1] - p[1]), ny = (q[0] - p[0]); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    ctx.moveTo(p[0] + nx * rp, p[1] + ny * rp);
    ctx.lineTo(q[0] + nx * rq, q[1] + ny * rq);
    ctx.lineTo(q[0] - nx * rq, q[1] - ny * rq);
    ctx.lineTo(p[0] - nx * rp, p[1] - ny * rp);
    ctx.closePath();
  }
  for (let i = 0; i < n; i++) { ctx.moveTo(pts[i][0] + rad[i], pts[i][1]); ctx.arc(pts[i][0], pts[i][1], rad[i], 0, 7); }
  ctx.fill('nonzero'); ctx.restore();
}
let PLEXUS_DEFAULT_FONT = 'system-ui, sans-serif'; // S7/P0.6: user-chosen default font (set from settings on load + change)
function textFont(el) { return (el.fontSize || 24) + 'px ' + ((el.fontFamily && el.fontFamily !== 'system-ui, sans-serif') ? el.fontFamily : PLEXUS_DEFAULT_FONT); }
// TEXT WRAP: word-wrap `text` into display lines that each fit within `wrapW` px (measured with `ctx`). Honours explicit
// newlines; a single word wider than wrapW overflows its line (no mid-word break). wrapW falsy → one line per paragraph.
function pxcWrapLines(ctx, text, wrapW) {
  const out = [];
  for (const para of String(text == null ? '' : text).split('\n')) {
    if (!(wrapW > 0)) { out.push(para); continue; }
    const words = para.split(' '); let cur = '';
    for (const word of words) {
      const test = cur === '' ? word : cur + ' ' + word;
      if (cur !== '' && ctx.measureText(test).width > wrapW) { out.push(cur); cur = word; } else cur = test;
    }
    out.push(cur);
  }
  return out;
}
function measureText(el) { // updates el.width/height from el.text; uses a shared offscreen ctx
  if (!measureText._c) measureText._c = document.createElement('canvas').getContext('2d');
  const ctx = measureText._c; ctx.font = textFont(el); const lh = (el.fontSize || 24) * 1.25;
  if (el.wrapW > 0) { const lines = pxcWrapLines(ctx, el.text || '', el.wrapW); el.width = el.wrapW; el.height = Math.max(lines.length, 1) * lh; return; }
  const lines = String(el.text || '').split('\n'); let w = 0;
  for (const ln of lines) w = Math.max(w, ctx.measureText(ln || ' ').width);
  el.width = Math.max(w, 8); el.height = Math.max(lines.length, 1) * lh;
}
// ── CANVAS-SEG: mid-sentence inline refs ──────────────────────────────────────
// A text element MAY carry `el.runs` = an array of {t:'text', s} | {t:'ref', kind:'record'|'line', guid, lineGuid?,
// label, alias?}. `el.text` stays the FLATTENED display string (refs → alias||label) so every existing reader/exporter
// keeps working, and plain JSON round-trips for free (no schema migration; an el without `runs` behaves exactly as
// before). The per-run x-extents are layout-only and MUST NEVER be serialized — they live in this side WeakMap keyed by
// the element, rebuilt lazily by measureRuns/drawRuns (storing them on the element would corrupt undo/dirty/persistence).
const _pxcRunLayout = new WeakMap();
function runDisplay(run) { if (!run) return ''; return run.t === 'ref' ? String(run.alias || run.label || 'ref') : String(run.s == null ? '' : run.s); }
function runsOf(el) { return (el && el.runs && el.runs.length) ? el.runs : [{ t: 'text', s: (el && el.text) || '' }]; }
function flattenRuns(runs) { let o = ''; for (const r of runs) o += runDisplay(r); return o; }
function hasRefRun(runs) { for (const r of runs) if (r.t === 'ref') return true; return false; }
function normalizeRuns(runs) { const out = []; for (const r of runs) { if (r.t === 'ref') { out.push(r); continue; } if (!r.s) continue; const last = out[out.length - 1]; if (last && last.t === 'text') last.s += r.s; else out.push({ t: 'text', s: r.s }); } return out; }
function _runOffsets(runs) { let off = 0; const out = []; for (const run of runs) { const txt = runDisplay(run); out.push({ run, txt, start: off, end: off + txt.length, isRef: run.t === 'ref' }); off += txt.length; } return out; }
// Map a single contiguous textarea edit (oldFlat → newFlat) back onto runs: runs fully outside the edit survive; any run
// (incl. a ref) overlapping the deleted span dissolves to plain text, keeping its untouched fragments. Deterministic — no
// substring guessing — so a ref the user typed over degrades cleanly instead of mis-binding.
function applyFlatEdit(runs, oldFlat, newFlat) {
  if (oldFlat === newFlat) return runs;
  const oL = oldFlat.length, nL = newFlat.length; let p = 0; const minL = Math.min(oL, nL);
  while (p < minL && oldFlat.charCodeAt(p) === newFlat.charCodeAt(p)) p++;
  let s = 0; const maxS = minL - p;
  while (s < maxS && oldFlat.charCodeAt(oL - 1 - s) === newFlat.charCodeAt(nL - 1 - s)) s++;
  const delStart = p, delEnd = oL - s, insText = newFlat.slice(p, nL - s);
  const left = [], right = [];
  for (const o of _runOffsets(runs)) {
    if (o.end <= delStart) { left.push(o.run); continue; }
    if (o.start >= delEnd) { right.push(o.run); continue; }
    const lcut = o.start < delStart ? o.txt.slice(0, delStart - o.start) : '';
    const rcut = o.end > delEnd ? o.txt.slice(delEnd - o.start) : '';
    if (lcut) left.push({ t: 'text', s: lcut });
    if (rcut) right.push({ t: 'text', s: rcut });
  }
  const mid = insText ? [{ t: 'text', s: insText }] : [];
  return normalizeRuns(left.concat(mid, right));
}
// Replace the flat range [start,end) (a plain @token the user just typed) with a ref run.
function spliceRunRange(runs, start, end, newRun) {
  const left = [], right = [];
  for (const o of _runOffsets(runs)) {
    if (o.end <= start) { left.push(o.run); continue; }
    if (o.start >= end) { right.push(o.run); continue; }
    const lcut = o.start < start ? o.txt.slice(0, start - o.start) : '';
    const rcut = o.end > end ? o.txt.slice(end - o.start) : '';
    if (lcut) left.push({ t: 'text', s: lcut });
    if (rcut) right.push({ t: 'text', s: rcut });
  }
  return normalizeRuns(left).concat([newRun], normalizeRuns(right));
}
// REF DISPLAY: retire a whole-element line/record ref CHIP into an INLINE ref RUN — drops the @/@@ prefix, renders
// underlined (drawRuns), and becomes editable inline (type text around it). Image chips keep their lightbox chip.
// Idempotent: no-op once the element already carries runs or isn't a line/record chip.
function pxcChipToInlineRun(el) {
  if (!el || !el.isRef || (el.runs && el.runs.length)) return false;
  if (el.refKind !== 'line' && el.refKind !== 'record') return false;
  const run = { t: 'ref', kind: el.refKind, guid: el.refGuid || null, lineGuid: el.refLineGuid || null, label: el.refLabel || 'ref' };
  if (el.refAlias) run.alias = el.refAlias;
  el.runs = [run]; el.text = flattenRuns(el.runs);
  delete el.isRef; delete el.refKind; delete el.refGuid; delete el.refLineGuid; delete el.refLabel; delete el.refAlias;
  try { measureRuns(el); } catch (_e) {}
  return true;
}
function measureRuns(el) {
  if (!measureText._c) measureText._c = document.createElement('canvas').getContext('2d');
  const ctx = measureText._c; ctx.font = textFont(el);
  const fs = el.fontSize || 24, lh = fs * 1.25, runs = runsOf(el);
  const wrapW = el.wrapW > 0 ? el.wrapW : Infinity; // TEXT WRAP: word-wrap text runs at wrapW; wrap a whole ref run as a unit
  const layout = []; let line = 0, x = 0, maxW = 0;
  const nl = () => { if (x > maxW) maxW = x; line++; x = 0; };
  for (const run of runs) {
    if (run.t === 'ref') { const txt = runDisplay(run), w = ctx.measureText(txt || ' ').width; if (x > 0 && x + w > wrapW) nl(); layout.push({ run, line, x, w, text: txt }); x += w; if (x > maxW) maxW = x; }
    else { const parts = String(run.s == null ? '' : run.s).split('\n'); for (let i = 0; i < parts.length; i++) {
      if (i > 0) nl();
      if (wrapW === Infinity) { const txt = parts[i]; if (!txt) continue; const w = ctx.measureText(txt).width; layout.push({ run, line, x, w, text: txt }); x += w; if (x > maxW) maxW = x; }
      else { for (const tok of parts[i].split(/( )/)) { if (tok === '') continue; const w = ctx.measureText(tok).width; if (x > 0 && x + w > wrapW && tok.trim()) nl(); layout.push({ run, line, x, w, text: tok }); x += w; if (x > maxW) maxW = x; } } // keep spaces as their own tokens so word boundaries survive
    } }
  }
  if (x > maxW) maxW = x;
  el.width = (wrapW === Infinity) ? Math.max(maxW, 8) : Math.max(el.wrapW, maxW); el.height = Math.max(line + 1, 1) * lh; // keep wrapW as the min, but cover a ref/word wider than wrapW so the bbox stays clickable
  _pxcRunLayout.set(el, layout);
  return layout;
}
function drawRuns(ctx, el) {
  let layout = _pxcRunLayout.get(el); if (!layout) layout = measureRuns(el);
  ctx.save(); ctx.font = textFont(el); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const fs = el.fontSize || 24, lh = fs * 1.25, base = (el.opacity == null ? 1 : el.opacity);
  for (const p of layout) {
    const isRef = p.run.t === 'ref';
    const col = adaptInk(isRef ? (p.run.kind === 'line' ? '#0ea5e9' : '#7c5cff') : (el.strokeColor || '#1e1e1e'));
    const px = el.x + p.x, py = el.y + p.line * lh;
    ctx.globalAlpha = base * (isRef ? _pxcLinkAlpha() : 1); ctx.fillStyle = col; ctx.fillText(p.text, px, py);
    if (isRef) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, fs * 0.055); const uy = py + fs * 1.06; ctx.beginPath(); ctx.moveTo(px, uy); ctx.lineTo(px + p.w, uy); ctx.stroke(); }
  }
  ctx.restore();
}
// Return the ref run under (wx,wy) world-space, or null. Un-rotates first (text rarely rotated, but stay correct).
function hitInlineRef(el, wx, wy) {
  if (!el || el.type !== 'text' || !el.runs || !el.runs.length) return null;
  let layout = _pxcRunLayout.get(el); if (!layout) layout = measureRuns(el);
  if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, c = Math.cos(-el.angle), s = Math.sin(-el.angle), dx = wx - cx, dy = wy - cy; wx = cx + dx * c - dy * s; wy = cy + dx * s + dy * c; }
  const fs = el.fontSize || 24, lh = fs * 1.25;
  for (const p of layout) { if (p.run.t !== 'ref') continue; const px = el.x + p.x, py = el.y + p.line * lh; if (wx >= px && wx <= px + p.w && wy >= py && wy <= py + lh) return p.run; }
  return null;
}
// SEARCH-CREATE: true when the picker results already contain an exact-title match for the query (so we DON'T offer
// "Create" — matches Thymer-native @-create). Empty query ⇒ true (never offer create on a bare @).
function pxcHasExactTitle(rows, query) { const q = String(query || '').trim().toLowerCase(); if (!q) return true; for (const r of rows) if (!r.create && String(r.label || '').trim().toLowerCase() === q) return true; return false; }
// BACKREF-SYNC: the note→canvas backref index is structured as PER-DRAWING sub-maps `{ [drawing]: { [lineGuid]:
// {el,label,t} } }` so concurrent writers (many drawings) never clobber each other's entries, and GC = drop one
// drawing's sub-map. localStorage holds the hot copy; a synced blob on a singleton record carries it cross-device.
const BREF_REC_TITLE = '⚙ Plexus Backref Index';
const BREF_FILE = 'plexus-backref-index.json';
// STORE v2 (multi-ref): `{ [drawing]: { [target]: { [elId]: {label, kind, t, from?, dir?, img?} } } }` — a target may be
// referenced by MANY canvas elements (so the note-side ↗ can offer a picker). Dedup is by elId (two runs in one element →
// one entry). Connection backrefs also carry the OTHER endpoint's name (from), arrow direction (dir), and image-region
// reference (img = {fileId, frac, fracPoly}) for the dialog breadcrumb/thumbnail (F1/F3) — reference-only, no pixel data.
// pxcBrefMigrate normalizes BOTH legacy shapes (flat {target:{drawing,el,…}} and nested-single {drawing:{target:{el,…}}}).
function pxcBrefMigrate(raw) {
  const out = {}; if (!raw || typeof raw !== 'object') return out;
  let flat = false; for (const k in raw) { const v = raw[k]; flat = !!(v && typeof v === 'object' && typeof v.drawing === 'string'); break; }
  if (flat) { for (const target in raw) { const e = raw[target]; if (!e || !e.drawing || !e.el) continue; const d = e.drawing; (out[d] = out[d] || {}); (out[d][target] = out[d][target] || {})[e.el] = { label: e.label, kind: e.kind || 'line', t: e.t || 0 }; } return out; }
  for (const d in raw) { const sub = raw[d]; if (!sub || typeof sub !== 'object') continue; out[d] = {};
    for (const target in sub) { const val = sub[target]; if (!val || typeof val !== 'object') continue;
      if (typeof val.el === 'string') { out[d][target] = { [val.el]: { label: val.label, kind: val.kind || 'line', t: val.t || 0 } }; } // legacy single-entry
      else { const m = {}; for (const elId in val) { const e = val[elId]; if (e && typeof e === 'object') m[elId] = { label: e.label, kind: e.kind || 'line', t: e.t || 0 }; } out[d][target] = m; } // el-map
    }
  }
  return out;
}
// Flatten → `{ [target]: [{drawing, el, label, kind, t}, …] }` (ALL refs to a target, newest first). One row per (drawing,el).
function pxcBrefFlatten(nested) {
  const flat = {};
  for (const d in nested) { const sub = nested[d]; for (const target in sub) { const m = sub[target]; for (const elId in m) { const e = m[elId]; const o = { drawing: d, el: elId, label: e.label, kind: e.kind || 'line', t: e.t || 0 }; if (e.from) o.from = e.from; if (e.dir) o.dir = e.dir; if (e.img) o.img = e.img; (flat[target] = flat[target] || []).push(o); } } } // F1/F3: carry the connection breadcrumb fields through to the renderer
  for (const target in flat) {
    flat[target].sort((a, b) => (b.t || 0) - (a.t || 0));
    // A4 (round 3): collapse entries with an IDENTICAL content signature (e.g. two identical connections to one line) to a
    // single row, keeping the newest. Distinct sources/directions still show separately. Declutters the picker + section.
    const seen = new Set(); flat[target] = flat[target].filter((e) => { const k = (e.label || '') + '|' + (e.from || '') + '|' + (e.dir || '') + '|' + (e.kind || '') + '|' + (e.img ? 'i' : ''); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  return flat;
}
// A2 (round 3): per-DRAWING last-writer-wins on the WHOLE sub-map (NOT additive per-elId). Every _setDrawingBackrefs
// re-stamps all entries with Date.now(), so a reindex that DROPPED a connector has a newer max-t and no entry for it →
// it REPLACES the remote copy → the deletion propagates cross-device. The old additive merge resurrected deletions
// (a stale remote entry re-appeared locally because entries were only ever added, never removed). Converges under
// concurrent edits to DIFFERENT drawings (each drawing is owned by whoever last reindexed it).
function pxcBrefMaxT(sub) { let m = 0; if (sub) for (const tg in sub) { const mm = sub[tg]; if (mm) for (const el in mm) { const e = mm[el]; if (e && (e.t || 0) > m) m = e.t || 0; } } return m; }
function pxcBrefMergeNested(a, b) { for (const d in b) { if (!a[d] || pxcBrefMaxT(b[d]) > pxcBrefMaxT(a[d])) a[d] = b[d]; } return a; }
// MINIMAP: fit scene-bounds into a w×h panel with padding → {scale, ox, oy}; world (wx,wy) → mini-local (ox+wx*scale,
// oy+wy*scale). Inverse: world = (miniLocal - o)/scale. Pure + node-tested.
function pxcMiniFit(bounds, w, h, pad) {
  if (!bounds || !(bounds.w > 0) || !(bounds.h > 0)) return null;
  const iw = w - pad * 2, ih = h - pad * 2; const scale = Math.min(iw / bounds.w, ih / bounds.h);
  return { scale, ox: pad + (iw - bounds.w * scale) / 2 - bounds.x * scale, oy: pad + (ih - bounds.h * scale) / 2 - bounds.y * scale };
}
// PAN MARGIN CACHE: device-pixel transform to blit a scene cache (rendered at camera `cc` with `M` css-px of margin on
// each side, so cacheCv-pixel(0,0) = world cc.x - M/cc.zoom) onto the canvas at the CURRENT camera `cam`. M=0 reduces to
// the plain viewport blit. Pure + node-tested. While panning within the margin, revealed edges stay on cached content.
function pxcMarginBlitOffset(cc, cam, M, dpr) {
  const s = cam.zoom / cc.zoom;
  const tx = (cc.x - M / cc.zoom - cam.x) * cam.zoom * dpr;
  const ty = (cc.y - M / cc.zoom - cam.y) * cam.zoom * dpr;
  return { s, tx, ty };
}
// BULK PROPERTY BRUSH: classify a typed value so the bulk write picks the right setter (a choice prop always uses
// setChoice regardless; for non-choice props this routes date→DateTime, number→set(Number), else text). Pure + tested.
function pxcToIsoDate(s) {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return m[3] + '-' + String(+m[1]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
  return null;
}
function pxcClassifyValue(v) {
  const s = String(v == null ? '' : v).trim();
  const iso = pxcToIsoDate(s); if (iso) return { kind: 'date', iso };
  if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: 'number', num: Number(s) };
  return { kind: 'text', text: s };
}
// ROLL-UP CARDS: parse an aggregation spec ("count" | "%done" | "sum:Prop" | "avg:Prop" | "min/max:Prop") + compute it
// over a list of numbers (or a match count). Pure + node-tested; the SDK fetch/sum lives in _rollupFor.
function pxcParseAgg(agg) {
  const raw = String(agg == null ? 'count' : agg).trim(), s = raw.toLowerCase();
  if (!s || s === 'count') return { fn: 'count' };
  if (s === '%done' || s === 'pctdone' || s === '%') return { fn: 'pctdone' };
  const m = /^(sum|avg|mean|average|min|max)\s*[:=]\s*(.+)$/i.exec(raw);
  if (m) { let fn = m[1].toLowerCase(); if (fn === 'mean' || fn === 'average') fn = 'avg'; return { fn, prop: m[2].trim() }; }
  return { fn: 'count' };
}
function pxcComputeAgg(fn, nums, count) {
  if (fn === 'sum') return nums.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 100) / 100 : 0;
  if (fn === 'min') return nums.length ? Math.min.apply(null, nums) : 0;
  if (fn === 'max') return nums.length ? Math.max.apply(null, nums) : 0;
  return count; // 'count' (and any unknown fn)
}
// TIMELINE / GANTT: pure axis math (ms↔x at day granularity). day0Ms = the left edge's day; pxPerDay = horizontal scale.
const PXC_DAY_MS = 86400000;
function pxcTimelineX(ms, day0Ms, x0, pxPerDay) { return x0 + ((ms - day0Ms) / PXC_DAY_MS) * pxPerDay; }
function pxcTimelineMs(x, day0Ms, x0, pxPerDay) { return day0Ms + Math.round((x - x0) / pxPerDay) * PXC_DAY_MS; } // snaps to the nearest day
function pxcMsToIsoLocal(ms) { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function pxcEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); } // escape user text before innerHTML
// AI RELATION-SUGGEST: tolerantly extract [{from,to,reason}] from the model's reply (raw JSON or fenced/with prose).
function pxcParseLinkSuggestions(text) {
  let arr = null;
  try { arr = JSON.parse(text); } catch (_e) { const m = String(text == null ? '' : text).match(/\[[\s\S]*\]/); if (m) { try { arr = JSON.parse(m[0]); } catch (_e2) {} } }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const s of arr) { if (!s || typeof s !== 'object') continue; const from = Number(s.from), to = Number(s.to); if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) continue; out.push({ from, to, reason: String(s.reason || '').slice(0, 120) }); }
  return out;
}
function pxcParseStringArray(text) { let arr = null; try { arr = JSON.parse(text); } catch (_e) { const m = String(text == null ? '' : text).match(/\[[\s\S]*\]/); if (m) { try { arr = JSON.parse(m[0]); } catch (_e2) {} } } return Array.isArray(arr) ? arr.map((x) => String(x == null ? '' : x)) : []; }
// AI AUTO-CLUSTER: connected-components clustering — elements with cosine similarity > threshold join the same group
// (single-linkage via union-find). Pure + node-tested; the on-device embedding lives in _aiAutoCluster.
function pxcClusterByThreshold(vecs, threshold) {
  const n = vecs.length, parent = []; for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const cos = (a, b) => { if (!a || !b) return 0; let s = 0; const L = Math.min(a.length, b.length); for (let i = 0; i < L; i++) s += a[i] * b[i]; return s; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (cos(vecs[i], vecs[j]) > threshold) parent[find(i)] = find(j);
  const groups = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return Array.from(groups.values());
}
function drawText(ctx, el) {
  if (el.midBinding && (el.text || (el.runs && el.runs.length))) { // CONNECTION LABEL: a subtle pill behind the text so it reads over the connector line
    const w = Math.abs(el.width) || 0, h = Math.abs(el.height) || 0;
    if (w > 0 && h > 0) { ctx.save(); const pad = 3, rad = 5; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(el.x - pad, el.y - pad, w + pad * 2, h + pad * 2, rad); else ctx.rect(el.x - pad, el.y - pad, w + pad * 2, h + pad * 2); ctx.fillStyle = PXC_DARK ? 'rgba(28,31,40,0.88)' : 'rgba(255,255,255,0.92)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = PXC_DARK ? 'rgba(124,92,255,0.55)' : 'rgba(124,92,255,0.4)'; ctx.stroke(); ctx.restore(); }
  }
  if (el.runs && el.runs.length) { drawRuns(ctx, el); return; } // CANVAS-SEG: inline-run text
  if (el.text == null || el.text === '') return;
  ctx.save();
  ctx.fillStyle = adaptInk(el.strokeColor || '#1e1e1e'); ctx.globalAlpha = (el.opacity == null ? 1 : el.opacity) * (el.isRef ? _pxcLinkAlpha() : 1); // S10: dim @@ ref nodes
  ctx.font = textFont(el); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const fs = el.fontSize || 24, lh = fs * 1.25, lines = (el.wrapW > 0) ? pxcWrapLines(ctx, el.text, el.wrapW) : String(el.text).split('\n'); // TEXT WRAP
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], el.x, el.y + i * lh);
  ctx.restore();
}
// Icon = one Tabler glyph drawn in the `tabler-icons` font, scaled to the element box (resize "just works"). Coloured
// by strokeColor, centred. The drawElement rotation wrapper rotates it for free.
function drawIcon(ctx, el) {
  if (!el.glyph) return;
  const sz = Math.min(Math.abs(el.width), Math.abs(el.height)) || el.fontSize || 24;
  ctx.save();
  ctx.fillStyle = adaptInk(el.strokeColor || '#1e1e1e'); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
  ctx.font = sz + 'px "' + (el.fontFamily || 'tabler-icons') + '"'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText(el.glyph, el.x + el.width / 2, el.y + el.height / 2);
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
// CONNECTION LABEL: the point at 50% of a polyline's arc length — where a connector's midpoint label sits (handles 2-pt
// straight lines + elbowed 4-pt routes). Pure, world coords.
function pxcPolyMidpoint(pts) {
  if (!pts || pts.length < 2) return null;
  if (pts.length === 2) return { x: (pts[0][0] + pts[1][0]) / 2, y: (pts[0][1] + pts[1][1]) / 2 };
  const seg = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); total += l; }
  let half = total / 2;
  for (let i = 0; i < seg.length; i++) { if (half <= seg[i] || i === seg.length - 1) { const t = seg[i] > 0 ? half / seg[i] : 0; return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t }; } half -= seg[i]; }
  return { x: pts[0][0], y: pts[0][1] };
}
function drawLinear(ctx, el) {
  const pts = routedPoints(el); if (!pts || pts.length < 2) return; // points are ABSOLUTE world coords
  ctx.save(); applyStroke(ctx, { stroke: el.strokeColor, strokeWidth: el.strokeWidth, opacity: el.opacity });
  const ls = el.lineStyle; // round-5 C: dashed/dotted draw a CLEAN poly-line (rough + dash = messy); solid keeps the rough double-pass
  if (ls === 'dashed' || ls === 'dotted') {
    const sw = el.strokeWidth || 2; ctx.setLineDash(ls === 'dotted' ? [Math.max(0.5, sw * 0.2), sw * 2 + 3] : [sw * 4 + 6, sw * 3 + 4]);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    ctx.setLineDash([]); // arrowheads always solid
  } else {
    const rng = mulberry32((el.seed | 0) || 1), rgh = (el.roughness == null ? 1 : el.roughness) * 1.1;
    for (let i = 0; i < pts.length - 1; i++) roughSeg(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], rng, rgh);
  }
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
  else if (el.type === 'triangle') roughTriangle(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'roundrect') roughRoundRect(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'parallelogram') roughParallelogram(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'cylinder') roughCylinder(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'hexagon') roughHexagon(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'cloud') roughCloud(ctx, el.x, el.y, el.width, el.height, opts, el.seed);
  else if (el.type === 'freedraw') drawFreedraw(ctx, el);
  else if (el.type === 'text') drawText(ctx, el);
  else if (el.type === 'icon') drawIcon(ctx, el);
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
  return { id: newId(), type: 'frame', x, y, width: w, height: h, angle: 0, name: 'Section', strokeColor: '#9aa0a6', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [] };
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
function makeIcon(x, y, size, iconName, style) {
  const g = readGlyph(iconName);
  return {
    id: newId(), type: 'icon', x, y, width: size, height: size, angle: 0,
    glyph: g.glyph, iconName, fontFamily: g.fontFamily, fontSize: size,
    strokeColor: (style && style.stroke) || '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
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
// SCALE/relational: read a record-relation property's target guids robustly. PluginProperty.values() may yield guid
// strings, {guid} objects, or a one-element array holding a JSON-string of guids (how an MCP-written relation lands);
// linkedRecords() returns [] for stored-but-unresolved relations (the gotcha), so we parse values() instead.
function pxcRelValues(p) {
  let raw = []; try { raw = (p && p.values) ? (p.values() || []) : []; } catch (_e) { raw = []; }
  const out = [];
  for (const v of (raw || [])) {
    if (v == null) continue;
    if (typeof v === 'string') { if (v[0] === '[') { try { for (const g of JSON.parse(v)) if (g) out.push(String(g)); continue; } catch (_e) {} } out.push(v); }
    else if (v.guid) out.push(v.guid);
    else if (v.getGuid) { try { const g = v.getGuid(); if (g) out.push(g); } catch (_e) {} }
  }
  return out;
}
// SCALE Phase 2 asset-shard helpers (write-side). `rec` is the backing Plexus Drawings record.
function pxcAssetShardProps(rec) { const out = []; for (const label of PXC_ASSET_SHARDS) { let p = null; try { p = rec.prop(label); } catch (_e) {} if (p && typeof p.addValue === 'function' && typeof p.files === 'function') out.push({ label, p }); } return out; }
function pxcPickAssetShard(rec) { const shards = pxcAssetShardProps(rec); for (const s of shards) { let n = Infinity; try { n = (s.p.files() || []).length; } catch (_e) {} if (n < PXC_ASSET_SHARD_CAP) return s.p; } return shards.length ? shards[shards.length - 1].p : null; } // lowest non-full shard, else the last (graceful degradation)
function pxcAssetGuidsOn(rec) { const have = new Set(); for (const s of pxcAssetShardProps(rec)) { try { for (const v of (s.p.files() || [])) if (v && v.guid) have.add(v.guid); } catch (_e) {} } return have; } // every asset guid anchored on rec, across ALL shards (for read-back)
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
// SUBGRAPH→CANVAS: Brain role → card/arrow colour (matches the Brain's relColor families).
const ROLE_HEX = { focus: '#7c5cff', parent: '#f59e0b', child: '#0ea5e9', sibling: '#14b8a6', leftFriend: '#a855f7', rightFriend: '#ec4899', friend: '#a855f7' };
function lineTextOf(li) {
  try { const segs = li.segments || []; return segs.map((s) => (typeof s.text === 'string') ? s.text : (s.text && s.text.title) ? s.text.title : '').join('').trim(); } catch (_e) { return ''; }
}
// TRANSCLUSION INDENTATION: flatten a line-item subtree into [{text, depth}] (depth 0 = the card body's top level) so a
// record/line card + card editor render an outline's nesting the way Thymer's outline does. ROOT CAUSE (2026-06-20):
// `rec.getLineItems()` returns the body FLAT in document (pre-order) — ALL descendants, each carrying `parent_guid` — and
// `li.getChildren()` returns [] on that flat load (the parent→child wiring isn't populated). So recursing getChildren left
// every row at depth 0 (the flat transclusion card the user saw). Depth MUST be derived from the `parent_guid` chain.
// Returns [{li, text, depth}] in pre-order, capped. opts: root=null → whole record (absolute depth); root=<lineGuid> → that
// line's subtree (includeRoot ? the line itself at depth 0 + descendants : descendants only at depth 0). includeBlank keeps
// empty lines (the editor needs them; cards skip them). Synchronous — no async getChildren walk.
function pxcOutlineRows(all, root, cap, includeBlank, includeRoot) {
  all = all || [];
  const byGuid = new Map(); for (const li of all) if (li && li.guid) byGuid.set(li.guid, li);
  const dcache = new Map();
  const absDepth = (li) => { const g = li.guid; if (dcache.has(g)) return dcache.get(g); let d = 0, p = li.parent_guid, seen = new Set([g]); while (p && byGuid.has(p) && !seen.has(p)) { seen.add(p); d++; p = byGuid.get(p).parent_guid; } dcache.set(g, d); return d; };
  const inSubtree = (li) => { if (!root) return true; if (li.guid === root) return !!includeRoot; let p = li.parent_guid, seen = new Set([li.guid]); while (p && !seen.has(p)) { if (p === root) return true; if (!byGuid.has(p)) return false; seen.add(p); p = byGuid.get(p).parent_guid; } return false; };
  let base = 0;
  if (root && byGuid.has(root)) base = absDepth(byGuid.get(root)) + (includeRoot ? 0 : 1); // shallowest shown row → depth 0
  const out = [];
  for (const li of all) { if (out.length >= cap) break; if (!inSubtree(li)) continue; const txt = lineTextOf(li); if (!txt && !includeBlank) continue; out.push({ li, text: txt, depth: Math.max(0, absDepth(li) - base) }); }
  return out;
}
// EDIT-INDENT: reconstruct a card body's tree from edited rows. `items` = loaded [{li, depth}] (DFS order); `parsed` =
// [{depth, text(trimmed)}] from the textarea; `body` = same rows with the leading indent stripped (intra-line spacing
// kept). Existing lines re-parent via li.move() when their depth changed + setSegments when text changed; extra rows are
// createLineItem'd. Keyed by a parent/after STACK (lastAt[d] = the last line placed at depth d). Caller refuses a count
// DECREASE (deletion) + a prefix-reorder. `isLine` → row 0 is the linecard's main line: never moved (it's the anchor).
async function pxcWriteCardTree(rec, items, parsed, body, isLine) {
  const lastAt = []; let writes = 0, fails = 0, richSkipped = 0, prevDepth = -1; // fails/richSkipped → honest toaster (the writes are independent + non-transactional; surface partial failures instead of always claiming success)
  for (let i = 0; i < parsed.length; i++) {
    let d = Math.min(parsed[i].depth, prevDepth + 1); if (d < 0) d = 0; // clamp over-indent to one deeper than the previous row (outline-editor behavior, never collapse to root unexpectedly)
    if (isLine && i === 0) d = 0; // the linecard's main line is the depth-0 anchor
    const text = parsed[i].text;
    const moveParent = (d === 0) ? rec : (lastAt[d - 1] || rec);
    const createParent = (d === 0) ? (isLine && items[0] ? items[0].li : null) : (lastAt[d - 1] || null); // linecard append: keep new top-level rows UNDER the main line (inside the card's subtree), not as record siblings
    const after = lastAt[d] || null;
    let li = null;
    if (i < items.length) {
      li = items[i].li;
      if (!(isLine && i === 0) && d !== items[i].depth) { try { const m = await li.move(moveParent, after); if (m) { li = m; writes++; } } catch (e) { fails++; console.warn('[Plexus] card-edit move', e); } }
      if (text !== (lineTextOf(items[i].li) || '')) {
        const segs = (items[i].li && items[i].li.segments) || []; const rich = segs.some((s) => s && s.type && s.type !== 'text');
        if (!rich) { try { if (await li.setSegments([{ type: 'text', text: body[i] }])) writes++; } catch (e) { fails++; console.warn('[Plexus] card-edit setSegments', e); } } // DATA SAFETY: never flatten a line carrying a ref/datetime/hashtag/bold/etc. to plain text (a no-title ref reads as '' so it'd look "edited") — leave rich lines untouched; edit them in the record
        else richSkipped++; // the user changed a rich line's visible text — intentionally NOT written (would flatten the ref/date/format). Reported so they know to edit it in the record.
      }
    } else if (text) {
      try { li = await rec.createLineItem(createParent, after, 'ulist', [{ type: 'text', text: body[i] }], null); if (li) writes++; } catch (e) { fails++; console.warn('[Plexus] card-edit createLineItem', e); }
    }
    if (li) { lastAt[d] = li; lastAt.length = d + 1; prevDepth = d; }
  }
  return { writes, fails, richSkipped };
}
// IO-1: a native TASK node — backed by a REAL Thymer `task` line item (lineGuid on recordGuid). Its checkbox
// toggles setTaskStatus, so the same task is live in the Task Board / Day View / @task search. A task dropped on
// a record card writes onto THAT record ("task on Bob"). Text + status are re-fetched live via _taskFor.
function makeTaskNode(x, y, w, h, lineGuid, recordGuid) {
  return {
    id: newId(), type: 'task', x, y, width: w, height: h, angle: 0, lineGuid, recordGuid,
    strokeColor: '#f59e0b', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
// TRANSCLUDE: a live read-only embed of a single LINE (its text + child lines), backed by lineGuid on recordGuid.
// Text re-fetched via _lineFor; repaints on lineitem.* (record-scoped invalidation covers child edits).
function makeLineCard(x, y, w, h, lineGuid, recordGuid) {
  return {
    id: newId(), type: 'linecard', x, y, width: w, height: h, angle: 0, lineGuid, recordGuid,
    strokeColor: '#0ea5e9', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
// Phase 9 E2: a LIVE query node — runs a searchByQuery and lists matching records, re-runs on changes.
function makeQueryNode(x, y, w, h, query) {
  return {
    id: newId(), type: 'query', x, y, width: w, height: h, angle: 0, query: query || '@task',
    strokeColor: '#0ea5e9', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
// LIVE TABLE: a query → records×properties grid; edit a cell → writes the typed property. cols = property names.
function makeTable(x, y, w, h, query, cols) {
  return {
    id: newId(), type: 'table', x, y, width: w, height: h, angle: 0, query: query || '', cols: cols || [],
    strokeColor: '#7c5cff', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
    roughness: 0, opacity: 1, seed: newSeed(), index: 'a0', isDeleted: false, groupIds: [],
  };
}
// LIVE TABLE: which (col, row-index) a point falls in. ri 0 = header; col 0 = the Name column. Pure + node-tested.
function pxcTableCellIndex(x, y, width, nCol, rowH, wx, wy) {
  const colW = width / Math.max(1, nCol);
  return { col: Math.max(0, Math.min(nCol - 1, Math.floor((wx - x) / colW))), ri: Math.max(0, Math.floor((wy - y) / rowH)), colW };
}
// ROLL-UP CARDS: a query bound to a live AGGREGATE (count / %done / sum|avg|min|max of a typed property) — a KPI tile.
function makeRollup(x, y, w, h, query, agg) {
  return {
    id: newId(), type: 'rollup', x, y, width: w, height: h, angle: 0, query: query || '', agg: agg || 'count',
    strokeColor: '#16a34a', backgroundColor: '#ffffff', fillStyle: 'solid', strokeWidth: 1.5,
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
    if (el.isDeleted || el.secHidden) continue;
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
  if (el.type === 'freedraw' || el.type === 'text' || el.type === 'icon' || el.type === 'image' || el.type === 'record' || el.type === 'linecard' || el.type === 'query' || el.type === 'rollup' || el.type === 'table' || el.type === 'board' || el.type === 'task') return true; // within bbox is good enough for selection
  const filled = el.backgroundColor && el.backgroundColor !== 'transparent';
  if (el.type === 'ellipse') {
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, rx = (maxx - minx) / 2 || 1, ry = (maxy - miny) / 2 || 1;
    const v = ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2;
    if (filled) return v <= 1.04;
    return Math.abs(Math.sqrt(v) - 1) < (tol / Math.min(rx, ry)) + 0.14;
  }
  // Slanted/concave shapes — exact polygon test (wx,wy are already un-rotated; shapePolygon verts are un-rotated too).
  if (el.type === 'triangle' || el.type === 'parallelogram' || el.type === 'hexagon' || el.type === 'cloud') {
    const poly = shapePolygon(el);
    if (filled) return pointInPoly(wx, wy, poly);
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if (distToSeg(wx, wy, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) <= tol + (el.strokeWidth || 2)) return true;
    return false;
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
async function findSceneLine(rec, tries = 8) {
  // Retry on an EMPTY line-item list. Right after a record resolves, its line items can lag (sync); a transient
  // empty read here used to make loadOrInit treat the record as fresh → overwrite the real scene with the empty
  // default (the Jun-17 data-loss). An empty list retries; a populated list without the scene returns null fast.
  for (let t = 0; t < tries; t++) {
    let items = null;
    try { items = await rec.getLineItems(); } catch (_e) {}
    if (items && items.length) {
      for (const li of items) {
        let b = null; try { b = await li.getBlob(); } catch (_e) {} // text/heading items return null fast
        if (b && b.fileName === SCENE_FILENAME) return li;
      }
      return null; // line items loaded, none carries the scene → genuinely no scene line
    }
    await sleep(120);
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
// ── SCALE Phase 3: spatial scene CHUNKING (delta saves at tens-of-thousands of elements) ──────────────────────
// The scene is partitioned into 2000px tiles; each tile (+ a `__meta` tile for appState/files/schema) is a JSON blob
// anchored in the `Chunks` many-file property, mapped chunkId→blobGuid by the `Manifest` text property. On save, only
// CHANGED tiles re-upload (content-hash diff) → O(changed) network. CPU is one full serialize (== the single-blob path).
// DATA-SAFETY: union-then-prune the Chunks anchor (new blobs anchored BEFORE the manifest points at them; old pruned only
// AFTER) + Manifest written LAST + the single `Scene` blob kept as a coarse fallback. Manifest-present ⟺ chunked mode.
const PXC_CHUNK_TILE = 2000, PXC_CHUNK_ENTER = 5000, PXC_CHUNK_EXIT = 3000, PXC_CHUNK_CHECKPOINT = 5;
function pxcHashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h.toString(36); }
function pxcElCenter(e) {
  const fb = [(e.x || 0) + (e.width || 0) / 2, (e.y || 0) + (e.height || 0) / 2];
  if (e.points && e.points.length) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const pt of e.points) { const px = pt[0], py = pt[1]; if (px < a) a = px; if (py < b) b = py; if (px > c) c = px; if (py > d) d = py; } const cx = (a + c) / 2, cy = (b + d) / 2; return [isFinite(cx) ? cx : fb[0], isFinite(cy) ? cy : fb[1]]; } // guard NaN (empty/malformed points) → fall back to x/y center
  return fb;
}
function pxcChunkId(e) { const ctr = pxcElCenter(e); return Math.floor((ctr[0] || 0) / PXC_CHUNK_TILE) + '_' + Math.floor((ctr[1] || 0) / PXC_CHUNK_TILE); }
function pxcPartition(elements) { const m = new Map(); for (const e of elements) { if (e.isDeleted) continue; const id = pxcChunkId(e); let arr = m.get(id); if (!arr) { arr = []; m.set(id, arr); } arr.push(e); } return m; }
function pxcReadManifest(rec) { try { const mp = rec.prop('Manifest'); if (mp && mp.text) { const t = mp.text(); if (t && t.trim()) { const m = JSON.parse(t); if (m && m.chunks) return m; } } } catch (_e) {} return null; }
function pxcChunkFv(guid) { return { name: 'chunk.json', error: null, guid, imgData: null, imgUrl: null, imgClass: null }; }
async function loadSceneChunked(plugin, rec) {
  const manifest = pxcReadManifest(rec); if (!manifest || !manifest.chunks) return null;
  const ids = Object.keys(manifest.chunks); if (!ids.length) return null;
  const fetchOne = async (chunkId) => {
    const guid = manifest.chunks[chunkId] && manifest.chunks[chunkId].g; if (!guid) return null;
    try { const blob = await plugin.data.getBlobFromPropertyFileValue(pxcChunkFv(guid)); if (!blob) return null; const ab = await blob.download(); if (!ab) return null; return { chunkId, data: JSON.parse(new TextDecoder().decode(ab)) }; } catch (_e) { return null; }
  };
  const parts = []; // batched (16-wide) so a 50k-element / hundreds-of-chunks open doesn't fire hundreds of parallel downloads
  for (let i = 0; i < ids.length; i += 16) { const r = await Promise.all(ids.slice(i, i + 16).map(fetchOne)); for (const x of r) parts.push(x); }
  if (parts.some((p) => !p)) return null; // a missing/unreadable chunk → DON'T return a PARTIAL scene; caller falls back to the Scene blob
  const scene = newScene(false); scene.elements = [];
  for (const p of parts) {
    if (p.chunkId === '__meta') { const m = p.data || {}; if (m.appState) scene.appState = m.appState; if (m.files) scene.files = m.files; if (m.schema != null) scene.schema = m.schema; if (m.type) scene.type = m.type; }
    else if (p.data && Array.isArray(p.data.elements)) { for (const e of p.data.elements) scene.elements.push(e); }
  }
  scene.elements.sort((a, b) => String(a.index || '').localeCompare(String(b.index || ''))); // restore z-order (paint order) — chunks reassemble out of order
  return scene;
}
// Returns {ok, mode:'chunked', rev, chunks} or {ok:false, reason}. On ANY failure the OLD manifest/chunks stay valid (no loss).
async function saveSceneChunked(plugin, rec, scene, view) {
  const parts = pxcPartition(scene.elements);
  const prevHashes = (view && view._chunkHashes) || {};
  const prevManifest = pxcReadManifest(rec) || { chunks: {}, rev: 0 };
  let prevFvs = []; try { const cp = rec.prop('Chunks'); if (cp && cp.files) prevFvs = (cp.files() || []).filter((v) => v && v.guid); } catch (_e) {}
  const newHashes = {}, manifestChunks = {}, currentFvs = [];
  const work = [['__meta', { appState: scene.appState, files: scene.files, schema: scene.schema, type: scene.type }]];
  for (const entry of parts) work.push([entry[0], { elements: entry[1] }]);
  for (const item of work) {
    const chunkId = item[0], json = JSON.stringify(item[1]), hash = pxcHashStr(json);
    newHashes[chunkId] = hash;
    const prevG = prevManifest.chunks[chunkId] && prevManifest.chunks[chunkId].g;
    if (prevHashes[chunkId] === hash && prevG) { manifestChunks[chunkId] = { g: prevG }; currentFvs.push(pxcChunkFv(prevG)); continue; } // unchanged → reuse blob
    let up = null; try { up = await plugin.data.uploadBlob(new File([json], 'chunk-' + chunkId + '.json', { type: 'application/json' })); } catch (_e) {}
    if (!up || !up.guid) return { ok: false, reason: 'chunk upload ' + chunkId };
    manifestChunks[chunkId] = { g: up.guid }; currentFvs.push(pxcChunkFv(up.guid));
  }
  const dedup = (arr) => { const seen = new Set(), out = []; for (const v of arr) { if (v && v.guid && !seen.has(v.guid)) { seen.add(v.guid); out.push(v); } } return out; };
  const cp = rec.prop('Chunks');
  if (cp && cp.set) { try { cp.set(dedup(currentFvs.concat(prevFvs))); } catch (_e) {} } // UNION: anchor NEW blobs while OLD are still anchored (so the manifest never points at an unanchored/GC-able blob)
  const rev = (prevManifest.rev || 0) + 1;
  let okManifest = false;
  try { const mp = rec.prop('Manifest'); if (mp && mp.set) { mp.set(JSON.stringify({ v: 1, rev, chunks: manifestChunks })); for (let i = 0; i < 4 && !okManifest; i++) { try { const m2 = JSON.parse((mp.text && mp.text()) || '{}'); okManifest = m2 && m2.rev === rev; } catch (_e) {} if (!okManifest) await sleep(120); } } } catch (_e) {}
  if (!okManifest) return { ok: false, reason: 'manifest write' }; // chunks anchored (union), OLD manifest still authoritative → no loss
  if (cp && cp.set) { try { cp.set(dedup(currentFvs)); } catch (_e) {} } // PRUNE: drop now-unreferenced old blobs → GC
  try { if (rec.prop('Scene Rev')) { rec.prop('Scene Rev').set(rev); if (rec.prop('Scene Schema')) rec.prop('Scene Schema').set(scene.schema || SCENE_SCHEMA); } } catch (_e) {}
  if (view) {
    view._chunkHashes = newHashes; view._wasChunked = true; view._chunkSaveCount = (view._chunkSaveCount || 0) + 1;
    if (view._chunkSaveCount % PXC_CHUNK_CHECKPOINT === 0) { try { const cf = new File([JSON.stringify(scene)], SCENE_FILENAME, { type: 'application/json' }); const cb = await plugin.data.uploadBlob(cf); if (cb && rec.prop('Scene') && rec.prop('Scene').setFileFromBlob) rec.prop('Scene').setFileFromBlob(cb); } catch (_e) {} } // periodic full-Scene checkpoint refreshes the coarse fallback
  }
  return { ok: true, mode: 'chunked', rev, chunks: Object.keys(manifestChunks).length };
}
function exportPng(scene, maxPx = 1024, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const run = () => {
      try {
        const b = sceneBounds(scene); const pad = opts.padding != null ? opts.padding : 24;
        const w = b.w + pad * 2, h = b.h + pad * 2; // S8: explicit scale, else fit to maxPx
        const scale = opts.scale ? opts.scale : Math.min(2, maxPx / Math.max(w, h, 1));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
        const ctx = cv.getContext('2d');
        if (opts.background !== false) { ctx.fillStyle = scene.appState.viewBackgroundColor || '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        ctx.setTransform(scale, 0, 0, scale, (-b.x + pad) * scale, (-b.y + pad) * scale);
        const _pd = PXC_DARK; PXC_DARK = false; // UX-6: export is always TRUE colour (the dark treatment is display-only)
        try { for (const el of scene.elements) if (!el.isDeleted && !el.secHidden) drawElement(ctx, el); } finally { PXC_DARK = _pd; }
        cv.toBlob((blob) => resolve(blob), 'image/png');
      } catch (_e) { resolve(null); }
    };
    // CRITICAL: if the scene has icon elements, ensure the Tabler font is LOADED before rasterizing — Canvas2D fillText
    // of an unloaded web font silently draws tofu/blank. (Only gates when icons are present; first export only.)
    try {
      const hasIcon = scene.elements && scene.elements.some((e) => e.type === 'icon' && !e.isDeleted);
      if (hasIcon && document.fonts && !document.fonts.check('24px "tabler-icons"')) { document.fonts.load('24px "tabler-icons"').then(run, run); return; }
    } catch (_e) {}
    run();
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
    if (el.isDeleted || el.secHidden) continue;
    const sw = el.strokeWidth || 2, sc = el.strokeColor || '#1e1e1e';
    const fillc = (el.backgroundColor && el.backgroundColor !== 'transparent') ? el.backgroundColor : 'none';
    const op = el.opacity == null ? 1 : el.opacity;
    const rot = el.angle ? ` transform="rotate(${(el.angle * 180 / Math.PI).toFixed(2)} ${(el.x + el.width / 2).toFixed(2)} ${(el.y + el.height / 2).toFixed(2)})"` : '';
    const common = `stroke="${sc}" stroke-width="${sw}" fill="${fillc}" opacity="${op}"`;
    if (el.type === 'rectangle') p.push(`<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="2" ${common}${rot}/>`);
    else if (el.type === 'ellipse') p.push(`<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${Math.abs(el.width / 2)}" ry="${Math.abs(el.height / 2)}" ${common}${rot}/>`);
    else if (el.type === 'diamond') { const mx = el.x + el.width / 2, my = el.y + el.height / 2; p.push(`<polygon points="${mx},${el.y} ${el.x + el.width},${my} ${mx},${el.y + el.height} ${el.x},${my}" ${common}${rot}/>`); }
    else if (el.type === 'triangle' || el.type === 'parallelogram' || el.type === 'hexagon' || el.type === 'cloud') { const pts = shapePolygon(el).map((q) => q.map((n) => n.toFixed(1)).join(',')).join(' '); p.push(`<polygon points="${pts}" ${common}${rot}/>`); }
    else if (el.type === 'roundrect') { const k = Math.min(Math.min(Math.abs(el.width), Math.abs(el.height)) * 0.18, 24); p.push(`<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${k.toFixed(1)}" ${common}${rot}/>`); }
    else if (el.type === 'cylinder') { const e = Math.min(Math.abs(el.height) * 0.18, 18), rx = el.width / 2, ry = e / 2, cx = el.x + el.width / 2; p.push(`<g${rot}><path d="M${el.x},${(el.y + ry).toFixed(1)} L${el.x},${(el.y + el.height - ry).toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${el.x + el.width},${(el.y + el.height - ry).toFixed(1)} L${el.x + el.width},${(el.y + ry).toFixed(1)}" fill="${fillc}" stroke="${sc}" stroke-width="${sw}" opacity="${op}"/><ellipse cx="${cx}" cy="${(el.y + ry).toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${fillc}" stroke="${sc}" stroke-width="${sw}" opacity="${op}"/></g>`); }
    else if (el.type === 'icon') { const sz = Math.min(Math.abs(el.width), Math.abs(el.height)) || el.fontSize || 24; p.push(`<text x="${(el.x + el.width / 2).toFixed(1)}" y="${(el.y + el.height / 2).toFixed(1)}" font-family="tabler-icons" font-size="${sz}" fill="${sc}" text-anchor="middle" dominant-baseline="central" opacity="${op}"${rot}>${svgEsc(el.glyph || '')}</text>`); }
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
// B2: pure builder — a /cause-effect-chart RCA JSON → native canvas elements (role-coloured boxes + ★ primary +
// red/blue terminator circles + grey effect→cause arrows + orange "Connects to" cross-links), right-branching tree.
// Schema: {nodes:[{id,text,role,terminator?,category?}], edges:[{effect,cause}], connections:[{from,to,label}]}.
// CE-FISHBONE: a closed home-plate pentagon (the classic "problem statement" head pointing right), drawn as a 'line'.
function cePentagon(x, y, w, h, color) {
  const el = makeLinear(x, y, 'line', { stroke: color, strokeWidth: 2 });
  const tipX = x + w, midY = y + h / 2, bodyX = x + w * 0.72;
  el.points = [[x, y], [bodyX, y], [tipX, midY], [bodyX, y + h], [x, y + h], [x, y]]; // 6 pts, closed
  el.endArrowhead = null; el.startArrowhead = null; el.roughness = 0;
  linearBBox(el); return el;
}
// CE-FISHBONE: Ishikawa layout — root = head at the right of a horizontal spine; major causes alternate up/down as
// angled bones; sub-causes stack outward along each bone. Returns {pos, lines} (spine/bones, no arrowheads).
function ceFishbonePositions(nodes, kids, rootId, ox, oy, BW, BH) {
  const pos = {}, lines = [], placed = {}; const VGAP = 80;
  const majors = kids[rootId] || []; const M = Math.max(majors.length, 1);
  const midY = oy + 300, step = (M + 1) * 120, headX = ox + step + 40;
  pos[rootId] = { x: headX, y: midY - BH / 2, w: BW, h: BH }; placed[rootId] = true;
  lines.push({ from: [ox, midY], to: [headX, midY], spine: true });
  const placeBranch = (id, side, ax, ay) => {
    if (placed[id]) return; placed[id] = true;
    const bx = ax - 170, by = ay + side * 130;
    pos[id] = { x: bx, y: by - BH / 2, w: BW, h: BH };
    lines.push({ from: [ax, ay], to: [bx + BW, by] });
    (kids[id] || []).forEach((k, j) => placeBranch(k, side, bx + 30, by + side * (70 + j * 80)));
  };
  majors.forEach((m, i) => { const side = (i % 2 === 0) ? -1 : 1; const sx = headX - (i + 1) * (headX - ox) / (M + 1); placeBranch(m, side, sx, midY); });
  let oc = 0; for (const n of nodes) if (!placed[n.id]) { pos[n.id] = { x: ox - 60, y: oy + (oc++) * VGAP, w: BW, h: BH }; placed[n.id] = true; }
  return { pos, lines };
}
// CE-BRAIN: the body line written on a CAUSE record pointing at its EFFECT. An OUTBOUND ref makes the effect the
// cause's INFERRED child in Plexus Brain (brain plugin.js:156-166), so focusing the effect shows its causes as
// parents/roots — the RCA convention. Brain reads `s.text.guid`.
function ceEdgeSegments(effGuid, effText) { return [{ type: 'text', text: '→ ' }, { type: 'ref', text: { guid: effGuid, title: effText || '' } }]; }
function elementsFromCauseEffect(chart, ox, oy, layout, chartId) {
  ox = ox || 0; oy = oy || 0; const out = [];
  if (!chart || typeof chart !== 'object') return out;
  const nodes = Array.isArray(chart.nodes) ? chart.nodes : [];
  const edges = Array.isArray(chart.edges) ? chart.edges : [];
  const conns = Array.isArray(chart.connections) ? chart.connections : [];
  const mode = (layout === 'fishbone' || layout === 'pentagon') ? layout : 'tree'; // CE-FISHBONE: layout variants
  const byId = {}; for (const n of nodes) if (n && n.id != null) byId[n.id] = n;
  const kids = {}, isEffect = {};
  for (const e of edges) { if (!e || byId[e.effect] == null || byId[e.cause] == null) continue; (kids[e.effect] = kids[e.effect] || []).push(e.cause); isEffect[e.effect] = true; }
  let rootId = null; for (const n of nodes) if (n.role === 'primary') { rootId = n.id; break; } if (rootId == null && nodes.length) rootId = nodes[0].id;
  if (rootId == null) return out;
  const HGAP = 240, VGAP = 80, BW = 152, BH = 50; let leaf = 0; const rowOf = {}, depthOf = {}, seen = {};
  const place = (id, depth) => {
    if (seen[id]) return rowOf[id] || 0; seen[id] = true; depthOf[id] = depth;
    const ks = kids[id] || [];
    if (!ks.length) { rowOf[id] = leaf++; return rowOf[id]; }
    const rs = ks.map((k) => place(k, depth + 1)); rowOf[id] = (rs[0] + rs[rs.length - 1]) / 2; return rowOf[id];
  };
  place(rootId, 0);
  for (const n of nodes) if (!seen[n.id]) { depthOf[n.id] = 0; rowOf[n.id] = leaf++; seen[n.id] = true; }
  // positions per layout (tree + pentagon share the tree grid; fishbone uses the spine layout)
  const pos = {}; let fishLines = null;
  if (mode === 'fishbone') { const fb = ceFishbonePositions(nodes, kids, rootId, ox, oy, BW, BH); for (const id in fb.pos) pos[id] = fb.pos[id]; fishLines = fb.lines; }
  else { for (const n of nodes) pos[n.id] = { x: ox + (depthOf[n.id] || 0) * HGAP, y: oy + (rowOf[n.id] || 0) * VGAP, w: BW, h: BH }; }
  for (const n of nodes) {
    const p = pos[n.id]; if (!p) continue; const x = p.x, y = p.y;
    const role = CE_ROLE_COLOR[n.role] || CE_ROLE_COLOR.neutral;
    if (mode === 'pentagon' && n.id === rootId) { const pent = cePentagon(x, y, BW, BH, role); pent.ceRole = n.role || 'neutral'; pent.ceNodeId = n.id; pent.ceText = n.text || ''; if (chartId) pent.ceChartId = chartId; if (n.category) pent.ceCategory = n.category; out.push(pent); }
    else { const box = makeRect(x, y, BW, BH, { type: 'rectangle', stroke: role, fill: tintColor(role), fillStyle: 'solid' }); box.roughness = 0; box.ceRole = n.role || 'neutral'; box.ceNodeId = n.id; box.ceText = n.text || ''; if (chartId) box.ceChartId = chartId; if (n.category) box.ceCategory = n.category; out.push(box); }
    const star = n.role === 'primary' ? '★ ' : ''; const label = String(n.text || '');
    const catM = label.match(/^([^:]{1,32}:)\s*([\s\S]*)$/);
    if (catM) { const head = makeText(x + 9, y + 8, { fontSize: 13, stroke: '#1e1e1e' }); head.text = star + catM[1]; head.fontFamily = 'system-ui, sans-serif'; measureText(head); out.push(head);
      const body = makeText(x + 9, y + 26, { fontSize: 12, stroke: '#1e1e1e' }); body.text = catM[2]; measureText(body); out.push(body); }
    else { const lbl = makeText(x + 9, y + 16, { fontSize: 13, stroke: '#1e1e1e' }); lbl.text = star + label; measureText(lbl); out.push(lbl); }
    if (n.terminator && !isEffect[n.id]) {
      const tcol = CE_TERM_COLOR[n.terminator];
      if (tcol) { const cx = x + BW + 16, cy = y + BH / 2; const circ = makeRect(cx - 11, cy - 11, 22, 22, { type: 'ellipse', stroke: tcol, fill: tintColor(tcol), fillStyle: 'solid' }); circ.roughness = 0; circ.ceTerminator = n.terminator; circ.ceFor = n.id; out.push(circ);
        if (n.terminator === 'question') { const q = makeText(cx - 4, cy - 9, { fontSize: 15, stroke: tcol }); q.text = '?'; measureText(q); out.push(q); } }
    }
  }
  if (mode === 'fishbone' && fishLines) { // bones + spine instead of horizontal arrows
    for (const ln of fishLines) { const seg = makeLinear(0, 0, 'line', { stroke: ln.spine ? '#64748b' : '#94a3b8', strokeWidth: ln.spine ? 3 : 2 }); seg.points = [ln.from, ln.to]; seg.endArrowhead = null; seg.roughness = 0.4; seg.ceBone = true; linearBBox(seg); out.push(seg); }
  } else {
    for (const e of edges) { const a = pos[e.effect], b = pos[e.cause]; if (!a || !b) continue;
      const ar = makeLinear(0, 0, 'arrow', { stroke: '#94a3b8', strokeWidth: 2 }); ar.points = [[a.x + a.w + 4, a.y + a.h / 2], [b.x - 4, b.y + b.h / 2]]; ar.endArrowhead = 'arrow'; linearBBox(ar); out.push(ar); }
    if (mode === 'pentagon') { // classic backbone spine through the head
      const r = pos[rootId]; let maxX = ox; for (const n of nodes) { const q = pos[n.id]; if (q && q.x + BW > maxX) maxX = q.x + BW; }
      const sp = makeLinear(0, 0, 'line', { stroke: '#64748b', strokeWidth: 3 }); sp.points = [[r.x + BW, r.y + BH / 2], [maxX + 20, r.y + BH / 2]]; sp.endArrowhead = null; sp.roughness = 0.4; sp.ceBone = true; linearBBox(sp); out.unshift(sp); }
  }
  for (const c of conns) { const a = pos[c.from], b = pos[c.to]; if (!a || !b) continue;
    const ar = makeLinear(0, 0, 'arrow', { stroke: CE_CONNECTOR_COLOR, strokeWidth: 2 }); ar.ceConnector = true; ar.points = [[a.x + a.w / 2, a.y + a.h], [b.x + b.w / 2, b.y + b.h]]; ar.endArrowhead = 'arrow'; linearBBox(ar); out.push(ar);
    const mid = makeText((a.x + b.x) / 2 + a.w / 2, (a.y + b.y) / 2 + a.h + 4, { fontSize: 11, stroke: CE_CONNECTOR_COLOR }); mid.text = c.label || 'Connects to'; measureText(mid); out.push(mid); }
  return out;
}
async function saveScene(plugin, rec, scene, camera, view) {
  scene.appState.scroll = { x: camera.x, y: camera.y }; scene.appState.zoom = camera.zoom;
  // CP-1: stamp a valid fractional z-index reflecting paint (array) order, so the persisted scene is
  // Excalidraw-export-valid (was a dead 'a0' constant). Lexicographically sortable, fixed-width base36.
  for (let i = 0; i < scene.elements.length; i++) scene.elements[i].index = 'a' + i.toString(36).padStart(8, '0');
  // SCALE Phase 3: chunked mode for large scenes (hysteresis: enter ≥5000 live elements, exit <3000); else the proven
  // single-blob path. A chunked-save failure falls through to the single-blob FULL write (safe) + clears the manifest below.
  const liveCount = scene.elements.reduce((n, e) => n + (e.isDeleted ? 0 : 1), 0);
  const wasChunked = view ? !!view._wasChunked : !!pxcReadManifest(rec);
  if (wasChunked ? (liveCount >= PXC_CHUNK_EXIT) : (liveCount >= PXC_CHUNK_ENTER)) {
    try { const r = await saveSceneChunked(plugin, rec, scene, view); if (r && r.ok) return r; } catch (_e) {}
  }
  const file = new File([JSON.stringify(scene)], SCENE_FILENAME, { type: 'application/json' });
  const blob = await plugin.data.uploadBlob(file);
  if (!blob) return { ok: false, reason: 'uploadBlob null' };
  let ok = false, mode = 'line';
  // UX-4: prefer the record's `Scene` FILE PROPERTY (clean — not in the note body). prop() is null when the
  // collection has no such property, in which case we fall back to a body `file` line item.
  let sceneProp = null; try { sceneProp = rec.prop('Scene'); } catch (_e) {}
  if (sceneProp && typeof sceneProp.setFileFromBlob === 'function') {
    // RESPECT the boolean return — a phantom `Scene` prop (collection lacks the field) returns false; assuming
    // success there + deleting the body line below would lose the scene. Only treat as 'prop' when it truly wrote.
    let wrote = false; try { wrote = sceneProp.setFileFromBlob(blob) !== false; } catch (_e) { wrote = false; }
    if (wrote) {
      mode = 'prop'; ok = true;
      // Migrate body→property: delete the old body line ONLY after CONFIRMING the property holds a blob on
      // read-back (defends a phantom that returns truthy but stores nothing). Brief retry for write propagation.
      let confirmed = false; for (let i = 0; i < 3 && !confirmed; i++) { try { const pb = await sceneProp.fileBlob(); confirmed = !!pb; } catch (_e) {} if (!confirmed) await sleep(120); }
      if (confirmed) { try { const old = (view && view._sceneLine) || await findSceneLine(rec); if (old) { try { await old.delete(); } catch (_e) {} if (view) view._sceneLine = null; } } catch (_e) {} }
      // not confirmed → keep BOTH the property write and the body line (loader prefers whichever loads); never delete unverified.
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
  // PERF: the O(n) `Canvas Text` rescan + banner PNG re-export used to run on EVERY save (write amplification).
  // They're now a DEBOUNCED idle pass (view._scheduleBannerText) — cosmetic + search-only, decoupled from the
  // durable scene write above. View-less saves (rare) still refresh them inline here so nothing is lost.
  if (!view) { try { _writeBannerTextInline(plugin, rec, scene); } catch (_e) {} }
  // SCALE Phase 3: we just persisted the FULL scene via the Scene blob → clear any manifest so load is unambiguous
  // (manifest-present ⟺ chunked). Covers a chunked→single shrink AND a chunked-save failure that degraded to here.
  try { const mp = rec.prop('Manifest'); if (mp && mp.text && (mp.text() || '').trim() && mp.set) { mp.set(''); const cp = rec.prop('Chunks'); if (cp && cp.set) cp.set([]); } } catch (_e) {}
  if (view) { view._wasChunked = false; view._chunkHashes = {}; }
  return { ok, mode, blobGuid: blob.guid };
}
// The Canvas-Text property mirror + banner-preview PNG. Off the save hot path (debounced); see _scheduleBannerText.
async function _writeBannerTextInline(plugin, rec, scene) {
  // SCALE Phase 3: unlimited-enough searchable canvas text — capture EVERY element's text (not just `type:'text'`), and
  // raise the 4000-char cap to 200KB (~30k words; far beyond any real whiteboard) so search sees all of it.
  try { const ct = rec.prop('Canvas Text'); if (ct && typeof ct.set === 'function') { const txt = scene.elements.filter((e) => !e.isDeleted && typeof e.text === 'string' && e.text.trim()).map((e) => e.text.trim()).join(' • ').slice(0, 200000); ct.set(txt); } } catch (_e) {}
  try { const showBanner = !plugin._settings || plugin._settings.bannerPreview !== false; if (showBanner) { const png = await exportPng(scene); if (png) { const pb = await plugin.data.uploadBlob(new File([png], 'preview.png', { type: 'image/png' })); if (pb) rec.setBannerFromBlob(pb); } } else { try { rec.setBanner(null); } catch (_e2) {} } } catch (_e) {}
}

/* ──────────────────────────────── renderer seam ──────────────────────────────── */
// The render() loop draws through a pluggable Renderer so a future WebGL HYBRID backend (GPU shapes/images +
// Canvas2D/DOM overlay for text/cards/effects) is a DROP-IN, not a rewrite. The Canvas2D backend below forwards
// to the existing painters verbatim → pixel-identical, zero behaviour change. Swap via RENDERER_BACKEND.
const RENDERER_BACKEND = 'canvas2d'; // 'canvas2d' (current) | 'webgl' (Task 8)
class Canvas2DRenderer {
  constructor(view) { this.view = view; this.ctx = null; this.kind = 'canvas2d'; }
  begin(ctx, camera, dpr, pad) { this.ctx = ctx; const z = camera.zoom, d = dpr, P = pad || 0; ctx.setTransform(z * d, 0, 0, z * d, (-camera.x * z + P) * d, (-camera.y * z + P) * d); } // pad = render-pad offset (px) for the oversized compositor-pan static layer; 0 for the viewport-sized overlay
  grid() { this.view._drawGrid(this.ctx); }
  frame(el) { this.view._drawFrame(this.ctx, el); }
  element(el) {
    const v = this.view, ctx = this.ctx, t = el.type;
    if (t === 'image') v._drawImage(ctx, el);
    else if (t === 'record') v._drawRecordCard(ctx, el);
    else if (t === 'linecard') v._drawLineCard(ctx, el);
    else if (t === 'query') v._drawQueryNode(ctx, el);
    else if (t === 'rollup') v._drawRollupNode(ctx, el);
    else if (t === 'table') v._drawTableNode(ctx, el);
    else if (t === 'board') v._drawBoardCard(ctx, el);
    else if (t === 'task') v._drawTaskNode(ctx, el);
    else drawElement(ctx, el);
  }
  ghosts() { this.view._drawGhosts(this.ctx); }
  end() {}
}
// #RRGGBB → [r,g,b] in 0..1 (for GL clear/uniform colours). Falls back to white on a bad value.
function hexToRgb01(hex) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim()); if (!m) return [1, 1, 1]; return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]; }
// World (wx,wy) → WebGL clip space, given the camera + CSS-px viewport (DPR is handled by gl.viewport, not here).
// Mirrors Camera.worldToScreen then maps the CSS-px screen box to NDC (y flipped). node-tested against worldToScreen.
function worldToClip(wx, wy, cam, cssW, cssH) {
  const sx = (wx - cam.x) * cam.zoom, sy = (wy - cam.y) * cam.zoom; // screen px (top-left origin)
  return { x: (sx / cssW) * 2 - 1, y: 1 - (sy / cssH) * 2 };
}
const TEX_VS = `#version 300 es
in vec2 a_quad; uniform vec4 u_rect; uniform vec4 u_uv; uniform vec3 u_cam; uniform vec2 u_vp; out vec2 v_uv;
void main(){ vec2 w = u_rect.xy + a_quad * u_rect.zw; vec2 s = (w - u_cam.xy) * u_cam.z; vec2 clip = vec2((s.x/u_vp.x)*2.0-1.0, 1.0-(s.y/u_vp.y)*2.0); v_uv = u_uv.xy + a_quad * u_uv.zw; gl_Position = vec4(clip,0.0,1.0); }`;
const TEX_FS = `#version 300 es
precision mediump float; in vec2 v_uv; uniform sampler2D u_tex; uniform float u_alpha; out vec4 o;
void main(){ vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb, c.a*u_alpha); }`;
// EXPERIMENTAL WebGL hybrid backend (Task 8) behind the renderer seam. GPU-renders IMAGES as textured quads (the
// heaviest, cleanest GPU win); EVERY other element type — and ANY GL failure — delegates to the existing Canvas2D
// painters on a transparent overlay layered over the GL canvas. So an imperfect/failed GPU path degrades to correct
// 2D rendering. DEFAULT OFF (RENDERER_BACKEND); the seam is the shipping path. Promote to default only after live
// verification (shaders/DPR/compositing need a real GPU). Next iteration: tessellate rough.js shapes onto the GL layer.
class WebGLRenderer {
  constructor(view) { this.view = view; this.kind = 'webgl'; this.ctx = null; this.gl = null; this._init = false; this._tex = new Map(); }
  _ensureGL() {
    if (this._init) return this.gl;
    this._init = true;
    try {
      const sc = this.view.staticCv; if (!sc || !sc.parentElement) return null;
      const cv = document.createElement('canvas'); cv.className = 'pxc-gl'; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
      sc.parentElement.insertBefore(cv, sc); // GL layer BEHIND the 2D overlay (which carries shapes/text/cards)
      const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: false }); if (!gl) return null;
      this.glCv = cv; this.gl = gl;
      const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[Plexus GL]', gl.getShaderInfoLog(s)); return null; } return s; };
      const vs = compile(gl.VERTEX_SHADER, TEX_VS), fs = compile(gl.FRAGMENT_SHADER, TEX_FS); if (!vs || !fs) { this.gl = null; return null; }
      const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.gl = null; return null; }
      this.prog = p; this.loc = { quad: gl.getAttribLocation(p, 'a_quad'), rect: gl.getUniformLocation(p, 'u_rect'), uv: gl.getUniformLocation(p, 'u_uv'), cam: gl.getUniformLocation(p, 'u_cam'), vp: gl.getUniformLocation(p, 'u_vp'), tex: gl.getUniformLocation(p, 'u_tex'), alpha: gl.getUniformLocation(p, 'u_alpha') };
      this.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return gl;
    } catch (_e) { this.gl = null; return null; }
  }
  begin(sctx, camera, dpr, pad) {
    this.ctx = sctx; this.camera = camera; this.dpr = dpr; this._images = []; const P = pad || 0; // P is 0 in WebGL mode (the GL canvas + staticCv stay viewport-sized — compositor pan is canvas2d-only)
    sctx.setTransform(camera.zoom * dpr, 0, 0, camera.zoom * dpr, (-camera.x * camera.zoom + P) * dpr, (-camera.y * camera.zoom + P) * dpr);
    const gl = this._ensureGL(); if (!gl) return;
    const W = this.view.staticCv.width, H = this.view.staticCv.height;
    if (this.glCv.width !== W || this.glCv.height !== H) { this.glCv.width = W; this.glCv.height = H; }
    gl.viewport(0, 0, W, H);
    const dark = !!(this.view.plugin._settings && this.view.plugin._settings.darkMode);
    const bg = dark ? [0.059, 0.067, 0.09] : hexToRgb01((this.view.scene.appState && this.view.scene.appState.viewBackgroundColor) || '#ffffff');
    gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  grid() { this.view._drawGrid(this.ctx); }   // grid + frames + ghosts stay on the 2D overlay (cheap, hand-drawn)
  frame(el) { this.view._drawFrame(this.ctx, el); }
  element(el) {
    const v = this.view, ctx = this.ctx, t = el.type;
    if (this.gl && t === 'image' && !el.angle && !el.isDeleted) { const img = v._imgFor && v._imgFor(el.fileId); if (img && img.complete && img.naturalWidth) { this._images.push({ el, img }); return; } }
    if (t === 'image') v._drawImage(ctx, el); else if (t === 'record') v._drawRecordCard(ctx, el); else if (t === 'linecard') v._drawLineCard(ctx, el); else if (t === 'query') v._drawQueryNode(ctx, el); else if (t === 'rollup') v._drawRollupNode(ctx, el); else if (t === 'table') v._drawTableNode(ctx, el); else if (t === 'board') v._drawBoardCard(ctx, el); else if (t === 'task') v._drawTaskNode(ctx, el); else drawElement(ctx, el);
  }
  ghosts() { this.view._drawGhosts(this.ctx); }
  end() {
    const gl = this.gl; if (!gl || !this._images.length) return;
    try {
      gl.useProgram(this.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf); gl.enableVertexAttribArray(this.loc.quad); gl.vertexAttribPointer(this.loc.quad, 2, gl.FLOAT, false, 0, 0);
      gl.uniform3f(this.loc.cam, this.camera.x, this.camera.y, this.camera.zoom);
      gl.uniform2f(this.loc.vp, this.view.cssW, this.view.cssH); gl.uniform1i(this.loc.tex, 0); // vp in CSS px (DPR handled by gl.viewport)
      // SCALE Phase 4: cap NEW texture uploads per frame — panning into a dense image region won't upload hundreds of
      // textures in one frame (a hitch); the overflow renders next frame (progressive). Cached textures always draw.
      let newTex = 0, deferred = false; const BUDGET = 24;
      for (const { el, img } of this._images) {
        const cached = this._tex.has(el.fileId);
        if (!cached && newTex >= BUDGET) { deferred = true; continue; }
        const tex = this._texFor(gl, el.fileId, img); if (!tex) continue;
        if (!cached) newTex++;
        const x = Math.min(el.x, el.x + el.width), y = Math.min(el.y, el.y + el.height), w = Math.abs(el.width), h = Math.abs(el.height);
        gl.uniform4f(this.loc.rect, x, y, w, h);
        const c = el.crop, uv = (c && img.naturalWidth) ? [c.x / img.naturalWidth, c.y / img.naturalHeight, c.w / img.naturalWidth, c.h / img.naturalHeight] : [0, 0, 1, 1];
        gl.uniform4f(this.loc.uv, uv[0], uv[1], uv[2], uv[3]); gl.uniform1f(this.loc.alpha, el.opacity == null ? 1 : el.opacity);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (deferred) { try { this.view.dirty = true; } catch (_e) {} } // upload the remaining textures over the next frame(s)
    } catch (_e) {}
  }
  _texFor(gl, fileId, img) {
    let t = this._tex.get(fileId); if (t) { this._tex.delete(fileId); this._tex.set(fileId, t); return t; } // LRU touch (Map insertion order = recency)
    try {
      t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this._tex.set(fileId, t);
      // SCALE Phase 4: bound VRAM — evict the least-recently-used textures (gl.deleteTexture) so the cache can't grow with
      // every image ever rendered (a leak at 10k+ images). Capped to the decode cache size; an evicted-but-visible texture
      // simply re-uploads next frame from the still-cached <img>.
      const cap = Math.max(32, (this.view && this.view.plugin && this.view.plugin._settings && this.view.plugin._settings.imageCacheMax) || 120);
      while (this._tex.size > cap) { const k = this._tex.keys().next().value; const old = this._tex.get(k); this._tex.delete(k); try { gl.deleteTexture(old); } catch (_e) {} }
      return t;
    } catch (_e) { return null; }
  }
  dispose() { try { if (this.glCv && this.glCv.parentElement) this.glCv.parentElement.removeChild(this.glCv); } catch (_e) {} this.gl = null; this._tex.clear(); }
}
function makeRenderer(view) { return RENDERER_BACKEND === 'webgl' ? new WebGLRenderer(view) : new Canvas2DRenderer(view); }

/* ──────────────────────────────── canvas view ──────────────────────────────── */
class CanvasView {
  constructor(plugin, panel, recordGuid, opts) {
    this.plugin = plugin; this.panel = panel; this.recordGuid = recordGuid; this.hostGuid = recordGuid; // hostGuid = navigation identity (flip-back); recordGuid/rec become the BACKING drawing after _resolveBackingDrawing
    this.host = panel.getElement(); this.rec = null; this._sceneLine = null;
    this._blank = !!(opts && opts.blank); // flipped-from-note: start with an empty canvas
    this.scene = newScene(this._blank); this.camera = new Camera();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.dirty = true; this.destroyed = false; this._saveTimer = null; this._localDisposers = [];
    this.tool = 'select'; this.selected = new Set();
    this.strokeColor = '#7c5cff'; this.fillColor = FILLS['#7c5cff']; this.fillStyle = 'hachure';
    this._undo = []; this._redo = []; this._committed = undefined; // snapshot history
    this._lineRects = new Map(); // CONNECTIONS Phase 4: cardId → [{lineGuid, dy, h}] body-line bands (relative to card top, captured each raster) — line-level connection targeting
    this._connLineTargets = new Map(); this._connRegionTargets = new Map(); this._connRefTargets = new Map(); this._connGroupTargets = []; this._connByEl = new Map(); // cardId → Set(lineGuid) / imgId → [{frac,fracPoly}] / textId → Set(refGuidTarget) / elId → Set(arrowId) — CURRENT connection targets (blue flag + region/ref highlight) + per-element connection index (select→highlight, Phase 5); rebuilt in _updateBindings
    this.renderer = makeRenderer(this); // pluggable draw backend (renderer seam — Canvas2D now, WebGL drop-in later)
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
    wrap.__pxcView = this; // DEBUG/VERIFY: a DOM-discoverable handle on the rendered view, so test.dump/automate can reach the LIVE view even when a hot-reload leak leaves the plugin's _views empty (the rendered view belongs to a prior instance)
    this._resize();
    const ro = new ResizeObserver(() => { this._resize(); this.dirty = true; });
    ro.observe(this.host.closest('.panel-scroller-y') || wrap); this._localDisposers.push(() => ro.disconnect());
    // UX-6: re-render when the Thymer theme switches (light↔dark) so the canvas + ink adapt immediately. Invalidate
    // the dark-luminance cache + the blit cache so the static layer redraws with adapted colours, then mark dirty.
    const themeObs = new MutationObserver(() => { const prev = this._darkCache; this._darkCacheT = 0; if (this._themeDark() !== prev) { this._cacheValid = false; this.dirty = true; this._dragLayerValid = false; } }); // only rebuild on an ACTUAL light↔dark flip, not every documentElement mutation (and un-freeze the drag static layer)
    try { themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] }); } catch (_e) {}
    this._localDisposers.push(() => themeObs.disconnect());
    this._wirePointer(); this.loadOrInit();
  }
  _buildToolbar() {
    const cfg = this._toolbarCfg || (this._toolbarCfg = loadToolbarConfig());
    if (this._toolbarDisposers) for (const d of this._toolbarDisposers.splice(0)) { try { d(); } catch (_e) {} }
    this._toolbarDisposers = [];
    const bar = document.createElement('div');
    bar.className = 'pxc-toolbar' + (cfg.density === 'compact' ? ' pxc-dense' : '') + (cfg.position === 'left' ? ' pxc-vertical' : '');
    bar.style.setProperty('--pxc-tool-size', (cfg.iconSize || 30) + 'px');
    this._toolBtns = {}; this._swatches = {};
    const palette = (cfg.palette && cfg.palette.length) ? cfg.palette : PALETTE;
    const fillFor = (c) => FILLS[c] || tintColor(c); // custom colours get an auto-tint
    const builders = {
      _shapes: () => {
        const wrap = document.createElement('div'); wrap.className = 'pxc-shape-wrap';
        const btn = document.createElement('button'); btn.className = 'pxc-tool'; btn.title = 'More shapes — triangle, cylinder (database), hexagon, cloud…'; btn.innerHTML = '<span class="ti ti-box"></span>';
        const fly = document.createElement('div'); fly.className = 'pxc-shape-flyout'; fly.style.display = 'none';
        const mkPrev = (sid) => { const cv = document.createElement('canvas'); cv.width = 30; cv.height = 30; cv.style.cssText = 'width:20px;height:20px;display:block'; try { SHAPE_DRAW[sid](cv.getContext('2d'), 4, 5, 22, 20, { stroke: '#cdd3df', strokeWidth: 1.6, roughness: 1 }, 7); } catch (_e) {} return cv; };
        for (const sp of SHAPE_PICKER) { const sb = document.createElement('button'); sb.className = 'pxc-tool'; sb.title = sp.title; sb.appendChild(mkPrev(sp.id)); sb.addEventListener('click', (e) => { e.stopPropagation(); this._userToolSwitch(sp.id); fly.style.display = 'none'; this.iCv.focus(); }); fly.appendChild(sb); }
        btn.addEventListener('click', (e) => { e.stopPropagation(); fly.style.display = fly.style.display === 'none' ? 'flex' : 'none'; });
        const closeFly = (ev) => { if (fly.style.display !== 'none' && !wrap.contains(ev.target)) fly.style.display = 'none'; };
        document.addEventListener('pointerdown', closeFly); this._toolbarDisposers.push(() => document.removeEventListener('pointerdown', closeFly));
        wrap.appendChild(btn); wrap.appendChild(fly); this._toolBtns['_shapes'] = btn; return wrap;
      },
      _icons: () => { const b = document.createElement('button'); b.className = 'pxc-tool'; b.title = 'Icons — drop a symbol on the board'; b.innerHTML = '<span class="ti ti-mood-happy"></span>'; b.addEventListener('click', () => this.plugin._openIconGlyphLibrary()); return b; },
      _color: () => {
        const wrap = document.createElement('div'); wrap.className = 'pxc-shape-wrap';
        const btn = document.createElement('button'); btn.className = 'pxc-tool pxc-colorbtn'; btn.title = 'Colour';
        const dot = document.createElement('span'); dot.className = 'pxc-color-dot'; dot.style.background = this.strokeColor; btn.appendChild(dot); this._colorDot = dot;
        const fly = document.createElement('div'); fly.className = 'pxc-shape-flyout pxc-color-flyout'; fly.style.display = 'none';
        const pick = (c) => { this.strokeColor = c; this.fillColor = fillFor(c); let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el) { el.strokeColor = c; el.backgroundColor = fillFor(c); ch = true; } } dot.style.background = c; this._syncToolbar(); this.dirty = true; if (ch) this.scheduleSave(); };
        for (const c of palette) { const s = document.createElement('button'); s.className = 'pxc-swatch'; s.title = c; s.style.background = c; s.addEventListener('click', (e) => { e.stopPropagation(); pick(c); fly.style.display = 'none'; }); fly.appendChild(s); this._swatches[c] = s; }
        btn.addEventListener('click', (e) => { e.stopPropagation(); fly.style.display = fly.style.display === 'none' ? 'grid' : 'none'; });
        const closeCol = (ev) => { if (fly.style.display !== 'none' && !wrap.contains(ev.target)) fly.style.display = 'none'; };
        document.addEventListener('pointerdown', closeCol); this._toolbarDisposers.push(() => document.removeEventListener('pointerdown', closeCol));
        wrap.appendChild(btn); wrap.appendChild(fly); return wrap;
      },
      _note: () => { const b = document.createElement('button'); b.className = 'pxc-tool pxc-flipnote'; b.title = 'Flip to the note (open this record’s text)'; b.innerHTML = '<span class="ti ti-arrow-back-up"></span><span class="pxc-flip-lab">Note</span>'; b.addEventListener('click', () => this._flipToNote()); return b; },
      _cite: () => { const b = document.createElement('button'); b.className = 'pxc-tool pxc-flipnote'; b.title = 'Copy the selected image as a block reference, to paste into a note'; b.innerHTML = '<span class="ti ti-link"></span><span class="pxc-flip-lab">Cite</span>'; b.addEventListener('click', () => this._copyImageRefToClip()); return b; },
      _settings: () => { const b = document.createElement('button'); b.className = 'pxc-tool'; b.title = 'Customize toolbar (tools, colours, layout)'; b.innerHTML = '<span class="ti ti-settings"></span>'; b.addEventListener('click', () => this.plugin._openToolbarSettings()); return b; },
    };
    for (const id of cfg.order) {
      if (cfg.hidden[id]) continue;
      const t = TOOLS.find((x) => x.id === id);
      let node = null;
      if (t) { const b = document.createElement('button'); b.className = 'pxc-tool'; b.title = t.title; b.innerHTML = '<span class="ti ' + t.icon + '"></span>'; b.addEventListener('click', () => { this._userToolSwitch(t.id); this.iCv.focus(); }); this._toolBtns[t.id] = b; node = b; }
      else if (builders[id]) node = builders[id]();
      if (node) bar.appendChild(node);
    }
    if (!bar.children.length) bar.style.display = 'none'; // everything hidden → no empty pill (gear stays in the command palette)
    this._toolbarEl = bar;
    setTimeout(() => this._syncToolbar(), 0); return bar;
  }
  // Rebuild the toolbar in place from the (possibly just-edited) config — used by the customization page for live preview.
  _rebuildToolbar() {
    if (!this.wrap) return;
    this._toolbarCfg = loadToolbarConfig();
    const fresh = this._buildToolbar();
    const old = this.wrap.querySelector(':scope > .pxc-toolbar');
    if (old) this.wrap.replaceChild(fresh, old); else this.wrap.insertBefore(fresh, this.wrap.children[2] || null);
  }
  // Flip back to the plain note. UX-3: open IN PLACE (navigate THIS panel to the note editor), not a side panel.
  async _flipToNote() {
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    const noteGuid = this.hostGuid || this.recordGuid; // flip back to the HOST note, not the backing drawing
    try { await this.panel.navigateTo({ type: 'edit_panel', rootId: noteGuid, workspaceGuid: ws }); return; } catch (_e) {}
    // Fallback: if in-place nav fails, open in a side panel.
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) { try { panel = await this.plugin.ui.createPanel(); } catch (_e) {} }
    if (panel) { try { panel.navigateTo({ type: 'edit_panel', rootId: noteGuid, workspaceGuid: ws }); } catch (e) { console.error('[Plexus] flipToNote', e); } }
  }
  // A USER-initiated tool switch (toolbar/flyout click) — disarms any pending void-drop link state so a later stroke/lasso isn't
  // hijacked (mirrors the keyboard tool-switch guard). NOT called by _armRegionDraw (which sets this.tool directly), so arming a
  // region-draw never self-cancels.
  _userToolSwitch(id) { this._pendingRegionDraw = null; this._pendingGroupLink = null; this._pendingRegionLink = null; this._pendingSourceRegion = null; try { this._closeRegionChoice(); } catch (_e) {} this.tool = id; this._syncToolbar(); }
  _syncToolbar() {
    const shapeActive = Object.prototype.hasOwnProperty.call(SHAPE_DRAW, this.tool); // a flyout shape is selected
    if (this._toolBtns) for (const id in this._toolBtns) this._toolBtns[id].classList.toggle('active', id === '_shapes' ? shapeActive : id === this.tool);
    if (this._swatches) for (const c in this._swatches) this._swatches[c].classList.toggle('active', c === this.strokeColor);
    if (this._colorDot) this._colorDot.style.background = this.strokeColor; // colour-submenu button face tracks the active stroke
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
    const w = this.wrap.clientWidth || this.host.clientWidth || 600, d = this.dpr;
    // COMPOSITOR PAN: staticCv is OVERSIZED by a render-pad P on each side and positioned at (-P,-P), so a pan can be done by
    // CSS-translating this pre-rendered layer (GPU compositor, O(1)) and only re-raster when the pan exceeds the pad. P=0 in
    // WebGL mode (the GL canvas is viewport-sized). iCv stays viewport-sized — it carries pointer events + the overlay/handles.
    const P = (RENDERER_BACKEND === 'webgl') ? 0 : Math.max(300, Math.min(800, Math.round(Math.min(w, h) * 0.75)));
    this._renderPad = P;
    this.iCv.width = Math.round(w * d); this.iCv.height = Math.round(h * d); this.iCv.style.width = w + 'px'; this.iCv.style.height = h + 'px';
    this.staticCv.width = Math.round((w + 2 * P) * d); this.staticCv.height = Math.round((h + 2 * P) * d);
    this.staticCv.style.width = (w + 2 * P) + 'px'; this.staticCv.style.height = (h + 2 * P) + 'px';
    this.staticCv.style.left = (-P) + 'px'; this.staticCv.style.top = (-P) + 'px'; this.staticCv.style.right = 'auto'; this.staticCv.style.bottom = 'auto'; this.staticCv.style.transform = '';
    this.cssW = w; this.cssH = h; this._staticRasterCam = null; this._dragLayerValid = false; // force a fresh raster at the new size
  }
  _schedulePanEnd() { if (this._panEndT) clearTimeout(this._panEndT); this._panEndT = setTimeout(() => { this._panEndT = null; if (!this.destroyed) { this._panMode = false; this.dirty = true; } }, 150); } // wheel/trackpad pan has no pointerup → after 150ms idle, drop compositor mode so the next render re-rasters the oversized layer crisp at the final camera
  _byId(id) { return this.scene.elements.find((e) => e.id === id && !e.isDeleted); }
  _singleSel() { if (this.selected.size !== 1) return null; return this._byId([...this.selected][0]); }
  // Lazily (re)build the spatial index + an id→array-index map (for z-order) + a cached scene-bounds. Invalidated
  // on every committed edit (scheduleSave/_restore/load), so a query never sees stale geometry → no ghost hits.
  _ensureGrid() {
    // Rebuild on the dirty flag OR any element-count change (catches scene replacement / adds / removes that somehow
    // didn't flip the flag — the render cull reads this, so a stale grid silently hides content).
    if (this._grid && !this._gridDirty && this._gridLen === this.scene.elements.length) return this._grid;
    const g = new SpatialGrid(256), zi = new Map(), els = this.scene.elements;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    // SECTIONS collapse: a child of a COLLAPSED section is hidden by being SKIPPED from the grid — the single choke point
    // every render + hit-test path flows through. Self-healing: an element whose owning section is gone/expanded is un-hidden.
    let collapsedFrames = null; for (let j = 0; j < els.length; j++) { const f = els[j]; if (!f.isDeleted && f.type === 'frame' && f.collapsed) (collapsedFrames || (collapsedFrames = new Set())).add(f.id); }
    for (let i = 0; i < els.length; i++) {
      const el = els[i]; zi.set(el.id, i); if (el.isDeleted) continue;
      if (el.secHidden) { if (collapsedFrames && collapsedFrames.has(el.secHidden)) continue; delete el.secHidden; } // hidden child → skip; orphan → un-hide
      let bb = this._elBBox(el); if (!bb || !isFinite(bb.x)) continue;
      if (el.angle) bb = rotatedAABB(bb, el.angle); // index the rotated footprint so rotated shapes stay hittable
      g.insert(el, bb);
      if (bb.x < bx0) bx0 = bb.x; if (bb.y < by0) by0 = bb.y; if (bb.x + bb.w > bx1) bx1 = bb.x + bb.w; if (bb.y + bb.h > by1) by1 = bb.y + bb.h;
    }
    this._grid = g; this._zIndex = zi; this._gridDirty = false; this._gridLen = els.length;
    this._sceneBoundsCache = isFinite(bx0) ? { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 } : null;
    return g;
  }
  // Candidate elements overlapping a world rect, TOP-first (z-order desc) — for "topmost element" hit-tests.
  _gridTopFirst(rx, ry, rw, rh) { const g = this._ensureGrid(), zi = this._zIndex, cand = g.query(rx, ry, rw, rh); cand.sort((a, b) => (zi.get(b.id) || 0) - (zi.get(a.id) || 0)); return cand; }
  _sceneBounds() { this._ensureGrid(); return this._sceneBoundsCache; }
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
  _fitToScene() { const b = this._sceneBounds(); if (!b) return; this._fitToBounds(b, 60); }
  /* ── Cross-reference navigate-and-flash (note ⇄ canvas) ──────────────────────────────────
   * A note line that cites a region/element flashes that exact spot here; a cited element
   * double-clicks back to the citing note. Index lives in localStorage (plexus_xref). */
  _rrect(ctx, x, y, w, h, r) { if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; } ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  _elBBox(el) {
    if (!el) return null;
    const w = el.width, h = el.height;
    if ((w == null || h == null) && el.points && el.points.length) { let a = Infinity, b = Infinity, c = -Infinity, dd = -Infinity; for (const p of el.points) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); dd = Math.max(dd, p[1]); } if (isFinite(a)) return { x: a, y: b, w: c - a, h: dd - b }; }
    const x = Math.min(el.x, el.x + (w || 0)), y = Math.min(el.y, el.y + (h || 0));
    return { x, y, w: Math.abs(w || 0), h: Math.abs(h || 0) };
  }
  /* ── In-image region anchoring ─────────────────────────────────────────────────────────────
   * A region reference is stored as a FRACTION of the image element's display bbox, so it tracks
   * the image when it moves/resizes/reframes (the world rect is recomputed live every draw).
   * el.crop only changes the SOURCE rect in _drawImage; the dest is always the element bbox, so
   * the fraction is crop-independent. Rotation (el.angle) rotates the region quad about the center. */
  _imgRegionFrac(el, rect) {
    const b = this._elBBox(el); if (!b || !(b.w > 0) || !(b.h > 0)) return null;
    let rx = (rect.x - b.x) / b.w, ry = (rect.y - b.y) / b.h, rw = rect.w / b.w, rh = rect.h / b.h;
    rx = Math.max(0, Math.min(1, rx)); ry = Math.max(0, Math.min(1, ry));
    rw = Math.max(0.01, Math.min(1 - rx, rw)); rh = Math.max(0.01, Math.min(1 - ry, rh));
    return { rx, ry, rw, rh };
  }
  _imgRegionWorld(el, frac) {
    const b = this._elBBox(el); if (!b || !frac) return null;
    return { x: b.x + frac.rx * b.w, y: b.y + frac.ry * b.h, w: frac.rw * b.w, h: frac.rh * b.h };
  }
  // 4 world corners of the region (rotated by el.angle about the element centre — matches _drawImage's rotation).
  _imgRegionQuad(el, frac) {
    const r = this._imgRegionWorld(el, frac); if (!r) return null;
    const b = this._elBBox(el), cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = el.angle || 0;
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    if (!a) return pts.map(([px, py]) => ({ x: px, y: py }));
    const ca = Math.cos(a), sa = Math.sin(a);
    return pts.map(([px, py]) => { const dx = px - cx, dy = py - cy; return { x: cx + dx * ca - dy * sa, y: cy + dx * sa + dy * ca }; });
  }
  // Map a fraction-polygon [{fx,fy}…] to live world points (rotation-aware) — the freehand region shape.
  _imgRegionPolyWorld(el, fracPoly) {
    const b = this._elBBox(el); if (!b || !fracPoly || !fracPoly.length) return null;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = el.angle || 0, ca = Math.cos(a), sa = Math.sin(a);
    return fracPoly.map((p) => { let x = b.x + p.fx * b.w, y = b.y + p.fy * b.h; if (a) { const dx = x - cx, dy = y - cy; x = cx + dx * ca - dy * sa; y = cy + dx * sa + dy * ca; } return { x, y }; });
  }
  // The region's world outline — the freehand polygon if present, else the rectangle quad.
  _regionShapeWorld(el, frac, fracPoly) { return (fracPoly && fracPoly.length >= 3) ? this._imgRegionPolyWorld(el, fracPoly) : this._imgRegionQuad(el, frac); }
  // ── CONNECTIONS Phase 4: line-level (record-card body line) + image-region connection sub-targets ──
  // World rect of one body line of a record card. dy is RELATIVE to the card top (captured each raster) so a MOVE tracks
  // without a re-raster; null when the card hasn't rastered or the line scrolled out of the captured window.
  _lineRectWorld(el, lineGuid) {
    if (!el || el.type !== 'record' || !lineGuid || el.angle) return null; // rotated card → degrade to whole-card binding (axis-aligned band would misplace the endpoint/flag); whole-card path is rotation-naive but correct
    const bands = this._lineRects.get(el.id); if (!bands) return null;
    const b = bands.find((z) => z.lineGuid === lineGuid); if (!b) return null;
    return { x: el.x, y: el.y + b.dy, w: el.width, h: b.h };
  }
  // Which body line (lineGuid) of a record card is under a world point — null over the title / below the last row / outside /
  // on a rotated card (degrade to whole-card binding so the endpoint + flag stay consistent with _lineRectWorld).
  _lineGuidAtCard(el, wx, wy) {
    if (!el || el.type !== 'record' || el.angle) return null;
    const bands = this._lineRects.get(el.id); if (!bands || !bands.length) return null;
    if (wx < el.x || wx > el.x + el.width) return null;
    for (const b of bands) if (wy >= el.y + b.dy && wy <= el.y + b.dy + b.h) return b.lineGuid;
    return null;
  }
  // CONNECTIONS round-5 A: world rect of the INLINE REF run of a text box that targets `targetGuid` (a record guid or a
  // lineGuid) — routes a connection endpoint to a SPECIFIC inline link of a text note + draws its flag. Null on a rotated
  // text box (degrade to whole-box binding, same as _lineRectWorld), or when the ref is no longer present.
  _refRunRectWorld(el, targetGuid) {
    if (!el || el.type !== 'text' || !targetGuid || el.angle || !el.runs || !el.runs.length) return null;
    let layout = _pxcRunLayout.get(el); if (!layout) layout = measureRuns(el);
    const fs = el.fontSize || 24, lh = fs * 1.25;
    for (const p of layout) { const r = p.run; if (r && r.t === 'ref' && (r.guid === targetGuid || r.lineGuid === targetGuid)) return { x: el.x + p.x, y: el.y + p.line * lh, w: p.w, h: lh }; }
    return null;
  }
  // The pseudo-shape bindPoint should route an endpoint to: a specific body line, an inline ref run, a marked image region, else the whole element.
  _bindTargetShape(binding, el) {
    if (binding && binding.group) { const gb = this._groupUnionWorld(binding.group); if (gb) return { x: gb.x, y: gb.y, width: gb.w, height: gb.h }; } // round-5 B: a GROUP target → the live union bbox of members + image regions (el is irrelevant/absent for a group binding)
    if (binding && binding.lineGuid && el && el.type === 'record') { const lr = this._lineRectWorld(el, binding.lineGuid); if (lr) return { x: lr.x, y: lr.y, width: lr.w, height: lr.h }; }
    if (binding && binding.refGuidTarget && el && el.type === 'text') { const rr = this._refRunRectWorld(el, binding.refGuidTarget); if (rr) return { x: rr.x, y: rr.y, width: rr.w, height: rr.h }; } // round-5 A: route to a SPECIFIC inline ref run of a text note
    if (binding && binding.frac && el && (el.type === 'image' || isRoughShape(el.type))) { const rw = this._imgRegionWorld(el, binding.frac); if (rw) return { x: rw.x, y: rw.y, width: rw.w, height: rw.h }; } // F2: a region of an image OR a rough shape
    return el;
  }
  // The currently-marked region on THIS image (crop/lasso → _pendingImgRegion), to attach as a connection sub-target.
  _regionAt(img) { const p = this._pendingImgRegion; return (img && p && p.imgId === img.id && p.frac) ? { frac: p.frac, fracPoly: p.fracPoly } : null; }
  // Build a binding {elementId, lineGuid?/frac?/fracPoly?} for a release point over a target element.
  _bindingFor(s, wx, wy) {
    const b = { elementId: s.id };
    if (s.type === 'record') { const lg = this._lineGuidAtCard(s, wx, wy); if (lg) b.lineGuid = lg; }
    else if (s.type === 'image') { const r = this._regionAt(s); if (r) { b.frac = r.frac; if (r.fracPoly) b.fracPoly = r.fracPoly; } }
    else if (s.type === 'text' && s.runs && s.runs.length) { const run = hitInlineRef(s, wx, wy); const g = run && (run.kind === 'line' ? (run.lineGuid || run.guid) : (run.guid || run.lineGuid)); if (g) { b.refGuidTarget = g; b.refKindTarget = run.kind; } } // round-5 A: dropped ON a specific inline ref → bind to its target. KIND-AWARE: a line ref carries BOTH run.guid (the record) AND run.lineGuid — key by the LINE so the LINE gets the ↗, matching the record-card line path
    return b;
  }
  _ptInBBox(el, x, y) { const b = this._elBBox(el); return !!(b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h); } // F2: is a world point inside an element's bbox (region-mark target test)
  // C3 (round 3): the two-button WHOLE-vs-REGION prompt shown at the drop point. "Whole" disarms the pending region-link
  // (the whole-element binding stays); "Pick a region" keeps it armed so the next drag on the element marks the sub-region.
  _showRegionChoice(what, sx, sy) {
    this._closeRegionChoice();
    const box = document.createElement('div'); box.className = 'pxc-region-choice'; this._regionChoiceEl = box;
    const lab = document.createElement('div'); lab.className = 'pxc-rc-label'; lab.textContent = 'Link to…'; box.appendChild(lab);
    const mk = (txt, fn) => { const b = document.createElement('button'); b.className = 'pxc-rc-btn'; b.textContent = txt; b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); box.appendChild(b); };
    mk('Whole ' + what, () => { this._pendingRegionLink = null; this._closeRegionChoice(); this.dirty = true; });
    mk('Pick a region', () => { this._closeRegionChoice(); try { this.plugin.ui.addToaster({ title: 'Drag a box on the ' + what + ' to mark the region.', dismissible: true }); } catch (_e) {} this.dirty = true; }); // _pendingRegionLink stays armed → next drag on the element marks
    this.wrap.appendChild(box);
    const ww = this.wrap.clientWidth || 800, wh = this.wrap.clientHeight || 600, bw = box.offsetWidth || 150, bh = box.offsetHeight || 78;
    box.style.left = Math.max(4, Math.min(ww - bw - 4, sx + 10)) + 'px';
    box.style.top = Math.max(4, Math.min(wh - bh - 4, sy - bh / 2)) + 'px';
  }
  _closeRegionChoice() { if (this._regionChoiceEl) { try { this._regionChoiceEl.remove(); } catch (_e) {} this._regionChoiceEl = null; } }
  // round-5 D: an arrow dropped in the VOID → choose how to link its end. Pen/Lasso draw a precise REGION (over an image →
  // tracks it; empty space → a fixed world area); the third button keeps the existing element-group lasso. Clone of _showRegionChoice.
  _showRegionLinkChoice(arrow, key, sx, sy) {
    this._closeRegionChoice();
    const box = document.createElement('div'); box.className = 'pxc-region-choice'; this._regionChoiceEl = box;
    const lab = document.createElement('div'); lab.className = 'pxc-rc-label'; lab.textContent = 'Link this end to…'; box.appendChild(lab);
    const mk = (txt, fn) => { const b = document.createElement('button'); b.className = 'pxc-rc-btn'; b.textContent = txt; b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); box.appendChild(b); };
    mk('✎ Pen a region', () => { this._closeRegionChoice(); this._armRegionDraw(arrow, key, 'pen'); });
    mk('▢ Box a region', () => { this._closeRegionChoice(); this._armRegionDraw(arrow, key, 'lasso'); });
    mk('⬚ Lasso elements (group)', () => { this._closeRegionChoice(); const a = this._byId(arrow.id); if (a && !a.isDeleted) { this._pendingGroupLink = { arrowId: a.id, key }; try { this.plugin.ui.addToaster({ title: 'Lasso a group of elements to connect to.', dismissible: true }); } catch (_e) {} } });
    this.wrap.appendChild(box);
    const ww = this.wrap.clientWidth || 800, wh = this.wrap.clientHeight || 600, bw = box.offsetWidth || 170, bh = box.offsetHeight || 96;
    box.style.left = Math.max(4, Math.min(ww - bw - 4, sx + 10)) + 'px';
    box.style.top = Math.max(4, Math.min(wh - bh - 4, sy - bh / 2)) + 'px';
  }
  // round-5 F: "Connect from a region" — a centered Pen/Box chooser; the chosen tool draws a SOURCE region (arrow=null), then
  // green nubs appear on it and the next nub-drag starts a connection FROM the region.
  _showSourceRegionChoice() {
    this._closeRegionChoice();
    const box = document.createElement('div'); box.className = 'pxc-region-choice'; this._regionChoiceEl = box;
    const lab = document.createElement('div'); lab.className = 'pxc-rc-label'; lab.textContent = 'Draw a SOURCE region…'; box.appendChild(lab);
    const mk = (txt, fn) => { const b = document.createElement('button'); b.className = 'pxc-rc-btn'; b.textContent = txt; b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); box.appendChild(b); };
    mk('✎ Pen a region', () => { this._closeRegionChoice(); this._armRegionDraw(null, 'startBinding', 'pen'); });
    mk('▢ Box a region', () => { this._closeRegionChoice(); this._armRegionDraw(null, 'startBinding', 'lasso'); });
    this.wrap.appendChild(box);
    const ww = this.wrap.clientWidth || 800, wh = this.wrap.clientHeight || 600, bw = box.offsetWidth || 170, bh = box.offsetHeight || 78;
    box.style.left = Math.max(4, (ww - bw) / 2) + 'px';
    box.style.top = Math.max(4, (wh - bh) / 2) + 'px';
  }
  // round-5 D/F: arm a region draw. `arrow` null ⇒ a SOURCE region (you'll drag a connection FROM it); else an end-bind on that arrow.
  _armRegionDraw(arrow, key, mode) {
    const a = arrow ? this._byId(arrow.id) : null;
    if (arrow && (!a || a.isDeleted)) return; // an existing arrow must still be alive
    this._pendingRegionDraw = { arrowId: a ? a.id : null, key, mode };
    this.tool = (mode === 'pen') ? 'pen' : 'lasso'; this._syncToolbar();
    try { this.plugin.ui.addToaster({ title: mode === 'pen' ? 'Draw a region with the pen — over an image to pin it there, anywhere else for a free area.' : 'Drag a loop to mark a region.', dismissible: true }); } catch (_e) {}
    this.dirty = true;
  }
  // round-5 D/F: finish a drawn region. With a pending arrow → bind its endpoint (one-region group). With NO arrow (source) →
  // stash it as `_pendingSourceRegion`; nubs render on it and the next nub-drag starts a connection FROM the region.
  _finishRegionDraw(poly) {
    const prd = this._pendingRegionDraw; this._pendingRegionDraw = null;
    this.tool = 'select'; this._syncToolbar();
    if (!prd) return;
    if (!poly || poly.length < 3) { try { this.plugin.ui.addToaster({ title: 'Region too small — nothing changed.', dismissible: true }); } catch (_e) {} return; }
    const region = this._regionTargetFromPoly(poly, prd.arrowId, prd.key);
    if (!region) { try { this.plugin.ui.addToaster({ title: 'Could not capture the region.', dismissible: true }); } catch (_e) {} return; }
    if (prd.arrowId) {
      const arrow = this._byId(prd.arrowId); if (!arrow || arrow.isDeleted) return;
      arrow[prd.key] = { group: { ids: [], regions: [region] } };
      this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.scheduleSave(); this.dirty = true;
      try { this.plugin.ui.addToaster({ title: region.worldPoly ? 'Connected to a free region.' : 'Connected to an image region.', dismissible: true }); } catch (_e) {}
    } else { // round-5 F: a SOURCE region
      this._pendingSourceRegion = { region, nubs: null }; this.dirty = true;
      try { this.plugin.ui.addToaster({ title: 'Region ready — drag the green dot from it to start a connection.', dismissible: true }); } catch (_e) {}
    }
  }
  // A drawn poly → a region target: image-anchored {elId,frac,fracPoly} when mostly over an image (tracks it), else a fixed
  // absolute {worldPoly}. Self-loop guard: never anchor to the OTHER endpoint's bound element.
  _regionTargetFromPoly(poly, arrowId, key) {
    const arrow = this._byId(arrowId), otherB = arrow && arrow[key === 'endBinding' ? 'startBinding' : 'endBinding'], exImg = otherB && otherB.elementId;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const lb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const reg = this._imageRegionFromLasso(poly, lb, exImg);
    if (reg) return { elId: reg.img.id, frac: reg.frac, fracPoly: reg.fracPoly };
    return { worldPoly: resamplePoly(poly, 24) }; // free-space: a fixed absolute polygon
  }
  // round-5 A: the WHOLE-box-vs-specific-INLINE-REF prompt at the drop point. Lists "Whole box" + one button per inline ref of
  // the targeted text note (deduped by target guid). Picking a ref writes refGuidTarget/refKindTarget into the connection's
  // binding (→ that LINKED record gets the ↗); "Whole box" clears it. Dismiss = a press anywhere else (handled in onDown via
  // the refOnly pending-link). Pre-selects whatever the user dropped on (a check on the matching button).
  _showRefChoice(arrow, textEl, bindKey, sx, sy) {
    this._closeRegionChoice();
    const refs = [], seen = new Set();
    const gOf = (r) => r.kind === 'line' ? (r.lineGuid || r.guid) : (r.guid || r.lineGuid); // KIND-AWARE target guid: a line ref carries BOTH guid (record) + lineGuid — key by the LINE so two refs to different lines of the SAME record stay distinct
    for (const r of (textEl.runs || [])) { if (r && r.t === 'ref') { const g = gOf(r); if (!g || seen.has(g)) continue; seen.add(g); refs.push(r); } }
    if (!refs.length) return;
    const cur = (this._byId(arrow.id) || {})[bindKey] || {}, curG = cur.refGuidTarget || null;
    const box = document.createElement('div'); box.className = 'pxc-region-choice'; this._regionChoiceEl = box;
    const lab = document.createElement('div'); lab.className = 'pxc-rc-label'; lab.textContent = 'Connect to…'; box.appendChild(lab);
    const mk = (txt, on, fn) => { const b = document.createElement('button'); b.className = 'pxc-rc-btn'; if (on) b.classList.add('pxc-rc-on'); b.textContent = txt; b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); }); box.appendChild(b); };
    mk('Whole box', !curG, () => { const a = this._byId(arrow.id); if (a && a[bindKey]) { delete a[bindKey].refGuidTarget; delete a[bindKey].refKindTarget; } this._pendingRegionLink = null; this._closeRegionChoice(); this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.scheduleSave(); this.dirty = true; });
    for (const r of refs) { const g = gOf(r), name = (r.alias || r.label || (r.kind === 'line' ? 'line' : 'record')); mk((r.kind === 'line' ? '⮑ ' : '→ ') + name, curG === g, () => { const a = this._byId(arrow.id); if (a && a[bindKey]) { a[bindKey].refGuidTarget = g; a[bindKey].refKindTarget = r.kind; } this._pendingRegionLink = null; this._closeRegionChoice(); this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.scheduleSave(); this.dirty = true; }); }
    this.wrap.appendChild(box);
    const ww = this.wrap.clientWidth || 800, wh = this.wrap.clientHeight || 600, bw = box.offsetWidth || 160, bh = box.offsetHeight || 96;
    box.style.left = Math.max(4, Math.min(ww - bw - 4, sx + 10)) + 'px';
    box.style.top = Math.max(4, Math.min(wh - bh - 4, sy - bh / 2)) + 'px';
  }
  // C2 (round 3): describe one connection endpoint for the on-canvas info card (mirrors _reindexBackrefs' descEnd).
  _connEndpointDesc(b) {
    if (!b) return { name: 'point' };
    if (b.group) { let n = 0, img = null; for (const id of (b.group.ids || [])) { const ge = this._byId(id); if (ge && !ge.isDeleted) { n++; if (!img && ge.type === 'image' && ge.fileId) img = { fileId: ge.fileId, frac: null }; } } for (const rg of (b.group.regions || [])) { if (rg.worldPoly) { n++; continue; } const ge = this._byId(rg.elId); if (ge && !ge.isDeleted) { n++; if (ge.fileId) img = { fileId: ge.fileId, frac: rg.frac || null }; } } const single = !(b.group.ids || []).length && (b.group.regions || []).length === 1; return { name: single ? 'region' : 'group of ' + n, img }; } // round-5 B/D
    if (!b.elementId) return { name: 'point' };
    const e = this._byId(b.elementId); if (!e || e.isDeleted) return { name: 'gone' };
    const rc = this._recCache;
    if (e.type === 'record') { const rec = rc && rc.get(e.recordGuid); if (b.lineGuid && rec && rec.lines) { const ln = rec.lines.find((l) => l.lineGuid === b.lineGuid); return { name: (ln && ln.text) || 'line' }; } return { name: (rec && rec.title) || 'note' }; }
    if (e.type === 'linecard') { const rec = rc && rc.get(e.recordGuid); return { name: (rec && rec.title) || 'line' }; }
    if (e.type === 'text') { if (b.refGuidTarget && e.runs) { const rr = e.runs.find((r) => r && r.t === 'ref' && (r.guid === b.refGuidTarget || r.lineGuid === b.refGuidTarget)); if (rr) return { name: (rr.alias || rr.label) || 'ref' }; } return { name: (e.text || (e.runs && e.runs.length ? flattenRuns(e.runs) : '')) || 'text' }; } // round-5 A
    if (e.type === 'image') return { name: 'image', img: { fileId: e.fileId, frac: b.frac || null, fracPoly: b.fracPoly || null } };
    return { name: e.type || 'shape' };
  }
  // C2: the active connection for the info card = a hovered connection, else a single-selected one. Build/position a DOM card
  // near its midpoint: <start> <dir glyph> <end> (+ a thumbnail for an image-region endpoint). Direction from the arrowheads.
  _syncConnInfo() {
    let arrow = null;
    if (this.tool === 'select' && !this.editingId && !this._camAnim && !this._present) {
      if (this._connInfoHover) { const a = this._byId(this._connInfoHover); if (a && !a.isDeleted && (a.type === 'arrow' || a.type === 'line')) arrow = a; }
      if (!arrow && this.selected.size === 1) { const a = this._byId(this.selected.values().next().value); if (a && !a.isDeleted && (a.type === 'arrow' || a.type === 'line')) arrow = a; }
    }
    if (!arrow) { if (this._connInfoEl) { try { this._connInfoEl.remove(); } catch (_e) {} this._connInfoEl = null; } this._connInfoId = null; return; }
    if (this._connInfoId !== arrow.id || !this._connInfoEl) { this._buildConnInfo(arrow); this._connInfoId = arrow.id; }
    if (!this._connInfoEl) return;
    const mid = pxcPolyMidpoint(routedPoints(arrow)); if (!mid) return;
    const s = this.camera.worldToScreen(mid.x, mid.y);
    this._connInfoEl.style.left = s.x + 'px'; this._connInfoEl.style.top = (s.y + 16) + 'px';
  }
  _buildConnInfo(arrow) {
    if (this._connInfoEl) { try { this._connInfoEl.remove(); } catch (_e) {} this._connInfoEl = null; }
    const clip = (s) => { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); return s.length > 40 ? s.slice(0, 39) + '…' : (s || ' '); };
    const start = this._connEndpointDesc(arrow.startBinding), end = this._connEndpointDesc(arrow.endBinding);
    const sa = arrow.startArrowhead, ea = arrow.endArrowhead, glyph = (sa && ea) ? '↔' : ea ? '→' : sa ? '←' : '—';
    const card = document.createElement('div'); card.className = 'pxc-conninfo'; this._connInfoEl = card;
    const thumb = (d) => { if (!d || !d.img) return; let u = null; try { u = this.plugin._regionThumb(d.img); } catch (_e) {} if (u) { const im = document.createElement('img'); im.className = 'pxc-ci-thumb'; im.src = u; card.appendChild(im); } };
    thumb(start);
    const f = document.createElement('span'); f.className = 'pxc-ci-from'; f.textContent = clip(start.name); card.appendChild(f);
    const dg = document.createElement('span'); dg.className = 'pxc-ci-dir'; dg.textContent = glyph; card.appendChild(dg);
    const t = document.createElement('span'); t.className = 'pxc-ci-to'; t.textContent = clip(end.name); card.appendChild(t);
    thumb(end);
    this.wrap.appendChild(card);
  }
  // round-5 C: the connection-STYLE popover — shown when a single connection is SELECTED (not merely hovered). Typed
  // relationship presets (color+label) + line style + arrowheads + a manual colour strip. Positioned above the midpoint so it
  // doesn't collide with the (below-midpoint) info card. Rebuilt only when the selected connection changes (_connStyleId).
  _closeConnStyle() { if (this._connStyleEl) { try { this._connStyleEl.remove(); } catch (_e) {} this._connStyleEl = null; } this._connStyleId = null; }
  _syncConnStyle() {
    let arrow = null;
    if (this.tool === 'select' && !this.editingId && !this._camAnim && !this._present && this.selected.size === 1) {
      const a = this._byId(this.selected.values().next().value); if (a && !a.isDeleted && (a.type === 'arrow' || a.type === 'line')) arrow = a;
    }
    if (!arrow) { this._closeConnStyle(); return; }
    if (this._connStyleId !== arrow.id || !this._connStyleEl) { this._buildConnStyle(arrow); this._connStyleId = arrow.id; }
    if (!this._connStyleEl) return;
    const mid = pxcPolyMidpoint(routedPoints(arrow)); if (!mid) return;
    const s = this.camera.worldToScreen(mid.x, mid.y), bh = this._connStyleEl.offsetHeight || 92, ww = this.wrap.clientWidth || 800, bw = this._connStyleEl.offsetWidth || 230;
    this._connStyleEl.style.left = Math.max(4, Math.min(ww - bw - 4, s.x - bw / 2)) + 'px';
    this._connStyleEl.style.top = Math.max(4, s.y - bh - 14) + 'px'; // above the midpoint (info card sits below it)
  }
  _buildConnStyle(arrow) {
    this._closeConnStyle();
    const box = document.createElement('div'); box.className = 'pxc-connstyle'; this._connStyleEl = box;
    box.addEventListener('pointerdown', (e) => e.stopPropagation()); // clicks inside the menu must not deselect/pan/draw
    // Row 1: typed relationship presets (color dot + label).
    const r1 = document.createElement('div'); r1.className = 'pxc-cs-row pxc-cs-rels';
    for (const p of PXC_REL_PRESETS) {
      const b = document.createElement('button'); b.className = 'pxc-cs-rel' + (arrow.relType === p.key ? ' pxc-cs-on' : ''); b.title = p.label;
      const dot = document.createElement('span'); dot.className = 'pxc-cs-dot'; dot.style.background = p.color; b.appendChild(dot);
      b.appendChild(document.createTextNode(p.label));
      b.addEventListener('click', () => this._applyRelPreset(p.key)); r1.appendChild(b);
    }
    box.appendChild(r1);
    // Row 2: line style + arrowheads.
    const r2 = document.createElement('div'); r2.className = 'pxc-cs-row';
    const seg = (cls) => { const g = document.createElement('div'); g.className = 'pxc-cs-seg ' + cls; return g; };
    const mk = (parent, html, on, fn, title) => { const b = document.createElement('button'); b.className = 'pxc-cs-btn' + (on ? ' pxc-cs-on' : ''); b.innerHTML = html; if (title) b.title = title; b.addEventListener('click', fn); parent.appendChild(b); };
    const curLs = arrow.lineStyle || 'solid';
    const sg1 = seg('pxc-cs-ls');
    mk(sg1, '<span class="pxc-cs-line solid"></span>', curLs === 'solid', () => this._setConnLineStyle('solid'), 'Solid');
    mk(sg1, '<span class="pxc-cs-line dashed"></span>', curLs === 'dashed', () => this._setConnLineStyle('dashed'), 'Dashed');
    mk(sg1, '<span class="pxc-cs-line dotted"></span>', curLs === 'dotted', () => this._setConnLineStyle('dotted'), 'Dotted');
    r2.appendChild(sg1);
    const heads = (arrow.startArrowhead && arrow.endArrowhead) ? 'double' : arrow.endArrowhead ? 'single' : (arrow.startArrowhead ? 'single' : 'none');
    const sg2 = seg('pxc-cs-heads');
    mk(sg2, '—', heads === 'none', () => this._setConnHeads('none'), 'No arrowhead');
    mk(sg2, '→', heads === 'single', () => this._setConnHeads('single'), 'Single');
    mk(sg2, '↔', heads === 'double', () => this._setConnHeads('double'), 'Double');
    r2.appendChild(sg2);
    box.appendChild(r2);
    // Row 3: manual colour strip (overrides the preset colour).
    const r3 = document.createElement('div'); r3.className = 'pxc-cs-row pxc-cs-colors';
    for (const c of ['#1e1e1e', '#64748b', '#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7']) {
      const b = document.createElement('button'); b.className = 'pxc-cs-color' + (arrow.strokeColor === c ? ' pxc-cs-on' : ''); b.style.background = c; b.title = c;
      b.addEventListener('click', () => this._setConnColor(c)); r3.appendChild(b);
    }
    box.appendChild(r3);
    this.wrap.appendChild(box);
  }
  // round-4 @ref PREVIEW: a hover popover previewing the record a ref chip points at — its title + first body lines (via the
  // live record cache). Uncached → "Loading…" then a short re-show once the fetch lands. pointer-events:none; never blocks.
  _showRefPreview(t, cx, cy) {
    this._hideRefPreview(); if (!t || !t.guid) return;
    const rec = this._recFor(t.guid); // {title, lines} or null (kicks off the fetch + a repaint)
    const pop = document.createElement('div'); pop.className = 'pxc-refpreview'; this._refPreviewEl = pop;
    const title = document.createElement('div'); title.className = 'pxc-rp-title'; title.textContent = (rec && rec.title) || t.label || 'record'; pop.appendChild(title);
    if (rec && rec.lines && rec.lines.length) { const body = document.createElement('div'); body.className = 'pxc-rp-body'; for (const ln of rec.lines.slice(0, 6)) { const r = document.createElement('div'); r.className = 'pxc-rp-line'; r.style.paddingLeft = ((ln.depth || 0) * 12) + 'px'; r.textContent = '• ' + (ln.text || ''); body.appendChild(r); } pop.appendChild(body); }
    else if (!rec) { const ld = document.createElement('div'); ld.className = 'pxc-rp-line pxc-rp-load'; ld.textContent = 'Loading…'; pop.appendChild(ld); if (this._refPreviewT) clearTimeout(this._refPreviewT); this._refPreviewT = setTimeout(() => { if (this._refHoverKey === (t.kind + ':' + t.guid)) this._showRefPreview(t, cx, cy); }, 350); } // re-show once the record loads
    document.body.appendChild(pop);
    const pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 70, vw = window.innerWidth, vh = window.innerHeight;
    pop.style.left = Math.max(8, Math.min(vw - pw - 8, cx + 14)) + 'px';
    pop.style.top = Math.max(8, Math.min(vh - ph - 8, cy + 16)) + 'px';
  }
  _hideRefPreview() { if (this._refPreviewT) { clearTimeout(this._refPreviewT); this._refPreviewT = null; } if (this._refPreviewEl) { try { this._refPreviewEl.remove(); } catch (_e) {} this._refPreviewEl = null; } }
  _polyBBox(pts) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }
  // Crop/lasso a sub-area of an image → mark it as the pending cite (NO crop copy). A dashed marquee shows it
  // until the user clicks Cite (or Escape). Stored as a fraction so it's robust to the image moving later.
  // `poly` (optional, world coords) = the freehand lasso loop → cited as the exact shape, not just its bbox.
  // 2026-06-21 FIX: derive the image region from the lasso's INTERSECTION with the image — NOT the lasso's full bounding box.
  // The old test `(lassoBbox area) < image*0.92` failed when the lasso also enclosed a far-away element (e.g. a text box): the
  // bbox spanned text→image so it exceeded the image and no region was marked → "captured the text but not the image". Using the
  // intersection (the part of the lasso actually over the image) marks the edge/slice regardless of how far the other element is.
  // Returns { img, rect(intersection), frac, fracPoly } or null (lasso barely touches, or covers ~the whole image → keep whole).
  _imageRegionFromLasso(poly, lb, excludeId) {
    if (!lb || lb.w <= 0 || lb.h <= 0) return null;
    const img = this._topImageIn(lb); if (!img || img.id === excludeId) return null;
    const ib = this._elBBox(img); if (!ib || !(ib.w > 0) || !(ib.h > 0)) return null;
    const ix0 = Math.max(lb.x, ib.x), iy0 = Math.max(lb.y, ib.y), ix1 = Math.min(lb.x + lb.w, ib.x + ib.w), iy1 = Math.min(lb.y + lb.h, ib.y + ib.h);
    if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return null; // lasso barely overlaps the image
    const inter = { x: ix0, y: iy0, w: ix1 - ix0, h: iy1 - iy0 };
    const interArea = inter.w * inter.h, cover = interArea / (ib.w * ib.h);
    if (cover < 0.01 || cover > 0.95) return null; // ~nothing or ~the whole image → keep it as a WHOLE element, not a region
    const frac = this._imgRegionFrac(img, inter); if (!frac) return null;
    // freehand outline ONLY when the lasso is MOSTLY over the image — else (lasso spans far outside, e.g. around a far text box)
    // clamping every poly point into the image distorts the shape, so fall back to a clean rectangular region (the intersection).
    const fracPoly = (poly && poly.length >= 3 && interArea > (lb.w * lb.h) * 0.5) ? resamplePoly(poly, 16).map(([px, py]) => ({ fx: Math.max(0, Math.min(1, (px - ib.x) / ib.w)), fy: Math.max(0, Math.min(1, (py - ib.y) / ib.h)) })) : null;
    return { img, rect: inter, frac, fracPoly };
  }
  _setPendingImgRegion(img, rect, poly, keepSel) {
    const frac = this._imgRegionFrac(img, rect); if (!frac) return false;
    let fracPoly = null;
    if (poly && poly.length >= 3) { const b = this._elBBox(img); fracPoly = resamplePoly(poly, 16).map(([px, py]) => ({ fx: Math.max(0, Math.min(1, (px - b.x) / b.w)), fy: Math.max(0, Math.min(1, (py - b.y) / b.h)) })); }
    this._pendingImgRegion = { imgId: img.id, frac, fracPoly, rect: this._imgRegionWorld(img, frac) };
    if (!keepSel) this.selected.clear();
    this.dirty = true;
    try { this.plugin.ui.addToaster({ title: 'Region marked on the image — click “Cite” to reference it in a note.', dismissible: true }); } catch (_e) {}
    return true;
  }
  // Every content element a lasso loop OVERLAPS (edge-touch counts). Iterates the FULL SCENE — NOT the spatial grid —
  // because the grid is rebuilt lazily and a TEXT element's bbox is measured lazily at render (measureRuns sets width/height
  // WITHOUT flipping _gridDirty), so the grid can hold a STALE/zero bbox → the element silently drops from a grid query.
  // 2026-06-21: "this is a test" (white text) wasn't captured by Cite OR the group-lasso for exactly this reason. A lasso is a
  // one-shot gesture, so the O(n) scan is fine, and we measureRuns() each text first so its bbox is current.
  _elsInLoop(poly, excludeId, skipConnectors) {
    const out = []; if (!poly || poly.length < 3) return out;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (const el of this.scene.elements) {
      if (el.isDeleted || el.secHidden || el.type === 'frame' || el.id === excludeId) continue; // SECTIONS: lasso/marquee skips collapsed-section children (this path scans the full scene, not the grid)
      if (skipConnectors && (el.type === 'arrow' || el.type === 'line')) continue; // group-lasso skips connectors; the lasso SELECT tool keeps them (parity with the old grid path)
      if (el.type === 'text') { try { measureRuns(el); } catch (_e) {} } // ensure width/height are current → correct bbox (was the bug)
      let bb = this._elBBox(el); if (!bb || !isFinite(bb.x)) continue;
      if (el.angle) bb = rotatedAABB(bb, el.angle);
      if (bb.x > x1 || bb.x + bb.w < x0 || bb.y > y1 || bb.y + bb.h < y0) continue; // bbox quick-reject (cheap O(n) filter before the poly tests)
      if (pointInPoly(bb.x + bb.w / 2, bb.y + bb.h / 2, poly) || polyHitsRect(poly, bb)) out.push(el);
    }
    return out;
  }
  // Shared loop → selection logic, used by the LASSO tool AND the pen→Cite path: select every element the loop OVERLAPS,
  // and if the loop covers a sub-area of an image, mark that as a pending region (keeping the shape selection) so a
  // subsequent Cite references the shape(s) AND the region together.
  _selectFromLoop(poly, excludeId) {
    if (!poly || poly.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    for (const el of this._elsInLoop(poly, excludeId, false)) this.selected.add(el.id); // lasso SELECT tool keeps arrows/lines
    const reg = this._imageRegionFromLasso(poly, rect, excludeId); // 2026-06-21: intersection-based (was: full lasso bbox vs 92% image)
    if (reg) {
      this.selected.delete(reg.img.id); this._setPendingImgRegion(reg.img, reg.rect, poly, true);
      // round-5 G: a lasso that marks an image REGION is a CITE intent → restore the selection that was active before the lasso
      // (e.g. a text box across the canvas) so the next Cite combines the region AND that text. Pure select-lassos (no region) skip this.
      if (this._lassoPriorSel) { for (const id of this._lassoPriorSel) { const e = this._byId(id); if (e && !e.isDeleted) this.selected.add(id); } }
    }
    this._lassoPriorSel = null;
    this.dirty = true;
  }
  // ── CONNECTIONS round-5 B: GROUP / REGION connections (an arrow endpoint bound to a SET of elements) ──
  // The live union bbox (world) of a group's members — rotated footprints included, deleted/missing members skipped.
  // The endpoint routes here, so the group target tracks as any member moves/resizes. Null when no member resolves.
  _groupBBoxWorld(ids, lookup) { return this._groupUnionWorld({ ids }, lookup); }
  // Like _groupBBoxWorld but for a full group object — whole-element MEMBERS (ids) PLUS image sub-REGIONS ({elId,frac}).
  _groupUnionWorld(group, lookup) {
    if (!group) return null;
    const get = lookup || ((id) => this._byId(id)); // PERF: the per-frame _updateBindings fixpoint passes the O(1) idMap; _byId is an O(n) scan
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const acc = (bx, by, bw, bh) => { x0 = Math.min(x0, bx); y0 = Math.min(y0, by); x1 = Math.max(x1, bx + bw); y1 = Math.max(y1, by + bh); };
    for (const id of (group.ids || [])) { const el = get(id); if (!el || el.isDeleted) continue; let bb = this._elBBox(el); if (!bb || !isFinite(bb.x)) continue; if (el.angle) bb = rotatedAABB(bb, el.angle); acc(bb.x, bb.y, bb.w, bb.h); }
    for (const rg of (group.regions || [])) {
      if (rg.worldPoly && rg.worldPoly.length) { for (const p of rg.worldPoly) { if (isFinite(p[0])) acc(p[0], p[1], 0, 0); } continue; } // round-5 D: a free-space region → bbox straight from its absolute world points
      const el = get(rg.elId); if (!el || el.isDeleted) continue; const rw = this._imgRegionWorld(el, rg.frac); if (!rw || !isFinite(rw.x)) continue; acc(rw.x, rw.y, rw.w, rw.h);
    }
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
  // World bbox of an absolute polygon [[x,y]…] (round-5 D free-space regions).
  _polyBBox(poly) { if (!poly || !poly.length) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of poly) { if (!isFinite(p[0])) continue; x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }
  // The element ids enclosed by a lasso polygon — PURE (returns ids, no selection/region side effects). Used by the
  // drop-then-lasso group-link flow. Shares the robust full-scene _elsInLoop so it captures the SAME elements as Cite.
  _idsInLoop(poly, excludeId) { return this._elsInLoop(poly, excludeId, true).map((e) => e.id); } // group-lasso skips connectors
  // The union bbox of the CURRENT multi-selection (≥2 content elements) — drives the group-connect nubs. Null otherwise.
  _groupSelBBox() {
    if (this.selected.size < 2) return null;
    const ids = [...this.selected].filter((id) => { const e = this._byId(id); return e && !e.isDeleted && e.type !== 'arrow' && e.type !== 'line'; });
    return ids.length >= 2 ? { ids, bb: this._groupBBoxWorld(ids) } : null;
  }
  // Center the target if it isn't already comfortably on screen (gentle zoom cap), then mark dirty.
  _revealBounds(b) {
    if (!b || !isFinite(b.x)) return;
    const m = 48;
    const tl = this.camera.worldToScreen(b.x, b.y), br = this.camera.worldToScreen(b.x + b.w, b.y + b.h);
    const onScreen = tl.x >= m && tl.y >= m && br.x <= this.cssW - m && br.y <= this.cssH - m;
    const bigEnough = (br.x - tl.x) >= 28 && (br.y - tl.y) >= 28;
    if (onScreen && bigEnough) { this.dirty = true; return; }
    const pad = 90, zw = this.cssW / (Math.max(1, b.w) + pad * 2), zh = this.cssH / (Math.max(1, b.h) + pad * 2);
    this.camera.zoom = Math.min(2.4, Math.max(0.1, Math.min(zw, zh)));
    this.camera.x = b.x + b.w / 2 - (this.cssW / this.camera.zoom) / 2;
    this.camera.y = b.y + b.h / 2 - (this.cssH / this.camera.zoom) / 2;
    this.dirty = true;
  }
  // Reveal + a fast, attention-grabbing double-pulse ring on the referenced element/region.
  // Build the flash item for one anchor: an in-image region (recomputed live from the fraction so it tracks the
  // image's CURRENT geometry — moved/resized/rotated) or a whole-element / region bbox.
  _flashItem(a) {
    const el = a && a.el ? this._byId(a.el) : null;
    if (a && a.inImage && a.frac && el) { const world = this._imgRegionWorld(el, a.frac); if (world && isFinite(world.x)) return { inImage: true, elId: el.id, frac: a.frac, fracPoly: a.fracPoly, bbox: world }; }
    const elB = el ? this._elBBox(el) : null;
    const reg = (a && a.region && isFinite(a.region.x)) ? a.region : null;
    const bbox = (reg && elB) ? ((reg.w * reg.h) < (elB.w * elB.h) * 0.7 ? reg : elB) : (reg || elB);
    return (bbox && isFinite(bbox.x)) ? { bbox } : null;
  }
  // CONNECTIONS Phase 5: extra flash items for a connector (arrow/line) → its two bound endpoints, each spotlit at the
  // EXACT sub-target it cites (a body-line band, an image region, else the whole element). So flying back to a connection
  // frames the WHOLE thing — the arrow AND both ends AND the cited line — not just the arrow's bbox.
  _connFlashExtras(arrow) {
    const out = [];
    for (const b of [arrow.startBinding, arrow.endBinding]) {
      if (b && b.group) { for (const id of (b.group.ids || [])) { const ge = this._byId(id); if (!ge || ge.isDeleted) continue; const gb = this._elBBox(ge); if (gb && isFinite(gb.x)) out.push({ bbox: gb }); } for (const rg of (b.group.regions || [])) { if (rg.worldPoly && rg.worldPoly.length) { const wb = this._polyBBox(rg.worldPoly); if (wb) out.push({ worldPoly: rg.worldPoly, bbox: wb }); continue; } const ge = this._byId(rg.elId); if (!ge || ge.isDeleted) continue; const rw = this._imgRegionWorld(ge, rg.frac); if (rw && isFinite(rw.x)) out.push({ inImage: true, elId: ge.id, frac: rg.frac, fracPoly: rg.fracPoly, bbox: rw }); } continue; } // round-5 B/D: frame EVERY group member + image region + free-space region so flyback shows the whole group
      if (!b || !b.elementId) continue; const t = this._byId(b.elementId); if (!t || t.isDeleted) continue;
      if (b.lineGuid && t.type === 'record') { const lr = this._lineRectWorld(t, b.lineGuid); if (lr) { out.push({ bbox: { x: lr.x, y: lr.y, w: lr.w, h: lr.h } }); continue; } }
      if (b.refGuidTarget && t.type === 'text') { const rr = this._refRunRectWorld(t, b.refGuidTarget); if (rr) { out.push({ bbox: { x: rr.x, y: rr.y, w: rr.w, h: rr.h } }); continue; } } // round-5 A: frame the targeted inline ref run
      if (b.frac && t.type === 'image') { const rw = this._imgRegionWorld(t, b.frac); if (rw && isFinite(rw.x)) { out.push({ inImage: true, elId: t.id, frac: b.frac, fracPoly: b.fracPoly, bbox: rw }); continue; } }
      const bb = this._elBBox(t); if (bb && isFinite(bb.x)) out.push({ bbox: bb });
    }
    return out;
  }
  // Reveal + a fast double-pulse spotlight on the cited target(s). A COMPOSITE cite (anchor.extra) flashes them
  // ALL together — union framing, every region/shape spotlit in one pass.
  _flashAnchor(anchor, opts) {
    const now = () => this._now();
    const items = [];
    const main = this._flashItem(anchor); if (main) items.push(main);
    const el0 = anchor && anchor.el ? this._byId(anchor.el) : null; // resolved ONCE, reused for the connection-extras append + the isConn/estB test below
    const isConn = !!(el0 && (el0.type === 'arrow' || el0.type === 'line')); // a connection backref → also frame + spotlight both bound endpoints (Phase 5)
    if (isConn) for (const it of this._connFlashExtras(el0)) items.push(it);
    if (anchor && anchor.extra && anchor.extra.length) for (const ex of anchor.extra) { const it = this._flashItem(ex); if (it) items.push(it); }
    if (!items.length) {
      if (anchor && anchor.inImage) { try { this.plugin.ui.addToaster({ title: 'Plexus: the source image for this reference was removed.', dismissible: true }); } catch (_e) {} return; }
      let bb = null; try { bb = sceneBounds(this.scene); } catch (_e) {}
      if (bb && isFinite(bb.x)) items.push({ bbox: bb }); else return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of items) { const b = it.bbox; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    const union = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    // connection → fly straight to the union (arrow+ends), no image-style establish-then-zoom-into-region
    const estB = isConn ? null : ((opts && opts.establishImage && el0) ? this._elBBox(el0) : (items.length === 1 && !items[0].inImage && el0 ? this._elBBox(el0) : null));
    const dur = items.some((i) => i.inImage) ? 1200 : 1000;
    // 2026-06-21 FIX ("badge lands far away"): a CITE frames the PRIMARY cited target (the region/first item) — NOT the union with
    // far-apart extras (e.g. a text box across the canvas), which zoomed way out so the region landed tiny in a corner. The extras
    // still pulse (they're in `items`); only the CAMERA lands on the primary. A connection still frames the whole union (arrow+ends).
    const target = (!isConn && main && main.bbox && isFinite(main.bbox.x)) ? main.bbox : union;
    this._revealThenFlash(target, () => { this._flash = { items, start: now(), dur }; this.dirty = true; }, estB);
  }
  _now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }
  // True if b is already comfortably framed on-screen (don't bother animating).
  _isFramed(b) {
    if (!b || !isFinite(b.x)) return true;
    const m = 48, tl = this.camera.worldToScreen(b.x, b.y), br = this.camera.worldToScreen(b.x + b.w, b.y + b.h);
    return (tl.x >= m && tl.y >= m && br.x <= this.cssW - m && br.y <= this.cssH - m) && (br.x - tl.x) >= 28 && (br.y - tl.y) >= 28;
  }
  // The camera that frames bounds b (matches _revealBounds' fit, gentle zoom cap) — returned, not applied.
  _revealTarget(b) {
    const pad = 90, zw = this.cssW / (Math.max(1, b.w) + pad * 2), zh = this.cssH / (Math.max(1, b.h) + pad * 2);
    const zoom = Math.min(2.4, Math.max(0.1, Math.min(zw, zh)));
    return { zoom, x: b.x + b.w / 2 - (this.cssW / zoom) / 2, y: b.y + b.h / 2 - (this.cssH / zoom) / 2 };
  }
  // If b isn't already framed, fly there cinematically (establish → zoom in) then run onArrive (the flash);
  // else flash immediately. The flash recomputes its region from the live element, so it lands true.
  // establishBounds (optional) forces the cinematic fly even if already framed, establishing from those bounds
  // (e.g. the whole source image) before zooming to b — the "always start wide on nav" feel.
  _revealThenFlash(b, onArrive, establishBounds) {
    if (!establishBounds && this._isFramed(b)) { onArrive(); return; }
    this._animateCameraTo(this._revealTarget(b), establishBounds ? 820 : 720, onArrive, establishBounds ? this._revealTarget(establishBounds) : null);
  }
  // Cinematic 2-segment camera tween: current → a wide establishing framing (ease-out), then wide → target
  // (ease-in-out). Zoom interpolated geometrically (log space). Aborts on user input. onArrive fires on landing.
  _animateCameraTo(target, dur, onArrive, forcedWide) {
    const c0 = { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom };
    const curCx = c0.x + (this.cssW / c0.zoom) / 2, curCy = c0.y + (this.cssH / c0.zoom) / 2;
    const tgtCx = target.x + (this.cssW / target.zoom) / 2, tgtCy = target.y + (this.cssH / target.zoom) / 2;
    const hw = (this.cssW / target.zoom) / 2, hh = (this.cssH / target.zoom) / 2;
    const wideBox = { x: Math.min(curCx, tgtCx - hw), y: Math.min(curCy, tgtCy - hh), w: 0, h: 0 };
    wideBox.w = Math.max(curCx, tgtCx + hw) - wideBox.x; wideBox.h = Math.max(curCy, tgtCy + hh) - wideBox.y;
    const wide = forcedWide || this._revealTarget(wideBox);
    this._camAnim = { c0, wide, target, start: this._now(), dur: Math.max(220, dur || 700), onArrive };
    this._fastMove = true; this.dirty = true;
  }
  _lerpCam(p, q, u) {
    const lerp = (a, b) => a + (b - a) * u, gl = (a, b) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u);
    const pcx = p.x + (this.cssW / p.zoom) / 2, pcy = p.y + (this.cssH / p.zoom) / 2;
    const qcx = q.x + (this.cssW / q.zoom) / 2, qcy = q.y + (this.cssH / q.zoom) / 2;
    const z = gl(p.zoom, q.zoom), cx = lerp(pcx, qcx), cy = lerp(pcy, qcy);
    return { zoom: z, x: cx - (this.cssW / z) / 2, y: cy - (this.cssH / z) / 2 };
  }
  _stepCamAnim() {
    const a = this._camAnim; if (!a) return;
    const t = Math.min(1, (this._now() - a.start) / a.dur);
    const easeOut = (u) => 1 - Math.pow(1 - u, 3), easeInOut = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const cam = (t < 0.35) ? this._lerpCam(a.c0, a.wide, easeOut(t / 0.35)) : this._lerpCam(a.wide, a.target, easeInOut((t - 0.35) / 0.65));
    this.camera.x = cam.x; this.camera.y = cam.y; this.camera.zoom = cam.zoom;
    this._fastMove = true; this.dirty = true;
    if (t >= 1) { this._camAnim = null; this._fastMove = false; this._cacheValid = false; this._saveCamera(); const cb = a.onArrive; if (cb) { try { cb(); } catch (_e) {} } } // crisp arrival
  }
  _abortCamAnim() { if (this._camAnim) { this._camAnim = null; this._fastMove = false; this.dirty = true; } }
  // Snapshot the freshly-rendered static layer into the offscreen cache (+ the camera it was drawn at).
  _refreshCache() {
    try {
      if (!this._cacheCv) this._cacheCv = document.createElement('canvas');
      if (this._cacheCv.width !== this.staticCv.width || this._cacheCv.height !== this.staticCv.height) { this._cacheCv.width = this.staticCv.width; this._cacheCv.height = this.staticCv.height; }
      const cctx = this._cacheCv.getContext('2d'); cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.clearRect(0, 0, this._cacheCv.width, this._cacheCv.height); cctx.drawImage(this.staticCv, 0, 0);
      this._cacheCam = { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }; this._cacheValid = true;
      this._scheduleMarginWarm(); // PAN: re-CENTER the margin cache at the new camera (debounced). DON'T invalidate the existing one — a camera settle doesn't change CONTENT, and the old margin stays usable for any nearby camera via _marginCovers(). This is the pan→pause→pan fix: previously this set _marginValid=false, so resuming a pan inside the 200ms re-warm window dropped to the blank-edged viewport cache. Content changes self-heal (they set _cacheValid=false → next full render → _refreshCache → re-warm with fresh content).
    } catch (_e) { this._cacheValid = false; }
  }
  // PAN MARGIN CACHE: render the scene into a SEPARATE, margin-padded canvas (DEBOUNCED — only after the view goes idle, so
  // it never costs a keystroke) so the pan-blit has cached content beyond the viewport edges; panning shows that instead of
  // blank/re-rendered edges until you pan past the margin. The display path + the viewport `_cacheCv` are untouched (this is
  // additive; the blit falls back to the viewport cache when this isn't warm). Temporarily shifts this.camera so per-element
  // painters stay consistent with the cache transform, then restores it.
  _scheduleMarginWarm() { if (this._marginT) clearTimeout(this._marginT); this._marginT = setTimeout(() => { this._marginT = null; try { this._warmMarginCache(); } catch (_e) {} }, 90); } // 90ms (was 200): re-center the margin sooner after a pause so a pan→pause→pan burst keeps full coverage. Still off the hot path — _warmMarginCache bails while the camera is actively moving.
  // PAN: is the warm margin cache geometrically usable for the CURRENT camera? It's a content snapshot rendered at _marginCam
  // with M px of padding each side, so it covers ANY same-zoom camera whose view sits within ±M screen px of _marginCam
  // (node-proven: |dxScreen|≤M keeps the rounded blit covering the viewport). Replaces the old exact `_marginCam===cc` match —
  // which dropped to the blank-edged viewport cache after every settle (the pan→pause→pan glitch).
  _marginCovers() { const mc = this._marginCam; if (!mc || mc.zoom !== this.camera.zoom) return false; const M = this._marginPx || 0; if (M <= 1) return false; return Math.abs((this.camera.x - mc.x) * this.camera.zoom) <= M - 1 && Math.abs((this.camera.y - mc.y) * this.camera.zoom) <= M - 1; }
  _warmMarginCache() {
    if (this.renderer && this.renderer.kind === 'webgl') return; // WebGL: the margin is never shown (the display blit is glMode-gated) and renderer.begin would touch the on-screen GL layer with the shifted camera — don't warm it
    if (this.destroyed || this.editingId || this._elDrag || this._camAnim || (this._now() - (this._lastCamChange || 0) < 110)) { this._scheduleMarginWarm(); return; } // not stable yet → retry (110ms idle, was 160 — re-center the margin sooner after a pause)
    const M = 280, d = this.dpr, z = this.camera.zoom;
    const W = Math.round((this.cssW + 2 * M) * d), H = Math.round((this.cssH + 2 * M) * d);
    if (!this._marginCv) this._marginCv = document.createElement('canvas');
    if (this._marginCv.width !== W || this._marginCv.height !== H) { this._marginCv.width = W; this._marginCv.height = H; }
    const mctx = this._marginCv.getContext('2d'); const dark = !!(this.plugin._settings && this.plugin._settings.darkMode) || this._themeDark();
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = dark ? '#0f1117' : ((this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff'); mctx.fillRect(0, 0, W, H);
    const sx = this.camera.x, sy = this.camera.y; this.camera.x = sx - M / z; this.camera.y = sy - M / z;
    try {
      this.renderer.begin(mctx, this.camera, d); this.renderer.grid();
      const cm = (this.plugin._settings && this.plugin._settings.cullMargin != null) ? this.plugin._settings.cullMargin : 80;
      const vw = this.cssW + 2 * M, vh = this.cssH + 2 * M, vx0 = this.camera.x - cm, vy0 = this.camera.y - cm, vx1 = this.camera.x + vw / z + cm, vy1 = this.camera.y + vh / z + cm;
      this._ensureGrid(); const cand = this._grid.query(vx0, vy0, vx1 - vx0, vy1 - vy0);
      const zi = this._zIndex; cand.sort((a, b) => (zi.get(a.id) || 0) - (zi.get(b.id) || 0));
      for (const el of cand) { if (!el.isDeleted && el.type === 'frame') this.renderer.frame(el); }
      for (const el of cand) { if (el.isDeleted || el.mmHidden || el.id === this.editingId || el.type === 'frame') continue; this.renderer.element(el); }
      this.renderer.end();
      this._marginCam = { x: sx, y: sy, zoom: z }; this._marginPx = M; this._marginValid = true;
    } catch (_e) { this._marginValid = false; } finally { this.camera.x = sx; this.camera.y = sy; }
  }
  // PERF (drag): elements that move with the current drag = selection ∪ arrows bound to it. Returns null when a FRAME is
  // selected (a frame drag carries its contents — too broad to partial-cache; the caller falls back to a full render).
  _dragMovers() {
    const ids = new Set(this.selected);
    for (const id of ids) { const e = this._byId(id); if (e && e.type === 'frame') return null; }
    const moverHit = (b) => b && (ids.has(b.elementId) || (b.group && b.group.ids && b.group.ids.some((g) => ids.has(g))) || (b.group && b.group.regions && b.group.regions.some((r) => ids.has(r.elId)))); // round-5 B: a GROUP binding has no elementId — pull the arrow into the live drag set when a moving element is a group MEMBER or a region's IMAGE (else the arrow renders frozen on the static layer until pointer-up)
    for (const el of this.scene.elements) { if (el.isDeleted || ids.has(el.id)) continue; if ((el.type === 'arrow' || el.type === 'line') && (moverHit(el.startBinding) || moverHit(el.endBinding))) ids.add(el.id); }
    const out = []; for (const id of ids) { const e = this._byId(id); if (e && !e.isDeleted) out.push(e); }
    return out;
  }
  // One crisp re-render shortly after motion stops (debounced) — fills any blank edges + restores sharpness.
  _scheduleSettle() { if (this._settleT) clearTimeout(this._settleT); this._settleT = setTimeout(() => { this._settleT = null; if (!this.destroyed) this.dirty = true; }, 130); }
  // Build the per-element citation map for THIS drawing from the global index (drives the ↗ badge + dbl-click jump).
  _buildXrefIndex() {
    const idx = {}; let x = {};
    try { x = this.plugin._loadXref(); } catch (_e) {}
    const cites = [];
    for (const k in x) {
      const e = x[k]; if (!e || e.drawing !== this.recordGuid) continue;
      const targets = [];
      if (e.el) { (idx[e.el] = idx[e.el] || []).push({ lineGuid: k, label: e.label, inImage: e.inImage, frac: e.frac, fracPoly: e.fracPoly }); targets.push({ el: e.el, inImage: e.inImage, frac: e.frac, fracPoly: e.fracPoly }); }
      if (e.extra) for (const ex of e.extra) { if (ex.el) { (idx[ex.el] = idx[ex.el] || []).push({ lineGuid: k, label: e.label, inImage: ex.inImage, frac: ex.frac, fracPoly: ex.fracPoly }); targets.push({ el: ex.el, inImage: ex.inImage, frac: ex.frac, fracPoly: ex.fracPoly }); } }
      if (targets.length) cites.push({ lineGuid: k, label: e.label, targets }); // ONE pin per citation (see render); _xrefByEl stays for the per-element dbl-click jump
    }
    this._xrefByEl = idx; this._xrefCites = cites;
  }
  // Canvas → note: page-flip THIS panel to the citing note and highlight the exact line (Nav plugin pulses it).
  // In place (no new panel) so the drawing↔text toggle feels like flipping the same page. itemGuid auto-resolves
  // the record + workspace, so this lands on the RIGHT page even when _flipToNote's edit_panel/ws path is flaky.
  async _jumpToCiting(lineGuid) {
    if (!lineGuid) return;
    const here = this.panel || (this.plugin.ui.getActivePanel && this.plugin.ui.getActivePanel());
    if (here) { try { const ok = await here.navigateTo({ itemGuid: lineGuid, highlight: true }); if (ok) return; } catch (_e) {} }
    // Fallback: a fresh side panel if the in-place flip didn't resolve the line.
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) return;
    try { const ok = await panel.navigateTo({ itemGuid: lineGuid, highlight: true }); if (!ok) { try { this.plugin.ui.addToaster({ title: 'Plexus: the citing note line could not be found (it may have been deleted).', dismissible: true }); } catch (_e) {} } } catch (e) { console.error('[Plexus] jumpToCiting', e); }
  }
  async _jumpFromSelection() {
    let target = null;
    for (const id of this.selected) { const arr = this._xrefByEl && this._xrefByEl[id]; if (arr && arr.length) { target = arr; break; } }
    if (!target) { try { this.plugin.ui.addToaster({ title: 'Plexus: this element isn’t cited in a note yet — use “Cite selection”, then paste in a note.', dismissible: true }); } catch (_e) {} return; }
    if (target.length > 1) { try { this.plugin.ui.addToaster({ title: 'Cited in ' + target.length + ' notes — opening the first.', dismissible: true }); } catch (_e) {} }
    await this._jumpToCiting(target[0].lineGuid);
  }
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
    const gs = this._gridSize(), z = this.camera.zoom, Pw = (this._renderPad || 0) / z; // extend over the oversized static layer's pad so panned-in edges show grid
    const x0 = this.camera.x - Pw, y0 = this.camera.y - Pw, x1 = this.camera.x + this.cssW / z + Pw, y1 = this.camera.y + this.cssH / z + Pw;
    const sx = Math.floor(x0 / gs) * gs, sy = Math.floor(y0 / gs) * gs;
    const op = Math.max(0, Math.min(100, st.gridOpacity == null ? 28 : st.gridOpacity)) / 100; // S5
    const col = st.gridDynamic ? (st.darkMode ? 'rgba(255,255,255,' + op + ')' : 'rgba(0,0,0,' + op + ')') : hexToRgba(st.gridColor || '#7c5cff', op);
    ctx.save(); ctx.fillStyle = col; const r = Math.max(0.5, 1 / z);
    for (let x = sx; x <= x1; x += gs) for (let y = sy; y <= y1; y += gs) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // Phase 8: download the current scene as a standalone SVG file.
  async _exportSvg() {
    try {
      const scene = await this._sceneWithInlineImages(); // SCALE: resolve externalized blobGuid images → dataURL so SVG export isn't blank
      const svg = exportSvg(scene);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'plexus-drawing.svg'; document.body.appendChild(a); a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) {} }, 1000);
      try { this.plugin.ui.addToaster({ title: 'Exported drawing as SVG.', dismissible: true }); } catch (_e) {}
      return svg.length;
    } catch (e) { console.error('[Plexus] exportSvg', e); return 0; }
  }
  // SCALE: a shallow scene clone whose externalized (blobGuid) image files are resolved to inline dataURLs — for the
  // sync SVG exporter (which can only read f.dataURL). Prefers the already-decoded cache img; else downloads the blob.
  async _sceneWithInlineImages() {
    const files = this.scene.files || {};
    const needs = Object.keys(files).filter((fid) => { const f = files[fid]; return f && f.blobGuid && !f.dataURL; });
    if (!needs.length) return this.scene;
    const merged = {}; for (const fid of Object.keys(files)) merged[fid] = files[fid];
    await Promise.all(needs.map(async (fid) => {
      const f = files[fid];
      try {
        let im = this._imgFor(fid); // decoded cache hit?
        let url = null;
        if (!(im && im.complete && im.naturalWidth)) { url = await this.plugin._assetGet(f); if (!url) return; im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => res(null); x.src = url; }); }
        if (im && im.naturalWidth) { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; cv.getContext('2d').drawImage(im, 0, 0); merged[fid] = Object.assign({}, f, { dataURL: cv.toDataURL('image/png') }); }
        if (url) { try { URL.revokeObjectURL(url); } catch (_e) {} }
      } catch (_e) {}
    }));
    return Object.assign({}, this.scene, { files: merged });
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
  // clipPoly (optional, WORLD coords) → render only inside that freehand shape (transparent outside) for the chip thumbnail.
  _renderRegionPng(b, scale, clipPoly) {
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(b.w * scale)); cv.height = Math.max(1, Math.round(b.h * scale));
    const ctx = cv.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    if (clipPoly && clipPoly.length >= 3) { ctx.beginPath(); ctx.moveTo(clipPoly[0].x, clipPoly[0].y); for (let i = 1; i < clipPoly.length; i++) ctx.lineTo(clipPoly[i].x, clipPoly[i].y); ctx.closePath(); ctx.clip(); }
    ctx.fillStyle = (this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff'; ctx.fillRect(b.x, b.y, b.w, b.h); // bg inside clip only
    for (const el of this.scene.elements) { if (el.isDeleted || el.secHidden || el.type === 'frame') continue; try { if (el.type === 'image') this._drawImage(ctx, el); else if (el.type === 'record' || el.type === 'query' || el.type === 'board') {} else drawElement(ctx, el); } catch (_e) {} } // images render; cards skipped (async)
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
    // Grid candidates near the point, expanded DOWN by labelH: a frame's title band sits ABOVE its bbox, so when the
    // click is in the band the frame's cells are BELOW the click → reach down to them (expanding up misses the frame).
    for (const el of this._gridTopFirst(wx - tol, wy - tol, tol * 2, tol * 2 + labelH)) {
      if (el.isDeleted || el.mmHidden) continue;
      if (el.type === 'frame') { if (hitFrameBorder(el, wx, wy, tol, labelH)) return el; continue; }
      if (hitElement(el, wx, wy, tol)) return el;
    }
    return null;
  }
  _centerIn(el, fr) { const cx = el.x + (el.width || 0) / 2, cy = el.y + (el.height || 0) / 2; return cx >= fr.x && cx <= fr.x + fr.width && cy >= fr.y && cy <= fr.y + fr.height; }
  _frameChildren(fr) { return this.scene.elements.filter((e) => !e.isDeleted && e.type !== 'frame' && e.id !== fr.id && this._centerIn(e, fr)); } // P1.0
  // SECTIONS (iter 3): collapse a section to its title bar — hide its contents (mark each child `secHidden` → skipped from
  // the grid → not rendered/hit), stash the full height + shrink to a title-bar box. Expand restores. Children stay OWNED
  // via secHidden (not geometry), so move/expand work after the shrink; the grid self-heals orphans if the section is deleted.
  _toggleSectionCollapse(fr) {
    if (!fr || fr.type !== 'frame') return;
    if (!fr.collapsed) {
      for (const c of this._frameChildren(fr)) c.secHidden = fr.id; // compute children from the FULL bounds, then shrink
      fr._fullH = fr.height; fr.collapsed = true; fr.height = Math.min(fr.height, 28);
    } else {
      fr.collapsed = false; if (fr._fullH != null) { fr.height = Math.max(fr._fullH, fr.height); delete fr._fullH; } // max() so a resize WHILE collapsed isn't silently lost
      for (const c of this.scene.elements) if (c.secHidden === fr.id) delete c.secHidden;
    }
    // NOTE (intentional): deleting a collapsed section un-hides its children (the grid self-heals on the next rebuild) — i.e.
    // deleting the section removes only the BOUNDARY and returns its cards to their original spots (non-destructive). An arrow
    // bound to a card INSIDE a collapsed section still routes to that card's (now-hidden) original position — a v2 could re-route it to the section.
    this._gridDirty = true; this._cacheValid = false; this.dirty = true; this.scheduleSave();
  }
  _bindableAt(wx, wy, excludeId, excludeId2) {
    const tol = 8 / this.camera.zoom, labelH = 16 / this.camera.zoom;
    // CONNECTIONS: bind an endpoint to ANY content element (card / linecard / image / text-label / shape / board / …) so you
    // can connect anything. Never bind to another connector's body (arrow/line). hitElement is bbox for non-shapes (good
    // enough) + precise for rough shapes; _gridTopFirst gives z-order so the topmost element wins. excludeId2 = the
    // START-bound element (B2) → the end-snap never lands back on the source (which would collapse the arrow).
    // SECTIONS: a frame (section) binds as a WHOLE-section target — but only as a FALLBACK via its BORDER/TITLE; a content
    // element inside the section always wins (interior passes through). Query expanded down by labelH to reach the title band.
    let frame = null;
    for (const el of this._gridTopFirst(wx - tol, wy - tol, tol * 2, tol * 2 + labelH)) {
      if (el.isDeleted || el.id === excludeId || el.id === excludeId2 || el.type === 'arrow' || el.type === 'line') continue;
      if (el.type === 'frame') { if (!frame && hitFrameBorder(el, wx, wy, tol, labelH)) frame = el; continue; }
      if (hitElement(el, wx, wy, tol)) return el;
    }
    return frame;
  }
  // CONNECT (Heptabase ergonomic): the 4 edge-midpoint "nubs" just OUTSIDE an element — hover an element → nubs appear →
  // drag a nub to draw a BOUND connection from it (no tool switch). World coords; offset scales with zoom so they sit a
  // constant ~14px outside on screen.
  _connNubsFor(el) {
    const x = Math.min(el.x, el.x + (el.width || 0)), y = Math.min(el.y, el.y + (el.height || 0)), w = Math.abs(el.width || 0), h = Math.abs(el.height || 0);
    const cx = x + w / 2, cy = y + h / 2, o = 14 / this.camera.zoom;
    const nubs = [{ x: cx, y: y - o }, { x: x + w + o, y: cy }, { x: cx, y: y + h + o }, { x: x - o, y: cy }];
    // D (round 3): a screen-filling element's bbox-edge nubs land OFF-SCREEN → unreachable → you can't drag a connection from
    // it (the "blub"). Clamp each nub into the VISIBLE world rect (inset from each viewport edge) so it's always reachable.
    // No-op for any nub already on-screen → small/normal elements are unchanged; a huge element's 4 nubs sit at the screen edges.
    const z = this.camera.zoom, m = 28 / z, vx0 = this.camera.x + m, vy0 = this.camera.y + m, vx1 = this.camera.x + this.cssW / z - m, vy1 = this.camera.y + this.cssH / z - m;
    if (vx1 > vx0 && vy1 > vy0) for (const n of nubs) { n.x = Math.max(vx0, Math.min(vx1, n.x)); n.y = Math.max(vy0, Math.min(vy1, n.y)); }
    return nubs;
  }
  _nubAt(sp) { if (!this._connHover || this._connHover.isDeleted) return null; for (const n of this._connNubsFor(this._connHover)) { const s = this.camera.worldToScreen(n.x, n.y); if (Math.hypot(s.x - sp.x, s.y - sp.y) < 11) return n; } return null; }
  // round-5 B: a press on a multi-selection's group-connect nub (drawn last frame) → the nub world point + the member ids.
  _groupNubAt(sp) { if (!this._groupNubs || !this._groupNubIds) return null; for (const n of this._groupNubs) { const s = this.camera.worldToScreen(n.x, n.y); if (Math.hypot(s.x - sp.x, s.y - sp.y) < 12) return { x: n.x, y: n.y, ids: this._groupNubIds }; } return null; }
  // round-5 F: a press on a pending SOURCE-region nub (drawn last frame) → the nub world point + the region to start a connection FROM.
  _sourceNubAt(sp) { const psr = this._pendingSourceRegion; if (!psr || !psr.nubs) return null; for (const n of psr.nubs) { const s = this.camera.worldToScreen(n.x, n.y); if (Math.hypot(s.x - sp.x, s.y - sp.y) < 12) return { x: n.x, y: n.y, region: psr.region }; } return null; }
  // CONNECT (forgiving end-bind): the CLOSEST connectable element whose bbox is within `radiusPx` (screen px) of a world
  // point — so dragging a connection TOWARD a card snaps to it even if you release a bit short, not only when you land
  // exactly inside it. Used as the fallback after the precise _bindableAt (which still wins when you're truly over a target).
  _nearestBindable(wx, wy, radiusPx, excludeId, excludeId2) {
    const r = (radiusPx || 30) / this.camera.zoom; let best = null, bestD = Infinity, bestA = Infinity;
    for (const el of this._gridTopFirst(wx - r, wy - r, r * 2, r * 2)) {
      if (el.isDeleted || el.id === excludeId || el.id === excludeId2 || el.type === 'arrow' || el.type === 'line' || el.type === 'frame') continue;
      const x0 = Math.min(el.x, el.x + (el.width || 0)), x1 = Math.max(el.x, el.x + (el.width || 0)), y0 = Math.min(el.y, el.y + (el.height || 0)), y1 = Math.max(el.y, el.y + (el.height || 0));
      const dx = Math.max(x0 - wx, 0, wx - x1), dy = Math.max(y0 - wy, 0, wy - y1), d = Math.hypot(dx, dy);
      if (d > r) continue;
      const area = Math.max(1, (x1 - x0) * (y1 - y0));
      // B2: strictly-closer edge wins; on a near-tie (both bboxes CONTAIN the point → d≈0) the SMALLER element wins — so a
      // card beats a giant ellipse/image whose bbox swallows the release point (which used to snap the end back to the source).
      if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && area < bestA)) { bestD = d; bestA = area; best = el; }
    }
    return best;
  }
  _updateBindings() {
    // PERF: runs on EVERY pointermove during a drag. ONE O(n) scan collects bound arrows + connection-label text elements;
    // EARLY-RETURN when nothing is bound (the common case → no per-frame cost on connection-free scenes). The idMap (id→el)
    // is built lazily on first lookup. The fixpoint below resolves CHAINS (arrow → label → arrow) so an arrow bound to a
    // label settles on the label's moved position in the same call (was a 1-pass lag that never settled on drop).
    let idMap = null;
    const lookup = (id) => { if (!idMap) { idMap = new Map(); for (const e of this.scene.elements) if (!e.isDeleted) idMap.set(e.id, e); } return idMap.get(id) || null; };
    const arrows = [], labels = [];
    for (const el of this.scene.elements) {
      if (el.isDeleted) continue;
      if ((el.type === 'arrow' || el.type === 'line') && el.points && el.points.length >= 2 && (el.startBinding || el.endBinding)) arrows.push(el);
      else if (el.type === 'text' && el.midBinding) labels.push(el);
    }
    // CONNECTIONS Phase 4: which lines/regions are CURRENT connection sub-targets (drives the blue flag + region highlight).
    // Built from the (small) bound-arrow set, not the scene; rebuilt every call so a removed/redirected connection clears its flag.
    const lineT = new Map(), regionT = new Map(), refT = new Map(), groupT = [], byEl = new Map(); // byEl: elementId → Set(arrowId) for the select-a-card "see its connections" highlight (Phase 5); refT: textId → Set(refGuidTarget) for the round-5 A inline-ref flag; groupT: [{ids}] for the round-5 B group-member highlight
    for (const a of arrows) for (const b of [a.startBinding, a.endBinding]) {
      if (b && b.group && ((b.group.ids && b.group.ids.length) || (b.group.regions && b.group.regions.length))) { groupT.push(b.group); for (const id of (b.group.ids || [])) { let s = byEl.get(id); if (!s) byEl.set(id, s = new Set()); s.add(a.id); } for (const rg of (b.group.regions || [])) { if (!rg.elId) continue; let s = byEl.get(rg.elId); if (!s) byEl.set(rg.elId, s = new Set()); s.add(a.id); } continue; } // round-5 B/D: a group target has no single elementId — index each MEMBER + region-image (free-space regions have no elId) for the select→highlight + outline
      if (!b || !b.elementId) continue;
      { let s = byEl.get(b.elementId); if (!s) byEl.set(b.elementId, s = new Set()); s.add(a.id); }
      if (b.lineGuid) { let s = lineT.get(b.elementId); if (!s) lineT.set(b.elementId, s = new Set()); s.add(b.lineGuid); }
      else if (b.refGuidTarget) { let s = refT.get(b.elementId); if (!s) refT.set(b.elementId, s = new Set()); s.add(b.refGuidTarget); } // round-5 A: a connection targeting a specific inline ref → flag that run
      else if (b.frac) { let r = regionT.get(b.elementId); if (!r) regionT.set(b.elementId, r = []); r.push({ frac: b.frac, fracPoly: b.fracPoly }); }
    }
    this._connLineTargets = lineT; this._connRegionTargets = regionT; this._connRefTargets = refT; this._connGroupTargets = groupT; this._connByEl = byEl;
    if (!arrows.length && !labels.length) return; // nothing bound → zero work
    // Resolve a binding to the pseudo-shape its endpoint should route to: a GROUP's live union bbox (round-5 B, no single
    // element), else the bound element's line-band / inline-ref / image-region / whole-element shape. Null → free the binding.
    const tgt = (b) => { if (b.group && ((b.group.ids && b.group.ids.length) || (b.group.regions && b.group.regions.length))) { const gb = this._groupUnionWorld(b.group, lookup); return gb ? { x: gb.x, y: gb.y, width: gb.w, height: gb.h } : null; } const s = lookup(b.elementId); return s ? this._bindTargetShape(b, s) : null; };
    const updArrow = (el) => {
      let changed = false;
      if (el.startBinding) { const t = tgt(el.startBinding); if (t) { const o = el.points[el.points.length - 1]; const p = bindPoint(t, o[0], o[1]); el.points[0] = [p.x, p.y]; changed = true; } else el.startBinding = null; } // route to a bound GROUP / LINE band / inline ref / image REGION when the binding carries one, else the whole element
      if (el.endBinding) { const t = tgt(el.endBinding); if (t) { const o = el.points[0]; const p = bindPoint(t, o[0], o[1]); el.points[el.points.length - 1] = [p.x, p.y]; changed = true; } else el.endBinding = null; }
      if (changed) linearBBox(el);
    };
    const updLabel = (el) => { if (!el.midBinding) return; const a = lookup(el.midBinding.arrowId); if (!a || a.isDeleted || (a.type !== 'arrow' && a.type !== 'line')) { el.midBinding = null; return; } const m = pxcPolyMidpoint(routedPoints(a)); if (m) { el.x = m.x - (Math.abs(el.width) || 0) / 2; el.y = m.y - (Math.abs(el.height) || 0) / 2; } }; // guard: a label freed in an earlier fixpoint pass must not crash a later pass
    const passes = labels.length ? 3 : 1; // arrows→labels→arrows… resolves chained connectors (passes iterate the small arrays, not the scene → cheap)
    for (let i = 0; i < passes; i++) { for (const a of arrows) updArrow(a); if (!labels.length) break; for (const l of labels) updLabel(l); }
  }
  _cloneEl(el, dx, dy) {
    const c = JSON.parse(JSON.stringify(el)); c.id = newId(); c.x = (c.x || 0) + dx; c.y = (c.y || 0) + dy; c.seed = newSeed();
    if (c.points) c.points = c.points.map(([px, py]) => [px + dx, py + dy]);
    c.startBinding = null; c.endBinding = null; c.midBinding = null; return c; // image fileId is shared on purpose; a clone is UNBOUND (parity with start/endBinding — never cross-link a cloned label to the original connector)
  }
  _copy() { this.plugin._clipboard = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map((el) => JSON.parse(JSON.stringify(el))); }
  _paste() { const cb = this.plugin._clipboard; if (cb && cb.length) { this.selected.clear(); for (const c of this._cloneBatch(cb, 24, 24)) { this.scene.elements.push(c); this.selected.add(c.id); } this.dirty = true; this.scheduleSave(); return; } this._pasteSystemImage(); }
  // IMAGE PASTE: the onKey Cmd+V `preventDefault` suppresses the native `paste` event, so the document paste listener
  // never fires while the canvas is focused. Read the system clipboard ourselves (the Cmd+V keydown is a valid user
  // gesture for navigator.clipboard.read()) and drop any image at the viewport centre. Silent on denied / no-image.
  async _pasteSystemImage() {
    if (this.destroyed || !navigator.clipboard || !navigator.clipboard.read) return;
    let items = null; try { items = await navigator.clipboard.read(); } catch (_e) { return; }
    for (const it of (items || [])) {
      const type = (it.types || []).find((t) => t && t.indexOf('image/') === 0); if (!type) continue;
      let blob = null; try { blob = await it.getType(type); } catch (_e) {} if (!blob) continue;
      const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
      try { if (type === 'image/svg+xml') { const txt = await blob.text(); this._addSvgAsImage(txt, c.x, c.y); } else await this._addImageFromFile(blob, c.x, c.y); } catch (_e) {}
      try { this.plugin.ui.addToaster({ title: 'Image pasted onto the canvas.', dismissible: true }); } catch (_e) {}
      return;
    }
  }
  _duplicate() { if (!this.selected.size) return; const els = [...this.selected].map((id) => this._byId(id)).filter(Boolean); this.selected.clear(); for (const c of this._cloneBatch(els, 24, 24)) { this.scene.elements.push(c); this.selected.add(c.id); } this.dirty = true; this.scheduleSave(); }
  _selectAll() { this.selected = new Set(this.scene.elements.filter((x) => !x.isDeleted && !x.secHidden).map((x) => x.id)); this.dirty = true; } // SECTIONS: don't select hidden (collapsed-section) children
  _topGroup(el) { return el.groupIds && el.groupIds.length ? el.groupIds[el.groupIds.length - 1] : null; }
  _groupMembers(gid) { return gid ? this.scene.elements.filter((e) => !e.isDeleted && e.groupIds && e.groupIds.includes(gid)).map((e) => e.id) : []; }
  _cloneBatch(els, dx, dy) { const gmap = {}; return els.map((el) => { const c = this._cloneEl(el, dx, dy); if (c.groupIds && c.groupIds.length) c.groupIds = c.groupIds.map((g) => (gmap[g] || (gmap[g] = 'g' + newId()))); return c; }); }
  _group() { const ids = [...this.selected]; if (ids.length < 2) return; const gid = 'g' + newId(); for (const id of ids) { const el = this._byId(id); if (el) { if (!el.groupIds) el.groupIds = []; el.groupIds.push(gid); } } this.dirty = true; this.scheduleSave(); }
  _ungroup() { let changed = false; for (const id of this.selected) { const el = this._byId(id); if (el && el.groupIds && el.groupIds.length) { el.groupIds.pop(); changed = true; } } if (changed) { this.dirty = true; this.scheduleSave(); } }
  _bringToFront() { if (!this.selected.size) return; const sel = this.scene.elements.filter((e) => this.selected.has(e.id)); const rest = this.scene.elements.filter((e) => !this.selected.has(e.id)); this.scene.elements = rest.concat(sel); this.dirty = true; this.scheduleSave(); }
  _sendToBack() { if (!this.selected.size) return; const sel = this.scene.elements.filter((e) => this.selected.has(e.id)); const rest = this.scene.elements.filter((e) => !this.selected.has(e.id)); this.scene.elements = sel.concat(rest); this.dirty = true; this.scheduleSave(); }
  // CP-1: step z-order by ONE. Walk selected ids toward front (di=+1) or back (di=-1), each swapping past the
  // nearest non-selected neighbour. Front pass iterates high→low index so a contiguous selection moves as a block.
  _stepZ(di) {
    if (!this.selected.size) return; const els = this.scene.elements; const n = els.length;
    const order = di > 0 ? [...Array(n).keys()].reverse() : [...Array(n).keys()];
    let moved = false;
    for (const i of order) { const j = i + di; if (j < 0 || j >= n) continue; if (this.selected.has(els[i].id) && !this.selected.has(els[j].id)) { const t = els[i]; els[i] = els[j]; els[j] = t; moved = true; } }
    if (moved) { this.dirty = true; this.scheduleSave(); }
  }
  _bringForward() { this._stepZ(1); }
  _sendBackward() { this._stepZ(-1); }
  _nudge(dx, dy) { if (!this.selected.size) return; for (const id of this.selected) { const el = this._byId(id); if (!el) continue; el.x += dx; el.y += dy; if (el.points) el.points = el.points.map(([px, py]) => [px + dx, py + dy]); } this._updateBindings(); this.dirty = true; this.scheduleSave(); } // CONNECTIONS: rebind any bound target (not just rough shapes); _updateBindings early-returns when nothing is bound
  // CP-4: align / distribute the selection to its bounding box (Excalidraw parity precision tools).
  _align(mode) {
    const els = [...this.selected].map((id) => this._byId(id)).filter((e) => e && e.type !== 'frame');
    if (els.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: select 2+ elements to align.', dismissible: true }); } catch (_e) {} return; }
    const box = (el) => ({ x: Math.min(el.x, el.x + (el.width || 0)), y: Math.min(el.y, el.y + (el.height || 0)), w: Math.abs(el.width || 0), h: Math.abs(el.height || 0) });
    const moveTo = (el, nx, ny) => { const b = box(el); const dx = nx - b.x, dy = ny - b.y; el.x += dx; el.y += dy; if (el.points) el.points = el.points.map(([px, py]) => [px + dx, py + dy]); };
    const boxes = els.map(box);
    const minX = Math.min(...boxes.map((b) => b.x)), maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const minY = Math.min(...boxes.map((b) => b.y)), maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    if (mode === 'disth' || mode === 'distv') {
      const horiz = mode === 'disth';
      const order = els.map((el, i) => ({ el, b: boxes[i] })).sort((a, b) => horiz ? a.b.x - b.b.x : a.b.y - b.b.y);
      const first = order[0].b, last = order[order.length - 1].b;
      const span = (horiz ? last.x - first.x : last.y - first.y), sizes = order.reduce((s, o) => s + (horiz ? o.b.w : o.b.h), 0) - (horiz ? last.w : last.h) - (horiz ? first.w : first.h);
      const inner = order.slice(1, -1); const gap = (span - sizes - inner.reduce((s, o) => s + (horiz ? o.b.w : o.b.h), 0)) / (order.length - 1);
      let cur = (horiz ? first.x + first.w : first.y + first.h) + gap;
      for (const o of inner) { if (horiz) moveTo(o.el, cur, o.b.y); else moveTo(o.el, o.b.x, cur); cur += (horiz ? o.b.w : o.b.h) + gap; }
    } else {
      for (let i = 0; i < els.length; i++) { const el = els[i], b = boxes[i];
        if (mode === 'left') moveTo(el, minX, b.y); else if (mode === 'right') moveTo(el, maxX - b.w, b.y); else if (mode === 'hcenter') moveTo(el, cx - b.w / 2, b.y);
        else if (mode === 'top') moveTo(el, b.x, minY); else if (mode === 'bottom') moveTo(el, b.x, maxY - b.h); else if (mode === 'vmiddle') moveTo(el, b.x, cy - b.h / 2);
      }
    }
    this._updateBindings && this._updateBindings(); this.dirty = true; this.scheduleSave();
  }
  // CP-4: selection stats — count + bounding box (x/y/w/h) + single-element angle, shown as a toaster.
  _selectionStats() {
    const els = [...this.selected].map((id) => this._byId(id)).filter(Boolean);
    if (!els.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing selected.', dismissible: true }); } catch (_e) {} return; }
    const minX = Math.min(...els.map((e) => Math.min(e.x, e.x + (e.width || 0)))), maxX = Math.max(...els.map((e) => Math.max(e.x, e.x + (e.width || 0))));
    const minY = Math.min(...els.map((e) => Math.min(e.y, e.y + (e.height || 0)))), maxY = Math.max(...els.map((e) => Math.max(e.y, e.y + (e.height || 0))));
    const r = (n) => Math.round(n); const ang = els.length === 1 && els[0].angle ? '  angle ' + r(els[0].angle * 180 / Math.PI) + '°' : '';
    try { this.plugin.ui.addToaster({ title: els.length + ' selected · x ' + r(minX) + ' y ' + r(minY) + ' · w ' + r(maxX - minX) + ' h ' + r(maxY - minY) + ang, dismissible: true }); } catch (_e) {}
  }
  // CP-7/C-CF6: set an external URL link on the selected element(s) — double-click opens it (non-text elements).
  async _setLink() {
    const els = [...this.selected].map((id) => this._byId(id)).filter(Boolean);
    if (!els.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: select an element first.', dismissible: true }); } catch (_e) {} return; }
    const cur = els[0].link || '';
    const url = await this._promptText('External link URL (blank to clear):', cur);
    if (url == null) return;
    const u = url.trim();
    for (const el of els) { if (u) el.link = u; else delete el.link; }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: u ? 'Link set — double-click the element to open it.' : 'Link cleared.', dismissible: true }); } catch (_e) {}
  }
  // CP-7/C-CF4: copy the selection (or whole drawing) to the system clipboard as a PNG.
  async _copyPngToClipboard() {
    let blob = null;
    try {
      const ids = this.selected.size ? [...this.selected] : null;
      const sub = ids ? { type: 'excalidraw', appState: this.scene.appState, elements: this.scene.elements.filter((e) => ids.includes(e.id) && !e.isDeleted), files: this.scene.files } : this.scene;
      blob = await exportPng(sub, 4096, { scale: (this.plugin._settings && this.plugin._settings.pngScale) || 2, padding: 24, background: false });
    } catch (_e) {}
    if (!blob) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing to copy.', dismissible: true }); } catch (_e) {} return; }
    try {
      if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); try { this.plugin.ui.addToaster({ title: 'Copied as PNG to the clipboard.', dismissible: true }); } catch (_e) {} }
      else throw new Error('no clipboard');
    } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: clipboard image write blocked here — use Export as PNG.', dismissible: true }); } catch (_e) {} }
  }
  // CP-4: eyedropper — the next click samples the pixel under the cursor from the rendered scene → stroke colour.
  _eyedropper() { this._eyedrop = true; try { this.wrap.style.cursor = 'crosshair'; } catch (_e) {} try { this.plugin.ui.addToaster({ title: 'Eyedropper: click any pixel to sample its colour.', dismissible: true }); } catch (_e) {} }
  _sampleAt(e) {
    try {
      const r = this.wrap.getBoundingClientRect(), dpr = this.dpr || window.devicePixelRatio || 1, P = this._renderPad || 0, rc = this._staticRasterCam, z = this.camera.zoom;
      // staticCv buffer is OVERSIZED + CSS-positioned at (-P) and may carry a pan transform (tx,ty); the buffer pixel under a
      // viewport click is at (clickX + P - tx)*dpr (MED: review — was sampling P px off after the canvas became oversized).
      const tx = rc ? Math.round((rc.x - this.camera.x) * z) : 0, ty = rc ? Math.round((rc.y - this.camera.y) * z) : 0;
      const px = Math.round((e.clientX - r.left + P - tx) * dpr), py = Math.round((e.clientY - r.top + P - ty) * dpr);
      const d = this.staticCv.getContext('2d').getImageData(px, py, 1, 1).data;
      const hex = '#' + [d[0], d[1], d[2]].map((c) => c.toString(16).padStart(2, '0')).join('');
      this.strokeColor = hex; this._syncToolbar && this._syncToolbar();
      try { this.plugin.ui.addToaster({ title: 'Sampled ' + hex + ' → stroke colour.', dismissible: true }); } catch (_e) {}
    } catch (_e) {}
    this._eyedrop = false; try { this.wrap.style.cursor = ''; } catch (_e) {}
  }
  _worldAt(e) { const r = this.wrap.getBoundingClientRect(); return this.camera.screenToWorld(e.clientX - r.left, e.clientY - r.top); }
  // S4: is pen mode on? Drives whether a pen pointer draws freedraw without picking the Pen tool.
  _penActive() {
    const m = (this.plugin._settings && this.plugin._settings.defaultPenMode) || 'mobile';
    if (m === 'always') return true;
    if (m === 'never') return false;
    return (typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches)) || ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  }
  // S4: stateless double-tap detector (timestamp+pos on the view; no setTimeout → nothing to dispose).
  _penDoubleTap(e) {
    const now = Date.now();
    const dt = now - (this._penTapT || 0);
    const near = Math.hypot(e.clientX - (this._penTapX || 0), e.clientY - (this._penTapY || 0)) < 24;
    this._penTapT = now; this._penTapX = e.clientX; this._penTapY = e.clientY;
    if (dt < 320 && dt > 0 && near) { this._penTapT = 0; return true; }
    return false;
  }
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
    let lpTimer = null; const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }; // S10 long-press
    let downRef = null; // CANVAS-SEG: {id, wasSelected} of a runs-text hit on press → click-again-on-ref navigates
    const onDown = (e) => {
      host.focus();
      if (this._elDrag) { this._elDrag = false; this._dragLayerValid = false; this._cacheValid = false; } // self-heal: a prior drag that was cancelled (no pointerup) left the static-layer blit locked on
      if (this._panMode) { this._panMode = false; if (this._panEndT) { clearTimeout(this._panEndT); this._panEndT = null; } } // a new gesture (drag/click) ends any wheel-pan still in compositor mode → the next render re-rasters crisp (HIGH: review)
      if (this._camAnim) this._abortCamAnim(); // user took over — never fight a manual move
      if (this._eyedrop) { this._sampleAt(e); return; } // CP-4: eyedropper consumes the next click
      // Cross-ref ↗ pin → page-flip to the citing note. Single click, before drawing. Hit-tests the pins drawn
      // last frame (screen-space CSS coords), so an in-image region pin is clickable right on its spot.
      if (this._xrefPins && this._xrefPins.length && (e.button === 0 || e.button === -1) && !this._present) {
        const rct = this.wrap.getBoundingClientRect(), px = e.clientX - rct.left, py = e.clientY - rct.top;
        for (const pin of this._xrefPins) { if (Math.hypot(px - pin.x, py - pin.y) <= pin.r) { try { e.preventDefault(); } catch (_e) {} this._jumpToCiting(pin.lineGuid); return; } }
      }
      // S4: pen/touch routing — a pen draws freedraw without picking the Pen tool; a single finger pans.
      if (!this._present && this._penActive() && (e.button === 0 || e.button === -1)) {
        const stp4 = this.plugin._settings || {};
        if (e.pointerType === 'pen') {
          if (stp4.penDoubleTapEraser && this._penDoubleTap(e)) {
            const dw = this._worldAt(e); const eh = this._hitTopAt(dw.x, dw.y);
            if (eh) { eh.isDeleted = true; this.selected.clear(); this.dirty = true; this.scheduleSave(); }
            try { host.setPointerCapture(e.pointerId); } catch (_e) {} mode = null; return;
          }
          if (this.tool !== 'pen' && this.tool !== 'eraser' && this.tool !== 'laser') { this._penForced = true; this.tool = 'pen'; }
          if (stp4.penCrosshair) this.wrap.classList.add('pxc-pencursor');
        } else if (e.pointerType === 'touch' && stp4.penSingleFingerPan) {
          mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y;
          try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.wrap.classList.add('pxc-panning'); return;
        }
      }
      if (this._present) { if (e.button === 0 && this._slides && this._slides.length) this._gotoSlide((this._slideIdx || 0) + 1); return; } // P0.5: click advances slides
      const stp = this.plugin._settings || {};
      if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 2 && stp.panRightMouse)) { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.wrap.classList.add('pxc-panning'); return; } // S3: right-mouse pan
      if (e.button !== 0) return;
      { const rct = this.wrap.getBoundingClientRect(), mpx = e.clientX - rct.left, mpy = e.clientY - rct.top; if (this._miniHit(mpx, mpy)) { this._miniDragging = true; this._miniTeleport(mpx, mpy); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; } } // MINIMAP teleport
      moved = false; down = this._worldAt(e);
      const rect = this.wrap.getBoundingClientRect(); const sp = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // F2 drop-to-mark: a connection was just dropped on an image/shape → the NEXT press ON it draws the exact region;
      // a press OFF it cancels (keeps the whole-element link). Works regardless of the current tool.
      if (this._pendingRegionLink) {
        const prl = this._pendingRegionLink, rel = this._byId(prl.elId);
        if (!prl.refOnly && rel && !rel.isDeleted && this._ptInBBox(rel, down.x, down.y)) { this._closeRegionChoice(); mode = 'regionmark'; this._cropRect = { x: down.x, y: down.y, w: 0, h: 0 }; try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; } // refOnly (round-5 A text-ref chooser) has no region-mark drag → any press just dismisses it
        this._pendingRegionLink = null; this._closeRegionChoice(); this.dirty = true;
      }
      // round-5 B (drop-then-lasso): a pending group-link is armed → this press-drag is the group lasso (any tool). A press
      // that doesn't drag (a click) cancels in onUp; a drag selects the enclosed elements as the arrow's group target.
      if (this._pendingGroupLink) { const arr = this._byId(this._pendingGroupLink.arrowId); if (!arr || arr.isDeleted) { this._pendingGroupLink = null; } else { mode = 'grouplasso'; this._lasso = [[down.x, down.y]]; try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.dirty = true; return; } }
      if (this._regionChoiceEl) { this._closeRegionChoice(); this.dirty = true; } // round-5 D: an outside press dismisses the void-drop link menu (its buttons stopPropagation, so a press reaching here is outside)
      if (this.tool === 'select') {
        const sel = this._singleSel();
        if (sel && (isRoughShape(sel.type) || sel.type === 'icon' || sel.type === 'record' || sel.type === 'linecard' || sel.type === 'image' || sel.type === 'query' || sel.type === 'rollup' || sel.type === 'table' || sel.type === 'board' || sel.type === 'frame')) {
          const H = this._handles(sel);
          const near = (k) => { const s2 = this.camera.worldToScreen(H[k].x, H[k].y); return Math.hypot(s2.x - sp.x, s2.y - sp.y) < 10; };
          if (near('rot')) { mode = 'rotate'; rotEl = sel; rotCenter = { x: sel.x + sel.width / 2, y: sel.y + sel.height / 2 }; rotStart = sel.angle || 0; rotPtr0 = Math.atan2(down.y - rotCenter.y, down.x - rotCenter.x); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
          for (const k of HANDLE_KEYS) if (near(k)) { mode = 'resize'; rsEl = sel; rsHandle = k; rs0 = { x: sel.x, y: sel.y, w: sel.width, h: sel.height, a: sel.angle || 0 }; try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
        }
        // round-5 F (connect-from-region): pressing a SOURCE-region nub draws an arrow whose START is the drawn region.
        const srNub = this._sourceNubAt(sp);
        if (srNub) { mode = 'connect'; created = makeLinear(srNub.x, srNub.y, 'arrow', { stroke: this.strokeColor, strokeWidth: 2 }); created.startBinding = { group: { ids: [], regions: [srNub.region] } }; created._srcRegion = srNub.region; this.scene.elements.push(created); this._pendingSourceRegion = null; try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; } // _srcRegion marker → a tiny tap re-arms the pending source region in onUp
        // round-5 B (select-then-connect): pressing a GROUP nub on a ≥2 multi-selection draws an arrow BOUND to the whole group.
        // BEFORE the single-nub check so it wins on a multi-selection. Keep the selection (the group target) — don't clear it.
        const gnub = this._groupNubAt(sp);
        if (gnub) { mode = 'connect'; created = makeLinear(gnub.x, gnub.y, 'arrow', { stroke: this.strokeColor, strokeWidth: 2 }); created.startBinding = { group: { ids: gnub.ids.slice() } }; this.scene.elements.push(created); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
        // CONNECT: pressing a hover-nub draws a BOUND connection FROM the hovered element (no tool switch). AFTER the handle
        // block so rotate/resize handles win where the top nub overlaps the rotate handle.
        const nub = this._nubAt(sp);
        if (nub && this._connHover && !this._connHover.isDeleted) { mode = 'connect'; created = makeLinear(nub.x, nub.y, 'arrow', { stroke: this.strokeColor, strokeWidth: 2 }); created.startBinding = { elementId: this._connHover.id }; this.scene.elements.push(created); this.selected.clear(); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; }
        const hit = this._hitTopAt(down.x, down.y); downRef = null;
        // IO-1: a click on a task node's checkbox toggles its status (and does NOT start a move/select).
        if (hit && hit.type === 'task') { const cb = this._taskCheckboxRect(hit); if (down.x >= cb.x && down.x <= cb.x + cb.w && down.y >= cb.y && down.y <= cb.y + cb.h) { this._toggleTaskNode(hit); try { host.setPointerCapture(e.pointerId); } catch (_e) {} mode = null; return; } }
        if (hit) {
          if (hit.type === 'text' && hit.runs && hit.runs.length) downRef = { id: hit.id, wasSelected: this.selected.has(hit.id) }; // CANVAS-SEG: capture pre-selection state for click-again navigate
          if (!this.selected.has(hit.id)) { if (!e.shiftKey) this.selected.clear(); const gid = this._topGroup(hit); if (gid) { for (const id of this._groupMembers(gid)) this.selected.add(id); } else this.selected.add(hit.id); }
          const mk = (el) => ({ el, x0: el.x, y0: el.y, pts0: (el.type === 'freedraw' || el.type === 'arrow' || el.type === 'line') ? el.points.map((p) => [p[0], p[1]]) : null });
          mode = 'move'; moveEls = [...this.selected].map((id) => this._byId(id)).filter(Boolean).map(mk);
          this._elDrag = true; this._dragLayerValid = false; // PERF: drag a static-layer cache (build once, then blit + draw only the movers)
          // P1.0: moving a frame carries the elements inside it.
          const seen = new Set(this.selected);
          for (const m of [...moveEls]) { if (m.el.type === 'frame') { for (const c of this._frameChildren(m.el)) if (!seen.has(c.id)) { seen.add(c.id); moveEls.push(mk(c)); } if (m.el.collapsed) for (const c of this.scene.elements) if (c.secHidden === m.el.id && !c.isDeleted && !seen.has(c.id)) { seen.add(c.id); moveEls.push(mk(c)); } } } // a COLLAPSED section is shrunk to its title bar, so _frameChildren (center-in) misses its now-outside children → also drag the hidden ones it owns

          // S10: press-and-hold a record/board card to open it (cancelled by any drag or release).
          const lpMs = (this.plugin._settings && this.plugin._settings.longPressMs) || 0;
          if (lpMs && (hit.type === 'record' || hit.type === 'board')) { const tgt = hit; lpTimer = setTimeout(() => { lpTimer = null; if (!moved && mode === 'move') this._openCard(tgt); }, lpMs); }
        } else { mode = 'pan'; sx = e.clientX; sy = e.clientY; cx0 = this.camera.x; cy0 = this.camera.y; if (!e.shiftKey) this.selected.clear(); this.wrap.classList.add('pxc-panning'); }
      } else if (this.tool === 'frame') {
        mode = 'create'; created = makeFrame(down.x, down.y, 0, 0); this.scene.elements.unshift(created); this.selected.clear(); // P1.0: frames render behind (unshift to array front)
      } else if (this.tool === 'laser') {
        mode = 'laser'; this._laser = [{ x: down.x, y: down.y, t: Date.now() }]; this.dirty = true; // S6: transient trail
      } else if (this.tool === 'pen') {
        mode = 'pen'; created = makeFreedraw(down.x, down.y, { stroke: this.strokeColor, strokeWidth: 3 }); this._penSm = { x: down.x, y: down.y }; this.scene.elements.push(created); this._lassoPriorSel = null; // round-5 G: keep the selection (don't clear) so "select a text → circle a region with the pen → Cite" captures BOTH (the pen's current selection is preserved directly; don't inherit a stale lasso prior)
      } else if (this.tool === 'eraser') {
        mode = 'erase'; const hit = this._hitTopAt(down.x, down.y); if (hit) { hit.isDeleted = true; this.scheduleSave(); }
      } else if (this.tool === 'text') {
        const el = makeText(down.x, down.y, { stroke: this.strokeColor, fontSize: 24 });
        this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
        this.tool = 'select'; this._syncToolbar(); this._editText(el); this.dirty = true; return;
      } else if (this.tool === 'card') {
        this.tool = 'select'; this._syncToolbar(); this._newRecordCardAt(down.x, down.y); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; // EDIT-2: click to drop a new record card (default Notes/Captures); the property panel opens on its selection
      } else if (this.tool === 'datacore') {
        this.tool = 'select'; this._syncToolbar(); this._insertQueryNode('dc: @task', down.x, down.y); try { host.setPointerCapture(e.pointerId); } catch (_e) {} return; // EDIT-4: drop a Datacore query node; selecting it mounts the live interactive view
      } else if (this.tool === 'arrow' || this.tool === 'line') {
        mode = 'linear'; created = makeLinear(down.x, down.y, this.tool, { stroke: this.strokeColor, strokeWidth: 2 }); this.scene.elements.push(created); this.selected.clear();
      } else if (this.tool === 'crop') {
        mode = 'crop'; this._cropRect = { x: down.x, y: down.y, w: 0, h: 0 }; // round-5 G: keep the selection so a region-mark can combine with a selected text in the Cite
      } else if (this.tool === 'lasso') {
        mode = 'lasso'; this._lasso = [[down.x, down.y]]; this._lassoPriorSel = (!e.shiftKey && this.selected.size) ? [...this.selected] : null; if (!e.shiftKey) this.selected.clear(); // round-5 G: remember the prior selection so a lasso that marks an image REGION (a Cite intent) restores it → "select a text → lasso a region → Cite" captures BOTH
      } else {
        mode = 'create'; created = makeRect(down.x, down.y, 0, 0, { type: this.tool, stroke: this.strokeColor, fill: this.fillColor, fillStyle: this.fillStyle }); this.scene.elements.push(created); this.selected.clear();
      }
      try { host.setPointerCapture(e.pointerId); } catch (_e) {} this.dirty = true;
    };
    const onMove = (e) => {
      if (this._miniDragging) { const rct = this.wrap.getBoundingClientRect(); this._miniTeleport(e.clientX - rct.left, e.clientY - rct.top); return; } // MINIMAP drag
      if (!mode) { // hover (no drag): cursor over an inline ref / a connect-nub
        if (this.tool === 'select' && !this.editingId && !this._present && !this._eyedrop) {
          const w = this._worldAt(e); const hit = this._hitTopAt(w.x, w.y);
          const over = hit && hit.type === 'text' && hit.runs && hit.runs.length && hitInlineRef(hit, w.x, w.y);
          // CONNECT: show edge nubs on the hovered connectable element (drag a nub → a bound connection, no tool switch).
          // SECTIONS (iter 2): a frame (section) is now eligible too — `_hitTopAt` returns it only on its BORDER/title
          // (interior passes through to children), so hovering a section's edge shows nubs → drag one to connect FROM the
          // WHOLE section (its `_connNubsFor` edge-nubs clamp into view for a big section). Completes iter 1's bind-TO.
          const ch = (hit && hit.type !== 'arrow' && hit.type !== 'line') ? hit : null;
          if ((ch && ch.id) !== (this._connHover && this._connHover.id)) { this._connHover = ch; this.dirty = true; }
          const connId = (hit && (hit.type === 'arrow' || hit.type === 'line')) ? hit.id : null; // C2: hovering a connection → the info card
          if (connId !== this._connInfoHover) { this._connInfoHover = connId; this.dirty = true; }
          // round-4 @ref PREVIEW: hovering a ref chip (whole-element) or an inline ref run → a popover previewing the record it
          // points at (title + first lines). `over` is the inline ref run under the cursor (from hitInlineRef above).
          let refT = null;
          if (hit && hit.isRef && hit.refKind !== 'image' && hit.refGuid) refT = { kind: hit.refKind, guid: hit.refGuid, label: hit.refAlias || hit.refLabel };
          else if (over && over.kind !== 'image' && over.guid) refT = { kind: over.kind, guid: over.guid, label: over.alias || over.label };
          const refKey = refT ? (refT.kind + ':' + refT.guid) : null;
          if (refKey !== this._refHoverKey) { this._refHoverKey = refKey; if (refT) this._showRefPreview(refT, e.clientX, e.clientY); else this._hideRefPreview(); }
          const rct = this.wrap.getBoundingClientRect(); const onNub = !!this._nubAt({ x: e.clientX - rct.left, y: e.clientY - rct.top });
          const cur = onNub ? 'crosshair' : (over ? 'pointer' : ''); if (this.wrap.style.cursor !== cur) this.wrap.style.cursor = cur;
        } else { if (this._connHover) { this._connHover = null; this.dirty = true; } if (this._connInfoHover) { this._connInfoHover = null; this.dirty = true; } if (this._refHoverKey) { this._refHoverKey = null; this._hideRefPreview(); } }
        return;
      }
      moved = true; clearLP(); this._connHover = null; this._connInfoHover = null; if (this._refHoverKey) { this._refHoverKey = null; this._hideRefPreview(); } // S10: any drag cancels a pending long-press open; also hide the connect-nubs + hover info card + ref preview during a drag
      if (mode === 'pen' && e.pointerType === 'touch') return; // S4: palm rejection — ignore stray touch during a pen stroke
      if (mode === 'pan') { this.camera.x = cx0 - (e.clientX - sx) / this.camera.zoom; this.camera.y = cy0 - (e.clientY - sy) / this.camera.zoom; this._panMode = true; this._lastCamChange = this._now(); this.dirty = true; return; } // _panMode → render() translates the oversized layer via CSS transform (compositor pan), no raster
      const w = this._worldAt(e);
      if (mode === 'laser') { this._laser.push({ x: w.x, y: w.y, t: Date.now() }); this.dirty = true; return; } // S6
      if (mode === 'pen' && created) {
        // STABILIZER: low-pass the captured points so mouse jitter doesn't make the stroke feel jagged/lasso-like.
        // Each point eases toward the raw position (still responsive); paired with the quadratic render = smooth ink.
        const a = 0.5, push = (px, py) => { const s = this._penSm || (this._penSm = { x: px, y: py }); s.x += (px - s.x) * a; s.y += (py - s.y) * a; created.points.push([s.x, s.y]); };
        const ces = (e.getCoalescedEvents ? e.getCoalescedEvents() : null);
        if (ces && ces.length) { for (const ce of ces) { const cw = this._worldAt(ce); push(cw.x, cw.y); } } else push(w.x, w.y);
        freedrawBBox(created); this.dirty = true; return;
      }
      if (mode === 'erase') { const hit = this._hitTopAt(w.x, w.y); if (hit && !hit.isDeleted) { hit.isDeleted = true; this.dirty = true; this.scheduleSave(); } return; }
      if ((mode === 'linear' || mode === 'connect') && created) { created.points[1] = [w.x, w.y]; linearBBox(created); const startElId = created.startBinding && created.startBinding.elementId; const bh = this._bindableAt(w.x, w.y, created.id, startElId) || this._nearestBindable(w.x, w.y, 44, created.id, startElId); this._bindHover = bh; this._bindHoverSub = bh ? this._bindingFor(bh, w.x, w.y) : null; this.dirty = true; return; } // CP-5: dashed focus indicator on the shape the end will bind to — forgiving (snaps to a nearby target), EXCLUDING the source (B2). Phase 4: _bindHoverSub carries the line/region the indicator should outline. 'connect' = a nub-drag.
      if (mode === 'create' && created) { const x0 = this._snap(down.x), y0 = this._snap(down.y), x1 = this._snap(w.x), y1 = this._snap(w.y); created.x = x0; created.y = y0; created.width = x1 - x0; created.height = y1 - y0; this.dirty = true; return; }
      if (mode === 'crop' || mode === 'regionmark') { this._cropRect = { x: Math.min(down.x, w.x), y: Math.min(down.y, w.y), w: Math.abs(w.x - down.x), h: Math.abs(w.y - down.y) }; this.dirty = true; return; } // F2: region-mark reuses the crop marquee
      if (mode === 'lasso' || mode === 'grouplasso') { if (this._lasso) { const ces = (e.getCoalescedEvents ? e.getCoalescedEvents() : null); if (ces && ces.length) { for (const ce of ces) { const cw = this._worldAt(ce); this._lasso.push([cw.x, cw.y]); } } else this._lasso.push([w.x, w.y]); } this.dirty = true; return; } // round-5 B: grouplasso reuses the lasso poly capture
      if (mode === 'move' && moveEls) { let dx = w.x - down.x, dy = w.y - down.y; if (this._gridOn()) { dx = this._snap(dx); dy = this._snap(dy); } for (const m of moveEls) { if (m.pts0) { m.el.points = m.pts0.map(([px, py]) => [px + dx, py + dy]); } m.el.x = m.x0 + dx; m.el.y = m.y0 + dy; } this._updateBindings(); this.dirty = true; return; } // CONNECTIONS: rebind every frame — a bound endpoint/label must follow ANY moved target (card/image/text), not only rough shapes. _updateBindings early-returns when nothing is bound.
      if (mode === 'rotate' && rotEl) { const ang = Math.atan2(w.y - rotCenter.y, w.x - rotCenter.x); let na = rotStart + (ang - rotPtr0); if (e.shiftKey) na = Math.round(na / (Math.PI / 12)) * (Math.PI / 12); rotEl.angle = na; this._updateBindings(); this.dirty = true; return; }
      if (mode === 'resize' && rsEl) { const pw = this._gridOn() ? { x: this._snap(w.x), y: this._snap(w.y) } : w; this._applyResize(rsEl, rsHandle, rs0, pw); this._updateBindings(); this.dirty = true; return; }
    };
    const onUp = (e) => {
      if (this._miniDragging) { this._miniDragging = false; try { host.releasePointerCapture(e.pointerId); } catch (_e) {} return; } // MINIMAP
      if (!mode) return; clearLP(); // S10: a quick tap-release never triggers the long-press open
      if (mode === 'create' && created) {
        normRect(created);
        if (created.width < 4 && created.height < 4) created.isDeleted = true;
        else { if (created.width < 2) created.width = 8; if (created.height < 2) created.height = 8; this.selected.clear(); this.selected.add(created.id); this.tool = 'select'; this._syncToolbar(); this.scheduleSave(); }
        created = null;
      } else if ((mode === 'linear' || mode === 'connect') && created) { // 'connect' = a nub-drag (startBinding already set to the source element); same finalize as a tool-drawn arrow
        linearBBox(created);
        const dx = created.points[1][0] - created.points[0][0], dy = created.points[1][1] - created.points[0][1];
        if (Math.hypot(dx, dy) < 4) { created.isDeleted = true; if (created._srcRegion) { this._pendingSourceRegion = { region: created._srcRegion, nubs: null }; this.dirty = true; } } // round-5 F: a tiny tap on the source nub drew no connection → keep the source region pending (don't discard it on a fat-finger tap)
        else {
          const lp = created.points[created.points.length - 1], sp0 = created.points[0];
          let startElId = created.startBinding && created.startBinding.elementId; // 'connect' nub-drag: set in onDown
          if (mode !== 'connect') { const s0 = this._bindableAt(sp0[0], sp0[1], created.id); if (s0) { created.startBinding = this._bindingFor(s0, sp0[0], sp0[1]); startElId = s0.id; } } // tool-drawn arrow: bind the START first so we can EXCLUDE it from the end-snap. Phase 4: _bindingFor attaches the targeted LINE / image REGION
          const s1 = this._bindableAt(lp[0], lp[1], created.id, startElId) || this._nearestBindable(lp[0], lp[1], 44, created.id, startElId); // forgiving end-bind, EXCLUDING the source (B2: a big source's bbox no longer snaps the end back onto itself → no collapse)
          if (s1) created.endBinding = this._bindingFor(s1, lp[0], lp[1]);
          // round-5 B/F: a group/source-region arrow (start = a group of ids OR image regions) must not snap its END back onto a start MEMBER or a start REGION's image (self-loop). Drop such an end-bind → free endpoint.
          if (created.endBinding && created.endBinding.elementId && created.startBinding && created.startBinding.group) { const g = created.startBinding.group, eid = created.endBinding.elementId; if ((g.ids && g.ids.indexOf(eid) >= 0) || (g.regions && g.regions.some((r) => r.elId === eid))) created.endBinding = null; }
          this._updateBindings();
          // F2 drop-to-mark + C3: dropped on an image/shape with NO region → offer WHOLE vs a region via a two-button prompt.
          if (s1 && (s1.type === 'image' || isRoughShape(s1.type)) && created.endBinding && !created.endBinding.frac && !created.endBinding.lineGuid) {
            this._pendingRegionLink = { arrowId: created.id, elId: s1.id, key: 'endBinding' };
            const what = s1.type === 'image' ? 'image' : 'shape', sp2 = this.camera.worldToScreen(lp[0], lp[1]);
            this._showRegionChoice(what, sp2.x, sp2.y);
          }
          // round-5 A: dropped on a TEXT note carrying inline refs → offer "Whole box" vs each specific inline ref (the screenshot's Pastabilites / pasta). Default = whatever the drop landed on (refGuidTarget already set if it landed on a run).
          else if (s1 && s1.type === 'text' && s1.runs && s1.runs.some((r) => r && r.t === 'ref' && (r.guid || r.lineGuid)) && created.endBinding) {
            this._pendingRegionLink = { arrowId: created.id, elId: s1.id, key: 'endBinding', refOnly: true };
            const sp2 = this.camera.worldToScreen(lp[0], lp[1]);
            this._showRefChoice(created, s1, 'endBinding', sp2.x, sp2.y);
          }
          // round-5 D (drop-in-void): released on EMPTY canvas while the START is anchored → a menu to link the end: Pen / Box a
          // REGION (drawn target), or Lasso elements (group). Replaces the old auto-arm of the element-group lasso.
          else if (!s1 && (created.startBinding)) {
            const sp2 = this.camera.worldToScreen(lp[0], lp[1]);
            this._showRegionLinkChoice(created, 'endBinding', sp2.x, sp2.y);
          }
          if (created._srcRegion) delete created._srcRegion; // round-5 F: drop the transient marker so it doesn't serialize onto the committed arrow
          this.selected.clear(); this.selected.add(created.id); this.tool = 'select'; this._syncToolbar(); this.scheduleSave();
        }
        created = null;
      } else if (mode === 'pen' && created) { freedrawBBox(created); if (this._pendingRegionDraw && this._pendingRegionDraw.mode === 'pen') { const pts = created.points.slice(); created.isDeleted = true; created = null; this._finishRegionDraw(pts); this.scheduleSave(); } else { this.scheduleSave(); this._lastFreedraw = created; created = null; } } // round-5 D: a region-draw pen stroke binds the arrow + discards the stroke (it's a gesture, not a kept shape)
      else if (mode === 'crop') {
        const rect = this._cropRect; this._cropRect = null;
        if (rect && rect.w > 3 && rect.h > 3) { const img = this._topImageIn(rect); if (img) { this._setPendingImgRegion(img, rect, null, true); this.tool = 'select'; this._syncToolbar(); } else { try { this.plugin.ui.addToaster({ title: 'Plexus: drag the crop box over an image.', dismissible: true }); } catch (_e) {} } } // round-5 G: keepSel=true → a cropped region can combine with a selected text in the Cite
      }
      else if (mode === 'regionmark') { // F2: finalize the drop-to-mark region → write frac into the connection's binding (else keep the whole-element link)
        const rect = this._cropRect; this._cropRect = null; const prl = this._pendingRegionLink; this._pendingRegionLink = null;
        const rel = prl && this._byId(prl.elId), arrow = prl && this._byId(prl.arrowId);
        if (rect && rect.w > 3 && rect.h > 3 && rel && !rel.isDeleted && arrow && !arrow.isDeleted && arrow[prl.key]) {
          const frac = this._imgRegionFrac(rel, rect);
          if (frac) { arrow[prl.key] = { elementId: rel.id, frac }; this._updateBindings(); this.scheduleSave(); try { this.plugin.ui.addToaster({ title: 'Linked to the marked region.', dismissible: true }); } catch (_e) {} }
        }
        this.dirty = true;
      }
      else if (mode === 'lasso') {
        const poly = this._lasso || []; this._lasso = null;
        if (this._pendingRegionDraw && this._pendingRegionDraw.mode === 'lasso') { this._finishRegionDraw(poly); } // round-5 D: a region-draw lasso binds the arrow instead of selecting
        else { if (poly.length >= 3) this._selectFromLoop(poly); this.tool = 'select'; this._syncToolbar(); }
      }
      else if (mode === 'grouplasso') { // round-5 B: the lasso enclosed a group → bind the pending arrow's end to it (anything → group)
        const poly = this._lasso || []; this._lasso = null; const pgl = this._pendingGroupLink; this._pendingGroupLink = null;
        const arrow = pgl && this._byId(pgl.arrowId);
        if (arrow && !arrow.isDeleted && poly.length >= 3) {
          const otherB = arrow[pgl.key === 'endBinding' ? 'startBinding' : 'endBinding'], exId = otherB && otherB.elementId; // self-loop guard: the OTHER endpoint's element must not become a member of THIS endpoint's group (parity with the nub-drag guard)
          let ids = this._idsInLoop(poly, arrow.id); if (exId) ids = ids.filter((id) => id !== exId);
          // round-5 B: "part of the image" — if the lasso covers a SUB-AREA of an image, capture it as a REGION (frac/fracPoly)
          // instead of the whole image. 2026-06-21: via _imageRegionFromLasso (intersection-based) so it fires even when the
          // lasso also encloses a far-away text box (the old full-bbox test missed it).
          const regions = [];
          let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
          for (const p of poly) { lx0 = Math.min(lx0, p[0]); ly0 = Math.min(ly0, p[1]); lx1 = Math.max(lx1, p[0]); ly1 = Math.max(ly1, p[1]); }
          const lrect = { x: lx0, y: ly0, w: lx1 - lx0, h: ly1 - ly0 };
          const reg = this._imageRegionFromLasso(poly, lrect, exId);
          if (reg) { ids = ids.filter((id) => id !== reg.img.id); regions.push({ elId: reg.img.id, frac: reg.frac, fracPoly: reg.fracPoly }); }
          if (ids.length || regions.length) { const group = { ids }; if (regions.length) group.regions = regions; arrow[pgl.key] = { group }; this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.scheduleSave(); const n = ids.length + regions.length; try { this.plugin.ui.addToaster({ title: 'Connected to a group of ' + n + (regions.length ? ' (incl. ' + regions.length + ' image region' + (regions.length > 1 ? 's' : '') + ')' : '') + '.', dismissible: true }); } catch (_e) {} }
          else try { this.plugin.ui.addToaster({ title: 'No elements in the lasso — the connection end is unchanged.', dismissible: true }); } catch (_e) {}
        }
        this.tool = 'select'; this._syncToolbar(); this.dirty = true;
      }
      else if (mode === 'move' && moveEls) {
        if (moved) { this.scheduleSave(); this._timelineRedateMoved(moveEls); } // TIMELINE: dragging a timeline card re-dates it
        else if (downRef && downRef.wasSelected) { // CANVAS-SEG: second click on an already-selected runs-text → navigate the ref under the cursor; deferred so a dblclick edits instead
          const el = this._byId(downRef.id), run = el && hitInlineRef(el, down.x, down.y);
          if (run) { if (this._pendingNav) clearTimeout(this._pendingNav); this._pendingNav = setTimeout(() => { this._pendingNav = null; this._openCard({ refKind: run.kind, refGuid: run.guid, refLineGuid: run.lineGuid }); }, 230); }
        }
      }
      else if ((mode === 'resize' || mode === 'rotate') && moved) { this.scheduleSave(); }
      else if (mode === 'pan' && moved) { this._saveCamera(); this._panMode = false; } // pan ended → next render full-rasters the oversized layer at the new camera + resets the CSS transform
      this.wrap.classList.remove('pxc-panning'); this.wrap.classList.remove('pxc-pencursor'); // S4
      if (this._penForced) { this._penForced = false; this.tool = 'select'; this._syncToolbar(); } // S4: restore the user's tool after a pen stroke
      try { host.releasePointerCapture(e.pointerId); } catch (_e) {}
      mode = null; moveEls = null; rsEl = null; rotEl = null; this._bindHover = null; this._bindHoverSub = null; this._connHover = null; // clear the connect-nub hover so it re-resolves on the next hover
      if (this._elDrag) { this._elDrag = false; this._dragLayerValid = false; this._cacheValid = false; } // drag ended → crisp re-render + rebuild caches
      this.dirty = true;
    };
    const onWheel = (e) => { e.preventDefault(); this._abortCamAnim(); const st = this.plugin._settings || {}; const rect = this.wrap.getBoundingClientRect(); const wz = st.wheelZoom !== false; const zoomNow = e.ctrlKey ? !wz : wz; if (zoomNow) { this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012)); if (this._panMode) { this._panMode = false; if (this._panEndT) { clearTimeout(this._panEndT); this._panEndT = null; } } } else { this.camera.x += e.deltaX / this.camera.zoom; this.camera.y += e.deltaY / this.camera.zoom; this._panMode = true; this._schedulePanEnd(); this._lastCamChange = this._now(); } this.dirty = true; this._saveCamera(); }; // S3: wheel zoom vs scroll. PAN branch arms _panMode (compositor CSS-translate) + schedules a debounced end (wheel has no pointerup) so the layer re-rasters crisp when the trackpad pan stops. PAN branch sets _lastCamChange to ARM the camera-blit fast-path (line ~4713 `moving` gate) — pointer-drag pan sets it (2301) but wheel/trackpad pan didn't, so every trackpad-pan frame fell through to a full crisp re-render (the lag, worst zoomed-in with upscaled images). Zoom branch intentionally omits it (keeps wheel-zoom's crisp per-frame render, no blur regression).
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
        if (k === ']') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this._bringToFront(); else this._bringForward(); return; } // CP-1: ⌘] forward, ⌘⇧] front
        if (k === '[') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this._sendToBack(); else this._sendBackward(); return; } // CP-1: ⌘[ backward, ⌘⇧[ back
        if (k === 'f') { e.preventDefault(); e.stopPropagation(); this._openSearch(); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selected.size) { e.preventDefault(); for (const id of this.selected) { const el = this._byId(id); if (el) el.isDeleted = true; } this.selected.clear(); this.dirty = true; this.scheduleSave(); } return; }
      if (this.selected.size && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const step = e.shiftKey ? 10 : 1; const dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0); const dy = (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0); this._nudge(dx, dy); return; }
      const mmSel = this._singleSel(); // P0.2: Tab/Enter grow the mind map when a node is selected
      if (mmSel && mmSel.mmRoot && mmSel.type === 'text') {
        if (e.key === 'Tab') { e.preventDefault(); this._mmAddChild(mmSel); return; }
        if (e.key === 'Enter') { e.preventDefault(); this._mmAddSibling(mmSel); return; }
        if (e.altKey) { // CP-3 v3c: Alt-key branch ops + spatial nav
          const k = e.key.toLowerCase();
          if (k === 'c') { e.preventDefault(); this._mmCopyBranch(mmSel); return; }
          if (k === 'x') { e.preventDefault(); this._mmCutBranch(mmSel); return; }
          if (k === 'v') { e.preventDefault(); this._mmPasteBranch(mmSel); return; }
          if (k === 'b') { e.preventDefault(); this._mmToggleBoundary(mmSel); return; }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this._mmNav(mmSel, e.key.replace('Arrow', '').toLowerCase()); return; }
        }
      }
      // ENTER / F2 → edit the selected text element inline — a reliable way into edit mode WITHOUT click-navigating a
      // ref-only box (one click selects it without navigating, then Enter edits). Image chips (isRef) keep dblclick=open.
      { const se = this._singleSel(); if (se && se.type === 'text' && !se.isRef && !se.mmRoot && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); e.stopPropagation(); this._editText(se); return; } }
      const map = { v: 'select', r: 'rectangle', o: 'ellipse', d: 'diamond', a: 'arrow', p: 'pen', t: 'text', e: 'eraser', c: 'crop', f: 'frame', l: 'laser', s: 'lasso' };
      if (map[e.key]) { this.tool = map[e.key]; this._syncToolbar(); if (this._connHover) { this._connHover = null; this.dirty = true; } if (this._pendingRegionLink) { this._pendingRegionLink = null; this._closeRegionChoice(); this.dirty = true; } if (this._pendingGroupLink) { this._pendingGroupLink = null; this.dirty = true; } if (this._pendingRegionDraw) { this._pendingRegionDraw = null; this.dirty = true; } if (this._pendingSourceRegion) { this._pendingSourceRegion = null; this.dirty = true; } } // tool switch → drop a stale connect-hover / pending region-link / group-link / region-draw / source-region (round-5 F)
      if (e.key === 'Escape') { this.selected.clear(); this._pendingImgRegion = null; this._pendingRegionLink = null; this._pendingGroupLink = null; this._pendingRegionDraw = null; this._pendingSourceRegion = null; this._closeRegionChoice(); this.tool = 'select'; this._syncToolbar(); this.dirty = true; } // F2/C3/round-5 B/D/F: Esc keeps the whole-element link + disarms a pending group-lasso / region-draw / source-region
    };
    const onDblClick = (e) => {
      if (this._pendingNav) { clearTimeout(this._pendingNav); this._pendingNav = null; } // CANVAS-SEG: dblclick = edit, cancel the pending single-click navigate
      const dblText = (this.plugin._settings ? this.plugin._settings.dblClickText !== false : true); // S2
      const w = this._worldAt(e); const hit = this._hitTopAt(w.x, w.y);
      if (hit && hit.type !== 'arrow' && hit.type !== 'line' && this._xrefByEl && this._xrefByEl[hit.id] && this._xrefByEl[hit.id].length && hit.type !== 'record' && hit.type !== 'board' && !(hit.type === 'text' && (hit.isRef || hit.refGuid)) && !hit.link) { this._jumpToCiting(this._xrefByEl[hit.id][0].lineGuid); return; } // cited element → jump to its note line (connectors fall through to the label editor)
      if (hit && hit.link && hit.type !== 'text' && hit.type !== 'arrow' && hit.type !== 'line') { try { window.open(hit.link, '_blank'); } catch (_e) {} return; } // CP-7/C-CF6: per-element external URL link
      if (hit && hit.type === 'text') { if (hit.isRef || hit.refGuid) { this._openCard(hit); return; } if (!dblText) return; this.selected.clear(); this.selected.add(hit.id); this._editText(hit); } // P1.6: ref node opens its record/line (line refs may have a null parent record → gate on isRef)
      else if (hit && hit.type === 'record') { if ((w.y - hit.y) < 28) this._openCard(hit); else this._editCardBody(hit); } // title band → open the record (rename there); body → edit body lines inline (writes back)
      else if (hit && hit.type === 'linecard') { this._editCardBody(hit); } // EDIT the transcluded line + its children inline, written back to the source via setSegments
      else if (hit && (hit.type === 'arrow' || hit.type === 'line')) { this._editConnLabel(hit); } // CONNECTION: dblclick a connector → add/edit its midpoint label (a bound, connectable text element)
      else if (hit && hit.type === 'query') { this._promptText('Query (Thymer search syntax):', hit.query).then((q) => { if (q != null) { hit.query = q; this.dirty = true; this.scheduleSave(); } }); }
      else if (hit && hit.type === 'rollup') { this._promptText('Roll-up query:', hit.query).then((q) => { if (q == null) return; this._promptText('Aggregation (count | %done | sum:Prop | avg:Prop):', hit.agg || 'count').then((a) => { if (a == null) return; hit.query = q; hit.agg = a; this._invalidateRollups(); this.dirty = true; this.scheduleSave(); }); }); } // ROLL-UP: dblclick edits query + agg
      else if (hit && hit.type === 'table') { const cell = this._tableCellAt(hit, w.x, w.y); if (cell && cell.prop) this._editTableCell(hit, cell); else this._configureTable(hit); } // LIVE TABLE: dblclick a data cell edits it; header/title/empty reconfigures
      else if (hit && hit.type === 'board') { this._openCard(hit); }
      else if (hit && hit.type === 'frame') { this._promptText('Section name:', hit.name || 'Section').then((n) => { if (n != null) { hit.name = n; this.dirty = true; this.scheduleSave(); } }); } // P1.0 rename
      else if (!hit && dblText) { const el = makeText(w.x, w.y, { stroke: this.strokeColor, fontSize: 24 }); this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this._editText(el); }
    };
    const onContextMenu = (e) => { if (this.plugin._settings && this.plugin._settings.panRightMouse) e.preventDefault(); }; // S3: suppress menu when right-drag pans
    host.addEventListener('pointerdown', onDown); host.addEventListener('pointermove', onMove); host.addEventListener('pointerup', onUp);
    const onPtrCancel = () => { if (this._panMode) { this._panMode = false; this.dirty = true; } if (this._elDrag) { this._elDrag = false; this._dragLayerValid = false; this._cacheValid = false; this.dirty = true; } if (this._pendingGroupLink) { this._pendingGroupLink = null; this.dirty = true; } if (this._pendingRegionDraw) { this._pendingRegionDraw = null; this.dirty = true; } if (this._lasso) { this._lasso = null; this.dirty = true; } }; // pan/drag interrupted (no pointerup) → drop compositor-pan mode + the static-layer freeze + any pending group-lasso (round-5 B), crisp re-raster
    host.addEventListener('pointercancel', onPtrCancel); host.addEventListener('lostpointercapture', onPtrCancel);
    host.addEventListener('wheel', onWheel, { passive: false }); host.addEventListener('keydown', onKey); host.addEventListener('dblclick', onDblClick); host.addEventListener('contextmenu', onContextMenu);
    this._localDisposers.push(() => { clearLP(); host.removeEventListener('pointerdown', onDown); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerup', onUp); host.removeEventListener('pointercancel', onPtrCancel); host.removeEventListener('lostpointercapture', onPtrCancel); host.removeEventListener('wheel', onWheel); host.removeEventListener('keydown', onKey); host.removeEventListener('dblclick', onDblClick); host.removeEventListener('contextmenu', onContextMenu); });
    // images: drag-drop onto the canvas, or paste while the canvas is focused
    const onDragOver = (e) => { if (e.dataTransfer && [...(e.dataTransfer.items || [])].some((it) => it.kind === 'file')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const onDrop = (e) => { const files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return; e.preventDefault(); const w = this._worldAt(e); let i = 0; for (const f of files) { const isSvg = (f.type === 'image/svg+xml') || /\.svg$/i.test(f.name || ''); if (isSvg) { const r = new FileReader(); r.onload = () => this._addSvgAsImage(String(r.result || ''), w.x + i * 24, w.y + i * 24); r.readAsText(f); i++; } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')) { this._addPdf(f, w.x + i * 24, w.y + i * 24); i++; } else if (f.type && f.type.startsWith('image/')) { this._addImageFromFile(f, w.x + i * 24, w.y + i * 24); i++; } } };
    // Paste many formats onto the board: image files (PNG/JPG/GIF/WebP), SVG (as a file OR as copied markup),
    // an <img> copied from a web page (text/html), a remote image URL, or plain text → a text element.
    const onPaste = (e) => {
      if (this.destroyed || this.editingId) return;
      // A <canvas> can't hold focus, so the old activeElement check blocked every paste. Decide ownership:
      // strict = this panel is active / focus is in our wrap; lenient = this canvas is just visible and the
      // user isn't typing in a note. Images/SVG/URLs accept the lenient path; plain-text needs strict (so we
      // never steal a text paste meant for a note). A dedupe guard makes only ONE view handle a given paste.
      const ae = document.activeElement;
      const typing = ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || ''));
      let activePanel = null; try { activePanel = this.plugin.ui.getActivePanel(); } catch (_e) {}
      const strict = (activePanel && this.panel === activePanel) || ae === host || ae === this.iCv || (this.wrap && this.wrap.contains(ae));
      const visible = this.wrap && this.wrap.offsetParent !== null && this.wrap.getBoundingClientRect().width > 60;
      const lenient = strict || (!typing && visible);
      if (!lenient) return;
      const dt = e.clipboardData; if (!dt) return;
      const items = [...(dt.items || [])];
      const plain = (dt.getData && dt.getData('text/plain')) || '';
      const html = (dt.getData && dt.getData('text/html')) || '';
      const imgFile = items.find((it) => it.kind === 'file' && it.type && it.type.startsWith('image/'));
      const svgItem = items.find((it) => it.kind === 'string' && it.type === 'image/svg+xml');
      const isSvgText = /^\s*<svg[\s>]/i.test(plain);
      const htmlImg = /<img\b/i.test(html) ? (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] : null;
      const urlImg = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S*)?$/i.test(plain.trim()) ? plain.trim() : null;
      const hasImage = imgFile || svgItem || isSvgText || htmlImg || urlImg;
      const hasText = !hasImage && plain && !/^\s*[[{]?"?(plexus|type"?\s*:)/i.test(plain) && plain.length < 5000;
      if (!hasImage && !hasText) return;
      if (hasText && !strict) return; // text paste only when the canvas truly has focus
      // dedupe: a document-level paste fires this on every open canvas view
      const nowp = Date.now(); if (this.plugin._lastPaste && nowp - this.plugin._lastPaste < 250) return; this.plugin._lastPaste = nowp;
      e.preventDefault();
      const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
      if (imgFile) { const f = imgFile.getAsFile(); if (f) { if (f.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => this._addSvgAsImage(String(r.result || ''), c.x, c.y); r.readAsText(f); } else this._addImageFromFile(f, c.x, c.y); } return; }
      if (svgItem) { svgItem.getAsString((s) => { if (s) this._addSvgAsImage(s, c.x, c.y); }); return; }
      if (isSvgText) { this._addSvgAsImage(plain, c.x, c.y); return; }
      if (htmlImg) { this._addImageFromUrl(htmlImg, c.x, c.y); return; }
      if (urlImg) { this._addImageFromUrl(urlImg, c.x, c.y); return; }
      if (hasText) { const el = makeText(c.x, c.y, { stroke: this.strokeColor, fontSize: 20 }); el.text = plain.trim(); measureText(el); this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this.dirty = true; this.scheduleSave(); }
    };
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
    if (el.type === 'text' && movesX) { // TEXT WRAP: a horizontal resize sets the wrap width; height follows the wrapped line count
      el.wrapW = Math.max(24, nw);
      if (el.runs && el.runs.length) measureRuns(el); else measureText(el); // sets el.width = wrapW + el.height
      el.x = (sgnX >= 0) ? anchor.x : anchor.x - el.width;       // keep the un-dragged horizontal edge fixed (angle≈0)
      el.y = (sgnY >= 0) ? anchor.y : anchor.y - el.height; el.angle = a;
      return;
    }
    el.width = nw; el.height = nh; el.x = ncx - nw / 2; el.y = ncy - nh / 2; el.angle = a;
  }
  _editConnLabel(arrow) {
    // CONNECTION: find the label bound to this connector, else create one at its midpoint. The label is a normal text element
    // (selectable, can carry @/@@ refs, and is itself BINDABLE → a new arrow can connect from it = chaining). It tracks the
    // connector's midpoint via midBinding (see _updateBindings).
    let label = this.scene.elements.find((e) => !e.isDeleted && e.type === 'text' && e.midBinding && e.midBinding.arrowId === arrow.id);
    if (!label) {
      const m = pxcPolyMidpoint(routedPoints(arrow)) || { x: (arrow.x || 0) + (Math.abs(arrow.width) || 0) / 2, y: (arrow.y || 0) + (Math.abs(arrow.height) || 0) / 2 };
      label = makeText(m.x, m.y, { stroke: this.strokeColor, fontSize: 16 }); label.midBinding = { arrowId: arrow.id };
      this.scene.elements.push(label); this._gridDirty = true;
    }
    this.selected.clear(); this.selected.add(label.id); this._editText(label);
  }
  // round-5 C: find/create the midpoint label of a connection and SET its text (no editor) — used by the typed-relationship
  // presets so the label (which drives the note-side breadcrumb in _reindexBackrefs) reflects the relationship.
  _setConnLabelText(arrow, text) {
    let label = this.scene.elements.find((e) => !e.isDeleted && e.type === 'text' && e.midBinding && e.midBinding.arrowId === arrow.id);
    if (!label) {
      if (!text) return; // nothing to label with, and none exists → leave bare
      const m = pxcPolyMidpoint(routedPoints(arrow)) || { x: (arrow.x || 0) + (Math.abs(arrow.width) || 0) / 2, y: (arrow.y || 0) + (Math.abs(arrow.height) || 0) / 2 };
      label = makeText(m.x, m.y, { stroke: arrow.strokeColor || this.strokeColor, fontSize: 16 }); label.midBinding = { arrowId: arrow.id };
      this.scene.elements.push(label); this._gridDirty = true;
    }
    label.runs = null; label.text = text; label.strokeColor = arrow.strokeColor || label.strokeColor; measureRuns(label); // re-measure so the bbox/midpoint track
  }
  // round-5 C: apply a typed relationship preset to every selected connection — color + line style + arrowheads + a default
  // label. relType is stored on the element (round-trips); the label drives the reindex breadcrumb (e.g. "connection: supports").
  _applyRelPreset(key) {
    const preset = PXC_REL_PRESETS.find((p) => p.key === key); if (!preset) return; let ch = false;
    for (const id of this.selected) { const el = this._byId(id); if (!el || (el.type !== 'arrow' && el.type !== 'line')) continue;
      el.relType = preset.key; el.strokeColor = preset.color; el.lineStyle = preset.lineStyle;
      el.endArrowhead = (preset.heads === 'none') ? null : 'arrow'; el.startArrowhead = (preset.heads === 'double') ? 'arrow' : null;
      this._setConnLabelText(el, preset.label); ch = true;
    }
    if (ch) { this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.dirty = true; this.scheduleSave(); this._connStyleId = null; }
  }
  _setConnLineStyle(style) { let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el && (el.type === 'arrow' || el.type === 'line')) { el.lineStyle = style; ch = true; } } if (ch) { this.dirty = true; this.scheduleSave(); this._connStyleId = null; } }
  _setConnHeads(mode) { let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el && (el.type === 'arrow' || el.type === 'line')) { el.endArrowhead = (mode === 'none') ? null : 'arrow'; el.startArrowhead = (mode === 'double') ? 'arrow' : null; ch = true; } } if (ch) { this._updateBindings(); try { this._reindexBackrefs(); } catch (_e) {} this.dirty = true; this.scheduleSave(); this._connStyleId = null; } } // heads change → dir glyph in the breadcrumb changes
  _setConnColor(color) { let ch = false; for (const id of this.selected) { const el = this._byId(id); if (el && (el.type === 'arrow' || el.type === 'line')) { el.strokeColor = color; el.relType = null; ch = true; } } if (ch) { this.dirty = true; this.scheduleSave(); this._connStyleId = null; } } // a manual color override clears the preset tag
  _editText(el) {
    try { this._closeRefPicker(); } catch (_e) {} // re-entry: kill a leftover picker dropdown before the old _ta is removed
    if (this._ta) { try { this._ta.remove(); } catch (_e) {} this._ta = null; }
    if (this._refBarEl) { try { this._refBarEl.remove(); } catch (_e) {} this._refBarEl = null; } // C1: clear a leftover ref bar
    this.editingId = el.id; this._connHover = null; // entering edit → drop any connect-hover (no phantom nubs around the textarea; review 2b)
    this.dirty = true; try { this.render(); } catch (_e) {} // clear the element off the canvas NOW (same paint the textarea appears in) → no one-frame "double" overlap on entering edit
    const ta = document.createElement('textarea'); ta.className = 'pxc-textedit' + (el.midBinding ? ' pxc-connlabel' : ''); this._ta = ta;
    if (el.midBinding) ta.placeholder = 'Label'; // CONNECTION LABEL: a placeholder + pill (CSS) so an empty label editor reads as a label-in-progress, not a bare box
    ta.value = (el.runs && el.runs.length) ? flattenRuns(el.runs) : (el.text || ''); ta.spellcheck = false;
    let prevFlat = ta.value; // CANVAS-SEG: baseline for mapping each flat edit back onto el.runs
    this._refPrevFlat = () => prevFlat; this._refSetPrevFlat = (v) => { prevFlat = v; }; // _applyRefChip updates the baseline after an inline splice
    const place = () => {
      const z = this.camera.zoom;
      const dk = !!(this.plugin._settings && this.plugin._settings.darkMode) || this._themeDark(); // S7/UX-6: typed text must read on a dark canvas
      ta.style.fontSize = ((el.fontSize || 24) * z) + 'px'; ta.style.color = adaptInk(el.strokeColor || '#1e1e1e', dk); ta.style.fontFamily = (el.fontFamily && el.fontFamily !== 'system-ui, sans-serif') ? el.fontFamily : PLEXUS_DEFAULT_FONT;
      if (el.midBinding) { // B4: a connection LABEL stays CENTERED on the connection midpoint as it grows (was anchored top-left → drifted off the line while typing)
        const a = this._byId(el.midBinding.arrowId), m = (a && (a.type === 'arrow' || a.type === 'line')) ? pxcPolyMidpoint(routedPoints(a)) : { x: el.x + (Math.abs(el.width) || 0) / 2, y: el.y + (Math.abs(el.height) || 0) / 2 };
        const s = this.camera.worldToScreen(m.x, m.y);
        ta.style.left = s.x + 'px'; ta.style.top = s.y + 'px'; ta.style.transform = 'translate(-50%,-50%)'; ta.style.textAlign = 'center';
        ta.style.whiteSpace = 'pre'; ta.style.width = ''; ta.style.minWidth = Math.max(20, (el.width || 40) * z) + 'px';
        return;
      }
      const s = this.camera.worldToScreen(el.x, el.y);
      ta.style.left = s.x + 'px'; ta.style.top = s.y + 'px';
      if (el.wrapW > 0) { ta.style.whiteSpace = 'pre-wrap'; ta.style.width = (el.wrapW * z) + 'px'; ta.style.minWidth = ''; } // TEXT WRAP: the editor wraps to match the rendered box
      else { ta.style.whiteSpace = 'pre'; ta.style.width = ''; ta.style.minWidth = Math.max(20, (el.width || 40) * z) + 'px'; }
    };
    place(); this.wrap.appendChild(ta);
    const grow = () => { ta.style.height = '0px'; ta.style.height = ta.scrollHeight + 'px'; };
    // C1 (round 3): inline links are hard to click in the flat textarea → surface each ref as a clickable ↗ chip beside the
    // editor that navigates without leaving edit mode. Rebuilt when the runs change; repositioned with the editor.
    const positionRefBar = () => { if (!this._refBarEl) return; try { const taR = ta.getBoundingClientRect(), wR = this.wrap.getBoundingClientRect(); this._refBarEl.style.left = Math.max(2, taR.left - wR.left) + 'px'; this._refBarEl.style.top = Math.max(2, (taR.top - wR.top) - (this._refBarEl.offsetHeight || 28) - 5) + 'px'; } catch (_e) {} };
    const buildRefBar = () => {
      if (this._refBarEl) { try { this._refBarEl.remove(); } catch (_e) {} this._refBarEl = null; }
      const refs = (el.runs || []).filter((r) => r && r.t === 'ref'); if (!refs.length) return;
      const bar = document.createElement('div'); bar.className = 'pxc-refbar'; this._refBarEl = bar;
      for (const r of refs) { const rr = r; const chip = document.createElement('span'); chip.className = 'pxc-refchip'; const ic = document.createElement('span'); ic.textContent = '↗'; chip.appendChild(ic); const tx = document.createElement('span'); tx.className = 'pxc-rc-txt'; tx.textContent = rr.alias || rr.label || 'ref'; chip.appendChild(tx); chip.title = 'Open this link'; chip.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); this._openCard({ refKind: rr.kind, refGuid: rr.guid, refLineGuid: rr.lineGuid }); }); bar.appendChild(chip); }
      this.wrap.appendChild(bar); positionRefBar();
    };
    this._refRebuildBar = buildRefBar; buildRefBar();
    this._refRefresh = () => { try { place(); grow(); positionRefBar(); } catch (_e) {} }; // CANVAS-SEG: _applyRefChip resizes the textarea after an inline splice
    setTimeout(() => { ta.focus(); ta.select(); grow(); positionRefBar(); }, 0); // C1: reposition the ref bar once the editor has its final height
    this._refPick = { open: false, mode: null, query: '', triggerStart: 0, rows: [], idx: 0, seq: 0, alias: '', dom: null, timer: null }; // A2 picker state
    try { this._injectRefPickerCss(); } catch (_e) {}
    const syncRuns = () => { // map the latest flat edit onto el.runs (dissolving any edited-over ref); fall back to plain
      if (el.runs && el.runs.length) {
        el.runs = applyFlatEdit(el.runs, prevFlat, ta.value);
        if (!hasRefRun(el.runs)) delete el.runs;
      }
      prevFlat = ta.value; el.text = ta.value;
      if (el.runs && el.runs.length) measureRuns(el); else measureText(el);
    };
    const onInput = () => { syncRuns(); place(); grow(); buildRefBar(); this.dirty = true; this._refDetect(ta, el); }; // C1: rebuild the ref bar when runs change (a ref added/dissolved)
    const commit = () => {
      this._closeRefPicker(); syncRuns();
      if (!String(el.text).trim()) el.isDeleted = true;
      else if (el.midBinding) this._updateBindings(); // CONNECTION LABEL: re-center on the connector midpoint now that it has a measured size
      this.editingId = null; this._ta = null; this._refPrevFlat = null; this._refSetPrevFlat = null; this._refRefresh = null; this._refRebuildBar = null; try { ta.remove(); } catch (_e) {}
      if (this._refBarEl) { try { this._refBarEl.remove(); } catch (_e) {} this._refBarEl = null; } // C1: tear down the ref bar
      this.dirty = true; this.scheduleSave();
    };
    this._refCommit = commit; // _applyRefChip uses this to finalize a caret-only chip
    ta.addEventListener('input', onInput);
    ta.addEventListener('blur', commit);
    ta.addEventListener('keydown', (ev) => {
      // A3 alias: capture the highlighted text the instant before '@' replaces it.
      if (ev.key === '@' && ta.selectionStart !== ta.selectionEnd) this._refPick.alias = ta.value.substring(ta.selectionStart, ta.selectionEnd);
      if (this._refPick.open) { // A2 picker owns these keys while open
        if (ev.key === 'ArrowDown') { ev.preventDefault(); this._refMove(1); return; }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); this._refMove(-1); return; }
        if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); ev.stopPropagation(); if (ev.shiftKey) { const row = this._refPick.rows[this._refPick.idx]; if (row && !row.create) row.transclude = true; } this._refChoose(ta, el); return; } // Shift+Enter = transclude
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this._closeRefPicker(); return; }
      }
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); ta.blur(); }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); ta.blur(); }
    });
    ta.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    ta.addEventListener('wheel', (ev) => ev.stopPropagation());
  }
  // ── A2/A3 inline @/@@ reference picker (dropdown over the text-edit textarea) ──
  _injectRefPickerCss() {
    if (document.getElementById('plexus-refpick-css')) return;
    const s = document.createElement('style'); s.id = 'plexus-refpick-css';
    s.textContent = '.pxc-refpicker{position:absolute;z-index:30;min-width:220px;max-width:340px;max-height:240px;overflow-y:auto;background:var(--cards-bg,#fff);border:1px solid var(--cards-border-color,#d0d0d0);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:4px;font:13px/1.3 system-ui,sans-serif;color:#1e1e1e}.pxc-refpicker.pxc-dark{background:#1b1f2a;border-color:#333a4a;color:#e6e8ee}.pxc-refrow{position:relative;padding:6px 34px 6px 8px;border-radius:6px;cursor:pointer;display:flex;flex-direction:column;gap:1px}.pxc-refrow.active{background:rgba(124,92,255,.18)}.pxc-refembed{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:none;background:rgba(14,165,233,.14);color:#0ea5e9;border-radius:5px;cursor:pointer;font-size:13px;line-height:1;padding:4px 7px}.pxc-refembed:hover{background:rgba(14,165,233,.3)}.pxc-imgbtn{background:rgba(168,85,247,.16)}.pxc-imgbtn:hover{background:rgba(168,85,247,.34)}.pxc-refrow .r1{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pxc-refrow .r2{font-size:11px;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pxc-refempty{padding:8px;opacity:.6;font-size:12px}.pxc-refrow.pxc-create .r1{color:#16a34a;font-weight:700}.pxc-collist{max-height:280px;overflow-y:auto;margin-top:8px;display:flex;flex-direction:column;gap:2px}.pxc-colrow{padding:7px 10px;border-radius:6px;cursor:pointer;font:13px/1.2 system-ui,sans-serif}.pxc-colrow:hover,.pxc-colrow.active{background:rgba(124,92,255,.18)}';
    document.head.appendChild(s);
  }
  _refDetect(ta, el) {
    const trig = pxcParseRefTrigger(ta.value, ta.selectionStart);
    if (!trig) { this._closeRefPicker(); return; }
    const rp = this._refPick; rp.open = true; rp.mode = trig.mode; rp.query = trig.query; rp.triggerStart = trig.triggerStart;
    if (rp.timer) clearTimeout(rp.timer);
    if (!trig.query) { rp.rows = []; rp.seq++; this._renderRefPicker(ta); return; } // bare @/@@ → show the prompt, skip the search
    rp.timer = setTimeout(() => this._runRefSearch(trig.query, trig.mode), 180);
    this._renderRefPicker(ta);
  }
  async _runRefSearch(query, mode) {
    const rp = this._refPick; if (!rp || !rp.open) return;
    const seq = ++rp.seq;
    let res = null; try { res = await this.plugin.data.searchByQuery(query || '', 8); } catch (_e) {}
    if (seq !== rp.seq || !rp.open || !this._ta) return; // stale result or editor closed
    const rows = [];
    if (mode === 'record') { for (const r of (res && res.records || []).slice(0, 8)) rows.push({ kind: 'record', guid: r.guid, label: (r.getName && r.getName()) || 'Untitled', sub: 'record' }); }
    else { for (const li of (res && res.lines || []).slice(0, 8)) { let recGuid = null, parent = ''; try { const pr = li.getRecord && li.getRecord(); recGuid = pr && pr.guid; parent = (pr && pr.getName && pr.getName()) || ''; } catch (_e) {} rows.push({ kind: 'line', lineGuid: li.guid, guid: recGuid, label: lineTextOf(li) || '(line)', sub: parent || 'line', _li: li }); } } // _li (transient) → image probe
    // SEARCH-CREATE: no exact-title record? offer a "Create" row (record mode only — a line can't exist without a record).
    if (mode === 'record' && query && query.trim() && !pxcHasExactTitle(rows, query)) rows.push({ kind: 'record', create: true, label: query.trim(), sub: 'Create new record' });
    rp.rows = rows; rp.idx = 0; this._renderRefPicker(this._ta);
    if (mode === 'line') this._probeImageRows(rows, seq); // IMG-REF: detect image attachment lines, then re-render with a 🖼 affordance
  }
  // IMG-REF: probe each line row for an image blob (the reliable signal — getBanner is unreliable per the SDK). Sets
  // row.image so the picker shows a 🖼 button. Async + post-render so rows appear instantly; badges follow.
  async _probeImageRows(rows, seq) {
    let any = false;
    for (const row of rows) {
      if (row.kind !== 'line' || !row._li || !row.guid) continue; // need a parent record guid to resolve the line later
      try { const blob = await row._li.getBlob(); if (blob && /^image\//.test(blob.contentType || '')) { row.image = true; any = true; } } catch (_e) {}
    }
    const rp = this._refPick;
    if (any && rp && rp.open && rp.seq === seq && this._ta) this._renderRefPicker(this._ta);
  }
  _renderRefPicker(ta) {
    const rp = this._refPick; if (!rp || !rp.open || !ta) return;
    let dom = rp.dom; if (!dom) { dom = document.createElement('div'); dom.className = 'pxc-refpicker'; this.wrap.appendChild(dom); rp.dom = dom; }
    dom.classList.toggle('pxc-dark', !!(this.plugin._settings && this.plugin._settings.darkMode) || this._themeDark());
    dom.innerHTML = '';
    if (!rp.rows.length) { const e = document.createElement('div'); e.className = 'pxc-refempty'; e.textContent = rp.query ? 'No matches' : (rp.mode === 'line' ? 'Type to find a line…' : 'Type to find a record…'); dom.appendChild(e); }
    rp.rows.forEach((row, i) => {
      const r = document.createElement('div'); r.className = 'pxc-refrow' + (i === rp.idx ? ' active' : '') + (row.create ? ' pxc-create' : '');
      const a = document.createElement('div'); a.className = 'r1'; a.textContent = row.create ? ('＋ Create “' + row.label + '”') : ((rp.mode === 'line' ? '@@ ' : '@ ') + row.label); r.appendChild(a);
      const b = document.createElement('div'); b.className = 'r2'; b.textContent = row.sub; r.appendChild(b);
      if (row.image) { const ib = document.createElement('button'); ib.className = 'pxc-refembed pxc-imgbtn'; ib.textContent = '🖼'; ib.title = 'Insert image reference (opens a lightbox)'; ib.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); rp.idx = i; row.imageRef = true; this._refChoose(ta, this._byId(this.editingId)); }); r.appendChild(ib); } // IMG-REF
      else if (!row.create) { const emb = document.createElement('button'); emb.className = 'pxc-refembed'; emb.textContent = '⧉'; emb.title = 'Transclude (live embed) — or Shift+Enter'; emb.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); rp.idx = i; row.transclude = true; this._refChoose(ta, this._byId(this.editingId)); }); r.appendChild(emb); } // TRANSCLUDE
      r.addEventListener('mousedown', (ev) => { ev.preventDefault(); rp.idx = i; this._refChoose(ta, this._byId(this.editingId)); });
      dom.appendChild(r);
    });
    const wr = this.wrap.getBoundingClientRect(), tr = ta.getBoundingClientRect();
    dom.style.left = (tr.left - wr.left) + 'px'; dom.style.top = (tr.bottom - wr.top + 4) + 'px';
  }
  _refMove(d) { const rp = this._refPick; if (!rp.rows.length) return; rp.idx = (rp.idx + d + rp.rows.length) % rp.rows.length; this._renderRefPicker(this._ta); }
  _refChoose(ta, el) { const rp = this._refPick; const row = rp.rows[rp.idx]; if (!row || !el) { this._closeRefPicker(); return; } this._applyRefChip(ta, el, row); }
  _closeRefPicker() { const rp = this._refPick; if (!rp) return; if (rp.timer) clearTimeout(rp.timer); if (rp.dom) { try { rp.dom.remove(); } catch (_e) {} } rp.dom = null; rp.open = false; rp.rows = []; }
  _applyRefChip(ta, el, row) {
    if (row && row.create) { this._applyCreateRef(ta, el, row); return; } // SEARCH-CREATE
    if (row && row.imageRef) { this._applyImageRefRow(ta, el, row); return; } // IMG-REF
    if (row && row.transclude) { this._applyTranscludeRow(ta, el, row); return; } // TRANSCLUDE
    const rp = this._refPick; const alias = rp.alias || ''; rp.alias = '';
    // re-derive the trigger range from the CURRENT caret (robust if the caret moved while the picker was open); fall
    // back to the picker's recorded triggerStart. end = live caret. Captured before _closeRefPicker resets the picker.
    const _trig = pxcParseRefTrigger(ta.value, ta.selectionStart); const start = (_trig ? _trig.triggerStart : rp.triggerStart), end = ta.selectionStart;
    const opts = { kind: row.kind, guid: row.guid, lineGuid: row.lineGuid, label: row.label, alias: alias };
    this._closeRefPicker();
    // ALWAYS splice an INLINE ref RUN into this (editable) text element: no @/@@ prefix, underlined (drawRuns), and you
    // can keep typing text before/after it. Caret-only too — spliceRunRange over the just-typed @token collapses an empty
    // box into a single-run ref line. (Whole-element ref chips are retired; pxcChipToInlineRun migrates old ones on load.)
    const baseRuns = (el.runs && el.runs.length) ? el.runs : [{ t: 'text', s: ta.value }];
    const refRun = { t: 'ref', kind: opts.kind === 'line' ? 'line' : 'record', guid: opts.guid || null, lineGuid: opts.lineGuid || null, label: opts.label || 'ref' };
    if (alias && String(alias).trim()) refRun.alias = String(alias).trim();
    el.runs = spliceRunRange(baseRuns, start, end, refRun);
    el.text = flattenRuns(el.runs); measureRuns(el);
    ta.value = el.text;
    const caret = start + runDisplay(refRun).length; try { ta.selectionStart = ta.selectionEnd = caret; } catch (_e) {}
    if (this._refSetPrevFlat) this._refSetPrevFlat(ta.value); // keep the edit baseline in sync (no phantom dissolve next keystroke)
    if (this._refRefresh) this._refRefresh(); // resize the textarea to the spliced value now
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Reference added — keep typing, or click it to open.', dismissible: true }); } catch (_e) {}
  }
  // TRANSCLUDE: the user chose "embed" (⧉ button / Shift+Enter). Strip the @token from the host text, then drop a LIVE
  // read-only card below the editing element — a record target reuses the existing record card (already live), a line
  // target uses the new linecard. Forward-nav-only (dblclick jumps to source); no note-side badge by design.
  _applyTranscludeRow(ta, el, row) {
    if (row.kind === 'line' && !row.guid) { this._closeRefPicker(); try { this.plugin.ui.addToaster({ title: 'Plexus: can’t embed this line (no parent record).', dismissible: true }); } catch (_e) {} return; }
    const rp = this._refPick; const start = rp.triggerStart, flat = ta.value, before = flat.slice(0, start), after = flat.slice(ta.selectionStart);
    this._closeRefPicker();
    ta.value = before + after; // transclude is a separate card, not inline text → remove the @token
    if (el.runs && el.runs.length) { el.runs = applyFlatEdit(el.runs, this._refPrevFlat ? this._refPrevFlat() : flat, ta.value); if (!hasRefRun(el.runs)) delete el.runs; }
    el.text = ta.value; if (el.runs && el.runs.length) measureRuns(el); else measureText(el);
    if (this._refSetPrevFlat) this._refSetPrevFlat(ta.value);
    if (this._refRefresh) this._refRefresh();
    const ny = el.y + Math.abs(el.height || 0) + 16;
    const card = (row.kind === 'line' && row.lineGuid)
      ? makeLineCard(this._snap(el.x), this._snap(ny), 300, 150, row.lineGuid, row.guid)
      : makeRecordCard(this._snap(el.x), this._snap(ny), 260, 160, row.guid);
    this.scene.elements.push(card);
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Transcluded “' + (row.label || '') + '” (live embed).', dismissible: true }); } catch (_e) {}
  }
  // IMG-REF: drop a violet image-ref chip; dblclick opens the attachment in a lightbox. Stores the PARENT record guid
  // (refGuid) + the attachment line guid (refLineGuid) — there's no getLineItemByGuid, so the open path resolves the
  // line through getRecord(refGuid)→getLineItems()→find. Forward-nav-only (no note-side badge).
  _applyImageRefRow(ta, el, row) {
    const rp = this._refPick; const alias = rp.alias || ''; rp.alias = '';
    const start = rp.triggerStart, flat = ta.value, before = flat.slice(0, start), after = flat.slice(ta.selectionStart);
    this._closeRefPicker();
    ta.value = before + after; // an image ref is a standalone chip, not inline text → remove the @token
    if (el.runs && el.runs.length) { el.runs = applyFlatEdit(el.runs, this._refPrevFlat ? this._refPrevFlat() : flat, ta.value); if (!hasRefRun(el.runs)) delete el.runs; }
    el.text = ta.value; if (el.runs && el.runs.length) measureRuns(el); else measureText(el);
    if (this._refSetPrevFlat) this._refSetPrevFlat(ta.value);
    if (this._refRefresh) this._refRefresh();
    const chip = this._makeRefElement({ kind: 'image', guid: row.guid, lineGuid: row.lineGuid, label: row.label, alias }, el.x, el.y + Math.abs(el.height || 0) + 12);
    this.scene.elements.push(chip); this.selected.clear(); this.selected.add(chip.id);
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Image reference added — double-click to open.', dismissible: true }); } catch (_e) {}
  }
  async _openImageRef(el) {
    let blob = null;
    try {
      if (el.refLineGuid && el.refGuid) { // attachment line (the v1 path)
        const rec = await this.plugin.data.getRecord(el.refGuid);
        const items = rec ? (await rec.getLineItems()) || [] : [];
        const li = items.find((x) => x.guid === el.refLineGuid);
        if (li && li.getBlob) blob = await li.getBlob();
      } else if (el.refGuid) { // image RECORD (banner) fallback — rarely reached in v1
        const rec = await this.plugin.data.getRecord(el.refGuid);
        const fv = rec && rec.getBanner && rec.getBanner();
        if (fv) blob = await this.plugin.data.getBlobFromPropertyFileValue(fv);
      }
    } catch (_e) {}
    if (!blob) { // nothing to show → fall back to jumping to the line/record
      if (el.refLineGuid) this._openRefLine({ refLineGuid: el.refLineGuid, refGuid: el.refGuid });
      else if (el.refGuid) this._openRecord(el.refGuid);
      else { try { this.plugin.ui.addToaster({ title: 'Plexus: the referenced image could not be found.', dismissible: true }); } catch (_e) {} }
      return;
    }
    this._showLightbox(blob, el.refLabel || 'Image');
  }
  async _showLightbox(blob, title) {
    try { this._injectRefPickerCss(); } catch (_e) {}
    let url = null;
    try { const ab = await blob.download(); if (ab) url = URL.createObjectURL(new Blob([ab], { type: blob.contentType || 'image/png' })); } catch (_e) {}
    if (!url) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not load the image.', dismissible: true }); } catch (_e) {} return; }
    const ov = document.createElement('div'); ov.className = 'pxc-modal pxc-lightbox';
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const close = () => { try { ov.remove(); } catch (_e) {} try { URL.revokeObjectURL(url); } catch (_e) {} try { document.removeEventListener('keydown', onKey, true); } catch (_e) {} };
    ov.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(); }); // backdrop closes
    ov.addEventListener('wheel', (e) => e.stopPropagation());
    const img = document.createElement('img'); img.className = 'pxc-lightbox-img'; img.src = url; img.alt = title;
    img.addEventListener('pointerdown', (e) => e.stopPropagation()); // clicking the image itself doesn't close
    ov.appendChild(img); this.wrap.appendChild(ov);
    document.addEventListener('keydown', onKey, true);
  }
  // SEARCH-CREATE: the user chose "Create '<query>'". Capture the splice context, strip just the '@' so the editor
  // commits a non-empty, literal-@-free value (NO blur race against the modal), then create + bind asynchronously.
  _applyCreateRef(ta, el, row) {
    const rp = this._refPick; const alias = rp.alias || ''; rp.alias = '';
    const start = rp.triggerStart, end = ta.selectionStart, flat = ta.value;
    const before = flat.slice(0, start), after = flat.slice(end);
    const caretOnly = !before.trim() && !after.trim();
    const query = row.label;
    this._closeRefPicker();
    ta.value = before + query + after;               // keep the typed query as plain text; drop the '@'
    if (this._refCommit) this._refCommit();           // commit closes the editor cleanly; el survives in the scene
    this._createRefRecordAndBind(el, { query, start, tokenLen: query.length, alias, caretOnly });
  }
  async _createRefRecordAndBind(el, ctx) {
    const col = await this._pickCollection('Create “' + ctx.query + '” in collection:');
    if (!col) { try { this.plugin.ui.addToaster({ title: 'Create cancelled.', dismissible: true }); } catch (_e) {} return; }
    let guid = null; try { guid = col.createRecord(ctx.query); } catch (_e) {}
    if (typeof guid !== 'string') { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the record.', dismissible: true }); } catch (_e) {} return; }
    const rec = await getRecordPoll(this.plugin, guid, 8);
    const name = (rec && rec.getName && rec.getName()) || ctx.query;
    if (el.isDeleted) return; // host removed while the modal was open
    if (ctx.caretOnly) { this._configureRef(el, { kind: 'record', guid, label: name, alias: ctx.alias }); this._indexBackref(el); }
    else { // splice an inline ref run over the plain query text we left in place
      const baseRuns = (el.runs && el.runs.length) ? el.runs : [{ t: 'text', s: el.text || '' }];
      const refRun = { t: 'ref', kind: 'record', guid, label: name }; if (ctx.alias && String(ctx.alias).trim()) refRun.alias = String(ctx.alias).trim();
      el.runs = spliceRunRange(baseRuns, ctx.start, ctx.start + ctx.tokenLen, refRun);
      el.text = flattenRuns(el.runs); measureRuns(el);
    }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Created + linked “' + name + '”.', dismissible: true }); } catch (_e) {}
  }
  // In-panel collection picker (no window.prompt on desktop). Filterable, keyboard-navigable, remembers the last pick.
  async _pickCollection(label) {
    try { this._injectRefPickerCss(); } catch (_e) {}
    let cols = []; try { cols = await this.plugin.data.getAllCollections(); } catch (_e) {}
    const meta = (cols || []).filter(Boolean).map((c) => { let name = 'Collection', guid = null; try { name = (c.getName && c.getName()) || 'Collection'; } catch (_e) {} try { guid = (c.getGuid && c.getGuid()) || null; } catch (_e) {} return { c, name, guid }; });
    let last = null; try { last = localStorage.getItem('plexus_create_col'); } catch (_e) {}
    meta.sort((a, b) => (a.guid === last && b.guid !== last) ? -1 : (b.guid === last && a.guid !== last) ? 1 : a.name.localeCompare(b.name));
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'pxc-modal';
      const done = (val) => { try { ov.remove(); } catch (_e) {} resolve(val); };
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) { e.stopPropagation(); done(null); } });
      const box = document.createElement('div'); box.className = 'pxc-modal-box'; box.addEventListener('pointerdown', (e) => e.stopPropagation());
      const lab = document.createElement('div'); lab.className = 'pxc-modal-label'; lab.textContent = label || 'Choose a collection:';
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'pxc-modal-input'; inp.placeholder = 'Filter collections…';
      const list = document.createElement('div'); list.className = 'pxc-collist';
      let idx = 0, shown = meta;
      const pick = (m) => { if (!m) return; try { localStorage.setItem('plexus_create_col', m.guid || ''); } catch (_e) {} done(m.c); };
      const render = () => { const f = inp.value.trim().toLowerCase(); shown = meta.filter((m) => !f || m.name.toLowerCase().includes(f)); if (idx >= shown.length) idx = Math.max(0, shown.length - 1); list.innerHTML = ''; shown.forEach((m, i) => { const r = document.createElement('div'); r.className = 'pxc-colrow' + (i === idx ? ' active' : ''); r.textContent = m.name; r.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(m); }); list.appendChild(r); }); };
      inp.addEventListener('input', () => { idx = 0; render(); });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); } else if (e.key === 'Enter') { e.preventDefault(); pick(shown[idx]); } else if (e.key === 'Escape') { e.preventDefault(); done(null); } });
      box.appendChild(lab); box.appendChild(inp); box.appendChild(list); ov.appendChild(box);
      this.wrap.appendChild(ov); render(); setTimeout(() => inp.focus(), 0);
    });
  }
  _imgFor(fileId) { return this.plugin._imgCacheGet(fileId, this.scene.files); } // S9: shared LRU decode cache
  _drawImage(ctx, el) {
    const img = this._imgFor(el.fileId);
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    if (img) {
      try {
        // UX-6 (zsviczian dark mode): invert raster/SVG images on a dark canvas so figures/diagrams read. Per-image
        // opt-out (el.noInvert — for photos/logos, via "Plexus: Toggle image dark-invert") + a global setting.
        if (PXC_DARK && !el.noInvert && !(this.plugin._settings && this.plugin._settings.invertImagesDark === false)) ctx.filter = 'invert(0.93) hue-rotate(180deg)';
        const c = el.crop;
        if (c && c.w > 0 && c.h > 0) ctx.drawImage(img, c.x, c.y, c.w, c.h, el.x, el.y, el.width, el.height);
        else ctx.drawImage(img, el.x, el.y, el.width, el.height);
        ctx.filter = 'none';
      } catch (_e) {}
    }
    else { const z = this.camera.zoom; ctx.fillStyle = 'rgba(124,92,255,0.08)'; ctx.fillRect(el.x, el.y, el.width, el.height); ctx.strokeStyle = '#7c5cff'; ctx.lineWidth = 1 / z; ctx.setLineDash([5 / z, 4 / z]); ctx.strokeRect(el.x, el.y, el.width, el.height); ctx.setLineDash([]); }
    ctx.restore();
  }
  // SCALE Phase 1: normalize ANY image (HEIC/JPEG/PNG/GIF/AVIF/…) → a downscaled WebP blob, then EXTERNALIZE it
  // to the Thymer blob store (referenced by guid) so the scene JSON never carries base64. See SCALE-ARCHITECTURE.md.
  async _addImageFromFile(file, wx, wy) {
    const norm = await this._normalizeImageForInsert(file);
    if (!norm) return null;
    if (this._pendingBacking && !this._isBacking) { try { await this._ensureBackingAndMigrate(); } catch (_e) {} } // SCALE/backing: anchor the image to the backing drawing's Assets property, never the host body
    const dispMax = 480; let w = norm.w, h = norm.h;
    if (Math.max(w, h) > dispMax) { const s = dispMax / Math.max(w, h); w *= s; h *= s; }
    const fileId = newFileId(); if (!this.scene.files) this.scene.files = {};
    const base = (file.name || 'image').replace(/\.[a-z0-9]+$/i, '') || 'image';
    const ref = await this._assetPut(norm.blob, base + '.webp');
    if (ref && ref.anchored) {
      this.scene.files[fileId] = { blobGuid: ref.blobGuid, name: ref.name, mimeType: ref.mimeType, w: norm.w, h: norm.h };
    } else {
      // No record / upload failed / couldn't DURABLY ANCHOR → inline the (already-small) normalized WebP so the image
      // is never lost (the bytes are capped at Lean size, so even inline it stays tiny). Safe by construction.
      const durl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(norm.blob); });
      if (!durl) return null;
      this.scene.files[fileId] = { dataURL: durl, mimeType: norm.mime, w: norm.w, h: norm.h };
    }
    // Pre-seed the decode cache from the just-encoded blob so the image appears instantly (no download round-trip).
    try { const url = URL.createObjectURL(norm.blob); const seed = new Image(); const ce = { img: seed, ready: false, url }; const cache = this.plugin._imgCache || (this.plugin._imgCache = new Map()); cache.set(fileId, ce); seed.onload = () => { ce.ready = true; for (const v of this.plugin._views) { v.dirty = true; v._dragLayerValid = false; } }; seed.onerror = () => { ce.broken = true; try { URL.revokeObjectURL(url); } catch (_e) {} }; seed.src = url; } catch (_e) {}
    const el = makeImage(wx - w / 2, wy - h / 2, w, h, fileId);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // SCALE: decode (HEIC feature-detected) → cap longest edge to imageMaxDim → re-encode WebP (q). Returns {blob,w,h,mime} or null.
  async _normalizeImageForInsert(file) {
    const st = (this.plugin && this.plugin._settings) || {};
    const maxDim = st.imageMaxDim || 1600, quality = st.imageQuality || 0.8;
    let bmp = null;
    try { bmp = await createImageBitmap(file); } catch (_e) { bmp = null; }
    if (!bmp) {
      // Fallback decode via <img> (some browsers/Electron decode HEIC here even when createImageBitmap can't).
      const url = URL.createObjectURL(file);
      bmp = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
      try { URL.revokeObjectURL(url); } catch (_e) {}
    }
    if (!bmp) { // truly undecodable (e.g. HEIC on a non-Apple web client)
      try { this.plugin.ui.addToaster({ title: 'Plexus: couldn’t decode that image (HEIC may need converting to JPEG on this device).', dismissible: true }); } catch (_e) {}
      return null;
    }
    const iw = bmp.naturalWidth || bmp.width || 0, ih = bmp.naturalHeight || bmp.height || 0;
    if (!iw || !ih) { try { bmp.close && bmp.close(); } catch (_e) {} return null; }
    const scale = Math.max(iw, ih) > maxDim ? maxDim / Math.max(iw, ih) : 1;
    const ow = Math.max(1, Math.round(iw * scale)), oh = Math.max(1, Math.round(ih * scale));
    const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
    try { cv.getContext('2d').drawImage(bmp, 0, 0, ow, oh); } catch (_e) { try { bmp.close && bmp.close(); } catch (_e2) {} return null; }
    try { bmp.close && bmp.close(); } catch (_e) {}
    let blob = await new Promise((r) => { try { cv.toBlob(r, 'image/webp', quality); } catch (_e) { r(null); } });
    let mime = 'image/webp';
    if (!blob) { blob = await new Promise((r) => { try { cv.toBlob(r, 'image/jpeg', quality); } catch (_e) { r(null); } }); mime = 'image/jpeg'; }
    if (!blob) { blob = await new Promise((r) => { try { cv.toBlob(r, 'image/png'); } catch (_e) { r(null); } }); mime = 'image/png'; }
    if (!blob) return null;
    return { blob, w: ow, h: oh, mime };
  }
  // SCALE: upload a blob to the Thymer blob store + anchor it to the record so it persists (GC-safe). Prefers an
  // `Assets` MANY file-property ("in properties"), verified via files() read-back; falls back to a body `file`
  // line-item (the same durable fallback the Scene store uses). Returns {blobGuid,name,mimeType} or null.
  async _assetPut(blob, name) {
    if (!this.rec) return null;
    let up = null;
    try { up = await this.plugin.data.uploadBlob(new File([blob], name || 'asset.webp', { type: blob.type || 'image/webp' })); } catch (_e) {}
    if (!up || !up.guid) return null;
    const ref = { blobGuid: up.guid, name: up.fileName || name || 'asset.webp', mimeType: blob.type || 'image/webp' };
    let anchored = false;
    // Anchor #1 (SHARDED): append to the active `Assets` shard on the backing drawing; verify via read-back across shards.
    try {
      const ap = pxcPickAssetShard(this.rec);
      if (ap) {
        try { ap.addValue({ name: ref.name, error: null, guid: up.guid, imgData: null, imgUrl: null, imgClass: null }); } catch (_e) {}
        for (let i = 0; i < 3 && !anchored; i++) { try { if (pxcAssetGuidsOn(this.rec).has(up.guid)) anchored = true; } catch (_e) {} if (!anchored) await sleep(100); }
      }
    } catch (_e) {}
    // SCALE/backing (BD-1): the body `file` line-item fallback was REMOVED — `this.rec` is always a backing Plexus Drawings
    // record (resolved in loadOrInit), so Anchor #1 (the `Assets` property) always works. If it somehow fails, the caller
    // (_addImageFromFile) falls back to inline-small-webp — NEVER a body line-item (which clutters note bodies).
    // DATA-SAFETY: report whether a DURABLE anchor confirmed. Callers MUST NOT drop the source bytes unless ref.anchored.
    ref.anchored = anchored;
    return ref;
  }
  // SCALE data-safety: re-anchor a scene's externalized image blobs to `rec` (by adding each blobGuid to rec's `Assets`
  // property) — used when a scene is COPIED to a NEW record (extract), so the shared blob stays alive even if the source
  // record is deleted. No re-upload: the same blob is referenced by both records' Assets. No-ops if rec lacks Assets.
  // Returns the Set of blob guids CONFIRMED present on rec's `Assets` property after the re-anchor (via files() read-back).
  // Callers that delete the blob's OTHER anchor (e.g. a host body line) MUST only do so for guids in this confirmed set.
  async _reanchorAssets(rec, scene) {
    const confirmed = new Set();
    if (!rec || !scene || !scene.files) return confirmed;
    const items = []; for (const fid of Object.keys(scene.files)) { const f = scene.files[fid]; if (f && f.blobGuid) items.push({ g: f.blobGuid, name: f.name || 'asset.webp' }); }
    if (!items.length) return confirmed;
    const shards = pxcAssetShardProps(rec); if (!shards.length) return confirmed; // no Assets prop → nothing anchored here (blob stays on its source anchor)
    // distribute across shards (fill each to the cap); track the count locally so we don't re-read files() per add
    let si = 0, scount = 0; try { scount = (shards[0].p.files() || []).length; } catch (_e) {}
    const wanted = new Set();
    for (const { g, name } of items) {
      while (scount >= PXC_ASSET_SHARD_CAP && si < shards.length - 1) { si++; try { scount = (shards[si].p.files() || []).length; } catch (_e) { scount = 0; } }
      wanted.add(g);
      try { shards[si].p.addValue({ name, error: null, guid: g, imgData: null, imgUrl: null, imgClass: null }); scount++; } catch (_e) {}
    }
    for (let i = 0; i < 4 && confirmed.size < wanted.size; i++) { // DATA-SAFETY: read back which guids actually landed (across ALL shards)
      const have = pxcAssetGuidsOn(rec);
      for (const g of wanted) if (have.has(g)) confirmed.add(g);
      if (confirmed.size < wanted.size) await sleep(120);
    }
    return confirmed;
  }
  // SCALE: one-time migration of a legacy scene that stored images as inline base64. Transcode each BIG inline image →
  // externalize → drop the dataURL, so the monolithic Scene blob shrinks below the save limit. Returns #migrated.
  async _migrateBigInlineAssets() {
    const files = this.scene && this.scene.files; if (!files) return 0;
    const TH = (this.plugin._settings && this.plugin._settings.imageInlineThreshold) || 65536;
    let migrated = 0;
    for (const fid of Object.keys(files)) {
      const f = files[fid];
      if (!f || f.blobGuid || !f.dataURL) continue;
      if ((f.dataURL.length || 0) <= TH) continue; // small inline images stay inline (cheap, no churn)
      try {
        const srcBlob = await (await fetch(f.dataURL)).blob();
        const norm = await this._normalizeImageForInsert(new File([srcBlob], 'legacy', { type: f.mimeType || srcBlob.type || 'image/png' }));
        if (!norm) continue;
        const ref = await this._assetPut(norm.blob, 'asset.webp');
        if (!ref || !ref.anchored) continue; // DATA-SAFETY: keep the fat inline dataURL unless the blob DURABLY anchored — never delete the only copy
        files[fid] = { blobGuid: ref.blobGuid, name: ref.name, mimeType: ref.mimeType, w: norm.w, h: norm.h };
        try { if (this.plugin._imgCache) { const ce = this.plugin._imgCache.get(fid); if (ce && ce.url) { try { URL.revokeObjectURL(ce.url); } catch (_e) {} } this.plugin._imgCache.delete(fid); } } catch (_e) {}
        migrated++;
      } catch (_e) {}
    }
    return migrated;
  }
  // Rasterize an SVG string to a single clean IMAGE element (not hundreds of vector primitives).
  // For a complex map/illustration this is what you want — one croppable image, like Excalidraw does.
  async _addSvgAsImage(svgText, wx, wy) {
    try {
      let svg = String(svgText || '');
      if (!/^\s*<svg/i.test(svg)) { const m = svg.match(/<svg[\s\S]*<\/svg>/i); if (m) svg = m[0]; }
      if (!/\sxmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
      let w = 0, h = 0;
      const wm = svg.match(/<svg[^>]*\bwidth=["']?([\d.]+)/i), hm = svg.match(/<svg[^>]*\bheight=["']?([\d.]+)/i);
      if (wm) w = parseFloat(wm[1]); if (hm) h = parseFloat(hm[1]);
      if (!w || !h) { const vb = svg.match(/viewBox=["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)/i); if (vb) { w = w || parseFloat(vb[1]); h = h || parseFloat(vb[2]); } }
      if (!w || !h) { w = 1000; h = 700; }
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('svg load')); im.src = url; });
      const iw = img.naturalWidth || w, ih = img.naturalHeight || h;
      // PERF: cap the raster's max dimension (~1400px) so a complex/large SVG doesn't become a multi-thousand-px
      // bitmap that drawImage must rescale every static-layer rebuild. Display is capped at 480px, so 1400 stays crisp.
      const RMAX = 1400, scale = Math.min(3, RMAX / Math.max(iw, ih));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(iw * scale)); cv.height = Math.max(1, Math.round(ih * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const pngBlob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      if (!pngBlob) throw new Error('toBlob null');
      return await this._addImageFromFile(new File([pngBlob], 'svg-image.png', { type: 'image/png' }), wx, wy);
    } catch (e) {
      try { this.plugin.ui.addToaster({ title: 'Plexus: rendered the SVG as vectors (couldn’t rasterize it).', dismissible: true }); } catch (_e) {}
      try { this._importSvgText(svgText, wx, wy); } catch (_e) {} // fallback: old vectorize path
      return null;
    }
  }
  // Paste/drop a remote image URL (or an <img src> from copied HTML). Fetch → blob → embed; toast on CORS failure.
  async _addImageFromUrl(url, wx, wy) {
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (!resp.ok) throw new Error('http ' + resp.status);
      const blob = await resp.blob();
      if (!blob || !/^image\//.test(blob.type || '')) throw new Error('not an image');
      const name = (url.split('/').pop() || 'image').split('?')[0];
      return await this._addImageFromFile(new File([blob], name, { type: blob.type }), wx, wy);
    } catch (e) {
      try { this.plugin.ui.addToaster({ title: 'Plexus: couldn’t load that image (the site may block cross-origin fetches). Save it and drag the file in instead.', dismissible: true }); } catch (_e) {}
      return null;
    }
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
        try { entry.skin = recordSkin(rec); } catch (_e) {} // CS-8: property-conditional style (Status/Priority/Due)
        try { const items = await rec.getLineItems(); entry.lines = pxcOutlineRows(items, null, 10, false, false).map((r) => ({ text: r.text, depth: r.depth, lineGuid: r.li && r.li.guid })); } catch (_e) {} // [{text, depth, lineGuid}] — depth from parent_guid chain (getChildren() returns [] on the flat load); lineGuid → line-level connection targeting (Phase 4)
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.title = '(error)'; entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateRec(guid) { if (this._recCache && this._recCache.has(guid)) { this._recCache.delete(guid); this.dirty = true; } }
  // ── EDIT-1: editable record-card property panel (a DOM overlay shown beside a single-selected record card) ──
  // Enumerate the EDITABLE typed properties of a record (skip system/Plexus-internal). Type inferred from the live shape:
  // choices()→choice, date()→date, linkedRecords()→relation, number()→number, else text. Empty props default to text (v1).
  _recPanelFields(rec) {
    const SKIP = new Set(['Created', 'Modified', 'Banner', 'Icon', 'Scene', 'Canvas Text', 'Assets', 'Assets 2', 'Assets 3', 'Assets 4', 'Scene Rev', 'Scene Schema', 'Source Note', 'Chunks', 'Manifest']);
    const out = []; let props = [];
    try { props = (rec.getAllProperties && rec.getAllProperties()) || []; } catch (_e) {}
    for (const p of props) {
      const name = p && p.name; if (!name || SKIP.has(name)) continue;
      let kind = 'text', choices = null, value = '';
      try { const ch = p.choices && p.choices(); if (ch && ch.length) { kind = 'choice'; choices = ch.map((c) => ({ id: c.id, label: c.label })); } } catch (_e) {}
      if (kind === 'text') { try { const d = p.date && p.date(); if (d instanceof Date) kind = 'date'; } catch (_e) {} }
      if (kind === 'text') { try { const lr = p.linkedRecords && p.linkedRecords(); if (lr && lr.length) kind = 'relation'; } catch (_e) {} }
      if (kind === 'text') { try { const n = p.number && p.number(); if (typeof n === 'number') kind = 'number'; } catch (_e) {} }
      try {
        if (kind === 'choice') value = (p.choiceLabel && p.choiceLabel()) || '';
        else if (kind === 'date') { const d = p.date(); value = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''; }
        else if (kind === 'number') { const n = p.number && p.number(); value = (n == null ? '' : n); }
        else if (kind === 'relation') value = ((p.linkedRecords && p.linkedRecords()) || []).map((r) => (r && r.getName && r.getName()) || '').filter(Boolean).join(', ');
        else value = (p.text && p.text()) || '';
      } catch (_e) {}
      out.push({ name, kind, value, choices });
    }
    return out;
  }
  // Write one property (only when changed) + re-raster the card. choice→setChoice(label); date→DateTime; number→Number; else text.
  _writeRecProp(rec, guid, name, kind, raw) {
    try {
      const p = rec.prop(name); if (!p) return;
      if (kind === 'choice') { try { p.setChoice(raw); } catch (_e) {} }
      else if (kind === 'date') { if (raw) { try { p.set(DateTime.parseDateTimeString(raw).value()); } catch (_e) { try { p.set(raw); } catch (_e2) {} } } else { try { p.set(''); } catch (_e) {} } }
      else if (kind === 'number') { try { p.set(raw === '' || raw == null ? '' : Number(raw)); } catch (_e) {} }
      else { try { p.set(raw); } catch (_e) {} }
      this._invalidateRec(guid); this.dirty = true; this.scheduleSave();
    } catch (_e) {}
  }
  _closeRecPanel() { if (this._recPanelEl) { try { this._recPanelEl.remove(); } catch (_e) {} this._recPanelEl = null; } this._recPanelId = null; }
  // ── EDIT-4c: a LIVE interactive Datacore view mounted over a selected dc: query node (via window.__plexusDatacore.mountView) ──
  _closeDcOverlay() { if (this._dcMounted) { try { this._dcMounted.destroy && this._dcMounted.destroy(); } catch (_e) {} this._dcMounted = null; } if (this._dcOverlayEl) { try { this._dcOverlayEl.remove(); } catch (_e) {} this._dcOverlayEl = null; } this._dcOverlayId = null; }
  _syncDcOverlay() {
    let node = null;
    if (this.tool === 'select' && !this.editingId && !this._camAnim && !this._present && this.selected.size === 1) {
      const a = this._byId(this.selected.values().next().value); if (a && !a.isDeleted && a.type === 'query' && /^dc:\s*/i.test(a.query || '')) node = a;
    }
    const dc = window.__plexusDatacore;
    if (!node || !dc || !dc.mountView) { this._closeDcOverlay(); return; }
    if (this._dcOverlayId !== node.id) { this._closeDcOverlay(); this._dcOverlayId = node.id; this._buildDcOverlay(node); }
    if (!this._dcOverlayEl) return;
    const tl = this.camera.worldToScreen(Math.min(node.x, node.x + node.width), Math.min(node.y, node.y + node.height));
    const w = Math.abs(node.width) * this.camera.zoom, h = Math.abs(node.height) * this.camera.zoom;
    this._dcOverlayEl.style.left = tl.x + 'px'; this._dcOverlayEl.style.top = tl.y + 'px'; this._dcOverlayEl.style.width = Math.max(240, w) + 'px'; this._dcOverlayEl.style.height = Math.max(150, h) + 'px';
  }
  _buildDcOverlay(node) {
    const dc = window.__plexusDatacore; if (!dc || !dc.mountView) return;
    this._closeDcOverlay(); this._dcOverlayId = node.id;
    const box = document.createElement('div'); box.className = 'pxc-dcoverlay'; this._dcOverlayEl = box;
    box.addEventListener('pointerdown', (e) => e.stopPropagation()); box.addEventListener('wheel', (e) => e.stopPropagation());
    const inp = document.createElement('input'); inp.className = 'pxc-dc-q'; inp.value = node.query || 'dc: @task'; inp.title = 'Datacore query (dc: …)';
    inp.addEventListener('change', () => { node.query = inp.value; this._invalidateQueries(); this.dirty = true; this.scheduleSave(); try { if (this._dcMounted && this._dcMounted.setQuery) this._dcMounted.setQuery(inp.value.replace(/^dc:\s*/i, '')); } catch (_e) {} });
    box.appendChild(inp);
    const host = document.createElement('div'); host.className = 'pxc-dc-host'; box.appendChild(host);
    this.wrap.appendChild(box);
    try { this._dcMounted = dc.mountView(host, { query: (node.query || '').replace(/^dc:\s*/i, ''), format: 'table' }); } catch (_e) { host.textContent = 'Datacore view error.'; }
  }
  // Shown when exactly one RECORD card is selected (and no draw/connection state is armed). Rebuilt only when the selected
  // card changes; positioned beside the card each frame. DOM overlay (like _editCardBody) — the card itself stays a raster.
  _syncRecPanel() {
    let card = null;
    if (this.tool === 'select' && !this.editingId && !this._camAnim && !this._present && this.selected.size === 1 && !this._pendingSourceRegion && !this._pendingRegionDraw && !this._pendingGroupLink && !this._pendingRegionLink) {
      const a = this._byId(this.selected.values().next().value); if (a && !a.isDeleted && a.type === 'record' && a.recordGuid) card = a;
    }
    if (!card) { this._closeRecPanel(); return; }
    if (this._recPanelId !== card.id) { this._closeRecPanel(); this._recPanelId = card.id; this._buildRecPanel(card); } // async build; _recPanelId guards stale attach
    if (!this._recPanelEl) return;
    // 2026-06-21: the panel sits BESIDE the card (not over it) so the card stays readable and you can edit freely.
    // Default to the right of the card; flip to the left if it would overflow the canvas; clamp to the viewport.
    const x0 = Math.min(card.x, card.x + card.width), x1 = Math.max(card.x, card.x + card.width);
    const tl = this.camera.worldToScreen(x0, Math.min(card.y, card.y + card.height));
    const tr = this.camera.worldToScreen(x1, Math.min(card.y, card.y + card.height));
    const ww = this.wrap.clientWidth || 800, gap = 10, w = 300;
    let left = tr.x + gap;                                   // right of the card
    if (left + w > ww - 6) left = tl.x - w - gap;            // overflow → flip to the left
    left = Math.max(6, Math.min(left, ww - w - 6));          // clamp into view
    this._recPanelEl.style.left = left + 'px'; this._recPanelEl.style.top = Math.max(8, tl.y) + 'px'; this._recPanelEl.style.width = w + 'px';
  }
  async _buildRecPanel(card) {
    const guid = card.recordGuid; let rec = null;
    try { rec = await this.plugin.data.getRecord(guid); } catch (_e) {}
    if (this._recPanelId !== card.id) return; // selection changed during the fetch
    if (!rec) { this._recPanelId = null; return; } // fetch failed (record not synced yet) → clear the guard so a later frame retries (else the panel wedges null for this selection)
    this._closeRecPanel(); this._recPanelId = card.id;
    const box = document.createElement('div'); box.className = 'pxc-recpanel'; this._recPanelEl = box;
    box.addEventListener('pointerdown', (e) => e.stopPropagation()); box.addEventListener('wheel', (e) => e.stopPropagation());
    // header: title (editable) + buttons
    const head = document.createElement('div'); head.className = 'pxc-rp-head';
    const tin = document.createElement('input'); tin.className = 'pxc-rp-title'; tin.value = (rec.getName && rec.getName()) || ''; tin.title = 'Record title';
    tin.addEventListener('change', () => this._writeRecProp(rec, guid, 'Title', 'text', tin.value));
    head.appendChild(tin);
    const btns = document.createElement('div'); btns.className = 'pxc-rp-btns';
    const mkb = (txt, title, fn) => { const b = document.createElement('button'); b.className = 'pxc-rp-btn'; b.textContent = txt; b.title = title; b.addEventListener('click', (e) => { e.preventDefault(); fn(); }); btns.appendChild(b); return b; };
    mkb('Open', 'Open the record in a panel', () => this._openRecord(guid));
    mkb('Move…', 'Move this record to another collection (keeps its links)', async () => { const col = await this._pickCollection('Move this record to collection:'); if (col) { try { rec.moveToCollection(col.getGuid()); this._invalidateRec(guid); this.dirty = true; this.scheduleSave(); try { this.plugin.ui.addToaster({ title: 'Moved to “' + (col.getName && col.getName()) + '”.', dismissible: true }); } catch (_e) {} } catch (_e) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not move the record.', dismissible: true }); } catch (_e2) {} } } });
    mkb('Template', 'Apply a Templater template to this record', () => this._applyTemplate(rec, guid)); // EDIT-3
    head.appendChild(btns); box.appendChild(head);
    // property rows
    const list = document.createElement('div'); list.className = 'pxc-rp-list';
    for (const f of this._recPanelFields(rec)) {
      const row = document.createElement('div'); row.className = 'pxc-rp-row';
      const lab = document.createElement('label'); lab.className = 'pxc-rp-lab'; lab.textContent = f.name; row.appendChild(lab);
      let ctrl;
      if (f.kind === 'choice') {
        ctrl = document.createElement('select'); ctrl.className = 'pxc-rp-sel';
        const blank = document.createElement('option'); blank.value = ''; blank.textContent = '—'; ctrl.appendChild(blank);
        for (const c of (f.choices || [])) { const o = document.createElement('option'); o.value = c.label; o.textContent = c.label; if (c.label === f.value) o.selected = true; ctrl.appendChild(o); }
        ctrl.addEventListener('change', () => this._writeRecProp(rec, guid, f.name, 'choice', ctrl.value));
      } else if (f.kind === 'relation') {
        ctrl = document.createElement('div'); ctrl.className = 'pxc-rp-rel'; ctrl.textContent = f.value || '—'; ctrl.title = 'Open the record to edit relations';
      } else {
        ctrl = document.createElement('input'); ctrl.className = 'pxc-rp-inp'; ctrl.type = f.kind === 'date' ? 'date' : (f.kind === 'number' ? 'number' : 'text'); ctrl.value = (f.value == null ? '' : f.value);
        ctrl.addEventListener('change', () => this._writeRecProp(rec, guid, f.name, f.kind, ctrl.value));
      }
      row.appendChild(ctrl); list.appendChild(row);
    }
    box.appendChild(list);
    // EDIT-4a: a Datacore query field on the panel — type a dc: query → live result rows (guarded if Datacore isn't installed).
    const dcw = document.createElement('div'); dcw.className = 'pxc-rp-dc';
    const dcl = document.createElement('div'); dcl.className = 'pxc-rp-dclab'; dcl.textContent = '⛁ Datacore'; dcw.appendChild(dcl);
    const dci = document.createElement('input'); dci.className = 'pxc-rp-inp'; dci.placeholder = 'dc: @task @overdue   ↵'; dcw.appendChild(dci);
    const dco = document.createElement('div'); dco.className = 'pxc-rp-dcout'; dcw.appendChild(dco);
    dci.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const q = dci.value.trim().replace(/^dc:\s*/i, ''); if (!q) { dco.innerHTML = ''; return; }
      const dc = window.__plexusDatacore; if (!dc || !dc.queryTable) { dco.textContent = 'Datacore isn’t installed.'; return; }
      dco.textContent = '…';
      try { const t = await dc.queryTable(q, [{ field: '$name', label: 'Name' }]); const rows = (t && t.rows) || []; dco.innerHTML = '';
        const head = document.createElement('div'); head.className = 'pxc-rp-dcn'; head.textContent = rows.length + ' result' + (rows.length === 1 ? '' : 's'); dco.appendChild(head);
        for (const r of rows.slice(0, 40)) { const rr = document.createElement('div'); rr.className = 'pxc-rp-dcrow'; rr.textContent = r.name || r.guid; rr.title = 'Open'; rr.addEventListener('click', () => this._openRecord(r.guid)); dco.appendChild(rr); }
        if (rows.length > 40) { const more = document.createElement('div'); more.className = 'pxc-rp-dcrow'; more.style.opacity = '.55'; more.textContent = '+ ' + (rows.length - 40) + ' more'; dco.appendChild(more); }
      } catch (_e) { dco.textContent = 'Query error.'; }
    });
    box.appendChild(dcw);
    this.wrap.appendChild(box);
  }
  // ── EDIT-3: apply a Templater template to the selected record (re-implements the renderer — Templater has no callable seam) ──
  // A generic modal list picker (reuses the .pxc-modal/.pxc-collist chrome from _pickCollection) → returns the chosen item value.
  _pickFromList(label, items) {
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'pxc-modal';
      const done = (val) => { try { ov.remove(); } catch (_e) {} resolve(val); };
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) { e.stopPropagation(); done(null); } });
      const box = document.createElement('div'); box.className = 'pxc-modal-box'; box.addEventListener('pointerdown', (e) => e.stopPropagation());
      const lab = document.createElement('div'); lab.className = 'pxc-modal-label'; lab.textContent = label || 'Pick one:';
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'pxc-modal-input'; inp.placeholder = 'Filter…';
      const list = document.createElement('div'); list.className = 'pxc-collist'; let idx = 0, shown = items;
      const render = () => { const f = inp.value.trim().toLowerCase(); shown = items.filter((m) => !f || (m.name || '').toLowerCase().includes(f)); if (idx >= shown.length) idx = Math.max(0, shown.length - 1); list.innerHTML = ''; shown.forEach((m, i) => { const r = document.createElement('div'); r.className = 'pxc-colrow' + (i === idx ? ' active' : ''); r.textContent = m.name; r.addEventListener('mousedown', (ev) => { ev.preventDefault(); done(m.value); }); list.appendChild(r); }); };
      inp.addEventListener('input', () => { idx = 0; render(); });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); render(); } else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); } else if (e.key === 'Enter') { e.preventDefault(); if (shown[idx]) done(shown[idx].value); } else if (e.key === 'Escape') { e.preventDefault(); done(null); } });
      box.appendChild(lab); box.appendChild(inp); box.appendChild(list); ov.appendChild(box); this.wrap.appendChild(ov); render(); setTimeout(() => inp.focus(), 0);
    });
  }
  _fmtTemplateDate(d, fmt) {
    if (!fmt) { const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()], mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]; return `${dow} ${mon} ${d.getDate()}`; }
    const pad = (n, w) => String(n).padStart(w, '0');
    return fmt.replace(/YYYY/g, d.getFullYear()).replace(/MM/g, pad(d.getMonth() + 1, 2)).replace(/DD/g, pad(d.getDate(), 2)).replace(/HH/g, pad(d.getHours(), 2)).replace(/mm/g, pad(d.getMinutes(), 2)).replace(/ss/g, pad(d.getSeconds(), 2));
  }
  // Mirror Templater's renderTemplate (minus the <%* %> JS sandbox, intentionally stripped on the canvas): substitute
  // {{prompt:LABEL}}, {{date[:fmt]}}, {{record.PropName}}, {{var.NAME}}.
  _renderTemplateStr(content, ctx) {
    content = content.replace(/\{\{prompt:([^}]+?)\}\}/g, (_m, body) => (ctx.prompts && ctx.prompts[body.split(/\s*\?\?\s*/)[0].trim()]) || '');
    content = content.replace(/\{\{date(?::([^}]+))?\}\}/g, (_m, fmt) => this._fmtTemplateDate(new Date(), fmt));
    content = content.replace(/\{\{record\.([^}]+?)\}\}/g, (_m, prop) => { if (!ctx.rec || !ctx.rec.prop) return ''; try { const p = ctx.rec.prop(prop.trim()); if (!p) return ''; if (p.choiceLabel) { const cl = p.choiceLabel(); if (cl) return cl; } const v = (p.text && p.text()); return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); } catch (_e) { return ''; } });
    content = content.replace(/\{\{var\.([^}]+?)\}\}/g, (_m, name) => { const v = ctx.vars && ctx.vars[name.trim()]; return v == null ? '' : String(v); });
    content = content.replace(/<%\*[\s\S]*?%>/g, ''); // JS blocks not supported on the canvas
    return content;
  }
  async _applyTemplate(rec, guid) {
    let tmplColl = null;
    try { const cols = await this.plugin.data.getAllCollections(); tmplColl = (cols || []).find((c) => { try { return c.getName() === 'Recurring Templates'; } catch (_e) { return false; } }); } catch (_e) {}
    if (!tmplColl) { try { this.plugin.ui.addToaster({ title: 'No “Recurring Templates” collection found (install Templater first).', dismissible: true }); } catch (_e) {} return; }
    let templates = []; try { templates = (await tmplColl.getAllRecords()) || []; } catch (_e) {}
    if (!templates.length) { try { this.plugin.ui.addToaster({ title: 'No templates yet.', dismissible: true }); } catch (_e) {} return; }
    const nameOf = (r) => { try { return (r.text && r.text('name')) || (r.getName && r.getName()) || 'template'; } catch (_e) { return 'template'; } };
    const tpl = await this._pickFromList('Apply a template to this record:', templates.map((r) => ({ name: nameOf(r), value: r })));
    if (!tpl) return;
    let content = ''; try { content = (tpl.text && tpl.text('content')) || ''; } catch (_e) {}
    if (!content) { try { this.plugin.ui.addToaster({ title: 'That template has no content.', dismissible: true }); } catch (_e) {} return; }
    try { const ext = (tpl.text && tpl.text('extends')) || ''; if (ext.trim()) { const parent = templates.find((r) => { try { return nameOf(r) === ext.trim() || r.guid === ext.trim(); } catch (_e) { return false; } }); if (parent) content = ((parent.text && parent.text('content')) || '') + '\n' + content; } } catch (_e) {} // extends → prepend parent
    let defaults = {}; try { const raw = (tpl.text && tpl.text('variables')) || ''; if (raw.trim()) { const v = JSON.parse(raw); defaults = v.defaults || {}; } } catch (_e) {}
    // collect prompts (strip JS blocks first so {{}} inside them isn't collected)
    const labels = [], seen = new Set();
    content.replace(/<%\*[\s\S]*?%>/g, '').replace(/\{\{prompt:([^}]+?)\}\}/g, (_m, body) => { const parts = body.split(/\s*\?\?\s*/), label = parts[0].trim(); if (!seen.has(label)) { seen.add(label); labels.push({ label, def: (parts[1] || defaults[label] || '').trim() }); } return ''; });
    const prompts = {};
    for (const pl of labels) { const v = await this._promptText('Template — ' + pl.label + ':', pl.def); if (v === null) return; prompts[pl.label] = v || pl.def; }
    const rendered = this._renderTemplateStr(content, { rec, prompts, vars: defaults });
    try { await rec.insertFromMarkdown(rendered); }
    catch (_e) { try { for (const ln of rendered.split('\n')) { if (ln.trim()) await rec.createLineItem(null, null, 'ulist', [{ type: 'text', text: ln }], null); } } catch (_e2) {} } // fallback: line-by-line
    this._invalidateRec(guid); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Applied template “' + nameOf(tpl) + '”.', dismissible: true }); } catch (_e) {}
  }
  // BULK PROPERTY BRUSH: set ONE typed property to the same value across all selected record cards in one gesture —
  // spreadsheet fill-down on REAL records (a choice prop uses setChoice; date→DateTime; number→set(Number); else text).
  async _bulkBrush() {
    const cards = [...this.selected].map((id) => this._byId(id)).filter((e) => e && (e.type === 'record' || e.type === 'board') && e.recordGuid);
    if (!cards.length) { try { this.plugin.ui.addToaster({ title: 'Select one or more record cards first (marquee/shift-click).', dismissible: true }); } catch (_e) {} return; }
    const raw = await this._promptText('Set a property on ' + cards.length + ' card(s) — “Property: value”:', '');
    if (!raw) return;
    const m = String(raw).match(/^\s*([^:]+?)\s*:\s*([\s\S]+?)\s*$/);
    if (!m) { try { this.plugin.ui.addToaster({ title: 'Use the form  Property: value  (e.g. Status: Done).', dismissible: true }); } catch (_e) {} return; }
    const name = m[1], value = m[2], cls = pxcClassifyValue(value);
    let done = 0, unmatched = 0;
    for (const card of cards) {
      try {
        const rec = await this.plugin.data.getRecord(card.recordGuid); if (!rec || !rec.prop) continue;
        const p = rec.prop(name); if (!p) continue;
        // Route by DECLARED type, not by value (TS-6): writing a Number/DateTime object onto a text field corrupts it,
        // and there's no runtime PluginProperty.type. Confident signals only: choices()→choice; a CURRENT date value
        // confirms a datetime prop; otherwise write the RAW STRING and let Thymer coerce per the prop's own type.
        let opts = null; try { opts = p.choices && p.choices(); } catch (_e) {}
        let ok = false;
        if (opts && opts.length) { let r = false; try { r = p.setChoice(value); } catch (_e) {} if (r === false) unmatched++; else ok = true; } // choice → replace selection by label
        else {
          let curDate = null; try { curDate = p.date && p.date(); } catch (_e) {}
          if (curDate != null && cls.kind === 'date') { try { p.set(DateTime.parseDateTimeString(cls.iso).value()); ok = true; } catch (_e) { try { p.set(value); ok = true; } catch (_e2) {} } } // confirmed datetime → typed write
          else { try { p.set(value); ok = true; } catch (_e) {} } // SAFE default: raw string (never a forced Number/object onto an unconfirmed type)
        }
        if (ok) { done++; this._invalidateRec(card.recordGuid); }
      } catch (_e) {}
    }
    this.dirty = true;
    const hint = (done === 0 && unmatched > 0) ? ' — “' + value + '” isn’t a valid choice for “' + name + '”' : '';
    try { this.plugin.ui.addToaster({ title: 'Set “' + name + '” = “' + value + '” on ' + done + '/' + cards.length + ' card(s)' + hint + '.', dismissible: true }); } catch (_e) {}
  }
  // QUICK-CAPTURE: type a title → create a typed record + drop a live card at the viewport centre. Reuses the
  // last-used collection (localStorage) for a true one-step capture; falls back to the collection picker the first time.
  async _quickCapture() {
    const title = await this._promptText('Quick-capture — new record title:', '');
    if (!title) return;
    let col = null, lastGuid = null;
    try { lastGuid = localStorage.getItem('plexus_create_col'); } catch (_e) {}
    if (lastGuid) { try { const cols = await this.plugin.data.getAllCollections(); col = (cols || []).find((c) => { try { return (c.getGuid && c.getGuid()) === lastGuid; } catch (_e) { return false; } }) || null; } catch (_e) {} }
    if (!col) col = await this._pickCollection('Create “' + title + '” in collection:');
    if (!col) return;
    let guid = null; try { guid = col.createRecord(title); } catch (_e) {}
    if (typeof guid !== 'string') { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the record.', dismissible: true }); } catch (_e) {} return; }
    await getRecordPoll(this.plugin, guid, 8);
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    this._invalidateRec(guid); this._insertRecordCard(guid, c.x, c.y); // inserts + selects + saves; card pulls title/lines live
    try { this.plugin.ui.addToaster({ title: 'Captured “' + title + '” — a live record card.', dismissible: true }); } catch (_e) {}
  }
  // EDIT-2: the default "notes" target for a new card — Notes → Captures → Inbox → the Plexus Drawings collection.
  async _defaultCollection() {
    try { const cols = await this.plugin.data.getAllCollections(); const f = (re) => (cols || []).find((c) => { try { return re.test(c.getName()); } catch (_e) { return false; } }); return f(/^notes$/i) || f(/^captures$/i) || f(/^inbox$/i) || null; } catch (_e) { return null; }
  }
  // EDIT-2: drop a NEW record card at a world point — creates a record in the default collection (Heptabase-style); the
  // property panel (EDIT-1) opens automatically on the resulting selection, where the user renames / sets props / Moves it.
  async _newRecordCardAt(wx, wy) {
    let col = await this._defaultCollection(); if (!col) { try { col = await this.plugin._drawingsCollection(); } catch (_e) {} } // _drawingsCollection lives on the Plugin, not the view (was: this._drawingsCollection → TypeError)
    if (!col) { try { this.plugin.ui.addToaster({ title: 'Plexus: no Notes/Captures collection to create the card in.', dismissible: true }); } catch (_e) {} return; }
    let guid = null; try { guid = col.createRecord('Untitled'); } catch (_e) {}
    if (typeof guid !== 'string') { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the record.', dismissible: true }); } catch (_e) {} return; }
    await getRecordPoll(this.plugin, guid, 8);
    this._invalidateRec(guid); this._insertRecordCard(guid, wx, wy); // selects the card → _syncRecPanel opens the editable panel
    try { this.plugin.ui.addToaster({ title: 'New card in “' + ((col.getName && col.getName()) || 'notes') + '” — edit its title/properties on the right, or Move… to another collection.', dismissible: true }); } catch (_e) {}
  }
  _clipText(ctx, s, maxW) { s = String(s == null ? '' : s); if (ctx.measureText(s).width <= maxW) return s; while (s.length && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  // Indent-Rainbow parity: draw ONE transcluded outline row the way the flow plugin renders it on a record — a depth-colored
  // marker dot + a depth-colored vertical indent guide per ancestor level — instead of a plain '• '. STEP=13px/level, rowH=16,
  // marker centered on the text's optical middle. Caller owns font + textBaseline('top'); we save/restore stroke+alpha+fill.
  _drawOutlineRow(ctx, text, depth, tx, ty, textColor, maxW) {
    const STEP = 13, lineH = 16, pal = PXC_RAINBOW, ind = depth * STEP;
    const lines = pxcWrapLines(ctx, text || '', maxW - ind - 11); // WRAP long lines to multiple lines (was a single clipped line); returns the row height so the caller advances ty
    const rowH = Math.max(lineH, lines.length * lineH);
    ctx.save();
    ctx.lineWidth = 1; ctx.globalAlpha = 0.45; // indent guides span the FULL wrapped row height
    for (let L = 0; L < depth; L++) { const gx = tx + L * STEP + 3.5; ctx.strokeStyle = pal[L % pal.length]; ctx.beginPath(); ctx.moveTo(gx, ty - 2); ctx.lineTo(gx, ty + rowH - 2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal[depth % pal.length]; ctx.beginPath(); ctx.arc(tx + ind + 3.5, ty + 6, 2.3, 0, Math.PI * 2); ctx.fill(); // marker dot stays on the first line
    ctx.fillStyle = textColor; for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], tx + ind + 11, ty + i * lineH);
    ctx.restore();
    return rowH;
  }
  _drawRecordCard(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    const sk = (this._recCache && this._recCache.get(el.recordGuid) || {}).skin || {}; // CS-8: property-conditional style
    if (sk.urgent) { ctx.save(); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - 3, y - 3, w + 6, h + 6, rad + 3); else ctx.rect(x - 3, y - 3, w + 6, h + 6); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ef4444'; ctx.globalAlpha = (el.opacity == null ? 1 : el.opacity) * 0.8; ctx.stroke(); ctx.restore(); } // Due-past urgency ring
    const dark = PXC_DARK, accent = sk.color || el.strokeColor || '#7c5cff'; // dark-mode-aware surface/ink + a live-transclusion glow
    const glowOn = !(this.plugin._settings && this.plugin._settings.cardGlow === false), titleCol = dark ? '#e6e7ea' : '#1e1e1e', bodyCol = dark ? '#9aa3ad' : '#5f6368';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = (el.backgroundColor && el.backgroundColor.toLowerCase() !== '#ffffff') ? el.backgroundColor : (dark ? (this._cardSurface || '#1b1d24') : '#ffffff'); // B1: the DEFAULT surface follows the live theme (matches the whiteboard's card colour, dark or light); an explicitly-chosen non-white bg is still respected; export forces light → white
    if (glowOn) { ctx.shadowColor = accent; ctx.shadowBlur = 12 * this.camera.zoom * this.dpr; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; } else ctx.fill(); // GLOW: accent halo via the fill's shadow (static — no per-frame anim; ~12 world px at any zoom)
    ctx.lineWidth = (el.strokeWidth || 1.5) * (sk.color ? 2 : 1); ctx.strokeStyle = accent; ctx.stroke();
    ctx.save(); ctx.clip();
    const rec = this._recFor(el.recordGuid); const pad = 10, tx = x + pad + 4, maxW = w - pad * 2 - 4; let ty = y + pad;
    const _la = (this.plugin._settings && this.plugin._settings.linkOpacity != null ? this.plugin._settings.linkOpacity : 100) / 100, _ga = ctx.globalAlpha; ctx.globalAlpha = _ga * _la; // S10: dim the link/accent stripe only
    ctx.fillStyle = (rec && rec.tag) ? tagColor(rec.tag) : accent; ctx.fillRect(x, y, 4, h); ctx.globalAlpha = _ga; // E11: accent encodes a choice property
    ctx.textBaseline = 'top';
    if (!rec) { ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = dark ? '#8b9096' : '#9aa0a6'; ctx.fillText('Loading…', tx, ty); ctx.restore(); ctx.restore(); return; }
    ctx.font = '600 15px system-ui, sans-serif'; ctx.fillStyle = titleCol; ctx.fillText(this._clipText(ctx, rec.title, maxW), tx, ty); ty += 23;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = bodyCol;
    const bands = []; // Phase 4: capture each body row's band (relative to card top) for line-level connection targeting + the blue flag
    for (const ln of rec.lines) { if (ty > y + h - 14) break; const rh = this._drawOutlineRow(ctx, ln.text, ln.depth || 0, tx, ty, bodyCol, maxW); if (ln.lineGuid) bands.push({ lineGuid: ln.lineGuid, dy: ty - y, h: rh }); ty += rh; } // TRANSCLUSION: record-style rainbow marker + indent guide per row, wraps long lines (Indent-Rainbow parity)
    this._lineRects.set(el.id, bands); // dy is RELATIVE to the card top → tracks a MOVE without a re-raster; a resize re-rasters and recomputes
    ctx.restore(); ctx.restore();
  }
  _insertRecordCard(guid, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeRecordCard(this._snap(wx - 130), this._snap(wy - 80), 260, 160, guid);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // SUBGRAPH→CANVAS: drop a Brain focus + neighbourhood (graph-space coords, focus at 0,0) as live bound record cards +
  // role-coloured arrows, centred on the viewport. Completes the Canvas↔Brain round-trip. Returns true on success.
  _dropSubgraph(payload) {
    if (!payload || !Array.isArray(payload.nodes) || !payload.nodes.length) return false;
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2), CW = 180, CH = 84, byGuid = new Map();
    this.selected.clear();
    for (const n of payload.nodes) {
      if (!n.guid || byGuid.has(n.guid)) continue;
      const card = makeRecordCard(this._snap(c.x + (n.x || 0) - CW / 2), this._snap(c.y + (n.y || 0) - CH / 2), CW, CH, n.guid);
      if (n.role && ROLE_HEX[n.role]) card.strokeColor = ROLE_HEX[n.role];
      this.scene.elements.push(card); byGuid.set(n.guid, card); this.selected.add(card.id); this._invalidateRec(n.guid);
    }
    for (const e of (payload.edges || [])) {
      const a = byGuid.get(e.from), b = byGuid.get(e.to); if (!a || !b || a === b) continue;
      const ar = makeLinear(0, 0, 'arrow', { stroke: ROLE_HEX[e.role] || '#94a3b8', strokeWidth: 2 });
      ar.points = [[a.x + a.width / 2, a.y + a.height / 2], [b.x + b.width / 2, b.y + b.height / 2]]; ar.endArrowhead = 'arrow';
      ar.startBinding = { elementId: a.id }; ar.endBinding = { elementId: b.id }; linearBBox(ar); this.scene.elements.push(ar);
    }
    try { this._updateBindings(); } catch (_e) {}
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Dropped ' + byGuid.size + ' live card(s) from Plexus Brain.', dismissible: true }); } catch (_e) {}
    return true;
  }
  async _openRecord(guid) {
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (!panel) { try { panel = await this.plugin.ui.createPanel(); } catch (_e) {} }
    if (!panel) return;
    try { panel.navigateTo({ type: 'edit_panel', rootId: guid, workspaceGuid: ws }); } catch (e) { console.error('[Plexus] openRecord', e); }
  }
  // S10: single open path for record/board cards (and @@ ref nodes) — honors the openInNewPanel setting.
  _openCard(el) {
    if (el.refKind === 'image') { this._openImageRef(el); return; } // IMG-REF: open the attachment/banner in a lightbox
    if (el.refKind === 'line' && el.refLineGuid) { this._openRefLine(el); return; } // A4: line ref → jump to the line
    const st = this.plugin._settings || {};
    const newPanel = st.openInNewPanel !== false; // default ON = side panel (today's behavior)
    const guid = el.recordGuid || el.refGuid;
    if (!guid) return;
    if (el.type === 'board') { this.plugin._openPanelFor(guid, { inPlace: !newPanel }); return; }
    if (newPanel) { this._openRecord(guid); return; }
    const ws = (this.plugin.getWorkspaceGuid && this.plugin.getWorkspaceGuid()) || this.plugin.workspaceGuid;
    const here = this.panel || (this.plugin.ui.getActivePanel && this.plugin.ui.getActivePanel());
    if (here) { try { here.navigateTo({ type: 'edit_panel', rootId: guid, workspaceGuid: ws }); return; } catch (_e) {} }
    this._openRecord(guid); // fallback: no active panel → new side panel
  }
  // Phase 9 E2: query-node cache + render. Runs searchByQuery; the plugin invalidates on record events.
  _queryFor(q) {
    if (!this._queryCache) this._queryCache = new Map();
    const c = this._queryCache.get(q);
    if (c) return c.ready ? c : null;
    const entry = { ready: false, items: [], count: 0 }; this._queryCache.set(q, entry);
    (async () => {
      try {
        // EDIT-4b: a "dc:" query runs through the Datacore engine (if installed); everything else uses Thymer search.
        const dc = window.__plexusDatacore;
        if (/^dc:\s*/i.test(q) && dc && dc.queryTable) {
          const t = await dc.queryTable(q.replace(/^dc:\s*/i, ''), [{ field: '$name', label: 'Name' }]); const rows = (t && t.rows) || [];
          entry.items = rows.slice(0, 24).map((r) => ({ guid: r.guid, title: r.name || r.guid, kind: 'record' })); entry.count = rows.length; entry.ready = true; this.dirty = true; return;
        }
        if (/^dc:\s*/i.test(q)) { entry.items = []; entry.count = 0; entry.title = '(Datacore not installed)'; entry.ready = true; this.dirty = true; return; }
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
  // ROLL-UP CARDS: live aggregate over a search. Caches by query+agg; the plugin clears the cache on record.updated.
  _rollupFor(el) {
    if (!this._rollupCache) this._rollupCache = new Map();
    const key = (el.query || '') + '\x1f' + (el.agg || 'count');
    const c = this._rollupCache.get(key); if (c) return c.ready ? c : null;
    const entry = { ready: false, value: null, n: 0, suffix: '' }; this._rollupCache.set(key, entry);
    (async () => {
      try {
        const spec = pxcParseAgg(el.agg);
        const res = await this.plugin.data.searchByQuery(el.query || '', 200);
        const recs = (res && res.records) || [];
        if (spec.fn === 'pctdone') {
          let done = 0, tot = 0;
          for (const r of recs) { try { const items = await r.getLineItems(); for (const li of (items || [])) { if (li && li.type === 'task') { tot++; let d = false; try { d = (li.isTaskCompleted && li.isTaskCompleted() === true) || (li.getTaskStatus && li.getTaskStatus() === 'done'); } catch (_e) {} if (d) done++; } } } catch (_e) {} }
          entry.value = tot ? Math.round(done / tot * 100) : 0; entry.suffix = '%'; entry.n = tot;
        } else if (spec.fn === 'count') { entry.value = recs.length; entry.n = recs.length; }
        else {
          const nums = []; for (const r of recs) { try { const p = r.prop && r.prop(spec.prop); const num = p && p.number ? p.number() : null; if (num != null && isFinite(num)) nums.push(num); } catch (_e) {} }
          entry.value = pxcComputeAgg(spec.fn, nums, recs.length); entry.n = nums.length;
        }
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.value = '(err)'; entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateRollups() { if (this._rollupCache && this._rollupCache.size) { this._rollupCache.clear(); this.dirty = true; } }
  _drawRollupNode(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#ffffff'; ctx.fill(); ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#16a34a'; ctx.stroke();
    ctx.save(); ctx.clip();
    const data = this._rollupFor(el), pad = 10, spec = pxcParseAgg(el.agg);
    const lbl = (spec.fn === 'count' ? 'count' : spec.fn === 'pctdone' ? '% done' : (spec.fn + ' ' + (spec.prop || ''))) + ' · ' + (el.query || '');
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = el.strokeColor || '#16a34a';
    ctx.fillText(this._clipText(ctx, '∑ ' + lbl, w - pad * 2), x + pad, y + pad);
    const txt = !data ? '…' : ((data.value == null ? '–' : String(data.value)) + (data.suffix || ''));
    const fs = Math.max(18, Math.min(Math.abs(h) * 0.4, 60));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 ' + fs + 'px system-ui, sans-serif'; ctx.fillStyle = PXC_DARK ? '#e6e8ee' : '#1e1e1e';
    ctx.fillText(this._clipText(ctx, txt, w - pad * 2), x + w / 2, y + h / 2 + 6);
    if (data) { ctx.textBaseline = 'bottom'; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#9aa0a6'; ctx.fillText('n=' + data.n, x + w / 2, y + h - pad); }
    ctx.textAlign = 'left'; ctx.restore(); ctx.restore();
  }
  _insertRollup(query, agg, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeRollup(this._snap(wx - 90), this._snap(wy - 60), 180, 120, query, agg);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // LIVE TABLE: schema-safe typed-property write (shared with Bulk-Brush semantics) — choice→setChoice, confirmed
  // datetime→DateTime, else raw string (never a forced Number/object onto an unconfirmed-type field). Returns bool.
  _writeProp(rec, name, value) {
    if (!rec || !rec.prop) return false; const p = rec.prop(name); if (!p) return false;
    let opts = null; try { opts = p.choices && p.choices(); } catch (_e) {}
    if (opts && opts.length) { try { return p.setChoice(value) !== false; } catch (_e) { return false; } }
    let curDate = null; try { curDate = p.date && p.date(); } catch (_e) {}
    const cls = pxcClassifyValue(value);
    if (curDate != null && cls.kind === 'date') { try { p.set(DateTime.parseDateTimeString(cls.iso).value()); return true; } catch (_e) { try { p.set(value); return true; } catch (_e2) { return false; } } }
    try { p.set(value); return true; } catch (_e) { return false; }
  }
  _tableGeom(el) { const nCol = (el.cols || []).length + 1; return { nCol, colW: el.width / Math.max(1, nCol), rowH: 26 }; } // +1 = the Name column
  _tableFor(el) {
    if (!this._tableCache) this._tableCache = new Map();
    const key = (el.query || '') + '\x1f' + (el.cols || []).join(',');
    const c = this._tableCache.get(key); if (c) return c.ready ? c : null;
    const entry = { ready: false, rows: [] }; this._tableCache.set(key, entry);
    (async () => {
      try {
        const res = await this.plugin.data.searchByQuery(el.query || '', 50); const recs = (res && res.records) || [];
        const rows = [];
        for (const r of recs.slice(0, 50)) {
          const cells = (el.cols || []).map((name) => { let v = ''; try { const p = r.prop && r.prop(name); if (p) v = (p.choiceLabel && p.choiceLabel()) || (p.text && p.text()) || (p.number && p.number() != null ? String(p.number()) : '') || (p.date && p.date() ? pxcMsToIsoLocal(p.date().getTime()) : '') || ''; } catch (_e) {} return String(v || ''); });
          rows.push({ guid: r.guid, title: (r.getName && r.getName()) || 'Untitled', cells });
        }
        entry.rows = rows; entry.ready = true; this.dirty = true;
      } catch (_e) { entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateTables() { if (this._tableCache && this._tableCache.size) { this._tableCache.clear(); this.dirty = true; } }
  _drawTableNode(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2), g = this._tableGeom(el);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#ffffff'; ctx.fill(); ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#7c5cff'; ctx.stroke();
    ctx.save(); ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h); ctx.clip();
    const cols = ['Name'].concat(el.cols || []), data = this._tableFor(el);
    ctx.fillStyle = '#f3f0ff'; ctx.fillRect(x, y, w, g.rowH);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#5b4bd6';
    cols.forEach((cn, ci) => ctx.fillText(this._clipText(ctx, cn, g.colW - 10), x + ci * g.colW + 6, y + g.rowH / 2));
    ctx.strokeStyle = '#e8e5f5'; ctx.lineWidth = 1;
    for (let ci = 1; ci < g.nCol; ci++) { ctx.beginPath(); ctx.moveTo(x + ci * g.colW, y); ctx.lineTo(x + ci * g.colW, y + h); ctx.stroke(); }
    if (!data) { ctx.fillStyle = '#9aa0a6'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('Loading…', x + 8, y + g.rowH + 14); ctx.restore(); ctx.restore(); return; }
    if (!cols.length || cols.length === 1) { ctx.fillStyle = '#9aa0a6'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('Double-click to set columns', x + 8, y + g.rowH + 14); }
    let ry = y + g.rowH;
    for (const row of data.rows) {
      if (ry + g.rowH > y + h) break;
      ctx.strokeStyle = '#eeeeee'; ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + w, ry); ctx.stroke();
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#1e1e1e'; ctx.fillText(this._clipText(ctx, row.title, g.colW - 10), x + 6, ry + g.rowH / 2);
      ctx.fillStyle = '#3c4043'; row.cells.forEach((cv, ci) => ctx.fillText(this._clipText(ctx, cv, g.colW - 10), x + (ci + 1) * g.colW + 6, ry + g.rowH / 2));
      ry += g.rowH;
    }
    ctx.restore(); ctx.restore();
  }
  _tableCellAt(el, wx, wy) {
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, c = Math.cos(-el.angle), s = Math.sin(-el.angle), dx = wx - cx, dy = wy - cy; wx = cx + dx * c - dy * s; wy = cy + dx * s + dy * c; }
    if (wx < el.x || wx > el.x + el.width || wy < el.y || wy > el.y + el.height) return null;
    const g = this._tableGeom(el), idx = pxcTableCellIndex(el.x, el.y, el.width, g.nCol, g.rowH, wx, wy);
    if (idx.ri === 0) return { header: true };
    const data = this._tableFor(el); if (!data) return null;
    const row = data.rows[idx.ri - 1]; if (!row) return null;
    if (idx.col === 0) return { isTitle: true, row };
    const prop = (el.cols || [])[idx.col - 1]; if (!prop) return null;
    return { row, prop, value: row.cells[idx.col - 1] || '', cx: el.x + idx.col * g.colW, cy: el.y + idx.ri * g.rowH, cw: g.colW, ch: g.rowH };
  }
  async _configureTable(el) {
    const q = await this._promptText('Table query (Thymer search, e.g. @task @overdue):', el.query || '@task');
    if (q == null) return;
    const cols = await this._promptText('Columns (comma-separated property names, e.g. Status, Due):', (el.cols || []).join(', '));
    if (cols == null) return;
    el.query = q; el.cols = String(cols).split(',').map((s) => s.trim()).filter(Boolean);
    this._invalidateTables(); this.dirty = true; this.scheduleSave();
  }
  _editTableCell(el, cell) {
    if (!cell || !cell.prop || !cell.row) return;
    const z = this.camera.zoom, s = this.camera.worldToScreen(cell.cx, cell.cy);
    if (this._cellInp) { try { this._cellInp.remove(); } catch (_e) {} }
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'pxc-cell-edit'; inp.value = cell.value || ''; this._cellInp = inp;
    inp.style.cssText = 'position:absolute;left:' + s.x + 'px;top:' + s.y + 'px;width:' + (cell.cw * z) + 'px;height:' + (cell.ch * z) + 'px;box-sizing:border-box;border:2px solid #7c5cff;border-radius:3px;padding:0 4px;font:' + (12 * z) + 'px system-ui;outline:none;z-index:25;background:#fff;color:#1e1e1e';
    this.wrap.appendChild(inp); setTimeout(() => { inp.focus(); inp.select(); }, 0);
    let done = false;
    const commit = async () => { if (done) return; done = true; const val = inp.value; try { inp.remove(); } catch (_e) {} this._cellInp = null;
      try { const rec = await this.plugin.data.getRecord(cell.row.guid); if (rec && this._writeProp(rec, cell.prop, val)) { this._invalidateTables(); this._invalidateRec(cell.row.guid); } } catch (_e) {}
      this.dirty = true; this.scheduleSave();
    };
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); else if (e.key === 'Escape') { done = true; try { inp.remove(); } catch (_e) {} this._cellInp = null; } }); // Escape = abort with NO write (set `done` so a blur→commit no-ops; avoids the lossy date round-trip)
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  _insertTable(query, cols, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeTable(this._snap(wx - 200), this._snap(wy - 100), 400, 240, query, cols);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // CS-9: spatial query pinboard — run a Thymer search and materialize each match as a LIVE record card in a grid,
  // wrapped in a labelled frame. Each card repaints on record.updated; "@task @overdue" → a wall you clear as you go.
  async _queryPinboard(q) {
    if (q == null) q = await this._promptText('Pinboard query (Thymer search, e.g. @task @overdue):', '@task');
    if (!q) return;
    let res = null; try { res = await this.plugin.data.searchByQuery(q, 40); } catch (_e) {}
    const recs = (res && res.records) || [];
    if (!recs.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no matches for “' + q + '”.', dismissible: true }); } catch (_e) {} return; }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const COLS = 4, CW = 240, CH = 150, GAP = 24, n = Math.min(recs.length, 40), rows = Math.ceil(n / COLS);
    const x0 = this._snap(c.x - (COLS * (CW + GAP)) / 2 + GAP / 2), y0 = this._snap(c.y - (rows * (CH + GAP)) / 2 + 36);
    const fr = makeFrame(x0 - 16, y0 - 44, COLS * (CW + GAP) + 16, rows * (CH + GAP) + 52); fr.name = 'Pinboard: ' + q; this.scene.elements.unshift(fr);
    this.selected.clear();
    recs.slice(0, 40).forEach((r, i) => { const col = i % COLS, row = Math.floor(i / COLS); const el = makeRecordCard(x0 + col * (CW + GAP), y0 + row * (CH + GAP), CW, CH, r.guid); this.scene.elements.push(el); this.selected.add(el.id); });
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Pinboard: ' + n + ' live cards for “' + q + '”.', dismissible: true }); } catch (_e) {}
  }
  // CS-1: property-driven living layout — snap the selected record cards into COLUMNS by a typed property value
  // (a kanban board keyed on Status/Priority/etc.), with a header per column. Re-run to re-arrange as values change.
  async _arrangeByProperty() {
    const cards = [...this.selected].map((id) => this._byId(id)).filter((e) => e && e.type === 'record');
    if (cards.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: select 2+ record cards first.', dismissible: true }); } catch (_e) {} return; }
    const prop = await this._promptText('Arrange by property (e.g. Status, Priority):', 'Status');
    if (!prop) return;
    const groups = new Map();
    for (const card of cards) {
      let val = '(none)';
      try { const rec = await this.plugin.data.getRecord(card.recordGuid); if (rec && rec.prop) { const p = rec.prop(prop); if (p) { val = (p.choiceLabel && p.choiceLabel()) || (p.text && p.text()) || (p.number && p.number() != null ? String(p.number()) : null) || '(none)'; } } } catch (_e) {}
      val = String(val || '(none)'); if (!groups.has(val)) groups.set(val, []); groups.get(val).push(card);
    }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const CW = 240, CH = 150, COLGAP = 40, ROWGAP = 20, cols = [...groups.keys()];
    const x0 = this._snap(c.x - (cols.length * (CW + COLGAP)) / 2), y0 = this._snap(c.y - 80);
    cols.forEach((val, ci) => {
      const colX = x0 + ci * (CW + COLGAP);
      const hdr = makeText(colX, y0 - 36, { fontSize: 16, stroke: '#7c5cff' }); hdr.text = prop + ': ' + val; measureText(hdr); this.scene.elements.push(hdr);
      groups.get(val).forEach((card, ri) => { card.x = colX; card.y = y0 + ri * (CH + ROWGAP); card.width = CW; card.height = CH; });
    });
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Arranged ' + cards.length + ' cards into ' + cols.length + ' columns by ' + prop + '.', dismissible: true }); } catch (_e) {}
  }
  // TIMELINE / GANTT: position selected record cards on a real datetime axis (by Scheduled/Due/…), optional swim-lanes
  // by a 2nd property; DRAG a card horizontally → re-dates the record in place (the live Gantt no whiteboard can do).
  async _arrangeTimeline() {
    const cards = [...this.selected].map((id) => this._byId(id)).filter((e) => e && e.type === 'record');
    if (cards.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: select 2+ record cards first.', dismissible: true }); } catch (_e) {} return; }
    const laneProp = await this._promptText('Swim-lane by property (blank = single lane):', '');
    if (laneProp === null) return;
    const items = [];
    for (const card of cards) {
      let ms = null, lane = '';
      try { const rec = await this.plugin.data.getRecord(card.recordGuid); if (rec && rec.prop) {
        for (const k of ['Scheduled', 'Date', 'Due', 'Due Date', 'Start', 'Deadline']) { const p = rec.prop(k); if (p && p.date) { const d = p.date(); if (d) { ms = d.getTime(); break; } } }
        if (laneProp) { const p = rec.prop(laneProp); if (p) lane = (p.choiceLabel && p.choiceLabel()) || (p.text && p.text()) || ''; }
      } } catch (_e) {}
      items.push({ card, ms, lane: String(lane || '') });
    }
    const dated = items.filter((it) => it.ms != null);
    if (dated.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: need 2+ cards with a date (Scheduled/Due/Start/…).', dismissible: true }); } catch (_e) {} return; }
    for (const e of this.scene.elements) if (e.tlAxis) e.isDeleted = true; // clear a prior timeline's ticks/labels (no accumulation on re-run)
    const minMs = Math.min.apply(null, dated.map((it) => it.ms)), maxMs = Math.max.apply(null, dated.map((it) => it.ms));
    const _d0 = new Date(minMs); _d0.setHours(0, 0, 0, 0); const day0Ms = _d0.getTime(); // LOCAL midnight bucket (matches pxcMsToIsoLocal's local Y-M-D → no day-boundary off-by-one)
    const spanDays = Math.max(1, Math.ceil((maxMs - day0Ms) / PXC_DAY_MS));
    const CW = 200, CH = 110, LANE_H = 150, pxPerDay = Math.max(28, Math.min(120, 900 / spanDays)), AXIS_W = spanDays * pxPerDay;
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const x0 = this._snap(c.x - AXIS_W / 2), yTop = this._snap(c.y - 90);
    const lanes = []; for (const it of dated) if (lanes.indexOf(it.lane) < 0) lanes.push(it.lane);
    if (!lanes.length) lanes.push('');
    this._timeline = { x0, day0Ms, pxPerDay, cw: CW };
    // date tick guides + labels (~weekly), drawn as light line + text elements behind the cards
    const tickEvery = spanDays > 60 ? 7 : (spanDays > 14 ? 7 : 1), botY = yTop + lanes.length * LANE_H;
    for (let dz = 0; dz <= spanDays; dz += tickEvery) {
      const tx = this._snap(pxcTimelineX(day0Ms + dz * PXC_DAY_MS, day0Ms, x0, pxPerDay));
      const ln = makeLinear(tx, yTop - 24, 'line', { stroke: '#d9dde5', strokeWidth: 1 }); ln.points = [[tx, yTop - 24], [tx, botY]]; ln.endArrowhead = null; ln.roughness = 0; ln.tlAxis = true; linearBBox(ln); this.scene.elements.unshift(ln);
      const lab = makeText(tx + 3, yTop - 22, { fontSize: 11, stroke: '#9aa0a6' }); lab.text = pxcMsToIsoLocal(day0Ms + dz * PXC_DAY_MS).slice(5); lab.tlAxis = true; measureText(lab); this.scene.elements.push(lab);
    }
    lanes.forEach((lane, li) => { if (!lane) return; const h = makeText(x0 - 8, yTop + li * LANE_H + 4, { fontSize: 13, stroke: '#7c5cff' }); h.text = (laneProp || 'lane') + ': ' + lane; h.tlAxis = true; measureText(h); this.scene.elements.push(h); });
    for (const it of dated) {
      const li = Math.max(0, lanes.indexOf(it.lane));
      it.card.x = this._snap(pxcTimelineX(it.ms, day0Ms, x0, pxPerDay) - CW / 2);
      it.card.y = yTop + li * LANE_H + 24; it.card.width = CW; it.card.height = CH; it.card.tlBound = true; it.card.tlMs = it.ms; // tlMs = the day this card was placed at → skip a no-op re-date
    }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Timeline: ' + dated.length + ' card(s) across ' + spanDays + ' day(s), ' + lanes.length + ' lane(s). Drag a card to re-date it.', dismissible: true }); } catch (_e) {}
  }
  // Drag-to-redate: a moved timeline card → compute its new date from x and write it on the record (in place).
  _timelineRedateMoved(moveEls) {
    const tl = this._timeline; if (!tl) return;
    for (const m of moveEls) {
      const el = m.el; if (!el || el.type !== 'record' || !el.tlBound || !el.recordGuid) continue;
      const ms = pxcTimelineMs(el.x + (tl.cw || 200) / 2, tl.day0Ms, tl.x0, tl.pxPerDay);
      if (el.tlMs != null && ms === el.tlMs) continue; // didn't cross a day boundary → no redundant write
      el.tlMs = ms; const iso = pxcMsToIsoLocal(ms);
      const guid = el.recordGuid;
      this.plugin._setSchedule(guid, iso).then((r) => { this._invalidateRec(guid); try { this.plugin.ui.addToaster({ title: (r && r.ok ? 'Re-dated to ' + iso : 'Plexus: no Scheduled/Due datetime property to re-date'), dismissible: true }); } catch (_e) {} }).catch(() => {});
    }
  }
  // CS-7: frames → Slide records — each frame becomes a typed record in a "Slides" collection with Order + a banner
  // snapshot of the frame. The deck is then queryable + reorderable. Obsidian frames are just rectangles.
  async _framesToSlides() {
    const frames = this.scene.elements.filter((e) => !e.isDeleted && e.type === 'frame');
    if (!frames.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no frames to export as slides.', dismissible: true }); } catch (_e) {} return; }
    frames.sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.y - b.y || a.x - b.x);
    let col = null; try { const cols = await this.plugin.data.getAllCollections(); col = (cols || []).find((c) => c.getName && /^slides$/i.test(c.getName())); } catch (_e) {}
    if (!col) { try { this.plugin.ui.addToaster({ title: 'Plexus: create a “Slides” collection first, then re-run.', dismissible: true }); } catch (_e) {} return; }
    let n = 0;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]; const kids = this._frameChildren(f);
      let blob = null; try { blob = await exportPng({ type: 'excalidraw', appState: this.scene.appState, elements: kids, files: this.scene.files }, 2048, { scale: 2, padding: 12, background: true }); } catch (_e) {}
      let guid = null; try { guid = col.createRecord(f.name || ('Slide ' + (i + 1))); } catch (e) { console.error('[Plexus] slide', e); }
      if (typeof guid !== 'string') continue;
      let rec = null; for (let t = 0; t < 5 && !rec; t++) { try { rec = await this.plugin.data.getRecord(guid); } catch (_e) {} if (!rec) await sleep(150); }
      if (rec) {
        if (blob) { try { const b = await this.plugin.data.uploadBlob(new File([blob], 'slide.png', { type: 'image/png' })); if (b && rec.setBannerFromBlob) rec.setBannerFromBlob(b); } catch (_e) {} }
        try { const op = rec.prop('Order'); if (op && op.set) op.set(i + 1); } catch (_e) {}
      }
      n++;
    }
    try { this.plugin.ui.addToaster({ title: 'Created ' + n + ' slide record(s) with banners.', dismissible: true }); } catch (_e) {}
  }
  // CS-4: backlink halo & pull-in — for the selected record card, materialize its graph neighbours (incoming
  // backrefs + outbound refs) as bound record cards in a ring, with arrows. A per-record ExcaliBrain by hand.
  async _pullInNeighbours() {
    const card = this._singleSel();
    if (!card || card.type !== 'record') { try { this.plugin.ui.addToaster({ title: 'Plexus: select a single record card.', dismissible: true }); } catch (_e) {} return; }
    const guid = card.recordGuid; let rec = null; try { rec = await this.plugin.data.getRecord(guid); } catch (_e) {}
    if (!rec) return;
    const nb = new Set();
    try { const back = await rec.getBackReferences(); for (const br of (back || [])) { const r = br && br.record; if (r && r.guid) nb.add(r.guid); } } catch (_e) {}
    try { const items = await rec.getLineItems(); for (const li of (items || [])) for (const s of (li.segments || [])) if (s && s.type === 'ref' && s.text && s.text.guid) nb.add(s.text.guid); } catch (_e) {}
    const have = new Set(this.scene.elements.filter((e) => !e.isDeleted && e.type === 'record').map((e) => e.recordGuid));
    const add = [...nb].filter((g) => g && g !== guid && !have.has(g)).slice(0, 16);
    if (!add.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no new neighbours to pull in.', dismissible: true }); } catch (_e) {} return; }
    const cx = card.x + card.width / 2, cy = card.y + card.height / 2, R = 300, CW = 240, CH = 150;
    this.selected.clear();
    add.forEach((g, i) => {
      const a = (i / add.length) * Math.PI * 2 - Math.PI / 2, nx = this._snap(cx + Math.cos(a) * R - CW / 2), ny = this._snap(cy + Math.sin(a) * R - CH / 2);
      const el = makeRecordCard(nx, ny, CW, CH, g); this.scene.elements.push(el); this.selected.add(el.id);
      const ar = makeLinear(cx, cy, 'arrow', { stroke: '#9aa0a6', strokeWidth: 1.5 }); ar.points = [[cx, cy], [nx + CW / 2, ny + CH / 2]]; ar.startBinding = { elementId: card.id }; ar.endBinding = { elementId: el.id }; linearBBox(ar); this.scene.elements.push(ar);
    });
    this._updateBindings(); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Pulled in ' + add.length + ' neighbour(s).', dismissible: true }); } catch (_e) {}
  }
  // CS-6: milestone snapshots — save the current drawing state and restore an earlier one (replay its evolution).
  // Quota-safe: capped at 8 per drawing in localStorage, skipped if a scene is too large to store.
  _saveMilestone() {
    if (!this.rec || !this.rec.guid) return;
    try {
      const json = JSON.stringify({ elements: this.scene.elements, files: this.scene.files, appState: this.scene.appState });
      if (json.length > 600000) { try { this.plugin.ui.addToaster({ title: 'Plexus: drawing too large to snapshot.', dismissible: true }); } catch (_e) {} return; }
      const key = 'plexus_milestones_' + this.rec.guid; let hist = []; try { hist = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_e) {}
      hist.push({ at: Date.now(), scene: json }); while (hist.length > 8) hist.shift();
      localStorage.setItem(key, JSON.stringify(hist));
      try { this.plugin.ui.addToaster({ title: 'Milestone ' + hist.length + ' saved.', dismissible: true }); } catch (_e) {}
    } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: snapshot failed (storage quota).', dismissible: true }); } catch (_e) {} }
  }
  async _restoreMilestone() {
    if (!this.rec || !this.rec.guid) return;
    const key = 'plexus_milestones_' + this.rec.guid; let hist = []; try { hist = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_e) {}
    if (!hist.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no milestones saved for this drawing.', dismissible: true }); } catch (_e) {} return; }
    const labels = hist.map((h, i) => (i + 1) + ') ' + (h.at ? new Date(h.at).toLocaleString() : '?')).join('\n');
    const s = await this._promptText('Restore which milestone?\n' + labels + '\nEnter #:', String(hist.length));
    if (s == null) return;
    const i = Math.max(1, Math.min(hist.length, parseInt(s, 10) || hist.length)) - 1;
    try { const sc = JSON.parse(hist[i].scene); this.scene.elements = sc.elements || []; if (sc.files) this.scene.files = sc.files; if (sc.appState) this.scene.appState = Object.assign(this.scene.appState || {}, sc.appState); this.selected.clear(); this.dirty = true; this.scheduleSave(); try { this.plugin.ui.addToaster({ title: 'Restored milestone ' + (i + 1) + '.', dismissible: true }); } catch (_e) {} } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: restore failed.', dismissible: true }); } catch (_e) {} }
  }
  // CS-5: collection stencil stamp — CREATE a new typed record in a chosen collection and drop a live card bound
  // to it. Turns the canvas into a record factory ("stamp a Person / Sampling Site"). Obsidian stamps inert shapes.
  async _stampRecord() {
    const name = await this._promptText('Stamp a new record — collection:', (this.plugin._ontology && this.plugin._ontology.entityCollections && this.plugin._ontology.entityCollections[0]) || 'People');
    if (!name) return;
    const title = await this._promptText('Title for the new record:', 'Untitled');
    if (title == null) return;
    let col = null; try { const cols = await this.plugin.data.getAllCollections(); col = (cols || []).find((c) => c.getName && c.getName().toLowerCase() === name.trim().toLowerCase()); } catch (_e) {}
    if (!col) { try { this.plugin.ui.addToaster({ title: 'Plexus: no collection named “' + name + '”.', dismissible: true }); } catch (_e) {} return; }
    let guid = null; try { guid = col.createRecord(title.trim() || 'Untitled'); } catch (e) { console.error('[Plexus] stamp', e); }
    if (typeof guid !== 'string') { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the record.', dismissible: true }); } catch (_e) {} return; }
    this.plugin._lastRecordGuid = guid; this._insertRecordCard(guid);
    try { this.plugin.ui.addToaster({ title: 'Stamped a new ' + name + ' record.', dismissible: true }); } catch (_e) {}
  }
  // CS-10: datetime smart connector — label a selected arrow (bound to two record cards) with the day-delta between
  // their date props ("+3d"). A live mini-Gantt from typed dates — Excalidraw can't read typed record dates.
  async _recordDate(guid) {
    try { const rec = await this.plugin.data.getRecord(guid); if (!rec || !rec.prop) return null; for (const k of ['Scheduled', 'Date', 'Due', 'Due Date', 'Start', 'Deadline']) { const p = rec.prop(k); if (p && p.date) { const d = p.date(); if (d) return d; } } } catch (_e) {}
    return null;
  }
  async _datetimeConnectors() {
    const arrows = [...this.selected].map((id) => this._byId(id)).filter((e) => e && (e.type === 'arrow' || e.type === 'line'));
    if (!arrows.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: select an arrow bound to two record cards.', dismissible: true }); } catch (_e) {} return; }
    let done = 0;
    for (const ar of arrows) {
      const a = ar.startBinding && this._byId(ar.startBinding.elementId), b = ar.endBinding && this._byId(ar.endBinding.elementId);
      if (!a || !b || a.type !== 'record' || b.type !== 'record') continue;
      const da = await this._recordDate(a.recordGuid), db = await this._recordDate(b.recordGuid);
      if (!da || !db) continue;
      const days = Math.round((db.getTime() - da.getTime()) / 86400000);
      const p0 = ar.points[0], p1 = ar.points[ar.points.length - 1], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      const old = this.scene.elements.find((e) => !e.isDeleted && e.dtConnectorFor === ar.id && e.type === 'text'); if (old) old.isDeleted = true;
      const lbl = makeText(this._snap(mx - 16), this._snap(my - 22), { fontSize: 14, stroke: '#f59e0b' }); lbl.text = (days >= 0 ? '+' : '') + days + 'd'; lbl.dtConnectorFor = ar.id; measureText(lbl);
      this.scene.elements.push(lbl); done++;
    }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: done ? ('Labelled ' + done + ' connector(s) with their date delta.') : 'No arrows bound to two dated record cards.', dismissible: true }); } catch (_e) {}
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
    const r = 6 / z;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(el.x, el.y, el.width, el.height, r); else ctx.rect(el.x, el.y, el.width, el.height);
    if (el.collapsed) { ctx.save(); ctx.globalAlpha = (el.opacity == null ? 1 : el.opacity) * 0.18; ctx.fillStyle = (el.backgroundColor && el.backgroundColor !== 'transparent') ? el.backgroundColor : (PXC_DARK ? '#2a2e3a' : '#eef0f4'); ctx.fill(); ctx.restore(); } // collapsed → a solid title bar
    else if (el.backgroundColor && el.backgroundColor !== 'transparent') { ctx.save(); ctx.globalAlpha = (el.opacity == null ? 1 : el.opacity) * 0.12; ctx.fillStyle = el.backgroundColor; ctx.fill(); ctx.restore(); } // SECTION tint — low alpha so the contents inside stay readable
    ctx.strokeStyle = el.strokeColor || '#9aa0a6'; ctx.lineWidth = 1.4 / z; ctx.stroke();
    ctx.font = (12 / z) + 'px system-ui, sans-serif'; ctx.fillStyle = el.strokeColor || '#9aa0a6'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText((el.collapsed ? '▸ ' : '') + (el.name || 'Section'), el.x + 2 / z, el.y - 4 / z);
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
    // title bar (S10: dim the board link chrome — preview image stays full opacity)
    const _la = (this.plugin._settings && this.plugin._settings.linkOpacity != null ? this.plugin._settings.linkOpacity : 100) / 100, _ga = ctx.globalAlpha; ctx.globalAlpha = _ga * _la;
    ctx.fillStyle = 'rgba(16,185,129,0.16)'; ctx.fillRect(x, y, w, head);
    ctx.fillStyle = '#d1fae5'; ctx.font = '600 12px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('▦ ' + this._clipText(ctx, (b && b.title) || 'Drawing', w - 18), x + 8, y + head / 2);
    ctx.globalAlpha = _ga;
    ctx.restore(); ctx.restore();
  }
  _insertBoardCard(guid, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeBoardCard(this._snap(wx - 150), this._snap(wy - 110), 300, 220, guid);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // IO-1: task-node cache — fetches the backing line item's text + done status by (recordGuid, lineGuid).
  // Keeps the live PluginLineItem on the entry so the checkbox can toggle setTaskStatus. Invalidated on edit.
  _taskFor(el) {
    if (!this._taskCache) this._taskCache = new Map();
    const key = el.lineGuid; if (!key) return null;
    const c = this._taskCache.get(key); if (c) return c.ready ? c : null;
    const entry = { ready: false, text: '', done: false, li: null }; this._taskCache.set(key, entry);
    (async () => {
      try {
        const rec = await this.plugin.data.getRecord(el.recordGuid); if (!rec) { entry.text = '(record gone)'; entry.ready = true; this.dirty = true; return; }
        const items = await rec.getLineItems();
        const li = (items || []).find((x) => x.guid === key);
        if (!li) { entry.text = '(task gone)'; entry.ready = true; this.dirty = true; return; }
        entry.li = li; entry.text = lineTextOf(li);
        try { entry.done = (li.isTaskCompleted && li.isTaskCompleted() === true) || (li.getTaskStatus && li.getTaskStatus() === 'done'); } catch (_e) {}
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateTask(lineGuid) { if (this._taskCache && this._taskCache.has(lineGuid)) { this._taskCache.delete(lineGuid); this.dirty = true; } }
  // TRANSCLUDE: live line-card cache (text + children). Mirrors _taskFor's gone-guards; null-normalizes
  // getLineItems()/getChildren() (Go-nil / unresolved → []). Stores recordGuid so a child-line edit (which fires
  // with the parent's recordGuid, not this line's guid) invalidates the card via _invalidateLinesForRecord.
  _lineFor(el) {
    if (!this._lineCache) this._lineCache = new Map();
    const key = el.lineGuid; if (!key) return null;
    const c = this._lineCache.get(key); if (c) return c.ready ? c : null;
    const entry = { ready: false, text: '', children: [], title: '', recordGuid: el.recordGuid }; this._lineCache.set(key, entry);
    (async () => {
      try {
        const rec = await this.plugin.data.getRecord(el.recordGuid); if (!rec) { entry.text = '(record gone)'; entry.ready = true; this.dirty = true; return; }
        try { entry.title = (rec.getName && rec.getName()) || ''; } catch (_e) {}
        const items = (await rec.getLineItems()) || [];
        const li = items.find((x) => x.guid === key);
        if (!li) { entry.text = '(line gone)'; entry.ready = true; this.dirty = true; return; }
        entry.text = lineTextOf(li);
        entry.children = pxcOutlineRows(items, key, 12, false, false).map((r) => ({ text: r.text, depth: r.depth })); // descendants of this line, depth from parent_guid chain (direct child → 0)
        entry.ready = true; this.dirty = true;
      } catch (_e) { entry.ready = true; this.dirty = true; }
    })();
    return null;
  }
  _invalidateLine(lineGuid) { if (this._lineCache && this._lineCache.has(lineGuid)) { this._lineCache.delete(lineGuid); this.dirty = true; } }
  _invalidateLinesForRecord(g) { if (!this._lineCache) return; let ch = false; for (const [k, v] of this._lineCache) { if (v && v.recordGuid === g) { this._lineCache.delete(k); ch = true; } } if (ch) this.dirty = true; }
  // EDITABLE CARDS (request 1): double-click a record/line card BODY → inline-edit the body line items right on the
  // canvas; commit writes back to the SOURCE via PluginLineItem.setSegments / .delete / rec.createLineItem (the SDK has
  // no record-rename, so the TITLE stays read-only — its band opens the record instead). One line per textarea row.
  async _editCardBody(card) {
    if (this._cardEdit) { try { this._cardEdit.abort && this._cardEdit.abort(); } catch (_e) {} try { this._cardEdit.ta.remove(); } catch (_e) {} this._cardEdit = null; }
    if (this._ta) { try { this._ta.remove(); } catch (_e) {} this._ta = null; }
    const guid = card && card.recordGuid; if (!guid) return;
    let rec = null; try { rec = await getRecordPoll(this.plugin, guid); } catch (_e) {}
    if (!rec) { try { this.plugin.ui.addToaster({ title: 'Plexus: source record not found.', dismissible: true }); } catch (_e) {} return; }
    const isLine = card.type === 'linecard';
    let items = []; // [{li, depth}] — the body subtree in DFS order (so the editor shows + restructures the nesting)
    try {
      const all = (await rec.getLineItems()) || [];
      // depth from parent_guid chain (getChildren() returns [] on the flat getLineItems load). Record card → whole body;
      // line card → the main line at depth 0 + its descendants. includeBlank so the editor can show/restructure blank rows.
      const rows = isLine && card.lineGuid ? pxcOutlineRows(all, card.lineGuid, 60, true, true) : pxcOutlineRows(all, null, 60, true, false);
      items = rows.map((r) => ({ li: r.li, depth: r.depth }));
    } catch (_e) {}
    if (this.destroyed) return;
    const z = this.camera.zoom, s = this.camera.worldToScreen(card.x, card.y);
    const titleH = isLine ? 4 : 26; // record card: skip the read-only title band; linecard: edit from the top
    const STEP = 13, PAL = PXC_RAINBOW; // FLOW EDITOR: one DOM row per line, each with the depth-coloured marker dot + indent
    // guides (matching the rendered card's _drawOutlineRow) + editable text. Tab/Shift+Tab re-indent; Enter appends a sibling
    // row; commit reuses pxcWriteCardTree + the SAME data-safety guards. The box is built UNSCALED + transform:scale(z) for zoom.
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;z-index:25;box-sizing:border-box;border:2px solid #7c5cff;border-radius:6px;background:#fff;color:#1e1e1e;padding:5px 6px;font:12px system-ui,sans-serif;overflow:auto;outline:none;box-shadow:0 6px 22px rgba(0,0,0,.28);transform-origin:0 0';
    box.style.left = (s.x + 8 * z) + 'px'; box.style.top = (s.y + titleH * z) + 'px';
    box.style.width = Math.max(80, Math.abs(card.width) - 16) + 'px';
    box.style.maxHeight = Math.max(38, Math.abs(card.height) - titleH - 10) + 'px';
    box.style.transform = 'scale(' + z + ')';
    const gutterHTML = (depth) => { let h = ''; for (let L = 0; L < depth; L++) h += '<div style="position:absolute;top:0;bottom:0;left:' + (L * STEP + 3) + 'px;width:1px;background:' + PAL[L % PAL.length] + ';opacity:.45"></div>'; h += '<div style="position:absolute;top:6px;left:' + (depth * STEP + 2) + 'px;width:5px;height:5px;border-radius:50%;background:' + PAL[depth % PAL.length] + '"></div>'; return h; };
    const setDepth = (row, depth) => { row._depth = depth; row._gutter.style.flex = '0 0 ' + (depth * STEP + 14) + 'px'; row._gutter.innerHTML = gutterHTML(depth); };
    const rows = [];
    const makeRow = (text, depth) => {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:flex-start;min-height:18px';
      const gutter = document.createElement('div'); gutter.style.cssText = 'position:relative;align-self:stretch'; row._gutter = gutter;
      const txt = document.createElement('div'); txt.contentEditable = 'true'; txt.spellcheck = false; txt.textContent = text || ''; txt.style.cssText = 'flex:1 1 auto;outline:none;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.4;padding:0 1px;min-width:0'; row._txt = txt; // min-width:0 → text wraps (like the card) instead of overflowing a deeply-nested narrow row
      txt.addEventListener('focus', () => { box._lastRow = row; }); // track the active row so Escape/keys resolve even if document.activeElement lags
      txt.addEventListener('paste', (ev) => { ev.preventDefault(); const t = (((ev.clipboardData || window.clipboardData).getData('text')) || '').replace(/\s*\n\s*/g, ' '); try { document.execCommand('insertText', false, t); } catch (_e2) {} }); // paste as plain text (no embedded newlines/HTML)
      row.appendChild(gutter); row.appendChild(txt); setDepth(row, depth); return row;
    };
    for (const it of items) { const r = makeRow(lineTextOf(it.li) || '', it.depth); rows.push(r); box.appendChild(r); }
    this.wrap.appendChild(box);
    const curRow = () => { const a = document.activeElement; for (const r of rows) if (r._txt === a || r.contains(a)) return r; return null; };
    setTimeout(() => { try { rows[0] && rows[0]._txt.focus(); } catch (_e) {} }, 0);
    let done = false; this._cardEdit = { ta: box, card, abort: () => { done = true; } }; // `ta` = the editor element (destroy() removes it)
    const commit = async () => {
      if (done) return;
      const body = rows.map((r) => (r._txt.textContent || '').replace(/\s*\n\s*/g, ' '));
      const parsed = body.map((text, i) => ({ depth: rows[i]._depth, text })); // UNTRIMMED (= body) so the structural guards + pxcWriteCardTree compare exactly against lineTextOf — a source line with trailing whitespace must not read as "changed" (it would falsely refuse an append)
      if (isLine && parsed.length) parsed[0].depth = 0; // the linecard's main line is the depth-0 anchor
      // SAFE write-back (UNCHANGED contract): allow TEXT edits, RE-NESTING (Tab/Shift+Tab), and APPENDS — keyed by the
      // row→line positional map. Refuse a count DECREASE (deletion) or a count GROW whose existing prefix changed (mid-insert/
      // reorder) → open the record. No blind delete; rich lines are never setSegments-flattened (guarded in pxcWriteCardTree).
      const origTexts = items.map((n) => lineTextOf(n.li) || '');
      const prefixTextMatches = () => { for (let i = 0; i < items.length; i++) if (parsed[i].text !== origTexts[i]) return false; return true; };
      // INVARIANT (data-safety audit): this text-collision reorder check is sufficient ONLY because the editor has NO row-move
      // affordance (Enter appends, Tab indents, Backspace outdents — you cannot drag a row up/down). If a future version adds
      // drag-to-reorder of distinct-text rows, replace this with a positional/multiset-equality check or the guard can miss it.
      const isReorder = () => { if (parsed.length !== items.length) return false; const orig = Object.create(null); for (const t of origTexts) if (t) orig[t] = true; for (let i = 0; i < items.length; i++) { const t = parsed[i].text; if (t && t !== origTexts[i] && orig[t]) return true; } return false; };
      if (parsed.length < items.length || (parsed.length > items.length && !prefixTextMatches()) || isReorder()) {
        // NON-DESTRUCTIVE refuse: KEEP the box + the user's edits (don't set `done`, don't remove) so a mid-insert/reorder/
        // delete never silently discards a whole edit session. They can fix the structure, open the record, or Esc to discard.
        try { this.plugin.ui.addToaster({ title: 'To insert between lines, reorder, or delete, open the record (double-click the title). Your edits are still here — text changes, indenting (Tab), and adding lines at the end save here; Esc discards.', dismissible: true }); } catch (_e) {} return;
      }
      done = true; try { box.remove(); } catch (_e) {} this._cardEdit = null; // committing for real now
      let res = { writes: 0, fails: 0, richSkipped: 0 }; try { res = await pxcWriteCardTree(rec, items, parsed, body, isLine); } catch (_e) {}
      if (this.destroyed) return;
      if (res.writes) { if (isLine) { this._invalidateLine(card.lineGuid); this._invalidateLinesForRecord(guid); } this._invalidateRec(guid); this.dirty = true; }
      // HONEST toaster (writes are independent + non-transactional): report saved, failed, and rich-skipped lines truthfully
      let msg = '';
      if (res.writes) msg = 'Saved ' + res.writes + ' change' + (res.writes > 1 ? 's' : '');
      if (res.fails) msg = (msg ? msg + '; ' : '') + res.fails + ' couldn’t be written (see console) — open the record to retry';
      if (res.richSkipped) msg = (msg ? msg + '. ' : '') + res.richSkipped + ' line' + (res.richSkipped > 1 ? 's' : '') + ' with links/dates/formatting left unchanged — edit ' + (res.richSkipped > 1 ? 'those' : 'that') + ' in the record';
      if (msg) { try { this.plugin.ui.addToaster({ title: 'Plexus: ' + msg + '.', dismissible: true }); } catch (_e) {} }
    };
    box.addEventListener('focusout', (ev) => { if (box.contains(ev.relatedTarget) || !document.hasFocus()) return; commit(); }); // commit when focus genuinely leaves the editor; NOT on an app/tab switch (hasFocus) and NOT when clicking another row inside
    const firstLeaf = (n) => { while (n && n.firstChild) n = n.firstChild; return n; };
    const caretOffset = (txt) => { try { const sel = window.getSelection(); if (!sel || !sel.rangeCount) return (txt.textContent || '').length; const pre = document.createRange(); pre.selectNodeContents(txt); pre.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset); return pre.toString().length; } catch (_e) { return (txt.textContent || '').length; } };
    box.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // the canvas host swallows keys otherwise
      if (ev.key === 'Escape') { ev.preventDefault(); done = true; try { box.remove(); } catch (_e) {} this._cardEdit = null; return; } // Escape never depends on resolving the active row
      const row = curRow() || box._lastRow; if (!row) return;
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); commit(); return; }
      if (ev.key === 'Enter') { // split the line at the caret, carry the tail into a new sibling row at the same depth (appending at the END commits; a mid-list split refuses non-destructively on commit)
        ev.preventDefault(); const full = row._txt.textContent || '', off = caretOffset(row._txt); row._txt.textContent = full.slice(0, off);
        const nr = makeRow(full.slice(off), row._depth); const idx = rows.indexOf(row); rows.splice(idx + 1, 0, nr); row.after(nr);
        try { nr._txt.focus(); const sel2 = window.getSelection(); const r2 = document.createRange(); r2.setStart(nr._txt, 0); r2.collapse(true); sel2.removeAllRanges(); sel2.addRange(r2); } catch (_e) {} return;
      }
      if (ev.key === 'Tab') { ev.preventDefault(); const idx = rows.indexOf(row); const prevD = idx > 0 ? rows[idx - 1]._depth : -1; const cap = (isLine && idx === 0) ? 0 : prevD + 1; if (ev.shiftKey) { if (row._depth > 0) setDepth(row, row._depth - 1); } else if (row._depth < cap) setDepth(row, row._depth + 1); try { row._txt.focus(); } catch (_e) {} return; } // re-indent, clamp to prev depth + 1 (linecard main line stays 0)
      if (ev.key === 'Backspace') { const sel = window.getSelection(); const rg = sel && sel.rangeCount ? sel.getRangeAt(0) : null; const atStart = rg && rg.collapsed && rg.startOffset === 0 && (rg.startContainer === row._txt || rg.startContainer === firstLeaf(row._txt)); if (atStart && row._depth > 0) { ev.preventDefault(); setDepth(row, row._depth - 1); try { row._txt.focus(); } catch (_e) {} } } // at line start → outdent (deletion needs the record, per the commit contract)
    });
  }
  _drawLineCard(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    const dark = PXC_DARK, accent = el.strokeColor || '#0ea5e9'; // dark-mode-aware surface/ink + a live-transclusion glow
    const glowOn = !(this.plugin._settings && this.plugin._settings.cardGlow === false), titleCol = dark ? '#e6e7ea' : '#1e1e1e', bodyCol = dark ? '#9aa3ad' : '#5f6368', dimCol = dark ? '#8b9096' : '#9aa0a6';
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = (el.backgroundColor && el.backgroundColor.toLowerCase() !== '#ffffff') ? el.backgroundColor : (dark ? (this._cardSurface || '#1b1d24') : '#ffffff'); // B1: the DEFAULT surface follows the live theme (matches the whiteboard's card colour, dark or light); an explicitly-chosen non-white bg is still respected; export forces light → white
    if (glowOn) { ctx.shadowColor = accent; ctx.shadowBlur = 12 * this.camera.zoom * this.dpr; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; } else ctx.fill(); // GLOW: accent halo via the fill's shadow (static — no per-frame anim)
    ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = accent; ctx.stroke();
    ctx.save(); ctx.clip();
    const data = this._lineFor(el); const pad = 10, tx = x + pad + 4, maxW = w - pad * 2 - 4; let ty = y + pad;
    ctx.fillStyle = accent; ctx.fillRect(x, y, 4, h); // cyan accent stripe (a transcluded LINE)
    ctx.textBaseline = 'top';
    if (!data) { ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = dimCol; ctx.fillText('Loading…', tx, ty); ctx.restore(); ctx.restore(); return; }
    if (data.title) { ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = dimCol; ctx.fillText(this._clipText(ctx, '↳ ' + data.title, maxW), tx, ty); ty += 16; }
    ctx.font = '600 14px system-ui, sans-serif'; ctx.fillStyle = titleCol; ctx.fillText(this._clipText(ctx, data.text || '(empty line)', maxW), tx, ty); ty += 22;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = bodyCol;
    for (const ln of data.children) { if (ty > y + h - 14) break; ty += this._drawOutlineRow(ctx, ln.text, ln.depth || 0, tx, ty, bodyCol, maxW); } // TRANSCLUSION: record-style rainbow marker + indent guide per row, wraps long lines (Indent-Rainbow parity)
    ctx.restore(); ctx.restore();
  }
  async _toggleTaskNode(el) {
    const t = this._taskFor(el); if (!t || !t.li) return; // not loaded yet — ignore the click
    const next = t.done ? 'none' : 'done';
    try { await t.li.setTaskStatus(next); } catch (e) { console.error('[Plexus] setTaskStatus', e); return; }
    this._invalidateTask(el.lineGuid);
  }
  // The checkbox hit-region (world coords) at the task card's left.
  _taskCheckboxRect(el) { const s = 18, m = (el.height - s) / 2; return { x: el.x + 8, y: el.y + m, w: s, h: s }; }
  _drawTaskNode(ctx, el) {
    ctx.save(); ctx.globalAlpha = el.opacity == null ? 1 : el.opacity;
    if (el.angle) { const cx = el.x + el.width / 2, cy = el.y + el.height / 2; ctx.translate(cx, cy); ctx.rotate(el.angle); ctx.translate(-cx, -cy); }
    const x = el.x, y = el.y, w = el.width, h = el.height, rad = Math.min(8, Math.abs(w) / 2, Math.abs(h) / 2);
    const t = this._taskFor(el); const done = !!(t && t.done);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad); else ctx.rect(x, y, w, h);
    ctx.fillStyle = el.backgroundColor || '#ffffff'; ctx.fill();
    ctx.lineWidth = el.strokeWidth || 1.5; ctx.strokeStyle = el.strokeColor || '#f59e0b'; ctx.stroke();
    // checkbox
    const cb = this._taskCheckboxRect(el);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cb.x, cb.y, cb.w, cb.h, 4); else ctx.rect(cb.x, cb.y, cb.w, cb.h);
    ctx.lineWidth = 1.6; ctx.strokeStyle = done ? '#10b981' : '#9aa0a6'; ctx.stroke();
    if (done) { ctx.fillStyle = '#10b981'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cb.x + 4, cb.y + 9); ctx.lineTo(cb.x + 7.5, cb.y + 13); ctx.lineTo(cb.x + 14, cb.y + 5); ctx.stroke(); }
    // text
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const tx = cb.x + cb.w + 8, maxW = w - (tx - x) - 8;
    ctx.textBaseline = 'middle'; ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = done ? '#9aa0a6' : '#1e1e1e';
    const label = t ? (t.text || '(empty task)') : 'Loading…';
    const clipped = this._clipText(ctx, label, maxW);
    ctx.fillText(clipped, tx, y + h / 2);
    if (done) { const tw = ctx.measureText(clipped).width; ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx, y + h / 2); ctx.lineTo(Math.min(tx + tw, x + w - 8), y + h / 2); ctx.stroke(); }
    ctx.restore(); ctx.restore();
  }
  _insertTaskNode(lineGuid, recordGuid, wx, wy) {
    if (wx == null) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); wx = c.x; wy = c.y; }
    const el = makeTaskNode(this._snap(wx - 120), this._snap(wy - 26), 248, 52, lineGuid, recordGuid);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id);
    this.dirty = true; this.scheduleSave(); return el;
  }
  // IO-1: create a real `task` line item (on the drawing's own record, or a chosen record) + drop a bound node.
  async _addTaskNode(wx, wy) {
    const text = await this._promptText('Task:', '');
    if (text == null || !text.trim()) return;
    const recGuid = this._recordGuidForTasks();
    if (!recGuid) { try { this.plugin.ui.addToaster({ title: 'Plexus: no record to attach the task to.', dismissible: true }); } catch (_e) {} return; }
    try {
      const rec = await this.plugin.data.getRecord(recGuid); if (!rec) return;
      let li = null; for (let i = 0; i < 5 && !li; i++) { try { li = await rec.createLineItem(null, null, 'task', [{ type: 'text', text: text.trim() }], null); } catch (_e) {} if (!li) await sleep(150); }
      if (!li) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not create the task line item.', dismissible: true }); } catch (_e) {} return; }
      this._insertTaskNode(li.guid, recGuid, wx, wy);
    } catch (e) { console.error('[Plexus] addTaskNode', e); }
  }
  // The record a new task attaches to: the drawing's own record (so tasks on the daily whiteboard land on the day).
  _recordGuidForTasks() { return this.rec && this.rec.guid ? this.rec.guid : (this.plugin._lastRecordGuid || null); }
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
    if (rec) { try { await this._reanchorAssets(rec, scene); } catch (_e) {} await saveScene(this.plugin, rec, scene, new Camera(), { _sceneLine: null }); } // SCALE data-safety: re-anchor shared image blobs to the NEW record so they survive if the source is later deleted
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
  // CP-3 (v3a): build a mind map from a NOTE's headings — H1/H2/H3 become nested child nodes, each remembering its
  // source line (mmSourceLine) for a jump-back. The root references the note. This is Nicole's md-import workflow.
  async _mmFromNote(guid) {
    if (!guid) { try { this.plugin.ui.addToaster({ title: 'Plexus: open or click a note first, then build a mind map from it.', dismissible: true }); } catch (_e) {} return null; }
    let rec = null; try { rec = await this.plugin.data.getRecord(guid); } catch (_e) {}
    if (!rec) return null;
    let items = null; try { items = await rec.getLineItems(); } catch (_e) {}
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const root = this._mmMakeNode((rec.getName && rec.getName()) || 'Note', this._snap(c.x), this._snap(c.y), null, null);
    root.mmRoot = root.id; root.refGuid = guid; root.isRef = true; this.scene.elements.push(root);
    const lastAtLevel = { 0: root }; let made = 0;
    for (const li of (items || [])) {
      let hs = 0; try { hs = (li.getHeadingSize && li.getHeadingSize()) || 0; } catch (_e) {}
      if (!hs) continue; // only headings become nodes
      const text = lineTextOf(li) || '(heading)';
      let parent = root; for (let lvl = hs - 1; lvl >= 0; lvl--) { if (lastAtLevel[lvl]) { parent = lastAtLevel[lvl]; break; } }
      const node = this._mmMakeNode(text, parent.x + 200, parent.y, root.id, parent.id);
      node.mmSourceLine = li.guid; this.scene.elements.push(node);
      const edge = makeLinear(parent.x, parent.y, 'arrow', { stroke: '#9aa0a6', strokeWidth: 1.5 }); edge.mmRoot = root.id; edge.mmEdge = { from: parent.id, to: node.id }; this.scene.elements.push(edge);
      lastAtLevel[hs] = node; for (let lvl = hs + 1; lvl <= 6; lvl++) delete lastAtLevel[lvl]; made++;
    }
    this._mmLayout(root.id); this.selected.clear(); this.selected.add(root.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: made ? ('Mind map: ' + made + ' nodes from headings.') : 'Note has no headings — added a central node.', dismissible: true }); } catch (_e) {}
    return root.id;
  }
  // CP-3 v3c: the subtree under a node (node + descendants), branch copy/cut/paste, boundary box, spatial nav.
  _mmSubtree(rootNode) {
    const all = this._mmNodes(rootNode.mmRoot), out = []; const visit = (id) => { const n = all.find((e) => e.id === id); if (!n) return; out.push(n); for (const k of all.filter((e) => e.mmParent === id)) visit(k.id); }; visit(rootNode.id); return out;
  }
  _mmCopyBranch(node) {
    const sub = this._mmSubtree(node); const ids = new Set(sub.map((n) => n.id));
    this._mmClip = sub.map((n) => ({ id: n.id, text: n.text, dx: n.x - node.x, dy: n.y - node.y, parent: (n.mmParent && ids.has(n.mmParent)) ? n.mmParent : null }));
    try { this.plugin.ui.addToaster({ title: 'Branch copied (' + sub.length + ' node' + (sub.length === 1 ? '' : 's') + ').', dismissible: true }); } catch (_e) {}
  }
  _mmCutBranch(node) {
    if (node.id === node.mmRoot) { try { this.plugin.ui.addToaster({ title: 'Plexus: can’t cut the central node.', dismissible: true }); } catch (_e) {} return; }
    this._mmCopyBranch(node); const sub = new Set(this._mmSubtree(node).map((n) => n.id));
    for (const e of this.scene.elements) { if (e.isDeleted) continue; if (sub.has(e.id)) e.isDeleted = true; if (e.mmEdge && (sub.has(e.mmEdge.from) || sub.has(e.mmEdge.to))) e.isDeleted = true; }
    this._mmLayout(node.mmRoot); this.selected.clear(); this.dirty = true; this.scheduleSave();
  }
  _mmPasteBranch(target) {
    if (!this._mmClip || !this._mmClip.length || !target || !target.mmRoot) { try { this.plugin.ui.addToaster({ title: 'Plexus: copy a branch first (Alt+C).', dismissible: true }); } catch (_e) {} return; }
    const idMap = {};
    for (const c of this._mmClip) { const el = this._mmMakeNode(c.text, target.x + 200 + c.dx, target.y + c.dy, target.mmRoot, null); idMap[c.id] = el; this.scene.elements.push(el); }
    for (const c of this._mmClip) { const el = idMap[c.id]; const par = c.parent ? idMap[c.parent] : target; el.mmParent = par.id; const edge = makeLinear(par.x, par.y, 'arrow', { stroke: '#9aa0a6', strokeWidth: 1.5 }); edge.mmRoot = target.mmRoot; edge.mmEdge = { from: par.id, to: el.id }; this.scene.elements.push(edge); }
    this._mmLayout(target.mmRoot); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Branch pasted.', dismissible: true }); } catch (_e) {}
  }
  _mmToggleBoundary(node) {
    const existing = this.scene.elements.find((e) => !e.isDeleted && e.mmBoundaryFor === node.id);
    if (existing) { existing.isDeleted = true; this.dirty = true; this.scheduleSave(); return; }
    const sub = this._mmSubtree(node).filter((n) => !n.mmHidden); if (!sub.length) return;
    const minx = Math.min(...sub.map((n) => n.x)) - 14, miny = Math.min(...sub.map((n) => n.y)) - 14, maxx = Math.max(...sub.map((n) => n.x + n.width)) + 14, maxy = Math.max(...sub.map((n) => n.y + n.height)) + 14;
    const rect = makeRect(minx, miny, maxx - minx, maxy - miny, { type: 'rectangle', stroke: '#7c5cff', fill: 'transparent', fillStyle: 'solid' }); rect.roughness = 0; rect.mmBoundaryFor = node.id; rect.mmRoot = node.mmRoot;
    this.scene.elements.unshift(rect); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Boundary added (Alt+B to remove).', dismissible: true }); } catch (_e) {}
  }
  _mmNav(node, dir) {
    const all = this._mmNodes(node.mmRoot).filter((n) => !n.mmHidden && n.id !== node.id); const cx = node.x + node.width / 2, cy = node.y + node.height / 2;
    let best = null, bestD = Infinity;
    for (const n of all) { const dx = (n.x + n.width / 2) - cx, dy = (n.y + n.height / 2) - cy; const ok = dir === 'left' ? dx < -10 : dir === 'right' ? dx > 10 : dir === 'up' ? dy < -10 : dy > 10; if (!ok) continue; const d = Math.hypot(dx, dy); if (d < bestD) { bestD = d; best = n; } }
    if (best) { this.selected.clear(); this.selected.add(best.id); this.dirty = true; }
  }
  // CP-3 (v3a): fold/unfold a node — hides/shows its whole subtree (and connecting edges) and re-lays out.
  _mmToggleFold(node) {
    if (!node || !node.mmRoot) return;
    node.mmFolded = !node.mmFolded;
    this._mmLayout(node.mmRoot); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: node.mmFolded ? 'Branch folded.' : 'Branch unfolded.', dismissible: true }); } catch (_e) {}
  }
  // P1.6 (v1): insert an @@ REFERENCE NODE — a clickable text chip linked to a record (double-click opens it).
  // A1: stamp ref props onto an existing text element (record OR line). Shared by the command, the inline @@ picker,
  // and AI flows. `refGuid` = record guid (record kind) OR the PARENT record (line kind, so nav has a fallback).
  _configureRef(el, opts) {
    const kind = opts.kind === 'line' ? 'line' : (opts.kind === 'image' ? 'image' : 'record'); // IMG-REF: image target opens a lightbox
    el.isRef = true; el.refKind = kind;
    el.refGuid = opts.guid || el.refGuid || null;                                  // image: the PARENT record guid (to resolve the line)
    if (kind === 'line' || kind === 'image') el.refLineGuid = opts.lineGuid || el.refLineGuid || null; else delete el.refLineGuid; // image: the attachment line guid
    el.refLabel = opts.label || el.refLabel || 'record';
    if (opts.alias != null && String(opts.alias).trim()) el.refAlias = String(opts.alias).trim();
    const pfx = kind === 'line' ? '@@' : (kind === 'image' ? '▣ ' : '@');
    el.text = pfx + (el.refAlias || el.refLabel || 'ref');
    el.strokeColor = kind === 'line' ? '#0ea5e9' : (kind === 'image' ? '#a855f7' : '#7c5cff'); // line cyan, record purple, image violet
    measureText(el);
    return el;
  }
  _makeRefElement(opts, x, y) { const el = makeText(this._snap(x), this._snap(y), { fontSize: 16, stroke: '#7c5cff' }); return this._configureRef(el, opts); }
  // FLYBACK: index a whole-element ref chip under the guid it POINTS AT for an IMMEDIATE note-side ↗ badge — LINE
  // refs key by refLineGuid (badged on `.listitem`), RECORD refs key by refGuid (badged on the `.listview-items`
  // record page). Inline-run refs + deletions are reconciled by the authoritative rebuild-on-save pass below.
  _indexBackref(el) {
    if (!el || !el.isRef) return;
    try {
      if (el.refKind === 'line' && el.refLineGuid) this.plugin._registerBackref(el.refLineGuid, { drawing: this.recordGuid, el: el.id, label: el.refAlias || el.refLabel || 'ref', kind: 'line' });
      else if (el.refKind === 'record' && el.refGuid) this.plugin._registerBackref(el.refGuid, { drawing: this.recordGuid, el: el.id, label: el.refAlias || el.refLabel || 'ref', kind: 'record' });
    } catch (_e) {}
  }
  // FLYBACK: rebuild THIS drawing's backref sub-map from the scene's CURRENT refs — whole-element chips AND inline
  // `@@`/`@` runs; line targets keyed by lineGuid, record targets keyed by record guid. Self-healing: edited-away or
  // deleted refs vanish on the next save. Image refs are skipped (the xref / `_scanImageBadges` path owns those).
  _reindexBackrefs() {
    const map = {}; // { targetGuid: { elId: {label, kind, from?, dir?, img?} } } — ALL refs to a target (multi-ref picker); dedup by elId
    const put = (guid, elId, label, kind, extra) => { if (!guid || !elId) return; const m = (map[guid] = map[guid] || {}); if (m[elId]) return; m[elId] = { label: label || 'ref', kind }; if (extra) { if (extra.from) m[elId].from = extra.from; if (extra.dir) m[elId].dir = extra.dir; if (extra.img) m[elId].img = extra.img; } }; // F1/F3: a connection also carries the OTHER endpoint's name (from), arrow direction (dir), and image-region ref (img)
    const els = (this.scene && this.scene.elements) || [];
    // PASS 1: id→element + connector→label-text maps (one scan), for the connection-backref pass below.
    const byId = new Map(), labelByConn = new Map();
    for (const el of els) { if (!el || el.isDeleted) continue; byId.set(el.id, el); if (el.type === 'text' && el.midBinding && el.midBinding.arrowId) { const t = (el.text || '').trim(); if (t) labelByConn.set(el.midBinding.arrowId, t); } }
    // F1/F3: describe a connection's OTHER endpoint for the note-side breadcrumb — a card title / line snippet / text / shape / image (+ its region ref for a thumbnail). Names clipped; safe on missing cache.
    const clip = (s) => { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); return s.length > 40 ? s.slice(0, 39) + '…' : s; };
    const descEnd = (b) => {
      if (!b) return null;
      if (b.group) { let n = 0, img = null; for (const id of (b.group.ids || [])) { const ge = byId.get(id); if (ge && !ge.isDeleted) { n++; if (!img && ge.type === 'image' && ge.fileId) img = { fileId: ge.fileId, frac: null }; } } for (const rg of (b.group.regions || [])) { if (rg.worldPoly) { n++; continue; } const ge = byId.get(rg.elId); if (ge && !ge.isDeleted) { n++; if (ge.fileId) img = { fileId: ge.fileId, frac: rg.frac || null }; } } const single = !(b.group.ids || []).length && (b.group.regions || []).length === 1; return { name: single ? 'region' : 'group of ' + n, img }; } // round-5 B/D: "group of N" (members + image + free regions) + a thumbnail (an image region gives a cropped one)
      if (!b.elementId) return null; const e = byId.get(b.elementId); if (!e) return null;
      const rc = this._recCache;
      if (e.type === 'record') { const rec = rc && rc.get(e.recordGuid); if (b.lineGuid && rec && rec.lines) { const ln = rec.lines.find((l) => l.lineGuid === b.lineGuid); return { name: clip((ln && ln.text)) || 'line' }; } return { name: clip(rec && rec.title) || 'note' }; }
      if (e.type === 'linecard') { const rec = rc && rc.get(e.recordGuid); return { name: clip(rec && rec.title) || 'line' }; }
      if (e.type === 'text') { if (b.refGuidTarget && e.runs) { const rr = e.runs.find((r) => r && r.t === 'ref' && (r.guid === b.refGuidTarget || r.lineGuid === b.refGuidTarget)); if (rr) return { name: clip(rr.alias || rr.label) || 'ref' }; } return { name: clip(e.text || (e.runs && e.runs.length ? flattenRuns(e.runs) : '')) || 'text' }; } // round-5 A: a ref-targeted text endpoint reads as the ref's name
      if (e.type === 'image') return { name: 'image', img: { fileId: e.fileId, frac: b.frac || null, fracPoly: b.fracPoly || null } };
      return { name: clip(e.type) || 'shape' };
    };
    for (const el of els) {
      if (!el || el.isDeleted) continue;
      if (el.isRef) {
        if (el.refKind === 'line' && el.refLineGuid) put(el.refLineGuid, el.id, el.refAlias || el.refLabel, 'line');
        else if (el.refKind === 'record' && el.refGuid) put(el.refGuid, el.id, el.refAlias || el.refLabel, 'record');
      }
      if (el.runs && el.runs.length) for (const r of el.runs) {
        if (!r || r.t !== 'ref') continue;
        if (r.kind === 'line' && r.lineGuid) put(r.lineGuid, el.id, r.alias || r.label, 'line');
        else if (r.kind === 'record' && r.guid) put(r.guid, el.id, r.alias || r.label, 'record');
      }
      // CONNECTIONS (Phase 3): an arrow/line BOUND to a record/line card → a backref keyed by the transcluded record/line
      // guid (label = the connector's midpoint label). Opening that record/line then shows the ↗ flag + flyback to the
      // connection (via the existing _scanRefBadges/_openBackrefPicker/_flashAnchor). Both endpoints register (bidirectional).
      if (el.type === 'arrow' || el.type === 'line') {
        // Connection display name = "what the connection says": the midpoint label if there is one, ELSE the text of a
        // bound text endpoint (the user connected a "Test" text box straight to the card → the note side should still read
        // "connection: Test"). Either way the note side reads "connection: <name>"; bare "connection" only when truly unnamed.
        let connName = labelByConn.get(el.id) || '';
        if (!connName) for (const b of [el.startBinding, el.endBinding]) {
          if (!b || !b.elementId) continue; const e = byId.get(b.elementId);
          if (e && e.type === 'text' && !e.midBinding) { const tx = (e.text || (e.runs && e.runs.length ? flattenRuns(e.runs) : '') || '').replace(/\s+/g, ' ').trim(); if (tx) { connName = tx.length > 40 ? tx.slice(0, 39) + '…' : tx; break; } }
        }
        const lbl = connName ? ('connection: ' + connName) : 'connection';
        for (const b of [el.startBinding, el.endBinding]) {
          if (!b) continue;
          // F1/F3: the OTHER endpoint (source/context) + the arrow direction relative to THIS note, for the dialog breadcrumb.
          // Hoisted ABOVE the elementId guard so a GROUP binding (no elementId) also carries the breadcrumb (round-5 B).
          const ob = (b === el.startBinding) ? el.endBinding : el.startBinding, other = descEnd(ob), isStart = (b === el.startBinding);
          const headHere = isStart ? el.startArrowhead : el.endArrowhead, headThere = isStart ? el.endArrowhead : el.startArrowhead;
          const dir = (headHere && headThere) ? 'both' : headHere ? 'in' : headThere ? 'out' : 'none'; // 'in' = arrow points AT this note (from → here); 'out' = away; 'both' = ↔; 'none' = plain line
          const extra = { from: other && other.name, dir, img: other && other.img };
          if (b.group && b.group.ids) { for (const mid of b.group.ids) { const me = byId.get(mid); if (!me || me.isDeleted) continue; if (me.type === 'record' && me.recordGuid) put(me.recordGuid, el.id, lbl, 'record', extra); else if (me.type === 'linecard' && me.lineGuid) put(me.lineGuid, el.id, lbl, 'line', extra); } continue; } // round-5 B: record/line MEMBERS of a group target get the ↗ (a group of plain images/shapes keys nothing — canvas-only)
          if (!b.elementId) continue; const t = byId.get(b.elementId); if (!t) continue;
          if (t.type === 'record' && t.recordGuid) { if (b.lineGuid) put(b.lineGuid, el.id, lbl, 'line', extra); else put(t.recordGuid, el.id, lbl, 'record', extra); } // Phase 4: bound to a SPECIFIC body line → key the backref by lineGuid so the note's SOURCE LINE gets the ↗ (not the whole record)
          else if (t.type === 'linecard' && t.lineGuid) put(t.lineGuid, el.id, lbl, 'line', extra);
          else if (t.type === 'text' && b.refGuidTarget) put(b.refGuidTarget, el.id, lbl, b.refKindTarget || 'record', extra); // round-5 A: bound to a SPECIFIC inline ref → key the backref by that ref's target record/line (the LINKED record gets the ↗)
        }
      }
    }
    try { this.plugin._setDrawingBackrefs(this.recordGuid, map); } catch (_e) {}
  }
  // A4: open a line ref → jump to the exact LINE (Nav-plugin pulse); fall back to a fresh panel, then the parent record.
  async _openRefLine(el) {
    const lg = el.refLineGuid; if (!lg) { if (el.refGuid) this._openCard({ refGuid: el.refGuid }); return; }
    const here = this.panel || (this.plugin.ui.getActivePanel && this.plugin.ui.getActivePanel());
    if (here) { try { const ok = await here.navigateTo({ itemGuid: lg, highlight: true }); if (ok) return; } catch (_e) {} }
    let panel = null; try { panel = await this.plugin.ui.createPanel({ afterPanel: this.panel }); } catch (_e) {}
    if (panel) { try { const ok = await panel.navigateTo({ itemGuid: lg, highlight: true }); if (ok) return; } catch (_e) {} }
    if (el.refGuid) { this._openRecord(el.refGuid); return; } // line gone → open its parent record
    try { this.plugin.ui.addToaster({ title: 'Plexus: the referenced line could not be found.', dismissible: true }); } catch (_e) {}
  }
  async _insertRef() {
    const q = await this._promptText('Reference a record — search:', '');
    if (!q) return null;
    let rec = null; try { const res = await this.plugin.data.searchByQuery(q, 6); rec = res && res.records && res.records[0]; } catch (_e) {}
    if (!rec) { try { this.plugin.ui.addToaster({ title: 'Plexus: no record matched “' + q + '”.', dismissible: true }); } catch (_e) {} return null; }
    const name = (rec.getName && rec.getName()) || 'record';
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const el = this._makeRefElement({ kind: 'record', guid: rec.guid, label: name }, c.x, c.y);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this._indexBackref(el); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Reference inserted — double-click to open ' + name + '.', dismissible: true }); } catch (_e) {}
    return el.id;
  }
  // P2: Boolean ops on shapes (polybool, lazy-loaded). op = 'union' | 'difference' | 'intersect'.
  async _boolean(op) {
    const sel = [...this.selected].map((id) => this._byId(id)).filter((e) => e && isRoughShape(e.type));
    if (sel.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: select 2+ shapes (rect/ellipse/diamond).', dismissible: true }); } catch (_e) {} return; }
    let pb; try { const m = await loadLib(LIB.polybool); pb = m.default || m; } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not load the boolean lib.', dismissible: true }); } catch (_e) {} return; }
    const poly = (el) => ({ regions: [shapePolygon(el)], inverted: false });
    let acc = poly(sel[0]);
    try { for (let i = 1; i < sel.length; i++) { const p = poly(sel[i]); acc = op === 'union' ? pb.union(acc, p) : op === 'difference' ? pb.difference(acc, p) : pb.intersect(acc, p); } }
    catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: boolean failed.', dismissible: true }); } catch (_e) {} return; }
    const region = acc.regions && acc.regions[0];
    if (!region || region.length < 3) { try { this.plugin.ui.addToaster({ title: 'Plexus: empty result.', dismissible: true }); } catch (_e) {} return; }
    const fd = makeFreedraw(region[0][0], region[0][1], { stroke: sel[0].strokeColor, strokeWidth: 2 });
    fd.points = region.concat([region[0]]); freedrawBBox(fd);
    for (const e of sel) e.isDeleted = true;
    this.scene.elements.push(fd); this.selected.clear(); this.selected.add(fd.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Boolean ' + op + ' → 1 shape.', dismissible: true }); } catch (_e) {}
  }
  // P2: Mermaid diagram (mermaid.js, lazy) → SVG → rasterized image element.
  async _insertMermaid() {
    const code = await this._promptText('Mermaid code:', 'graph LR\n  A[Ingest] --> B[Transform] --> C[Store]');
    if (!code) return;
    await this._renderMermaidCode(code);
  }
  // Render Mermaid CODE → SVG → PNG element (shared by _insertMermaid and the AI Mermaid command).
  async _renderMermaidCode(code) {
    try { this.plugin.ui.addToaster({ title: 'Plexus: rendering Mermaid…', dismissible: true }); } catch (_e) {}
    let svg = null;
    try { const m = await loadLib(LIB.mermaid); const mermaid = m.default || m; if (!this.plugin._mmdInit) { mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' }); this.plugin._mmdInit = true; } const r = await mermaid.render('pxcmmd' + Date.now(), code); svg = r && r.svg; }
    catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: Mermaid error — ' + ((e && e.message) || e) + '.', dismissible: true }); } catch (_e) {} return; }
    if (!svg) return;
    const file = await svgToPngFile(svg, 'mermaid.png'); if (!file) { try { this.plugin.ui.addToaster({ title: 'Plexus: Mermaid render failed.', dismissible: true }); } catch (_e) {} return; }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    await this._addImageFromFile(file, c.x, c.y);
    try { this.plugin.ui.addToaster({ title: 'Mermaid diagram inserted.', dismissible: true }); } catch (_e) {}
  }
  // Phase 6: Mermaid from natural language — AI turns a prompt into Mermaid code, then renders it.
  async _aiMermaid() {
    const what = await this._promptText('Describe the diagram (AI → Mermaid):', 'a flowchart of our EMP sampling decision process');
    if (!what) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: asking the model for a Mermaid diagram…', dismissible: true }); } catch (_e) {}
    const SYS = 'Output ONLY valid Mermaid diagram code — no prose, no markdown fences. Choose the best diagram type (flowchart/sequence/class/state/ER) for the request.';
    let code = null; try { code = await this._aiComplete(SYS, String(what)); } catch (_e) {}
    if (code == null) return;
    code = String(code).replace(/^```(mermaid)?/i, '').replace(/```$/, '').trim();
    if (!code) { try { this.plugin.ui.addToaster({ title: 'Plexus: the model returned no Mermaid code.', dismissible: true }); } catch (_e) {} return; }
    await this._renderMermaidCode(code);
  }
  // P2: LaTeX equation (MathJax SVG, lazy) → rasterized image element.
  async _insertLatex() {
    const tex = await this._promptText('LaTeX:', 'e = mc^2');
    if (!tex) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: rendering LaTeX…', dismissible: true }); } catch (_e) {}
    const MJ = await loadMathJax(); if (!MJ || !MJ.tex2svg) { try { this.plugin.ui.addToaster({ title: 'Plexus: MathJax failed to load.', dismissible: true }); } catch (_e) {} return; }
    let svg = null;
    try {
      const node = MJ.tex2svg(tex, { display: true }); node.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:34px;'; document.body.appendChild(node);
      const svgEl = node.querySelector('svg'); if (svgEl) { const r = svgEl.getBoundingClientRect(); svgEl.setAttribute('width', Math.max(1, Math.ceil(r.width))); svgEl.setAttribute('height', Math.max(1, Math.ceil(r.height))); svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg = new XMLSerializer().serializeToString(svgEl); }
      node.remove();
    } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: LaTeX error.', dismissible: true }); } catch (_e) {} return; }
    if (!svg) return;
    const file = await svgToPngFile(svg, 'latex.png'); if (!file) return;
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    await this._addImageFromFile(file, c.x, c.y);
    try { this.plugin.ui.addToaster({ title: 'LaTeX inserted.', dismissible: true }); } catch (_e) {}
  }
  // P2: PDF import (pdf.js, lazy) — render pages to images, stacked on the canvas.
  async _addPdf(file, wx, wy) {
    let pdfjs; try { pdfjs = await loadLib(LIB.pdfjs); } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: pdf.js failed to load.', dismissible: true }); } catch (_e) {} return; }
    try { if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs'; } catch (_e) {}
    try { this.plugin.ui.addToaster({ title: 'Plexus: importing PDF…', dismissible: true }); } catch (_e) {}
    let doc; try { const buf = await file.arrayBuffer(); doc = await pdfjs.getDocument({ data: buf }).promise; } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not read the PDF.', dismissible: true }); } catch (_e) {} return; }
    const n = Math.min(doc.numPages, 20); let y = wy;
    for (let p = 1; p <= n; p++) {
      try {
        const page = await doc.getPage(p), vp = page.getViewport({ scale: (this.plugin._settings && this.plugin._settings.pdfScale) || 2 });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        if (blob) await this._addImageFromFile(new File([blob], 'pdf-' + p + '.png', { type: 'image/png' }), wx, y);
        y += 520;
      } catch (_e) {}
    }
    try { this.plugin.ui.addToaster({ title: n + ' PDF page(s) imported.', dismissible: true }); } catch (_e) {}
  }
  _importPdfPicker() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) { const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2); this._addPdf(f, c.x, c.y); } });
    inp.click();
  }
  // CP-PDF (model-B-lite): import a SPECIFIC PDF page as one image element (the PDF++ "crop a page as a node"
  // core) — the daily-felt half of model B without the heavy live doc-proxy/zoom-rerender infrastructure.
  _importPdfPagePicker() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.addEventListener('change', async () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      let pdfjs; try { pdfjs = await loadLib(LIB.pdfjs); } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: pdf.js failed to load.', dismissible: true }); } catch (_e) {} return; }
      try { if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs'; } catch (_e) {}
      let doc; try { doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not read the PDF.', dismissible: true }); } catch (_e) {} return; }
      const pageStr = await this._promptText('Which page? (1–' + doc.numPages + ')', '1'); if (pageStr == null) return;
      const p = Math.max(1, Math.min(doc.numPages, parseInt(pageStr, 10) || 1));
      try {
        const page = await doc.getPage(p), vp = page.getViewport({ scale: (this.plugin._settings && this.plugin._settings.pdfScale) || 2 });
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
        const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
        if (blob) await this._addImageFromFile(new File([blob], 'pdf-p' + p + '.png', { type: 'image/png' }), c.x, c.y);
        try { this.plugin.ui.addToaster({ title: 'PDF page ' + p + ' imported.', dismissible: true }); } catch (_e) {}
      } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: page render failed.', dismissible: true }); } catch (_e) {} }
    });
    inp.click();
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
    // CP-3: clear hidden flags, then a folded node hides its whole subtree (marked mmHidden, skipped in placement).
    for (const n of nodes) n.mmHidden = false;
    const hideSubtree = (id) => { for (const k of nodes.filter((e) => e.mmParent === id)) { k.mmHidden = true; hideSubtree(k.id); } };
    const place = (id, depth) => {
      const n = this._byId(id); if (!n) return 0; n._mmDepth = depth;
      const kids = nodes.filter((e) => e.mmParent === id);
      if (n.mmFolded) { hideSubtree(id); rowOf[id] = leaf++; return rowOf[id]; } // folded → treat as leaf, hide descendants
      if (!kids.length) { rowOf[id] = leaf++; return rowOf[id]; }
      const rs = kids.map((k) => place(k.id, depth + 1)); rowOf[id] = (rs[0] + rs[rs.length - 1]) / 2; return rowOf[id];
    };
    place(rootId, 0);
    const baseX = root.x, baseY = root.y, rootRow = rowOf[rootId] || 0;
    const mode = root.mmLayoutMode || 'right', total = Math.max(1, leaf); // CP-3 v3b: right | down | up | left | radial
    for (const n of nodes) {
      if (n.mmHidden || n.mmPinned) continue; // pinned nodes keep their manual position (excluded from auto-layout)
      const d = n._mmDepth || 0, row = (rowOf[n.id] || 0) - rootRow;
      if (mode === 'down') { n.x = baseX + row * (HGAP * 0.9); n.y = baseY + d * VGAP; }
      else if (mode === 'up') { n.x = baseX + row * (HGAP * 0.9); n.y = baseY - d * VGAP; }
      else if (mode === 'left') { n.x = baseX - d * HGAP; n.y = baseY + row * VGAP; }
      else if (mode === 'radial') { const ang = ((rowOf[n.id] || 0) / total) * Math.PI * 2 - Math.PI / 2, R = d * 175; n.x = baseX + Math.cos(ang) * R; n.y = baseY + Math.sin(ang) * R; }
      else { n.x = baseX + d * HGAP; n.y = baseY + row * VGAP; }
      measureText(n);
    }
    for (const ed of this.scene.elements) {
      if (ed.isDeleted || ed.mmRoot !== rootId || !ed.mmEdge) continue;
      const a = this._byId(ed.mmEdge.from), b = this._byId(ed.mmEdge.to); ed.mmHidden = !!(a && b && (a.mmHidden || b.mmHidden));
      if (a && b && !ed.mmHidden) {
        let p0, p1;
        if (mode === 'down') { p0 = [a.x + a.width / 2, a.y + a.height]; p1 = [b.x + b.width / 2, b.y]; }
        else if (mode === 'up') { p0 = [a.x + a.width / 2, a.y]; p1 = [b.x + b.width / 2, b.y + b.height]; }
        else if (mode === 'left') { p0 = [a.x - 4, a.y + a.height / 2]; p1 = [b.x + b.width + 4, b.y + b.height / 2]; }
        else if (mode === 'radial') { p0 = [a.x + a.width / 2, a.y + a.height / 2]; p1 = [b.x + b.width / 2, b.y + b.height / 2]; }
        else { p0 = [a.x + a.width + 4, a.y + a.height / 2]; p1 = [b.x - 4, b.y + b.height / 2]; }
        ed.points = [p0, p1]; linearBBox(ed);
      }
    }
  }
  // CP-3 v3b: cycle the mind-map layout direction (right → down → radial → up → left → right) and re-lay out.
  _mmCycleLayout(node) {
    const rootId = node && node.mmRoot; const root = rootId && this._byId(rootId); if (!root) return;
    const order = ['right', 'down', 'radial', 'up', 'left']; const i = order.indexOf(root.mmLayoutMode || 'right');
    root.mmLayoutMode = order[(i + 1) % order.length];
    this._mmLayout(rootId); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Mind-map layout: ' + root.mmLayoutMode, dismissible: true }); } catch (_e) {}
  }
  // CP-3 v3b: pin/unpin a node — a pinned node is excluded from auto-layout (keeps its dragged position).
  _mmTogglePin(node) {
    if (!node || !node.mmRoot) return;
    node.mmPinned = !node.mmPinned;
    this._mmLayout(node.mmRoot); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: node.mmPinned ? 'Node pinned (won’t auto-arrange).' : 'Node unpinned.', dismissible: true }); } catch (_e) {}
  }
  // P0.4/P0.4b: apply a colour to the selection (stroke + tinted fill if the element is filled).
  _applyColorToSelection(color) {
    let ch = false;
    for (const id of this.selected) { const el = this._byId(id); if (!el) continue; el.strokeColor = color; if (el.backgroundColor && el.backgroundColor !== 'transparent') el.backgroundColor = FILLS[color] || tintColor(color); ch = true; }
    if (ch) { this.dirty = true; this.scheduleSave(); this._syncToolbar && this._syncToolbar(); pushRecentColor(color); } // CP-7/C-CF10: persist recent colours across drawings
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
    const recent = recentColors(); if (recent.length) swatchRow('Recent (across drawings)', recent); // CP-7/C-CF10: inherited palette
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
  // AI AUTO-CLUSTER: embed each card/text on-device (nothing leaves the device), single-linkage cluster by meaning, then
  // physically move each cluster into a tidy AI-named frame. Turns a brain-dump into themed groups in one command.
  async _aiAutoCluster() {
    const els = this.scene.elements.filter((e) => !e.isDeleted && (e.type === 'text' || e.type === 'record' || e.type === 'board' || e.type === 'query'));
    if (els.length < 3) { try { this.plugin.ui.addToaster({ title: 'Plexus: add 3+ cards / text elements first.', dismissible: true }); } catch (_e) {} return; }
    try { this.plugin.ui.addToaster({ title: 'Plexus: embedding locally… (first run downloads a small model)', dismissible: true }); } catch (_e) {}
    const texts = [], vecs = [];
    for (const el of els) { const t = await this._semanticTextOf(el); texts.push(t || ''); let v = null; try { v = await this.plugin._embed(t || ''); } catch (_e) {} vecs.push(v); }
    const clusters = pxcClusterByThreshold(vecs, 0.5);
    if (clusters.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: content too similar to cluster (one group).', dismissible: true }); } catch (_e) {} return; }
    if (clusters.every((cl) => cl.length === 1)) { try { this.plugin.ui.addToaster({ title: 'Plexus: no meaningful clusters — items too distinct (or embedding unavailable).', dismissible: true }); } catch (_e) {} return; }
    let names = clusters.map((_, i) => 'Cluster ' + (i + 1));
    try {
      const SYS = 'Name each cluster of notes in 1–3 words. Input: a JSON array where each item is an array of note titles. Output ONLY a JSON array of short names, SAME length and order as the input.';
      const txt = await this._aiComplete(SYS, JSON.stringify(clusters.map((c) => c.map((idx) => texts[idx]).filter(Boolean).slice(0, 8))));
      if (txt) { const parsed = pxcParseStringArray(txt); if (parsed.length === clusters.length) names = parsed.map((n, i) => (n && n.trim()) || names[i]); }
    } catch (_e) {}
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const CW = 200, CH = 110, GAP = 16, PAD = 18, HEAD = 26, RIGHT = c.x + 700;
    let fx = this._snap(c.x - 460), fy = this._snap(c.y - 240), rowH = 0;
    clusters.forEach((cl, ci) => {
      const cols = Math.max(1, Math.ceil(Math.sqrt(cl.length))), rows = Math.ceil(cl.length / cols);
      const fw = cols * (CW + GAP) + PAD * 2 - GAP, fh = rows * (CH + GAP) + PAD * 2 + HEAD - GAP;
      if (fx + fw > RIGHT) { fx = this._snap(c.x - 460); fy = this._snap(fy + rowH + 40); rowH = 0; }
      const frame = makeFrame(fx, fy, fw, fh); frame.name = names[ci]; this.scene.elements.unshift(frame);
      cl.forEach((idx, k) => { const el = els[idx], col = k % cols, row = Math.floor(k / cols); el.x = this._snap(fx + PAD + col * (CW + GAP)); el.y = this._snap(fy + PAD + HEAD + row * (CH + GAP)); if (el.type !== 'text') { el.width = CW; el.height = CH; } });
      fx = this._snap(fx + fw + 40); rowH = Math.max(rowH, fh);
    });
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Auto-clustered ' + els.length + ' element(s) into ' + clusters.length + ' named group(s).', dismissible: true }); } catch (_e) {}
  }
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
        const data = await res.json(); this._addAiUsage(data); return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      }
      if (provider === 'anthropic') {
        const m = model || 'claude-3-5-haiku-latest';
        const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: m, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }) });
        const data = await res.json(); this._addAiUsage(data); return (data && data.content && data.content[0] && data.content[0].text) || '';
      }
      if (provider === 'gemini') {
        const m = model || 'gemini-2.0-flash';
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }) });
        const data = await res.json(); this._addAiUsage(data); return (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
      }
    } catch (e) { console.error('[Plexus] ai', e); }
    return null;
  }
  // Phase 6: vision — send the rendered scene to a multimodal model and return its text analysis. Per-provider
  // message shapes (OpenAI/xAI image_url, Anthropic image/base64, Gemini inlineData). dataUrl = a PNG data URL.
  async _aiVision(system, user, dataUrl) {
    const provider = (this.plugin._settings && this.plugin._settings.aiProvider) || 'openai';
    const key = await this._aiKey(provider); if (!key) return null;
    const model = (this.plugin._settings && this.plugin._settings.aiModel) || '';
    const b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
    try {
      if (provider === 'openai' || provider === 'xai') {
        const url = provider === 'xai' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
        const m = model || (provider === 'xai' ? 'grok-2-vision-latest' : 'gpt-4o-mini');
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: m, messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: dataUrl } }] }] }) });
        const data = await res.json(); this._addAiUsage(data); return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      }
      if (provider === 'anthropic') {
        const m = model || 'claude-3-5-sonnet-latest';
        const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: m, max_tokens: 1200, system, messages: [{ role: 'user', content: [{ type: 'text', text: user }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } }] }] }) });
        const data = await res.json(); this._addAiUsage(data); return (data && data.content && data.content[0] && data.content[0].text) || '';
      }
      if (provider === 'gemini') {
        const m = model || 'gemini-2.0-flash';
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }, { inlineData: { mimeType: 'image/png', data: b64 } }] }] }) });
        const data = await res.json(); this._addAiUsage(data); return (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
      }
    } catch (e) { console.error('[Plexus] ai vision', e); }
    return null;
  }
  // Phase 6: analyse the current drawing with a vision model and drop its feedback as a text note on the canvas.
  async _aiAnalyzeCanvas() {
    let blob = null; try { blob = await exportPng(this.scene, 2048, { scale: 1.5, padding: 16, background: true }); } catch (_e) {}
    if (!blob) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing to analyse.', dismissible: true }); } catch (_e) {} return; }
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result || '')); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
    if (!dataUrl) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: analysing the drawing…', dismissible: true }); } catch (_e) {}
    const SYS = 'You are a concise visual-thinking assistant. Look at this whiteboard and respond in <120 words: what it depicts, gaps or unclear bits, and 2 concrete suggestions. Plain text.';
    let txt = null; try { txt = await this._aiVision(SYS, 'Analyse this drawing.', dataUrl); } catch (_e) {}
    if (!txt) { try { this.plugin.ui.addToaster({ title: 'Plexus: no analysis returned (check the AI provider + key).', dismissible: true }); } catch (_e) {} return; }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const el = makeText(this._snap(c.x), this._snap(c.y), { fontSize: 14, stroke: '#7c5cff' }); el.text = '🤖 ' + String(txt).trim(); el.width = 360; measureText(el);
    this.scene.elements.push(el); this.selected.clear(); this.selected.add(el.id); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Analysis added as a note.', dismissible: true }); } catch (_e) {}
  }
  // Phase 6: AI image generation — DALL-E via the secure key layer, returned as b64 (no 30-min URL expiry) and
  // dropped as a canvas image element. (OpenAI provider; other providers toast a hint.)
  async _aiImage() {
    const provider = (this.plugin._settings && this.plugin._settings.aiProvider) || 'openai';
    if (provider !== 'openai') { try { this.plugin.ui.addToaster({ title: 'Plexus: image generation needs the OpenAI provider (Settings → AI).', dismissible: true }); } catch (_e) {} return; }
    const what = await this._promptText('Describe the image to generate:', 'a minimalist flat icon of a data pipeline');
    if (!what) return;
    const key = await this._aiKey('openai'); if (!key) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: generating image…', dismissible: true }); } catch (_e) {}
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify({ model: 'dall-e-3', prompt: String(what), n: 1, size: '1024x1024', response_format: 'b64_json' }) });
      const data = await res.json();
      const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) { try { this.plugin.ui.addToaster({ title: 'Plexus: no image returned (' + ((data && data.error && data.error.message) || 'check key/quota') + ').', dismissible: true }); } catch (_e) {} return; }
      const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], 'ai-image.png', { type: 'image/png' });
      const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
      await this._addImageFromFile(file, c.x, c.y);
      try { this.plugin.ui.addToaster({ title: 'AI image inserted.', dismissible: true }); } catch (_e) {}
    } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: image generation failed (' + e + ').', dismissible: true }); } catch (_e) {} }
  }
  // Phase 6: AI image edit — send the SELECTED image + a prompt to OpenAI's edits endpoint (whole-image edit;
  // true mask-region inpaint = follow-up). Needs a square PNG; result is dropped beside the original.
  async _aiEditImage() {
    const img = this._singleSel(); if (!img || img.type !== 'image') { try { this.plugin.ui.addToaster({ title: 'Plexus: select a single image first.', dismissible: true }); } catch (_e) {} return; }
    const provider = (this.plugin._settings && this.plugin._settings.aiProvider) || 'openai';
    if (provider !== 'openai') { try { this.plugin.ui.addToaster({ title: 'Plexus: image edit needs the OpenAI provider.', dismissible: true }); } catch (_e) {} return; }
    const file = this.scene.files && this.scene.files[img.fileId];
    if (!file || !file.dataURL || !/,/.test(file.dataURL)) { if (file && file.blobGuid) { try { this.plugin.ui.addToaster({ title: 'Plexus: AI image-edit isn’t supported for externalized images yet.', dismissible: true }); } catch (_e) {} } return; }
    const prompt = await this._promptText('How should the AI edit this image?', 'add a soft gradient background'); if (!prompt) return;
    const key = await this._aiKey('openai'); if (!key) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: editing image (needs a square PNG)…', dismissible: true }); } catch (_e) {}
    try {
      const bin = atob(file.dataURL.split(',')[1]); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const fd = new FormData(); fd.append('image', new Blob([arr], { type: 'image/png' }), 'image.png'); fd.append('prompt', String(prompt)); fd.append('n', '1'); fd.append('size', '1024x1024'); fd.append('response_format', 'b64_json'); fd.append('model', 'dall-e-2');
      const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key }, body: fd });
      const data = await res.json(); const b64 = data && data.data && data.data[0] && data.data[0].b64_json;
      if (!b64) { try { this.plugin.ui.addToaster({ title: 'Plexus: edit failed (' + ((data && data.error && data.error.message) || 'image must be a square PNG <4MB') + ').', dismissible: true }); } catch (_e) {} return; }
      const ebin = atob(b64); const earr = new Uint8Array(ebin.length); for (let i = 0; i < ebin.length; i++) earr[i] = ebin.charCodeAt(i);
      await this._addImageFromFile(new File([earr], 'ai-edit.png', { type: 'image/png' }), img.x + Math.abs(img.width) + 24, img.y);
      try { this.plugin.ui.addToaster({ title: 'Edited image inserted.', dismissible: true }); } catch (_e) {}
    } catch (e) { try { this.plugin.ui.addToaster({ title: 'Plexus: image edit failed (' + e + ').', dismissible: true }); } catch (_e) {} }
  }
  // Phase 6: wireframe → working app — AI generates a single self-contained HTML doc and runs it LIVE in a
  // sandboxed iframe (allow-scripts only; no same-origin). Uses vision when a drawing exists, else a text prompt.
  async _aiWireframe() {
    const what = await this._promptText('Describe the app to build (your drawing is sent as the wireframe):', 'a working tip calculator: bill input, tip % slider, live total');
    if (what == null) return;
    try { this.plugin.ui.addToaster({ title: 'Plexus: generating the app…', dismissible: true }); } catch (_e) {}
    const SYS = 'Output ONLY a single self-contained HTML document (inline CSS + JS, no external resources/CDNs) implementing the requested UI as a working mini-app. No markdown fences, no prose.';
    let html = null;
    try {
      const hasDrawing = this.scene.elements.some((e) => !e.isDeleted);
      if (hasDrawing) { let blob = null; try { blob = await exportPng(this.scene, 1600, { scale: 1.4, padding: 12, background: true }); } catch (_e) {} if (blob) { const durl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result || '')); fr.onerror = () => r(''); fr.readAsDataURL(blob); }); if (durl) html = await this._aiVision(SYS, 'Build a working web app from this wireframe. ' + String(what), durl); } }
      if (!html) html = await this._aiComplete(SYS, String(what));
    } catch (_e) {}
    if (!html) { try { this.plugin.ui.addToaster({ title: 'Plexus: no code returned (check the AI provider + key).', dismissible: true }); } catch (_e) {} return; }
    html = String(html).replace(/^```(html)?/i, '').replace(/```$/, '').trim();
    const ov = document.createElement('div'); ov.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box'; box.style.width = '82vw'; box.style.height = '82vh'; box.style.maxWidth = '1040px';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'AI Wireframe → live app (sandboxed)'; box.appendChild(title);
    const frame = document.createElement('iframe'); frame.setAttribute('sandbox', 'allow-scripts'); frame.srcdoc = html; frame.style.cssText = 'width:100%;height:calc(100% - 86px);border:1px solid var(--cards-border-color);border-radius:8px;background:#fff'; box.appendChild(frame);
    const close = document.createElement('button'); close.className = 'pxc-settings-close'; close.textContent = 'Close'; close.addEventListener('click', () => ov.remove()); box.appendChild(close);
    ov.appendChild(box); ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  // Phase 6: per-session AI token meter — accumulate usage across providers (OpenAI/xAI total_tokens,
  // Anthropic input+output, Gemini usageMetadata) into the plugin so the user can see what a session cost.
  _addAiUsage(data) {
    let t = 0;
    try {
      if (data && data.usage) t = data.usage.total_tokens || ((data.usage.input_tokens || 0) + (data.usage.output_tokens || 0)) || ((data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0)) || 0;
      else if (data && data.usageMetadata) t = data.usageMetadata.totalTokenCount || 0;
    } catch (_e) {}
    if (t) { this.plugin._aiTokens = (this.plugin._aiTokens || 0) + t; this.plugin._aiCalls = (this.plugin._aiCalls || 0) + 1; }
  }
  // TS-8: cross-plugin seam — flip a record to a drawing and build a mind map from its headings once the view mounts.
  async _mindMapFromNoteSeam(guid) {
    if (!guid) return;
    try { await this._openPanelFor(guid, { blank: false }); } catch (_e) {}
    for (let i = 0; i < 25; i++) { const v = [...this._views].find((x) => x.rec && x.rec.guid === guid && x.scene); if (v) { try { await v._mmFromNote(guid); } catch (_e) {} return; } await sleep(120); }
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
  // AI RELATION-SUGGEST: the model reads the record cards on the board and proposes meaningful directed links; accepted
  // ones write a real ref on the FROM record → TO record (a DEFINED-ish edge Plexus Brain graphs). Net-new links the
  // user hasn't drawn — the canvas as a graph-builder. (Accept is user-gated; nothing is written without confirmation.)
  async _aiRelationSuggest() {
    const cards = this.scene.elements.filter((e) => !e.isDeleted && (e.type === 'record' || e.type === 'board') && e.recordGuid);
    if (cards.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: put 2+ record cards on the board first.', dismissible: true }); } catch (_e) {} return; }
    const list = [];
    for (const card of cards) { let title = ''; try { const rec = await this.plugin.data.getRecord(card.recordGuid); title = (rec && rec.getName && rec.getName()) || ''; } catch (_e) {} if (title && !list.some((x) => x.guid === card.recordGuid)) list.push({ guid: card.recordGuid, title }); }
    if (list.length < 2) { try { this.plugin.ui.addToaster({ title: 'Plexus: need 2+ distinct named records.', dismissible: true }); } catch (_e) {} return; }
    try { this.plugin.ui.addToaster({ title: 'Plexus: asking the model for link suggestions…', dismissible: true }); } catch (_e) {}
    const SYS = 'You connect ideas. Given notes as a JSON array of {id,title}, propose meaningful DIRECTED links. Output ONLY a JSON array of {"from":<id>,"to":<id>,"reason":"<short why>"}. Only genuinely meaningful links; omit weak ones; no self-links; max 12.';
    let txt = null; try { txt = await this._aiComplete(SYS, JSON.stringify(list.map((x, i) => ({ id: i, title: x.title })))); } catch (_e) {}
    if (txt == null) { try { this.plugin.ui.addToaster({ title: 'Plexus: AI request failed or no key set.', dismissible: true }); } catch (_e) {} return; }
    const sugg = pxcParseLinkSuggestions(txt).filter((s) => list[s.from] && list[s.to]);
    if (!sugg.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no link suggestions returned.', dismissible: true }); } catch (_e) {} return; }
    const chosen = await this._pickSuggestions(sugg, list);
    if (!chosen || !chosen.length) return;
    let n = 0;
    for (const s of chosen) {
      const from = list[s.from], to = list[s.to]; if (!from || !to) continue;
      try { const rec = await this.plugin.data.getRecord(from.guid); if (rec && rec.createLineItem) { await rec.createLineItem(null, null, 'ulist', ceEdgeSegments(to.guid, to.title), null); this._invalidateRec(from.guid); n++; } } catch (_e) {}
    }
    this.dirty = true;
    try { this.plugin.ui.addToaster({ title: 'Wrote ' + n + ' relation(s) — open Plexus Brain to see the new edges.', dismissible: true }); } catch (_e) {}
  }
  // Multi-select modal for AI suggestions: checkboxes (default ON) + Link/Cancel. Resolves to the accepted subset.
  _pickSuggestions(sugg, list) {
    try { this._injectRefPickerCss(); } catch (_e) {}
    return new Promise((resolve) => {
      const ov = document.createElement('div'); ov.className = 'pxc-modal';
      const done = (val) => { try { ov.remove(); } catch (_e) {} resolve(val); };
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) { e.stopPropagation(); done(null); } });
      const box = document.createElement('div'); box.className = 'pxc-modal-box'; box.addEventListener('pointerdown', (e) => e.stopPropagation());
      const lab = document.createElement('div'); lab.className = 'pxc-modal-label'; lab.textContent = 'AI suggested ' + sugg.length + ' link(s) — choose which to write:';
      const listEl = document.createElement('div'); listEl.className = 'pxc-collist';
      const checks = [];
      sugg.forEach((s, i) => {
        const row = document.createElement('label'); row.className = 'pxc-colrow'; row.style.display = 'flex'; row.style.alignItems = 'flex-start'; row.style.gap = '8px'; row.style.cursor = 'pointer';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; checks.push(cb);
        const txt = document.createElement('div'); txt.innerHTML = '<b>' + pxcEsc(list[s.from].title) + '</b> → <b>' + pxcEsc(list[s.to].title) + '</b>' + (s.reason ? '<div style="font-size:11px;opacity:.6">' + pxcEsc(s.reason) + '</div>' : '');
        row.appendChild(cb); row.appendChild(txt); listEl.appendChild(row);
      });
      const rowBtns = document.createElement('div'); rowBtns.className = 'pxc-modal-row';
      const ok = document.createElement('button'); ok.className = 'pxc-prop-btn'; ok.textContent = 'Write links';
      const cancel = document.createElement('button'); cancel.className = 'pxc-prop-btn'; cancel.textContent = 'Cancel';
      ok.addEventListener('click', () => done(sugg.filter((s, i) => checks[i].checked)));
      cancel.addEventListener('click', () => done(null));
      rowBtns.appendChild(ok); rowBtns.appendChild(cancel);
      box.appendChild(lab); box.appendChild(listEl); box.appendChild(rowBtns); ov.appendChild(box); this.wrap.appendChild(ov);
    });
  }
  // B3: import a /cause-effect-chart JSON → native RCA elements at the viewport centre.
  async _ceImportJson() {
    const raw = await this._promptText('Paste a cause-effect chart JSON (from /cause-effect-chart):', '');
    if (!raw) return;
    let chart = null; try { chart = JSON.parse(raw); } catch (_e) { const m = String(raw).match(/\{[\s\S]*\}/); if (m) { try { chart = JSON.parse(m[0]); } catch (_e2) {} } }
    if (!chart || !Array.isArray(chart.nodes) || !chart.nodes.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: not a valid cause-effect chart (needs a "nodes" array).', dismissible: true }); } catch (_e) {} return; }
    const prim = chart.nodes.filter((n) => n && n.role === 'primary').length;
    if (prim !== 1) { try { this.plugin.ui.addToaster({ title: 'Plexus: chart should have exactly one "primary" effect (found ' + prim + ').', dismissible: true }); } catch (_e) {} }
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const chartId = 'ce' + newId(); // CE-BRAIN: stamp + store the structure so it can be promoted to records later
    const els = elementsFromCauseEffect(chart, c.x - 120, c.y - 120, chart.layout, chartId); // CE-FISHBONE: a pasted chart may specify "layout":"fishbone"|"pentagon"
    if (!els.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing to draw from that chart.', dismissible: true }); } catch (_e) {} return; }
    this._storeCeChart(chartId, chart);
    this.selected.clear(); for (const e of els) { this.scene.elements.push(e); if (e.ceRole) this.selected.add(e.id); }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Cause & effect: ' + els.length + ' element(s) imported.', dismissible: true }); } catch (_e) {}
  }
  // B3 / CE-FISHBONE: scaffold a starter cause-&-effect in the chosen layout (tree | fishbone | pentagon).
  _newCauseEffect(layout) {
    const chart = { nodes: [
      { id: 'p', text: 'Effect / problem', role: 'primary' },
      { id: 'c1', text: 'Cause', role: 'action' },
      { id: 'c2', text: 'Condition: a standing state', role: 'condition', terminator: 'end' },
      { id: 'c3', text: 'Unknown — needs evidence', role: 'neutral', terminator: 'question' },
    ], edges: [{ effect: 'p', cause: 'c1' }, { effect: 'c1', cause: 'c2' }, { effect: 'c1', cause: 'c3' }], connections: [] };
    const c = this.camera.screenToWorld(this.cssW / 2, this.cssH / 2);
    const chartId = 'ce' + newId();
    const els = elementsFromCauseEffect(chart, c.x - 120, c.y - 80, layout, chartId);
    this._storeCeChart(chartId, chart);
    this.selected.clear(); for (const e of els) { this.scene.elements.push(e); if (e.ceRole) this.selected.add(e.id); }
    this.dirty = true; this.scheduleSave();
    const how = layout === 'fishbone' ? 'fishbone spine (bones alternate up/down)' : layout === 'pentagon' ? 'pentagon head + spine' : 'right-branching tree';
    try { this.plugin.ui.addToaster({ title: 'Cause-&-effect starter added (' + how + ') — edit the boxes.', dismissible: true }); } catch (_e) {}
  }
  // CE-BRAIN: persist a chart's structure (nodes + edges) in the scene so it can be promoted to records + Brain edges.
  _storeCeChart(chartId, chart) {
    if (!this.scene.ceCharts) this.scene.ceCharts = {};
    this.scene.ceCharts[chartId] = {
      nodes: (chart.nodes || []).map((n) => ({ id: n.id, text: n.text || '' })),
      edges: (chart.edges || []).map((e) => ({ effect: e.effect, cause: e.cause })),
      promoted: {}, edgesDone: {},
    };
  }
  // CE-BRAIN: materialize ce nodes as Thymer records + write each cause→effect link as a ref on the CAUSE record
  // pointing at the EFFECT (so Brain renders causes as parents/roots). Idempotent via the per-chart promoted/edgesDone
  // maps stored in the scene — re-running reuses records (recreates only trashed ones) and never duplicates ref lines.
  async _promoteCauseEffect() {
    const charts = this.scene.ceCharts || {};
    let ids = [];
    for (const id of this.selected) { const el = this._byId(id); if (el && el.ceChartId && ids.indexOf(el.ceChartId) < 0) ids.push(el.ceChartId); }
    if (!ids.length) ids = Object.keys(charts);
    ids = ids.filter((id) => charts[id] && charts[id].nodes && charts[id].nodes.length);
    if (!ids.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: no cause-effect chart to promote — import or create one first.', dismissible: true }); } catch (_e) {} return; }
    const col = await this._pickCollection('Promote cause-effect nodes into collection:');
    if (!col) return;
    let nodeCount = 0, edgeCount = 0;
    for (const id of ids) {
      const meta = charts[id]; meta.promoted = meta.promoted || {}; meta.edgesDone = meta.edgesDone || {};
      const text = {}; for (const n of meta.nodes) text[n.id] = n.text || '(cause)';
      for (const n of meta.nodes) { // node → record (idempotent; recreate a trashed one)
        let g = meta.promoted[n.id];
        if (g) { const ex = await getRecordPoll(this.plugin, g, 2); if (!ex) g = null; }
        if (!g) { try { g = col.createRecord(text[n.id]); } catch (_e) {} if (typeof g === 'string') { meta.promoted[n.id] = g; nodeCount++; await getRecordPoll(this.plugin, g, 8); for (const e of meta.edges) if (e.cause === n.id || e.effect === n.id) delete meta.edgesDone[e.effect + '>' + e.cause]; } } // recreated guid (trashed node) → any edge touching it is stale → rewrite the ref line
      }
      for (const e of meta.edges) { // cause→effect ref line on the CAUSE record (effect = inferred child)
        const key = e.effect + '>' + e.cause; if (meta.edgesDone[key]) continue;
        const cg = meta.promoted[e.cause], eg = meta.promoted[e.effect]; if (!cg || !eg) continue;
        const causeRec = await getRecordPoll(this.plugin, cg, 4); if (!causeRec) continue;
        try { await causeRec.createLineItem(null, null, 'ulist', ceEdgeSegments(eg, text[e.effect]), null); meta.edgesDone[key] = true; edgeCount++; } catch (_e) {}
      }
    }
    this.dirty = true; this.scheduleSave(); // NOTE: the ceCharts promoted/edgesDone maps are intentionally NOT undo-isolated — promote creates real Thymer records (an external side effect), so an undo across a promote can desync the maps; re-promote then self-heals via the getRecordPoll/recreate path above.
    try { this.plugin.ui.addToaster({ title: 'Promoted ' + nodeCount + ' record(s) + ' + edgeCount + ' cause→effect link(s) — open Plexus Brain to graph them.', dismissible: true }); } catch (_e) {}
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
  // P2: Text to Path — flow a text element's glyphs along a selected path (line/arrow/freedraw).
  _textToPath() {
    const sel = [...this.selected].map((id) => this._byId(id)).filter(Boolean);
    const txt = sel.find((e) => e.type === 'text'); const path = sel.find((e) => e.type === 'arrow' || e.type === 'line' || e.type === 'freedraw');
    if (!txt || !path) { try { this.plugin.ui.addToaster({ title: 'Plexus: select a text element AND a path (line/arrow/freedraw).', dismissible: true }); } catch (_e) {} return; }
    const pts = path.points; if (!pts || pts.length < 2) return;
    const segLen = []; for (let i = 1; i < pts.length; i++) segLen.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const fs = txt.fontSize || 24, ctx = measureText._c; ctx.font = textFont(txt);
    const chars = String(txt.text || '').split(''), els = []; let dist = 0;
    for (const ch of chars) { const cw = ctx.measureText(ch).width || fs * 0.5; const pos = pointAtArcLength(pts, segLen, dist + cw / 2); if (pos && ch.trim()) { const e = makeText(0, 0, { fontSize: fs, stroke: txt.strokeColor }); e.text = ch; measureText(e); e.x = pos.x - e.width / 2; e.y = pos.y - e.height / 2; e.angle = pos.angle; els.push(e); } dist += cw; }
    if (!els.length) return;
    txt.isDeleted = true; this.selected.clear(); for (const e of els) { this.scene.elements.push(e); this.selected.add(e.id); }
    this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Text placed along the path (' + els.length + ' glyphs).', dismissible: true }); } catch (_e) {}
  }
  // Editor polish: toggle word-wrap on the selected text (wraps to its current width; toggle restores).
  // UX-6: per-image opt-out of dark-mode inversion (for photos/logos that shouldn't invert). Flips el.noInvert on
  // the selected image element(s); takes effect immediately on the dark canvas.
  _toggleImageInvert() {
    const imgs = [...this.selected].map((id) => this._byId(id)).filter((e) => e && e.type === 'image');
    if (!imgs.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: select an image first.', dismissible: true }); } catch (_e) {} return; }
    const on = !imgs[0].noInvert; for (const e of imgs) e.noInvert = on;
    this._cacheValid = false; this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: on ? 'Image will NOT invert in dark mode.' : 'Image inverts in dark mode.', dismissible: true }); } catch (_e) {}
  }
  _toggleTextWrap() {
    const el = this._singleSel(); if (!el || el.type !== 'text') { try { this.plugin.ui.addToaster({ title: 'Plexus: select a text element.', dismissible: true }); } catch (_e) {} return; }
    if (el._wrapOrig != null) { el.text = el._wrapOrig; delete el._wrapOrig; measureText(el); this.dirty = true; this.scheduleSave(); try { this.plugin.ui.addToaster({ title: 'Text unwrapped.', dismissible: true }); } catch (_e) {} return; }
    el._wrapOrig = el.text; const flat = String(el.text || '').replace(/\n/g, ' ');
    const ctx = measureText._c; ctx.font = textFont(el); const maxW = Math.max(60, Math.abs(el.width));
    const words = flat.split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur);
    el.text = lines.join('\n'); measureText(el); this.dirty = true; this.scheduleSave();
    try { this.plugin.ui.addToaster({ title: 'Text wrapped to width — toggle again to unwrap.', dismissible: true }); } catch (_e) {}
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
    this._ensureGrid(); const zi = this._zIndex; let best = null, bestZ = -1;
    for (const el of this._grid.query(rect.x, rect.y, rect.w, rect.h)) {
      if (el.isDeleted || el.type !== 'image') continue;
      const ex0 = Math.min(el.x, el.x + el.width), ex1 = Math.max(el.x, el.x + el.width);
      const ey0 = Math.min(el.y, el.y + el.height), ey1 = Math.max(el.y, el.y + el.height);
      if (rect.x + rect.w > ex0 && rect.x < ex1 && rect.y + rect.h > ey0 && rect.y < ey1) { const z = zi.get(el.id) || 0; if (z >= bestZ) { bestZ = z; best = el; } } // topmost (highest array index)
    }
    return best;
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
      else if (file && file.blobGuid) { this.plugin._assetGet(file).then((url) => { if (!url) return resolve(null); const im = new Image(); im.onload = () => { draw(im); try { URL.revokeObjectURL(url); } catch (_e) {} }; im.onerror = () => { try { URL.revokeObjectURL(url); } catch (_e) {} resolve(null); }; im.src = url; }); } // SCALE: externalized image not yet decoded → resolve from the blob store for the snapshot
      else resolve(null);
    });
  }
  // Copy the selected image (or a given element) onto the plugin's image-ref clipboard, so it can be
  // pasted as a block reference into any note. Stores a PNG snapshot + the source record + element id.
  async _copyImageRefToClip(el) {
    // PEN → CITE: if nothing is selected/pending but the user just drew a freehand loop with the pen, treat that loop
    // like a lasso so "circle it with the pen, then Cite" cites what it encircles (enclosed shapes + an image region).
    if (!el && !this.selected.size && !this._pendingImgRegion && this._lastFreedraw && this._lastFreedraw.points && this._lastFreedraw.points.length >= 6 && !this._lastFreedraw.isDeleted) {
      this._selectFromLoop(this._lastFreedraw.points, this._lastFreedraw.id); this._lastFreedraw = null;
    }
    // Gather the TARGETS to cite: a pending in-image region (if any) + every selected element. More than one
    // target → a COMPOSITE cite that flashes them ALL on navigate-back (e.g. a shape AND part of an image).
    const targets = []; // {kind:'region'|'el', imgId/el, frac, fracPoly, region, bb, isImage?}
    if (this._pendingImgRegion) {
      const pr = this._pendingImgRegion, img = this._byId(pr.imgId);
      if (img) targets.push({ kind: 'region', imgId: pr.imgId, frac: pr.frac, fracPoly: pr.fracPoly, region: pr.rect, bb: pr.rect });
      else this._pendingImgRegion = null;
    }
    el = el || (this.selected.size === 1 ? this._singleSel() : null);
    const regionImgId = targets.length ? targets[0].imgId : null;
    const textOf = (e) => (e && (e.text || (e.runs && e.runs.length ? flattenRuns(e.runs) : '')) || '').replace(/\s+/g, ' ').trim(); // round-5 E: a text target's content, for the editable caption beneath the pasted image
    for (const id of this.selected) { if (id === regionImgId) continue; const e = this._byId(id); if (!e) continue; const bb = this._elBBox(e); if (!bb) continue; const tg = { kind: 'el', el: id, region: bb, bb, isImage: e.type === 'image' }; if (e.type === 'text') { const tx = textOf(e); if (tx) tg.tx = tx; } targets.push(tg); }
    if (!targets.length && el && el.type === 'image') { const bb = this._elBBox(el); targets.push({ kind: 'el', el: el.id, region: bb, bb, isImage: true }); }
    if (!targets.length) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing to cite — drag the Lasso (S) over a region, circle it with the Pen, select element(s), or pick an image, then Cite.', dismissible: true }); } catch (_e) {} return false; }
    const prim = targets[0];
    // Chip label (default = a nearby text label / the drawing name / a target count).
    const recName = (this.rec && this.rec.getName && this.rec.getName()) || 'drawing';
    const selText = [...this.selected].map((id) => this._byId(id)).find((e) => e && e.type === 'text' && e.text);
    const defLabel = (el && el.type === 'text' && el.text) ? el.text : (selText ? selText.text : (targets.length > 1 ? (targets.length + ' targets') : (prim.kind === 'region' ? 'region' : recName)));
    let label = defLabel; try { const t = await this._promptText('Chip label (the inline-chip text, e.g. “Oregon”):', String(defLabel).slice(0, 40)); if (t === null) return false; label = (t.trim() || defLabel); } catch (_e) {}
    // Snapshot extent: a single whole-image → itself (keeps crop); a single region → the region (freehand-clipped
    // to the loop); a composite/multi → the UNION area so the thumbnail shows everything cited.
    let png = null;
    if (targets.length === 1 && prim.kind === 'el' && prim.isImage) {
      png = await this._snapshotElement(this._byId(prim.el));
      if (!png) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not snapshot the image (still loading?).', dismissible: true }); } catch (_e) {} return false; }
    } else if (targets.length === 1 && prim.kind === 'region') {
      const clipPoly = prim.fracPoly ? this._imgRegionPolyWorld(this._byId(prim.imgId), prim.fracPoly) : null;
      try { const du = this._renderRegionPng(prim.region, 2, clipPoly); png = await (await fetch(du)).blob(); } catch (_e) {}
      if (!png) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not snapshot the region.', dismissible: true }); } catch (_e) {} return false; }
    } else {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const tg of targets) { const b = tg.bb; if (!b || !isFinite(b.x)) continue; minx = Math.min(minx, b.x); miny = Math.min(miny, b.y); maxx = Math.max(maxx, b.x + b.w); maxy = Math.max(maxy, b.y + b.h); }
      if (!isFinite(minx)) { try { this.plugin.ui.addToaster({ title: 'Plexus: nothing to cite.', dismissible: true }); } catch (_e) {} return false; }
      const pad = 10, b = { x: minx - pad, y: miny - pad, w: (maxx - minx) + pad * 2, h: (maxy - miny) + pad * 2 };
      try { const du = this._renderRegionPng(b, 2); png = await (await fetch(du)).blob(); } catch (_e) {}
      if (!png) { try { this.plugin.ui.addToaster({ title: 'Plexus: could not snapshot the selection.', dismissible: true }); } catch (_e) {} return false; }
    }
    const region = prim.region;
    const extra = targets.slice(1).map((tg) => tg.kind === 'region'
      ? { el: tg.imgId, inImage: true, frac: tg.frac, fracPoly: tg.fracPoly, region: tg.region }
      : (tg.tx ? { el: tg.el, region: tg.region, text: tg.tx } : { el: tg.el, region: tg.region }));
    // round-5 E (reverted): the cited TEXT shows IN the combined snapshot image (the union render includes it), not as a separate
    // editable caption line — the user found the caption messy/redundant. `tg.tx` still rides along in extra[] (harmless metadata).
    this.plugin._imgRefClip = {
      png, sourceRecordGuid: this.recordGuid, label, region,
      elementId: prim.kind === 'region' ? prim.imgId : prim.el,
      crop: (prim.kind === 'el' && prim.isImage) ? ((this._byId(prim.el) || {}).crop || null) : null,
      inImage: prim.kind === 'region' ? true : undefined, frac: prim.frac, fracPoly: prim.fracPoly,
      extra: extra.length ? extra : undefined,
      w: Math.round((region && region.w) || 0), h: Math.round((region && region.h) || 0),
    };
    this._pendingImgRegion = null; this.dirty = true;
    const n = targets.length;
    try { this.plugin.ui.addToaster({ title: (n > 1 ? (n + ' targets cited') : (prim.kind === 'region' ? 'Region cited' : 'Reference copied')) + ' — run “Plexus: Paste image reference” in a note.', dismissible: true }); } catch (_e) {}
    return true;
  }
  // SCALE/backing: redirect ALL storage from the HOST record (the note/Journal the panel opened on, which may have no
  // canvas properties) to a backing Plexus Drawings record (which has Scene/Assets → body-free, in-properties, unlimited).
  // `hostGuid` stays the navigation identity (flip-back); `rec`/`recordGuid` become the backing for every save/load.
  async _resolveBackingDrawing() {
    this.hostGuid = this.recordGuid;
    this.rec = await getRecordPoll(this.plugin, this.recordGuid);
    if (!this.rec || this.destroyed) return;
    if (await this.plugin._isDrawingRecord(this.hostGuid)) { this._isBacking = true; return; } // (a) host IS a drawing → its own backing
    const backingGuid = await this.plugin._findBackingDrawing(this.hostGuid); // (b) existing backing via Source Note
    if (backingGuid && backingGuid !== this.hostGuid) {
      const brec = await getRecordPoll(this.plugin, backingGuid);
      if (brec) { this.rec = brec; this.recordGuid = backingGuid; this._isBacking = true; return; }
    }
    this._pendingBacking = true; // (c) no backing yet → keep rec=host so a LEGACY body scene still loads; create lazily on first content
  }
  // Create (once, race-guarded) the backing drawing + move scene/assets onto its properties + relate it back to the host,
  // then trash the host's body canvas lines. Adopts an existing backing if another view/open created it first.
  async _ensureBackingAndMigrate() {
    if (this._isBacking) return true;
    const map = (this.plugin._backingInflight || (this.plugin._backingInflight = new Map()));
    let p = map.get(this.hostGuid); const mine = !p;
    if (!p) { p = this._createBackingAndMigrate(); map.set(this.hostGuid, p); }
    let backingGuid = null; try { backingGuid = await p; } catch (_e) {}
    if (mine) { try { if (map.get(this.hostGuid) === p) map.delete(this.hostGuid); } catch (_e) {} }
    if (backingGuid) { const brec = await getRecordPoll(this.plugin, backingGuid); if (brec) { this.rec = brec; this.recordGuid = backingGuid; this._isBacking = true; this._pendingBacking = false; this._sceneLine = null; } }
    return this._isBacking;
  }
  async _createBackingAndMigrate() {
    const hostGuid = this.hostGuid, hostRec = this.rec;
    let backingGuid = await this.plugin._findBackingDrawing(hostGuid), backing = null, relOk = false;
    if (backingGuid) { backing = await getRecordPoll(this.plugin, backingGuid); if (backing) relOk = true; } // adopted an existing backing → its Source Note relation already exists (that's how we found it)
    if (!backing) {
      const col = await this.plugin._drawingsCollection(); if (!col) return null;
      let name = 'Canvas'; try { name = (hostRec && hostRec.getName && hostRec.getName()) ? (hostRec.getName() + ' — canvas') : 'Canvas'; } catch (_e) {}
      try { backingGuid = col.createRecord(name); } catch (_e) {}
      if (typeof backingGuid !== 'string') return null;
      backing = await getRecordPoll(this.plugin, backingGuid); if (!backing) return null;
      // relate the drawing back to the note (record relation). Prefer the record OBJECT; verify via read-back, retry with the guid.
      try {
        const sp = backing.prop('Source Note');
        if (sp && (sp.set || sp.addValue)) {
          const put = (val) => { try { if (sp.set) sp.set(val); else sp.addValue(val); } catch (_e) {} };
          put(hostRec || hostGuid);
          for (let i = 0; i < 3 && !relOk; i++) { try { relOk = pxcRelValues(sp).includes(hostGuid); } catch (_e) {} if (!relOk) { await sleep(90); if (i === 1) put(hostGuid); } }
        }
      } catch (_e) {}
      this.plugin._noteBacking(hostGuid, backingGuid);
    }
    this.rec = backing; this.recordGuid = backingGuid; this._isBacking = true; this._pendingBacking = false; this._sceneLine = null; // storage now targets the backing
    this._migBegin();
    try {
      let saved = null; try { saved = await saveScene(this.plugin, backing, this.scene, this.camera, this); } catch (_e) {}
      // CONFIRM the backing carries THIS scene by blob IDENTITY (not mere presence — defends an adopted backing's stale Scene blob).
      let confirmed = false;
      if (saved && saved.ok && saved.blobGuid) { for (let i = 0; i < 4 && !confirmed; i++) { try { const pb = await backing.prop('Scene').fileBlob(); confirmed = !!(pb && pb.guid === saved.blobGuid); } catch (_e) {} if (!confirmed) await sleep(140); } }
      // DATA-SAFETY: trash host body lines ONLY when (a) THIS scene is on the backing, (b) the Source Note backref is durable
      // (else a reopen wouldn't find the backing → re-clutter/duplicate), and (c) the view is still alive.
      if (confirmed && relOk && hostGuid !== backingGuid && !this.destroyed) {
        let anchoredGuids = new Set(); try { anchoredGuids = await this._reanchorAssets(backing, this.scene); } catch (_e) {}
        try { await this._trashHostCanvasLines(hostRec, anchoredGuids); } catch (_e) {} // scene line + ONLY assets confirmed on the backing
      } else if (confirmed && !relOk && hostGuid !== backingGuid) {
        try { this.plugin.ui.addToaster({ title: 'Plexus: saved the canvas to a drawing but couldn’t link it back to the note — kept the note’s copy intact.', dismissible: true }); } catch (_e) {}
      }
    } finally { this._migEnd(); }
    return backingGuid;
  }
  _migBegin() { this._migCount = (this._migCount || 0) + 1; this._migrating = true; }
  _migEnd() { this._migCount = Math.max(0, (this._migCount || 1) - 1); this._migrating = this._migCount > 0; } // counter so overlapping migrations don't clear each other's guard (F4)
  // Precisely trash a host record's CANVAS body lines: the scene blob (SCENE_FILENAME — its content is already confirmed on
  // backing.Scene) + ONLY asset blobs CONFIRMED on backing.Assets (`confirmedAssetGuids`). Never touches the user's own file
  // attachments, and never deletes an asset line whose blob didn't re-anchor (that would lose the image's only copy).
  async _trashHostCanvasLines(hostRec, confirmedAssetGuids) {
    if (!hostRec) return;
    const safe = (confirmedAssetGuids instanceof Set) ? confirmedAssetGuids : new Set();
    let items = []; try { items = await hostRec.getLineItems() || []; } catch (_e) {}
    for (const li of items) {
      let blob = null; try { blob = await li.getBlob(); } catch (_e) {} // text/heading lines return null fast
      if (!blob) continue;
      if (blob.fileName === SCENE_FILENAME || (blob.guid && safe.has(blob.guid))) { try { await li.delete(); } catch (_e) {} }
    }
    this._sceneLine = null;
  }
  async loadOrInit() {
    await this._resolveBackingDrawing();
    if (this.destroyed) return;
    let fresh = true, hadStore = false; // hadStore = a scene STORE exists (prop blob or body line), load ok OR not
    if (this.rec) {
      // SCALE Phase 3: a CHUNKED scene (Manifest present) → load from chunks; a missing/unreadable chunk returns null →
      // fall through to the Scene-blob fallback (never load a partial scene). `hadStore` set so we never seed empty over a store.
      let mani = null; try { mani = pxcReadManifest(this.rec); } catch (_e) {}
      if (mani && mani.chunks && Object.keys(mani.chunks).length) {
        hadStore = true;
        const loaded = await loadSceneChunked(this.plugin, this.rec);
        if (loaded && loaded.elements) { this.scene = loaded; fresh = false; this._wasChunked = true; }
      }
      // UX-4: prefer the `Scene` FILE PROPERTY (clean storage); fall back to a body `file` line item.
      let sceneProp = null; try { sceneProp = this.rec.prop('Scene'); } catch (_e) {}
      if (fresh && sceneProp) {
        let pblob = null; try { pblob = await sceneProp.fileBlob(); } catch (_e) {} // a REAL stored scene → blob present
        if (pblob) { hadStore = true; const loaded = await loadScene(this.rec, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
      }
      if (fresh) {
        const line = await findSceneLine(this.rec);
        if (line) { this._sceneLine = line; hadStore = true; const loaded = await loadSceneFromLine(line, 10); if (loaded && loaded.elements) { this.scene = loaded; fresh = false; } }
      }
      // UX-4 migration: scene loaded from the BODY but the collection now has a `Scene` property → migrate on
      // open (saveScene writes the property + deletes the body line). Auto-cleans existing flipped notes.
      if (!fresh && this._sceneLine && sceneProp && !this._pendingBacking) { setTimeout(() => { if (!this.destroyed) this.saveNow(); }, 500); }
    }
    // SCALE/backing: a LEGACY canvas on an arbitrary host (pending backing) with real content → create the backing, move
    // scene+assets onto its properties, and clean the host body. Once, shortly after load (≥ the 600ms inline migration so
    // scene.files are blobGuids). Later opens resolve the backing via the Source Note relation.
    try {
      if (this._pendingBacking && !this._isBacking && this.rec) {
        const hasContent = (this.scene.elements && this.scene.elements.some((e) => !e.isDeleted)) || (this.scene.files && Object.keys(this.scene.files).length);
        if (hasContent) { const fire = () => { if (this.destroyed) return; if (this._migrating) { setTimeout(fire, 200); return; } this._ensureBackingAndMigrate(); }; setTimeout(fire, 900); } // wait out any in-flight inline migration so scene.files are settled blobGuids before re-anchoring
      }
    } catch (_e) {}
    // PERF (architecture review): deletes are soft tombstones (isDeleted), never spliced — so n grows unbounded
    // over years and EVERY scan pays for the graveyard. Undo history is empty on load, so compact it away here.
    try { if (this.scene.elements && this.scene.elements.some((e) => e.isDeleted)) this.scene.elements = this.scene.elements.filter((e) => !e.isDeleted); } catch (_e) {}
    // REF DISPLAY (2026-06-19): retire whole-element @/@@ ref chips into inline ref RUNs (no prefix, underlined, editable).
    try { let _mig = 0; for (const e of (this.scene.elements || [])) { if (pxcChipToInlineRun(e)) _mig++; } if (_mig && this.rec) setTimeout(() => { if (!this.destroyed) this.saveNow(); }, 700); } catch (_e) {}
    // SCALE Phase 1: migrate a LEGACY scene whose images were inline base64 (the bytes that overflowed the single Scene
    // blob and broke saving) → transcode + externalize each big one, then save the slim scene. Runs once; later opens skip.
    try {
      const TH = (this.plugin._settings && this.plugin._settings.imageInlineThreshold) || 65536;
      const big = this.scene.files && Object.values(this.scene.files).some((f) => f && !f.blobGuid && f.dataURL && (f.dataURL.length || 0) > TH);
      if (big && this.rec) {
        this._migBegin(); // SYNC: block the other scheduled saves (500/700ms) from snapshotting the fat scene before migration finishes
        setTimeout(async () => {
          if (this.destroyed) { this._migEnd(); return; }
          let n = 0; try { n = await this._migrateBigInlineAssets(); } catch (_e) {}
          this._migEnd(); // release BEFORE our own save so it isn't blocked (counter stays >0 if a backing migration overlaps)
          if (n) { this.dirty = true; let r = null; try { r = await this.saveNow(); } catch (_e) {} if (r && r.ok) { try { this.plugin.ui.addToaster({ title: 'Plexus: externalized ' + n + ' large image' + (n > 1 ? 's' : '') + ' — the canvas saves again.', dismissible: true }); } catch (_e) {} } }
        }, 600);
      }
    } catch (_e) {}
    // CRITICAL: the scene was just REPLACED by the loaded one. A render may have already built the spatial grid from
    // the empty pre-load scene (loadOrInit is async) — force a rebuild, or the grid-driven render cull draws NOTHING.
    this._gridDirty = true; this._grid = null; this._cacheValid = false;
    const a = this.scene.appState || {};
    // SESSION/DOCUMENT SPLIT: prefer the locally-persisted camera (per drawing), fall back to the doc's appState.
    let cx = a.scroll ? a.scroll.x : -60, cy = a.scroll ? a.scroll.y : -50, cz = a.zoom || 1;
    try { const ls = this.recordGuid && localStorage.getItem('plexus_cam_' + this.recordGuid); if (ls) { const c = JSON.parse(ls); if (c && isFinite(c.x)) { cx = c.x; cy = c.y; cz = c.zoom || 1; } } } catch (_e) {}
    this.camera = new Camera(cx, cy, cz);
    const st = this.plugin._settings || {};
    this.camera.zoomMin = st.zoomMin || 0.1; this.camera.zoomMax = st.zoomMax || 30; // S3
    this._committed = JSON.stringify(this.scene);
    try { this._updateBindings(); } catch (_e) {} // CONNECTIONS Phase 4: settle bindings + build the line/region flag-target maps on open (so the blue flag shows without waiting for the first edit)
    try { this._reindexBackrefs(); } catch (_e) {} // A1 (round 3): rebuild THIS drawing's backref sub-map from live elements on OPEN — self-heals orphaned/stale connector entries left by deletions in a prior session (was only rebuilt in saveNow)
    this.dirty = true;
    // DATA-LOSS GUARD (2026-06-19): only auto-seed the empty default for a genuinely NEW record. If a scene STORE
    // exists (Scene-property blob OR a body plexus-scene.json line) but failed to LOAD (transient blob/line sync
    // lag), NEVER overwrite it with empty — that wiped the Jun-17 map. fresh && !hadStore = truly new → safe to seed.
    if (fresh && this.rec && !hadStore) this.saveNow();
    try { this._buildXrefIndex(); } catch (_e) {} // cross-ref ↗ badges for elements cited by notes
    if (!fresh && st.zoomToFitOnOpen) this._fitToScene(); // S3
    if (st.openMode === 'present') setTimeout(() => { if (!this.destroyed) this._enterPresent(); }, 50); // S1
  }
  _snapshot() { return JSON.stringify(this.scene); }
  _restore(json) {
    try { this.scene = JSON.parse(json); } catch (_e) { return; }
    this._cacheValid = false; this._gridDirty = true; this._pendingImgRegion = null; this._pendingRegionLink = null; this._pendingGroupLink = null; this._pendingRegionDraw = null; this._pendingSourceRegion = null; try { this._closeRegionChoice(); } catch (_e) {} // undo/redo replaced the scene → cache + index + pending region/group/draw/source state stale (F2/C3/round-5 B/D/F)
    this._committed = json; this.selected.clear(); if (this.editingId) { try { this._ta && this._ta.remove(); } catch (_e) {} this.editingId = null; this._ta = null; }
    this.dirty = true;
    if (this.rec && !this.destroyed) {
      // F6: before the backing exists, route the save through saveNow (which materializes the backing) so undo/redo never
      // writes the scene to the HOST body (re-cluttering the note); otherwise persist directly.
      if (this._pendingBacking && !this._isBacking) this.scheduleSave();
      else this.saveNow(); // route through the single-flight guard so undo/redo never overlaps a chunked save (Manifest/Chunks desync)
      this._scheduleBannerText();
    }
  }
  undo() { if (!this._undo.length) return; this._redo.push(this._snapshot()); this._restore(this._undo.pop()); }
  redo() { if (!this._redo.length) return; this._undo.push(this._snapshot()); this._restore(this._redo.pop()); }
  // SESSION/DOCUMENT SPLIT: the camera is SESSION state, not document state — persist it locally (per drawing) and
  // do NOT save the whole synced scene on every pan/zoom (the biggest write-amplification source). It still rides
  // in appState on the next real EDIT save as a cross-device fallback; loadOrInit prefers the local value.
  _saveCamera() {
    this._lastCamChange = this._now();
    this.scene.appState.scroll = { x: this.camera.x, y: this.camera.y }; this.scene.appState.zoom = this.camera.zoom;
    try { if (this.recordGuid) localStorage.setItem('plexus_cam_' + this.recordGuid, JSON.stringify({ x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom })); } catch (_e) {}
  }
  // UX-6: is the live Thymer theme dark? Reads a background token's luminance (works across ALL themes, not just a
  // named light/dark). Cached 500ms so it's not a per-frame getComputedStyle. Recomputes after a theme switch.
  _themeDark() {
    const t = Date.now();
    if (this._darkCacheT && t - this._darkCacheT < 500) return this._darkCache;
    let dark = false;
    try {
      const cs = getComputedStyle(this.host || this.wrap || document.body);
      const bg = (cs.getPropertyValue('--cards-bg') || cs.getPropertyValue('--color-bg-900') || cs.getPropertyValue('--color-bg-700') || '').trim();
      const L = _cssLum(bg); if (L != null) dark = L < 0.5;
      // cache the live theme card-surface so the canvas record/line cards match the whiteboard (instead of a fixed navy)
      if (bg && !/^var\(/.test(bg) && _cssLum(bg) != null) this._cardSurface = bg;
    } catch (_e) {}
    this._darkCache = dark; this._darkCacheT = t; return dark;
  }
  render() {
    if (this.destroyed || !this.staticCv) return;
    if (this._camAnim) this._stepCamAnim(); // advance the cinematic camera tween before drawing this frame
    this._syncPropPanel();
    // UX-6: dark mode AUTO-follows the live Thymer theme (so switching theme adjusts the canvas, strokes, icons,
    // and the theme-tokened modals together). The `darkMode` setting, if on, is a force-dark override.
    const dark = !!(this.plugin._settings && this.plugin._settings.darkMode) || this._themeDark();
    PXC_DARK = dark; // module flag read by adaptInk() in the ink painters this frame
    if (this.wrap) this.wrap.classList.toggle('pxc-dark', dark);
    const z = this.camera.zoom, d = this.dpr;
    const sctx = this.staticCv.getContext('2d');
    const glMode = this.renderer && this.renderer.kind === 'webgl'; // WebGL backend: the GL canvas BEHIND paints the bg+images
    // PERF (element drag): movers draw on the lightweight iCv OVERLAY; the heavy STATIC canvas is FROZEN once built and
    // left untouched — so the GPU re-uploads only the small overlay each frame, not the big scene canvas. (The trace
    // pinned the lag to ~28ms presentation/composite from re-blitting staticCv every frame.) movers = selection ∪ bound
    // arrows; a FRAME drag (carries its contents) → _dragMovers()=null → normal full render. _dragLayerValid resets on end.
    const dragMovers = (this._elDrag && this.selected.size && !glMode) ? this._dragMovers() : null;
    const dragIds = dragMovers ? new Set(dragMovers.map((e) => e.id)) : null;
    const frozenDrag = !!(dragMovers && this._dragLayerValid); // staticCv already holds the static scene → don't touch it
    const P = this._renderPad || 0;
    // COMPOSITOR PAN: while actively panning at a fixed zoom, translate the pre-rendered OVERSIZED static layer on the GPU
    // compositor — ZERO scene work per frame, so a 100K-shape board pans exactly as smoothly as one image. Re-raster only when
    // the pan nears the pad edge (|d|>0.8P) or stops. The overlay (handles/selection) still redraws below, so it tracks the pan.
    let compositorPan = false;
    const rc = this._staticRasterCam;
    if (this._panMode && !frozenDrag && !dragMovers && !glMode && P > 0 && rc && rc.zoom === z) {
      const dx = (rc.x - this.camera.x) * z, dy = (rc.y - this.camera.y) * z;
      if (Math.abs(dx) <= P * 0.8 && Math.abs(dy) <= P * 0.8) { this.staticCv.style.transform = 'translate3d(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px,0)'; compositorPan = true; }
    }
    if (!compositorPan && !frozenDrag) {
      // FULL RASTER into the OVERSIZED staticCv (viewport + pad P each side) at the current camera; reset the CSS transform.
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      if (glMode) { sctx.clearRect(0, 0, this.staticCv.width, this.staticCv.height); }
      else { sctx.fillStyle = dark ? '#0f1117' : ((this.scene.appState && this.scene.appState.viewBackgroundColor) || '#ffffff'); sctx.fillRect(0, 0, this.staticCv.width, this.staticCv.height); }
      this.staticCv.style.transform = ''; // ALWAYS clear a leaked pan transform when rebuilding the static layer — else an element-drag (dragMovers) freezes the shifted layer (HIGH: review). Only the rasterCam write is drag-gated.
      if (!dragMovers) this._staticRasterCam = { x: this.camera.x, y: this.camera.y, zoom: z }; // the layer now matches the camera → translate from here
      this.renderer.begin(sctx, this.camera, d, P); // +P offset draws into the oversized canvas (positioned at -P → net on-screen unchanged)
      this.renderer.grid();
      const m = (this.plugin._settings && this.plugin._settings.cullMargin != null) ? this.plugin._settings.cullMargin : 80;
      const pw = P / z, vx0 = this.camera.x - pw - m, vy0 = this.camera.y - pw - m, vx1 = this.camera.x + (this.cssW + P) / z + m, vy1 = this.camera.y + (this.cssH + P) / z + m; // cull the PADDED region (fills the oversized canvas)
      const inView = (el) => { const x0 = Math.min(el.x, el.x + (el.width || 0)), y0 = Math.min(el.y, el.y + (el.height || 0)), x1 = Math.max(el.x, el.x + (el.width || 0)), y1 = Math.max(el.y, el.y + (el.height || 0)); return x1 >= vx0 && x0 <= vx1 && y1 >= vy0 && y0 <= vy1; };
      this._ensureGrid();
      const cand = this._grid.query(vx0, vy0, vx1 - vx0, vy1 - vy0); // O(visible) — independent of total scene size, so the re-raster stays cheap at 100K
      if (this.selected.size) { const have = new Set(); for (const e of cand) have.add(e.id); for (const id of this.selected) { const e = this._byId(id); if (e && !e.secHidden && !have.has(e.id)) cand.push(e); } } // SECTIONS: never force-push a collapsed-section child past the cull (else Select-All would reveal hidden contents)
      const zi = this._zIndex; cand.sort((a, b) => (zi.get(a.id) || 0) - (zi.get(b.id) || 0));
      const ex = dragIds; let drawn = 0;
      for (const el of cand) { if (el.isDeleted || el.type !== 'frame') continue; if (ex && ex.has(el.id)) continue; if (!inView(el)) continue; this.renderer.frame(el); } // frames behind everything
      for (const el of cand) { if (el.isDeleted || el.mmHidden || el.id === this.editingId || el.type === 'frame') continue; if (ex && ex.has(el.id)) continue; if (!inView(el)) continue; drawn++; this.renderer.element(el); }
      this._drawnCount = drawn;
      if (!dragMovers) this.renderer.ghosts(); // while dragging, ghosts draw on iCv so they track live
      this.renderer.end();
      if (dragMovers) this._dragLayerValid = true;
    }
    // interactive layer — the moving elements (during a drag) + selection / transform handles
    const ictx = this.iCv.getContext('2d');
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.clearRect(0, 0, this.iCv.width, this.iCv.height);
    if (dragMovers) { // PERF: movers + ghosts ride the lightweight overlay (camera space), UNDER the handles drawn below
      this.renderer.begin(ictx, this.camera, d);
      for (const el of dragMovers) { if (!el.isDeleted && el.type === 'frame') this.renderer.frame(el); }
      for (const el of dragMovers) { if (!el.isDeleted && el.type !== 'frame' && el.id !== this.editingId && !el.mmHidden) this.renderer.element(el); }
      this.renderer.ghosts(); this.renderer.end();
      ictx.setTransform(1, 0, 0, 1, 0, 0); // reset for the handle/overlay blocks below
    }
    if (this._pendingRegionLink) { // F2: a connection was dropped on this image/shape → outline it cyan, "mark a region here"
      const rel = this._byId(this._pendingRegionLink.elId);
      if (rel && !rel.isDeleted) { const b = this._elBBox(rel); if (b) { ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d); ictx.fillStyle = 'rgba(14,165,233,0.06)'; ictx.fillRect(b.x, b.y, b.w, b.h); ictx.strokeStyle = '#0ea5e9'; ictx.lineWidth = 2 / z; ictx.setLineDash([8 / z, 5 / z]); ictx.strokeRect(b.x - 2 / z, b.y - 2 / z, b.w + 4 / z, b.h + 4 / z); ictx.setLineDash([]); ictx.setTransform(1, 0, 0, 1, 0, 0); } }
      else this._pendingRegionLink = null;
    }
    if (this._cropRect) {
      const r = this._cropRect, regionMode = !!this._pendingRegionLink; // F2: region-mark marquee is cyan (matches the connection/region theme); crop stays amber
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      ictx.fillStyle = regionMode ? 'rgba(14,165,233,0.14)' : 'rgba(245,158,11,0.12)'; ictx.fillRect(r.x, r.y, r.w, r.h);
      ictx.strokeStyle = regionMode ? '#0ea5e9' : '#f59e0b'; ictx.lineWidth = 1.4 / z; ictx.setLineDash([6 / z, 4 / z]);
      ictx.strokeRect(r.x, r.y, r.w, r.h); ictx.setLineDash([]);
      ictx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this._lasso && this._lasso.length > 1) { // lasso select loop — accent fill + dashed outline
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      ictx.beginPath(); ictx.moveTo(this._lasso[0][0], this._lasso[0][1]);
      for (let i = 1; i < this._lasso.length; i++) ictx.lineTo(this._lasso[i][0], this._lasso[i][1]);
      ictx.closePath();
      ictx.fillStyle = 'rgba(124,92,255,0.10)'; ictx.fill();
      ictx.strokeStyle = '#7c5cff'; ictx.lineWidth = 1.5 / z; ictx.setLineDash([6 / z, 4 / z]); ictx.stroke(); ictx.setLineDash([]);
      ictx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this._pendingImgRegion) { // a region marked for citing — live accent quad over the image (rotation-aware)
      const pimg = this._byId(this._pendingImgRegion.imgId);
      if (pimg && !pimg.isDeleted) {
        const q = this._regionShapeWorld(pimg, this._pendingImgRegion.frac, this._pendingImgRegion.fracPoly);
        if (q && q.length) { ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d); ictx.beginPath(); ictx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ictx.lineTo(q[i].x, q[i].y); ictx.closePath(); ictx.fillStyle = 'rgba(124,92,255,0.14)'; ictx.fill(); ictx.strokeStyle = '#7c5cff'; ictx.lineWidth = 1.8 / z; ictx.setLineDash([7 / z, 4 / z]); ictx.stroke(); ictx.setLineDash([]); ictx.setTransform(1, 0, 0, 1, 0, 0); }
      } else { this._pendingImgRegion = null; }
    }
    // CONNECTIONS Phase 4: persistent overlay for line/region connection targets — a little blue flag on every targeted body
    // line + a cyan outline on every bound image region. CANVAS-OVERLAY ONLY (zero source-note mutation), world-space so it
    // tracks the card/image live; the note's source line independently gets the ↗ via _reindexBackrefs (keyed by lineGuid).
    if ((this._connLineTargets && this._connLineTargets.size) || (this._connRegionTargets && this._connRegionTargets.size) || (this._connRefTargets && this._connRefTargets.size) || (this._connGroupTargets && this._connGroupTargets.length)) {
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      if (this._connGroupTargets) for (const grp of this._connGroupTargets) { // round-5 B: dashed cyan outline on every member + image region of a group connection target + a faint hull
        let hx0 = Infinity, hy0 = Infinity, hx1 = -Infinity, hy1 = -Infinity; // resolve members ONCE; union the SAME bboxes for the hull
        const acc = (bx, by, bw, bh) => { hx0 = Math.min(hx0, bx); hy0 = Math.min(hy0, by); hx1 = Math.max(hx1, bx + bw); hy1 = Math.max(hy1, by + bh); };
        ictx.setLineDash([6 / z, 4 / z]); ictx.strokeStyle = '#06b6d4'; ictx.lineWidth = 1.4 / z;
        for (const id of (grp.ids || [])) { const ge = this._byId(id); if (!ge || ge.isDeleted) continue; let bb = this._elBBox(ge); if (!bb || !isFinite(bb.x)) continue; if (ge.angle) bb = rotatedAABB(bb, ge.angle); ictx.strokeRect(bb.x - 2 / z, bb.y - 2 / z, bb.w + 4 / z, bb.h + 4 / z); acc(bb.x, bb.y, bb.w, bb.h); }
        for (const rg of (grp.regions || [])) {
          if (rg.worldPoly && rg.worldPoly.length >= 3) { ictx.beginPath(); ictx.moveTo(rg.worldPoly[0][0], rg.worldPoly[0][1]); for (let i = 1; i < rg.worldPoly.length; i++) ictx.lineTo(rg.worldPoly[i][0], rg.worldPoly[i][1]); ictx.closePath(); ictx.stroke(); const wb = this._polyBBox(rg.worldPoly); if (wb) acc(wb.x, wb.y, wb.w, wb.h); continue; } // round-5 D: free-space region polygon
          const ge = this._byId(rg.elId); if (!ge || ge.isDeleted) continue; const q = this._regionShapeWorld(ge, rg.frac, rg.fracPoly); if (!q || !q.length) continue; ictx.beginPath(); ictx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ictx.lineTo(q[i].x, q[i].y); ictx.closePath(); ictx.stroke(); const rw = this._imgRegionWorld(ge, rg.frac); if (rw) acc(rw.x, rw.y, rw.w, rw.h);
        }
        if (isFinite(hx0)) { ictx.setLineDash([2 / z, 5 / z]); ictx.strokeStyle = 'rgba(6,182,212,0.5)'; ictx.lineWidth = 1.2 / z; ictx.strokeRect(hx0 - 6 / z, hy0 - 6 / z, (hx1 - hx0) + 12 / z, (hy1 - hy0) + 12 / z); }
        ictx.setLineDash([]);
      }
      if (this._connRefTargets) for (const [textId, set] of this._connRefTargets) { // round-5 A: cyan flag + underline tint on every targeted inline ref run of a text note
        const el = this._byId(textId); if (!el || el.isDeleted || el.type !== 'text') continue;
        for (const g of set) {
          const rr = this._refRunRectWorld(el, g); if (!rr) continue;
          ictx.fillStyle = 'rgba(6,182,212,0.12)'; ictx.fillRect(rr.x, rr.y, rr.w, rr.h);
          const fx = rr.x, fy = rr.y + rr.h + 1.5, ph = 9; // little flag hanging just under the targeted run
          ictx.fillStyle = '#06b6d4'; ictx.fillRect(fx, fy, 1.6, ph);
          ictx.beginPath(); ictx.moveTo(fx + 1.6, fy); ictx.lineTo(fx + 7.5, fy + 3); ictx.lineTo(fx + 1.6, fy + 6); ictx.closePath(); ictx.fill();
        }
      }
      if (this._connLineTargets) for (const [cardId, set] of this._connLineTargets) {
        const el = this._byId(cardId); if (!el || el.isDeleted || el.type !== 'record') continue;
        for (const lg of set) {
          const lr = this._lineRectWorld(el, lg); if (!lr) continue;
          ictx.fillStyle = 'rgba(14,165,233,0.10)'; ictx.fillRect(lr.x, lr.y, lr.w, lr.h); // subtle band tint on the targeted line
          const fx = lr.x + 6, fy = lr.y + 2, ph = Math.min(12, Math.max(8, lr.h - 2)); // little flag: pole + pennant, between the accent stripe and the marker dot
          ictx.fillStyle = '#0ea5e9'; ictx.fillRect(fx, fy, 1.6, ph);
          ictx.beginPath(); ictx.moveTo(fx + 1.6, fy); ictx.lineTo(fx + 7.5, fy + 3); ictx.lineTo(fx + 1.6, fy + 6); ictx.closePath(); ictx.fill();
        }
      }
      if (this._connRegionTargets) for (const [imgId, regs] of this._connRegionTargets) {
        const el = this._byId(imgId); if (!el || el.isDeleted || (el.type !== 'image' && !isRoughShape(el.type))) continue; // F2: region targets on an image OR a rough shape
        for (const rg of regs) {
          const q = this._regionShapeWorld(el, rg.frac, rg.fracPoly); if (!q || !q.length) continue;
          ictx.beginPath(); ictx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ictx.lineTo(q[i].x, q[i].y); ictx.closePath();
          ictx.fillStyle = 'rgba(14,165,233,0.10)'; ictx.fill(); ictx.strokeStyle = '#0ea5e9'; ictx.lineWidth = 1.6 / z; ictx.stroke();
        }
      }
      ictx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // CONNECTIONS Phase 5: select ONE element → softly glow every connection attached to it + a count chip, so you can SEE
    // what a card connects to at a glance (canvas-side; the note side has the ↗). O(1) lookup via the prebuilt _connByEl index.
    if (this.tool === 'select' && !this.editingId && !this._camAnim && this.selected.size === 1 && this._connByEl && this._connByEl.size) {
      const selId = this.selected.values().next().value, arrowIds = this._connByEl.get(selId);
      if (arrowIds && arrowIds.size) {
        ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
        ictx.lineCap = 'round'; ictx.lineJoin = 'round'; ictx.strokeStyle = 'rgba(124,92,255,0.32)';
        for (const aid of arrowIds) { const a = this._byId(aid); if (!a || a.isDeleted) continue; const pts = routedPoints(a); if (!pts || pts.length < 2) continue; ictx.lineWidth = ((a.strokeWidth || 2) + 6) / z; ictx.beginPath(); ictx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ictx.lineTo(pts[i][0], pts[i][1]); ictx.stroke(); }
        ictx.lineCap = 'butt'; ictx.lineJoin = 'miter'; ictx.setTransform(1, 0, 0, 1, 0, 0);
        const sel = this._byId(selId), bb = sel ? this._elBBox(sel) : null; // count chip at the element's top-right (screen space)
        if (bb) { const sp = this.camera.worldToScreen(bb.x + bb.w, bb.y), txt = '⇄ ' + arrowIds.size; ictx.font = '600 ' + (11 * d) + 'px system-ui, sans-serif'; const pad = 5 * d, ch = 17 * d, cw = ictx.measureText(txt).width + pad * 2, rx = sp.x * d - cw + 3 * d, ry = sp.y * d - ch - 3 * d; ictx.beginPath(); if (ictx.roundRect) ictx.roundRect(rx, ry, cw, ch, 8 * d); else ictx.rect(rx, ry, cw, ch); ictx.fillStyle = '#7c5cff'; ictx.fill(); ictx.fillStyle = '#fff'; ictx.textAlign = 'left'; ictx.textBaseline = 'middle'; ictx.fillText(txt, rx + pad, ry + ch / 2 + 0.5 * d); ictx.textBaseline = 'alphabetic'; }
      }
    }
    try { this._syncConnInfo(); } catch (_e) {} // C2 (round 3): the on-canvas connection info card (source / direction / thumbnail) on hover or single-select
    try { this._syncConnStyle(); } catch (_e) {} // round-5 C: the connection-style popover (typed relationship presets + line style + arrowheads + colour) on single-select
    try { this._syncRecPanel(); } catch (_e) {} // EDIT-1: the editable record-card property panel (view/edit typed properties · Move…) on single-select of a record card
    try { this._syncDcOverlay(); } catch (_e) {} // EDIT-4: the live interactive Datacore view over a selected dc: query node
    if (this._bindHover && !this._bindHover.isDeleted) { // CP-5: dashed focus indicator on the shape an arrow will bind to
      const s = this._bindHover, sub = this._bindHoverSub;
      ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      ictx.lineWidth = 2 / z; ictx.setLineDash([7 / z, 4 / z]);
      let drew = false; // Phase 4: outline the LINE BAND / image REGION when releasing here targets one, else the whole element
      if (sub && sub.lineGuid) { const lr = this._lineRectWorld(s, sub.lineGuid); if (lr) { ictx.fillStyle = 'rgba(14,165,233,0.14)'; ictx.fillRect(lr.x, lr.y, lr.w, lr.h); ictx.strokeStyle = '#0ea5e9'; ictx.strokeRect(lr.x + 0.5 / z, lr.y, lr.w - 1 / z, lr.h); drew = true; } }
      else if (sub && sub.refGuidTarget) { const rr = this._refRunRectWorld(s, sub.refGuidTarget); if (rr) { ictx.fillStyle = 'rgba(6,182,212,0.16)'; ictx.fillRect(rr.x, rr.y, rr.w, rr.h); ictx.strokeStyle = '#06b6d4'; ictx.strokeRect(rr.x + 0.5 / z, rr.y, rr.w - 1 / z, rr.h); drew = true; } } // round-5 A: outline the inline ref run the end will bind to
      else if (sub && sub.frac) { const q = this._regionShapeWorld(s, sub.frac, sub.fracPoly); if (q && q.length) { ictx.beginPath(); ictx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ictx.lineTo(q[i].x, q[i].y); ictx.closePath(); ictx.fillStyle = 'rgba(14,165,233,0.14)'; ictx.fill(); ictx.strokeStyle = '#0ea5e9'; ictx.stroke(); drew = true; } }
      if (!drew) { ictx.strokeStyle = '#7c5cff'; ictx.strokeRect(Math.min(s.x, s.x + s.width) - 3, Math.min(s.y, s.y + s.height) - 3, Math.abs(s.width) + 6, Math.abs(s.height) + 6); }
      ictx.setLineDash([]); ictx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this._connHover && !this._connHover.isDeleted && this.tool === 'select' && !this.editingId) { // CONNECT: edge nubs on the hovered element — drag one to draw a bound connection. Gated on select-mode + not-editing so a stale hover never paints phantom nubs (review 2a/2b).
      ictx.setTransform(1, 0, 0, 1, 0, 0); const r = 4.5 * d;
      for (const n of this._connNubsFor(this._connHover)) { const s = this.camera.worldToScreen(n.x, n.y); ictx.beginPath(); ictx.arc(s.x * d, s.y * d, r, 0, 7); ictx.fillStyle = '#7c5cff'; ictx.fill(); ictx.lineWidth = 1.5 * d; ictx.strokeStyle = '#fff'; ictx.stroke(); }
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
    // Cross-ref ↗ pins — one per cited line. An in-image region pin sits ON its region (tracks the image as it
    // moves/resizes/rotates); a whole-element cite sits at the element corner. Hit-targets stored for click-to-note.
    this._xrefPins = [];
    if (this._xrefCites && this._xrefCites.length) {
      ictx.setTransform(1, 0, 0, 1, 0, 0);
      ictx.font = (11 * d) + 'px system-ui, sans-serif'; ictx.textAlign = 'center'; ictx.textBaseline = 'middle';
      for (const cite of this._xrefCites) {
        // ONE pin per citation — positioned at the PRIMARY (first) target's top-right corner so it sits ON the
        // selection, not at the far union corner of a sprawling composite. Count badge when it spans >1 live target;
        // clicking flashes them all.
        let n = 0, primB = null;
        for (const tg of cite.targets) {
          const el = this._byId(tg.el); if (!el || el.isDeleted) continue;
          let b = null;
          if (tg.inImage && tg.frac) { const q = this._regionShapeWorld(el, tg.frac, tg.fracPoly); if (q && q.length) b = this._polyBBox(q); }
          if (!b) b = this._elBBox(el);
          if (!b || !isFinite(b.x)) continue;
          n++; if (!primB) primB = b; // first resolvable target = primary → anchor the pin here
        }
        if (!n || !primB) continue;
        const p = this.camera.worldToScreen(primB.x + primB.w, primB.y), cx = p.x * d, cy = p.y * d, rr = 8.5 * d;
        ictx.beginPath(); ictx.arc(cx, cy, rr, 0, 7); ictx.fillStyle = 'rgba(124,92,255,0.94)'; ictx.fill();
        ictx.lineWidth = 1.5 * d; ictx.strokeStyle = 'rgba(255,255,255,0.85)'; ictx.stroke();
        ictx.fillStyle = '#fff'; ictx.fillText('↗', cx, cy);
        if (n > 1) { // count badge for a multi-target (composite) cite
          const bx = cx + rr * 0.82, by = cy - rr * 0.82, br = 6 * d;
          ictx.beginPath(); ictx.arc(bx, by, br, 0, 7); ictx.fillStyle = '#fff'; ictx.fill(); ictx.lineWidth = 1.2 * d; ictx.strokeStyle = 'rgba(124,92,255,0.95)'; ictx.stroke();
          ictx.fillStyle = '#7c5cff'; ictx.font = '700 ' + (8 * d) + 'px system-ui, sans-serif'; ictx.fillText(String(n), bx, by); ictx.font = (11 * d) + 'px system-ui, sans-serif';
        }
        this._xrefPins.push({ x: p.x, y: p.y, r: 11, lineGuid: cite.lineGuid });
      }
      ictx.textAlign = 'left'; ictx.textBaseline = 'alphabetic';
    }
    // Flash — a fast, attention-grabbing pulse on a navigated cross-ref target. For an in-image region:
    // SPOTLIGHT (dim the rest, region stays lit) + a glowing accent ring, recomputed LIVE so it tracks the image.
    if (this._flash) {
      const fnow = this._now();
      const t = (fnow - this._flash.start) / this._flash.dur;
      if (t >= 1) { this._flash = null; }
      else {
        const items = this._flash.items || (this._flash.bbox ? [this._flash] : []); // back-compat with legacy single-item
        const pulses = 2, tp = (t * pulses) % 1, ease = 1 - Math.pow(1 - tp, 3);
        ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.save();
        // Resolve each item's CURRENT screen shape (freehand polygon for in-image, padded rrect for a bbox).
        const shapes = [];
        for (const it of items) {
          if (it.inImage && it.elId) { const fEl = this._byId(it.elId); const sh = (fEl && it.frac) ? this._regionShapeWorld(fEl, it.frac, it.fracPoly) : null; if (sh && sh.length) { shapes.push({ poly: sh.map((pt) => { const s = this.camera.worldToScreen(pt.x, pt.y); return { x: s.x * d, y: s.y * d }; }) }); continue; } }
          if (it.worldPoly && it.worldPoly.length >= 3) { shapes.push({ poly: it.worldPoly.map((p) => { const s = this.camera.worldToScreen(p[0], p[1]); return { x: s.x * d, y: s.y * d }; }) }); continue; } // round-5 D: a free-space region → spotlight its absolute polygon
          const bb = it.bbox; if (!bb) continue;
          const tl = this.camera.worldToScreen(bb.x, bb.y), br = this.camera.worldToScreen(bb.x + bb.w, bb.y + bb.h), base = 7 * d;
          shapes.push({ rect: { x: tl.x * d - base, y: tl.y * d - base, w: (br.x - tl.x) * d + base * 2, h: (br.y - tl.y) * d + base * 2 } });
        }
        const pathOf = (sh) => { if (sh.poly) { ictx.beginPath(); ictx.moveTo(sh.poly[0].x, sh.poly[0].y); for (let i = 1; i < sh.poly.length; i++) ictx.lineTo(sh.poly[i].x, sh.poly[i].y); ictx.closePath(); } else { this._rrect(ictx, sh.rect.x, sh.rect.y, sh.rect.w, sh.rect.h, 9 * d); } };
        // SPOTLIGHT: one viewport dim, punch out EVERY cited shape together.
        const dimA = 0.6 * Math.min(1, t * 5) * (1 - Math.max(0, (t - 0.45) / 0.55));
        if (dimA > 0.01 && shapes.length) { ictx.save(); ictx.fillStyle = 'rgba(13,15,23,' + dimA + ')'; ictx.fillRect(0, 0, this.iCv.width, this.iCv.height); ictx.globalCompositeOperation = 'destination-out'; for (const sh of shapes) { pathOf(sh); ictx.fill(); } ictx.restore(); }
        // GLOW: an outer bloom ring + inner accent + crisp highlight per cited shape, 2 quick pulses.
        const ringA = Math.max(0, (1 - tp) * (1 - t * 0.2));
        for (const sh of shapes) {
          pathOf(sh); ictx.strokeStyle = 'rgba(124,92,255,' + (ringA * 0.55) + ')'; ictx.lineWidth = (7 + ease * 6) * d; ictx.shadowColor = 'rgba(124,92,255,1)'; ictx.shadowBlur = 34 * d * (1 - tp * 0.6); ictx.stroke();
          pathOf(sh); ictx.strokeStyle = 'rgba(124,92,255,' + ringA + ')'; ictx.lineWidth = (3 + ease * 2) * d; ictx.shadowBlur = 22 * d * (1 - tp); ictx.stroke();
          ictx.shadowBlur = 0; ictx.lineWidth = 2 * d; ictx.strokeStyle = 'rgba(210,196,255,' + Math.max(0, 0.95 * (1 - t)) + ')'; pathOf(sh); ictx.stroke();
        }
        ictx.restore();
        this.dirty = true;
      }
    }
    // round-5 F: a pending SOURCE region ("Connect from a region") shows its outline + GREEN connect nubs — drag a nub to start a
    // connection FROM the region. Rendered regardless of selection (a source region has no selected element). Nubs stored for onDown.
    if (this._pendingSourceRegion && this._pendingSourceRegion.region) {
      const sr = this._pendingSourceRegion.region; let bbox = null, outline = null;
      if (sr.worldPoly && sr.worldPoly.length >= 3) { bbox = this._polyBBox(sr.worldPoly); outline = sr.worldPoly.map(([x, y]) => ({ x, y })); }
      else if (sr.elId) { const im = this._byId(sr.elId); if (im && !im.isDeleted) { bbox = this._imgRegionWorld(im, sr.frac); const q = this._regionShapeWorld(im, sr.frac, sr.fracPoly); if (q && q.length) outline = q; } }
      if (bbox && isFinite(bbox.x)) {
        ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
        if (outline && outline.length) { ictx.setLineDash([6 / z, 4 / z]); ictx.strokeStyle = '#10b981'; ictx.lineWidth = 1.6 / z; ictx.beginPath(); ictx.moveTo(outline[0].x, outline[0].y); for (let i = 1; i < outline.length; i++) ictx.lineTo(outline[i].x, outline[i].y); ictx.closePath(); ictx.stroke(); ictx.setLineDash([]); }
        const nubs = this._connNubsFor({ x: bbox.x, y: bbox.y, width: bbox.w, height: bbox.h }); this._pendingSourceRegion.nubs = nubs;
        ictx.setTransform(1, 0, 0, 1, 0, 0); const rr2 = 5 * d;
        for (const n of nubs) { const s = this.camera.worldToScreen(n.x, n.y); ictx.beginPath(); ictx.arc(s.x * d, s.y * d, rr2, 0, 7); ictx.fillStyle = '#10b981'; ictx.fill(); ictx.lineWidth = 1.5 * d; ictx.strokeStyle = '#fff'; ictx.stroke(); }
        ictx.setTransform(1, 0, 0, 1, 0, 0);
      } else { this._pendingSourceRegion.nubs = null; }
    }
    this._groupNubs = null; this._groupNubIds = null; // round-5 B: recomputed below only for a ≥2 multi-selection
    if (!this.selected.size) return;
    ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
    ictx.strokeStyle = '#7c5cff'; ictx.fillStyle = '#ffffff'; ictx.lineWidth = 1.2 / z;
    const single = this._singleSel();
    if (single && (isRoughShape(single.type) || single.type === 'icon' || single.type === 'record' || single.type === 'linecard' || single.type === 'task' || single.type === 'image' || single.type === 'query' || single.type === 'rollup' || single.type === 'table' || single.type === 'board')) {
      const H = this._handles(single);
      ictx.setLineDash([]);
      // round-4: the selection OUTLINE hugs the actual shape (ellipse/diamond/triangle/…), not the bounding rectangle — so a
      // non-rectangular shape has no empty-corner "box". Resize/rotate HANDLES still sit on the bbox (H) for dragging.
      const _st = single.type, _cx = single.x + single.width / 2, _cy = single.y + single.height / 2, _a = single.angle || 0;
      if (_st === 'ellipse') { ictx.beginPath(); ictx.ellipse(_cx, _cy, Math.abs(single.width) / 2, Math.abs(single.height) / 2, _a, 0, Math.PI * 2); ictx.stroke(); }
      else if (_st === 'diamond' || _st === 'triangle' || _st === 'parallelogram' || _st === 'hexagon' || _st === 'cloud') {
        const poly = shapePolygon(single), _c = Math.cos(_a), _s = Math.sin(_a); ictx.beginPath();
        for (let i = 0; i < poly.length; i++) { const dx = poly[i][0] - _cx, dy = poly[i][1] - _cy, px = _cx + dx * _c - dy * _s, py = _cy + dx * _s + dy * _c; if (i === 0) ictx.moveTo(px, py); else ictx.lineTo(px, py); }
        ictx.closePath(); ictx.stroke();
      }
      else { ictx.beginPath(); ictx.moveTo(H.nw.x, H.nw.y); ictx.lineTo(H.ne.x, H.ne.y); ictx.lineTo(H.se.x, H.se.y); ictx.lineTo(H.sw.x, H.sw.y); ictx.closePath(); ictx.stroke(); } // rectangle / roundrect / cylinder / record / image / … keep the bbox outline (their visual IS the box)
      ictx.beginPath(); ictx.moveTo(H.n.x, H.n.y); ictx.lineTo(H.rot.x, H.rot.y); ictx.stroke();
      const hs = 8 / z;
      // round-4: for shapes whose OUTLINE hugs the visual (ellipse/diamond/…), drop the 4 CORNER handles — they sit out in the
      // empty corners and re-create the "box with empty space" the outline removed. Keep the 4 EDGE handles (which sit ON the
      // shape) + the rotate handle. Corner RESIZE still works (the hit-test keeps all 8); only the empty-corner dots are hidden.
      const _edgeOnly = (_st === 'ellipse' || _st === 'diamond' || _st === 'triangle' || _st === 'parallelogram' || _st === 'hexagon' || _st === 'cloud');
      for (const k of (_edgeOnly ? ['n', 'e', 's', 'w'] : HANDLE_KEYS)) { const p = H[k]; ictx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs); ictx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs); }
      ictx.beginPath(); ictx.arc(H.rot.x, H.rot.y, hs / 1.5, 0, 7); ictx.fill(); ictx.stroke();
    } else {
      ictx.setLineDash([6 / z, 4 / z]); const pad = 4 / z;
      for (const id of this.selected) { if (id === this.editingId) continue; const el = this._byId(id); if (!el) continue; const x = Math.min(el.x, el.x + el.width), y = Math.min(el.y, el.y + el.height); ictx.strokeRect(x - pad, y - pad, Math.abs(el.width) + pad * 2, Math.abs(el.height) + pad * 2); } // #6: don't double the textarea outline while editing
      ictx.setLineDash([]);
      // round-5 B (select-then-connect): a ≥2 multi-selection shows a faint hull + connect nubs — drag a nub → an arrow BOUND
      // to the whole group (group → anything). Reuses _connNubsFor on the selection's union bbox; nubs stored for onDown hit-test.
      const gsel = this._groupSelBBox();
      if (gsel && gsel.bb) { const bb = gsel.bb; ictx.setLineDash([2 / z, 5 / z]); ictx.strokeStyle = 'rgba(124,92,255,0.55)'; ictx.lineWidth = 1.2 / z; ictx.strokeRect(bb.x - 8 / z, bb.y - 8 / z, bb.w + 16 / z, bb.h + 16 / z); ictx.setLineDash([]);
        const nubs = this._connNubsFor({ x: bb.x, y: bb.y, width: bb.w, height: bb.h }); this._groupNubs = nubs; this._groupNubIds = gsel.ids;
        ictx.setTransform(1, 0, 0, 1, 0, 0); const rr = 5 * d;
        for (const n of nubs) { const s = this.camera.worldToScreen(n.x, n.y); ictx.beginPath(); ictx.arc(s.x * d, s.y * d, rr, 0, 7); ictx.fillStyle = '#7c5cff'; ictx.fill(); ictx.lineWidth = 1.5 * d; ictx.strokeStyle = '#fff'; ictx.stroke(); }
        ictx.setTransform(z * d, 0, 0, z * d, -this.camera.x * z * d, -this.camera.y * z * d);
      }
    }
    this._renderMinimap(ictx, d); // MINIMAP: radar overlay (auto-hidden when everything fits the viewport)
  }
  // MINIMAP — a corner radar of the whole scene + a draggable viewport rect; click/drag teleports the camera. Scene
  // DOTS are cached offscreen and rebuilt only on commit (_miniDirty); per-frame cost = blit + one viewport rect.
  _miniRect() { const w = 178, h = 116, mg = 14; return { x: Math.max(8, this.cssW - w - mg), y: Math.max(8, this.cssH - h - mg), w, h }; }
  _renderMinimap(ictx, d) {
    const st = this.plugin._settings || {};
    if (st.minimap === false || this._present || this.editingId) { this._miniMap = null; return; }
    const b = this._sceneBounds(); if (!b || !(b.w > 0) || !(b.h > 0)) { this._miniMap = null; return; }
    const camX = this.camera.x, camY = this.camera.y, vw = this.cssW / this.camera.zoom, vh = this.cssH / this.camera.zoom;
    const offscreen = b.x < camX - 1 || b.y < camY - 1 || b.x + b.w > camX + vw + 1 || b.y + b.h > camY + vh + 1;
    if (!offscreen) { this._miniMap = null; return; } // everything fits → no minimap
    const r = this._miniRect(), pad = 8, mapp = pxcMiniFit(b, r.w, r.h, pad); if (!mapp) { this._miniMap = null; return; }
    this._miniMap = { rect: r, map: mapp };
    ictx.setTransform(1, 0, 0, 1, 0, 0); ictx.save();
    ictx.globalAlpha = 0.93; ictx.fillStyle = PXC_DARK ? 'rgba(20,24,33,1)' : 'rgba(255,255,255,1)';
    ictx.beginPath(); if (ictx.roundRect) ictx.roundRect(r.x * d, r.y * d, r.w * d, r.h * d, 8 * d); else ictx.rect(r.x * d, r.y * d, r.w * d, r.h * d);
    ictx.fill(); ictx.lineWidth = 1 * d; ictx.strokeStyle = PXC_DARK ? '#333a4a' : '#d0d4dc'; ictx.stroke();
    const key = r.w + 'x' + r.h + '@' + Math.round(mapp.scale * 1e4);
    if (this._miniDirty || !this._miniDots || this._miniKey !== key) { this._rebuildMiniDots(r, mapp, d); this._miniDirty = false; this._miniKey = key; }
    ictx.save(); ictx.beginPath(); if (ictx.roundRect) ictx.roundRect(r.x * d, r.y * d, r.w * d, r.h * d, 8 * d); else ictx.rect(r.x * d, r.y * d, r.w * d, r.h * d); ictx.clip(); // clip dots AND viewport rect to the panel (the rect can fall outside when panned away)
    if (this._miniDots) ictx.drawImage(this._miniDots, r.x * d, r.y * d);
    const vx = r.x + mapp.ox + camX * mapp.scale, vy = r.y + mapp.oy + camY * mapp.scale;
    ictx.lineWidth = 1.5 * d; ictx.strokeStyle = '#7c5cff'; ictx.fillStyle = 'rgba(124,92,255,0.14)';
    ictx.fillRect(vx * d, vy * d, vw * mapp.scale * d, vh * mapp.scale * d); ictx.strokeRect(vx * d, vy * d, vw * mapp.scale * d, vh * mapp.scale * d);
    ictx.restore();
    ictx.restore();
  }
  _rebuildMiniDots(r, mapp, d) {
    const cv = this._miniDots || (this._miniDots = document.createElement('canvas'));
    cv.width = Math.max(1, Math.ceil(r.w * d)); cv.height = Math.max(1, Math.ceil(r.h * d));
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.w, r.h); c.globalAlpha = 0.62;
    let n = 0; const cap = 4000;
    for (const el of this.scene.elements) { if (el.isDeleted || el.secHidden) continue; if (++n > cap) break;
      const x = mapp.ox + (el.x || 0) * mapp.scale, y = mapp.oy + (el.y || 0) * mapp.scale;
      const w = Math.max(1.4, Math.abs(el.width || 0) * mapp.scale), h = Math.max(1.4, Math.abs(el.height || 0) * mapp.scale);
      c.fillStyle = el.type === 'frame' ? 'rgba(154,160,166,0.7)' : (el.strokeColor || '#7c5cff');
      c.fillRect(x, y, w, h);
    }
  }
  _miniTeleport(px, py) {
    const mm = this._miniMap; if (!mm) return; const r = mm.rect, mapp = mm.map;
    const wx = (px - r.x - mapp.ox) / mapp.scale, wy = (py - r.y - mapp.oy) / mapp.scale;
    this.camera.x = wx - (this.cssW / this.camera.zoom) / 2; this.camera.y = wy - (this.cssH / this.camera.zoom) / 2;
    this._lastCamChange = this._now(); this.dirty = true; this._saveCamera();
  }
  _miniHit(px, py) { const mm = this._miniMap; if (!mm) return false; const r = mm.rect; return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
  scheduleSave() {
    this._miniDirty = true; // MINIMAP: scene changed → rebuild dot cache on next paint
    this._cacheValid = false; this._gridDirty = true; // content changed → rebuild render cache + spatial index lazily
    try { this._updateBindings(); } catch (_e) {} // CONNECTIONS: settle arrow/label bindings + free any dangling midBinding BEFORE the snapshot — so the saved geometry matches the display (no orphan label at a dead midpoint after a connector delete; chained-arrow positions settled on drop; no display≠saved divergence). Cheap: _updateBindings early-returns when nothing is bound.
    // edit save: record an undo step (push the prior committed state, snapshot the new one)
    if (this._committed !== undefined) { this._undo.push(this._committed); this._trimUndo(); this._redo = []; }
    this._committed = this._snapshot();
    if (this._saveTimer) clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.saveNow(), 700);
    this._scheduleBannerText(); // O(n) banner+text refresh, debounced off the durable-save path
  }
  // Cosmetic + search-only mirror (Canvas Text prop + banner PNG), DEBOUNCED off the durable save so it doesn't amplify
  // writes. Guarded; _btTimer cleared in destroy(). (Regression fix: scheduleSave/saveScene/settings all call this, but
  // the definition had gone missing → "this._scheduleBannerText is not a function" thrown on every save.)
  _scheduleBannerText() {
    if (this._btTimer) clearTimeout(this._btTimer);
    this._btTimer = setTimeout(() => {
      this._btTimer = null;
      if (this.destroyed || !this.rec) return;
      try { _writeBannerTextInline(this.plugin, this.rec, this.scene); } catch (_e) {}
    }, 1200);
  }
  // Bound undo RAM by BYTES, not a flat count — 80 full-scene snapshots of a 5 MB scene was ~400 MB. Keep the most
  // recent steps under a memory cap (always keep ≥1 so a single undo always works). Snapshots stay atomic + correct
  // (whole-scene strings); we deliberately did NOT adopt a cross-blob op-log (it trades the synced blob's atomic
  // last-writer-wins for a fast-but-non-atomic write — an unproven latency win; see architecture audit).
  _trimUndo() {
    const MAX_BYTES = 48 * 1024 * 1024, MAX_STEPS = 200;
    let bytes = 0; for (const s of this._undo) bytes += (s ? s.length : 0);
    while (this._undo.length > 1 && (bytes > MAX_BYTES || this._undo.length > MAX_STEPS)) { bytes -= (this._undo[0] ? this._undo[0].length : 0); this._undo.shift(); }
  }
  async saveNow() {
    if (!this.rec || this.destroyed) return null;
    // SCALE Phase 3 MUST-FIX (chunk review): SINGLE-FLIGHT. Two overlapping chunked saves both read prevManifest rev=N,
    // both bump to N+1, and each prunes Chunks to its OWN set → the Manifest can point at a guid the other already pruned →
    // a missing chunk → fallback to a stale Scene checkpoint = silent loss. Reachable single-client (undo within the save
    // debounce). So: only one save runs at a time; a save requested mid-flight COALESCES (re-schedules) instead of overlapping.
    // Guard is keyed by the backing RECORD (plugin-level), not just this view — so two panels open on the SAME drawing
    // also serialize (chunking's split Manifest/Chunks state is not atomic across concurrent writers like the single blob was).
    const recKey = this.recordGuid, inflight = (this.plugin._saveInflightRecs || (this.plugin._saveInflightRecs = new Set()));
    if (this._saveInflight || inflight.has(recKey)) { this._pendingSave = true; return { ok: true, reason: 'coalesced' }; }
    this._saveInflight = true; inflight.add(recKey);
    try {
      if (this._migrating) { this.scheduleSave(); return { ok: false, reason: 'migrating' }; } // DATA-SAFETY: never snapshot a half-migrated (still-fat) scene over the migration's slim save (re-bloat race)
      // SCALE/backing: a pending-backing canvas with real content materializes its backing Plexus Drawings record BEFORE
      // saving, so scene + assets land in PROPERTIES (never the host body). Empty canvases stay pending (no empty-drawing spam).
      if (this._pendingBacking && !this._isBacking) {
        const hasContent = (this.scene.elements && this.scene.elements.some((e) => !e.isDeleted)) || (this.scene.files && Object.keys(this.scene.files).length);
        if (!hasContent) return { ok: true, reason: 'pending-backing-empty' };
        try { await this._ensureBackingAndMigrate(); } catch (_e) {}
        if (this.destroyed) return null;
      }
      // Tombstone GC: compact the deleted-element graveyard when it dominates, so n (every scan/snapshot/save) reflects
      // LIVE elements. Safe — undo/redo hold self-contained snapshots and `filter` preserves z-order. (Load-time
      // compaction handles cross-session accumulation; this bounds within-session growth on heavy edit-and-delete.)
      try { const els = this.scene.elements; let del = 0; for (const e of els) if (e.isDeleted) del++; if (del > 200 && del > els.length - del) { this.scene.elements = els.filter((e) => !e.isDeleted); this._gridDirty = true; this._cacheValid = false; } } catch (_e) {}
      const res = await saveScene(this.plugin, this.rec, this.scene, this.camera, this); this._lastSave = res;
      try { this._reindexBackrefs(); } catch (_e) {} // FLYBACK: keep the note→canvas backref index in lockstep with the durable save
      return res;
    } finally {
      this._saveInflight = false; try { inflight.delete(recKey); } catch (_e) {}
      if (this._pendingSave) { this._pendingSave = false; this.scheduleSave(); } // a save coalesced while we ran → run it now
    }
  }
  destroy() { this.destroyed = true; this._camAnim = null; if (this._saveTimer) clearTimeout(this._saveTimer); if (this._settleT) clearTimeout(this._settleT); if (this._btTimer) clearTimeout(this._btTimer); if (this._pendingNav) clearTimeout(this._pendingNav); if (this._marginT) clearTimeout(this._marginT); if (this._panEndT) clearTimeout(this._panEndT); if (this.renderer && this.renderer.dispose) { try { this.renderer.dispose(); } catch (_e) {} } this._cacheCv = null; this._marginCv = null; this._marginValid = false; if (this._ta) { try { this._ta.remove(); } catch (_e) {} } if (this._cardEdit) { try { this._cardEdit.abort && this._cardEdit.abort(); } catch (_e) {} try { this._cardEdit.ta.remove(); } catch (_e) {} this._cardEdit = null; } if (this._cellInp) { try { this._cellInp.remove(); } catch (_e) {} } if (this._refBarEl) { try { this._refBarEl.remove(); } catch (_e) {} this._refBarEl = null; } if (this._connInfoEl) { try { this._connInfoEl.remove(); } catch (_e) {} this._connInfoEl = null; } try { this._closeRegionChoice(); } catch (_e) {} try { this._hideRefPreview(); } catch (_e) {} try { this._closeRecPanel(); } catch (_e) {} try { this._closeDcOverlay(); } catch (_e) {} /* round-3 C / round-4 / EDIT-1 / EDIT-4: symmetric overlay teardown */ if (this._toolbarDisposers) for (const d of this._toolbarDisposers.splice(0)) { try { d(); } catch (_e) {} } for (const d of this._localDisposers.splice(0)) { try { d(); } catch (_e) {} } }
}

/* ─────────────────────────────────── plugin ─────────────────────────────────── */
class Plugin extends AppPlugin {
  onLoad() {
    try { window.__plexusCanvas && window.__plexusCanvas.dispose(); } catch (_e) {}
    const reg = freshRegistry(); this._reg = reg;
    this._pendingQueue = []; this._views = new Set(); this._drawingsCol = null; this._imgRefClip = null;
    this._imgCache = new Map(); // S9: shared bounded LRU decode cache (one Image per fileId across all views)
    this._settings = loadPlexusSettings();
    this._ontology = loadPlexusOntology(); // IO-3: shared collection/relation ontology
    PLEXUS_DEFAULT_FONT = this._settings.defaultFont || 'system-ui, sans-serif'; // S7
    PLEXUS_LINK_ALPHA = (this._settings.linkOpacity == null ? 100 : this._settings.linkOpacity) / 100; // S10
    this._secrets = null; // P0.0: decrypted AI key cache (session only)
    this._onPageHide = () => { this._secrets = null; }; // wipe the decrypted key from memory on unload
    try { window.addEventListener('pagehide', this._onPageHide); } catch (_e) {}
    // IO-5/TS-1: cross-plugin seam — Templater (or any plugin) calls window.__plexusCanvas.attachScene(guid)
    // to flip a freshly-created record into a drawing ("every note born hybrid"). Returns the panel promise.
    window.__plexusCanvas = { version: PLEXUS_VERSION, dispose: () => this._teardown(), attachScene: (guid, blank) => this._openPanelFor(guid, { blank: blank !== false }), mindMapFromNote: (guid) => this._mindMapFromNoteSeam(guid), dropSubgraph: (payload) => { const v = this._activeView() || [...(this._views || [])].find((x) => !x.destroyed); return v ? v._dropSubgraph(payload) : false; } }; // TS-8 Templater mind-map · Subgraph→Canvas drop seam
    console.log('%c[Plexus Canvas] v' + PLEXUS_VERSION + ' loaded', 'color:#7c5cff;font-weight:bold');
    this.ui.injectCSS(BASE_CSS);
    this.ui.registerCustomPanelType(PANEL_ID, (panel) => this._mountPanel(panel));
    this.ui.registerCustomPanelType(GALLERY_PANEL_ID, (panel) => this._mountGallery(panel));
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New Drawing', icon: 'ti-photo', onSelected: () => this._newDrawing() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New hybrid visual note', icon: 'ti-pencil', onSelected: () => this._newHybridNote() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Flip to drawing', icon: 'ti-pencil', onSelected: () => this._flipActiveRecord() });
    this.ui.addCommandPaletteCommand({ label: "Plexus: Open today's whiteboard", icon: 'ti-calendar', onSelected: () => this._openTodayWhiteboard() }); // IO-2
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Add task', icon: 'ti-checkbox', onSelected: () => { const v = this._activeView(); if (v) v._addTaskNode(); } }); // IO-1
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Cite selection (copy reference)', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._copyImageRefToClip(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Paste image reference', icon: 'ti-link', onSelected: () => this._pasteImageRef() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Connect from a region', icon: 'ti-arrow-up-right', onSelected: () => { const v = this._activeView(); if (v) v._showSourceRegionChoice(); } }); // round-5 F: draw a SOURCE region, then drag a connection FROM it
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Jump to citing note', icon: 'ti-target', onSelected: () => { const v = this._activeView(); if (v) v._jumpFromSelection(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle grid', icon: 'ti-layout-grid', onSelected: () => { const v = this._activeView(); if (v) v._toggleGrid(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Export drawing as SVG', icon: 'ti-download', onSelected: () => { const v = this._activeView(); if (v) v._exportSvg(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Export drawing as PNG', icon: 'ti-download', onSelected: () => { const v = this._activeView(); if (v) v._exportPngFile(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Print frames as pages (PDF)', icon: 'ti-printer', onSelected: () => { const v = this._activeView(); if (v) v._printFrames(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Search in drawing', icon: 'ti-search', onSelected: () => { const v = this._activeView(); if (v) v._openSearch(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert record card', icon: 'ti-id', onSelected: () => this._cmdInsertCard() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert query node', icon: 'ti-search', onSelected: () => { const v = this._activeView(); if (v) v._promptText('Query (Thymer search syntax, e.g. @task):', '@task').then((q) => { if (q != null) v._insertQueryNode(q); }); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert roll-up (KPI) card', icon: 'ti-chart-bar', onSelected: () => { const v = this._activeView(); if (!v) return; v._promptText('Roll-up query (Thymer search, e.g. @task @overdue):', '@task').then((q) => { if (q == null) return; v._promptText('Aggregation — count | %done | sum:Prop | avg:Prop | min:Prop | max:Prop:', 'count').then((a) => { if (a != null) v._insertRollup(q, a); }); }); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert live table (records × properties)', icon: 'ti-table', onSelected: () => { const v = this._activeView(); if (!v) return; v._promptText('Table query (Thymer search, e.g. @task):', '@task').then((q) => { if (q == null) return; v._promptText('Columns (comma-separated property names, e.g. Status, Due):', 'Status').then((cs) => { if (cs == null) return; v._insertTable(q, String(cs).split(',').map((s) => s.trim()).filter(Boolean)); }); }); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert board card (embed a drawing)', icon: 'ti-layout-board', onSelected: () => { const v = this._activeView(); if (v && this._lastRecordGuid) v._insertBoardCard(this._lastRecordGuid); else if (v) { try { this.ui.addToaster({ title: 'Plexus: open a drawing/note first, then embed it as a board card.', dismissible: true }); } catch (_e) {} } } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Extract selection to a new drawing (Pizza Slicer)', icon: 'ti-scissors', onSelected: () => { const v = this._activeView(); if (v) v._deconstructSelection(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Capture note (drop a linked card)', icon: 'ti-id', onSelected: () => { const v = this._activeView(); if (v) v._captureNote(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Outline to canvas (mind-map a note)', icon: 'ti-list-tree', onSelected: () => { const v = this._activeView(); const g = this._lastRecordGuid; if (v && g) v._outlineToCanvas(g); else if (v) { try { this.ui.addToaster({ title: 'Plexus: open a note first, then map its outline.', dismissible: true }); } catch (_e) {} } } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Link selected cards (write relations)', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._linkSelectedCards(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle elbow arrow', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._toggleElbow(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Present drawing', icon: 'ti-presentation', onSelected: () => { const v = this._activeView(); if (v) v._enterPresent(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Open Canvas (blank panel)', icon: 'ti-pencil', onSelected: () => this._openPanelFor(null) });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Gallery (all drawings)', icon: 'ti-layout-grid', onSelected: () => this._openGallery() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Icons (symbol library)', icon: 'ti-mood-happy', onSelected: () => this._openIconGlyphLibrary() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Customize toolbar', icon: 'ti-settings', onSelected: () => this._openToolbarSettings() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Icon Library (your #icon records)', icon: 'ti-stack', onSelected: () => this._openIconLibrary() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New mind map', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._newMindMap(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Mind map from note (import headings)', icon: 'ti-list-tree', onSelected: () => { const v = this._activeView(); if (v) v._mmFromNote(this._lastRecordGuid); } }); // CP-3 v3a
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Query pinboard (cards from a search)', icon: 'ti-layout-grid', onSelected: () => { const v = this._activeView(); if (v) v._queryPinboard(); } }); // CS-9
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Arrange cards by property (kanban)', icon: 'ti-layout-board', onSelected: () => { const v = this._activeView(); if (v) v._arrangeByProperty(); } }); // CS-1
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Arrange cards on a timeline (drag to re-date)', icon: 'ti-calendar', onSelected: () => { const v = this._activeView(); if (v) v._arrangeTimeline(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Label connector with date delta', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._datetimeConnectors(); } }); // CS-10
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Stamp new record (stencil)', icon: 'ti-id', onSelected: () => { const v = this._activeView(); if (v) v._stampRecord(); } }); // CS-5
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Save milestone snapshot', icon: 'ti-clock', onSelected: () => { const v = this._activeView(); if (v) v._saveMilestone(); } }); // CS-6
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Restore milestone (time-lapse)', icon: 'ti-clock', onSelected: () => { const v = this._activeView(); if (v) v._restoreMilestone(); } }); // CS-6
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Pull in neighbours (backlink halo)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._pullInNeighbours(); } }); // CS-4
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Frames → Slide records', icon: 'ti-presentation', onSelected: () => { const v = this._activeView(); if (v) v._framesToSlides(); } }); // CS-7
    // CP-4: align / distribute / stats / eyedropper (precision tools).
    for (const a of [['Align left', 'left'], ['Align centre (H)', 'hcenter'], ['Align right', 'right'], ['Align top', 'top'], ['Align middle (V)', 'vmiddle'], ['Align bottom', 'bottom'], ['Distribute horizontally', 'disth'], ['Distribute vertically', 'distv']]) { this.ui.addCommandPaletteCommand({ label: 'Plexus: ' + a[0], icon: 'ti-layout-board', onSelected: () => { const v = this._activeView(); if (v) v._align(a[1]); } }); }
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Selection stats', icon: 'ti-chart-bar', onSelected: () => { const v = this._activeView(); if (v) v._selectionStats(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Eyedropper (sample a colour)', icon: 'ti-palette', onSelected: () => { const v = this._activeView(); if (v) v._eyedropper(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Set external link on element', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._setLink(); } }); // CP-7/C-CF6
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Copy as PNG (clipboard)', icon: 'ti-photo', onSelected: () => { const v = this._activeView(); if (v) v._copyPngToClipboard(); } }); // CP-7/C-CF4
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Fold / unfold mind-map branch', icon: 'ti-stack', onSelected: () => { const v = this._activeView(); if (v) { const n = v._singleSel(); if (n && n.mmRoot) v._mmToggleFold(n); else { try { this.ui.addToaster({ title: 'Plexus: select a mind-map node first.', dismissible: true }); } catch (_e) {} } } } }); // CP-3 v3a
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Mind-map layout (cycle direction)', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) { const n = v._singleSel(); if (n && n.mmRoot) v._mmCycleLayout(n); else { try { this.ui.addToaster({ title: 'Plexus: select a mind-map node first.', dismissible: true }); } catch (_e) {} } } } }); // CP-3 v3b
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Pin / unpin mind-map node', icon: 'ti-target', onSelected: () => { const v = this._activeView(); if (v) { const n = v._singleSel(); if (n && n.mmRoot) v._mmTogglePin(n); else { try { this.ui.addToaster({ title: 'Plexus: select a mind-map node first.', dismissible: true }); } catch (_e) {} } } } }); // CP-3 v3b
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New cause-and-effect (tree)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._newCauseEffect('tree'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New cause-and-effect (fishbone)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._newCauseEffect('fishbone'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New cause-and-effect (pentagon)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._newCauseEffect('pentagon'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Import cause-effect chart (JSON)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._ceImportJson(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Promote cause-effect to records (Brain)', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._promoteCauseEffect(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Colours (Shade Master / schemes)', icon: 'ti-palette', onSelected: () => { const v = this._activeView(); if (v) v._openColorTool(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Semantic ghost-edges (local embeddings)', icon: 'ti-affiliate', onSelected: () => { const v = this._activeView(); if (v) v._toggleGhosts(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI diagram from prompt', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiDiagram(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI suggest relations (writes refs)', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiRelationSuggest(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI auto-cluster into named frames', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiAutoCluster(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI usage this session', icon: 'ti-chart-bar', onSelected: () => { try { this.ui.addToaster({ title: 'Plexus AI: ' + (this._aiCalls || 0) + ' call(s), ' + (this._aiTokens || 0) + ' tokens this session.', dismissible: true }); } catch (_e) {} } }); // Phase 6: token meter
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI Mermaid diagram from prompt', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiMermaid(); } }); // Phase 6: NL → Mermaid
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI analyse this drawing (vision)', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiAnalyzeCanvas(); } }); // Phase 6: vision
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI generate image', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiImage(); } }); // Phase 6: image gen
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI edit selected image', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiEditImage(); } }); // Phase 6: image edit
    this.ui.addCommandPaletteCommand({ label: 'Plexus: AI wireframe → live app', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._aiWireframe(); } }); // Phase 6: wireframe→code
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Chart from CSV', icon: 'ti-chart-bar', onSelected: () => { const v = this._activeView(); if (v) v._chartFromCsv(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert reference (@@)', icon: 'ti-link', onSelected: () => { const v = this._activeView(); if (v) v._insertRef(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Boolean — union', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._boolean('union'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Boolean — subtract', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._boolean('difference'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Boolean — intersect', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._boolean('intersect'); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert Mermaid diagram', icon: 'ti-graph', onSelected: () => { const v = this._activeView(); if (v) v._insertMermaid(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Insert LaTeX equation', icon: 'ti-sparkles', onSelected: () => { const v = this._activeView(); if (v) v._insertLatex(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Import PDF (pages → images)', icon: 'ti-file-text', onSelected: () => { const v = this._activeView(); if (v) v._importPdfPicker(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Import PDF page (choose one)', icon: 'ti-file-text', onSelected: () => { const v = this._activeView(); if (v) v._importPdfPagePicker(); } }); // CP-PDF model-B-lite
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Text to path (flow text along a line)', icon: 'ti-vector', onSelected: () => { const v = this._activeView(); if (v) v._textToPath(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle text wrap', icon: 'ti-cursor-text', onSelected: () => { const v = this._activeView(); if (v) v._toggleTextWrap(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle image dark-invert (selected)', icon: 'ti-moon', onSelected: () => { const v = this._activeView(); if (v) v._toggleImageInvert(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Schedule card (re-date in place)', icon: 'ti-calendar', onSelected: () => { const v = this._activeView(); if (v) v._scheduleCard(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Toggle minimap', icon: 'ti-map', onSelected: () => { if (!this._settings) this._settings = {}; this._settings.minimap = this._settings.minimap === false; try { savePlexusSettings(this._settings); } catch (_e) {} for (const v of this._views) { v._miniDirty = true; v.dirty = true; } } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Bulk set property (selected cards)', icon: 'ti-checkbox', onSelected: () => { const v = this._activeView(); if (v) v._bulkBrush(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Quick-capture (new record card)', icon: 'ti-plus', onSelected: () => { const v = this._activeView(); if (v) v._quickCapture(); } });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New record card (here)', icon: 'ti-id', onSelected: () => { const v = this._activeView(); if (v) { const c = v.camera.screenToWorld(v.cssW / 2, v.cssH / 2); v._newRecordCardAt(c.x, c.y); } } }); // EDIT-2
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Collapse / expand section', icon: 'ti-layout-board', onSelected: () => { const v = this._activeView(); if (!v) return; const f = v._singleSel(); if (f && f.type === 'frame') v._toggleSectionCollapse(f); else { try { this.ui.addToaster({ title: 'Plexus: select a single section first.', dismissible: true }); } catch (_e) {} } } }); // SECTIONS iter 3
    this.ui.addCommandPaletteCommand({ label: 'Plexus: New Datacore card (here)', icon: 'ti-table', onSelected: () => { const v = this._activeView(); if (v) { const c = v.camera.screenToWorld(v.cssW / 2, v.cssH / 2); v._insertQueryNode('dc: @task', c.x, c.y); } } }); // EDIT-4
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Settings', icon: 'ti-settings', onSelected: () => this._openSettings() });
    this.ui.addCommandPaletteCommand({ label: 'Plexus: Flip to note (back to text)', icon: 'ti-arrow-back-up', onSelected: () => { const v = this._activeView(); if (v) v._flipToNote(); } });
    // Phase 9 E1: track the last-focused record (the card-insert target) + keep cards LIVE.
    this._lastRecordGuid = null;
    const trackFocus = (e) => { try { const r = e.panel && e.panel.getActiveRecord && e.panel.getActiveRecord(); if (r && r.guid) this._lastRecordGuid = r.guid; } catch (_e) {} };
    try { this.events.on('panel.focused', trackFocus); this.events.on('panel.navigated', trackFocus); } catch (_e) {}
    const onRecChange = (e) => { const g = e && e.recordGuid; const lg = e && e.lineItemGuid; if (g && e && e.trashed) this._brefPruneDrawing(g); for (const v of this._views) { if (g) { v._invalidateRec(g); v._invalidateBoard(g); v._invalidateLinesForRecord(g); } if (lg) v._invalidateTask(lg); v._invalidateQueries(); v._invalidateRollups(); v._invalidateTables(); v._dragLayerValid = false; } }; // un-freeze the drag static layer so a card edited (by another client) mid-drag repaints // IO-1 + TRANSCLUDE + BACKREF-SYNC + ROLL-UP + TABLE: refresh nodes + GC a trashed drawing's backref sub-map
    try { for (const ev of ['record.updated', 'lineitem.updated', 'lineitem.created', 'lineitem.deleted', 'lineitem.moved']) this.events.on(ev, onRecChange); } catch (_e) {}
    // Deleting the citing image/chip in a note removes the cross-reference → drop the canvas ↗ badge too.
    const onLineDeleted = (e) => { try { const g = e && e.lineItemGuid; if (!g) return; const x = this._loadXref(); if (!x[g]) return; const drawing = x[g].drawing; delete x[g]; this._saveXref(x); for (const v of this._views) if (v.recordGuid === drawing) { try { v._buildXrefIndex(); v.dirty = true; } catch (_e) {} } } catch (_e) {} };
    try { this.events.on('lineitem.deleted', onLineDeleted); } catch (_e) {}
    let raf = 0;
    const tick = () => {
      for (const v of this._views) { if (!v.host || !v.host.isConnected) { v.destroy(); this._views.delete(v); continue; } if (v.dirty) { try { v.render(); } catch (e) { console.error('[Plexus] render', e); } v.dirty = false; } }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); reg.add(() => cancelAnimationFrame(raf));
    const onScroll = () => { if (window.scrollX !== 0) window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' }); };
    window.addEventListener('scroll', onScroll, { passive: true }); reg.add(() => window.removeEventListener('scroll', onScroll));
    // Note → canvas: intercept a click on a cited "↗ source/region of drawing" ref → open the drawing + flash.
    // Capture phase + gated on our own xref index, so it only ever fires for lines WE registered.
    const onDocClick = (e) => {
      try {
        const t = e.target; if (!t || !t.closest) return;
        const row = t.closest('.listitem'); if (!row) return;
        const lineGuid = row.getAttribute('data-guid'); if (!lineGuid) return;
        const entry = this._lookupXref(lineGuid); if (!entry) return;
        // Image-attached chip: any click on the pasted image (or its ↗ badge) navigates.
        // Ref-segment chip (legacy): only a click on the link itself.
        const isImg = entry.image && (t.tagName === 'IMG' || t.closest('img') || t.closest('.plexus-imgref-badge'));
        const isRef = t.closest('.lineitem-ref, .lineitem-linkobj, .lineitem-link');
        if (!isImg && !isRef) return;
        e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        this._navToCanvasAnchor(entry);
      } catch (_e) {}
    };
    document.addEventListener('click', onDocClick, true); reg.add(() => document.removeEventListener('click', onDocClick, true));
    // Overlay a ↗ badge onto each pasted image-reference: scan on navigation + a light interval backstop.
    try { this._injectImgRefCss(); } catch (_e) {}
    const scan = () => { try { this._scanImageBadges(); } catch (_e) {} try { this._scanRefBadges(); } catch (_e) {} };
    // On navigation, also reconstruct the index from synced image-blob filenames (web↔desktop parity).
    const syncNav = (e) => { try { const r = e && e.panel && e.panel.getActiveRecord && e.panel.getActiveRecord(); if (r) this._syncImageRefsForRecord(r); else scan(); } catch (_e) { scan(); } };
    try { this.events.on('panel.navigated', syncNav); this.events.on('panel.focused', syncNav); this.events.on('lineitem.created', scan); this.events.on('lineitem.updated', scan); } catch (_e) {}
    const scanIv = setInterval(scan, 1500); reg.add(() => clearInterval(scanIv));
    const brefT = setTimeout(() => { try { this._brefSyncLoad(); } catch (_e) {} }, 2500); reg.add(() => clearTimeout(brefT)); // BACKREF-SYNC: pull the synced index once on load (web↔desktop parity); deferred so startup isn't blocked
    reg.add(() => { if (this._brefSyncT) clearTimeout(this._brefSyncT); });
    this._installAutomate();
    if (TEST_HOOKS) this._installTestHooks();
  }
  _teardown() { try { this._hideBrefHover(); } catch (_e) {} try { this._closeBrefMenu(); } catch (_e) {} for (const v of this._views) { try { v.destroy(); } catch (_e) {} } this._views.clear(); try { this._reg.dispose(); } catch (_e) {} try { window.removeEventListener('pagehide', this._onPageHide); } catch (_e) {} this._secrets = null; this._imgCache = null; /* S9: free decoded bitmaps */ }
  onUnload() { this._teardown(); window.__plexusCanvas = undefined; }
  _activeView() { const p = this.ui.getActivePanel(); const v = [...this._views].find((x) => x.panel === p); return v || [...this._views].pop() || this._domView() || null; }
  // DEBUG/VERIFY: find the LIVE rendered view via its DOM handle (wrap.__pxcView) — survives a hot-reload leak where this
  // plugin instance's _views is empty because the rendered view belongs to a previous instance. Prefer the active panel's.
  _domView() {
    try {
      let activePanel = null; try { activePanel = this.ui.getActivePanel(); } catch (_e) {}
      const roots = document.querySelectorAll('.pxc-root'); let connected = null, any = null;
      for (const r of roots) { const v = r.__pxcView; if (!v || v.destroyed) continue; any = v;
        const pe = v.panel && v.panel.getElement && v.panel.getElement(); const inPanel = pe && pe.contains(r);
        if (inPanel && activePanel && v.panel === activePanel) return v; // the ACTIVE panel's live view wins (avoids writing into a non-focused leaked view)
        if (inPanel && !connected) connected = v;
      }
      return connected || any;
    } catch (_e) { return null; }
  }
  // S9: shared bounded LRU image-decode cache. One Image per fileId across every view. Returns the ready
  // Image or null while async-decoding (callers already handle the placeholder). Map insertion order = LRU.
  _imgCacheGet(fileId, files) {
    const st = this._settings || {};
    const cache = this._imgCache || (this._imgCache = new Map());
    let e = cache.get(fileId);
    if (e) {
      if (e.broken) return null;
      if (st.allowImageCache !== false) { cache.delete(fileId); cache.set(fileId, e); } // LRU touch: re-insert as most-recent
      return e.ready ? e.img : null;
    }
    const file = files && files[fileId];
    if (!file) return null;
    if (file.dataURL) {
      const img = new Image(); e = { img, ready: false }; cache.set(fileId, e);
      img.onload = () => { e.ready = true; for (const v of this._views) { v.dirty = true; v._dragLayerValid = false; } this._imgCacheEvict(); }; // _dragLayerValid=false → a static image finishing decode mid-drag forces ONE rebuild frame so it isn't stuck behind the frozen layer
      img.onerror = () => { e.broken = true; }; // keep a broken-marker so a bad dataURL isn't re-decoded every frame
      img.src = file.dataURL;
      if (st.allowImageCache === false) { const drop = () => cache.delete(fileId); img.addEventListener('load', drop, { once: true }); img.addEventListener('error', drop, { once: true }); }
      else this._imgCacheEvict();
      return null;
    }
    if (file.blobGuid) {
      // SCALE: externalized asset → resolve from the Thymer blob store async (download → objectURL → decode), then cache like any image
      e = { img: null, ready: false, url: null, loading: true }; cache.set(fileId, e);
      this._assetGet(file).then((url) => {
        if (cache.get(fileId) !== e) { if (url) { try { URL.revokeObjectURL(url); } catch (_e) {} } return; } // evicted while downloading → don't leak the objectURL or write to an orphan
        if (!url) { e.broken = true; return; }
        e.url = url; const img = new Image();
        img.onload = () => { e.img = img; e.ready = true; e.loading = false; for (const v of this._views) { v.dirty = true; v._dragLayerValid = false; } this._imgCacheEvict(); };
        img.onerror = () => { e.broken = true; try { URL.revokeObjectURL(url); } catch (_e) {} };
        img.src = url;
      });
      if (st.allowImageCache !== false) this._imgCacheEvict();
      return null;
    }
    return null;
  }
  // SCALE: resolve an externalized asset blob (by guid) → an objectURL the decoder can load. The blob is GC-anchored
  // to the record (Assets property / body file line-item); we resolve it directly by blob-guid, no enumeration.
  async _assetGet(file) {
    try {
      const fv = { name: file.name || 'asset', error: null, guid: file.blobGuid, imgData: null, imgUrl: null, imgClass: null };
      const b = await this.data.getBlobFromPropertyFileValue(fv);
      if (!b) return null;
      const ab = await b.download();
      if (!ab) return null;
      return URL.createObjectURL(new Blob([ab], { type: file.mimeType || b.contentType || 'image/webp' }));
    } catch (_e) { return null; }
  }
  _imgCacheEvict() {
    const cache = this._imgCache; if (!cache) return;
    const max = Math.max(1, (this._settings && this._settings.imageCacheMax) || 120);
    if (cache.size <= max) return;
    let over = cache.size - max;
    for (const k of cache.keys()) { const e = cache.get(k); if (e && e.url) { try { URL.revokeObjectURL(e.url); } catch (_e) {} } cache.delete(k); if (--over <= 0) break; } // front of the Map = LRU; revoke objectURLs so externalized-asset blobs don't leak
  }
  _purgeImageCache() { if (this._imgCache) { for (const e of this._imgCache.values()) { if (e && e.url) { try { URL.revokeObjectURL(e.url); } catch (_e) {} } } this._imgCache.clear(); } else this._imgCache = new Map(); for (const v of this._views) { v.dirty = true; v._dragLayerValid = false; } }
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
  // SCALE/backing: scan Plexus Drawings ONCE (cached) → the set of drawing guids + a {sourceNoteGuid → drawingGuid}
  // map (from each drawing's `Source Note` relation). Powers "is this a drawing?" + "which drawing backs note H?".
  async _scanDrawings(force) {
    if (this._drawingScan && !force) return this._drawingScan;
    let recs = []; try { const col = await this._drawingsCollection(); if (col) recs = await col.getAllRecords() || []; } catch (_e) {}
    const drawingGuids = new Set(), srcMap = new Map();
    for (const r of recs) {
      const g = r && r.guid; if (!g) continue; drawingGuids.add(g);
      try { const p = r.prop('Source Note'); if (p) for (const ng of pxcRelValues(p)) if (ng && !srcMap.has(ng)) srcMap.set(ng, g); } catch (_e) {}
    }
    this._drawingScan = { drawingGuids, srcMap };
    return this._drawingScan;
  }
  async _isDrawingRecord(guid) { try { return (await this._scanDrawings()).drawingGuids.has(guid); } catch (_e) { return false; } }
  async _findBackingDrawing(hostGuid) { try { return (await this._scanDrawings()).srcMap.get(hostGuid) || null; } catch (_e) { return null; } }
  _noteBacking(hostGuid, drawingGuid) { try { const s = this._drawingScan; if (s) { s.drawingGuids.add(drawingGuid); s.srcMap.set(hostGuid, drawingGuid); } } catch (_e) {} } // keep the cache fresh after creating a backing
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
  // IO-2: the daily whiteboard hub — flip TODAY's Journal record into a drawing. One record, three views
  // (drawing + its text line items + graph). getJournalRecord creates the page lazily on first write.
  async _journalCollection() {
    if (this._journalCol) return this._journalCol;
    let cols = null; try { cols = await this.data.getAllCollections(); } catch (_e) {}
    this._journalCol = (cols || []).find((c) => { try { return c.isJournalPlugin && c.isJournalPlugin(); } catch (_e) { return false; } }) || null;
    return this._journalCol;
  }
  async _openTodayWhiteboard() {
    const journal = await this._journalCollection();
    if (!journal) { try { this.ui.addToaster({ title: 'Plexus: no Journal collection found in this workspace.', dismissible: true }); } catch (_e) {} return null; }
    let user = null; try { const us = this.data.getActiveUsers && this.data.getActiveUsers(); user = (us && us[0]) || null; } catch (_e) {}
    let rec = null; try { rec = await journal.getJournalRecord(user); } catch (e) { console.error('[Plexus] getJournalRecord', e); }
    if (!rec || !rec.guid) { try { this.ui.addToaster({ title: 'Plexus: could not open today’s journal page.', dismissible: true }); } catch (_e) {} return null; }
    let existing = null; try { existing = await findSceneLine(rec); } catch (_e) {}
    if (!existing) { try { existing = rec.prop && rec.prop('Scene') && rec.prop('Scene').fileBlob && rec.prop('Scene').fileBlob(); } catch (_e) {} }
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
    // Encode the whole cross-reference into the image's BLOB FILENAME (synced metadata that travels to every
    // client — web AND desktop), so the ↗ chip + navigation reconstruct anywhere, not just where it was made.
    const chipLabel = (clip.label && String(clip.label).trim()) || (clip.crop ? 'region' : 'drawing');
    const refFilename = this._encodeRefFilename({ drawing: clip.sourceRecordGuid, el: clip.elementId || '', region: clip.region || null, label: chipLabel, inImage: clip.inImage, frac: clip.frac, fracPoly: clip.fracPoly, extra: clip.extra });
    let blob = null; try { blob = await this.data.uploadBlob(new File([clip.png], refFilename, { type: 'image/png' })); } catch (_e) {}
    // Nest the image UNDER the line the cursor is on (a CHILD), not at the record's top level. Resolve the
    // cursor line from the active editor (the thread-target marker) → the matching line item → use as parent.
    let parentLine = null;
    try {
      const panel = this.ui.getActivePanel();
      const root = (panel && panel.getElement && panel.getElement()) || document;
      const cur = root.querySelector('.flowythymer-thread-target') || root.querySelector('.listitem.has-focus, .listitem.is-target, .listitem.selected');
      const li = cur ? (cur.getAttribute && cur.getAttribute('data-guid') ? cur : (cur.closest && cur.closest('.listitem[data-guid]'))) : null;
      const g = li && li.getAttribute ? li.getAttribute('data-guid') : null;
      if (g) { const items = await rec.getLineItems(); parentLine = (items || []).find((x) => x && x.guid === g) || null; }
    } catch (_e) {}
    let imgLine = null; for (let i = 0; i < 5 && !imgLine; i++) { try { imgLine = await rec.createLineItem(parentLine, null, 'image', null, null); } catch (_e) {} if (!imgLine) await sleep(150); }
    if (imgLine && blob) { try { await imgLine.setBlob(blob); } catch (_e) {} }
    // Clean inline reference: a small ↗ chip attached DIRECTLY to the pasted image (no separate label line).
    if (imgLine && imgLine.guid) { try { this._registerXref(imgLine.guid, { drawing: clip.sourceRecordGuid, el: clip.elementId || null, region: clip.region || null, label: chipLabel, image: true, inImage: clip.inImage, frac: clip.frac, fracPoly: clip.fracPoly, extra: clip.extra }); } catch (_e) {} }
    setTimeout(() => { try { this._scanImageBadges(); } catch (_e) {} }, 400);
    try { this.ui.addToaster({ title: 'Image reference added — the ↗ on it flies to the drawing and zooms to “' + chipLabel + '”.', dismissible: true }); } catch (_e) {}
    return { ok: !!imgLine, imgLineGuid: imgLine ? imgLine.guid : null, recordGuid: rec.guid };
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
  /* ── Cross-reference index — note line guid → {drawing, el, region, label}. localStorage so it
   *    survives reloads; rebuilt onto each open drawing view as a per-element badge map. ───────── */
  _loadXref() { try { return JSON.parse(localStorage.getItem('plexus_xref') || '{}'); } catch (_e) { return {}; } }
  _saveXref(x) {
    try { localStorage.setItem('plexus_xref', JSON.stringify(x)); }
    catch (_e) {
      // localStorage ~5 MB quota hit — evict the OLDEST half by timestamp and retry. Safe: the cross-ref is
      // also encoded in each image's synced blob filename, so evicted entries rebuild on note open.
      try { const ents = Object.entries(x).sort((a, b) => (a[1] && a[1].t || 0) - (b[1] && b[1].t || 0)); const keep = {}; for (const [k, v] of ents.slice(Math.floor(ents.length / 2))) keep[k] = v; localStorage.setItem('plexus_xref', JSON.stringify(keep)); } catch (_e2) {}
    }
  }
  _lookupXref(lineGuid) { const x = this._loadXref(); return x[lineGuid] || null; }
  _registerXref(lineGuid, data) {
    if (!lineGuid || !data || !data.drawing) return;
    const x = this._loadXref(); x[lineGuid] = Object.assign({ t: Date.now() }, data); this._saveXref(x);
    for (const v of this._views) { if (v.recordGuid === data.drawing) { try { v._buildXrefIndex(); v.dirty = true; } catch (_e) {} } }
  }
  // CANVAS-BACK-1: reverse index keyed by the TARGET line/record guid → the canvas chip pointing at it. Lets the
  // cited note line fly back to the canvas (reuses _navToCanvasAnchor + the cinematic flight). Mirrors _xref plumbing.
  // BACKREF-SYNC: nested per-drawing store, hot copy in localStorage, mirrored to a synced blob (cross-device).
  _brefStore() { if (!this._bref) { let raw = {}; try { raw = JSON.parse(localStorage.getItem('plexus_backref') || '{}'); } catch (_e) {} this._bref = pxcBrefMigrate(raw); } return this._bref; }
  _brefSaveLocal() { try { localStorage.setItem('plexus_backref', JSON.stringify(this._bref || {})); } catch (_e) { try { const s = this._bref || {}; const ds = Object.keys(s); if (ds.length) { delete s[ds[0]]; localStorage.setItem('plexus_backref', JSON.stringify(s)); } } catch (_e2) {} } }
  _loadBackref() { return pxcBrefFlatten(this._brefStore()); }   // {target: [entry,…]} — array per target (multi-ref)
  _lookupBackref(guid) { return this._loadBackref()[guid] || null; } // returns the ARRAY (or null)
  _registerBackref(guid, data) {
    if (!guid || !data || !data.drawing || !data.el) return;
    const s = this._brefStore(); const d = (s[data.drawing] = s[data.drawing] || {}); const m = (d[guid] = d[guid] || {});
    m[data.el] = { label: data.label, kind: data.kind || 'line', t: Date.now() };
    this._brefSaveLocal(); this._brefSyncSchedule();
  }
  // FLYBACK: replace ONE drawing's backref sub-map wholesale (rebuild-on-save). map = {target: {elId: {label, kind}}}.
  // Self-heals deleted/edited-away refs; never touches other drawings' sub-maps (concurrency-safe). Empty → drop it.
  _setDrawingBackrefs(drawing, map) {
    if (!drawing) return; const s = this._brefStore(); const targets = map ? Object.keys(map) : [];
    if (!targets.length) { if (s[drawing]) { delete s[drawing]; this._brefSaveLocal(); this._brefSyncSchedule(); } return; }
    const t = Date.now(); const sub = {};
    for (const target of targets) { const inner = map[target] || {}; const om = {}; for (const elId in inner) { const e = inner[elId]; const o = { label: e.label || 'ref', kind: e.kind || 'line', t }; if (e.from) o.from = e.from; if (e.dir && e.dir !== 'none') o.dir = e.dir; if (e.img) o.img = e.img; om[elId] = o; } sub[target] = om; } // F1/F3: persist the connection breadcrumb fields (from/dir/img) so the note-side dialog can render them
    s[drawing] = sub; this._brefSaveLocal(); this._brefSyncSchedule();
  }
  _brefPruneDrawing(drawing) { const s = this._brefStore(); if (s[drawing]) { delete s[drawing]; this._brefSaveLocal(); this._brefSyncSchedule(); } } // GC: drawing trashed → drop its sub-map (no ghost ↗)
  // A3 (round 3): drop ONE connector entry (elId) from a drawing's sub-map across all its targets — used when a stale ref's
  // connector turns out to no longer exist on nav. Removes a target sub-map left empty. Returns true if anything changed.
  _brefPruneEntry(drawing, elId) {
    const s = this._brefStore(); const d = s[drawing]; if (!d || !elId) return false; let changed = false;
    for (const target of Object.keys(d)) { if (d[target] && d[target][elId]) { delete d[target][elId]; changed = true; if (!Object.keys(d[target]).length) delete d[target]; } }
    if (changed) { if (!Object.keys(d).length) delete s[drawing]; this._brefSaveLocal(); this._brefSyncSchedule(); }
    return changed;
  }
  _brefSyncSchedule() { if (this._brefSyncT) clearTimeout(this._brefSyncT); this._brefSyncT = setTimeout(() => { this._brefSyncT = null; this._brefSyncFlush(); }, 800); } // debounced + coalesced
  // Resolve the singleton index record: cached guid → marker-title search (dedup by smallest guid) → create. All
  // defensive; if it fails the plugin still works (localStorage stays authoritative — only cross-device sync is lost).
  async _brefIndexRecord() {
    let g = this._brefRecGuid; if (!g) { try { g = localStorage.getItem('plexus_backref_rec') || null; } catch (_e) {} }
    if (g) { const r = await getRecordPoll(this, g, 2); if (r) { this._brefRecGuid = g; return r; } }
    try { const res = await this.data.searchByQuery(BREF_REC_TITLE, 8); const hits = ((res && res.records) || []).filter((r) => (r.getName && r.getName()) === BREF_REC_TITLE); if (hits.length) { hits.sort((a, b) => (a.guid < b.guid ? -1 : 1)); const r = hits[0]; this._brefRecGuid = r.guid; try { localStorage.setItem('plexus_backref_rec', r.guid); } catch (_e) {} return r; } } catch (_e) {}
    try { const cols = await this.data.getAllCollections(); const col = (cols || []).find(Boolean); if (col) { const ng = col.createRecord(BREF_REC_TITLE); if (typeof ng === 'string') { const r = await getRecordPoll(this, ng, 8); if (r) { this._brefRecGuid = ng; try { localStorage.setItem('plexus_backref_rec', ng); } catch (_e) {} return r; } } } } catch (_e) {}
    return null;
  }
  async _brefSyncFlush() {
    let rec = null; try { rec = await this._brefIndexRecord(); } catch (_e) {} if (!rec) return;
    try {
      // READ-MERGE-WRITE: pull the current remote blob and merge it into the local store BEFORE uploading, so this
      // client's whole-store write can't wipe entries another device added since our last load (newest-t wins).
      let line = null; const items = (await rec.getLineItems()) || [];
      for (const li of items) { try { const b = await li.getBlob(); if (b && b.fileName === BREF_FILE) { line = li; const ab = await b.download(); if (ab) { try { pxcBrefMergeNested(this._brefStore(), pxcBrefMigrate(JSON.parse(new TextDecoder().decode(ab)))); } catch (_e) {} } break; } } catch (_e) {} }
      this._brefSaveLocal();
      const blob = await this.data.uploadBlob(new File([JSON.stringify(this._brefStore())], BREF_FILE, { type: 'application/json' }));
      if (!blob) return;
      if (!line) line = await rec.createLineItem(null, null, 'file', null, null);
      if (line && line.setBlob) await line.setBlob(blob);
    } catch (_e) {}
  }
  async _brefSyncLoad() {
    let rec = null; try { rec = await this._brefIndexRecord(); } catch (_e) {} if (!rec) return;
    try {
      const items = (await rec.getLineItems()) || [];
      for (const li of items) { let b = null; try { b = await li.getBlob(); } catch (_e) {} if (!b || b.fileName !== BREF_FILE) continue; const ab = await b.download(); if (ab) { try { const synced = JSON.parse(new TextDecoder().decode(ab)); pxcBrefMergeNested(this._brefStore(), pxcBrefMigrate(synced)); this._brefSaveLocal(); for (const v of this._views) { v.dirty = true; v._dragLayerValid = false; } } catch (_e) {} } break; }
    } catch (_e) {}
  }
  _injectImgRefCss() {
    if (document.getElementById('plexus-imgref-css')) return;
    const s = document.createElement('style'); s.id = 'plexus-imgref-css';
    s.textContent = '.plexus-imgref-wrap{position:relative}.plexus-imgref-badge{position:absolute;top:7px;right:7px;width:24px;height:24px;border-radius:50%;background:rgba(124,92,255,.95);color:#fff;display:grid;place-items:center;font:600 14px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.35);z-index:6;user-select:none;transition:transform .12s}.plexus-imgref-badge:hover{transform:scale(1.14);background:#7c5cff}.plexus-backref-badge{position:relative;display:inline-grid;place-items:center;width:18px;height:18px;margin:0 0 0 5px;border-radius:50%;background:rgba(14,165,233,.92);color:#fff;font:600 11px/1 system-ui,sans-serif;cursor:pointer;vertical-align:middle;user-select:none;transition:transform .12s}.plexus-backref-badge:hover{transform:scale(1.18);background:#0ea5e9}.plexus-backref-count{position:absolute;top:-7px;right:-7px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#ef4444;color:#fff;font:700 9px/14px system-ui,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}.plexus-bref-menu{position:fixed;z-index:2147483646;min-width:200px;max-width:340px;max-height:300px;overflow-y:auto;background:#1b1f2a;color:#e6e8ee;border:1px solid #333a4a;border-radius:9px;box-shadow:0 10px 34px rgba(0,0,0,.42);padding:5px;font:13px/1.35 system-ui,sans-serif}.plexus-bref-head{padding:5px 9px 7px;font-size:11px;letter-spacing:.02em;opacity:.55;text-transform:uppercase}.plexus-bref-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:6px;cursor:pointer}.plexus-bref-row:hover{background:rgba(124,92,255,.22)}.plexus-bref-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%}.plexus-bref-lbl{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plexus-canvas-refs{margin:2px 0 6px}.plexus-cref-list{display:flex;flex-direction:column;gap:1px;margin-top:3px}.plexus-cref-row{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;color:var(--color-text-400,#444)}.plexus-cref-row:hover{background:var(--sidebar-bg-hover,rgba(124,92,255,.12))}.plexus-cref-ic{flex:0 0 auto;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;color:#fff;font:600 10px/1 system-ui,sans-serif}.plexus-cref-lbl{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:13px/1.3 system-ui,sans-serif}.plexus-cref-from,.plexus-bref-from{flex:0 1 auto;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.72;font-style:italic}.plexus-cref-dir,.plexus-bref-dir{flex:0 0 auto;opacity:.75;font-weight:700}.plexus-cref-thumb,.plexus-bref-thumb{flex:0 0 auto;width:34px;height:24px;object-fit:cover;border-radius:3px;border:1px solid rgba(127,127,127,.4)}.plexus-bref-hover{position:fixed;z-index:2147483646;max-width:300px;display:flex;flex-direction:column;gap:6px;padding:8px;background:#1b1f2a;color:#e6e8ee;border:1px solid #333a4a;border-radius:9px;box-shadow:0 10px 34px rgba(0,0,0,.42);font:13px/1.35 system-ui,sans-serif;pointer-events:none}.plexus-bh-row{display:flex;align-items:center;gap:9px}.plexus-bh-thumb{flex:0 0 auto;width:96px;height:64px;object-fit:cover;border-radius:5px;border:1px solid rgba(127,127,127,.45)}.plexus-bh-txt{display:flex;flex-direction:column;gap:2px;min-width:0}.plexus-bh-from{font-style:italic;opacity:.72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plexus-bh-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plexus-bh-dir{opacity:.8;font-weight:700;margin-right:3px}.pxc-refpreview{position:fixed;z-index:9000;max-width:300px;padding:8px 10px;background:#1b1f2a;color:#e6e8ee;border:1px solid #333a4a;border-radius:9px;box-shadow:0 8px 26px rgba(0,0,0,.4);font:12px/1.4 system-ui,sans-serif;pointer-events:none}.pxc-refpreview .pxc-rp-title{font-weight:700;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pxc-refpreview .pxc-rp-body{opacity:.82;display:flex;flex-direction:column;gap:1px}.pxc-refpreview .pxc-rp-line{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pxc-refpreview .pxc-rp-load{opacity:.6;font-style:italic}';
    document.head.appendChild(s);
  }
  // F1: arrow-direction glyph for a connection backref, relative to THIS note ('in' = points here).
  _dirGlyph(dir) { return dir === 'both' ? '↔' : dir === 'out' ? '←' : dir === 'in' ? '→' : '·'; }
  _brefText(en) { const lbl = (en && en.label) || 'reference'; return (en && (en.from || en.img)) ? ((en.img ? 'image' : en.from) + ' ' + this._dirGlyph(en.dir) + ' ' + lbl) : lbl; } // plain-text breadcrumb for tooltips
  // F3: a small cropped PNG thumbnail of an image-region endpoint (data URL), or null. Resolve the decoded image through a
  // live CanvasView's image cache (`_imgFor` is a VIEW method — these dialog renderers run on the PLUGIN; an earlier version
  // called this.`_imgFor` which is undefined on the Plugin → the thumbnail never rendered). Same-origin blob → no taint.
  _regionThumb(imgRef) {
    try {
      if (!imgRef || !imgRef.fileId) return null;
      let im = null; for (const v of (this._views || [])) { if (!v || v.destroyed) continue; try { const x = v._imgFor(imgRef.fileId); if (x && (x.naturalWidth || x.width)) { im = x; break; } } catch (_e) {} }
      if (!im || !(im.naturalWidth || im.width)) return null;
      const nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height, f = imgRef.frac;
      const sx = f ? Math.max(0, f.rx) * nw : 0, sy = f ? Math.max(0, f.ry) * nh : 0, sw = f ? Math.max(0.02, f.rw) * nw : nw, sh = f ? Math.max(0.02, f.rh) * nh : nh;
      const TW = 52, TH = Math.max(20, Math.min(64, Math.round(TW * (sh / Math.max(1, sw)))));
      const c = document.createElement('canvas'); c.width = TW; c.height = TH; c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, TW, TH);
      return c.toDataURL('image/png');
    } catch (_e) { return null; }
  }
  // F1/F3: append the connection breadcrumb to a backref row — `<from / thumbnail>  <dir glyph>  <label>` — falling back to
  // just the label for a plain (non-connection) ref. `cls` = 'cref' (record-page section) or 'bref' (multi-ref picker).
  _appendBrefContent(row, en, cls) {
    if (en.img) { const url = this._regionThumb(en.img); if (url) { const im = document.createElement('img'); im.className = 'plexus-' + cls + '-thumb'; im.src = url; row.appendChild(im); } else { const f = document.createElement('span'); f.className = 'plexus-' + cls + '-from'; f.textContent = 'image'; row.appendChild(f); } }
    else if (en.from) { const f = document.createElement('span'); f.className = 'plexus-' + cls + '-from'; f.textContent = en.from; row.appendChild(f); }
    if (en.from || en.img) { const d = document.createElement('span'); d.className = 'plexus-' + cls + '-dir'; d.textContent = this._dirGlyph(en.dir); row.appendChild(d); }
    const lbl = document.createElement('span'); lbl.className = 'plexus-' + cls + '-lbl'; lbl.textContent = en.label || 'reference'; row.appendChild(lbl);
  }
  // round-4: a rich HOVER popover for a note-side canvas reference (a line's blue ↗ flag or a record row) — shows, per entry,
  // a BIG image-region thumbnail + the source → direction → label breadcrumb. Connection refs read like the canvas info card;
  // a plain @ref gracefully shows just its name. pointer-events:none so it never blocks the badge's click.
  _showBrefHover(entries, anchorEl) {
    this._hideBrefHover();
    const arr = (Array.isArray(entries) ? entries : [entries]).filter(Boolean); if (!arr.length) return;
    const pop = document.createElement('div'); pop.className = 'plexus-bref-hover'; this._brefHoverEl = pop;
    for (const en of arr) {
      const row = document.createElement('div'); row.className = 'plexus-bh-row';
      if (en.img) { const u = this._regionThumb(en.img); if (u) { const im = document.createElement('img'); im.className = 'plexus-bh-thumb'; im.src = u; row.appendChild(im); } }
      const txt = document.createElement('div'); txt.className = 'plexus-bh-txt';
      if (en.from) { const fr = document.createElement('div'); fr.className = 'plexus-bh-from'; fr.textContent = en.from; txt.appendChild(fr); }
      const l2 = document.createElement('div'); l2.className = 'plexus-bh-lbl';
      if (en.from || en.img) { const dg = document.createElement('span'); dg.className = 'plexus-bh-dir'; dg.textContent = this._dirGlyph(en.dir); l2.appendChild(dg); }
      l2.appendChild(document.createTextNode(en.label || 'reference')); txt.appendChild(l2); row.appendChild(txt);
      pop.appendChild(row);
    }
    document.body.appendChild(pop);
    try { const r = anchorEl.getBoundingClientRect(), pw = pop.offsetWidth || 240, ph = pop.offsetHeight || 70, vw = window.innerWidth, vh = window.innerHeight;
      let left = Math.round(r.left); if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
      let top = Math.round(r.bottom + 6); if (top + ph > vh - 8) top = Math.max(8, Math.round(r.top) - ph - 6);
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; } catch (_e) {}
  }
  _hideBrefHover() { if (this._brefHoverEl) { try { this._brefHoverEl.remove(); } catch (_e) {} this._brefHoverEl = null; } }
  // Overlay a ↗ badge on the top-right of every pasted image-reference (idempotent; cheap; exits fast when none).
  _scanImageBadges() {
    let idx; try { idx = this._loadXref(); } catch (_e) { return; }
    let any = false; for (const k in idx) if (idx[k] && idx[k].image) { any = true; break; }
    if (!any) return;
    for (const li of document.querySelectorAll('.listitem[data-guid]')) {
      const g = li.getAttribute('data-guid'); const entry = idx[g]; if (!entry || !entry.image) continue;
      const img = li.querySelector('img'); if (!img) continue;
      const wrap = img.parentElement; if (!wrap) continue;
      if (wrap.querySelector(':scope > .plexus-imgref-badge')) continue;
      wrap.classList.add('plexus-imgref-wrap');
      const badge = document.createElement('div'); badge.className = 'plexus-imgref-badge'; badge.textContent = '↗';
      badge.title = 'Open the drawing and zoom to “' + (entry.label || 'this reference') + '”';
      badge.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._navToCanvasAnchor(entry); });
      wrap.appendChild(badge);
    }
  }
  // CANVAS-BACK-1: pin a ↗ on each note line/record that a canvas @@/@ chip points at → click flies to the canvas
  // chip (cinematic, via _navToCanvasAnchor). Inline badge (plain text lines have no image to attach to).
  _mkBackrefBadge(entries) {
    const arr = Array.isArray(entries) ? entries : [entries]; const n = arr.length;
    const badge = document.createElement('span'); badge.className = 'plexus-backref-badge'; badge.textContent = '↗';
    if (n > 1) { const c = document.createElement('span'); c.className = 'plexus-backref-count'; c.textContent = String(n); badge.appendChild(c); }
    badge.title = n > 1 ? (n + ' canvas references — click to choose which to fly to') : ('Zoom to “' + (arr[0] ? this._brefText(arr[0]) : 'this') + '” on the canvas'); // F1: tooltip carries the from → label breadcrumb
    badge.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); if (n <= 1) { if (arr[0]) this._navToCanvasAnchor(arr[0]); } else this._openBackrefPicker(arr, badge); });
    badge.addEventListener('mouseenter', () => this._showBrefHover(arr, badge)); badge.addEventListener('mouseleave', () => this._hideBrefHover()); // round-4: hovering the ↗ flag → rich popover (source/direction/thumbnail)
    return badge;
  }
  // MULTI-REF (request 5): when a line/record is referenced by >1 canvas element, the ↗ opens a small picker — choose
  // which reference to fly to (mirrors org-remark's multi-target nav). Single ref → fly directly (no menu).
  // B (round 3): tear down the picker + ALL its outside-dismiss listeners (pointerdown + mousedown + keydown, capture phase).
  _closeBrefMenu() {
    try { const m = document.getElementById('plexus-bref-menu'); if (m) m.remove(); } catch (_e) {}
    if (this._brefMenuClose) { for (const t of ['pointerdown', 'mousedown', 'keydown']) { try { document.removeEventListener(t, this._brefMenuClose, true); } catch (_e) {} } this._brefMenuClose = null; }
  }
  _openBackrefPicker(entries, anchorEl) {
    this._closeBrefMenu();
    const menu = document.createElement('div'); menu.id = 'plexus-bref-menu'; menu.className = 'plexus-bref-menu';
    const head = document.createElement('div'); head.className = 'plexus-bref-head'; head.textContent = entries.length + ' canvas references'; menu.appendChild(head);
    for (const en of entries) {
      const row = document.createElement('div'); row.className = 'plexus-bref-row';
      const dot = document.createElement('span'); dot.className = 'plexus-bref-dot'; dot.style.background = (en.kind === 'record' ? '#7c5cff' : '#0ea5e9'); row.appendChild(dot);
      this._appendBrefContent(row, en, 'bref'); // F1/F3: from → dir → label (+ region thumbnail)
      row.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._closeBrefMenu(); this._navToCanvasAnchor(en); });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    try { const r = anchorEl.getBoundingClientRect(); const mw = menu.offsetWidth || 220, mh = menu.offsetHeight || 0, vw = window.innerWidth, vh = window.innerHeight;
      let left = Math.round(r.left); if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);
      let top = Math.round(r.bottom + 4); if (top + mh > vh - 8) top = Math.max(8, Math.round(r.top) - mh - 4); // flip above the badge near the bottom edge
      menu.style.left = left + 'px'; menu.style.top = top + 'px'; } catch (_e) {}
    // B (round 3): dismiss on an outside press. Thymer's editor drives POINTERDOWN (and may swallow mousedown in capture),
    // so listen for BOTH in capture phase + Escape. Guard the opening gesture's own event frame with a 1-tick flag instead
    // of the old fragile setTimeout(0)+stopPropagation interplay (which left the first outside click un-dismissed).
    let isOpening = true; setTimeout(() => { isOpening = false; }, 1);
    const close = (e) => {
      if (isOpening) return;
      if (e.type === 'keydown') { if (e.key === 'Escape') { e.stopPropagation(); this._closeBrefMenu(); } return; }
      if (!menu.contains(e.target)) this._closeBrefMenu();
    };
    this._brefMenuClose = close;
    try { document.addEventListener('pointerdown', close, true); document.addEventListener('mousedown', close, true); document.addEventListener('keydown', close, true); } catch (_e) {}
  }
  _scanRefBadges() {
    let idx; try { idx = this._loadBackref(); } catch (_e) { return; }
    let any = false; for (const k in idx) { any = true; break; }
    // B3: when the index is empty BUT stale badges are still on the page (every connection to them was deleted), we must
    // still run to REMOVE them. Only skip when there's nothing to add AND nothing stale to clean.
    if (!any && !document.querySelector('.plexus-backref-badge, .plexus-canvas-refs')) return;
    // LINE targets → ↗ on the cited note line (`.listitem[data-guid]`). idx[g] is an ARRAY (all refs); badge shows the
    // count + opens a picker when >1. Filter to line-kind (a guid is single-kind, but stay defensive). RECONCILE: a line no
    // longer cited (its connection was deleted) drops its stale ↗.
    for (const li of document.querySelectorAll('.listitem[data-guid]')) {
      const g = li.getAttribute('data-guid'); const entries = (idx[g] || []).filter((e) => e.kind !== 'record');
      const existing = li.querySelector(':scope .plexus-backref-badge:not(.plexus-backref-rec)'); // (a record-page badge inside a title listitem must not shadow a line badge)
      if (!entries.length) { if (existing) existing.remove(); continue; } // B3: index dropped this line → remove the stale badge
      if (existing) continue; // already badged
      const host = li.querySelector('.lineitem-text') || li.querySelector('.line-div') || li;
      host.appendChild(this._mkBackrefBadge(entries));
    }
    // RECORD targets → a "Canvas References" SECTION in the native Backreferences footer (request 3); inline ↗ badge only
    // as a fallback when that footer isn't rendered. RECONCILE: a record no longer cited drops the section + the fallback badge.
    for (const root of document.querySelectorAll('.listview-items[data-guid]')) {
      const g = root.getAttribute('data-guid'); const entries = (idx[g] || []).filter((e) => e.kind === 'record');
      if (!entries.length) { // B3: index dropped this record → remove the stale section + fallback inline badge
        try { const panel = root.closest && root.closest('.editor-panel'); const body = panel && panel.querySelector('.tlr-body'); const sec = body && body.querySelector(':scope > .plexus-canvas-refs'); if (sec) sec.remove(); } catch (_e) {}
        const rb = root.querySelector(':scope > .plexus-backref-rec'); if (rb) rb.remove();
        continue;
      }
      let sectioned = false; try { sectioned = this._injectCanvasRefSection(root, entries); } catch (_e) {}
      if (sectioned) { try { const stale = root.querySelector(':scope > .plexus-backref-rec'); if (stale) stale.remove(); } catch (_e) {} continue; }
      // FALLBACK: no Backreferences footer (collapsed/absent) → inline ↗ badge on the record root.
      if (root.querySelector('.plexus-backref-rec')) continue;
      const host = root.querySelector('.page-props-editor') || root.querySelector('.page-title') || root.querySelector('.record-title') || root;
      const badge = this._mkBackrefBadge(entries); badge.classList.add('plexus-backref-rec');
      if (host === root) root.insertBefore(badge, root.firstChild); else host.appendChild(badge);
    }
  }
  // RECORD-PAGE "Canvas References" SECTION (request 3): instead of an inline ↗ chip on the record body, render a slot
  // inside Thymer's native Backreferences footer (`.tlr-body`, scoped to THIS record's `.editor-panel`) listing every
  // canvas ref to this record → click a row to fly to it. Returns true when injected. Idempotent via a content signature.
  _injectCanvasRefSection(root, entries) {
    let panel = (root.closest && root.closest('.editor-panel')) || null;
    if (!panel) { let n = root; for (let i = 0; i < 8 && n; i++) { if (/editor-panel/.test(n.className || '')) { panel = n; break; } n = n.parentElement; } }
    const body = panel ? panel.querySelector('.tlr-body') : null;
    if (!body) return false; // backreferences footer not rendered → caller falls back to the inline badge
    const sig = entries.length + ':' + entries.map((e) => e.el + '|' + (e.label || '') + '|' + (e.from || '') + '|' + (e.dir || '') + (e.img ? '|i' : '')).join(','); // re-render when the breadcrumb (from/dir/thumb) changes too (F1/F3)
    const existing = body.querySelector(':scope > .plexus-canvas-refs');
    if (existing) { if (existing.getAttribute('data-pxc-sig') === sig) return true; existing.remove(); }
    const slot = document.createElement('div'); slot.className = 'tlr-section-slot plexus-canvas-refs'; slot.setAttribute('data-pxc-sig', sig);
    const title = document.createElement('div'); title.className = 'tlr-title tlr-section-title text-details'; title.textContent = 'Canvas References'; slot.appendChild(title);
    const list = document.createElement('div'); list.className = 'plexus-cref-list';
    for (const en of entries) {
      const row = document.createElement('div'); row.className = 'plexus-cref-row';
      const ic = document.createElement('span'); ic.className = 'plexus-cref-ic'; ic.textContent = '↗'; ic.style.background = (en.kind === 'record' ? '#7c5cff' : '#0ea5e9'); row.appendChild(ic);
      this._appendBrefContent(row, en, 'cref'); // F1/F3: from → dir → label (+ region thumbnail)
      row.title = 'Fly to this reference on the canvas';
      row.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._navToCanvasAnchor(en); });
      const _en = en; row.addEventListener('mouseenter', () => this._showBrefHover([_en], row)); row.addEventListener('mouseleave', () => this._hideBrefHover()); // round-4: hover → big-thumbnail rich popover
      list.appendChild(row);
    }
    slot.appendChild(list);
    const status = body.querySelector(':scope > .tlr-status-slot');
    if (status && status.nextSibling) body.insertBefore(slot, status.nextSibling); else body.insertBefore(slot, body.firstChild);
    return true;
  }
  // Cross-ref encoded in the image blob filename (synced metadata → works on web AND desktop, not just the
  // client where it was made). Shape: plexusref~<drawing>~<el>~<x_y_w_h>~<labelURI>.png
  _encodeRefFilename(d) {
    const enc = (s) => encodeURIComponent(String(s == null ? '' : s)).replace(/~/g, '%7E');
    const reg = (d.region && isFinite(d.region.x)) ? [d.region.x, d.region.y, d.region.w, d.region.h].map((n) => Math.round(n)).join('_') : '';
    const frac = (d.inImage && d.frac) ? 'F' + [d.frac.rx, d.frac.ry, d.frac.rw, d.frac.rh].map((n) => (+n).toFixed(4)).join('_') : '';
    // Freehand shape as integers ×1000 (compact, keeps the filename < 255): P<fx_fy_fx_fy…>
    let poly = (d.fracPoly && d.fracPoly.length >= 3) ? 'P' + d.fracPoly.map((p) => Math.round(p.fx * 1000) + '_' + Math.round(p.fy * 1000)).join('_') : '';
    // Composite cite — EXTRA targets after the primary, as an 8th '~'-segment (old parsers ignore it):
    // `e.<guid>` (whole element) or `r.<guid>.<frac×1000 by '-'>[.<polyints by '-'>]` (in-image). Joined by '!'.
    // ULIDs are filename-safe (uppercase base32, no '.'/'!'/'-'), so '.'/'!'/'-' are unambiguous separators.
    const encExtra = (x) => {
      if (x.inImage && x.frac) {
        const fi = [x.frac.rx, x.frac.ry, x.frac.rw, x.frac.rh].map((n) => Math.round(n * 1000)).join('-');
        const pp = (x.fracPoly && x.fracPoly.length >= 3) ? x.fracPoly.map((p) => Math.round(p.fx * 1000) + '-' + Math.round(p.fy * 1000)).join('-') : '';
        return 'r.' + encodeURIComponent(x.el) + '.' + fi + (pp ? '.' + pp : '');
      }
      return 'e.' + encodeURIComponent(x.el);
    };
    let lbl = enc(d.label), extra = (d.extra && d.extra.length) ? d.extra.slice(0, 6) : null;
    const build = () => 'plexusref~' + enc(d.drawing) + '~' + enc(d.el) + '~' + reg + '~' + lbl + '~' + frac + '~' + poly + '~' + (extra && extra.length ? 'E' + extra.map(encExtra).join('!') : '') + '.png';
    let name = build();
    // Filenames must stay < 255: progressively strip until it fits — in-image extras, then all extras, then the
    // primary freehand poly (the frac rect still anchors the region), then clip the label as a last resort.
    if (name.length > 250 && extra) { extra = extra.filter((x) => !x.inImage); if (!extra.length) extra = null; name = build(); }
    if (name.length > 250 && extra) { extra = null; name = build(); }
    if (name.length > 250 && poly) { poly = ''; name = build(); }
    if (name.length > 250 && lbl.length > 8) { lbl = lbl.slice(0, 8); name = build(); }
    return name;
  }
  _parseRefFilename(fn) {
    if (!fn || fn.indexOf('plexusref~') !== 0) return null;
    const dec = (s) => { try { return decodeURIComponent(s || ''); } catch (_e) { return s || ''; } };
    const parts = fn.replace(/\.png$/i, '').split('~');
    const drawing = dec(parts[1]); if (!drawing) return null;
    const el = dec(parts[2]) || null;
    let region = null; if (parts[3]) { const p = parts[3].split('_').map(Number); if (p.length === 4 && p.every((n) => !isNaN(n))) region = { x: p[0], y: p[1], w: p[2], h: p[3] }; }
    const out = { drawing, el, region, label: dec(parts[4]) || 'region', image: true };
    if (parts[5] && parts[5][0] === 'F') { const p = parts[5].slice(1).split('_').map(Number); if (p.length === 4 && p.every((n) => !isNaN(n))) { out.inImage = true; out.frac = { rx: p[0], ry: p[1], rw: p[2], rh: p[3] }; } }
    if (parts[6] && parts[6][0] === 'P') { const nums = parts[6].slice(1).split('_').map(Number); if (nums.length >= 6 && nums.length % 2 === 0 && nums.every((n) => !isNaN(n))) { out.fracPoly = []; for (let i = 0; i < nums.length; i += 2) out.fracPoly.push({ fx: nums[i] / 1000, fy: nums[i + 1] / 1000 }); } }
    if (parts[7] && parts[7][0] === 'E') { // composite cite — extra targets
      const ex = [];
      for (const seg of parts[7].slice(1).split('!')) {
        if (!seg) continue; const f = seg.split('.');
        if (f[0] === 'e' && f[1]) ex.push({ el: dec(f[1]) });
        else if (f[0] === 'r' && f[1]) {
          const o = { el: dec(f[1]), inImage: true };
          if (f[2]) { const fr = f[2].split('-').map(Number); if (fr.length === 4 && fr.every((n) => !isNaN(n))) o.frac = { rx: fr[0] / 1000, ry: fr[1] / 1000, rw: fr[2] / 1000, rh: fr[3] / 1000 }; }
          if (f[3]) { const nums = f[3].split('-').map(Number); if (nums.length >= 6 && nums.length % 2 === 0 && nums.every((n) => !isNaN(n))) { o.fracPoly = []; for (let i = 0; i < nums.length; i += 2) o.fracPoly.push({ fx: nums[i] / 1000, fy: nums[i + 1] / 1000 }); } }
          ex.push(o);
        }
      }
      if (ex.length) out.extra = ex;
    }
    return out;
  }
  // On opening a note, rebuild the local index from the synced image-blob filenames, so the ↗ chips appear
  // on THIS client even if the reference was created elsewhere (the web↔desktop parity fix).
  async _syncImageRefsForRecord(rec) {
    try {
      if (!rec || !rec.guid || !rec.getLineItems) return;
      if (!this._syncedRecords) this._syncedRecords = new Set();
      if (this._syncedRecords.has(rec.guid)) { this._scanImageBadges(); return; } // deep-scan each record once/session
      this._syncedRecords.add(rec.guid);
      let items; try { items = await rec.getLineItems(); } catch (_e) { this._syncedRecords.delete(rec.guid); return; }
      let changed = false; const x = this._loadXref();
      for (const li of (items || [])) {
        if (!li || !li.guid || x[li.guid]) continue;
        let blob = null; try { blob = await li.getBlob(); } catch (_e) {}
        if (!blob || !blob.fileName) continue;
        const parsed = this._parseRefFilename(blob.fileName); if (!parsed) continue;
        x[li.guid] = Object.assign({ t: Date.now() }, parsed); changed = true;
      }
      if (changed) { this._saveXref(x); for (const v of this._views) { try { v._buildXrefIndex(); v.dirty = true; } catch (_e) {} } }
      this._scanImageBadges();
    } catch (_e) {}
  }
  // Note → canvas: open the cited drawing (or reuse an already-open view) and flash the cited element/region.
  // Match views by recordGuid (set at construction) — NOT rec.guid (async-loaded, unreliable); the codebase pattern.
  async _navToCanvasAnchor(entry) {
    try { this._hideBrefHover(); } catch (_e) {} // round-4: dismiss the hover popover when a ref is clicked
    if (!entry || !entry.drawing) return;
    const find = () => [...this._views].filter((v) => v.recordGuid === entry.drawing).pop();
    let view = find();
    if (!view) {
      // Page-flip IN PLACE — flip the active (note) panel to the drawing, no new side panel.
      try { await this._openPanelFor(entry.drawing, { inPlace: true }); } catch (_e) {}
      for (let i = 0; i < 40 && !view; i++) { await sleep(100); view = find(); }
    }
    if (!view) return;
    for (let j = 0; j < 25 && !view.rec; j++) await sleep(100); // let the scene load so the bbox is real before fitting
    // A3 (round 3): the connector may have been deleted but its index entry lingered (orphan) → verify it's a LIVE element;
    // if gone, prune the stale entry, refresh the badges, tell the user, and DON'T fly to a dead anchor.
    if (entry.el && view.scene && view.scene.elements && !view.scene.elements.some((e) => e.id === entry.el && !e.isDeleted)) {
      try { this._brefPruneEntry(entry.drawing, entry.el); } catch (_e) {}
      for (const v of this._views) { v.dirty = true; }
      try { this.ui.addToaster({ title: 'That connection no longer exists — removed the stale reference.', dismissible: true }); } catch (_e) {}
      return;
    }
    // Navigating TO the canvas → always start wide (the whole source image) then cinematically zoom into the region.
    try { view._flashAnchor(entry, { establishImage: true }); } catch (e) { console.error('[Plexus] navToAnchor', e); }
  }
  // UX-5/UX-6: lightweight settings modal (banner-preview toggle + dark canvas). Persisted to localStorage.
  // Granular multi-section settings panel (Excalidraw-parity; see SCRIPTS-ROADMAP "Settings" S1–S14).
  _openSettings() {
    const s = this._settings || (this._settings = loadPlexusSettings());
    const apply = (key) => { savePlexusSettings(s); if (key === 'defaultFont') PLEXUS_DEFAULT_FONT = s.defaultFont || 'system-ui, sans-serif'; if (key === 'linkOpacity') PLEXUS_LINK_ALPHA = (s.linkOpacity == null ? 100 : s.linkOpacity) / 100; if (key === 'imageCacheMax') this._imgCacheEvict(); for (const v of this._views) { v.dirty = true; if (key === 'bannerPreview') { try { v._scheduleBannerText(); } catch (_e) {} } if (key === 'zoomMin') v.camera.zoomMin = s.zoomMin; if (key === 'zoomMax') v.camera.zoomMax = s.zoomMax; } };
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
    toggle(gen, 'Force dark canvas (override theme)', 'darkMode', 'Dark mode auto-follows your Thymer theme; turn this on to force a dark canvas even on a light theme.');
    toggle(gen, 'Invert images in dark mode', 'invertImagesDark', 'Auto-inverts raster/SVG figures so they read on a dark canvas (zsviczian-style). Opt a single image out via the “Toggle image dark-invert” command.');

    const beh = section('Canvas behavior');
    toggle(beh, 'Double-click to create / edit text', 'dblClickText', 'Off disables double-click text editing (handy on touch).');

    const pen = section('Pen / Stylus');
    select(pen, 'Pen / stylus mode', 'defaultPenMode', 'When a pen draws freedraw without picking the Pen tool. Mobile = only on touch/coarse-pointer devices.', [{ v: 'never', l: 'Never' }, { v: 'mobile', l: 'On touch devices' }, { v: 'always', l: 'Always' }]);
    toggle(pen, 'One finger pans (pen draws)', 'penSingleFingerPan', 'While pen mode is active, a single finger pans and the pen draws. Off = finger also draws freedraw.');
    toggle(pen, 'Double-tap pen erases', 'penDoubleTapEraser', 'A quick double-tap with the pen deletes the element under the tip.');
    toggle(pen, 'Crosshair cursor in pen mode', 'penCrosshair', 'Shows a fine precision crosshair while a pen draws.');

    const itx = section('Interaction');
    range(itx, 'Long-press to open (ms)', 'longPressMs', 'Press-and-hold a record/board card this long to open it.', 200, 1500, 50);
    range(itx, 'Link indicator opacity (%)', 'linkOpacity', 'Opacity of @@ ref chips and card accent bars. Lower to de-emphasize links on dense graphs.', 0, 100, 1);
    toggle(itx, 'Open cards in a new panel', 'openInNewPanel', 'On = a record/board card opens in a side panel. Off = opens in place, replacing this canvas panel.');

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

    const adv = section('Advanced');
    range(adv, 'PDF import scale', 'pdfScale', 'Higher = sharper PDF pages (bigger images).', 1, 4, 0.5);
    range(adv, 'Render cull margin (px)', 'cullMargin', 'Off-screen buffer before culling — lower = faster on huge graphs, higher = less pop-in.', 0, 300, 20);
    toggle(adv, 'Cache decoded images', 'allowImageCache', 'Keep decoded images in memory so a large drawing doesn’t re-decode every frame. Off = decode on demand, never retain (lowest memory, slowest).');
    range(adv, 'Max cached images', 'imageCacheMax', 'How many decoded images to keep in memory. Least-recently-seen are dropped first — lower = less memory on huge graphs.', 16, 512, 8);
    action(adv, 'Image cache', 'Free all decoded images from memory now. Visible images re-decode automatically.', 'Purge image cache', () => { this._purgeImageCache(); try { this.ui.addToaster({ title: 'Plexus: image cache purged.', dismissible: true }); } catch (_e) {} });

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
  // Preloaded glyph library — ~99 curated Tabler symbols, searchable + categorized. Click → drops an `icon` element
  // at viewport centre (a real, move/resize/rotate/colour/export-able scene element). Reuses the .pxc-il-* drawer CSS.
  // Persist the toolbar config + live-rebuild every open view's toolbar.
  _applyToolbarConfig(cfg) { saveToolbarConfig(cfg); for (const v of this._views) { try { v._rebuildToolbar(); } catch (e) { console.error('[Plexus] toolbar rebuild', e); } } }
  // The granular toolbar customization page — show/hide + reorder items, edit the palette, set density/size/position.
  _openToolbarSettings() {
    let cfg = loadToolbarConfig();
    const apply = () => this._applyToolbarConfig(cfg);
    const overlay = document.createElement('div'); overlay.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box pxc-tbset';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'Customize toolbar'; box.appendChild(title);
    const body = document.createElement('div'); body.className = 'pxc-tbset-body'; box.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'pxc-tbset-foot';
    const reset = document.createElement('button'); reset.className = 'pxc-tb-reset'; reset.textContent = 'Reset to default';
    reset.addEventListener('click', () => { try { localStorage.removeItem('plexus_toolbar'); } catch (_e) {} cfg = loadToolbarConfig(); apply(); render(); });
    const done = document.createElement('button'); done.className = 'pxc-settings-close'; done.textContent = 'Done'; done.addEventListener('click', () => overlay.remove());
    foot.appendChild(reset); foot.appendChild(done); box.appendChild(foot);
    overlay.appendChild(box); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const head = (t) => { const d = document.createElement('div'); d.className = 'pxc-tb-h'; d.textContent = t; return d; };
    const render = () => {
      body.innerHTML = '';
      body.appendChild(head('Tools & buttons — show, hide, reorder'));
      const list = document.createElement('div'); list.className = 'pxc-tb-list';
      cfg.order.forEach((id, i) => {
        const row = document.createElement('div'); row.className = 'pxc-tb-row';
        const up = document.createElement('button'); up.className = 'pxc-tb-mv'; up.innerHTML = '<span class="ti ti-chevron-up"></span>'; up.disabled = i === 0;
        up.addEventListener('click', () => { if (i > 0) { const a = cfg.order; const tmp = a[i - 1]; a[i - 1] = a[i]; a[i] = tmp; apply(); render(); } });
        const dn = document.createElement('button'); dn.className = 'pxc-tb-mv'; dn.innerHTML = '<span class="ti ti-chevron-down"></span>'; dn.disabled = i === cfg.order.length - 1;
        dn.addEventListener('click', () => { if (i < cfg.order.length - 1) { const a = cfg.order; const tmp = a[i + 1]; a[i + 1] = a[i]; a[i] = tmp; apply(); render(); } });
        const ic = document.createElement('span'); ic.className = 'ti ' + toolbarItemIcon(id) + ' pxc-tb-ico';
        const lab = document.createElement('span'); lab.className = 'pxc-tb-lab'; lab.textContent = toolbarItemLabel(id);
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !cfg.hidden[id];
        cb.addEventListener('change', () => { if (cb.checked) delete cfg.hidden[id]; else cfg.hidden[id] = true; apply(); });
        row.appendChild(up); row.appendChild(dn); row.appendChild(ic); row.appendChild(lab); row.appendChild(cb); list.appendChild(row);
      });
      body.appendChild(list);
      body.appendChild(head('Colour palette'));
      const pal = (cfg.palette && cfg.palette.length) ? cfg.palette : PALETTE.slice();
      const palWrap = document.createElement('div'); palWrap.className = 'pxc-tb-pal';
      pal.forEach((c, i) => {
        const cell = document.createElement('div'); cell.className = 'pxc-tb-palcell';
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = c;
        inp.addEventListener('input', () => { const arr = (cfg.palette && cfg.palette.length) ? cfg.palette.slice() : PALETTE.slice(); arr[i] = inp.value; cfg.palette = arr; apply(); });
        const rm = document.createElement('button'); rm.className = 'pxc-tb-palrm'; rm.title = 'Remove'; rm.innerHTML = '<span class="ti ti-x"></span>';
        rm.addEventListener('click', () => { const arr = (cfg.palette && cfg.palette.length) ? cfg.palette.slice() : PALETTE.slice(); arr.splice(i, 1); cfg.palette = arr.length ? arr : null; apply(); render(); });
        cell.appendChild(inp); cell.appendChild(rm); palWrap.appendChild(cell);
      });
      const add = document.createElement('button'); add.className = 'pxc-tb-paladd'; add.innerHTML = '<span class="ti ti-plus"></span> Add colour';
      add.addEventListener('click', () => { const arr = (cfg.palette && cfg.palette.length) ? cfg.palette.slice() : PALETTE.slice(); arr.push('#7c5cff'); cfg.palette = arr; apply(); render(); });
      const resetPal = document.createElement('button'); resetPal.className = 'pxc-tb-paladd'; resetPal.textContent = 'Reset colours';
      resetPal.addEventListener('click', () => { cfg.palette = null; apply(); render(); });
      palWrap.appendChild(add); palWrap.appendChild(resetPal); body.appendChild(palWrap);
      body.appendChild(head('Layout'));
      const lay = document.createElement('div'); lay.className = 'pxc-tb-layout';
      const sel = (label, value, opts, on) => { const r = document.createElement('label'); r.className = 'pxc-tb-lrow'; const s = document.createElement('span'); s.textContent = label; const el = document.createElement('select'); for (const [v, t] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; if (value === v) o.selected = true; el.appendChild(o); } el.addEventListener('change', () => on(el.value)); r.appendChild(s); r.appendChild(el); return r; };
      lay.appendChild(sel('Density', cfg.density, [['comfortable', 'Comfortable'], ['compact', 'Compact']], (v) => { cfg.density = v; apply(); }));
      const sizeRow = document.createElement('label'); sizeRow.className = 'pxc-tb-lrow'; const ss = document.createElement('span'); ss.textContent = 'Icon size'; const range = document.createElement('input'); range.type = 'range'; range.min = '22'; range.max = '44'; range.value = String(cfg.iconSize); range.addEventListener('input', () => { cfg.iconSize = +range.value; apply(); }); sizeRow.appendChild(ss); sizeRow.appendChild(range); lay.appendChild(sizeRow);
      lay.appendChild(sel('Position', cfg.position, [['top', 'Top bar'], ['left', 'Left rail']], (v) => { cfg.position = v; apply(); }));
      body.appendChild(lay);
    };
    document.body.appendChild(overlay); render();
  }
  async _openIconGlyphLibrary() {
    const v0 = this._activeView();
    if (!v0) { try { this.ui.addToaster({ title: 'Plexus: open a drawing first.', dismissible: true }); } catch (_e) {} return; }
    const overlay = document.createElement('div'); overlay.className = 'pxc-settings-overlay';
    const box = document.createElement('div'); box.className = 'pxc-settings-box pxc-iconlib';
    const title = document.createElement('div'); title.className = 'pxc-settings-title'; title.textContent = 'Icons'; box.appendChild(title);
    const search = document.createElement('input'); search.className = 'pxc-il-search'; search.placeholder = 'Search icons…'; box.appendChild(search);
    const grid = document.createElement('div'); grid.className = 'pxc-il-grid'; box.appendChild(grid);
    const close = document.createElement('button'); close.className = 'pxc-settings-close'; close.textContent = 'Done';
    close.addEventListener('click', () => overlay.remove()); box.appendChild(close);
    overlay.appendChild(box); overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    const drop = (name) => {
      const view = this._activeView() || v0; if (view) {
        const c = view.camera.screenToWorld(view.cssW / 2, view.cssH / 2);
        const el = makeIcon(view._snap(c.x - 24), view._snap(c.y - 24), 48, name, { stroke: view.strokeColor });
        if (!el.glyph) { try { this.ui.addToaster({ title: 'Plexus: that icon isn’t available.', dismissible: true }); } catch (_e) {} return; }
        view.scene.elements.push(el); view.selected.clear(); view.selected.add(el.id); view.dirty = true; view.scheduleSave();
      }
      overlay.remove();
    };
    const render = (q) => {
      grid.innerHTML = ''; q = (q || '').trim().toLowerCase();
      for (const cat of ICON_CATALOG) {
        const hits = cat.names.filter((n) => !q || n.includes(q));
        if (!hits.length) continue;
        const h = document.createElement('div'); h.className = 'pxc-il-cat'; h.textContent = cat.group; grid.appendChild(h);
        for (const name of hits) {
          const cell = document.createElement('button'); cell.className = 'pxc-il-cell'; cell.title = name.replace('ti-', '');
          cell.innerHTML = '<span class="ti ' + name + ' pxc-il-glyph"></span><span class="pxc-il-cap">' + name.replace('ti-', '') + '</span>';
          cell.addEventListener('click', () => drop(name)); grid.appendChild(cell);
        }
      }
    };
    let st; search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => render(search.value), 80); }); // debounce
    render('');
  }
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
      // DIAGNOSTIC (round-4): read the active drawing's state — element-type histogram, the selected element(s), and every
      // connection's endpoints — so a maintainer can inspect the live scene without reaching the encapsulated CanvasView.
      dump: () => {
        const v = this._activeView() || [...this._views].pop(); if (!v) return { error: 'no active view' };
        const els = v.scene.elements.filter((e) => !e.isDeleted);
        const types = {}; for (const e of els) types[e.type] = (types[e.type] || 0) + 1;
        const sel = [...v.selected].map((id) => { const e = els.find((x) => x.id === id); return e ? { type: e.type, w: Math.round(e.width), h: Math.round(e.height), angle: +(e.angle || 0).toFixed(2), fill: e.backgroundColor, fillStyle: e.fillStyle } : null; }).filter(Boolean);
        const conns = els.filter((e) => e.type === 'arrow' || e.type === 'line').map((e) => { const d = (b) => b ? (b.group ? { group: (b.group.ids || []).length, regions: (b.group.regions || []).length, freeRegions: (b.group.regions || []).filter((r) => r && r.worldPoly).length } : { t: (v._byId(b.elementId) || {}).type, frac: !!b.frac, line: !!b.lineGuid, ref: b.refGuidTarget || null, refKind: b.refKindTarget || null }) : null; return { start: d(e.startBinding), end: d(e.endBinding), sa: e.startArrowhead, ea: e.endArrowhead, relType: e.relType || null, lineStyle: e.lineStyle || 'solid' }; });
        // round-4 thumbnail diagnostic: for every image-bound connection endpoint, does _imgFor resolve a loaded image and does _regionThumb produce a data URL?
        const thumbTest = [];
        for (const e of els) { if (e.type !== 'arrow' && e.type !== 'line') continue; for (const b of [e.startBinding, e.endBinding]) { if (!b || !b.elementId) continue; const t = v._byId(b.elementId); if (!t || t.type !== 'image') continue; let im = null, thumb = 'NULL', err = null; try { im = v._imgFor(t.fileId); } catch (x) { err = 'imgFor:' + x; } try { const u = this._regionThumb({ fileId: t.fileId, frac: b.frac || null }); if (u) thumb = 'dataURL(' + u.length + ')'; } catch (x) { err = (err || '') + ' regionThumb:' + x; } thumbTest.push({ fileId: t.fileId, frac: !!b.frac, imgResolved: !!im, imgWH: im ? ((im.naturalWidth || im.width) + 'x' + (im.naturalHeight || im.height)) : null, thumb, err }); } }
        return { version: PLEXUS_VERSION, n: els.length, types, selected: sel, connections: conns, imgFiles: Object.keys(v.scene.files || {}).length, thumbTest };
      },
      // PERF BASELINE (architecture audit): seed N synthetic elements into the active drawing, then time the hot
      // paths so the spatial-index / delta-persistence phases are authorised by a real flamegraph, not a code-read.
      // Console: `window.__plexusCanvas.test.bench(5000)` (then 20000, 50000). `benchReset()` clears the scene.
      bench: (n) => {
        const v = this._activeView() || [...this._views].pop(); if (!v) return { error: 'no view' };
        n = n || 5000;
        const t0 = performance.now(), cols = Math.max(1, Math.ceil(Math.sqrt(n))), types = ['rectangle', 'ellipse', 'diamond'];
        for (let i = 0; i < n; i++) {
          const gx = (i % cols) * 60, gy = Math.floor(i / cols) * 60;
          v.scene.elements.push(makeRect(gx, gy, 40, 30, { type: types[i % 3], stroke: '#7c5cff', fill: 'transparent' }));
          if (i % 7 === 0 && i > 0) { const a = makeLinear(gx, gy, 'arrow', { stroke: '#0ea5e9', strokeWidth: 2 }); a.points[1] = [gx - 30, gy - 30]; linearBBox(a); v.scene.elements.push(a); }
        }
        v._gridDirty = true; v._cacheValid = false; // seeded elements changed geometry → rebuild index before the timed hit-tests
        const live = v.scene.elements.filter((e) => !e.isDeleted).length, seedMs = performance.now() - t0;
        const time = (fn, reps) => { reps = reps || 1; const s = performance.now(); for (let i = 0; i < reps; i++) fn(); return +((performance.now() - s) / reps).toFixed(3); };
        const byId = time(() => { const els = v.scene.elements; for (let i = 0; i < 200; i++) v._byId(els[(i * 53) % els.length].id); });
        const bind = time(() => v._updateBindings(), 5);
        const render = time(() => { v._cacheValid = false; v.render(); }, 3);
        const hit = time(() => { for (let i = 0; i < 50; i++) v._hitTopAt(Math.random() * 3000, Math.random() * 3000); });
        const bounds = time(() => sceneBounds(v.scene), 3);
        const snap = time(() => v._snapshot(), 3), snapKB = Math.round(v._snapshot().length / 1024);
        return { n: live, seedMs: +seedMs.toFixed(1), byId200Ms: byId, updateBindingsMs: bind, renderMs: render, hitTest50Ms: hit, sceneBoundsMs: bounds, snapshotMs: snap, snapshotKB: snapKB };
      },
      benchReset: () => { const v = this._activeView() || [...this._views].pop(); if (!v) return { error: 'no view' }; const before = v.scene.elements.length; v.scene.elements = []; v.selected.clear(); v._cacheValid = false; v._gridDirty = true; v.dirty = true; return { cleared: before }; },
      // PAN SCALE: prove panning is O(1) — compositorPanPerFrameMs should be ~0 and FLAT regardless of element count (a 100K
      // board pans as smoothly as one image), while fullRasterMs (the occasional boundary-cross re-render) is O(visible).
      // Console: `__plexusCanvas.test.bench(100000); __plexusCanvas.test.panScaleBench()` then compare to bench(100).
      panScaleBench: () => {
        const v = this._activeView() || [...this._views].pop(); if (!v) return { error: 'no view' };
        const n = v.scene.elements.filter((e) => !e.isDeleted).length;
        const time = (fn, reps) => { reps = reps || 30; const s = performance.now(); for (let i = 0; i < reps; i++) fn(); return +((performance.now() - s) / reps).toFixed(3); };
        v._panMode = false; v._staticRasterCam = null; v.render(); // warm
        const fullRasterMs = time(() => { v._staticRasterCam = null; v.render(); }, 8); // O(visible) re-center
        v._staticRasterCam = { x: v.camera.x, y: v.camera.y, zoom: v.camera.zoom }; v._panMode = true;
        const compositorPanPerFrameMs = time(() => { v.camera.x += 1; v.render(); }, 60); // CSS-transform fast path (no raster)
        v._panMode = false; v._staticRasterCam = null; v.dirty = true;
        return { n, renderPad: v._renderPad, fullRasterMs, compositorPanPerFrameMs, note: 'compositorPanPerFrameMs ~0 & flat across n = O(1) pan' };
      },
      // CONNECTIONS (Phase 2): bind an arrow to ANY element + a midpoint label that tracks the connector. Verifies binding
      // attaches to a card's bbox edge, the label centers on the live midpoint, and both FOLLOW when an endpoint moves.
      connTest: () => {
        const v = this._activeView() || [...this._views].pop(); if (!v) return { error: 'no view' };
        const ok = []; const a = (c, m) => ok.push((c ? 'ok ' : 'FAIL ') + m);
        const card = makeRect(0, 0, 200, 120, { type: 'rectangle' }); card.type = 'record'; card.recordGuid = 'fake'; // a non-shape target
        const tgt = makeRect(600, 400, 160, 90, { type: 'rectangle' }); tgt.type = 'image'; tgt.fileId = 'fake';
        const arrow = makeLinear(100, 60, 'arrow', { stroke: '#7c5cff' }); arrow.points = [[100, 60], [680, 445]]; arrow.startBinding = { elementId: card.id }; arrow.endBinding = { elementId: tgt.id }; linearBBox(arrow);
        v.scene.elements.push(card, tgt, arrow); v._gridDirty = true;
        a(!!v._bindableAt(100, 60, arrow.id), '_bindableAt finds the (non-shape) record card');
        v._updateBindings();
        a(arrow.points[0][0] > 195 && arrow.points[0][0] <= 210, 'start endpoint snapped to the card bbox edge (~x=200..205) got ' + arrow.points[0][0].toFixed(1));
        // label
        const label = makeText(0, 0, { stroke: '#7c5cff', fontSize: 16 }); label.text = 'because'; label.midBinding = { arrowId: arrow.id }; label.width = 60; label.height = 18;
        v.scene.elements.push(label); v._updateBindings();
        const mid = pxcPolyMidpoint(routedPoints(arrow));
        a(Math.abs(label.x + label.width / 2 - mid.x) < 0.5 && Math.abs(label.y + label.height / 2 - mid.y) < 0.5, 'label centered on connector midpoint');
        // move the target → arrow end + label follow
        const lx0 = label.x; tgt.x += 300; tgt.y += 200; v._updateBindings();
        a(label.x !== lx0, 'label followed when the bound target moved');
        a(arrow.endBinding != null && arrow.points[1][0] > 880, 'end endpoint followed the moved target');
        // free on connector delete
        arrow.isDeleted = true; v._updateBindings();
        a(label.midBinding == null && !label.isDeleted, 'label freed (not deleted) when its connector is gone');
        // cleanup
        for (const e of [card, tgt, arrow, label]) e.isDeleted = true; v._gridDirty = true; v.dirty = true;
        return { pass: ok.every((s) => s.startsWith('ok')), results: ok };
      },
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
      // A2: @/@@ trigger parser (the highest-risk UX gate).
      refTriggerTest: () => {
        const t = (s, c) => pxcParseRefTrigger(s, c == null ? s.length : c);
        const a = t('@@oreg'), b = t('hello @bob'), c2 = t('a@@ b'), d = t('email@x'), e = t('@');
        return { a, b, c: c2, d, e, ok:
          !!a && a.mode === 'line' && a.query === 'oreg' && a.triggerStart === 0 &&
          !!b && b.mode === 'record' && b.query === 'bob' && b.triggerStart === 6 &&
          c2 === null && d === null && !!e && e.mode === 'record' && e.query === '' };
      },
      // A1/A3: ref-chip configuration (record vs line, alias precedence, @/@@ prefix).
      refChipTest: () => {
        const view = v(); if (!view) return { error: 'no view' };
        const r = makeText(0, 0, { fontSize: 16 }); view._configureRef(r, { kind: 'record', guid: 'REC1', label: 'Oregon' });
        const l = makeText(0, 0, { fontSize: 16 }); view._configureRef(l, { kind: 'line', guid: 'REC2', lineGuid: 'LINE1', label: 'a snippet', alias: 'see here' });
        return { r: { kind: r.refKind, guid: r.refGuid, text: r.text }, l: { kind: l.refKind, line: l.refLineGuid, text: l.text },
          ok: r.refKind === 'record' && r.refGuid === 'REC1' && r.text === '@Oregon' && r.isRef === true && r.width > 0 &&
              l.refKind === 'line' && l.refGuid === 'REC2' && l.refLineGuid === 'LINE1' && l.text === '@@see here' };
      },
      // CANVAS-SEG: inline-run model — flatten leaves no '@', layout x-extents are monotonic, ref hit-tests, splice + edit-dissolve.
      inlineSegTest: () => {
        const el = makeText(0, 0, { fontSize: 16 });
        el.runs = [{ t: 'text', s: 'see ' }, { t: 'ref', kind: 'record', guid: 'R1', label: 'Oregon' }, { t: 'text', s: ' now' }];
        el.text = flattenRuns(el.runs);
        const layout = measureRuns(el), refRow = layout.find((p) => p.run.t === 'ref'), line0 = layout.filter((p) => p.line === 0);
        let mono = true; for (let i = 1; i < line0.length; i++) if (line0[i].x < line0[i - 1].x) mono = false;
        return { text: el.text, runs: layout.length, ok: el.text === 'see Oregon now' && el.text.indexOf('@') === -1 && layout.length === 3 && !!refRow && refRow.w > 0 && mono && el.width > 0 };
      },
      inlineHitTest: () => {
        const el = makeText(10, 20, { fontSize: 16 });
        el.runs = [{ t: 'text', s: 'a ' }, { t: 'ref', kind: 'line', guid: 'R', lineGuid: 'L', label: 'thing' }];
        el.text = flattenRuns(el.runs); measureRuns(el);
        const p = _pxcRunLayout.get(el).find((q) => q.run.t === 'ref');
        const inHit = hitInlineRef(el, 10 + p.x + p.w / 2, 20 + 4), miss = hitInlineRef(el, 10 + 1, 20 + 4);
        return { hit: !!inHit, miss: miss, ok: !!inHit && inHit.guid === 'R' && inHit.lineGuid === 'L' && miss === null };
      },
      inlineApplyTest: () => {
        const out = spliceRunRange([{ t: 'text', s: 'foo bar' }], 4, 7, { t: 'ref', kind: 'record', guid: 'G', label: 'Bar' });
        const flat = flattenRuns(out), open = out.find((r) => r.t === 'ref');
        return { runs: out.length, flat, ok: out.length === 2 && out[0].t === 'text' && out[0].s === 'foo ' && flat === 'foo Bar' && flat.indexOf('@') === -1 && !!open && open.guid === 'G' };
      },
      inlineEditTest: () => {
        const runs = [{ t: 'text', s: 'x ' }, { t: 'ref', kind: 'record', guid: 'G', label: 'Bar' }, { t: 'text', s: ' y' }];
        const old = flattenRuns(runs);
        const keep = applyFlatEdit(runs, old, 'x Bar yz'), dissolve = applyFlatEdit(runs, old, 'x Bzr y');
        return { keep: hasRefRun(keep), dissolve: hasRefRun(dissolve), ok: hasRefRun(keep) === true && hasRefRun(dissolve) === false && flattenRuns(keep) === 'x Bar yz' && flattenRuns(dissolve) === 'x Bzr y' };
      },
      // SEARCH-CREATE: the Create row is suppressed iff an exact-title match exists; mid-text bind splices over the
      // plain query text we leave in place (token already stripped of its '@').
      searchCreateTest: () => {
        const rows = [{ kind: 'record', guid: 'A', label: 'Oregon' }, { kind: 'record', guid: 'B', label: 'Oregon Trail' }];
        const noExact = pxcHasExactTitle(rows, 'Oreg'), exact = pxcHasExactTitle(rows, 'oregon'), bare = pxcHasExactTitle([], '');
        const baseRuns = [{ t: 'text', s: 'note Oregon end' }]; // editor left 'Oregon' as plain text at offset 5
        const out = spliceRunRange(baseRuns, 5, 11, { t: 'ref', kind: 'record', guid: 'NEW', label: 'Oregon' });
        const flat = flattenRuns(out), ref = out.find((r) => r.t === 'ref');
        return { noExact, exact, bare, flat, ok: noExact === false && exact === true && bare === true && flat === 'note Oregon end' && flat.indexOf('@') === -1 && !!ref && ref.guid === 'NEW' };
      },
      // TRANSCLUDE: linecard element shape + bbox hit-test (verifies the hit/resize whitelist edits).
      lineCardTest: () => {
        const el = makeLineCard(10, 10, 200, 100, 'L1', 'R1');
        const inside = hitElement(el, 60, 40, 4), outside = hitElement(el, 999, 999, 4);
        return { type: el.type, inside, outside, ok: el.type === 'linecard' && el.lineGuid === 'L1' && el.recordGuid === 'R1' && inside === true && outside === false };
      },
      // IMG-REF: image-ref chip carries refKind=image + parent record (refGuid) + attachment line (refLineGuid).
      imgRefTest: () => {
        const view = v(); if (!view) return { error: 'no view' };
        const el = makeText(0, 0, { fontSize: 16 });
        view._configureRef(el, { kind: 'image', guid: 'RECP', lineGuid: 'IMGLINE', label: 'photo.png' });
        return { kind: el.refKind, guid: el.refGuid, line: el.refLineGuid, text: el.text, ok: el.refKind === 'image' && el.refGuid === 'RECP' && el.refLineGuid === 'IMGLINE' && el.isRef === true && el.text.indexOf('photo.png') !== -1 && el.strokeColor === '#a855f7' };
      },
      // CANVAS-BACK-1: backref store round-trips the entry shape _navToCanvasAnchor consumes.
      backrefRoundTripTest: () => {
        const k = '__pxc_backref_test__'; this._registerBackref(k, { drawing: '__pxc_test_D__', el: 'E', label: 'L', kind: 'line' });
        const got = this._lookupBackref(k); // ARRAY now
        try { this._brefPruneDrawing('__pxc_test_D__'); } catch (_e) {}
        return { got, ok: Array.isArray(got) && got.length === 1 && got[0].drawing === '__pxc_test_D__' && got[0].el === 'E' && got[0].label === 'L' && got[0].kind === 'line' };
      },
      // FLYBACK + MULTI-REF: rebuild-on-save indexes whole-element chips AND inline @@/@ runs (line→lineGuid,
      // record→guid, image skipped); the SAME target referenced by two elements keeps BOTH (picker); self-heals on remove.
      reindexFlybackTest: () => {
        const view = v(); if (!view) return { error: 'no view' };
        const D = '__pxc_reindex_D__';
        const fake = { plugin: this, recordGuid: D, scene: { elements: [
          { id: 'E1', isRef: true, refKind: 'line', refLineGuid: 'LG1', refLabel: 'vet' },
          { id: 'E2', isRef: true, refKind: 'record', refGuid: 'RG1', refLabel: 'Appt', refAlias: 'see' },
          { id: 'E3', isRef: true, refKind: 'image', refGuid: 'RG9', refLineGuid: 'IMG9' }, // image owns the xref path → skipped
          { id: 'E4', type: 'text', runs: [{ t: 'text', s: 'a ' }, { t: 'ref', kind: 'line', guid: 'RP', lineGuid: 'LG2', label: 'snippet' }, { t: 'ref', kind: 'record', guid: 'RG2', label: 'Topic' }] },
          { id: 'E5', isRef: true, refKind: 'record', refGuid: 'RG1', refLabel: 'dup' }, // 2nd ref to RG1 → BOTH kept (multi)
        ] } };
        view._reindexBackrefs.call(fake);
        const f = this._loadBackref();
        const byEl = (arr) => (arr || []).reduce((m, e) => { m[e.el] = e; return m; }, {});
        const rg1 = byEl(f.RG1);
        const r = {
          line1: !!f.LG1 && f.LG1.length === 1 && f.LG1[0].kind === 'line' && f.LG1[0].el === 'E1' && f.LG1[0].drawing === D,
          recMulti: !!f.RG1 && f.RG1.length === 2 && !!rg1.E2 && !!rg1.E5 && rg1.E2.kind === 'record',
          imgSkip: !f.IMG9 && !f.RG9,
          runLine: !!f.LG2 && f.LG2[0].kind === 'line' && f.LG2[0].el === 'E4',
          runRec: !!f.RG2 && f.RG2[0].kind === 'record' && f.RG2[0].el === 'E4',
        };
        fake.scene.elements = [{ id: 'E1', isRef: true, refKind: 'line', refLineGuid: 'LG1', refLabel: 'vet' }];
        view._reindexBackrefs.call(fake);
        const f2 = this._loadBackref();
        r.heal = !!f2.LG1 && !f2.RG1 && !f2.LG2 && !f2.RG2;
        try { this._brefPruneDrawing(D); } catch (_e) {}
        return { r, ok: r.line1 && r.recMulti && r.imgSkip && r.runLine && r.runRec && r.heal };
      },
      // AI AUTO-CLUSTER: connected-components clustering by cosine + string-array parsing.
      clusterTest: () => {
        // 4 vectors: 0&1 alike (pointing +x), 2&3 alike (pointing +y) → 2 clusters
        const v = [[1, 0], [0.99, 0.14], [0, 1], [0.14, 0.99]];
        const cl = pxcClusterByThreshold(v, 0.5);
        cl.sort((a, b) => a[0] - b[0]);
        const single = pxcClusterByThreshold([[1, 0], [0, 1], [-1, 0]], 0.5); // all dissimilar → 3 singletons
        const names = pxcParseStringArray('```json\n["Health","Work","Ideas"]\n```');
        return { groups: cl.length, ok:
          cl.length === 2 && cl[0].length === 2 && cl[1].length === 2 && cl[0][0] === 0 && cl[0][1] === 1 && cl[1][0] === 2 &&
          single.length === 3 && names.length === 3 && names[0] === 'Health' &&
          pxcParseStringArray('garbage').length === 0 };
      },
      // AI RELATION-SUGGEST: tolerant suggestion parsing + HTML escaping.
      aiSuggestTest: () => {
        const a = pxcParseLinkSuggestions('[{"from":0,"to":1,"reason":"x"},{"from":2,"to":2},{"from":1,"to":3,"reason":"y"}]');
        const b = pxcParseLinkSuggestions('Sure! ```json\n[{"from":1,"to":0,"reason":"z"}]\n``` done');
        const c2 = pxcParseLinkSuggestions('not json at all');
        return { a: a.length, b: b.length, ok:
          a.length === 2 && a[0].from === 0 && a[0].to === 1 && a[1].from === 1 && a[1].to === 3 && // self-link dropped
          b.length === 1 && b[0].from === 1 && b[0].to === 0 &&
          c2.length === 0 &&
          pxcEsc('<b>&"x"</b>') === '&lt;b&gt;&amp;"x"&lt;/b&gt;' };
      },
      // TIMELINE: ms↔x axis math round-trips at day granularity (snap to nearest day).
      timelineTest: () => {
        const day0 = 1700000000000 - (1700000000000 % 86400000), x0 = 100, ppd = 40;
        const d3 = day0 + 3 * 86400000, x = pxcTimelineX(d3, day0, x0, ppd);
        const back = pxcTimelineMs(x, day0, x0, ppd);
        const snap = pxcTimelineMs(x0 + 2.4 * ppd, day0, x0, ppd); // 2.4 days → snaps to day 2
        const lm = new Date(2026, 5, 15).getTime(); // LOCAL midnight Jun 15 → +Nd round-trips to the right local date (no off-by-one)
        const isoOk = pxcMsToIsoLocal(lm) === '2026-06-15' && pxcMsToIsoLocal(pxcTimelineMs(pxcTimelineX(lm + 2 * 86400000, lm, x0, ppd), lm, x0, ppd)) === '2026-06-17';
        return { x, back, isoOk, ok: x === x0 + 3 * ppd && back === d3 && snap === day0 + 2 * 86400000 && pxcTimelineX(day0, day0, x0, ppd) === x0 && isoOk };
      },
      // LIVE TABLE: cell-index math (header row, Name col, clamping) + element shape.
      tableTest: () => {
        const el = makeTable(100, 50, 400, 240, '@task', ['Status', 'Due']); // nCol = 3 (Name + 2), colW = 400/3 ≈ 133.3, rowH 26
        const hdr = pxcTableCellIndex(el.x, el.y, el.width, 3, 26, 110, 56);   // header row (ri 0), Name col (0)
        const cell = pxcTableCellIndex(el.x, el.y, el.width, 3, 26, 100 + 133.4 * 1.5, 50 + 26 * 2.5); // col 1, ri 2
        const clampL = pxcTableCellIndex(el.x, el.y, el.width, 3, 26, -999, 50); // left of table → col 0 clamp
        const clampR = pxcTableCellIndex(el.x, el.y, el.width, 3, 26, 99999, 50); // right → col nCol-1 clamp
        const inside = hitElement(el, 200, 100, 4), outside = hitElement(el, 9999, 9999, 4);
        return { type: el.type, hdr, cell, ok:
          el.type === 'table' && el.cols.length === 2 &&
          hdr.ri === 0 && hdr.col === 0 && cell.col === 1 && cell.ri === 2 &&
          clampL.col === 0 && clampR.col === 2 && inside === true && outside === false };
      },
      // ROLL-UP CARDS: agg-spec parsing + numeric aggregation.
      rollupTest: () => {
        const P = pxcParseAgg, C = pxcComputeAgg;
        const nums = [2, 4, 6];
        return { ok:
          P('count').fn === 'count' && P('').fn === 'count' && P('%done').fn === 'pctdone' && P('%').fn === 'pctdone' &&
          P('sum:Hours').fn === 'sum' && P('sum:Hours').prop === 'Hours' &&
          P('avg:Recovery').fn === 'avg' && P('mean=Score').fn === 'avg' && P('Average: X').fn === 'avg' &&
          P('min:A').fn === 'min' && P('max:B').fn === 'max' && P('garbage').fn === 'count' &&
          C('sum', nums, 99) === 12 && C('avg', nums, 99) === 4 && C('min', nums, 99) === 2 && C('max', nums, 99) === 6 &&
          C('count', nums, 7) === 7 && C('avg', [], 0) === 0 && C('avg', [1, 2], 9) === 1.5 };
      },
      // BULK PROPERTY BRUSH: value classification routes the right setter for non-choice props.
      bulkBrushTest: () => {
        const c = pxcClassifyValue, iso = pxcToIsoDate;
        const a = c('Done'), b = c('2026-07-01'), d = c('7/1/2026'), e = c('42'), f = c('-3.5'), g = c('  Hello world ');
        return { a: a.kind, b: b.iso, d: d.iso, e: e.num, ok:
          a.kind === 'text' && a.text === 'Done' &&
          b.kind === 'date' && b.iso === '2026-07-01' &&
          d.kind === 'date' && d.iso === '2026-07-01' &&
          e.kind === 'number' && e.num === 42 &&
          f.kind === 'number' && f.num === -3.5 &&
          g.kind === 'text' && g.text === 'Hello world' &&
          iso('2026-7-1') === '2026-07-01' && iso('not a date') === null };
      },
      // MINIMAP: fit math round-trips (world↔mini), respects padding, and centres bounds in the panel.
      miniMapTest: () => {
        const b = { x: -100, y: 50, w: 400, h: 200 }, W = 178, H = 116, pad = 8;
        const m = pxcMiniFit(b, W, H, pad);
        const toMini = (wx, wy) => ({ x: m.ox + wx * m.scale, y: m.oy + wy * m.scale });
        const toWorld = (mx, my) => ({ x: (mx - m.ox) / m.scale, y: (my - m.oy) / m.scale });
        const p = toMini(b.x, b.y), q = toMini(b.x + b.w, b.y + b.h), rt = toWorld(p.x, p.y);
        const inset = p.x >= pad - 0.01 && q.x <= W - pad + 0.01 && p.y >= pad - 0.01 && q.y <= H - pad + 0.01;
        return { scale: m.scale, inset, ok: !!m && m.scale > 0 && inset && Math.abs(rt.x - b.x) < 1e-6 && Math.abs(rt.y - b.y) < 1e-6 && pxcMiniFit({ x: 0, y: 0, w: 0, h: 0 }, W, H, pad) === null };
      },
      // BACKREF-SYNC: per-drawing sub-maps — migrate (flat→nested), flatten (newest wins), merge, prune (GC).
      brefStoreTest: () => {
        const flat = { L1: { drawing: 'DA', el: 'e1', label: 'a', t: 1 }, L2: { drawing: 'DB', el: 'e2', label: 'b', t: 2 } };
        const nested = pxcBrefMigrate(flat);
        const mig = nested.DA && nested.DA.L1 && nested.DB && nested.DB.L2;
        const idem = JSON.stringify(pxcBrefMigrate(nested)) === JSON.stringify(nested); // migrating an already-nested store is a no-op
        const fl = pxcBrefFlatten(nested); const flatOk = fl.L1.drawing === 'DA' && fl.L2.drawing === 'DB';
        // two drawings ref the SAME line → newest (higher t) wins in the flat view
        const collide = pxcBrefMigrate({}); collide.DA = { LX: { el: 'old', t: 1 } }; collide.DB = { LX: { el: 'new', t: 5 } };
        const winNew = pxcBrefFlatten(collide).LX.el === 'new';
        // merge keeps both drawings; prune drops one
        const merged = pxcBrefMergeNested(pxcBrefMigrate({ DA: { L1: { el: 'e1', t: 1 } } }), { DB: { L2: { el: 'e2', t: 1 } } });
        const mergeOk = merged.DA && merged.DB;
        const pruned = JSON.parse(JSON.stringify(nested)); delete pruned.DA;
        return { mig: !!mig, idem, flatOk, winNew, mergeOk: !!mergeOk, ok: !!mig && idem && flatOk && winNew && !!mergeOk && !pruned.DA && !!pruned.DB };
      },
      // B2: cause-effect JSON → elements (house-fire shape: 8 nodes / 7 edges / 1 connection).
      ceParseTest: () => {
        const chart = { nodes: [
          { id: 'p', text: 'House burned', role: 'primary' }, { id: 'a', text: 'Fire', role: 'neutral' },
          { id: 'b', text: 'Fuel', role: 'neutral', terminator: 'end' }, { id: 'c', text: 'Heat', role: 'neutral', terminator: 'end' },
          { id: 'd', text: 'Oxygen', role: 'neutral', terminator: 'end' }, { id: 'e', text: 'Ignition: drapery', role: 'neutral', terminator: 'end' },
          { id: 'f', text: 'Unknown', role: 'neutral', terminator: 'question' }, { id: 'g', text: 'Drapery near heater', role: 'neutral' },
        ], edges: [
          { effect: 'p', cause: 'a' }, { effect: 'a', cause: 'b' }, { effect: 'a', cause: 'c' }, { effect: 'a', cause: 'd' },
          { effect: 'c', cause: 'e' }, { effect: 'e', cause: 'f' }, { effect: 'e', cause: 'g' },
        ], connections: [{ from: 'g', to: 'c', label: 'Connects to' }] };
        const els = elementsFromCauseEffect(chart, 0, 0); // tree (2-arg) — the regression guard, unchanged
        const boxes = els.filter((e) => e.ceRole).length, arrows = els.filter((e) => e.type === 'arrow' && !e.ceConnector).length;
        const connectors = els.filter((e) => e.ceConnector).length, terms = els.filter((e) => e.ceTerminator).length, primaries = els.filter((e) => e.ceRole === 'primary').length;
        // CE-FISHBONE: same house-fire chart through the new layouts — boxes/terminators preserved, edges become bones,
        // pentagon root becomes a closed line + a spine; no stray arrowheads on any pentagon/bone line.
        const fish = elementsFromCauseEffect(chart, 0, 0, 'fishbone'), pent = elementsFromCauseEffect(chart, 0, 0, 'pentagon');
        const fishBoxes = fish.filter((e) => e.ceRole).length, fishBones = fish.filter((e) => e.ceBone).length, fishArrows = fish.filter((e) => e.type === 'arrow' && !e.ceConnector).length;
        const pentRoot = pent.find((e) => e.ceNodeId === 'p'), pentSpine = pent.filter((e) => e.ceBone).length;
        const noStrayHeads = pent.concat(fish).filter((e) => e.ceBone || e === pentRoot).every((e) => !e.endArrowhead && !e.startArrowhead && e.elbowed !== true); // incl. the pentagon head
        return { boxes, arrows, connectors, terms, primaries, fishBoxes, fishBones, fishArrows, pentRootType: pentRoot && pentRoot.type, pentSpine,
          ok: boxes === 8 && arrows === 7 && connectors >= 1 && terms >= 1 && primaries === 1 &&
              fishBoxes === 8 && fishBones >= 3 && fishArrows === 0 && pentRoot && pentRoot.type === 'line' && pentSpine >= 1 && noStrayHeads === true };
      },
      // CE-BRAIN: build-time chartId/ceText stamping + the cause→effect ref-segment shape Brain reads (s.text.guid).
      cePromoteTest: () => {
        const chart = { nodes: [{ id: 'p', text: 'Effect', role: 'primary' }, { id: 'a', text: 'Cause A' }], edges: [{ effect: 'p', cause: 'a' }] };
        const els = elementsFromCauseEffect(chart, 0, 0, 'tree', 'CHART1');
        const pBox = els.find((e) => e.ceNodeId === 'p'), aBox = els.find((e) => e.ceNodeId === 'a');
        const segs = ceEdgeSegments('EFFGUID', 'Effect'), refSeg = segs.find((s) => s.type === 'ref');
        const guidsFound = segs.filter((s) => s.type === 'ref' && s.text && s.text.guid).map((s) => s.text.guid); // mimic Brain's refGuidsFromLineItems
        return { chartId: pBox && pBox.ceChartId, ceText: aBox && aBox.ceText, refGuid: refSeg && refSeg.text.guid,
          ok: !!pBox && pBox.ceChartId === 'CHART1' && pBox.ceText === 'Effect' && !!aBox && aBox.ceText === 'Cause A' &&
              !!refSeg && refSeg.text.guid === 'EFFGUID' && segs[0].type === 'text' && guidsFound.length === 1 && guidsFound[0] === 'EFFGUID' };
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
        const cached = v.plugin._imgCache && v.plugin._imgCache.get(fileId);
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
        // BACKING model: flipping an arbitrary note → storage lands on a BACKING Plexus Drawings record (Scene property),
        // the note host body stays CLEAN (no scene line), and the drawing relates back via `Source Note`.
        const rec = await getRecordPoll(this, guid); if (!rec) return { error: 'record not resolvable', guid };
        const isDrawing = await this._isDrawingRecord(guid);
        await this._openPanelFor(guid, { blank: true });
        let v = null; for (let i = 0; i < 30; i++) { await sleep(150); v = [...this._views].filter((x) => x.hostGuid === guid).pop(); if (v && v.rec) break; }
        if (!v) return { error: 'no view mounted', guid };
        v.scene.elements.push(makeRect(40, 40, 90, 60, { stroke: '#7c5cff' }), makeRect(150, 40, 90, 60, { stroke: '#10b981' }));
        v.dirty = true; const saved = await v.saveNow();
        const backingGuid = v.recordGuid;
        let backingBlob = null; try { backingBlob = await v.rec.prop('Scene').fileBlob(); } catch (_e) {}
        const hostLine = await findSceneLine(rec); // expected null for a migrated note host
        let srcNote = null; try { srcNote = pxcRelValues(v.rec.prop('Source Note'))[0] || null; } catch (_e) {}
        return { guid, isDrawing, saved: !!(saved && saved.ok), reason: saved ? saved.reason : 'no save', backingGuid, backingDiffersFromHost: backingGuid !== guid, backingHasScene: !!backingBlob, hostHasSceneLine: !!hostLine, sourceNote: srcNote };
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
        const el = v.scene.elements.find((e) => !e.isDeleted && e.type !== 'text'); if (!el) return { error: 'no element' }; // skip text: it now resizes via wrapW (width=wrapW, height=line-count), not the w+Δ/h+Δ this asserts
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
.pxc-host .pxc-root.pxc-pencursor .pxc-interactive { cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><line x1="12" y1="2" x2="12" y2="22" stroke="%237c5cff" stroke-width="1"/><line x1="2" y1="12" x2="22" y2="12" stroke="%237c5cff" stroke-width="1"/></svg>') 12 12, crosshair; }
.pxc-host .pxc-root.pxc-panning .pxc-interactive { cursor: grabbing; }
.pxc-host .pxc-root .pxc-toolbar { position: absolute; left: 8px; right: 8px; top: 10px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px; padding: 5px 7px; width: auto; max-width: calc(100% - 16px); margin: 0 auto; box-sizing: border-box; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 10px; box-shadow: 0 4px 14px rgba(0,0,0,.12); }
.pxc-host .pxc-root .pxc-tool { width: var(--pxc-tool-size, 30px); height: var(--pxc-tool-size, 30px); display: flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--color-text-400); cursor: pointer; font-size: calc(var(--pxc-tool-size, 30px) * 0.53); padding: 0; }
.pxc-host .pxc-root .pxc-tool:hover { background: var(--sidebar-bg-hover); }
.pxc-host .pxc-root .pxc-tool.active { background: var(--button-primary-bg-color, #7c5cff); color: #fff; }
/* Density + orientation (toolbar customization) */
.pxc-host .pxc-root .pxc-toolbar.pxc-dense { gap: 2px; padding: 3px 5px; }
.pxc-host .pxc-root .pxc-toolbar.pxc-dense .pxc-flipnote { font-size: 11px; }
.pxc-host .pxc-root .pxc-toolbar.pxc-vertical { flex-direction: column; flex-wrap: nowrap; top: 10px; bottom: 10px; left: 8px; right: auto; width: auto; max-width: none; margin: 0; overflow-y: auto; justify-content: flex-start; align-items: center; }
.pxc-host .pxc-root .pxc-toolbar.pxc-vertical .pxc-shape-flyout { top: 0; left: 100%; margin: 0 0 0 5px; }
.pxc-host .pxc-root .pxc-toolbar.pxc-vertical .pxc-flipnote { width: var(--pxc-tool-size, 30px); }
.pxc-host .pxc-root .pxc-toolbar.pxc-vertical .pxc-flipnote .pxc-flip-lab { display: none; }
.pxc-host .pxc-root .pxc-flipnote .pxc-flip-lab { margin-left: 4px; }
/* Toolbar customization page */
.pxc-tbset .pxc-tbset-body { max-height: 60vh; overflow-y: auto; }
.pxc-tb-h { font-size: 11px; font-weight: 600; color: var(--color-text-600); margin: 14px 0 6px; letter-spacing: .02em; }
.pxc-tb-list { display: flex; flex-direction: column; gap: 2px; }
.pxc-tb-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 7px; }
.pxc-tb-row:hover { background: var(--sidebar-bg-hover); }
.pxc-tb-mv { width: 22px; height: 22px; display: grid; place-items: center; border: 1px solid var(--cards-border-color); border-radius: 5px; background: var(--input-bg-color); color: var(--color-text-400); cursor: pointer; font-size: 13px; }
.pxc-tb-mv:disabled { opacity: .3; cursor: default; }
.pxc-tb-ico { font-size: 16px; color: var(--color-text-400); width: 20px; text-align: center; }
.pxc-tb-lab { flex: 1; font-size: 13px; color: var(--color-text-400); }
.pxc-tb-pal { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pxc-tb-palcell { position: relative; }
.pxc-tb-palcell input[type=color] { width: 34px; height: 34px; border: 1px solid var(--cards-border-color); border-radius: 7px; background: none; padding: 0; cursor: pointer; }
.pxc-tb-palrm { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--cards-border-color); background: var(--cards-bg); color: var(--color-text-600); cursor: pointer; font-size: 9px; }
.pxc-tb-paladd { padding: 7px 10px; border: 1px dashed var(--cards-border-color); border-radius: 7px; background: transparent; color: var(--color-text-400); cursor: pointer; font-size: 12px; }
.pxc-tb-layout { display: flex; flex-direction: column; gap: 10px; }
.pxc-tb-lrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--color-text-400); }
.pxc-tb-lrow select, .pxc-tb-lrow input[type=range] { background: var(--input-bg-color); color: var(--color-text-400); border: 1px solid var(--cards-border-color); border-radius: 6px; padding: 4px 6px; }
.pxc-tbset-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 16px; }
.pxc-tb-reset { padding: 7px 12px; border: 1px solid var(--cards-border-color); border-radius: 7px; background: transparent; color: var(--color-text-600); cursor: pointer; font-size: 12px; }
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
.pxc-host .pxc-root .pxc-lightbox { background: rgba(0,0,0,.72); cursor: zoom-out; }
.pxc-host .pxc-root .pxc-lightbox-img { max-width: 92%; max-height: 92%; border-radius: 8px; box-shadow: 0 12px 48px rgba(0,0,0,.5); cursor: default; }
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
.pxc-il-cat { grid-column: 1 / -1; font-size: 11px; font-weight: 600; color: var(--color-text-600); margin-top: 8px; letter-spacing: .02em; }
.pxc-il-glyph { font-size: 28px; color: var(--color-text-400); line-height: 1; }
.pxc-il-search { width: 100%; box-sizing: border-box; padding: 7px 9px; margin-bottom: 10px; background: var(--input-bg-color); color: var(--color-text-400); border: 1px solid var(--cards-border-color); border-radius: 6px; font-size: 13px; }
/* Shape-picker flyout */
.pxc-host .pxc-root .pxc-shape-wrap { position: relative; display: inline-flex; }
.pxc-host .pxc-root .pxc-shape-flyout { position: absolute; top: 100%; left: 0; margin-top: 4px; display: flex; gap: 3px; padding: 5px; background: var(--cards-bg); border: 1px solid var(--cards-border-color); border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.18); z-index: 20; }
.pxc-host .pxc-root .pxc-colorbtn { padding: 0; }
.pxc-host .pxc-root .pxc-color-dot { width: 17px; height: 17px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55), 0 0 0 1px rgba(0,0,0,.18); }
.pxc-host .pxc-root .pxc-color-flyout { grid-template-columns: repeat(5, 1fr); gap: 5px; }
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
.pxc-host .pxc-root .pxc-textedit { position: absolute; z-index: 4; margin: 0; padding: 0; border: 0; box-sizing: border-box; outline: none; background: transparent; resize: none; overflow: hidden; white-space: pre; line-height: 1.25; min-height: 1em; font-family: system-ui, sans-serif; box-shadow: 0 0 0 1px var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-textedit.pxc-connlabel { padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,0.94); box-shadow: 0 0 0 1.5px #7c5cff, 0 2px 8px rgba(0,0,0,.18); }
.pxc-host .pxc-root.pxc-dark .pxc-textedit.pxc-connlabel { background: rgba(28,31,40,0.95); color: #e6e7ea; }
.pxc-host .pxc-root .pxc-textedit.pxc-connlabel::placeholder { color: rgba(124,92,255,0.7); }
/* C3 round 3: whole-image vs region choice on drop */
.pxc-host .pxc-root .pxc-region-choice { position: absolute; z-index: 6; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--cards-border-color, #333a4a); border-radius: 9px; box-shadow: 0 8px 26px rgba(0,0,0,.35); font: 12px/1.3 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-region-choice .pxc-rc-label { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; opacity: .55; padding: 1px 2px 2px; }
.pxc-host .pxc-root .pxc-rc-btn { display: block; width: 100%; text-align: left; padding: 6px 10px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 6px; background: var(--input-bg-color, #232838); color: var(--color-text-400, #e6e8ee); cursor: pointer; font: 12px/1.2 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-rc-btn:hover { background: var(--button-primary-bg-color, #7c5cff); color: #fff; border-color: transparent; }
.pxc-host .pxc-root .pxc-rc-btn.pxc-rc-on { border-color: #06b6d4; box-shadow: inset 0 0 0 1px #06b6d4; } /* round-5 A: the currently-targeted ref (or "Whole box") */
/* C2 round 3: connection info card (source / direction / thumbnail) on hover or select */
.pxc-host .pxc-root .pxc-conninfo { position: absolute; z-index: 6; display: flex; align-items: center; gap: 7px; max-width: 300px; padding: 5px 8px; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--cards-border-color, #333a4a); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.32); font: 12px/1.3 system-ui, sans-serif; color: var(--color-text-400, #e6e8ee); pointer-events: none; transform: translate(-50%, 0); }
.pxc-host .pxc-root .pxc-conninfo .pxc-ci-from, .pxc-host .pxc-root .pxc-conninfo .pxc-ci-to { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.pxc-host .pxc-root .pxc-conninfo .pxc-ci-dir { opacity: .8; font-weight: 700; flex: 0 0 auto; }
.pxc-host .pxc-root .pxc-conninfo .pxc-ci-thumb { width: 42px; height: 30px; object-fit: cover; border-radius: 3px; border: 1px solid rgba(127,127,127,.4); flex: 0 0 auto; }
/* round-5 C: connection-style popover (typed relationship presets + line style + arrowheads + colour) */
/* EDIT-1: editable record-card property panel */
.pxc-host .pxc-root .pxc-recpanel { position: absolute; z-index: 8; display: flex; flex-direction: column; gap: 6px; padding: 9px; width: 248px; max-height: 70vh; overflow-y: auto; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--cards-border-color, #333a4a); border-radius: 11px; box-shadow: 0 10px 30px rgba(0,0,0,.42); font: 12px/1.3 system-ui, sans-serif; color: var(--color-text-400, #e6e8ee); }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-head { display: flex; flex-direction: column; gap: 6px; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-title { width: 100%; padding: 5px 7px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 6px; background: var(--input-bg-color, #232838); color: var(--color-text-50, #fff); font: 600 13px/1.2 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-btns { display: flex; gap: 5px; flex-wrap: wrap; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-btn { padding: 4px 9px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 6px; background: var(--input-bg-color, #232838); color: var(--color-text-400, #e6e8ee); cursor: pointer; font: 11px/1.1 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-btn:hover { background: var(--button-primary-bg-color, #7c5cff); color: #fff; border-color: transparent; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-list { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-row { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: 6px; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-lab { font-size: 11px; opacity: .7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-inp, .pxc-host .pxc-root .pxc-recpanel .pxc-rp-sel { width: 100%; padding: 4px 6px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 5px; background: var(--input-bg-color, #232838); color: var(--color-text-400, #e6e8ee); font: 12px/1.2 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-rel { padding: 4px 6px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dc { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; padding-top: 7px; border-top: 1px solid var(--cards-border-color, #333a4a); }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dclab { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; opacity: .55; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dcout { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dcn { font-size: 10px; opacity: .6; padding: 2px 0; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dcrow { padding: 3px 6px; border-radius: 5px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pxc-host .pxc-root .pxc-recpanel .pxc-rp-dcrow:hover { background: var(--sidebar-bg-hover, rgba(127,127,127,.18)); }
/* EDIT-4: live Datacore view overlay over a selected dc: query node */
.pxc-host .pxc-root .pxc-dcoverlay { position: absolute; z-index: 8; display: flex; flex-direction: column; gap: 4px; padding: 6px; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--color-text-600, #0ea5e9); border-radius: 9px; box-shadow: 0 10px 30px rgba(0,0,0,.42); overflow: hidden; }
.pxc-host .pxc-root .pxc-dcoverlay .pxc-dc-q { width: 100%; padding: 4px 7px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 5px; background: var(--input-bg-color, #232838); color: var(--color-text-400, #e6e8ee); font: 12px/1.2 ui-monospace, monospace; flex: 0 0 auto; }
.pxc-host .pxc-root .pxc-dcoverlay .pxc-dc-host { flex: 1 1 auto; overflow: auto; min-height: 0; }
.pxc-host .pxc-root .pxc-connstyle { position: absolute; z-index: 7; display: flex; flex-direction: column; gap: 6px; padding: 7px; max-width: 250px; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--cards-border-color, #333a4a); border-radius: 10px; box-shadow: 0 8px 26px rgba(0,0,0,.4); font: 12px/1.2 system-ui, sans-serif; color: var(--color-text-400, #e6e8ee); }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-row { display: flex; align-items: center; gap: 5px; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-rels, .pxc-host .pxc-root .pxc-connstyle .pxc-cs-colors { flex-wrap: wrap; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-rel { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border: 1px solid var(--cards-border-color, #333a4a); border-radius: 999px; background: var(--input-bg-color, #232838); color: var(--color-text-400, #e6e8ee); cursor: pointer; font: 11px/1.1 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-rel:hover { border-color: var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-seg { display: inline-flex; gap: 2px; padding: 2px; background: var(--input-bg-color, #232838); border-radius: 7px; border: 1px solid var(--cards-border-color, #333a4a); }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-btn { min-width: 26px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 5px; background: transparent; color: var(--color-text-400, #e6e8ee); cursor: pointer; font: 13px/1 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-btn:hover { background: var(--sidebar-bg-hover, rgba(127,127,127,.18)); }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-line { display: block; width: 20px; height: 0; border-top: 2px solid currentColor; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-line.dashed { border-top-style: dashed; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-line.dotted { border-top-style: dotted; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-color { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-on { border-color: var(--button-primary-bg-color, #7c5cff) !important; box-shadow: inset 0 0 0 1px var(--button-primary-bg-color, #7c5cff); }
.pxc-host .pxc-root .pxc-connstyle .pxc-cs-color.pxc-cs-on { box-shadow: 0 0 0 2px var(--cards-bg, #1b1f2a), 0 0 0 4px var(--button-primary-bg-color, #7c5cff); }
/* C1 round 3: clickable ref chips beside the text editor */
.pxc-host .pxc-root .pxc-refbar { position: absolute; z-index: 5; display: flex; flex-wrap: wrap; gap: 4px; max-width: 320px; padding: 4px; background: var(--cards-bg, #1b1f2a); border: 1px solid var(--cards-border-color, #333a4a); border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.pxc-host .pxc-root .pxc-refchip { display: inline-flex; align-items: center; gap: 4px; max-width: 200px; padding: 3px 8px; border-radius: 6px; background: rgba(124,92,255,.16); color: var(--color-text-400, #e6e8ee); cursor: pointer; font: 12px/1.2 system-ui, sans-serif; }
.pxc-host .pxc-root .pxc-refchip:hover { background: #7c5cff; color: #fff; }
.pxc-host .pxc-root .pxc-refchip .pxc-rc-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
