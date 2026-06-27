// F4 Evidence lightbox. Pure-logic test of pxcLightboxLayout (stacked group-grids). Verbatim replica.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };
function pxcLightboxLayout(groups, opts) {
  const o = opts || {};
  const cols = o.cols || 4, cardW = o.cardW || 200, cardH = o.cardH || 130, gap = o.gap || 16, headerH = o.headerH || 34, groupGap = o.groupGap || 28, pad = o.pad || 14;
  const out = []; let y = 0, maxW = 0;
  for (const g of (groups || [])) {
    const items = (g && g.items) || [];
    const usedCols = Math.min(cols, Math.max(1, items.length)), rows = Math.max(1, Math.ceil(items.length / cols));
    const gw = usedCols * (cardW + gap) - gap + pad * 2, gh = headerH + rows * (cardH + gap) - gap + pad;
    const cards = items.map((it, i) => { const c = i % cols, r = Math.floor(i / cols); return { it, x: pad + c * (cardW + gap), y: y + headerH + r * (cardH + gap), w: cardW, h: cardH }; });
    out.push({ key: (g && g.key) || '', frame: { x: 0, y, w: gw, h: gh }, cards });
    maxW = Math.max(maxW, gw); y += gh + groupGap;
  }
  return { groups: out, width: maxW, height: Math.max(0, y - groupGap) };
}
const groups = [
  { key: 'Page 1', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }] }, // 5 items, cols 4 → 2 rows
  { key: 'Page 2', items: [{ id: 'f' }] },                                                       // 1 item
];
const lay = pxcLightboxLayout(groups, {}); // defaults cols4 cardW200 cardH130 gap16 head34 groupGap28 pad14
// group 0: 5 items → usedCols=4, rows=2
ok(lay.groups[0].cards.length === 5, 'group 0 has 5 cards');
ok(lay.groups[0].frame.w === 4 * (200 + 16) - 16 + 28, 'group width = usedCols grid + pad');
// grid positions: card[4] is row 1 col 0
ok(lay.groups[0].cards[0].x === 14 && lay.groups[0].cards[0].y === 0 + 34, 'card0 at (pad, headerH)');
ok(lay.groups[0].cards[3].x === 14 + 3 * (200 + 16), 'card3 at col 3');
ok(lay.groups[0].cards[4].x === 14 && lay.groups[0].cards[4].y === 34 + (130 + 16), 'card4 wraps to row 1 col 0');
// group 1 stacks BELOW group 0
ok(lay.groups[1].frame.y === lay.groups[0].frame.h + 28, 'group1 stacks below group0 + groupGap');
ok(lay.groups[1].cards.length === 1 && lay.groups[1].frame.w === 1 * (200 + 16) - 16 + 28, 'single-item group sizes to 1 col');
// width = widest group, height spans all (no trailing groupGap)
ok(lay.width === lay.groups[0].frame.w, 'width = widest group');
ok(lay.height === lay.groups[1].frame.y + lay.groups[1].frame.h, 'height spans to last group bottom (no trailing gap)');
// empty
{ const l = pxcLightboxLayout([], {}); ok(l.groups.length === 0 && l.height === 0, 'empty → empty'); }
// a group with 0 items → 1 row, 1 col floor (no NaN/negative)
{ const l = pxcLightboxLayout([{ key: 'x', items: [] }], {}); ok(l.groups[0].cards.length === 0 && l.groups[0].frame.w > 0, 'empty group → valid frame'); }
if (fail) { console.error('\npxc_lightbox FAILED:', fail); process.exit(1); }
console.log('pxc_lightbox ok (' + (1+1+1+1+1+1+1+1+1+1+1) + ' assertions)');
