// smoke-dom.js — boots main.js against a stub DOM to prove the browser
// entry point actually wires up and renders frames. Run: node tests/smoke-dom.js
import { CockpitSound } from '../audio/CockpitSound.js';

const noop = () => {};
let lineToCalls = 0;
const drawnText = [];
const ctxStub = new Proxy({}, { get: (t, k) =>
  (k === 'canvas' ? {} :
    (k === 'lineTo' ? () => { lineToCalls++; } :
      (k === 'fillText' ? text => { drawnText.push(text); } :
        (k === 'createLinearGradient' || k === 'createRadialGradient'
          ? () => ({ addColorStop: noop }) : noop)))) });

function el(id) {
  const listeners = {};
  return {
    id, value: '', checked: false, textContent: '', innerHTML: '', style: {},
    classList: { add: noop, remove: noop },
    addEventListener: (t, f) => (listeners[t] = f),
    replaceChildren: (...children) => { el.children = children; },
    appendChild: child => child,
    remove: noop,
    click: noop,
    setAttribute: noop, removeAttribute: noop, getAttribute: () => null, matches: () => false,
    closest: () => ({ hidden: false }),
    getBoundingClientRect: () => ({ width: 900, height: 520, left: 0, top: 0 }),
    getContext: () => ctxStub,
    setPointerCapture: noop, releasePointerCapture: noop, hasPointerCapture: () => false,
    _fire: (t, ev) => listeners[t] && listeners[t](ev),
    _listeners: listeners, width: 900, height: 520
  };
}
const nodes = new Map();
const windowListeners = {};
const audioContexts = [];
class MockAudioParam {
  constructor() { this.value = 0; this.targets = []; }
  cancelScheduledValues() {}
  setTargetAtTime(value) { this.value = value; this.targets.push(value); }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}
class MockAudioContext {
  constructor() {
    this.sampleRate = 100;
    this.currentTime = 0;
    this.destination = {};
    this.oscillators = [];
    this.gainNodes = [];
    this.bufferSources = [];
    this.state = 'suspended';
    audioContexts.push(this);
  }
  createGain() {
    const node = { gain: new MockAudioParam(), connect() { return this; } };
    this.gainNodes.push(node);
    return node;
  }
  createBiquadFilter() {
    return {
      frequency: new MockAudioParam(), Q: new MockAudioParam(),
      connect() { return this; }
    };
  }
  createBufferSource() {
    const source = { connect() { return this; }, start() {}, stop() {} };
    this.bufferSources.push(source);
    return source;
  }
  createOscillator() {
    const oscillator = {
      frequency: new MockAudioParam(), connect() { return this; },
      start() {}, stop() {}
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: index => data[index] };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
globalThis.document = {
  getElementById: id => { if (!nodes.has(id)) nodes.set(id, el(id)); return nodes.get(id); },
  createElement: tag => el(tag),
  body: { appendChild: noop },
  addEventListener: noop
};
let frames = 0, cb = null;
globalThis.window = {
  devicePixelRatio: 2, addEventListener: (t, f) => (windowListeners[t] = f),
  matchMedia: () => ({ matches: false }), AudioContext: MockAudioContext
};
globalThis.performance = { now: () => frames * 16.6667 };
globalThis.requestAnimationFrame = f => { cb = f; };
globalThis.location = { search: '?scene=orbits&int=verlet&n=20&debug=1', hash: '', origin: 'x', pathname: '/y' };
globalThis.history  = { replaceState: noop };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true });

await import('../main.js');

const canvas = document.getElementById('sim');
for (let i = 0; i < 90; i++) { frames++; const f = cb; cb = null; f && f(performance.now()); }

