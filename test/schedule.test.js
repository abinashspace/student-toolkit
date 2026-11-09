const assert = require('assert');
const S = require('../schedule.js');
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);

// Parsing
assert.strictEqual(S.parseTime('09:05'), 545); assert.strictEqual(S.parseTime('23:59'), 1439);
for (const bad of ['24:00', '9:00', '12:60', '', null, 'ab:cd']) assert.strictEqual(S.parseTime(bad), null, String(bad));
assert.deepStrictEqual(S.parseDate('2028-02-29'), { y: 2028, m: 2, d: 29 });
for (const bad of ['2027-02-29', '2026-13-01', '2026-04-31', '2026-1-1', '', null]) assert.strictEqual(S.parseDate(bad), null, String(bad));

// Calendar days (month/year boundaries)
assert.strictEqual(S.calendarDays(at(2026, 11, 9, 23, 59), '2026-11-10'), 1);
assert.strictEqual(S.calendarDays(at(2026, 12, 31, 12), '2027-01-01'), 1);
assert.strictEqual(S.calendarDays(at(2026, 11, 9), '2026-11-09'), 0);
assert.strictEqual(S.calendarDays(at(2026, 11, 9), '2026-11-01'), -8);
assert.strictEqual(S.calendarDays(at(2026, 3, 1), '2026-04-01'), 31);

// Countdown with time
let c = S.countdown('2026-11-12', '10:30', at(2026, 11, 9, 8, 0));
assert.strictEqual(c.status, 'upcoming'); assert.strictEqual(c.days, 3); assert.strictEqual(c.d, 3); assert.strictEqual(c.h, 2); assert.strictEqual(c.m, 30);
assert.strictEqual(S.countdownText(c, true), 'in 3d 2h');
c = S.countdown('2026-11-10', '09:00', at(2026, 11, 9, 22, 0)); // tomorrow but <24h away
assert.strictEqual(c.days, 1); assert.strictEqual(c.d, 0); assert.strictEqual(S.countdownText(c, true), 'in 11h 0m');
c = S.countdown('2026-11-09', '10:00', at(2026, 11, 9, 9, 59)); assert.strictEqual(S.countdownText(c, true), 'in 1m');
c = S.countdown('2026-11-09', '10:00', at(2026, 11, 9, 10, 0)); assert.strictEqual(c.status, 'now');
c = S.countdown('2026-11-09', '10:00', at(2026, 11, 9, 12, 59)); assert.strictEqual(c.status, 'now');
c = S.countdown('2026-11-09', '10:00', at(2026, 11, 9, 13, 0)); assert.strictEqual(c.status, 'done');
// Without time: whole-day semantics
c = S.countdown('2026-11-10', '', at(2026, 11, 9, 23, 0)); assert.strictEqual(S.countdownText(c, false), 'Tomorrow');
c = S.countdown('2026-11-09', '', at(2026, 11, 9, 23, 59)); assert.strictEqual(c.status, 'now'); assert.strictEqual(S.countdownText(c, false), 'Today');
c = S.countdown('2026-11-09', '', at(2026, 11, 10, 0, 0)); assert.strictEqual(c.status, 'done');
c = S.countdown('2026-11-20', '', at(2026, 11, 9, 15)); assert.strictEqual(S.countdownText(c, false), 'in 11 days');
assert.strictEqual(S.countdown('2026-02-30', '', at(2026, 1, 1)).status, 'invalid');
assert.strictEqual(S.countdown('2026-02-10', '25:00', at(2026, 1, 1)).status, 'invalid');

// Sorting and splitting
const exams = [
  { id: 'c', name: 'C', date: '2026-12-01', time: '' }, { id: 'a', name: 'A', date: '2026-11-20', time: '14:00' },
  { id: 'b', name: 'B', date: '2026-11-20', time: '09:00' }, { id: 'old', name: 'Old', date: '2026-10-01', time: '' },
  { id: 'old2', name: 'Old2', date: '2026-11-01', time: '' }];
const sp = S.splitExams(exams, at(2026, 11, 9, 12));
assert.deepStrictEqual(sp.upcoming.map((e) => e.id), ['b', 'a', 'c']);
assert.deepStrictEqual(sp.done.map((e) => e.id), ['old2', 'old']);

// Timetable current/next
const slots = [
  { id: '1', day: 1, start: '09:00', end: '10:00' }, { id: '2', day: 1, start: '10:00', end: '11:00' },
  { id: '3', day: 1, start: '13:00', end: '14:00' }, { id: '4', day: 2, start: '09:00', end: '10:00' }];
const mon = (h, m) => at(2026, 11, 9, h, m); // 2026-11-09 is a Monday
assert.strictEqual(mon(9, 0).getDay(), 1);
let cn = S.currentAndNext(slots, mon(8, 0)); assert.strictEqual(cn.current, null); assert.strictEqual(cn.next.id, '1'); assert.strictEqual(cn.today.length, 3);
cn = S.currentAndNext(slots, mon(9, 30)); assert.strictEqual(cn.current.id, '1'); assert.strictEqual(cn.next.id, '2');
cn = S.currentAndNext(slots, mon(10, 0)); assert.strictEqual(cn.current.id, '2'); assert.strictEqual(cn.next.id, '3'); // end is exclusive
cn = S.currentAndNext(slots, mon(11, 30)); assert.strictEqual(cn.current, null); assert.strictEqual(cn.next.id, '3');
cn = S.currentAndNext(slots, mon(14, 0)); assert.strictEqual(cn.current, null); assert.strictEqual(cn.next, null);
assert.deepStrictEqual(S.slotsForDay([{ day: 3, start: '11:00', end: '12:00' }, { day: 3, start: '08:00', end: '09:00' }], 3).map((s) => s.start), ['08:00', '11:00']);
assert(S.validSlot({ day: 0, start: '08:00', end: '08:01' }));
for (const bad of [{ day: 7, start: '08:00', end: '09:00' }, { day: 1, start: '09:00', end: '09:00' }, { day: 1, start: '10:00', end: '09:00' }, { day: 1.5, start: '08:00', end: '09:00' }, null])
  assert(!S.validSlot(bad), JSON.stringify(bad));
assert.strictEqual(S.fmtTime('00:05'), '12:05 AM'); assert.strictEqual(S.fmtTime('12:00'), '12:00 PM'); assert.strictEqual(S.fmtTime('13:45'), '1:45 PM'); assert.strictEqual(S.fmtTime('13:45', true), '13:45');
assert.strictEqual(S.dateKey(at(2026, 1, 5)), '2026-01-05');
console.log('OK: timetable + countdown tests');
