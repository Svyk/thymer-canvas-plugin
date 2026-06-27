// #26 Connected Margins (Azlen "parallel pages, visibly connected"). Pure-logic tests of the geometry: pxcMarginBandFrac
// (text-highlight page bands), pxcMarginStack (anchor-aligned collision sweep), pxcMarginLayout (primary column),
// pxcRibbonQuads (tapered band samples), pxcPointInRibbon (hover hit-test). Verbatim replicas of the plugin fns.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };

function pxcMarginBandFrac(k, n) { const N = Math.max(1, n || 1); return (Math.min(k, N - 1) + 0.5) / N * 0.86 + 0.07; }
function pxcMarginStack(idealYs, CH, GAP, minY) {
  const order = idealYs.map((y, i) => ({ i, y: Math.max(minY, y) })).sort((a, b) => (a.y - b.y) || (a.i - b.i));
  let prevBottom = -Infinity;
  for (const o of order) { if (o.y < prevBottom + GAP) o.y = prevBottom + GAP; prevBottom = o.y + CH; }
  const out = new Array(idealYs.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}
function pxcMarginLayout(idealYs, opts) {
  const o = opts || {};
  const CW = o.CW || 230, CH = o.CH || 70, GAP = o.GAP || 14, GUTTER = o.GUTTER || 90, PAD = o.PAD || 16, HEAD = 24;
  const colX0 = (o.pageRight || 0) + GUTTER, minY = (o.pageTop != null ? o.pageTop : 0);
  const ys = pxcMarginStack(idealYs, CH, GAP, minY);
  const cards = ys.map((y) => ({ x: colX0, y, w: CW, h: CH }));
  let top = Infinity, bot = -Infinity; for (const c of cards) { top = Math.min(top, c.y); bot = Math.max(bot, c.y + c.h); }
  if (!cards.length) { top = minY; bot = minY + CH; }
  const frame = { x: colX0 - PAD, y: top - PAD - HEAD, w: CW + PAD * 2, h: (bot - top) + PAD * 2 + HEAD };
  return { colX0, CW, CH, cards, frame, top, bottom: bot };
}
function pxcRibbonQuads(ax, ay, bx, by, wCard, wAnchor, bend, K) {
  K = K || 14;
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  const cxp = mx + (-dy / len) * bend, cyp = my + (dx / len) * bend;
  const top = [], bot = [];
  for (let i = 0; i <= K; i++) {
    const t = i / K, u = 1 - t;
    const px = u * u * ax + 2 * u * t * cxp + t * t * bx, py = u * u * ay + 2 * u * t * cyp + t * t * by;
    let tx = 2 * u * (cxp - ax) + 2 * t * (bx - cxp), ty = 2 * u * (cyp - ay) + 2 * t * (by - cyp);
    const tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
    const w = (wCard + (wAnchor - wCard) * t) / 2;
    top.push([px + nx * w, py + ny * w]); bot.push([px - nx * w, py - ny * w]);
  }
  return { top, bot, cxp, cyp };
}
function pxcPointInRibbon(quad, px, py) {
  if (!quad || !quad.top || !quad.bot) return false;
  const poly = quad.top.concat(quad.bot.slice().reverse());
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}
const approx = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);

// ── pxcMarginBandFrac ──
{ const n = 4, bands = [0, 1, 2, 3].map((k) => pxcMarginBandFrac(k, n));
  ok(bands.every((f) => f >= 0 && f <= 1), 'bands in [0,1]');
  ok(bands[0] < bands[1] && bands[1] < bands[2] && bands[2] < bands[3], 'bands ordered, disjoint');
  ok(pxcMarginBandFrac(0, 1) > 0 && pxcMarginBandFrac(0, 1) < 1, 'single band is mid-ish, in range');
  ok(pxcMarginBandFrac(9, 3) === pxcMarginBandFrac(2, 3), 'k clamps to n-1'); }

