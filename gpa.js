// Pure GPA / CGPA math. No DOM.
(function (root) {
  const PRESETS = {
    ten: { name: '10-point (O, A+, A…)', grades: [
      { label: 'O', points: 10 }, { label: 'A+', points: 9 }, { label: 'A', points: 8 }, { label: 'B+', points: 7 },
      { label: 'B', points: 6 }, { label: 'C', points: 5 }, { label: 'RA', points: 0 }, { label: 'F', points: 0 }] },
    four: { name: '4.0 (A, A-, B+…)', grades: [
      { label: 'A', points: 4 }, { label: 'A-', points: 3.7 }, { label: 'B+', points: 3.3 }, { label: 'B', points: 3 },
      { label: 'B-', points: 2.7 }, { label: 'C+', points: 2.3 }, { label: 'C', points: 2 }, { label: 'C-', points: 1.7 },
      { label: 'D+', points: 1.3 }, { label: 'D', points: 1 }, { label: 'F', points: 0 }] },
  };
  const MAX_CREDITS = 50;
  function clonePreset(key) { return PRESETS[key].grades.map((g) => ({ label: g.label, points: g.points })); }
  function isCredits(c) { return typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= MAX_CREDITS && Math.round(c * 100) === c * 100; }
  function isPoints(p) { return typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 100; }
  // Returns an error string or null.
  function validateScale(grades) {
    if (!Array.isArray(grades) || grades.length === 0) return 'Add at least one grade.';
    const seen = new Set();
    for (const g of grades) {
      if (!g || typeof g.label !== 'string' || !g.label.trim()) return 'Every grade needs a label.';
      const k = g.label.trim().toUpperCase();
      if (seen.has(k)) return 'Grade "' + g.label.trim() + '" is listed twice.';
      seen.add(k);
      if (!isPoints(g.points)) return 'Grade points must be a number from 0 to 100.';
    }
    if (maxPoints(grades) <= 0) return 'At least one grade must be worth more than 0 points.';
    return null;
  }
  function maxPoints(grades) { return grades.reduce((m, g) => Math.max(m, g.points), 0); }
  function pointsFor(grades, label) {
    if (typeof label !== 'string') return null;
    const g = grades.find((x) => x.label.trim().toUpperCase() === label.trim().toUpperCase());
    return g ? g.points : null;
  }
  // Totals over a list of courses. Courses with no grade, an unknown grade, or 0 credits are skipped.
  // countFailed=false skips 0-point grades too (some universities exclude arrears until cleared).
  function totals(courses, grades, countFailed) {
    let credits = 0, weighted = 0, skipped = 0, failed = 0;
    for (const c of courses || []) {
      const p = pointsFor(grades, c.grade);
      if (p === null || !isCredits(c.credits) || c.credits === 0) { skipped++; continue; }
      if (p === 0) { failed++; if (countFailed === false) continue; }
      credits += c.credits; weighted += c.credits * p;
    }
    // Work in hundredths to dodge float drift (credits have <=2 decimals, points <=2 decimals).
    credits = Math.round(credits * 100) / 100; weighted = Math.round(weighted * 10000) / 10000;
    return { credits, weighted, skipped, failed };
  }
  function gpa(t) { return t.credits > 0 ? t.weighted / t.credits : null; }
  function sgpa(courses, grades, countFailed) { const t = totals(courses, grades, countFailed); return { value: gpa(t), ...t }; }
  function cgpa(semesters, grades, countFailed) {
    const all = []; for (const s of semesters || []) all.push(...(s.courses || []));
    const t = totals(all, grades, countFailed); return { value: gpa(t), ...t };
  }
  // Displayed rounded to 2 decimals (half up, as on most mark sheets), with a guard for float noise.
  function fmt(v) { if (v === null || v === undefined) return '—'; return (Math.round(v * 100 + 1e-7) / 100).toFixed(2); }
  // Required SGPA over `nextCredits` to bring CGPA to >= target.
  function targetHelper(current, target, nextCredits, grades) {
    const max = maxPoints(grades);
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0 || target > max) return { status: 'invalid', error: 'Target CGPA must be between 0 and ' + max + '.' };
    if (!isCredits(nextCredits) || nextCredits <= 0) return { status: 'invalid', error: 'Next-semester credits must be more than 0 (max ' + MAX_CREDITS + ').' };
    const C = current.credits, P = current.weighted;
    const need = (target * (C + nextCredits) - P) / nextCredits;
    // Round up to 2 decimals (with float tolerance) so the advice is never too low.
    const needUp = Math.ceil(need * 100 - 1e-7) / 100;
    const best = (P + max * nextCredits) / (C + nextCredits);
    if (needUp > max) return { status: 'impossible', required: needUp, max, bestCgpa: best };
    if (needUp <= 0) return { status: 'guaranteed', required: 0, max };
    return { status: 'possible', required: needUp, max };
  }
  const api = { PRESETS, MAX_CREDITS, clonePreset, isCredits, validateScale, maxPoints, pointsFor, totals, sgpa, cgpa, fmt, targetHelper };
  if (typeof module !== 'undefined') module.exports = api; else root.GpaCalc = api;
})(this);
