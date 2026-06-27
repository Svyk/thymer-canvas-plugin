// #23 AI synthesis. Pure-logic tests of pxcParseSynthesis (tolerant {thesis,themes} parse), pxcWrap (word-wrap), and
// pxcSynthesisLayout (3-tier geometry + deduped cited cards + per-point cardIdxs). Verbatim replicas of the plugin fns.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };

function pxcParseSynthesis(text) {
  let obj = null;
  try { obj = JSON.parse(text); } catch (_e) { const m = String(text == null ? '' : text).match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (_e2) {} } }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { thesis: '', themes: [] };
  const thesis = String(obj.thesis || obj.summary || '').slice(0, 600).trim();
  const themesIn = Array.isArray(obj.themes) ? obj.themes : [];
  const themes = [];
  for (const t of themesIn) {
    if (!t || typeof t !== 'object') continue;
    const title = String(t.title || t.theme || '').slice(0, 120).trim();
    const ptsIn = Array.isArray(t.points) ? t.points : [];
    const points = [];
    for (const p of ptsIn) {
      if (p == null) continue;
      let ptext = '', cites = [];
      if (typeof p === 'string') ptext = p;
      else if (typeof p === 'object') { ptext = String(p.text || p.point || ''); const c = Array.isArray(p.cites) ? p.cites : (Array.isArray(p.citations) ? p.citations : []); for (const x of c) { const n = Number(x); if (Number.isInteger(n) && n >= 0) cites.push(n); } }
      ptext = ptext.slice(0, 400).trim();
      if (ptext) points.push({ text: ptext, cites: cites.slice(0, 12) });
    }
    if (title || points.length) themes.push({ title: title || 'Theme', points });
  }
  return { thesis, themes: themes.slice(0, 12) };
}
function pxcWrap(text, maxChars) {
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { if (!cur) cur = w; else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur); return lines.join('\n');
}
function pxcSynthesisLayout(syn, opts) {
  const o = opts || {};
  const synW = o.synW || 300, synH = o.synH || 120, themeW = o.themeW || 320, cardW = o.cardW || 230, cardH = o.cardH || 64;
  const colGap = o.colGap || 90, pad = o.pad || 14, lineH = o.lineH || 19, gap = o.gap || 16, wrapChars = o.wrapChars || 40;
  const x0 = synW + colGap;
  const x1 = x0 + themeW + colGap;
  const cardOrder = [], cardIndex = new Map();
  for (const t of (syn.themes || [])) for (const p of (t.points || [])) for (const c of (p.cites || [])) { if (!cardIndex.has(c)) { cardIndex.set(c, cardOrder.length); cardOrder.push(c); } }
  const themes = []; let ty = 0;
  for (const t of (syn.themes || [])) {
    const points = []; let py = pad + lineH + 8;
    for (const p of (t.points || [])) {
      const nlines = Math.max(1, pxcWrap(p.text, wrapChars).split('\n').length);
      const cardIdxs = (p.cites || []).map((c) => cardIndex.get(c)).filter((n) => n != null);
      points.push({ text: p.text, cites: (p.cites || []).slice(), cardIdxs, y: py, h: nlines * lineH });
      py += nlines * lineH + 10;
    }
    const fh = Math.max(cardH, py + pad);
    themes.push({ title: t.title, frame: { x: x0, y: ty, w: themeW, h: fh }, points });
    ty += fh + gap;
  }
  const themesH = Math.max(cardH, ty - gap);
  const cards = cardOrder.map((hid, i) => ({ hid, idx: i, x: x1, y: i * (cardH + gap), w: cardW, h: cardH }));
  const cardsH = Math.max(cardH, cards.length ? cards.length * (cardH + gap) - gap : cardH);
  const totalH = Math.max(themesH, cardsH, synH);
  const synthesis = { x: 0, y: Math.max(0, (totalH - synH) / 2), w: synW, h: synH };
  return { synthesis, themes, cards, width: x1 + cardW, height: totalH };
}

// ── pxcParseSynthesis ──
// 1. clean object
{ const s = pxcParseSynthesis('{"thesis":"T","themes":[{"title":"A","points":[{"text":"p1","cites":[0,2]}]}]}');
  ok(s.thesis === 'T' && s.themes.length === 1 && s.themes[0].title === 'A' && s.themes[0].points[0].cites.join() === '0,2', 'clean object parses'); }
// 2. fenced / prose-wrapped JSON (extract the {...})
{ const s = pxcParseSynthesis('Sure!\n```json\n{"thesis":"X","themes":[{"title":"B","points":["just a string point"]}]}\n```');
  ok(s.thesis === 'X' && s.themes[0].points[0].text === 'just a string point' && s.themes[0].points[0].cites.length === 0, 'string point coerced; fenced JSON extracted'); }
