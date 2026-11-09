// Pure attendance math. Integers only; target is a whole percent 0-100.
(function (root) {
  function isCount(n) { return Number.isInteger(n) && n >= 0 && n <= 100000; }
  function validate(attended, total, target) {
    if (!isCount(attended) || !isCount(total)) return 'Counts must be whole numbers from 0 to 100000.';
    if (attended > total) return 'Attended cannot exceed total classes.';
    if (!Number.isInteger(target) || target < 0 || target > 100) return 'Target must be a whole number from 0 to 100.';
    return null;
  }
  // Percentage floored to 1 decimal, so it never looks higher than it is.
  function percentText(attended, total) {
    if (total === 0) return '—';
    const tenths = Math.floor((attended * 1000) / total);
    return (tenths / 10).toFixed(1) + '%';
  }
  function analyze(attended, total, target) {
    const error = validate(attended, total, target);
    if (error) return { status: 'invalid', error };
    const meets = attended * 100 >= target * total;
    if (target === 0) return { status: 'unlimited', meets: true };
    if (meets) {
      // max k: 100a >= p(t+k)
      return { status: 'safe', meets: true, canMiss: Math.floor((attended * 100 - target * total) / target) };
    }
    if (target === 100) return { status: 'impossible', meets: false };
    // min k: 100(a+k) >= p(t+k)
    return { status: 'short', meets: false, mustAttend: Math.ceil((target * total - attended * 100) / (100 - target)) };
  }
  // Traffic-light bucket for UI: none (no classes yet), safe, borderline (on target but <=1 spare class), risk.
  function status(attended, total, target) {
    const r = analyze(attended, total, target);
    if (r.status === 'invalid') return 'none';
    if (total === 0) return 'none';
    if (r.status === 'unlimited') return 'safe';
    if (!r.meets) return 'risk';
    return r.canMiss <= 1 ? 'borderline' : 'safe';
  }
  const api = { validate, percentText, analyze, status };
  if (typeof module !== 'undefined') module.exports = api; else root.AttendanceCalc = api;
})(this);
