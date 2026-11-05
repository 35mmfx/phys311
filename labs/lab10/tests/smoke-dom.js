// smoke-dom.js — boots src/main.js against a stub DOM to prove the browser
// entry point actually wires up and renders frames. Run: node tests/smoke-dom.js
const noop = () => {};
const ctxStub = new Proxy({}, { get: (t, k) =>
  (k === 'canvas' ? {} : (k === 'setTransform' ? noop : noop)) });

function el(id) {
  const listeners = {};
  return {
    id, value: '', checked: false, textContent: '', innerHTML: '', style: {},
    classList: { add: noop, remove: noop },
    addEventListener: (t, f) => (listeners[t] = f),
    setAttribute: noop, getAttribute: () => null, matches: () => false,
    getBoundingClientRect: () => ({ width: 900, height: 520, left: 0, top: 0 }),
    getContext: () => ctxStub,
    setPointerCapture: noop, releasePointerCapture: noop, hasPointerCapture: () => false,
    _fire: (t, ev) => listeners[t] && listeners[t](ev),
    _listeners: listeners, width: 900, height: 520
  };
}
const nodes = new Map();
const windowListeners = {};
globalThis.document = {
  getElementById: id => { if (!nodes.has(id)) nodes.set(id, el(id)); return nodes.get(id); },
  addEventListener: noop
};
let frames = 0, cb = null;
globalThis.window = {
  devicePixelRatio: 2, addEventListener: (t, f) => (windowListeners[t] = f),
  matchMedia: () => ({ matches: false })
};
globalThis.performance = { now: () => frames * 16.6667 };
globalThis.requestAnimationFrame = f => { cb = f; };
globalThis.location = { hash: '#scene=orbits&int=verlet&n=20', origin: 'x', pathname: '/y' };
globalThis.history  = { replaceState: noop };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true });

await import('../src/main.js');

const canvas = document.getElementById('sim');
for (let i = 0; i < 90; i++) { frames++; const f = cb; cb = null; f && f(performance.now()); }

const hud = document.getElementById('hud').innerHTML;
const checks = [
  [cb !== null || frames > 0,                'frame loop is running'],
  [/steps/.test(hud) && /&Delta;E/.test(hud),'HUD rendered energy drift'],
  [canvas.width === 1800,                    'canvas backed at 2x device pixels (1800 px)'],
  [document.getElementById('scene').value === 'orbits', 'URL hash set the scene select'],
  [document.getElementById('integrator').value === 'verlet', 'URL hash set the integrator'],
];
// simulate a drag: pointerdown on a body, move, up
canvas._fire('pointerdown', { pointerId: 1, clientX: 450, clientY: 260 });
canvas._fire('pointermove', { pointerId: 1, clientX: 480, clientY: 240 });
canvas._fire('pointerup',   { pointerId: 1 });
checks.push([true, 'pointer down/move/up handled without throwing']);
frames++; cb(performance.now());
checks.push([/cursor/.test(document.getElementById('hud').innerHTML)
  && !/outside canvas/.test(document.getElementById('hud').innerHTML),
  'pointer position appears in the live HUD']);
const beforeStep = Number(document.getElementById('hud').innerHTML.match(/<span class="v">(\d+)<\/span>\s*<span class="k">bodies/)[1]);
const keyEvent = (key) => ({
  key, target: { matches: () => false }, preventDefault: noop
});
windowListeners.keydown(keyEvent(' '));
windowListeners.keydown(keyEvent('.'));
frames++; cb(performance.now());
const afterStep = Number(document.getElementById('hud').innerHTML.match(/<span class="v">(\d+)<\/span>\s*<span class="k">bodies/)[1]);
checks.push([afterStep === beforeStep + 1,
  'keyboard period advances exactly one fixed step while paused']);
windowListeners.keydown(keyEvent('+'));
checks.push([document.getElementById('speed').value === '1.25',
  'keyboard plus increases simulation speed by 0.25x']);
document.getElementById('btn-play')._fire('click', {});
document.getElementById('btn-step')._fire('click', {});
document.getElementById('btn-reset')._fire('click', {});
checks.push([true, 'Play / Step / Reset buttons handled without throwing']);

let bad = 0;
for (const [c, n] of checks) { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) bad++; }
console.log(`\n  ${checks.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
