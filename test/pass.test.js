const assert = require('assert');
const P = require('../pass.js');
const close = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, msg + ': ' + a + ' vs ' + b);

assert.strictEqual(P.SCHEMES['r2017-theory'].internalMax, 20);
assert.strictEqual(P.SCHEMES['r2017-theory'].examMax, 80);
assert.strictEqual(P.SCHEMES['r2021-theory'].internalMax, 40);
assert.strictEqual(P.SCHEMES['r2021-theory'].examMax, 60);
assert.strictEqual(P.SCHEMES['r2021-lab'].internalMax, 60);
assert.strictEqual(P.SCHEMES['r2021-lab'].examMax, 40);
assert.strictEqual(P.SCHEMES['r2021-theory-lab'].internalMax, 50);
assert.strictEqual(P.SCHEMES['r2021-theory-lab'].examMax, 50);

// Empty / invalid
assert.strictEqual(P.needed({ scheme: 'r2021-theory' }).status, 'empty');
assert.strictEqual(P.needed({ scheme: 'r2021-theory', internal: null }).status, 'empty');
assert.strictEqual(P.needed({ scheme: 'nope', internal: 10 }).status, 'invalid');
assert.strictEqual(P.needed({ scheme: 'r2021-theory', internal: -1 }).status, 'invalid');
assert.strictEqual(P.needed({ scheme: 'r2021-theory', internal: 41 }).status, 'invalid');
assert.strictEqual(P.needed({ scheme: 'r2021-theory', internal: 20.001 }).status, 'invalid');
assert.strictEqual(P.needed({ scheme: 'custom', internal: 10, internalMax: 0, examMax: 100 }).status, 'invalid');
assert.strictEqual(P.needed({ scheme: 'custom', internal: 10 }).status, 'invalid');

// R2021 theory: 45% of 60 = 27. Internals 32 already cover 50% total (need 18 more), so exam-floor applies.
let r = P.needed({ scheme: 'r2021-theory', internal: 32 });
assert.strictEqual(r.status, 'possible'); assert.strictEqual(r.limitedBy, 'exam-floor');
close(r.needExam, 27, 'floor 27/60'); close(r.needOutOf100, 45, '45/100');

// Internals 20: need 30 for 50% total, which is above the 27 floor.
r = P.needed({ scheme: 'r2021-theory', internal: 20 });
assert.strictEqual(r.limitedBy, 'total'); close(r.needExam, 30, '30/60'); close(r.needOutOf100, 50, '50/100');

// Internals 0 on R2021 theory: need 50/60 (~83.34 ceiled).
r = P.needed({ scheme: 'r2021-theory', internal: 0 });
assert.strictEqual(r.status, 'possible'); close(r.needExam, 50, '50/60'); close(r.needOutOf100, 83.34, 'ceil 83.333');
assert(r.internal + r.needExam >= r.needTotal - 1e-9);
assert(r.needExam + 1e-9 >= r.floor45);

// R2021 lab: internals 9 + max 40 = 49 < 50, impossible
r = P.needed({ scheme: 'r2021-lab', internal: 9 });
assert.strictEqual(r.status, 'impossible'); close(r.maxTotal, 49, 'max total');

// Internals 10: need a perfect 40/40 to reach 50.
r = P.needed({ scheme: 'r2021-lab', internal: 10 });
assert.strictEqual(r.status, 'possible'); close(r.needExam, 40, '40/40'); close(r.needOutOf100, 100, '100/100');

// R2017 theory: internals 20, 45% of 80 = 36, total needs 30 more, so floor applies.
r = P.needed({ scheme: 'r2017-theory', internal: 20 });
assert.strictEqual(r.limitedBy, 'exam-floor'); close(r.needExam, 36, '36/80'); close(r.needOutOf100, 45, '45/100');

// Internals 0: need 50/80 = 62.5/100
r = P.needed({ scheme: 'r2017-theory', internal: 0 });
assert.strictEqual(r.limitedBy, 'total'); close(r.needExam, 50, '50/80'); close(r.needOutOf100, 62.5, '62.5/100');

// Theory+lab 50+50, internals 20: need 30 for total, 22.5 floor → 30
r = P.needed({ scheme: 'r2021-theory-lab', internal: 20 });
close(r.needExam, 30, '30/50'); close(r.needOutOf100, 60, '60/100');

// Custom 30+70, internals 0: need 50 for total (45% of 70 is 31.5)
r = P.needed({ scheme: 'custom', internal: 0, internalMax: 30, examMax: 70 });
close(r.needExam, 50, 'custom 50/70'); close(r.needOutOf100, 71.43, 'ceil 71.428');

// Custom already covering 50% total, only 45% exam left
r = P.needed({ scheme: 'custom', internal: 40, internalMax: 40, examMax: 60 });
assert.strictEqual(r.limitedBy, 'exam-floor'); close(r.needExam, 27, 'still 45%');

// already-safe does not occur for valid positive exam maxima under the 45% rule
for (const id of ['r2017-theory', 'r2021-theory', 'r2021-lab', 'r2021-theory-lab']) {
  const s = P.SCHEMES[id];
  for (let i = 0; i <= s.internalMax; i++) {
    const res = P.needed({ scheme: id, internal: i });
    assert.notStrictEqual(res.status, 'already-safe', id + ' ' + i);
  }
}

// Advice is never too low: ceiled need satisfies both rules, and one step lower would not (when not at a clean boundary after ceil)
r = P.needed({ scheme: 'r2021-theory', internal: 21.5 });
assert(r.internal + r.needExam + 1e-9 >= r.needTotal);
assert(r.needExam + 1e-9 >= r.floor45);
assert(r.needOutOf100 + 1e-9 >= 45);

console.log('OK: end-semester pass calculator tests');
