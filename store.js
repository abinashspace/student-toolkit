// Data model, v1 -> v2 migration, and backup import validation. No DOM.
(function (root) {
  const isNode = typeof module !== 'undefined';
  const C = isNode ? require('./calc.js') : root.AttendanceCalc;
  const G = isNode ? require('./gpa.js') : root.GpaCalc;
  const S = isNode ? require('./schedule.js') : root.Schedule;
  const KEY = 'student-toolkit-v2';
  const V1_KEY = 'attendance-calculator-v1';
  const APP = 'student-toolkit';
  const LIMIT = 500; // max items per list, keeps a bad import from bloating storage

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
  function idOf(v) { return typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : uid(); }
  function isTarget(t) { return !C.validate(0, 0, t); }

  function defaults() {
    return {
      version: 2,
      attendance: { target: 75, subjects: [] },
      marks: { date: '', items: {} },
      gpa: { preset: 'ten', grades: G.clonePreset('ten'), countFailed: true, semesters: [], target: { cgpa: null, credits: null }, classification: { arrearsHistory: false, attendancePrevented: false } },
      pass: { scheme: 'r2021-theory', internal: null, internalMax: null, examMax: null },
      timetable: [],
      exams: [],
      settings: { theme: 'light', clock24: false },
    };
  }

  // Each normalizer keeps valid entries and counts the ones it had to drop.
  function normSubjects(list, ctx) {
    const out = [], ids = new Set();
    for (const s of Array.isArray(list) ? list : []) {
      if (out.length >= LIMIT) { ctx.dropped++; continue; }
      const name = s && str(s.name, 60);
      if (!name || C.validate(s.attended, s.total, 0)) { ctx.dropped++; continue; }
      let id = idOf(s.id); if (ids.has(id)) id = uid(); ids.add(id);
      out.push({ id, name, attended: s.attended, total: s.total,
        target: isTarget(s.target) ? s.target : null,
        color: Number.isInteger(s.color) && s.color >= 0 && s.color < 8 ? s.color : out.length % 8 });
    }
    return out;
  }
  const PRESET_KEYS = ['ten', 'four', 'au2021', 'au2017', 'custom'];
  const PASS_SCHEMES = ['r2017-theory', 'r2021-theory', 'r2021-lab', 'r2021-theory-lab', 'custom'];
  function isMark100(n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 && Math.round(n * 100) === n * 100; }
  function normGpa(g, ctx) {
    const d = defaults().gpa; if (!g || typeof g !== 'object') return d;
    const grades = Array.isArray(g.grades) ? g.grades.map((x) => ({ label: str(x && x.label, 6), points: x && x.points })) : null;
    const scaleOk = grades && !G.validateScale(grades);
    if (g.grades !== undefined && !scaleOk) ctx.dropped++;
    // Keep a saved preset as-is when it is known; never silently switch an existing scale to an AU preset.
    const preset = scaleOk && PRESET_KEYS.includes(g.preset) ? g.preset : (scaleOk ? 'custom' : 'ten');
    const au = G.isAuPreset(preset);
    const out = {
      preset,
      grades: scaleOk ? grades : d.grades,
      countFailed: typeof g.countFailed === 'boolean' ? g.countFailed : !au,
      semesters: [],
      target: { cgpa: null, credits: null },
      classification: {
        arrearsHistory: !!(g.classification && g.classification.arrearsHistory),
        attendancePrevented: !!(g.classification && g.classification.attendancePrevented),
      },
    };
    for (const s of Array.isArray(g.semesters) ? g.semesters.slice(0, 40) : []) {
      if (!s || typeof s !== 'object') { ctx.dropped++; continue; }
      const courses = [];
      for (const c of Array.isArray(s.courses) ? s.courses.slice(0, 60) : []) {
        if (!c || typeof c !== 'object' || !G.isCredits(c.credits)) { ctx.dropped++; continue; }
        courses.push({ id: idOf(c.id), name: str(c.name, 60), credits: c.credits, grade: str(c.grade, 6) });
      }
      out.semesters.push({ id: idOf(s.id), name: str(s.name, 40) || 'Semester ' + (out.semesters.length + 1), courses });
    }
    const t = g.target || {};
    const max = G.maxPoints(out.grades);
    if (typeof t.cgpa === 'number' && t.cgpa >= 0 && t.cgpa <= max) out.target.cgpa = t.cgpa;
    if (G.isCredits(t.credits) && t.credits > 0) out.target.credits = t.credits;
    return out;
  }
  function normTimetable(list, subjectIds, ctx) {
    const out = [];
    for (const s of Array.isArray(list) ? list : []) {
      if (out.length >= LIMIT || !S.validSlot(s)) { ctx.dropped++; continue; }
      const subjectId = typeof s.subjectId === 'string' && subjectIds.has(s.subjectId) ? s.subjectId : null;
      const label = str(s.label, 60);
      if (!subjectId && !label) { ctx.dropped++; continue; }
      out.push({ id: idOf(s.id), day: s.day, start: s.start, end: s.end, subjectId, label: subjectId ? '' : label, room: str(s.room, 30) });
    }
    return out;
  }
  function normExams(list, ctx) {
    const out = [];
    for (const e of Array.isArray(list) ? list : []) {
      const name = e && str(e.name, 60);
      const time = e && e.time ? e.time : '';
      if (out.length >= LIMIT || !name || !S.parseDate(e.date) || (time && S.parseTime(time) === null)) { ctx.dropped++; continue; }
      out.push({ id: idOf(e.id), name, date: e.date, time, room: str(e.room, 30) });
    }
    return out;
  }
  function normPass(p) {
    const d = defaults().pass;
    if (!p || typeof p !== 'object') return d;
    const scheme = PASS_SCHEMES.includes(p.scheme) ? p.scheme : d.scheme;
    const out = { scheme, internal: null, internalMax: null, examMax: null };
    if (isMark100(p.internal)) out.internal = p.internal;
    if (isMark100(p.internalMax) && p.internalMax > 0) out.internalMax = p.internalMax;
    if (isMark100(p.examMax) && p.examMax > 0) out.examMax = p.examMax;
    return out;
  }
  function normalize(raw, ctx) {
    ctx = ctx || { dropped: 0 };
    const d = defaults(); if (!raw || typeof raw !== 'object') return d;
    const a = raw.attendance || {};
    d.attendance.target = isTarget(a.target) ? a.target : 75;
    d.attendance.subjects = normSubjects(a.subjects, ctx);
    const ids = new Set(d.attendance.subjects.map((s) => s.id));
    if (raw.marks && typeof raw.marks.date === 'string' && raw.marks.items && typeof raw.marks.items === 'object') {
      for (const [k, v] of Object.entries(raw.marks.items)) if (v && ids.has(v.subjectId) && (v.kind === 'P' || v.kind === 'A')) d.marks.items[k] = { subjectId: v.subjectId, kind: v.kind };
      d.marks.date = raw.marks.date;
    }
    d.gpa = normGpa(raw.gpa, ctx);
    d.pass = normPass(raw.pass);
    d.timetable = normTimetable(raw.timetable, ids, ctx);
    d.exams = normExams(raw.exams, ctx);
    const st = raw.settings || {};
    d.settings.theme = st.theme === 'dark' ? 'dark' : 'light'; // light by default; old 'system' -> 'light'; dark only when chosen
    d.settings.clock24 = st.clock24 === true;
    return d;
  }
  // v1 shape: { target, subjects: [{id,name,attended,total}] }. Same validation rules as v1's loader.
  function fromV1(v1, ctx) {
    return normalize({ attendance: { target: v1 && v1.target, subjects: v1 && v1.subjects } }, ctx);
  }
  function isV1(o) { return !!o && typeof o === 'object' && Array.isArray(o.subjects) && !o.attendance; }

  // Load from a Storage-like object. Never deletes the v1 key, so v1 data is never lost.
  function load(storage) {
    let raw = null;
    try { raw = storage.getItem(KEY); } catch (e) { return { state: defaults(), source: 'unavailable' }; }
    if (raw) { try { return { state: normalize(JSON.parse(raw)), source: 'v2' }; } catch (e) { /* fall through to v1 */ } }
    try {
      const v1 = JSON.parse(storage.getItem(V1_KEY));
      if (isV1(v1)) return { state: fromV1(v1), source: 'v1' };
    } catch (e) { /* corrupt */ }
    return { state: defaults(), source: raw ? 'corrupt' : 'new' };
  }
  function serialize(state) { return JSON.stringify(state); }
  function exportData(state, now) { return JSON.stringify({ app: APP, version: 2, exportedAt: (now || new Date()).toISOString(), data: state }, null, 2); }

  // Validate a backup file's text. Accepts this app's v2 export or a raw v1 object.
  function parseImport(text) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' };
    if (text.length > 2000000) return { ok: false, error: 'The file is too large to be a Student Toolkit backup.' };
    let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'This file is not valid JSON.' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, error: 'This is not a Student Toolkit backup.' };
    const ctx = { dropped: 0 };
    if (o.app === APP) {
      if (typeof o.version !== 'number' || o.version > 2) return { ok: false, error: 'This backup is from a newer version of the app.' };
      if (!o.data || typeof o.data !== 'object') return { ok: false, error: 'The backup has no data.' };
      return { ok: true, state: normalize(o.data, ctx), dropped: ctx.dropped };
    }
    if (isV1(o)) return { ok: true, state: fromV1(o, ctx), dropped: ctx.dropped };
    return { ok: false, error: 'This is not a Student Toolkit backup.' };
  }
  const api = { KEY, V1_KEY, APP, uid, defaults, normalize, fromV1, load, serialize, exportData, parseImport };
  if (isNode) module.exports = api; else root.Store = api;
})(this);
