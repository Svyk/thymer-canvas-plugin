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

// ── page-parse pure helpers (verbatim replicas) ──
function pxcParseBlockKey(fp, page, idx) { return 'parse:' + (fp || '') + ':p' + (page == null ? 0 : page) + ':b' + (idx == null ? 0 : idx); }
function pxcBlockToMd(b) {
  if (!b || typeof b !== 'object') return '';
  const kind = ['table', 'equation', 'figure', 'text'].indexOf(b.kind) >= 0 ? b.kind : 'text';
  if (kind === 'table') return String(b.markdown || b.csv || '');
  if (kind === 'equation') return b.latex ? ('$$' + String(b.latex) + '$$') : String(b.markdown || '');
  if (kind === 'figure') return b.caption ? ('> ' + String(b.caption)) : '';
  return String(b.markdown || b.text || '');
}

// dedup key: deterministic, unique per (fp,page,idx), stable across re-parse
{ ok(pxcParseBlockKey('FP', 3, 0) === 'parse:FP:p3:b0', 'block key shape');
  ok(pxcParseBlockKey('FP', 3, 1) !== pxcParseBlockKey('FP', 3, 0), 'distinct idx → distinct key');
  ok(pxcParseBlockKey('FP', 4, 0) !== pxcParseBlockKey('FP', 3, 0), 'distinct page → distinct key');
  ok(pxcParseBlockKey('FP', 3, 2) === pxcParseBlockKey('FP', 3, 2), 'same inputs → same key (re-parse replaces)');
  ok(pxcParseBlockKey('', null, null) === 'parse::p0:b0', 'null-safe defaults');
  ok((pxcParseBlockKey('FP', 3, 0).match(/:p(\d+):b/) || [])[1] === '3', 'page parses back out of the key (for parsed-pages set)'); }

// block → markdown, per kind
{ ok(pxcBlockToMd({ kind: 'table', markdown: '| a |' }) === '| a |', 'table → markdown');
  ok(pxcBlockToMd({ kind: 'table', csv: 'a,b' }) === 'a,b', 'table → csv fallback');
  ok(pxcBlockToMd({ kind: 'equation', latex: 'E=mc^2' }) === '$$E=mc^2$$', 'equation → $$latex$$');
  ok(pxcBlockToMd({ kind: 'figure', caption: 'A chart' }) === '> A chart', 'figure → > caption');
  ok(pxcBlockToMd({ kind: 'text', markdown: '# H' }) === '# H', 'text → markdown');
  ok(pxcBlockToMd({ kind: 'chart', markdown: 'x' }) === 'x', 'unknown kind → text path');
  ok(pxcBlockToMd(null) === '' && pxcBlockToMd('nope') === '', 'non-object → empty, never throws'); }

if (fail) { console.error(fail + ' FAILED'); process.exit(1); } else { console.log('pxc_aiextract: all passed'); }
