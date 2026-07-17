const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'plugin.js'), 'utf8');
let failures = 0;
const check = (condition, message) => {
  if (!condition) { failures++; console.error('FAIL:', message); }
};

check(source.includes("api.contract === 'thymer-semantic-v1' && api.version === 1"), 'Canvas validates the public semantic ABI');
check(source.includes('api.similarTo(recordGuid'), 'record cards use similarTo(record)');
check(source.includes('api.embedPassages(passages'), 'arbitrary canvas text uses embedPassages');
check(source.includes('candidateRecordGuids: recordGuids'), 'mixed/record comparisons remain canvas-candidate scoped');
check(source.includes('PXC_BGE_RECORD_EDGE = 0.60') && source.includes('PXC_BGE_PASSAGE_EDGE = 0.62'), 'BGE thresholds are explicit and recalibrated');
check(source.includes('native-lexical-fallback'), 'Canvas has a bounded no-service fallback');
check(!source.includes('Xenova/all-MiniLM-L6-v2'), 'Canvas no longer owns a MiniLM model');
check(!source.includes("import('https://cdn.jsdelivr.net/npm/@huggingface/transformers"), 'Canvas no longer imports remote model code');
check(!source.includes('this.plugin._embed('), 'Canvas no longer embeds one element at a time');

if (failures) process.exit(1);
console.log('plexus-canvas shared semantic-service checks passed');
