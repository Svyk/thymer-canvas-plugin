const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'plugin.js'), 'utf8');
let failures = 0;
const check = (condition, message) => {
  if (!condition) { failures++; console.error('FAIL:', message); }
};

check(source.includes('if (this._views.size) this._renderRaf = requestAnimationFrame(this._renderTick);'), 'render loop stops when no Canvas views remain');
check(source.includes('view.mount(); this._ensureRenderLoop();'), 'mounting a Canvas view wakes the render loop');
check(!source.includes('raf = requestAnimationFrame(tick);'), 'legacy unconditional Canvas RAF is gone');

if (failures) process.exit(1);
console.log('plexus-canvas render loop regression checks passed');
