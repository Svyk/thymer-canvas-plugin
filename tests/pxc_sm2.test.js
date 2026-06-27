// #25 spaced repetition. Pure-logic tests of pxcSm2 (SM-2-lite scheduler over highlights). Verbatim replica.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };

function pxcSm2(grade, ease, reps, interval) {
  ease = (typeof ease === 'number' && ease >= 1.3) ? ease : 2.5;
  reps = (typeof reps === 'number' && reps >= 0) ? Math.floor(reps) : 0;
  interval = (typeof interval === 'number' && interval > 0) ? interval : 0;
  let nextEase = ease, nextReps, nextInterval;
  if (grade <= 0) { nextReps = 0; nextInterval = 0; nextEase = Math.max(1.3, ease - 0.20); }
  else {
    nextEase = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade >= 3 ? 0.15 : 0));
    nextReps = reps + 1;
    if (nextReps === 1) nextInterval = (grade === 1 ? 1 : grade >= 3 ? 3 : 1);
    else if (nextReps === 2) nextInterval = (grade === 1 ? 3 : 6);
    else nextInterval = Math.round(Math.max(1, interval) * nextEase * (grade === 1 ? 0.8 : grade >= 3 ? 1.3 : 1));
  }
  nextInterval = Math.max(0, Math.min(nextInterval, 365));
  return { ease: Math.round(nextEase * 100) / 100, reps: nextReps, interval: nextInterval, dueInDays: nextInterval };
}

// 1. never-reviewed Good → first interval 1d, reps 1, ease unchanged
{ const s = pxcSm2(2, null, null, null); ok(s.reps === 1 && s.interval === 1 && s.ease === 2.5 && s.dueInDays === 1, 'fresh Good: reps1, 1d, ease 2.5'); }
// 2. second Good → 6d
{ const s = pxcSm2(2, 2.5, 1, 1); ok(s.reps === 2 && s.interval === 6, 'second Good: reps2, 6d'); }
// 3. third Good → round(6 * 2.5 * 1) = 15d
{ const s = pxcSm2(2, 2.5, 2, 6); ok(s.reps === 3 && s.interval === 15, 'third Good: 15d (6*2.5)'); }
// 4. Again (lapse) → reps reset, interval 0 (today), ease -0.2
{ const s = pxcSm2(0, 2.5, 3, 15); ok(s.reps === 0 && s.interval === 0 && s.dueInDays === 0 && s.ease === 2.3, 'Again: reset reps, due today, ease 2.3'); }
// 5. Hard fresh → reps1, 1d, ease -0.15
{ const s = pxcSm2(1, 2.5, 0, 0); ok(s.reps === 1 && s.interval === 1 && s.ease === 2.35, 'Hard fresh: reps1, 1d, ease 2.35'); }
// 6. Easy fresh → reps1, 3d, ease +0.15
{ const s = pxcSm2(3, 2.5, 0, 0); ok(s.reps === 1 && s.interval === 3 && s.ease === 2.65, 'Easy fresh: reps1, 3d, ease 2.65'); }
// 7. ease floored at 1.3 after many lapses
{ let e = 1.4; for (let i = 0; i < 5; i++) e = pxcSm2(0, e, 1, 1).ease; ok(e === 1.3, 'ease floors at 1.3'); }
// 8. interval capped at 365
{ const s = pxcSm2(3, 2.5, 5, 300); ok(s.interval === 365 && s.dueInDays === 365, 'interval capped at 365d'); }
// 9. Hard on a mature card multiplies by 0.8
{ const s = pxcSm2(1, 2.0, 4, 20); ok(s.interval === Math.round(20 * Math.max(1.3, 1.85) * 0.8), 'Hard mature: interval*ease*0.8'); }
// 10. garbage ease (below floor) → reset to 2.5
{ const s = pxcSm2(2, 0.5, 0, 0); ok(s.ease === 2.5 && s.interval === 1, 'sub-floor ease ignored → default 2.5'); }
// 11. dueInDays === interval always
{ for (const g of [0, 1, 2, 3]) { const s = pxcSm2(g, 2.5, 2, 6); ok(s.dueInDays === s.interval, 'dueInDays mirrors interval (grade ' + g + ')'); } }

if (fail) { console.error('\npxc_sm2 FAILED:', fail); process.exit(1); }
console.log('pxc_sm2 ok (' + (1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 4) + ' assertions)');