// 3. citations alias + summary alias + non-integer/negative cites dropped
{ const s = pxcParseSynthesis('{"summary":"Y","themes":[{"theme":"C","points":[{"point":"q","citations":[1,"x",-3,2.5,4]}]}]}');
  ok(s.thesis === 'Y' && s.themes[0].title === 'C' && s.themes[0].points[0].text === 'q' && s.themes[0].points[0].cites.join() === '1,4', 'summary/theme/point/citations aliases; bad cites dropped'); }
// 4. empty point text dropped; theme with no title defaults
{ const s = pxcParseSynthesis('{"themes":[{"points":[{"text":"  ","cites":[0]},{"text":"keep"}]}]}');
  ok(s.themes[0].title === 'Theme' && s.themes[0].points.length === 1 && s.themes[0].points[0].text === 'keep', 'empty point dropped, default theme title'); }
// 5. garbage → empty
{ const s = pxcParseSynthesis('not json at all'); ok(s.thesis === '' && s.themes.length === 0, 'garbage → empty'); }
// 6. array (not object) → empty
{ const s = pxcParseSynthesis('[1,2,3]'); ok(s.themes.length === 0, 'top-level array → empty'); }
// 7. clamps: 12 themes max
{ const many = { themes: Array.from({ length: 20 }, (_, i) => ({ title: 'T' + i, points: [{ text: 'p' }] })) };
  ok(pxcParseSynthesis(JSON.stringify(many)).themes.length === 12, 'themes capped at 12'); }

// ── pxcWrap ──
ok(pxcWrap('one two three four five', 9).split('\n').length === 3, 'wrap at 9 chars → 3 lines');
ok(pxcWrap('', 40) === '' && pxcWrap('   ', 40) === '', 'empty/whitespace wrap → empty');
ok(pxcWrap('singleword', 4) === 'singleword', 'a word longer than maxChars is not split');

// ── pxcSynthesisLayout ──
const syn = pxcParseSynthesis(JSON.stringify({ thesis: 'th', themes: [
  { title: 'A', points: [{ text: 'short', cites: [0, 1] }, { text: 'p2', cites: [1] }] },   // cites 0,1 (dedup: 1 seen once)
  { title: 'B', points: [{ text: 'p3', cites: [3] }] },                                       // new card 3
] }));
const lay = pxcSynthesisLayout(syn, {});
// tiers: synth x=0, themes x=390 (300+90), cards x=800 (390+320+90)
ok(lay.themes[0].frame.x === 390 && lay.cards[0].x === 800, 'three tiers at x 0 / 390 / 800');
// dedup cited cards in first-seen order: 0,1,3 → 3 cards
ok(lay.cards.length === 3 && lay.cards.map((c) => c.hid).join() === '0,1,3', 'cited cards deduped, first-seen order');
// per-point cardIdxs map highlight id → card slot: point1 cites 0,1 → idx 0,1; point2 cites 1 → idx 1; theme B point cites 3 → idx 2
ok(lay.themes[0].points[0].cardIdxs.join() === '0,1' && lay.themes[0].points[1].cardIdxs.join() === '1' && lay.themes[1].points[0].cardIdxs.join() === '2', 'per-point cardIdxs resolve to deduped slots');
// themes stack vertically (B below A)
ok(lay.themes[1].frame.y > lay.themes[0].frame.y, 'themes stack vertically');
// synthesis node vertically centered within total height
ok(lay.synthesis.x === 0 && lay.synthesis.y >= 0 && lay.synthesis.y + lay.synthesis.h <= lay.height + 1, 'synthesis node within bounds');
// width spans all three tiers
ok(lay.width === 800 + 230, 'width spans to the card tier right edge');
// no-cites theme → zero cards, no crash
{ const s2 = pxcParseSynthesis(JSON.stringify({ themes: [{ title: 'Z', points: [{ text: 'no cite' }] }] }));
  const l2 = pxcSynthesisLayout(s2, {}); ok(l2.cards.length === 0 && l2.themes.length === 1, 'no-cites synthesis lays out with zero cards'); }
// review HIGH: out-of-range cite ids are clamped (the _synthesizePdf guard: filter c < N) so no junk card survives.
{ const N = 3; const s3 = pxcParseSynthesis(JSON.stringify({ themes: [{ title: 'A', points: [{ text: 'p', cites: [0, 99, 2, -1] }] }] }));
  for (const t of s3.themes) for (const p of t.points) p.cites = (p.cites || []).filter((c) => c < N); // replica of the in-plugin clamp
  const l3 = pxcSynthesisLayout(s3, {});
  ok(s3.themes[0].points[0].cites.join() === '0,2', 'cite 99 (>=N) and -1 (parse-dropped) removed; 0,2 kept');
  ok(l3.cards.length === 2 && l3.cards.every((c) => c.hid < N), 'no out-of-range card survives the clamp'); }

if (fail) { console.error('\npxc_synthesis FAILED:', fail); process.exit(1); }
console.log('pxc_synthesis ok (' + (7 + 3 + 7 + 2) + ' assertions)');
