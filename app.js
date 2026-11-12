(function () {
  'use strict';
  const C = window.AttendanceCalc, G = window.GpaCalc, P = window.PassCalc, S = window.Schedule, Store = window.Store;
  const $ = (id) => document.getElementById(id);
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
  const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const STATUS_LABEL = { safe: 'Safe', borderline: 'Borderline', risk: 'At risk', none: 'No classes yet' };

  const loaded = Store.load(window.localStorage);
  let state = loaded.state;
  let storageOk = loaded.source !== 'unavailable';
  if (loaded.source === 'v1') save(); // migrate once; the v1 key is left untouched as a fallback copy

  function save() {
    try { localStorage.setItem(Store.KEY, Store.serialize(state)); storageOk = true; }
    catch (e) { storageOk = false; toast('Could not save on this device (storage full or blocked).'); }
  }

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const svgNS = 'http://www.w3.org/2000/svg';
  function ring(fraction, cls, text, size) {
    const r = 18, len = 2 * Math.PI * r;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 44 44'); svg.setAttribute('class', 'ring ' + cls); svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.style.width = size; svg.style.height = size; }
    const track = document.createElementNS(svgNS, 'circle');
    const val = document.createElementNS(svgNS, 'circle');
    for (const c of [track, val]) { c.setAttribute('cx', 22); c.setAttribute('cy', 22); c.setAttribute('r', r); }
    track.setAttribute('class', 'track'); val.setAttribute('class', 'val');
    val.setAttribute('stroke-dasharray', len.toFixed(2));
    val.setAttribute('stroke-dashoffset', (len * (1 - Math.max(0, Math.min(1, fraction)))).toFixed(2));
    svg.append(track, val);
    const wrap = h('div', { class: 'ring-wrap' }, svg, h('span', { class: 'ring-text', text }));
    return wrap;
  }
  // One line-icon set (lucide-style paths), one stroke; size comes from CSS.
  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    attendance: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    gpa: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    timetable: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    exams: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  };
  function icon(name, cls) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    svg.innerHTML = ICONS[name];
    return svg;
  }
  const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
  const now = () => new Date();
  const todayKey = () => S.dateKey(now());
  const subjectById = (id) => state.attendance.subjects.find((s) => s.id === id);
  const targetOf = (s) => (s.target === null || s.target === undefined ? state.attendance.target : s.target);
  const fmtTime = (t) => S.fmtTime(t, state.settings.clock24);
  function fmtDate(date) {
    const d = S.parseDate(date); if (!d) return date;
    return new Date(d.y, d.m - 1, d.d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.y === now().getFullYear() ? undefined : 'numeric' });
  }
  function parseCount(v) { v = String(v).trim(); return /^\d+$/.test(v) ? Number(v) : NaN; }
  function parseNum(v) { v = String(v).trim(); return /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN; }
  function slotName(slot) { const s = slot.subjectId && subjectById(slot.subjectId); return s ? s.name : slot.label || 'Class'; }
  function slotColor(slot) { const s = slot.subjectId && subjectById(slot.subjectId); return s ? s.color : 7; }

  // ---------- toast + undo ----------
  let toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    $('toast-msg').textContent = msg;
    undoFn = undo || null;
    $('toast-undo').hidden = !undo;
    const t = $('toast'); t.hidden = false;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6000 : 3500);
  }
  function hideToast() { const t = $('toast'); t.classList.remove('show'); undoFn = null; setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 250); }
  $('toast-undo').addEventListener('click', () => { const f = undoFn; hideToast(); if (f) f(); });

  // ---------- tabs ----------
  const TABS = ['attendance', 'gpa', 'timetable', 'exams'];
  let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'attendance';
  function showTab(name, focus) {
    tab = name;
    for (const t of TABS) {
      const b = $('tab-' + t), p = $('panel-' + t), on = t === name;
      b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; p.hidden = !on;
    }
    if (focus) $('tab-' + name).focus();
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0 });
  }
  document.querySelector('.tabbar').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  document.querySelector('.tabbar').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tab); let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % 4; else if (e.key === 'ArrowLeft') j = (i + 3) % 4; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = 3;
    if (j !== null) { e.preventDefault(); showTab(TABS[j], true); }
  });
  window.addEventListener('hashchange', () => { const n = location.hash.slice(1); if (TABS.includes(n) && n !== tab) showTab(n); });

  // ---------- dialogs ----------
  function openDialog(d, focusEl) {
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    if (focusEl) setTimeout(() => focusEl.focus(), 30);
  }
  function closeDialog(d) { if (typeof d.close === 'function') d.close(); else d.removeAttribute('open'); }
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); }); // backdrop tap
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(d)));
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]'); if (!a) return;
    ({ 'add-subject': () => openSubject(), 'add-sem': addSemester, 'add-slot': () => openSlot(), 'add-exam': () => openExam() })[a.dataset.action]();
  });

  // =====================================================================
  // ATTENDANCE
  // =====================================================================
  function message(s) {
    const p = targetOf(s), r = C.analyze(s.attended, s.total, p);
    if (s.total === 0) return 'No classes held yet';
    if (r.status === 'unlimited') return 'Target is 0%, so any absence is fine';
    if (r.status === 'safe') return r.canMiss === 0 ? 'On target, but you can’t miss the next class' : 'You can miss ' + plural(r.canMiss, 'class', 'classes') + ' and stay on target';
    if (r.status === 'impossible') return '100% is no longer reachable after a missed class';
    return 'Attend the next ' + plural(r.mustAttend, 'class', 'classes') + ' in a row to reach ' + p + '%';
  }
  function mark(id, present, slotId) {
    const s = subjectById(id); if (!s) return;
    if (s.total >= 100000) { toast('That’s the maximum number of classes.'); return; }
    const prev = { attended: s.attended, total: s.total };
    const key = slotId ? todayKey() + '|' + slotId : null;
    s.total += 1; if (present) s.attended += 1;
    if (key) { ensureMarksToday(); state.marks.items[key] = { subjectId: id, kind: present ? 'P' : 'A' }; }
    save(); renderAll();
    pulse(id);
    toast((present ? 'Present' : 'Absent') + ' · ' + s.name + ' · ' + C.percentText(s.attended, s.total), () => {
      const cur = subjectById(id); if (!cur) return;
      cur.attended = prev.attended; cur.total = prev.total;
      if (key) delete state.marks.items[key];
      save(); renderAll(); toast('Undone');
    });
  }
  function pulse(id) {
    const el = document.querySelector('[data-subject="' + id + '"]');
    if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }
  function ensureMarksToday() { if (state.marks.date !== todayKey()) state.marks = { date: todayKey(), items: {} }; }

  function renderSubjects() {
    const list = $('subjects'); list.textContent = '';
    const subs = state.attendance.subjects;
    $('att-empty').hidden = subs.length > 0;
    for (const s of subs) {
      const p = targetOf(s), st = C.status(s.attended, s.total, p);
      const frac = s.total ? s.attended / s.total : 0;
      const li = h('li', { class: 'card subject st-' + st, 'data-subject': s.id },
        h('div', { class: 'subject-top' },
          ring(frac, 'st-' + st, s.total ? C.percentText(s.attended, s.total).replace('%', '') : '—'),
          h('div', { class: 'subject-info' },
            h('h3', { text: s.name }),
            h('div', { class: 'meta' },
              h('span', { class: 'chip st-' + st, text: STATUS_LABEL[st] }),
              h('span', { class: 'muted small', text: s.attended + '/' + s.total + ' · target ' + p + '%' + (s.target !== null ? ' (custom)' : '') })),
            h('p', { class: 'msg', text: message(s) })),
          h('button', { type: 'button', class: 'icon-btn ghosty', 'aria-label': 'Edit ' + s.name, onclick: () => openSubject(s.id) },
            icon('more'))),
        h('div', { class: 'bar', 'aria-hidden': 'true' },
          h('span', { class: 'fill', style: 'width:' + (frac * 100).toFixed(2) + '%' }),
          p > 0 && p < 100 ? h('span', { class: 'tick', style: 'left:' + p + '%' }) : null),
        h('div', { class: 'mark-row' },
          h('button', { type: 'button', class: 'btn present', 'aria-label': 'Mark present in ' + s.name, onclick: () => mark(s.id, true) }, icon('check'), 'Present'),
          h('button', { type: 'button', class: 'btn absent', 'aria-label': 'Mark absent in ' + s.name, onclick: () => mark(s.id, false) }, icon('x'), 'Absent')));
      list.append(li);
    }
  }

  function renderDash() {
    const d = $('dash'); d.textContent = '';
    const subs = state.attendance.subjects;
    let a = 0, t = 0; subs.forEach((s) => { a += s.attended; t += s.total; });
    const risk = subs.filter((s) => C.status(s.attended, s.total, targetOf(s)) === 'risk');
    const border = subs.filter((s) => C.status(s.attended, s.total, targetOf(s)) === 'borderline');
    const overallSt = t === 0 ? 'none' : risk.length ? 'risk' : border.length ? 'borderline' : 'safe';
    // Overall: the one bright element on the screen
    d.append(h('div', { class: 'overall' },
      ring(t ? a / t : 0, 'st-' + overallSt, t ? C.percentText(a, t).replace('%', '') : '—'),
      h('div', { class: 'overall-text' },
        h('p', { class: 'overall-label', text: 'Overall attendance' }),
        h('p', { class: 'overall-value', text: t ? C.percentText(a, t) : 'No classes yet' }),
        h('p', { class: 'overall-meta', text: subs.length ? plural(subs.length, 'subject') + ' · ' + a + ' of ' + t + ' classes' : 'Add subjects to begin' }))));
    // Category tiles (quick access)
    const g = gp(), cg = G.cgpa(g.semesters, g.grades, g.countFailed);
    const todayCount = state.timetable.filter((x) => x.day === now().getDay()).length;
    const { upcoming } = S.splitExams(state.exams, now());
    const cats = [
      ['attendance', 'Attendance', subs.length ? plural(subs.length, 'subject') : 'Add subjects', () => { const el = document.querySelector('#panel-attendance .section-head'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }],
      ['gpa', 'GPA', cg.value === null ? 'Add grades' : 'CGPA ' + G.fmt(cg.value), () => showTab('gpa')],
      ['timetable', 'Timetable', todayCount ? todayCount + ' today' : 'None today', () => { selDay = now().getDay(); showTab('timetable'); }],
      ['exams', 'Exams', upcoming.length ? upcoming.length + ' upcoming' : 'None yet', () => showTab('exams')],
    ];
    d.append(h('div', { class: 'cats', role: 'group', 'aria-label': 'Quick access' },
      cats.map(([key, name, sub, go]) => h('button', { type: 'button', class: 'cat cat-' + key, onclick: go },
        h('span', { class: 'cat-art' }, icon(key)),
        h('span', { class: 'cat-name', text: name }),
        h('span', { class: 'cat-sub', text: sub })))));
    // Today summary: one card, one row per item, nothing truncated
    const n = S.currentAndNext(state.timetable, now());
    const nc = n.current || n.next;
    const ex = upcoming[0];
    const cd = ex && S.countdown(ex.date, ex.time, now());
    const row = (cls, label, value, meta, go) => h('button', { type: 'button', class: 'sum-row ' + cls, onclick: go },
      h('span', { class: 'sum-text' },
        h('span', { class: 'sum-label', text: label }),
        h('span', { class: 'sum-value', text: value }),
        h('span', { class: 'sum-meta', text: meta })),
      icon('chevron', 'sum-chev'));
    d.append(h('div', { class: 'card summary' },
      row(risk.length ? 'st-risk' : 'st-safe', 'At risk', risk.length ? plural(risk.length, 'subject') : (subs.length ? 'All subjects on target' : 'No subjects yet'),
        risk.length ? risk.map((s) => s.name).join(', ') : border.length ? border.length + ' borderline' : 'Nothing below target',
        () => { const el = risk[0] && document.querySelector('[data-subject="' + risk[0].id + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }),
      row('', n.current ? 'Now in class' : 'Next class today', nc ? slotName(nc) : (state.timetable.length ? 'Done for today' : 'No timetable yet'),
        nc ? (n.current ? 'Until ' + fmtTime(nc.end) : fmtTime(nc.start)) + (nc.room ? ' · ' + nc.room : '') : (state.timetable.length ? 'No more classes' : 'Add your classes'),
        () => { selDay = now().getDay(); showTab('timetable'); }),
      row(cd && cd.days <= 3 ? 'st-risk' : '', 'Next exam', ex ? ex.name : 'None scheduled',
        ex ? S.countdownText(cd, !!ex.time) + ' · ' + fmtDate(ex.date) : 'Add exam dates', () => showTab('exams'))));
  }

  // Target stepper
  function setTarget(v) {
    if (C.validate(0, 0, v)) { $('target-error').textContent = 'Enter a whole number from 0 to 100.'; return; }
    $('target-error').textContent = ''; state.attendance.target = v; save(); renderDash(); renderSubjects();
  }
  $('target').addEventListener('input', () => setTarget(parseCount($('target').value)));
  $('target-dec').addEventListener('click', () => { const v = Math.max(0, state.attendance.target - 1); $('target').value = v; setTarget(v); });
  $('target-inc').addEventListener('click', () => { const v = Math.min(100, state.attendance.target + 1); $('target').value = v; setTarget(v); });

  // Subject dialog
  function openSubject(id) {
    const s = id && subjectById(id);
    $('subject-title').textContent = s ? 'Edit subject' : 'Add subject';
    $('s-id').value = s ? s.id : '';
    $('s-name').value = s ? s.name : '';
    $('s-attended').value = s ? s.attended : 0;
    $('s-total').value = s ? s.total : 0;
    $('s-target').value = s && s.target !== null ? s.target : '';
    $('s-target').placeholder = 'Default (' + state.attendance.target + '%)';
    $('s-error').textContent = '';
    $('s-delete').hidden = !s;
    openDialog($('subject-dialog'), $('s-name'));
  }
  $('add-subject').addEventListener('click', () => openSubject());
  $('subject-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('s-name').value.trim();
    const a = parseCount($('s-attended').value), t = parseCount($('s-total').value);
    const tv = $('s-target').value.trim(), tgt = tv === '' ? null : parseCount(tv);
    let err = name ? C.validate(a, t, 0) : 'Enter a subject name.';
    if (!err && tgt !== null && C.validate(0, 0, tgt)) err = 'Subject target must be a whole number from 0 to 100, or blank.';
    if (!err && state.attendance.subjects.some((x) => x.id !== $('s-id').value && x.name.toLowerCase() === name.toLowerCase())) err = 'You already have a subject called "' + name + '".';
    if (err) { $('s-error').textContent = err; return; }
    const id = $('s-id').value, s = id && subjectById(id);
    if (s) Object.assign(s, { name, attended: a, total: t, target: tgt });
    else {
      const used = new Set(state.attendance.subjects.map((x) => x.color));
      const color = [0, 1, 2, 3, 4, 5, 6].find((c) => !used.has(c)) ?? state.attendance.subjects.length % 7;
      state.attendance.subjects.push({ id: Store.uid(), name, attended: a, total: t, target: tgt, color });
    }
    save(); closeDialog($('subject-dialog')); renderAll();
    toast(s ? 'Saved ' + name : 'Added ' + name);
  });
  $('s-delete').addEventListener('click', () => {
    const id = $('s-id').value, s = subjectById(id); if (!s) return;
    const linked = state.timetable.filter((x) => x.subjectId === id).length;
    if (!confirm('Delete "' + s.name + '"?' + (linked ? ' Its ' + plural(linked, 'timetable class', 'timetable classes') + ' will be kept as plain entries.' : ''))) return;
    const snapshot = JSON.stringify(state);
    state.attendance.subjects = state.attendance.subjects.filter((x) => x.id !== id);
    state.timetable.forEach((x) => { if (x.subjectId === id) { x.label = s.name; x.subjectId = null; } });
    save(); closeDialog($('subject-dialog')); renderAll();
    toast('Deleted ' + s.name, () => { state = Store.normalize(JSON.parse(snapshot)); save(); renderAll(); });
  });

  // =====================================================================
  // GPA
  // =====================================================================
  const gp = () => state.gpa;
  function renderGpaSummary() {
    const g = gp(), c = G.cgpa(g.semesters, g.grades, g.countFailed), max = G.maxPoints(g.grades);
    const hero = $('gpa-hero'); hero.textContent = '';
    hero.append(
      ring(c.value === null ? 0 : c.value / max, 'st-brand', c.value === null ? '—' : G.fmt(c.value), '92px'),
      h('div', {},
        h('p', { class: 'tile-label', text: 'CGPA' }),
        h('p', { class: 'big', text: G.fmt(c.value) + ' / ' + max }),
        percentLine(c.value, g.preset),
        h('p', { class: 'muted small', text: c.credits ? plural(c.credits, 'credit') + ' counted across ' + plural(g.semesters.length, 'semester') : 'Add courses with credits and grades' }),
        c.skipped ? h('p', { class: 'muted small', text: plural(c.skipped, 'course') + ' skipped (no grade or 0 credits)' }) : null,
        c.failed && !g.countFailed ? h('p', { class: 'muted small', text: plural(c.failed, 'failed course') + ' left out of GPA' }) : null));
    g.semesters.forEach((s) => {
      const r = G.sgpa(s.courses, g.grades, g.countFailed);
      const el = document.querySelector('[data-sgpa="' + s.id + '"]');
      if (el) el.textContent = 'SGPA ' + G.fmt(r.value);
      const cr = document.querySelector('[data-credits="' + s.id + '"]');
      if (cr) cr.textContent = plural(r.credits, 'credit') + (r.skipped ? ' · ' + r.skipped + ' skipped' : '');
    });
    $('scale-name').textContent = '· ' + (g.preset === 'custom' ? 'Custom' : G.PRESETS[g.preset].name);
    renderTargetHelper(c);
    renderClassification(c);
    renderDash(); // keep the dashboard's CGPA tile in sync
  }
  function percentLine(cgpa, preset) {
    const r = G.percentage(cgpa, preset);
    if (r.status === 'ok') return h('p', { class: 'muted small', text: 'Percentage ' + r.text + ' (CGPA × 10, ' + r.clause + ')' });
    if (r.status === 'no-clause') return h('p', { class: 'muted small', text: 'The official R2017 regulations have no CGPA-to-percentage conversion clause.' });
    if (r.status === 'empty') return h('p', { class: 'muted small', text: 'Percentage = CGPA × 10 once a CGPA is available (' + G.auRules(preset).clause + ').' });
    return null;
  }
  function renderTargetHelper(c) {
    const g = gp(), out = $('t-result');
    const tv = $('t-cgpa').value.trim(), cv = $('t-credits').value.trim();
    out.className = 'result';
    if (!tv || !cv) { out.textContent = 'Enter a target and next semester’s total credits to see the SGPA you need.'; return; }
    const r = G.targetHelper(c || G.cgpa(g.semesters, g.grades, g.countFailed), parseNum(tv), parseNum(cv), g.grades);
    if (r.status === 'invalid') { out.textContent = r.error; out.classList.add('st-risk'); return; }
    if (r.status === 'impossible') {
      out.textContent = 'Not possible next semester: you would need an SGPA of ' + r.required.toFixed(2) + ', above the maximum ' + r.max + '. Even a perfect ' + r.max + ' takes your CGPA to about ' + (Math.floor(r.bestCgpa * 100 + 1e-7) / 100).toFixed(2) + '.';
      out.classList.add('st-risk'); return;
    }
    if (r.status === 'guaranteed') { out.textContent = 'You’ll stay at or above ' + tv + ' whatever you score next semester.'; out.classList.add('st-safe'); return; }
    out.textContent = 'You need an SGPA of at least ' + r.required.toFixed(2) + ' over ' + plural(parseNum(cv), 'credit') + ' next semester.';
    out.classList.add(r.required > r.max * 0.9 ? 'st-borderline' : 'st-safe');
  }
  ['t-cgpa', 't-credits'].forEach((id) => $(id).addEventListener('input', () => {
    const t = parseNum($('t-cgpa').value), c = parseNum($('t-credits').value);
    gp().target = { cgpa: Number.isFinite(t) ? t : null, credits: Number.isFinite(c) ? c : null };
    save(); renderTargetHelper(); renderClassification();
  }));
  const CLASS_LABEL = { distinction: 'First Class with Distinction', first: 'First Class', second: 'Second Class' };
  function renderClassification(c) {
    const g = gp(), card = $('class-card'), out = $('class-result');
    const au = G.isAuPreset(g.preset);
    card.hidden = !au;
    if (!au) return;
    $('class-arrears').checked = g.classification.arrearsHistory;
    $('class-attendance').checked = g.classification.attendancePrevented;
    const tot = c || G.cgpa(g.semesters, g.grades, g.countFailed);
    const r = G.classify({
      cgpa: tot.value, preset: g.preset, currentFailed: tot.failed,
      arrearsHistory: g.classification.arrearsHistory,
      attendancePrevented: g.classification.attendancePrevented,
    });
    out.className = 'result';
    const bits = [];
    if (r.status === 'empty') {
      bits.push('Add graded courses to see an estimate. Distinction needs a CGPA of at least ' + r.distinction.toFixed(2) + ' with no arrears and no attendance prevention. First Class needs at least ' + r.firstClass.toFixed(2) + '.');
      if (r.distinctionBlocked) bits.push('Distinction is currently blocked by ' + r.blockers.join(', ') + '.');
    } else {
      bits.push('On track for ' + CLASS_LABEL[r.current] + ' (estimate).');
      if (r.current === 'first' && r.distinctionBlocked) bits.push('Distinction is not available because of ' + r.blockers.join(', ') + '.');
      if (r.current === 'second' && r.distinctionBlocked) bits.push('Distinction is not available because of ' + r.blockers.join(', ') + '.');
      if (r.needed) {
        bits.push('To reach ' + r.needed.label + ' you need a CGPA of at least ' + r.needed.target.toFixed(2) + '.');
        const typed = parseNum($('t-credits').value);
        const credits = Number.isFinite(typed) && typed > 0 ? typed : g.target.credits;
        if (Number.isFinite(credits) && credits > 0) {
          const th = G.targetHelper(tot, r.needed.target, credits, g.grades);
          if (th.status === 'possible') bits.push('That means an SGPA of at least ' + th.required.toFixed(2) + ' over ' + plural(credits, 'credit') + ' next semester.');
          else if (th.status === 'guaranteed') bits.push('You will stay at or above that whatever you score next semester.');
          else if (th.status === 'impossible') bits.push('Not reachable next semester: even a perfect ' + th.max + ' takes your CGPA to about ' + (Math.floor(th.bestCgpa * 100 + 1e-7) / 100).toFixed(2) + '.');
        } else {
          bits.push('Enter next-semester credits in the helper above to see the SGPA you would need.');
        }
      }
    }
    bits.push('This is an estimate, not an official classification.');
    out.textContent = bits.join(' ');
    if (r.status === 'ok' && r.current === 'distinction') out.classList.add('st-safe');
    else if (r.status === 'ok' && r.current === 'first') out.classList.add('st-borderline');
    else if (r.status === 'ok') out.classList.add('st-risk');
  }
  $('class-arrears').addEventListener('change', () => { gp().classification.arrearsHistory = $('class-arrears').checked; save(); renderClassification(); });
  $('class-attendance').addEventListener('change', () => { gp().classification.attendancePrevented = $('class-attendance').checked; save(); renderClassification(); });

  function gradeSelect(course) {
    const sel = h('select', { 'aria-label': 'Grade for ' + (course.name || 'course') });
    sel.append(h('option', { value: '', text: 'Grade' }));
    gp().grades.forEach((g) => sel.append(h('option', { value: g.label, text: g.label + ' (' + g.points + ')' })));
    if (course.grade && G.pointsFor(gp().grades, course.grade) === null) sel.append(h('option', { value: course.grade, text: course.grade + ' (not in scale)' }));
    sel.value = G.pointsFor(gp().grades, course.grade) === null ? course.grade : gp().grades.find((g) => g.label.toUpperCase() === course.grade.toUpperCase()).label;
    return sel;
  }
  function renderSemesters() {
    const wrap = $('semesters'); wrap.textContent = '';
    $('gpa-empty').hidden = gp().semesters.length > 0;
    gp().semesters.forEach((sem, si) => {
      const rows = h('div', { class: 'courses' });
      sem.courses.forEach((c) => {
        const name = h('input', { value: c.name, maxlength: 60, placeholder: 'Course name', 'aria-label': 'Course name', autocomplete: 'off', class: 'cname' });
        const cred = h('input', { value: c.credits, type: 'number', inputmode: 'decimal', min: 0, step: 0.5, placeholder: 'Credits', 'aria-label': 'Credits for ' + (c.name || 'course'), class: 'cred' });
        const sel = gradeSelect(c);
        name.addEventListener('input', () => { c.name = name.value.trim().slice(0, 60); save(); });
        cred.addEventListener('input', () => {
          const v = parseNum(cred.value), ok = G.isCredits(v);
          cred.setAttribute('aria-invalid', ok ? 'false' : 'true');
          if (ok) { c.credits = v; save(); renderGpaSummary(); }
        });
        sel.addEventListener('change', () => { c.grade = sel.value; save(); renderGpaSummary(); });
        const del = h('button', { type: 'button', class: 'icon-btn ghosty', 'aria-label': 'Remove ' + (c.name || 'course'), onclick: () => {
          const i = sem.courses.indexOf(c); sem.courses.splice(i, 1); save(); renderGpa();
          toast('Removed ' + (c.name || 'course'), () => { sem.courses.splice(i, 0, c); save(); renderGpa(); });
        } }, h('span', { 'aria-hidden': 'true', text: '×' }));
        rows.append(h('div', { class: 'course' }, name, cred, sel, del));
      });
      const title = h('input', { class: 'sem-name', value: sem.name, maxlength: 40, 'aria-label': 'Semester name' });
      title.addEventListener('input', () => { sem.name = title.value.trim().slice(0, 40) || 'Semester ' + (si + 1); save(); });
      const card = h('div', { class: 'card semester' },
        h('div', { class: 'sem-head' }, title, h('span', { class: 'chip st-brand', 'data-sgpa': sem.id })),
        h('p', { class: 'muted small', 'data-credits': sem.id }),
        sem.courses.length ? h('div', { class: 'course course-head muted small', 'aria-hidden': 'true' }, h('span', { text: 'Course' }), h('span', { text: 'Credits' }), h('span', { text: 'Grade' }), h('span')) : h('p', { class: 'muted small', text: 'No courses yet — this semester doesn’t count toward CGPA.' }),
        rows,
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn ghost sm', onclick: () => {
            sem.courses.push({ id: Store.uid(), name: '', credits: 3, grade: '' }); save(); renderGpa();
            const inputs = document.querySelectorAll('[data-sem="' + sem.id + '"] .course:last-child input'); if (inputs[0]) inputs[0].focus();
          } }, icon('plus'), 'Add course'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn danger-ghost sm', onclick: () => {
            if (!confirm('Delete "' + sem.name + '" and its ' + plural(sem.courses.length, 'course') + '?')) return;
            const i = gp().semesters.indexOf(sem); gp().semesters.splice(i, 1); save(); renderGpa();
            toast('Deleted ' + sem.name, () => { gp().semesters.splice(i, 0, sem); save(); renderGpa(); });
          } }, 'Delete semester')));
      card.dataset.sem = sem.id;
      wrap.append(card);
    });
  }
  function addSemester() {
    const sem = { id: Store.uid(), name: 'Semester ' + (gp().semesters.length + 1), courses: [{ id: Store.uid(), name: '', credits: 3, grade: '' }] };
    gp().semesters.push(sem); save(); renderGpa();
    const inp = document.querySelector('[data-sem="' + sem.id + '"] .courses input'); if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  $('add-sem').addEventListener('click', addSemester);

  // Grading scale editor works on a draft until saved.
  let draft = null;
  function renderScale() {
    const g = gp();
    if (!draft) draft = g.grades.map((x) => ({ ...x }));
    $('preset').value = g.preset; $('count-failed').checked = g.countFailed; updateFailedHint();
    const body = $('grades'); body.textContent = '';
    draft.forEach((gr, i) => {
      const l = h('input', { value: gr.label, maxlength: 6, 'aria-label': 'Grade label ' + (i + 1) });
      const p = h('input', { value: gr.points, type: 'number', inputmode: 'decimal', step: 0.1, min: 0, 'aria-label': 'Points for ' + (gr.label || 'grade ' + (i + 1)) });
      l.addEventListener('input', () => { gr.label = l.value.trim(); });
      p.addEventListener('input', () => { gr.points = parseNum(p.value); });
      body.append(h('tr', {}, h('td', {}, l), h('td', {}, p), h('td', {},
        h('button', { type: 'button', class: 'icon-btn ghosty', 'aria-label': 'Remove grade ' + (gr.label || i + 1), onclick: () => { draft.splice(i, 1); renderScale(); } }, h('span', { 'aria-hidden': 'true', text: '×' })))));
    });
  }
  $('add-grade').addEventListener('click', () => { draft.push({ label: '', points: 0 }); renderScale(); const ins = $('grades').querySelectorAll('tr:last-child input'); if (ins[0]) ins[0].focus(); });
  $('save-scale').addEventListener('click', () => {
    const grades = draft.map((x) => ({ label: String(x.label || '').trim(), points: x.points }));
    const err = G.validateScale(grades);
    if (err) { $('scale-error').textContent = err; return; }
    $('scale-error').textContent = '';
    const g = gp(), prev = { preset: g.preset, grades: g.grades };
    const same = (k) => JSON.stringify(G.clonePreset(k)) === JSON.stringify(grades);
    g.grades = grades; g.preset = Object.keys(G.PRESETS).find((k) => same(k)) || 'custom';
    draft = null; save(); renderGpa();
    toast('Grading scale saved', () => { g.grades = prev.grades; g.preset = prev.preset; draft = null; save(); renderGpa(); });
  });
  $('preset').addEventListener('change', () => {
    const v = $('preset').value;
    if (v === 'custom') { gp().preset = 'custom'; save(); renderGpaSummary(); updateFailedHint(); return; }
    const g = gp(), prev = { preset: g.preset, grades: g.grades, countFailed: g.countFailed };
    g.grades = G.clonePreset(v); g.preset = v; draft = null;
    if (G.isAuPreset(v)) g.countFailed = false; // official AU rules exclude U/RA until cleared
    save(); renderGpa();
    toast('Switched to ' + G.PRESETS[v].name, () => { g.grades = prev.grades; g.preset = prev.preset; g.countFailed = prev.countFailed; draft = null; save(); renderGpa(); });
  });
  $('count-failed').addEventListener('change', () => { gp().countFailed = $('count-failed').checked; save(); renderGpaSummary(); });
  function updateFailedHint() {
    const au = G.isAuPreset(gp().preset);
    $('failed-hint').textContent = au
      ? 'Anna University excludes U/RA (and SA, W/WD) from GPA and CGPA until the course is cleared. That is already off for AU presets.'
      : 'Some universities leave arrear/RA courses out of GPA until cleared. Untick that if yours does.';
  }

  function renderGpa() {
    renderSemesters(); renderScale(); renderGpaSummary();
    const t = gp().target;
    if (document.activeElement !== $('t-cgpa')) $('t-cgpa').value = t.cgpa ?? '';
    if (document.activeElement !== $('t-credits')) $('t-credits').value = t.credits ?? '';
    $('t-cgpa').max = G.maxPoints(gp().grades);
    renderTargetHelper();
    renderClassification();
  }

  // =====================================================================
  // TIMETABLE
  // =====================================================================
  let selDay = now().getDay();
  function renderDays() {
    const wrap = $('days'); wrap.textContent = '';
    const today = now().getDay();
    DAY_ORDER.forEach((d) => {
      const count = state.timetable.filter((s) => s.day === d).length;
      wrap.append(h('button', { type: 'button', class: 'day' + (d === today ? ' today' : ''), 'aria-pressed': String(d === selDay), 'aria-label': S.DAYS[d] + (d === today ? ' (today)' : '') + ', ' + plural(count, 'class', 'classes'),
        onclick: () => { selDay = d; renderTimetable(); } },
        h('span', { text: SHORT[d] }), h('span', { class: 'dots', 'aria-hidden': 'true', text: count ? '•'.repeat(Math.min(count, 4)) : ' ' })));
    });
  }
  function renderTimetable() {
    renderDays();
    const n = now(), isToday = selDay === n.getDay();
    ensureMarksToday();
    const cn = S.currentAndNext(state.timetable, n);
    $('day-title').textContent = isToday ? 'Today · ' + S.DAYS[selDay] : S.DAYS[selDay];
    const banner = $('now-banner'); banner.textContent = '';
    if (isToday && (cn.current || cn.next)) {
      const s = cn.current || cn.next;
      banner.append(h('div', { class: 'card now-card c' + slotColor(s) },
        h('p', { class: 'tile-label', text: cn.current ? 'Happening now' : 'Up next' }),
        h('p', { class: 'tile-value', text: slotName(s) }),
        h('p', { class: 'muted small', text: fmtTime(s.start) + ' – ' + fmtTime(s.end) + (s.room ? ' · ' + s.room : '') + (cn.current && cn.next ? ' · then ' + slotName(cn.next) + ' at ' + fmtTime(cn.next.start) : '') })));
    } else if (isToday && cn.today.length) {
      banner.append(h('div', { class: 'card now-card' }, h('p', { class: 'tile-label', text: 'All done' }), h('p', { class: 'tile-value', text: 'No more classes today' })));
    }
    const slots = S.slotsForDay(state.timetable, selDay);
    const list = $('slots'); list.textContent = '';
    $('tt-empty').hidden = slots.length > 0;
    $('tt-empty-title').textContent = state.timetable.length ? 'No classes on ' + S.DAYS[selDay] : 'Build your weekly timetable';
    const nowMin = n.getHours() * 60 + n.getMinutes();
    slots.forEach((slot) => {
      const subj = slot.subjectId && subjectById(slot.subjectId);
      const isNow = isToday && cn.current && cn.current.id === slot.id;
      const isNext = isToday && !isNow && cn.next && cn.next.id === slot.id;
      const past = isToday && S.parseTime(slot.end) <= nowMin;
      const m = isToday && state.marks.items[todayKey() + '|' + slot.id];
      let markUi = null;
      if (isToday && subj) {
        markUi = m
          ? h('span', { class: 'chip ' + (m.kind === 'P' ? 'st-safe' : 'st-risk'), }, icon(m.kind === 'P' ? 'check' : 'x'), m.kind === 'P' ? 'Marked present' : 'Marked absent')
          : h('div', { class: 'mark-row compact' },
            h('button', { type: 'button', class: 'btn present sm', 'aria-label': 'Mark present in ' + subj.name, onclick: () => mark(subj.id, true, slot.id) }, icon('check'), 'Present'),
            h('button', { type: 'button', class: 'btn absent sm', 'aria-label': 'Mark absent in ' + subj.name, onclick: () => mark(subj.id, false, slot.id) }, icon('x'), 'Absent'));
      }
      list.append(h('li', { class: 'slot c' + slotColor(slot) + (isNow ? ' now' : '') + (isNext ? ' next' : '') + (past && !isNow ? ' past' : '') },
        h('div', { class: 'time' }, h('span', { text: fmtTime(slot.start) }), h('span', { class: 'muted small', text: fmtTime(slot.end) })),
        h('div', { class: 'slot-body card' },
          h('div', { class: 'slot-top' },
            h('div', {},
              h('h3', { text: slotName(slot) }),
              h('p', { class: 'muted small', text: [slot.room, subj ? null : 'Not linked to a subject'].filter(Boolean).join(' · ') || ' ' })),
            isNow ? h('span', { class: 'chip st-brand', text: 'Now' }) : isNext ? h('span', { class: 'chip', text: 'Next' }) : null,
            h('button', { type: 'button', class: 'icon-btn ghosty', 'aria-label': 'Edit ' + slotName(slot) + ' at ' + fmtTime(slot.start), onclick: () => openSlot(slot.id) }, icon('more'))),
          markUi)));
    });
  }
  function fillSubjectSelect(sel, value) {
    sel.textContent = '';
    state.attendance.subjects.forEach((s) => sel.append(h('option', { value: s.id, text: s.name })));
    sel.append(h('option', { value: '', text: 'Other (type a name)' }));
    sel.value = value ?? (state.attendance.subjects[0] ? state.attendance.subjects[0].id : '');
  }
  function syncLabelField() { $('c-label-wrap').hidden = $('c-subject').value !== ''; }
  $('c-subject').addEventListener('change', syncLabelField);
  function openSlot(id) {
    const s = id && state.timetable.find((x) => x.id === id);
    $('slot-title').textContent = s ? 'Edit class' : 'Add class';
    $('c-id').value = s ? s.id : '';
    const daySel = $('c-day'); daySel.textContent = '';
    DAY_ORDER.forEach((d) => daySel.append(h('option', { value: d, text: S.DAYS[d] })));
    daySel.value = s ? s.day : selDay;
    // Default a new class to start when the previous one that day ends.
    const last = S.slotsForDay(state.timetable, selDay).slice(-1)[0];
    $('c-start').value = s ? s.start : last ? last.end : '09:00';
    const st = S.parseTime($('c-start').value), e = Math.min(st + 60, 23 * 60 + 59);
    $('c-end').value = s ? s.end : String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
    fillSubjectSelect($('c-subject'), s ? (s.subjectId || '') : undefined);
    $('c-label').value = s ? s.label : '';
    $('c-room').value = s ? s.room : '';
    $('c-error').textContent = ''; $('c-delete').hidden = !s;
    syncLabelField();
    openDialog($('slot-dialog'), $('c-start'));
  }
  $('add-slot').addEventListener('click', () => openSlot());
  $('slot-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const slot = { day: Number($('c-day').value), start: $('c-start').value, end: $('c-end').value, subjectId: $('c-subject').value || null, label: $('c-subject').value ? '' : $('c-label').value.trim().slice(0, 60), room: $('c-room').value.trim().slice(0, 30) };
    let err = null;
    if (S.parseTime(slot.start) === null || S.parseTime(slot.end) === null) err = 'Enter a start and end time.';
    else if (!S.validSlot(slot)) err = 'End time must be after the start time.';
    else if (!slot.subjectId && !slot.label) err = 'Pick a subject or type a class name.';
    if (err) { $('c-error').textContent = err; return; }
    const id = $('c-id').value, ex = id && state.timetable.find((x) => x.id === id);
    const clash = state.timetable.find((x) => x !== ex && x.day === slot.day && S.parseTime(x.start) < S.parseTime(slot.end) && S.parseTime(slot.start) < S.parseTime(x.end));
    if (ex) Object.assign(ex, slot); else state.timetable.push({ id: Store.uid(), ...slot });
    selDay = slot.day; save(); closeDialog($('slot-dialog')); renderAll();
    toast((ex ? 'Saved' : 'Added') + ' · ' + S.DAYS[slot.day] + ' ' + fmtTime(slot.start) + (clash ? ' (overlaps ' + slotName(clash) + ')' : ''));
  });
  $('c-delete').addEventListener('click', () => {
    const id = $('c-id').value, i = state.timetable.findIndex((x) => x.id === id); if (i < 0) return;
    const [s] = state.timetable.splice(i, 1); save(); closeDialog($('slot-dialog')); renderAll();
    toast('Deleted ' + slotName(s), () => { state.timetable.splice(i, 0, s); save(); renderAll(); });
  });

  // =====================================================================
  // EXAMS
  // =====================================================================
  function examItem(ex, done) {
    const cd = S.countdown(ex.date, ex.time, now());
    const urgency = done ? 'done' : cd.status === 'now' || cd.days <= 3 ? 'risk' : cd.days <= 7 ? 'borderline' : 'safe';
    let big, unit;
    if (done) { big = '✓'; unit = 'done'; }
    else if (cd.status === 'now') { big = '●'; unit = ex.time ? 'now' : 'today'; }
    else if (cd.days === 0 || (ex.time && cd.d === 0)) { big = ex.time ? cd.h + 'h' : '0'; unit = ex.time ? cd.m + 'm' : 'today'; }
    else { big = String(cd.days); unit = cd.days === 1 ? 'day' : 'days'; }
    return h('li', { class: 'card exam st-' + urgency },
      h('div', { class: 'count st-' + urgency, 'aria-hidden': 'true' }, h('span', { class: 'n', text: big }), h('span', { class: 'u', text: unit })),
      h('div', { class: 'exam-info' },
        h('h3', { text: ex.name }),
        h('p', { class: 'muted small', text: fmtDate(ex.date) + (ex.time ? ' · ' + fmtTime(ex.time) : '') + (ex.room ? ' · ' + ex.room : '') }),
        done ? null : h('p', { class: 'small strong', 'data-countdown': ex.id, text: S.countdownText(cd, !!ex.time) })),
      h('button', { type: 'button', class: 'icon-btn ghosty', 'aria-label': 'Edit ' + ex.name, onclick: () => openExam(ex.id) }, icon('more')));
  }
  function renderExams() {
    const { upcoming, done } = S.splitExams(state.exams, now());
    const list = $('exams'); list.textContent = '';
    upcoming.forEach((e) => list.append(examItem(e, false)));
    $('ex-empty').hidden = upcoming.length > 0;
    $('done-wrap').hidden = done.length === 0;
    $('done-title').textContent = 'Done (' + done.length + ')';
    const dl = $('exams-done'); dl.textContent = '';
    done.forEach((e) => dl.append(examItem(e, true)));
  }
  function openExam(id) {
    const ex = id && state.exams.find((x) => x.id === id);
    $('exam-title').textContent = ex ? 'Edit exam' : 'Add exam';
    $('e-id').value = ex ? ex.id : '';
    $('e-name').value = ex ? ex.name : '';
    $('e-date').value = ex ? ex.date : '';
    $('e-time').value = ex ? ex.time : '';
    $('e-room').value = ex ? ex.room : '';
    $('e-error').textContent = ''; $('e-delete').hidden = !ex;
    const dl = $('subject-names'); dl.textContent = '';
    state.attendance.subjects.forEach((s) => dl.append(h('option', { value: s.name })));
    openDialog($('exam-dialog'), $('e-name'));
  }
  $('add-exam').addEventListener('click', () => openExam());
  $('exam-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ex = { name: $('e-name').value.trim().slice(0, 60), date: $('e-date').value, time: $('e-time').value, room: $('e-room').value.trim().slice(0, 30) };
    let err = null;
    if (!ex.name) err = 'Enter the exam name.';
    else if (!S.parseDate(ex.date)) err = 'Pick a valid date.';
    else if (ex.time && S.parseTime(ex.time) === null) err = 'Enter a valid time, or leave it blank.';
    if (err) { $('e-error').textContent = err; return; }
    const id = $('e-id').value, cur = id && state.exams.find((x) => x.id === id);
    if (cur) Object.assign(cur, ex); else state.exams.push({ id: Store.uid(), ...ex });
    save(); closeDialog($('exam-dialog')); renderAll();
    const cd = S.countdown(ex.date, ex.time, now());
    toast((cur ? 'Saved ' : 'Added ') + ex.name + (cd.status === 'done' ? ' (already past)' : ' · ' + S.countdownText(cd, !!ex.time)));
  });
  $('e-delete').addEventListener('click', () => {
    const id = $('e-id').value, i = state.exams.findIndex((x) => x.id === id); if (i < 0) return;
    const [ex] = state.exams.splice(i, 1); save(); closeDialog($('exam-dialog')); renderAll();
    toast('Deleted ' + ex.name, () => { state.exams.splice(i, 0, ex); save(); renderAll(); });
  });

  // =====================================================================
  // SETTINGS, BACKUP, THEME
  // =====================================================================
  function applyTheme() {
    const t = state.settings.theme, root = document.documentElement;
    const dark = t === 'dark'; // light unless the user explicitly picks dark
    root.dataset.theme = dark ? 'dark' : 'light';
    $('theme-color').setAttribute('content', dark ? '#0a2380' : '#0a2fb8');
  }
  $('open-settings').addEventListener('click', () => {
    document.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === state.settings.theme; });
    $('clock24').checked = state.settings.clock24; $('io-msg').textContent = '';
    openDialog($('settings-dialog'));
  });
  document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => { state.settings.theme = r.value; save(); applyTheme(); }));
  $('clock24').addEventListener('change', () => { state.settings.clock24 = $('clock24').checked; save(); renderAll(); });
  $('export').addEventListener('click', () => {
    const blob = new Blob([Store.exportData(state)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'student-toolkit-backup-' + todayKey() + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    $('io-msg').textContent = 'Backup downloaded.';
  });
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async () => {
    const f = $('import-file').files[0]; $('import-file').value = '';
    if (!f) return;
    const r = f.size > 2000000 ? { ok: false, error: 'The file is too large to be a Student Toolkit backup.' } : Store.parseImport(await f.text().catch(() => ''));
    if (!r.ok) { $('io-msg').textContent = 'Import failed: ' + r.error; return; }
    const s = r.state;
    const summary = plural(s.attendance.subjects.length, 'subject') + ', ' + plural(s.gpa.semesters.length, 'semester') + ', ' + plural(s.timetable.length, 'class', 'classes') + ', ' + plural(s.exams.length, 'exam');
    if (!confirm('Replace everything on this device with the backup (' + summary + ')?' + (r.dropped ? ' ' + plural(r.dropped, 'invalid entry', 'invalid entries') + ' will be skipped.' : ''))) return;
    const snapshot = JSON.stringify(state);
    state = s; draft = null; save(); applyTheme(); renderAll();
    $('io-msg').textContent = 'Imported ' + summary + '.';
    toast('Backup imported', () => { state = Store.normalize(JSON.parse(snapshot)); draft = null; save(); applyTheme(); renderAll(); });
  });
  $('reset').addEventListener('click', () => {
    if (!confirm('Erase all subjects, GPA records, timetable and exams on this device? Export a backup first if unsure.')) return;
    const snapshot = JSON.stringify(state);
    state = Store.defaults(); draft = null;
    try { localStorage.removeItem(Store.V1_KEY); } catch (e) { /* ignore */ }
    save(); applyTheme(); renderAll(); closeDialog($('settings-dialog'));
    toast('All data erased', () => { state = Store.normalize(JSON.parse(snapshot)); draft = null; save(); applyTheme(); renderAll(); });
  });

  // =====================================================================
  // End-semester pass calculator
  // =====================================================================
  function fillPassSchemes() {
    const sel = $('pass-scheme');
    if (sel.options.length) return;
    Object.values(P.SCHEMES).forEach((s) => sel.append(h('option', { value: s.id, text: s.name })));
  }
  function passWeights() {
    return P.weights(state.pass.scheme, state.pass.internalMax, state.pass.examMax);
  }
  function renderPass() {
    fillPassSchemes();
    const p = state.pass, custom = p.scheme === 'custom';
    if (document.activeElement !== $('pass-scheme')) $('pass-scheme').value = p.scheme;
    $('pass-custom').hidden = !custom;
    if (custom) {
      if (document.activeElement !== $('pass-imax')) $('pass-imax').value = p.internalMax ?? '';
      if (document.activeElement !== $('pass-emax')) $('pass-emax').value = p.examMax ?? '';
    }
    const w = passWeights();
    const max = w.error ? null : w.internalMax;
    if (document.activeElement !== $('pass-internal')) $('pass-internal').value = p.internal ?? '';
    if (max != null) {
      $('pass-internal').max = max;
      $('pass-internal-hint').textContent = 'Out of ' + max + '.';
    } else {
      $('pass-internal').removeAttribute('max');
      $('pass-internal-hint').textContent = w.error || 'Enter both maxima for a custom split.';
    }
    const out = $('pass-result'); out.className = 'result';
    const r = P.needed({ scheme: p.scheme, internal: p.internal, internalMax: p.internalMax, examMax: p.examMax });
    if (r.status === 'empty') { out.textContent = 'Enter your internal marks to see the end-semester score you need.'; return; }
    if (r.status === 'invalid') { out.textContent = r.error; out.classList.add('st-risk'); return; }
    if (r.status === 'impossible') {
      out.textContent = 'Not possible: even 100% in the end-semester exam would give ' + r.maxTotal + ' out of ' + r.totalMax + ', below the 50% passing total of ' + r.needTotal + '.';
      out.classList.add('st-risk'); return;
    }
    if (r.status === 'already-safe') {
      out.textContent = 'You already meet both passing rules, even with 0 in the end-semester exam.';
      out.classList.add('st-safe'); return;
    }
    const need = 'You need at least ' + r.needExam + ' out of ' + r.examMax + ' in the end-semester exam (' + r.needOutOf100 + ' out of 100).';
    const extra = r.limitedBy === 'exam-floor'
      ? ' Your internals already cover the 50% total; this is the 45% end-semester minimum.'
      : ' That is the mark that also brings the overall total to at least 50%.';
    out.textContent = need + extra;
    out.classList.add(r.limitedBy === 'exam-floor' ? 'st-safe' : 'st-borderline');
  }
  $('pass-scheme').addEventListener('change', () => { state.pass.scheme = $('pass-scheme').value; save(); renderPass(); });
  $('pass-internal').addEventListener('input', () => {
    const v = $('pass-internal').value.trim();
    state.pass.internal = v === '' ? null : parseNum(v);
    save(); renderPass();
  });
  ['pass-imax', 'pass-emax'].forEach((id) => $(id).addEventListener('input', () => {
    const im = parseNum($('pass-imax').value), em = parseNum($('pass-emax').value);
    state.pass.internalMax = Number.isFinite(im) ? im : null;
    state.pass.examMax = Number.isFinite(em) ? em : null;
    save(); renderPass();
  }));

  function renderAll() {
    $('today-label').textContent = now().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    if (document.activeElement !== $('target')) $('target').value = state.attendance.target;
    renderDash(); renderSubjects(); renderGpa(); renderTimetable(); renderExams(); renderPass();
  }
  applyTheme();
  showTab(tab);
  renderAll();
  if (loaded.source === 'v1') toast('Your subjects were carried over from the old version.');
  if (!storageOk) toast('Storage is unavailable — changes won’t be saved on this device.');

  // Keep countdowns and "now/next" fresh without disturbing typing.
  let lastDay = todayKey();
  setInterval(() => {
    if (document.hidden) return;
    if (todayKey() !== lastDay) { lastDay = todayKey(); selDay = now().getDay(); }
    const busy = document.querySelector('dialog[open]') || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
    renderDash(); if (!busy) { renderTimetable(); renderExams(); }
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderDash(); renderTimetable(); renderExams(); } });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
