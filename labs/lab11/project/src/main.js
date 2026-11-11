// main.js — the only file that wires engine + render + ui together.
// Everything DOM-related lives at or below this file; engine/ stays pure.
import { Camera }       from './render/Camera.js';
import { Renderer }     from './render/Renderer.js';
import { HUD }          from './render/HUD.js';
import { IntegratorRace } from './render/IntegratorRace.js';
import { Controls }     from '../ui.js';
import { PointerInput, KeyboardInput } from '../input.js';
import { StateURL }     from './ui/StateURL.js';
import { serializeSamples } from './ui/CSVExport.js';
import { SCENES, SCENE_LIST } from './scenes.js';
import { Body, Vec2 }   from './engine/World.js';

const DEFAULTS = {
  scene: 'lunar', integrator: 'verlet', dt: 1 / 240,
  restitution: 0.95, gravity: 9.81, drag: 0.0,
  speed: 1.0, count: 24, trails: true, spawnMode: false,
  velocityVectors: false, forceVectors: false, slingshotMode: false,
  raceA: 'euler', raceB: 'verlet'
};

const canvas = document.getElementById('sim');
const live   = document.getElementById('live');       // aria-live announcer
const missionStatus = document.getElementById('mission-status');
const landerControls = document.getElementById('lander-controls');
const landerInstructions = document.getElementById('lander-instructions');
const cam    = new Camera();
const render = new Renderer(canvas, cam);
const hud    = new HUD(document.getElementById('hud'));

// Respect the OS "reduce motion" setting: no trails, no flashing.
render.reducedMotion =
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

// Query parameters are canonical; legacy hash links remain readable.
const state = { ...DEFAULTS, ...StateURL.decode(location.search || location.hash, DEFAULTS) };

let world = null, view = null, paused = false, lastSubsteps = 0;
let pointer = null, keyboard = null;
let cursor = null;
let lastMissionStatus = null;
let race = null;
let samples = [];
let nextSampleAt = 0;

function announce(msg) { live.textContent = msg; }

function recordSample(force = false) {
  if (!world || (!force && world.time < nextSampleAt) || samples.length >= 50000) return;
  samples.push({
    time: world.time,
    bodies: world.bodies.map(body => ({ id: body.id, x: body.pos.x, y: body.pos.y })),
    kinetic: world.kinetic(),
    mechanical: world.mechanical(),
    energy: world.energy(),
    energyChangePct: world.driftE() * 100,
    charge: world.landerDrive ? world.landerDrive.charge : '',
    missionStatus: world.mission ? world.mission.status : ''
  });
  nextSampleAt = world.time + 0.1;
}

function build() {
  const made = SCENES[state.scene] ? SCENES[state.scene](state) : SCENES.billiards(state);
  world = made.world; view = made.view;
  lastMissionStatus = null;
  world.setIntegrator(state.integrator);
  render.clearTrails();
  render.resize();
  cam.fit(...view);
  // Rebuilding replaces `world`, so re-point the input objects at the new one.
  if (pointer)  { pointer.world  = world; pointer.spring  = world.pointer; }
  if (keyboard) { keyboard._clearLanderControls(); keyboard.world = world; keyboard.spring = world.pointer;
                  keyboard.selected = null; }
  if (pointer) pointer.launch = null;
  if (keyboard) keyboard.launch = null;
  samples = [];
  nextSampleAt = 0;
  recordSample(true);
  if (race) {
    race.dt = state.dt;
    race.setIntegrators(state.raceA, state.raceB);
    race.reset();
  }
  controls.syncToDOM();
  StateURL.write(state);
  announce(`${state.scene} scene loaded with ${world.bodies.length} bodies, ` +
           `integrator ${state.integrator}`);
}

// Live parameter edits that must NOT restart the simulation.
function applyLive(changed = null) {
  if (!world) return;
  world.setIntegrator(state.integrator);
  if (race) race.setIntegrators(state.raceA, state.raceB);
  world.restitution = state.restitution;
  for (const f of world.forces) {
    if (f.constructor.name === 'UniformGravity')  f.g = state.gravity;
    if (f.constructor.name === 'QuadraticDrag')   f.c = state.drag;
  }
  render.showTrails = state.trails;
  render.showVelocity = state.velocityVectors;
  render.showForceVectors = state.forceVectors;
  if (!state.trails) render.clearTrails();
  if (pointer) {
    pointer.spawnMode = state.spawnMode;
    pointer.slingshotMode = state.slingshotMode;
  }
  if (keyboard) keyboard.slingshotMode = state.slingshotMode;
  if (['integrator', 'restitution', 'gravity', 'drag'].includes(changed)) {
    world.markReference();
  }
  StateURL.write(state);
}

function spawn(x, y) {
  if (world.bodies.length >= 400) { announce('Body limit reached'); return; }
  world.add(new Body({ pos: new Vec2(x, y), vel: new Vec2(0, 0),
                       mass: 1, radius: 0.26, color: '#58a6ff' }));
  world.markReference();          // new body => new reference energy, honestly
  announce(`Body added at ${x.toFixed(1)}, ${y.toFixed(1)} metres`);
}

function launch({ body, origin, velocity }) {
  let vx = velocity.x + (body ? body.vel.x : 0);
  let vy = velocity.y + (body ? body.vel.y : 0);
  const speed = Math.hypot(vx, vy);
  if (speed > 30) { vx *= 30 / speed; vy *= 30 / speed; }
  if (body) {
    body.vel.x = vx;
    body.vel.y = vy;
  } else {
    if (world.bodies.length >= 400) { announce('Body limit reached'); return; }
    world.add(new Body({
      pos: new Vec2(origin.x, origin.y),
      vel: new Vec2(vx, vy),
      mass: 1, radius: 0.26, color: '#58a6ff'
    }));
  }
  world.markReference();
  announce(`Launched with speed ${Math.hypot(vx, vy).toFixed(1)} metres per second`);
}

