// F3 Heptabase scroll view. Pure-logic test of pxcScrollLayout (gapless, centered, optional uniform width). Verbatim replica.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };
function pxcScrollLayout(pages, opts) {
  const o = opts || {};
  const cx = o.cx || 0, top0 = o.top || 0, GAP = o.gap || 0, uniformW = o.uniformW || 0;
  const out = []; let top = top0;
  for (const p of pages) {
    let w = Math.abs(p.width) || 1, h = Math.abs(p.height) || 1;
    if (uniformW > 0) { const s = uniformW / w; w = uniformW; h = h * s; }
    out.push({ x: cx - w / 2, y: top, w, h });
    top += h + GAP;
  }
  return { pages: out, top: top0, bottom: top - (out.length ? GAP : 0), cx };
}
const pages = [{ width: 400, height: 600 }, { width: 400, height: 800 }, { width: 200, height: 300 }];
// gapless + centered, native widths
{ const l = pxcScrollLayout(pages, { cx: 100, top: 50, gap: 0 });
  ok(l.pages[0].y === 50 && l.pages[1].y === 650 && l.pages[2].y === 1450, 'gapless: y stacks by exact height (50→650→1450)');
  for (let i = 1; i < l.pages.length; i++) ok(l.pages[i].y === l.pages[i-1].y + l.pages[i-1].h, 'contiguous no gap/overlap');
  ok(l.pages.every((p) => p.x === 100 - p.w / 2), 'centered on cx');
  ok(l.pages[0].w === 400 && l.pages[2].w === 200, 'native widths kept (no uniform)'); }
// uniform width normalizes + keeps aspect
{ const l = pxcScrollLayout(pages, { cx: 0, top: 0, gap: 0, uniformW: 400 });
  ok(l.pages.every((p) => p.w === 400), 'uniformW: all widths 400');
  ok(l.pages[2].h === 300 * (400/200), 'aspect preserved (200×300 → 400×600)');
  ok(l.pages.every((p) => p.x === -p.w / 2), 'centered at cx=0'); }
// gap > 0
{ const l = pxcScrollLayout([{width:100,height:100},{width:100,height:100}], { cx: 0, top: 0, gap: 16 });
  ok(l.pages[1].y === 116, 'gap respected'); }
// empty
{ const l = pxcScrollLayout([], {}); ok(l.pages.length === 0 && l.bottom === 0, 'empty → empty'); }
// degenerate zero-size page → floored to 1 (no NaN)
{ const l = pxcScrollLayout([{width:0,height:0}], { uniformW: 400 }); ok(l.pages[0].w === 400 && isFinite(l.pages[0].h), 'zero page floored, finite'); }
if (fail) { console.error('\npxc_scroll FAILED:', fail); process.exit(1); }
console.log('pxc_scroll ok (' + (1+2+1+1+3+1+1+1) + ' assertions)');
