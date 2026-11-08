(function () {
  const C = window.AttendanceCalc;
  const KEY = 'attendance-calculator-v1';
  const $ = (id) => document.getElementById(id);
  let state = load();

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.subjects)) {
        const subjects = d.subjects.filter((s) => s && typeof s.name === 'string' && !C.validate(s.attended, s.total, 0));
        const target = C.validate(0, 0, d.target) ? 75 : d.target;
        return { target, subjects };
      }
    } catch (e) { /* corrupt or unavailable storage: start fresh */ }
    return { target: 75, subjects: [] };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { $('form-error').textContent = 'Could not save on this device (storage unavailable).'; }
  }
  function parseCount(v) { return /^\d+$/.test(v.trim()) ? Number(v) : NaN; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 'es'); }

  function render() {
    const list = $('list'); list.textContent = '';
    $('empty').hidden = state.subjects.length > 0;
    state.subjects.forEach((s) => {
      const r = C.analyze(s.attended, s.total, state.target);
      const li = document.createElement('li');
      let msg, cls;
      if (s.total === 0) { msg = 'No classes held yet.'; cls = 'muted'; }
      else if (r.status === 'unlimited') { msg = 'Target is 0% — any absence is fine.'; cls = 'ok'; }
      else if (r.status === 'safe') { msg = r.canMiss === 0 ? 'On target — you can’t miss the next class.' : 'You can miss ' + plural(r.canMiss, 'class') + ' and stay on target.'; cls = 'ok'; }
      else if (r.status === 'impossible') { msg = '100% is no longer reachable — a class was missed.'; cls = 'warn'; }
      else { msg = 'Attend the next ' + plural(r.mustAttend, 'class') + ' in a row to reach ' + state.target + '%.'; cls = 'warn'; }
      if (s.total > 0 && !r.meets) li.className = 'bad';
      const pct = s.total ? (s.attended / s.total) * 100 : 0;
      li.innerHTML = '<div class="top"><h3></h3><span class="pct"></span></div><div class="bar" aria-hidden="true"><span></span></div><p class="status"></p><p class="muted counts"></p><div class="actions"><button type="button" class="secondary edit">Edit</button><button type="button" class="danger del">Delete</button></div>';
      li.querySelector('h3').textContent = s.name;
      li.querySelector('.pct').textContent = C.percentText(s.attended, s.total);
      li.querySelector('.bar span').style.width = pct + '%';
      const st = li.querySelector('.status'); st.textContent = msg; st.classList.add(cls);
      li.querySelector('.counts').textContent = s.attended + ' of ' + s.total + ' attended';
      li.querySelector('.edit').setAttribute('aria-label', 'Edit ' + s.name);
      li.querySelector('.del').setAttribute('aria-label', 'Delete ' + s.name);
      li.querySelector('.edit').onclick = () => startEdit(s.id);
      li.querySelector('.del').onclick = () => {
        if (confirm('Delete "' + s.name + '"?')) { state.subjects = state.subjects.filter((x) => x.id !== s.id); save(); render(); }
      };
      list.appendChild(li);
    });
  }
  function resetForm() {
    $('form').reset(); $('edit-id').value = ''; $('form-error').textContent = '';
    $('form-title').textContent = 'Add subject'; $('save').textContent = 'Add subject'; $('cancel').hidden = true;
  }
  function startEdit(id) {
    const s = state.subjects.find((x) => x.id === id); if (!s) return;
    $('edit-id').value = id; $('name').value = s.name; $('attended').value = s.attended; $('total').value = s.total;
    $('form-title').textContent = 'Edit subject'; $('save').textContent = 'Save changes'; $('cancel').hidden = false;
    $('name').focus();
  }
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name').value.trim();
    const a = parseCount($('attended').value), t = parseCount($('total').value);
    let err = name ? C.validate(a, t, 0) : 'Enter a subject name.';
    if (err) { $('form-error').textContent = err; return; }
    const id = $('edit-id').value;
    if (id) { const s = state.subjects.find((x) => x.id === id); if (s) Object.assign(s, { name, attended: a, total: t }); }
    else state.subjects.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, attended: a, total: t });
    save(); resetForm(); render();
  });
  $('cancel').onclick = resetForm;
  $('target').value = state.target;
  $('target').addEventListener('input', () => {
    const v = parseCount($('target').value);
    if (C.validate(0, 0, v)) { $('target-error').textContent = 'Enter a whole number from 0 to 100.'; return; }
    $('target-error').textContent = ''; state.target = v; save(); render();
  });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