const actions = {
  togglePause() { paused = !paused; controls.setPlayLabel(paused);
                  announce(paused ? 'Paused' : 'Running'); },
  stepOnce()    { if (!paused) actions.togglePause();
                  world.stepOnce(); render.recordTrails(world);
                  recordSample(true);
                  announce(`Stepped to t = ${world.time.toFixed(3)} seconds`); },
  adjustSpeed(delta) {
    state.speed = Math.max(0.25, Math.min(2, parseFloat((state.speed + delta).toFixed(2))));
    controls.syncToDOM();
    applyLive();
    announce(`Simulation speed ${state.speed.toFixed(2)} times`);
  },
  reset()       { build(); announce('Simulation reset'); },
  toggleTrails(){ state.trails = !state.trails; controls.syncToDOM(); applyLive(); },
  preset(i)     { const s = SCENE_LIST[i]; if (!s) return;
                  state.scene = s[0]; controls.syncToDOM(); build(); },
  copyLink() {
    const url = location.origin + location.pathname + StateURL.encode(state);
    if (!navigator.clipboard?.writeText) {
      announce('Copy failed; the URL bar already holds the link');
      return;
    }
    navigator.clipboard.writeText(url)
      .then(() => announce('Permalink copied to clipboard'))
      .catch(() => announce('Copy failed; the URL bar already holds the link'));
  },
  downloadCSV() {
    if (!samples.length) {
      announce('No simulation samples to export yet');
      return;
    }
    const blob = new Blob([serializeSamples(samples)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lab10-${state.scene}-timeseries.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Downloaded ${samples.length} samples as CSV`);
  },
  launch
};

const controls = new Controls(state, {
  onChange : applyLive,
  onRebuild: build,
  onAction : (k) => actions[k] && actions[k]()
});

build();
pointer  = new PointerInput(canvas, cam, world, world.pointer, {
  onSpawn: spawn,
  onLaunch: launch,
  onCursor: position => { cursor = position; },
  slingshotMode: state.slingshotMode
});
keyboard = new KeyboardInput(world, world.pointer, cam, { ...actions, announce });
pointer.spawnMode = state.spawnMode;
pointer.slingshotMode = state.slingshotMode;
keyboard.slingshotMode = state.slingshotMode;

race = new IntegratorRace({
  leftCanvas: document.getElementById('race-left'),
  rightCanvas: document.getElementById('race-right'),
  plotCanvas: document.getElementById('race-plot'),
  leftSelect: document.getElementById('race-left-integrator'),
  rightSelect: document.getElementById('race-right-integrator'),
  readout: document.getElementById('race-readout'),
  resetButton: document.getElementById('race-reset'),
  dt: state.dt,
  leftIntegrator: state.raceA,
  rightIntegrator: state.raceB,
  onIntegratorsChange(left, right) {
    state.raceA = left;
    state.raceB = right;
    StateURL.write(state);
  }
});
const raceDetails = document.querySelector('.race-details');
raceDetails.addEventListener('toggle', () => race.resize());
window.addEventListener('resize', () => { render.resize(); cam.fit(...view); race.resize(); });

// ---- the frame loop: fixed physics step, variable render rate ----
let last = performance.now();
function frame(now) {
  hud.tick(now);
  let dtFrame = (now - last) / 1000;      // ms -> s, ONCE, here
  last = now;
  if (!Number.isFinite(dtFrame) || dtFrame < 0) dtFrame = 0;

  if (!paused) {
    const frameSeconds = Math.min(dtFrame, 0.25);
    const requestedSteps = Math.ceil(frameSeconds * state.speed / world.DT);
    const maxSubsteps = Math.min(64, Math.max(8, requestedSteps));
    const r = world.advance(frameSeconds * state.speed, maxSubsteps);
    lastSubsteps = r.substeps;
    render.recordTrails(world);
    recordSample();
    if (raceDetails.open) race.advance(frameSeconds * state.speed);
  } else lastSubsteps = 0;
  if (raceDetails.open) race.draw();

  if (world.mission) {
    landerInstructions.hidden = false;
    landerControls.hidden = false;
    missionStatus.textContent = world.mission.message;
    missionStatus.setAttribute('data-state', world.mission.status);
    if (world.mission.status !== lastMissionStatus &&
        world.mission.status !== 'flying') announce(world.mission.message);
    lastMissionStatus = world.mission.status;
  } else {
    landerInstructions.hidden = true;
    landerControls.hidden = true;
    missionStatus.textContent = '';
    missionStatus.removeAttribute('data-state');
    lastMissionStatus = null;
  }

  render.draw(world, {
    grabbed: world.pointer.grabbed,
    target : world.pointer.active ? world.pointer.target : null,
    cursor,
    slingshot: pointer && pointer.launch ? pointer.launch
      : keyboard && keyboard.launch ? keyboard.launch : null
  });
  hud.update(world, { substeps: lastSubsteps, paused, cursor });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Pause when the tab is hidden, so returning does not dump a huge dt in.
document.addEventListener('visibilitychange', () => { last = performance.now(); });

function restoreURLState() {
  Object.assign(state, StateURL.decode(location.search || location.hash, DEFAULTS));
  controls.syncToDOM(); build();
}
window.addEventListener('popstate', restoreURLState);
window.addEventListener('hashchange', restoreURLState);
