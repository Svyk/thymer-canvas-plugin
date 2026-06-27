// F1 body comments. Pure-logic test of pxcCardContentHeight (card auto-grow estimate). Verbatim replica.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };
function pxcCardContentHeight(nProps, lines, opts) {
  const o = opts || {};
  const titleH = o.titleH || 26, propH = o.propH || 15, lineH = o.lineH || 16, pad = o.pad || 14, maxH = o.maxH || 600, minH = o.minH || 70, cpl = o.charsPerLine || 34;
  let h = pad + titleH + (nProps || 0) * propH + (nProps ? 6 : 0);
  for (const ln of (lines || [])) { const len = ((ln && ln.text) || '').length; h += Math.max(1, Math.ceil(len / Math.max(1, cpl))) * lineH; }
  h += pad;
  return Math.max(minH, Math.min(maxH, Math.round(h)));
}
// no body, no props → floors to minH 70
{ ok(pxcCardContentHeight(0, [], {}) === 70, 'empty → minH 70'); }
// props add height
{ const h = pxcCardContentHeight(4, [], {}); ok(h === Math.max(70, 14 + 26 + 4*15 + 6 + 14), 'props counted (4×15 + spacer)'); }
// short body lines (1 wrap each)
{ const lines = [{text:'short'},{text:'note'},{text:'a comment'}]; const h = pxcCardContentHeight(2, lines, {}); ok(h === 14 + 26 + 2*15 + 6 + 3*16 + 14, '3 short lines × lineH + props'); }
// long line wraps (charsPerLine 10 → a 25-char line = 3 lines)
{ const h25 = pxcCardContentHeight(0, [{text:'x'.repeat(25)}], { charsPerLine: 10, minH: 0 }); ok(h25 === 14 + 26 + 3*16 + 14, '25 chars / 10 per line → 3 wrapped lines'); }
// maxH cap
{ const many = Array.from({length:100},()=>({text:'x'.repeat(50)})); ok(pxcCardContentHeight(0, many, { charsPerLine: 10 }) === 600, 'capped at maxH 600'); }
// minH respects a larger current card (grow-only via minH)
{ ok(pxcCardContentHeight(0, [], { minH: 140 }) === 140, 'minH override (never shrink below current card)'); }
// null lines / null text safe
{ ok(pxcCardContentHeight(0, [null, {}, {text:null}], { minH: 0 }) === 14 + 26 + 3*16 + 14, 'null/empty text → 1 line each, no NaN'); }
if (fail) { console.error('\npxc_cardheight FAILED:', fail); process.exit(1); }
console.log('pxc_cardheight ok (' + (1+1+1+1+1+1+1) + ' assertions)');