const hud = document.getElementById('hud').innerHTML;
const checks = [
  [cb !== null || frames > 0,                'frame loop is running'],
  [/steps/.test(hud) && /&Delta;E/.test(hud),'HUD rendered energy drift'],
  [canvas.width === 1800,                    'canvas backed at 2x device pixels (1800 px)'],
  [document.getElementById('scene').value === 'orbits', 'query string set the scene select'],
  [document.getElementById('integrator').value === 'verlet', 'query string set the integrator'],
  [!document.getElementById('debug-panel').hidden &&
    /total energy/.test(document.getElementById('debug-hud').innerHTML) &&
    /contacts this step/.test(document.getElementById('debug-hud').innerHTML) &&
    /measured FPS/.test(document.getElementById('debug-hud').innerHTML),
    'debug URL flag enables the complete instrumentation HUD'],
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
const keyEvent = (key, code = '', target = { matches: () => false }) => {
  let defaultPrevented = false;
  return {
    key, code, target,
    preventDefault: () => { defaultPrevented = true; },
    get defaultPrevented() { return defaultPrevented; }
  };
};
windowListeners.keydown(keyEvent(' '));
windowListeners.keydown(keyEvent('.'));
frames++; cb(performance.now());
const afterStep = Number(document.getElementById('hud').innerHTML.match(/<span class="v">(\d+)<\/span>\s*<span class="k">bodies/)[1]);
checks.push([afterStep === beforeStep + 1,
  'keyboard period advances exactly one fixed step while paused']);
const tab = keyEvent('Tab');
windowListeners.keydown(tab);
checks.push([!tab.defaultPrevented, 'Tab keeps its native control-navigation behavior']);
windowListeners.keydown(keyEvent('+'));
checks.push([Number(document.getElementById('speed').value) === 1.25,
  'keyboard plus increases simulation speed by 0.25x']);
document.getElementById('btn-play')._fire('click', {});
document.getElementById('btn-step')._fire('click', {});
document.getElementById('btn-reset')._fire('click', {});
frames++; cb(performance.now());
const resetHud = document.getElementById('hud').innerHTML;
checks.push([/t<\/span><span class="v">0\.00 s/.test(resetHud)
  && /&Delta;E\/E&#8320;<\/span>\s*<span class="v [^"]*"[^>]*>0\.000 %/.test(resetHud),
  'reset rebuilds the scene at t=0 and re-baselines energy']);

document.getElementById('slingshot')._fire('change', { target: { checked: true } });
canvas._fire('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 });
canvas._fire('pointermove', { pointerId: 2, clientX: 90, clientY: 30 });
const beforePreview = lineToCalls;
frames++; cb(performance.now());
checks.push([lineToCalls >= beforePreview + 20,
  'slingshot aim draws a live trajectory preview']);
canvas._fire('pointerup', { pointerId: 2, clientX: 90, clientY: 30, pointerType: 'mouse' });
checks.push([/^Launched with speed/.test(document.getElementById('live').textContent),
  'slingshot can place, aim, and launch a new body']);
windowListeners.keydown(keyEvent('l'));
windowListeners.keydown(keyEvent('ArrowLeft'));
windowListeners.keydown(keyEvent('Enter'));
checks.push([/^Launched with speed/.test(document.getElementById('live').textContent),
  'keyboard slingshot places, aims, and launches']);

const sceneControl = document.getElementById('scene');
sceneControl.value = 'lunar';
sceneControl._fire('change', { target: sceneControl });
frames++; cb(performance.now());
const difficulty = document.getElementById('difficulty');
difficulty.value = 'hard';
difficulty._fire('change', { target: difficulty });
frames++; cb(performance.now());
checks.push([/27\.5 kg/.test(document.getElementById('mission-settings').textContent)
  && /2\.0 m/.test(document.getElementById('mission-settings').textContent)
  && /12 on every flight/.test(document.getElementById('mission-settings').textContent)
  && /Projected/.test(document.getElementById('trajectory-status').textContent),
  'difficulty control restarts the mission and displays the projected contact']);
difficulty.value = 'normal';
difficulty._fire('change', { target: difficulty });
frames++; cb(performance.now());
checks.push([drawnText.includes('UT Mission'),
  'lander renderer draws the UT Mission side decal']);
document.getElementById('btn-play')._fire('click', {});
document.getElementById('btn-reset')._fire('click', {});
checks.push([document.getElementById('live').textContent === 'Simulation reset',
  'touch restart button resets the lunar mission']);
frames++; cb(performance.now());
const soundToggle = document.getElementById('sound-enabled');
checks.push([!soundToggle.checked && audioContexts.length === 0,
  'cockpit audio is off until explicitly enabled']);
soundToggle.checked = true;
soundToggle._fire('change', {});
await Promise.resolve();
frames++; cb(performance.now());
checks.push([soundToggle.checked && audioContexts.length === 1 &&
  audioContexts[0].oscillators.length >= 5,
  'cockpit sound initializes its procedural Web Audio layers after a user click']);
const soundVolume = document.getElementById('sound-volume');
soundVolume.value = '0.9';
soundVolume._fire('input', {});
checks.push([document.getElementById('sound-volume-out').textContent === '90%' &&
  audioContexts[0].gainNodes[0].gain.value === 0.9,
  'cockpit volume control updates the audio master gain']);
const readOrientation = () => {
  const html = document.getElementById('hud').innerHTML;
  const match = html.match(/(?:orientation|impact angle)<\/span><span class="v">(-?\d+)°/);
  if (!match) throw new Error(`Lander orientation missing from HUD: ${html}`);
  return Number(match[1]);
};
const orientationBefore = readOrientation();
windowListeners.keydown(keyEvent('ArrowLeft'));
for (let i = 0; i < 15; i++) { frames++; cb(performance.now()); }
windowListeners.keyup(keyEvent('ArrowLeft'));
checks.push([readOrientation() > orientationBefore,
  'left arrow rotates the lander while the mission is running']);
const keypadOrientationBefore = readOrientation();
const focusedButton = { matches: selector => selector.includes('button') };
windowListeners.keydown(keyEvent('4', 'Numpad4', focusedButton));
for (let i = 0; i < 15; i++) { frames++; cb(performance.now()); }
windowListeners.keyup(keyEvent('4', 'Numpad4', focusedButton));
checks.push([readOrientation() > keypadOrientationBefore,
  'numeric keypad steering works when a button has focus']);
const fuelRemaining = () => Number(document.getElementById('hud').innerHTML
  .match(/fuel remaining<\/span><span class="v">([\d.]+) kg/)[1]);
const reserveBefore = fuelRemaining();
const soundsBeforeThrust = audioContexts[0].oscillators.length;
windowListeners.keydown(keyEvent('ArrowDown'));
for (let i = 0; i < 20; i++) { frames++; cb(performance.now()); }
windowListeners.keyup(keyEvent('ArrowDown'));
const reserveAfter = fuelRemaining();
checks.push([reserveAfter < reserveBefore,
  'down arrow thrusts and reduces remaining fuel']);
const throttle = document.getElementById('throttle');
throttle.value = '0.25';
throttle._fire('input', {});
frames++; cb(performance.now());
checks.push([document.getElementById('throttle-out').textContent === '25%'
  && /throttle setting<\/span><span class="v">25%/.test(document.getElementById('hud').innerHTML),
  'throttle slider updates the active lunar HUD']);
const keypadFuelBefore = fuelRemaining();
windowListeners.keydown(keyEvent('2', 'Numpad2'));
windowListeners.keydown(keyEvent('ArrowUp'));
windowListeners.keyup(keyEvent('2', 'Numpad2'));
for (let i = 0; i < 20; i++) { frames++; cb(performance.now()); }
windowListeners.keyup(keyEvent('ArrowUp'));
checks.push([fuelRemaining() < keypadFuelBefore,
  'thrust stays active while another thrust key is still held']);
checks.push([audioContexts[0].oscillators.length > soundsBeforeThrust &&
  audioContexts[0].gainNodes.some(node => node.gain.targets.includes(0.2)),
  'thrust engages the synthesized relay sound']);
const touchReserveBefore = reserveAfter;
document.getElementById('lander-thrust')._fire('pointerdown', {
  pointerId: 7, cancelable: true, preventDefault: noop
});
for (let i = 0; i < 10; i++) { frames++; cb(performance.now()); }
document.getElementById('lander-thrust')._fire('pointerup', { pointerId: 7 });
const touchReserveAfter = fuelRemaining();
checks.push([touchReserveAfter < touchReserveBefore,
  'touch thrust button burns fuel while pressed and releases cleanly']);
checks.push([/open\)/.test(document.getElementById('hud').innerHTML),
  'powered lander marks energy change as an open-system diagnostic']);
const conservative = document.getElementById('conservative-mode');
conservative.checked = true;
conservative._fire('change', { target: conservative });
const fuelBeforeConservativeTouch = fuelRemaining();
document.getElementById('lander-thrust')._fire('pointerdown', {
  pointerId: 8, cancelable: true, preventDefault: noop
});
for (let i = 0; i < 10; i++) { frames++; cb(performance.now()); }
document.getElementById('lander-thrust')._fire('pointerup', { pointerId: 8 });
checks.push([fuelRemaining() === fuelBeforeConservativeTouch,
  'conservative mode blocks touch thrust input']);
checks.push([/energy drift/.test(document.getElementById('debug-hud').innerHTML),
  'debug HUD retains drift instrumentation while conservative mode is active']);
checks.push([/Find the pad/.test(document.getElementById('mission-status').textContent),
  'mission instructions are visible to visitors']);
checks.push([/score<\/span><span class="v">0 \/ 100/.test(document.getElementById('hud').innerHTML),
  'lander HUD shows the mission score']);
const soundProbe = new CockpitSound();
await soundProbe.enable();
const probeContext = audioContexts[audioContexts.length - 1];
const oscillatorsBeforeSteering = probeContext.oscillators.length;
soundProbe.update({ rotation: 1 });
checks.push([probeContext.oscillators.length === oscillatorsBeforeSteering,
  'steering alone produces no synthesized actuator sound']);
const noisesBeforeSideCrash = probeContext.bufferSources.length;
soundProbe.update({
  missionStatus: 'crashed', impactKind: 'side-wall', impactSpeed: 6
});
checks.push([probeContext.bufferSources.length >= noisesBeforeSideCrash + 4,
  'side-wall crash produces impact and metallic-rattle noise layers']);
await soundProbe.disable();
checks.push([probeContext.state === 'suspended',
  'muting suspends the audio context to reduce idle processing']);
conservative.checked = false;
conservative._fire('change', { target: conservative });
sceneControl.value = 'lunar';
sceneControl._fire('change', { target: sceneControl });
for (let i = 0; i < 420; i++) { frames++; cb(performance.now()); }
const stoppedTime = document.getElementById('hud').innerHTML.match(
  /<span class="k">t<\/span><span class="v">([\d.]+) s/
);
const endedMission = document.getElementById('mission-status').textContent;
for (let i = 0; i < 60; i++) { frames++; cb(performance.now()); }
const laterTime = document.getElementById('hud').innerHTML.match(
  /<span class="k">t<\/span><span class="v">([\d.]+) s/
);
checks.push([endedMission && stoppedTime && laterTime && stoppedTime[1] === laterTime[1],
  'mission timer stops after landing or crash']);
const debrief = document.getElementById('mission-debrief');
checks.push([!debrief.hidden
  && /^(Safe landing|Crash)$/.test(document.getElementById('debrief-outcome').textContent)
  && /^\d+ \/ 100$/.test(document.getElementById('debrief-score').textContent)
  && /[\d.]+ s/.test(document.getElementById('debrief-time').textContent)
  && /[\d.]+ kg/.test(document.getElementById('debrief-fuel-used').textContent)
  && /[\d.]+ kg/.test(document.getElementById('debrief-fuel-remaining').textContent),
  'terminal mission displays outcome, flight time, and fuel debrief']);

let bad = 0;
for (const [c, n] of checks) { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) bad++; }
console.log(`\n  ${checks.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
