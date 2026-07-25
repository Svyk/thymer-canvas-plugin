// GOAL-9: shared PDF-highlight Anchor Data tolerates both frac conventions at the read boundary.
// Exercise the actual helper and _readHlAnchor implementation from plugin.js so this test cannot drift from production.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'plugin.js'), 'utf8');
function sourceBlock(startToken, endToken) {
  const start = source.indexOf(startToken);
  assert(start >= 0, 'production source contains ' + startToken);
  const end = source.indexOf(endToken, start);
  assert(end >= 0, 'production source contains terminator for ' + startToken);
  return source.slice(start, end);
}

const normSource = sourceBlock('function pxcNormFrac(frac) {', '\n}\n').trim() + '\n}';
const pxcNormFrac = Function(normSource + '\nreturn pxcNormFrac;')();
const readLine = source.split('\n').find((line) => line.trimStart().startsWith('_readHlAnchor(r) {'));
assert(readLine, 'production source contains _readHlAnchor');
const readHlAnchor = Function('pxcNormFrac', 'return ({' + readLine.trim() + '})._readHlAnchor;')(pxcNormFrac);
const read = (anchor) => readHlAnchor.call({ _propText: () => JSON.stringify(anchor) }, {});
const world = (el, frac) => frac ? {
  x: el.x + frac.rx * el.w,
  y: el.y + frac.ry * el.h,
  w: frac.rw * el.w,
  h: frac.rh * el.h,
} : null;

const legacy = read({ kind: 'region', frac: { x: 0.15, y: 0.25, w: 0.5, h: 0.2 } });
const wire = read({ kind: 'region', frac: { rx: 0.15, ry: 0.25, rw: 0.5, rh: 0.2 } });
assert.deepStrictEqual(legacy.frac, wire.frac, 'legacy and wire fracs normalize identically');
assert.deepStrictEqual(legacy.frac, { rx: 0.15, ry: 0.25, rw: 0.5, rh: 0.2 }, 'legacy keys become Canvas wire keys');
assert.deepStrictEqual(world({ x: 100, y: 50, w: 800, h: 1000 }, legacy.frac), { x: 220, y: 300, w: 400, h: 200 }, 'legacy frac resolves to finite world geometry');
assert.deepStrictEqual(world({ x: 100, y: 50, w: 800, h: 1000 }, legacy.frac), world({ x: 100, y: 50, w: 800, h: 1000 }, wire.frac), 'both conventions resolve to the same world rect');

const both = read({ frac: { rx: 0.1, ry: 0.2, rw: 0.3, rh: 0.4, x: 0.8, y: 0.8, w: 0.1, h: 0.1 } });
assert.deepStrictEqual(both.frac, { rx: 0.1, ry: 0.2, rw: 0.3, rh: 0.4 }, 'wire keys win when both conventions are present');
const zero = read({ kind: 'region', frac: { x: 0.1, y: 0.2, w: 0, h: 0.4 } });
assert.strictEqual(zero.frac, null, 'zero-extent Anchor Data normalizes to null');
assert.strictEqual(world({ x: 0, y: 0, w: 800, h: 1000 }, zero.frac), null, 'invalid geometry follows the fallback path instead of rendering NaN');
assert.strictEqual(pxcNormFrac({ x: 0, y: 0, w: Infinity, h: 1 }), null, 'non-finite geometry is rejected');
assert.strictEqual(pxcNormFrac({ x: 0, y: 0, w: 1, h: -1 }), null, 'negative extent is rejected');

console.log('pxc_frac ok (9 assertions)');
