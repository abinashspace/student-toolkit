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
  const api = { validate, percentText, analyze };
  if (typeof module !== 'undefined') module.exports = api; else root.AttendanceCalc = api;
})(this);
