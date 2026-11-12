// End-semester pass-mark math for Anna University weights. No DOM.
// Passing rule (R2017 clause 14.1 and R2021 clause 14.1): at least 50% of Internal + End-sem,
// and at least 45% of the marks prescribed for the end-semester examination.
(function (root) {
  const SCHEMES = {
    'r2017-theory': { id: 'r2017-theory', name: 'R2017 theory (20 + 80)', internalMax: 20, examMax: 80 },
    'r2021-theory': { id: 'r2021-theory', name: 'R2021 theory (40 + 60)', internalMax: 40, examMax: 60 },
    'r2021-lab': { id: 'r2021-lab', name: 'R2021 laboratory (60 + 40)', internalMax: 60, examMax: 40 },
    'r2021-theory-lab': { id: 'r2021-theory-lab', name: 'R2021 theory + lab (50 + 50)', internalMax: 50, examMax: 50 },
    custom: { id: 'custom', name: 'Custom', internalMax: null, examMax: null },
  };
  function isMax(n) { return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 100 && Math.round(n * 100) === n * 100; }
  function isMark(n, max) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max && Math.round(n * 100) === n * 100; }
  function ceil2(x) { return Math.ceil(x * 100 - 1e-7) / 100; }
  function schemeOf(id) { return SCHEMES[id] || null; }
  function weights(schemeId, customInternalMax, customExamMax) {
    const s = schemeOf(schemeId);
    if (!s) return { error: 'Choose a course type.' };
    if (s.id === 'custom') {
      if (!isMax(customInternalMax) || !isMax(customExamMax)) return { error: 'Custom maxima must be more than 0 and at most 100.' };
      return { internalMax: customInternalMax, examMax: customExamMax, scheme: s };
    }
    return { internalMax: s.internalMax, examMax: s.examMax, scheme: s };
  }
  // Returns the minimum end-semester marks needed (out of examMax, and scaled to 100).
  function needed(opts) {
    opts = opts || {};
    const w = weights(opts.scheme, opts.internalMax, opts.examMax);
    if (w.error) return { status: 'invalid', error: w.error };
    const { internalMax, examMax } = w;
    const internal = opts.internal;
    if (internal === null || internal === undefined || internal === '') return { status: 'empty', internalMax, examMax };
    if (!isMark(internal, internalMax)) {
      return { status: 'invalid', error: 'Internal marks must be a number from 0 to ' + internalMax + '.', internalMax, examMax };
    }
    const totalMax = internalMax + examMax;
    const needTotal = 0.5 * totalMax;
    const floor45 = 0.45 * examMax;
    if (internal + examMax + 1e-9 < needTotal) {
      return {
        status: 'impossible', internal, internalMax, examMax, totalMax, needTotal,
        maxTotal: internal + examMax, floor45,
      };
    }
    const forTotal = Math.max(0, needTotal - internal);
    const raw = Math.max(forTotal, floor45);
    if (raw <= 0) {
      return { status: 'already-safe', internal, internalMax, examMax, totalMax, needExam: 0, needOutOf100: 0, needTotal, floor45 };
    }
    let needExam = ceil2(raw);
    while (needExam <= examMax + 1e-9 && (internal + needExam < needTotal - 1e-9 || needExam < floor45 - 1e-9)) {
      needExam = ceil2(needExam + 0.01);
    }
    if (needExam > examMax + 1e-9) {
      return { status: 'impossible', internal, internalMax, examMax, totalMax, needTotal, maxTotal: internal + examMax, floor45 };
    }
    const needOutOf100 = ceil2(needExam / examMax * 100);
    const limitedBy = forTotal > floor45 + 1e-9 ? 'total' : 'exam-floor';
    return {
      status: 'possible', internal, internalMax, examMax, totalMax, needTotal, floor45,
      needExam, needOutOf100, limitedBy, passTotal: Math.round((internal + needExam) * 100) / 100,
    };
  }
  const api = { SCHEMES, schemeOf, weights, needed, isMax, isMark };
  if (typeof module !== 'undefined') module.exports = api; else root.PassCalc = api;
})(this);
