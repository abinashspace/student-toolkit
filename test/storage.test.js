// Runs app.js against a minimal fake DOM to test localStorage handling.
const assert = require('assert'); const fs = require('fs'); const vm = require('vm');
function run(stored) {
  const store = { ...stored }; const els = {};
  const el = (id) => els[id] || (els[id] = { id, value: '', textContent: '', hidden: false, style: {}, classList: { add() {} },
    listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, appendChild() {}, setAttribute() {}, querySelector: () => el('_q' + Math.random()), focus() {}, reset() { ['name','attended','total'].forEach(k=>el(k).value=''); } });
  const ctx = { window: {}, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: el, createElement: () => el('_c' + Math.random()) }, navigator: {}, confirm: () => true, console };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../calc.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../app.js', 'utf8'), ctx);
  return { store, el };
}
const K = 'attendance-calculator-v1';
let r = run({ [K]: '{not json' }); assert.strictEqual(r.el('target').value, 75); assert.strictEqual(r.el('empty').hidden, false);
r = run({ [K]: JSON.stringify({ target: 500, subjects: [{ id: 'a', name: 'X', attended: 5, total: 3 }, { id: 'b', name: 'Y', attended: 3, total: 4 }] }) });
assert.strictEqual(r.el('target').value, 75); assert.strictEqual(r.el('empty').hidden, true);
r = run({});
r.el('name').value = 'Maths'; r.el('attended').value = '8'; r.el('total').value = '10';
r.el('form').listeners.submit({ preventDefault() {} });
let saved = JSON.parse(r.store[K]); assert.strictEqual(saved.subjects.length, 1); assert.strictEqual(saved.subjects[0].attended, 8);
r.el('name').value = 'Bad'; r.el('attended').value = '11'; r.el('total').value = '10';
r.el('form').listeners.submit({ preventDefault() {} });
assert.strictEqual(JSON.parse(r.store[K]).subjects.length, 1); assert(r.el('form-error').textContent.includes('exceed'));
r.el('target').value = '90'; r.el('target').listeners.input(); assert.strictEqual(JSON.parse(r.store[K]).target, 90);
r.el('target').value = '2.5'; r.el('target').listeners.input(); assert.strictEqual(JSON.parse(r.store[K]).target, 90);
console.log('OK: storage tests');
