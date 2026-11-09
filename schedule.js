// Pure date/time helpers for the timetable and exam countdowns. All times are device-local.
(function (root) {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n) => String(n).padStart(2, '0');
  // 'HH:MM' -> minutes since midnight, or null.
  function parseTime(s) {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof s === 'string' ? s : '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  // 'YYYY-MM-DD' -> {y,m,d} if it is a real calendar date, else null.
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y, m: mo, d };
  }
  function dateKey(now) { return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  // Local Date for an exam. Without a time, the exam counts as happening at the start of the day
  // and stays "upcoming" until the day ends.
  function examStart(date, time) {
    const d = parseDate(date); if (!d) return null;
    const t = time ? parseTime(time) : 0; if (t === null) return null;
    return new Date(d.y, d.m - 1, d.d, Math.floor(t / 60), t % 60, 0, 0);
  }
  function examEnd(date, time) {
    const d = parseDate(date); if (!d) return null;
    if (!time) return new Date(d.y, d.m - 1, d.d + 1, 0, 0, 0, 0);
    const s = examStart(date, time); return s && new Date(s.getTime() + 3 * 3600 * 1000); // assume ~3h exam
  }
  // Whole calendar days from `now`'s date to the given date (DST-safe).
  function calendarDays(now, date) {
    const d = parseDate(date); if (!d) return null;
    const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.UTC(d.y, d.m - 1, d.d) - a) / 86400000);
  }
  function countdown(date, time, now) {
    const start = examStart(date, time); if (!start) return { status: 'invalid' };
    const end = examEnd(date, time);
    const ms = start.getTime() - now.getTime();
    const days = calendarDays(now, date);
    if (now.getTime() >= end.getTime()) return { status: 'done', days };
    if (ms <= 0) return { status: 'now', days: 0 };
    const mins = Math.floor(ms / 60000);
    return { status: 'upcoming', ms, days, d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
  }
  function countdownText(c, hasTime) {
    if (c.status === 'done') return 'Done';
    if (c.status === 'now') return hasTime ? 'Happening now' : 'Today';
    if (c.status !== 'upcoming') return '';
    if (c.days === 0) return hasTime ? (c.h ? 'in ' + c.h + 'h ' + c.m + 'm' : 'in ' + c.m + 'm') : 'Today';
    if (c.days === 1 && !hasTime) return 'Tomorrow';
    if (!hasTime) return 'in ' + c.days + ' days';
    if (c.d === 0) return 'in ' + c.h + 'h ' + c.m + 'm';
    return 'in ' + c.d + 'd ' + c.h + 'h';
  }
  function sortExams(exams) {
    return exams.slice().sort((a, b) => (examStart(a.date, a.time) - examStart(b.date, b.time)) || String(a.name).localeCompare(String(b.name)));
  }
  function splitExams(exams, now) {
    const upcoming = [], done = [];
    for (const e of sortExams(exams)) (countdown(e.date, e.time, now).status === 'done' ? done : upcoming).push(e);
    done.reverse(); // most recent first
    return { upcoming, done };
  }
  function slotsForDay(slots, day) {
    return slots.filter((s) => s.day === day).sort((a, b) => parseTime(a.start) - parseTime(b.start) || parseTime(a.end) - parseTime(b.end));
  }
  // Current class (start <= now < end) and next class (start > now) for today.
  function currentAndNext(slots, now) {
    const today = slotsForDay(slots, now.getDay());
    const t = now.getHours() * 60 + now.getMinutes();
    const current = today.find((s) => parseTime(s.start) <= t && t < parseTime(s.end)) || null;
    const next = today.find((s) => parseTime(s.start) > t) || null;
    return { today, current, next };
  }
  function validSlot(s) {
    return s && Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && parseTime(s.start) !== null && parseTime(s.end) !== null && parseTime(s.end) > parseTime(s.start);
  }
  function fmtTime(s, h24) {
    const t = parseTime(s); if (t === null) return '';
    if (h24) return s;
    const h = Math.floor(t / 60), m = t % 60;
    return ((h + 11) % 12 + 1) + ':' + pad(m) + (h < 12 ? ' AM' : ' PM');
  }
  const api = { DAYS, parseTime, parseDate, dateKey, examStart, examEnd, calendarDays, countdown, countdownText, sortExams, splitExams, slotsForDay, currentAndNext, validSlot, fmtTime };
  if (typeof module !== 'undefined') module.exports = api; else root.Schedule = api;
})(this);
