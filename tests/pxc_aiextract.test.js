// AI EXTRACT (Heptabase-parser port). Pure-logic test of pxcParseExtractJSON — robust parse of a vision model's reply into an
// object across ```json fences, bare {...}, prose-wrapped JSON, and plain-text fallback. Verbatim replica of plugin.js.
let fail = 0; const ok = (c, m) => { if (!c) { console.error('FAIL:', m); fail++; } };

function pxcParseExtractJSON(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { kind: 'text', markdown: '' };
  let body = s;
  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) body = fence[1].trim();
  if (body.charAt(0) !== '{') { const i = body.indexOf('{'), j = body.lastIndexOf('}'); if (i >= 0 && j > i) body = body.slice(i, j + 1); }
  try { const o = JSON.parse(body); if (o && typeof o === 'object') return o; } catch (_e) {}
  return { kind: 'text', markdown: s };
}

// bare JSON
{ const o = pxcParseExtractJSON('{"kind":"table","markdown":"| a | b |","csv":"a,b"}');
  ok(o.kind === 'table', 'bare JSON: kind parsed');
  ok(o.csv === 'a,b', 'bare JSON: csv roundtrips'); }

// ```json fenced
{ const o = pxcParseExtractJSON('```json\n{"kind":"equation","latex":"E=mc^2"}\n```');
  ok(o.kind === 'equation' && o.latex === 'E=mc^2', 'fenced ```json parsed'); }

// bare ``` fence (no language)
{ const o = pxcParseExtractJSON('```\n{"kind":"figure","caption":"A bar chart","series":[{"label":"Q1","value":10}]}\n```');
  ok(o.kind === 'figure' && Array.isArray(o.series) && o.series[0].value === 10, 'bare fence + series parsed'); }

// prose-wrapped JSON (model added a preamble/suffix)
{ const o = pxcParseExtractJSON('Here is the result:\n{"kind":"text","markdown":"# Title"}\nHope that helps!');
  ok(o.kind === 'text' && o.markdown === '# Title', 'prose-wrapped JSON: first {...} span extracted'); }

// plain text (not JSON) → text fallback carries the raw content
{ const o = pxcParseExtractJSON('Just some OCR text with no structure.');
  ok(o.kind === 'text' && o.markdown === 'Just some OCR text with no structure.', 'plain text → {kind:text, markdown:raw}'); }

// broken JSON → fallback, never throws
{ const o = pxcParseExtractJSON('{"kind":"table", "markdown": ');
  ok(o.kind === 'text' && typeof o.markdown === 'string', 'malformed JSON → text fallback (no throw)'); }

// empty / null
{ ok(pxcParseExtractJSON('').markdown === '', 'empty string → empty markdown');
  ok(pxcParseExtractJSON(null).markdown === '', 'null → empty markdown'); }

// table markdown+csv both present (the dual-fill contract)
{ const o = pxcParseExtractJSON('{"kind":"table","markdown":"| x |\\n|---|\\n| 1 |","csv":"x\\n1"}');
  ok(o.markdown.indexOf('|') === 0 && o.csv === 'x\n1', 'table: markdown + csv both present'); }

if (fail) { console.error(fail + ' FAILED'); process.exit(1); } else { console.log('pxc_aiextract: all passed'); }