// ── pxcMarginStack ──
{ // three cards, ideals 0/10/200, CH=70 GAP=14 → first stays 0, second pushed to 84, third stays 200
  const ys = pxcMarginStack([0, 10, 200], 70, 14, -1000);
  ok(ys[0] === 0 && ys[1] === 84 && ys[2] === 200, 'overlap pushed down to prevBottom+GAP; non-overlapping stays');
  for (let i = 1; i < ys.length; i++) ok(ys[i] >= ys[i - 1] + 70 + 14 - 1e-9 || ys[i] - ys[i - 1] >= 70, 'no [y,y+CH] overlap'); }
{ const ys = pxcMarginStack([5, 5, 5], 70, 14, 100); // all below minY → clamp + stack from 100
  ok(ys[0] === 100 && ys[1] === 184 && ys[2] === 268, 'clamp to minY then stack'); }
{ const ys = pxcMarginStack([], 70, 14, 0); ok(ys.length === 0, 'empty → empty (no crash)'); }
{ // greedy minimal: a card far below does not move
  const ys = pxcMarginStack([0, 1000], 70, 14, 0); ok(ys[1] === 1000, 'a non-overlapping card keeps its ideal (minimal displacement)'); }

// ── pxcMarginLayout ──
{ const lay = pxcMarginLayout([0, 200], { pageRight: 500, pageTop: 0 });
  ok(lay.colX0 === 590, 'colX0 = pageRight + GUTTER (500+90)');
  ok(lay.cards.every((c) => c.x === 590), 'cards sit at colX0');
  ok(lay.cards[0].y === 0 && lay.cards[1].y === 200, 'card Ys == stack output');
  ok(lay.frame.x < lay.colX0 && lay.frame.y <= lay.top && lay.frame.y + lay.frame.h >= lay.bottom, 'frame wraps the column'); }
{ const lay = pxcMarginLayout([], { pageRight: 100, pageTop: 50 }); ok(lay.cards.length === 0 && lay.frame.h > 0, 'empty column still yields a valid frame'); }

// ── pxcRibbonQuads ──
{ const ax = 0, ay = 0, bx = 100, by = 0, wCard = 40, wAnchor = 10;
  const q = pxcRibbonQuads(ax, ay, bx, by, wCard, wAnchor, 0, 14); // bend 0 → straight horizontal; normal is vertical (top = +normal side)
  ok(approx(Math.abs(q.top[0][1]), wCard / 2) && approx(q.bot[0][1], -q.top[0][1]), 'card end straddles by ±wCard/2 along normal (top/bot opposite sides)');
  ok(approx(Math.abs(q.top[14][1]), wAnchor / 2) && approx(q.bot[14][1], -q.top[14][1]), 'anchor end straddles by ±wAnchor/2');
  ok(approx(q.top[0][0], 0) && approx(q.top[14][0], 100), 'endpoints x at ax and bx');
  // symmetric about the centerline (y=0 here): top[i].y == -bot[i].y
  ok(q.top.every((p, i) => approx(p[1], -q.bot[i][1])), 'samples symmetric about centerline'); }
{ // control point == the ghost perpendicular formula
  const ax = 0, ay = 0, bx = 0, by = 100, bend = 8; const q = pxcRibbonQuads(ax, ay, bx, by, 20, 20, bend, 4);
  const mx = 0, my = 50, dx = 0, dy = 100, len = 100; const cxp = mx + (-dy / len) * bend, cyp = my + (dx / len) * bend;
  ok(approx(q.cxp, cxp) && approx(q.cyp, cyp), 'control point matches ghost bend formula'); }

// ── pxcPointInRibbon ──
{ const q = pxcRibbonQuads(0, 0, 100, 0, 40, 40, 0, 14); // a 40-tall horizontal band from x0..100
  ok(pxcPointInRibbon(q, 50, 0) === true, 'centerline point is inside');
  ok(pxcPointInRibbon(q, 50, 100) === false, 'point far above the band is outside');
  ok(pxcPointInRibbon(q, 200, 0) === false, 'point past the band end is outside'); }

if (fail) { console.error('\npxc_margins FAILED:', fail); process.exit(1); }
console.log('pxc_margins ok (' + (4 + 4 + 2 + 5 + 3) + ' assertions)');
