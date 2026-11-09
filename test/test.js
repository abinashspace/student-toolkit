const assert = require('assert'); const fs = require('fs'); const path = require('path');
const C = require('../calc.js'); let n = 0;
// Brute-force reference
function bruteMiss(a, t, p) { let k = 0; while (100 * a >= p * (t + k + 1)) k++; return k; }
function bruteAttend(a, t, p) { let k = 0; while (100 * (a + k) < p * (t + k)) k++; return k; }
for (let t = 0; t <= 60; t++) for (let a = 0; a <= t; a++) for (let p = 0; p <= 100; p++) {
  const r = C.analyze(a, t, p); n++;
  if (p === 0) { assert.strictEqual(r.status, 'unlimited'); continue; }
  if (100 * a >= p * t) { assert.strictEqual(r.status, 'safe'); assert.strictEqual(r.canMiss, bruteMiss(a, t, p), `${a}/${t}@${p}`); }
  else if (p === 100) assert.strictEqual(r.status, 'impossible');
  else { assert.strictEqual(r.status, 'short'); assert.strictEqual(r.mustAttend, bruteAttend(a, t, p), `${a}/${t}@${p}`); }
  // displayed % never overstates
  if (t) { const shown = parseFloat(C.percentText(a, t)); assert(shown <= 100 * a / t + 1e-9 && 100 * a / t - shown < 0.1); if (100*a < p*t) assert(shown < p); }
}
// Boundaries
assert.strictEqual(C.percentText(0, 0), '—');
assert.strictEqual(C.percentText(2, 3), '66.6%');
assert.strictEqual(C.percentText(149, 200), '74.5%');
assert.strictEqual(C.percentText(2999, 3000), '99.9%');
assert.deepStrictEqual(C.analyze(0, 0, 75), { status: 'safe', meets: true, canMiss: 0 });
assert.strictEqual(C.analyze(100000, 100000, 1).canMiss, 9900000);
assert.strictEqual(C.analyze(0, 100000, 99).mustAttend, 9900000);
for (const bad of [[-1, 2, 75], [3, 2, 75], [1.5, 2, 75], [1, 2, 101], [1, 2, -1], [1, 2, 75.5], [NaN, 1, 75], ['1', 2, 75], [1, 100001, 75]])
  assert.strictEqual(C.analyze(...bad).status, 'invalid', JSON.stringify(bad));
// Traffic-light status buckets
assert.strictEqual(C.status(0, 0, 75), 'none');
assert.strictEqual(C.status(7, 10, 75), 'risk');
assert.strictEqual(C.status(3, 4, 75), 'borderline'); // canMiss 0
assert.strictEqual(C.status(8, 10, 75), 'borderline'); // canMiss 0 (8/11 < 75%)
assert.strictEqual(C.status(4, 5, 75), 'borderline'); // canMiss 0 (4/6 < 75%)
assert.strictEqual(C.status(16, 20, 75), 'borderline'); // canMiss 1
assert.strictEqual(C.status(18, 20, 75), 'safe');
assert.strictEqual(C.status(0, 5, 0), 'safe');
assert.strictEqual(C.status(5, 5, 100), 'borderline');
assert.strictEqual(C.status(4, 5, 100), 'risk');
assert.strictEqual(C.status(5, 3, 75), 'none');
// SW assets exist and are relative
const sw = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/ASSETS = (\[.*?\])/)[1].replace(/'/g, '"'));
for (const a of assets) { assert(a.startsWith('./')); if (a !== './') assert(fs.existsSync(path.join(__dirname, '..', a)), a); }
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert(!/(src|href)="\//.test(html), 'no root-absolute URLs');
for (const m of html.matchAll(/(?:src|href)="(\.\/[^"#]*)"/g)) { assert(fs.existsSync(path.join(__dirname, '..', m[1])), 'missing ' + m[1]); if (m[1] !== './') assert(assets.includes(m[1]), 'not cached by SW: ' + m[1]); }
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.webmanifest'), 'utf8'));
assert.strictEqual(manifest.start_url.startsWith('./'), true); assert.strictEqual(manifest.scope, './');
for (const i of manifest.icons) { assert(i.src.startsWith('./')); assert(fs.existsSync(path.join(__dirname, '..', i.src)), i.src); assert(assets.includes(i.src), 'icon not cached ' + i.src); }
assert(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
assert(/CACHE = 'student-toolkit-v3/.test(sw), 'SW cache version bumped');
// Files referenced from the stylesheet (vendored font) exist and are cached for offline use
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const cssUrls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => m[1]);
assert(cssUrls.length > 0, 'expected the vendored font url');
for (const u of cssUrls) { assert(u.startsWith('./'), 'relative css url ' + u); assert(fs.existsSync(path.join(__dirname, '..', u)), 'missing ' + u); assert(assets.includes(u), 'not cached by SW: ' + u); }
assert(!/fonts\.googleapis|fonts\.gstatic|@import/.test(css + html), 'no external font requests');
console.log(`OK: ${n} exhaustive cases + boundaries + SW asset checks`);
