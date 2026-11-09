const assert = require('assert');
const G = require('../gpa.js');
const ten = G.clonePreset('ten'), four = G.clonePreset('four');
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, msg + ': ' + a + ' vs ' + b);

// Presets
assert.strictEqual(G.validateScale(ten), null); assert.strictEqual(G.validateScale(four), null);
assert.strictEqual(G.maxPoints(ten), 10); assert.strictEqual(G.maxPoints(four), 4);
assert.strictEqual(G.pointsFor(ten, 'O'), 10); assert.strictEqual(G.pointsFor(ten, 'a+'), 9); assert.strictEqual(G.pointsFor(ten, 'RA'), 0);
assert.strictEqual(G.pointsFor(ten, 'Z'), null); assert.strictEqual(G.pointsFor(ten, ''), null);
// clonePreset is a copy
ten[0].points = 99; assert.strictEqual(G.PRESETS.ten.grades[0].points, 10); ten[0].points = 10;

// Scale validation
assert(G.validateScale([])); assert(G.validateScale([{ label: 'A', points: 4 }, { label: 'a', points: 3 }]).includes('twice'));
assert(G.validateScale([{ label: '', points: 4 }])); assert(G.validateScale([{ label: 'A', points: -1 }]));
assert(G.validateScale([{ label: 'A', points: NaN }])); assert(G.validateScale([{ label: 'F', points: 0 }]));

// SGPA
let r = G.sgpa([{ credits: 4, grade: 'O' }, { credits: 3, grade: 'A' }, { credits: 3, grade: 'B' }], ten);
close(r.value, (40 + 24 + 18) / 10, 'sgpa'); assert.strictEqual(r.credits, 10);
assert.strictEqual(G.fmt(r.value), '8.20');
// Empty semester / all zero credits / ungraded
assert.strictEqual(G.sgpa([], ten).value, null);
r = G.sgpa([{ credits: 0, grade: 'O' }, { credits: 3, grade: '' }, { credits: 3, grade: 'X' }], ten);
assert.strictEqual(r.value, null); assert.strictEqual(r.skipped, 3);
// Zero-credit course does not change GPA
close(G.sgpa([{ credits: 3, grade: 'A' }, { credits: 0, grade: 'RA' }], ten).value, 8, 'zero credit');
// Failed grade counts (0 points) by default, can be excluded
r = G.sgpa([{ credits: 4, grade: 'O' }, { credits: 4, grade: 'RA' }], ten); close(r.value, 5, 'failed counted'); assert.strictEqual(r.failed, 1);
r = G.sgpa([{ credits: 4, grade: 'O' }, { credits: 4, grade: 'RA' }], ten, false); close(r.value, 10, 'failed excluded');
assert.strictEqual(G.sgpa([{ credits: 4, grade: 'F' }], ten, false).value, null);
assert.strictEqual(G.sgpa([{ credits: 4, grade: 'F' }], ten).value, 0);
// 4.0 scale with fractional points and half credits
r = G.sgpa([{ credits: 3, grade: 'A-' }, { credits: 1.5, grade: 'B+' }], four); close(r.value, (11.1 + 4.95) / 4.5, '4.0 scale');
// Invalid credits ignored
assert.strictEqual(G.sgpa([{ credits: -3, grade: 'A' }, { credits: '3', grade: 'A' }, { credits: 51, grade: 'A' }], ten).value, null);

// CGPA is credit-weighted, not a mean of SGPAs
const sems = [{ courses: [{ credits: 20, grade: 'O' }] }, { courses: [{ credits: 5, grade: 'B' }] }, { courses: [] }];
r = G.cgpa(sems, ten); close(r.value, (200 + 30) / 25, 'cgpa weighted'); assert.notStrictEqual(G.fmt(r.value), G.fmt((10 + 6) / 2));
assert.strictEqual(G.cgpa([], ten).value, null);
// Float drift: 0.1-type sums stay exact enough
r = G.cgpa([{ courses: Array.from({ length: 10 }, () => ({ credits: 0.5, grade: 'A-' })) }], four); assert.strictEqual(G.fmt(r.value), '3.70');

// fmt rounds half up to 2 decimals
assert.strictEqual(G.fmt(8.999), '9.00'); assert.strictEqual(G.fmt(58 / 7), '8.29'); assert.strictEqual(G.fmt(8.284), '8.28'); assert.strictEqual(G.fmt(8.125), '8.13'); assert.strictEqual(G.fmt(null), '—'); assert.strictEqual(G.fmt(10), '10.00'); assert.strictEqual(G.fmt(7.2), '7.20');

// Target helper
const cur = G.cgpa([{ courses: [{ credits: 20, grade: 'A' }] }], ten); // CGPA 8.00 over 20 credits
let t = G.targetHelper(cur, 8.5, 20, ten); assert.strictEqual(t.status, 'possible'); assert.strictEqual(t.required, 9);
t = G.targetHelper(cur, 9.0, 20, ten); assert.strictEqual(t.status, 'possible'); assert.strictEqual(t.required, 10); // exactly max is possible
t = G.targetHelper(cur, 9.01, 20, ten); assert.strictEqual(t.status, 'impossible'); assert(t.required > 10); close(t.bestCgpa, 9, 'best');
t = G.targetHelper(cur, 8.0, 20, ten); assert.strictEqual(t.status, 'possible'); assert.strictEqual(t.required, 8);
t = G.targetHelper(cur, 4.0, 20, ten); assert.strictEqual(t.status, 'guaranteed'); // need 0
t = G.targetHelper(cur, 3.0, 20, ten); assert.strictEqual(t.status, 'guaranteed');
// Required is rounded UP to 2 decimals: (8.333*(20+3) - 160)/3 → ceil
t = G.targetHelper(cur, 8.1, 3, ten); assert.strictEqual(t.status, 'possible');
assert(t.required * 3 + 160 >= 8.1 * 23 - 1e-9, 'rounded up satisfies target'); assert(Math.abs(t.required - (8.1 * 23 - 160) / 3) < 0.01);
// No history yet: required == target
t = G.targetHelper(G.cgpa([], ten), 7.5, 20, ten); assert.strictEqual(t.required, 7.5);
// Invalid inputs
for (const [tg, cr] of [[11, 20], [-1, 20], [NaN, 20], [8, 0], [8, -2], [8, NaN], [8, 51]]) assert.strictEqual(G.targetHelper(cur, tg, cr, ten).status, 'invalid', tg + '/' + cr);
// Brute force: required SGPA s (2dp) is minimal s.t. CGPA >= target
for (let C = 0; C <= 30; C += 3) for (let P10 = 0; P10 <= C * 10; P10 += 7) for (const N of [1, 4, 20]) for (let T = 0; T <= 10; T += 0.37) {
  const res = G.targetHelper({ credits: C, weighted: P10 }, T, N, ten);
  if (res.status === 'possible') {
    assert((P10 + res.required * N) / (C + N) >= T - 1e-9, 'meets');
    assert((P10 + (res.required - 0.01) * N) / (C + N) < T + 1e-9, 'minimal');
  } else if (res.status === 'impossible') assert((P10 + 10 * N) / (C + N) < T);
  else if (res.status === 'guaranteed') assert(P10 / (C + N) >= T - 1e-9);
}
console.log('OK: GPA/CGPA + target helper tests');
