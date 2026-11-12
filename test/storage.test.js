// Storage, v1 -> v2 migration, and backup import validation.
const assert = require('assert');
const Store = require('../store.js');
const V1 = Store.V1_KEY, V2 = Store.KEY;
function mem(init) { const s = { ...init }; return { s, getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; }

// Fresh / corrupt
let r = Store.load(mem({})); assert.strictEqual(r.source, 'new'); assert.strictEqual(r.state.attendance.target, 75); assert.strictEqual(r.state.attendance.subjects.length, 0);
r = Store.load(mem({ [V1]: '{not json' })); assert.strictEqual(r.state.attendance.target, 75); assert.strictEqual(r.state.attendance.subjects.length, 0);
r = Store.load({ getItem() { throw new Error('blocked'); } }); assert.strictEqual(r.source, 'unavailable');

// v1 migration keeps every valid subject exactly, same filtering rules as v1
const v1 = { target: 80, subjects: [
  { id: 'a1', name: 'Maths', attended: 30, total: 40 }, { id: 'b2', name: 'Physics', attended: 0, total: 0 },
  { id: 'bad', name: 'X', attended: 5, total: 3 }, { id: 'c3', name: 'Chem', attended: 100000, total: 100000 }] };
const m = mem({ [V1]: JSON.stringify(v1) });
r = Store.load(m); assert.strictEqual(r.source, 'v1');
assert.strictEqual(r.state.attendance.target, 80);
assert.deepStrictEqual(r.state.attendance.subjects.map((s) => [s.id, s.name, s.attended, s.total, s.target]),
  [['a1', 'Maths', 30, 40, null], ['b2', 'Physics', 0, 0, null], ['c3', 'Chem', 100000, 100000, null]]);
assert.strictEqual(r.state.version, 2); assert.strictEqual(r.state.gpa.preset, 'ten'); assert.deepStrictEqual(r.state.exams, []);
// After saving v2, the v1 key is still there and v2 wins on next load
m.setItem(V2, Store.serialize(r.state)); assert(m.s[V1]);
r.state.attendance.subjects[0].attended = 31; m.setItem(V2, Store.serialize(r.state));
r = Store.load(m); assert.strictEqual(r.source, 'v2'); assert.strictEqual(r.state.attendance.subjects[0].attended, 31);
// Corrupt v2 falls back to v1 copy rather than losing everything
m.setItem(V2, '{oops'); r = Store.load(m); assert.strictEqual(r.source, 'v1'); assert.strictEqual(r.state.attendance.subjects.length, 3);
// v1 invalid target -> 75 (as v1 did)
r = Store.load(mem({ [V1]: JSON.stringify({ target: 500, subjects: [{ id: 'b', name: 'Y', attended: 3, total: 4 }] }) }));
assert.strictEqual(r.state.attendance.target, 75); assert.strictEqual(r.state.attendance.subjects.length, 1);

// Round trip of a full v2 state
const full = Store.defaults();
full.attendance.subjects.push({ id: 's1', name: 'DS', attended: 9, total: 10, target: 85, color: 2 });
full.gpa.semesters.push({ id: 'sem1', name: 'Sem 1', courses: [{ id: 'k1', name: 'DS', credits: 4, grade: 'A+' }] });
full.gpa.target = { cgpa: 8.5, credits: 22 };
full.timetable.push({ id: 't1', day: 1, start: '09:00', end: '10:00', subjectId: 's1', label: '', room: 'B12' });
full.timetable.push({ id: 't2', day: 2, start: '11:00', end: '12:00', subjectId: null, label: 'Library', room: '' });
full.exams.push({ id: 'e1', name: 'DS', date: '2026-12-01', time: '10:00', room: '' });
full.settings.theme = 'dark';
assert.deepStrictEqual(Store.normalize(JSON.parse(Store.serialize(full))), full);

// Import validation
let imp = Store.parseImport(Store.exportData(full, new Date('2026-11-09T10:00:00Z')));
assert(imp.ok); assert.strictEqual(imp.dropped, 0); assert.deepStrictEqual(imp.state, full);
imp = Store.parseImport(JSON.stringify(v1)); assert(imp.ok); assert.strictEqual(imp.state.attendance.subjects.length, 3); assert.strictEqual(imp.dropped, 1);
for (const [txt, frag] of [['', 'empty'], ['   ', 'empty'], ['{bad', 'not valid JSON'], ['[]', 'not a Student'], ['"hi"', 'not a Student'], ['null', 'not a Student'],
  [JSON.stringify({ foo: 1 }), 'not a Student'], [JSON.stringify({ app: 'student-toolkit', version: 3, data: {} }), 'newer'],
  [JSON.stringify({ app: 'student-toolkit', version: 2 }), 'no data'], ['x'.repeat(2000001), 'too large']]) {
  const res = Store.parseImport(txt); assert.strictEqual(res.ok, false, txt.slice(0, 30)); assert(res.error.includes(frag), res.error);
}
// Bad entries dropped and counted, good ones kept
const messy = { app: 'student-toolkit', version: 2, data: {
  attendance: { target: 75, subjects: [{ id: 's1', name: 'OK', attended: 1, total: 2, target: 101 }, { name: '', attended: 1, total: 1 }, { name: 'Neg', attended: -1, total: 2 }, { id: 's1', name: 'Dup id', attended: 0, total: 0 }] },
  gpa: { preset: 'ten', grades: [{ label: 'A', points: 4 }, { label: 'A', points: 3 }], semesters: [{ name: 'S1', courses: [{ name: 'c', credits: -1, grade: 'A' }, { name: 'd', credits: 3, grade: 'O' }] }, 'junk'], target: { cgpa: 99, credits: 0 } },
  timetable: [{ day: 1, start: '10:00', end: '09:00', label: 'bad' }, { day: 1, start: '09:00', end: '10:00', subjectId: 'gone', label: '' }, { day: 1, start: '09:00', end: '10:00', subjectId: 's1' }, { day: 9, start: '09:00', end: '10:00', label: 'x' }],
  exams: [{ name: 'Bad date', date: '2026-02-30' }, { name: 'Good', date: '2026-12-01' }, { name: 'Bad time', date: '2026-12-01', time: '7pm' }, { name: '', date: '2026-12-01' }],
  settings: { theme: 'neon', clock24: 'yes' } } };
imp = Store.parseImport(JSON.stringify(messy)); assert(imp.ok);
const st = imp.state;
assert.deepStrictEqual(st.attendance.subjects.map((s) => s.name), ['OK', 'Dup id']);
assert.strictEqual(st.attendance.subjects[0].target, null); assert.notStrictEqual(st.attendance.subjects[1].id, 's1');
assert.strictEqual(st.gpa.grades.length, 8); assert.strictEqual(st.gpa.preset, 'ten'); // bad scale -> default 10-point
assert.strictEqual(st.gpa.semesters.length, 1); assert.strictEqual(st.gpa.semesters[0].courses.length, 1);
assert.deepStrictEqual(st.gpa.target, { cgpa: null, credits: null });
assert.strictEqual(st.timetable.length, 1); assert.strictEqual(st.timetable[0].subjectId, 's1');
assert.deepStrictEqual(st.exams.map((e) => e.name), ['Good']);
assert.strictEqual(st.settings.theme, 'light'); assert.strictEqual(st.settings.clock24, false);
assert.strictEqual(imp.dropped, 2 + 1 + 1 + 1 + 3 + 3); // subjects, scale, course, semester, slots, exams
// Theme: light by default; a saved 'system' migrates to light; explicit dark is kept
assert.strictEqual(Store.normalize({}).settings.theme, 'light');
assert.strictEqual(Store.normalize({ settings: { theme: 'system' } }).settings.theme, 'light');
assert.strictEqual(Store.normalize({ settings: { theme: 'dark' } }).settings.theme, 'dark');
assert.strictEqual(Store.normalize({ settings: { theme: 'light' } }).settings.theme, 'light');
// Import never carries prototype pollution keys into state
imp = Store.parseImport('{"app":"student-toolkit","version":2,"data":{"__proto__":{"polluted":1},"attendance":{"target":75,"subjects":[]}}}');
assert(imp.ok); assert.strictEqual({}.polluted, undefined); assert.strictEqual(imp.state.polluted, undefined);

// Existing 10-point data is not silently switched to an AU preset, and countFailed stays as saved
const oldTen = Store.normalize({ gpa: { preset: 'ten', grades: Store.defaults().gpa.grades, countFailed: true, semesters: [{ name: 'S1', courses: [{ name: 'DS', credits: 4, grade: 'A+' }] }] } });
assert.strictEqual(oldTen.gpa.preset, 'ten'); assert.strictEqual(oldTen.gpa.countFailed, true);
assert.strictEqual(oldTen.gpa.classification.arrearsHistory, false);
const oldCustom = Store.normalize({ gpa: { preset: 'custom', grades: [{ label: 'O', points: 10 }, { label: 'A', points: 8 }], countFailed: false, semesters: [] } });
assert.strictEqual(oldCustom.gpa.preset, 'custom'); assert.strictEqual(oldCustom.gpa.countFailed, false);
// AU presets round-trip; missing countFailed on an AU preset defaults to excluded
const auState = Store.defaults();
auState.gpa.preset = 'au2021'; auState.gpa.grades = require('../gpa.js').clonePreset('au2021'); auState.gpa.countFailed = false;
auState.gpa.classification = { arrearsHistory: true, attendancePrevented: false };
auState.pass = { scheme: 'r2021-lab', internal: 48, internalMax: null, examMax: null };
assert.deepStrictEqual(Store.normalize(JSON.parse(Store.serialize(auState))), auState);
let auImp = Store.parseImport(Store.exportData(auState, new Date('2026-11-12T04:00:00Z')));
assert(auImp.ok); assert.strictEqual(auImp.state.gpa.preset, 'au2021'); assert.strictEqual(auImp.state.gpa.countFailed, false);
assert.strictEqual(auImp.state.gpa.classification.arrearsHistory, true); assert.strictEqual(auImp.state.pass.scheme, 'r2021-lab');
const auMissing = Store.normalize({ gpa: { preset: 'au2017', grades: require('../gpa.js').clonePreset('au2017'), semesters: [] } });
assert.strictEqual(auMissing.gpa.countFailed, false);
const tenMissing = Store.normalize({ gpa: { preset: 'ten', grades: Store.defaults().gpa.grades, semesters: [] } });
assert.strictEqual(tenMissing.gpa.countFailed, true);
assert.strictEqual(Store.normalize({ pass: { scheme: 'nope', internal: -1 } }).pass.scheme, 'r2021-theory');
assert.strictEqual(Store.normalize({ pass: { scheme: 'custom', internal: 12, internalMax: 30, examMax: 70 } }).pass.internalMax, 30);
console.log('OK: storage, migration and import tests');
