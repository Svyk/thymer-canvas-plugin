// F5 Flameshot floating pins. Pure-logic tests of pxcClampPin + pxcPinHitTest. Verbatim replicas.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };
function pxcClampPin(sx, sy, w, h, vw, vh) {
  const maxX = Math.max(0, (vw || 0) - Math.min(w, vw || w)), maxY = Math.max(0, (vh || 0) - Math.min(h, vh || h));
  const x = Math.max(0, Math.min(maxX, sx)), y = Math.max(0, Math.min(maxY, sy));
  return { sx: isFinite(x) ? x : 0, sy: isFinite(y) ? y : 0 };
}
function pxcPinHitTest(hits, px, py) {
  for (let i = (hits || []).length - 1; i >= 0; i--) {
    const r = hits[i]; if (!r) continue;
    if (r.close && px >= r.close.x && px <= r.close.x + r.close.w && py >= r.close.y && py <= r.close.y + r.close.h) return { id: r.id, onClose: true };
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return { id: r.id, onClose: false };
  }
  return null;
}
// clamp: in-bounds unchanged
{ const c = pxcClampPin(100, 50, 240, 180, 1000, 800); ok(c.sx === 100 && c.sy === 50, 'in-bounds pin unchanged'); }
// clamp: off right + bottom → pulled back so it stays fully visible
{ const c = pxcClampPin(900, 700, 240, 180, 1000, 800); ok(c.sx === 760 && c.sy === 620, 'off-edge clamped to vw-w / vh-h'); }
// clamp: negative → 0
{ const c = pxcClampPin(-50, -20, 100, 100, 800, 600); ok(c.sx === 0 && c.sy === 0, 'negative clamped to 0'); }
// clamp: pin wider than viewport → x=0 (no negative maxX)
{ const c = pxcClampPin(50, 0, 1200, 100, 800, 600); ok(c.sx === 0, 'over-wide pin → x=0, not negative'); }
// hit-test: topmost (last) wins on overlap
{ const hits = [{ id: 'a', x: 0, y: 0, w: 100, h: 100 }, { id: 'b', x: 50, y: 50, w: 100, h: 100 }];
  ok(pxcPinHitTest(hits, 60, 60).id === 'b', 'topmost (last) wins on overlap');
  ok(pxcPinHitTest(hits, 10, 10).id === 'a', 'non-overlapping hits its own pin');
  ok(pxcPinHitTest(hits, 300, 300) === null, 'miss → null'); }
// hit-test: close sub-rect → onClose
{ const hits = [{ id: 'p', x: 0, y: 0, w: 200, h: 150, close: { x: 180, y: 4, w: 16, h: 16 } }];
  ok(pxcPinHitTest(hits, 186, 10).onClose === true, 'close button → onClose true');
  ok(pxcPinHitTest(hits, 50, 50).onClose === false, 'pin body → onClose false'); }
if (fail) { console.error('\npxc_pins FAILED:', fail); process.exit(1); }
console.log('pxc_pins ok (' + (1+1+1+1+3+2) + ' assertions)');
