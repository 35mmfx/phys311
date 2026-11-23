// main.js — the only file that wires engine + render + ui together.
// Everything DOM-related lives at or below this file; engine/ stays pure.
import { Camera }       from './render/Camera.js';
import { Renderer }     from './render/Renderer.js';
import { HUD }          from './render/HUD.js';
import { Controls }     from './ui.js';
import { PointerInput, KeyboardInput } from './input.js';
import { StateURL }     from './ui/StateURL.js';
import { serializeSamples } from './ui/CSVExport.js';
import { SCENES, SCENE_LIST, mulberry32, setConservativeMode } from './scenes.js';
import { Body, Vec2 }   from './engine/World.js';
import { CockpitSound } from './audio/CockpitSound.js';

const DEFAULTS = {
  scene: 'lunar', integrator: 'verlet', dt: 1 / 240,
  restitution: 0.95, gravity: 9.81, drag: 0.0,
  speed: 1.0, count: 24, throttle: 0.6, trails: true, spawnMode: false,
  velocityVectors: false, forceVectors: false, slingshotMode: false,
  debug: false, conservative: false,
  seed: Math.floor(Math.random() * 0x100000000)
};

const canvas = document.getElementById('sim');
const live   = document.getElementById('live');       // aria-live announcer
const missionStatus = document.getElementById('mission-status');
const missionDebrief = document.getElementById('mission-debrief');
const debriefOutcome = document.getElementById('debrief-outcome');
const debriefTime = document.getElementById('debrief-time');
const debriefFuelUsed = document.getElementById('debrief-fuel-used');
const debriefFuelRemaining = document.getElementById('debrief-fuel-remaining');
const landerControls = document.getElementById('lander-controls');
const landerInstructions = document.getElementById('lander-instructions');
const cam    = new Camera();
const render = new Renderer(canvas, cam);
const hud    = new HUD(document.getElementById('hud'));
const debugPanel = document.getElementById('debug-panel');
const debugHud = document.getElementById('debug-hud');
const DEBUG_DRIFT_TOLERANCE = 0.01;
const cockpitSound = new CockpitSound();
const soundToggle = document.getElementById('sound-enabled');
const soundVolume = document.getElementById('sound-volume');
const soundVolumeOutput = document.getElementById('sound-volume-out');

// Respect the OS "reduce motion" setting: no trails, no flashing.
render.reducedMotion =
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

// Query parameters are canonical; legacy hash links remain readable.
const state = { ...DEFAULTS, ...StateURL.decode(location.search || location.hash, DEFAULTS) };

let world = null, view = null, paused = false, lastSubsteps = 0;
let pointer = null, keyboard = null;
let cursor = null;
let lastMissionStatus = null;
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
  cockpitSound.reset();
  if (!world.mission && soundToggle.checked) {
    soundToggle.checked = false;
    cockpitSound.disable().catch(error => {
      announce(`Cockpit sound could not be suspended: ${error.message}`);
    });
  }
  lastMissionStatus = null;
  setConservativeMode(world, state.conservative);
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
  controls.syncToDOM();
  StateURL.write(state);
  announce(`${state.scene} scene loaded with ${world.bodies.length} bodies, ` +
           `integrator ${state.integrator}`);
}

// Live parameter edits that must NOT restart the simulation.
function applyLive(changed = null) {
  if (!world) return;
  world.setIntegrator(state.integrator);
  if (world.landerDrive) world.landerDrive.throttle = state.throttle;
  if (state.scene !== 'lunar') world.restitution = state.restitution;
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
  if (state.conservative) setConservativeMode(world, true);
  else if (changed === 'conservative') setConservativeMode(world, false);
  if (changed === 'conservative') world.markReference();
  debugPanel.hidden = !state.debug;
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
  togglePause() { paused = !paused; cockpitSound.switchClick(); controls.setPlayLabel(paused);
                  announce(paused ? 'Paused' : 'Running'); },
  stepOnce()    { if (world.mission && world.mission.status !== 'flying') return;
                  if (!paused) actions.togglePause();
                  world.stepOnce(); render.recordTrails(world);
                  recordSample(true);
                  announce(`Stepped to t = ${world.time.toFixed(3)} seconds`); },
  adjustSpeed(delta) {
    state.speed = Math.max(0.25, Math.min(2, parseFloat((state.speed + delta).toFixed(2))));
    controls.syncToDOM();
    applyLive();
    announce(`Simulation speed ${state.speed.toFixed(2)} times`);
  },
  reset()       { const nextRandom = mulberry32(state.seed);
                  state.seed = Math.floor(nextRandom() * 0x100000000);
                  build(); announce('Simulation reset'); },
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
    link.download = `week12-${state.scene}-timeseries.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(`Downloaded ${samples.length} samples as CSV`);
  },
  launch
};

soundToggle.addEventListener('change', async () => {
  try {
    if (soundToggle.checked) await cockpitSound.enable();
    else await cockpitSound.disable();
    announce(soundToggle.checked ? 'Cockpit sound enabled' : 'Cockpit sound muted');
  } catch (error) {
    soundToggle.checked = false;
    announce(`Cockpit sound could not be updated: ${error.message}`);
  }
});
soundVolume.addEventListener('input', () => {
  const volume = Number(soundVolume.value);
  cockpitSound.setVolume(volume);
  soundVolumeOutput.textContent = `${Math.round(volume * 100)}%`;
});

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

window.addEventListener('resize', () => { render.resize(); cam.fit(...view); });

// ---- the frame loop: fixed physics step, variable render rate ----
let last = performance.now();
function frame(now) {
  hud.tick(now);
  let dtFrame = (now - last) / 1000;      // ms -> s, ONCE, here
  last = now;
  if (!Number.isFinite(dtFrame) || dtFrame < 0) dtFrame = 0;

  if (!paused && (!world.mission || world.mission.status === 'flying')) {
    const frameSeconds = Math.min(dtFrame, 0.25);
    const requestedSteps = Math.ceil(frameSeconds * state.speed / world.DT);
    const maxSubsteps = Math.min(64, Math.max(8, requestedSteps));
    const r = world.advance(frameSeconds * state.speed, maxSubsteps);
    lastSubsteps = r.substeps;
    render.recordTrails(world);
    recordSample();
  } else lastSubsteps = 0;

  if (world.mission) {
    landerInstructions.hidden = false;
    landerControls.hidden = false;
    missionStatus.textContent = world.mission.message;
    missionStatus.setAttribute('data-state', world.mission.status);
    if (world.mission.status !== lastMissionStatus) {
      if (world.mission.status !== 'flying') {
        const debrief = world.mission.debrief;
        missionDebrief.hidden = false;
        missionDebrief.setAttribute('data-state', debrief.outcome);
        debriefOutcome.textContent = debrief.outcome === 'landed' ? 'Safe landing' : 'Crash';
        debriefTime.textContent = `${debrief.elapsedTime.toFixed(2)} s`;
        debriefFuelUsed.textContent = `${debrief.fuelUsed.toFixed(2)} kg`;
        debriefFuelRemaining.textContent = `${debrief.fuelRemaining.toFixed(2)} kg`;
        announce(world.mission.message);
      } else {
        missionDebrief.hidden = true;
        missionDebrief.removeAttribute('data-state');
      }
      lastMissionStatus = world.mission.status;
    }
  } else {
    landerInstructions.hidden = true;
    landerControls.hidden = true;
    missionDebrief.hidden = true;
    missionStatus.textContent = '';
    missionStatus.removeAttribute('data-state');
    lastMissionStatus = null;
  }
  const impact = world.mission?.impact;
  cockpitSound.update({
    thrusting: Boolean(world.landerDrive?.thrusting),
    paused,
    missionStatus: world.mission?.status || 'flying',
    impactKind: impact?.kind || '',
    fuelFraction: world.landerDrive
      ? world.landerDrive.fuel / world.landerDrive.maxFuel
      : 1,
    impactSpeed: impact
      ? Math.hypot(impact.verticalSpeed, impact.horizontalSpeed)
      : world.lander?.vel.len() || 0
  });

  render.draw(world, {
    grabbed: world.pointer.grabbed,
    target : world.pointer.active ? world.pointer.target : null,
    cursor,
    frameSeconds: dtFrame,
    slingshot: pointer && pointer.launch ? pointer.launch
      : keyboard && keyboard.launch ? keyboard.launch : null
  });
  hud.update(world, { substeps: lastSubsteps, paused, cursor });
  updateDebugHud();
  requestAnimationFrame(frame);
}

function updateDebugHud() {
  debugPanel.hidden = !state.debug;
  if (!state.debug) return;
  const driftPct = world.driftE() * 100;
  const driftClass = Math.abs(driftPct) > DEBUG_DRIFT_TOLERANCE * 100 ? 'bad' : 'ok';
  const maxSpeed = world.bodies.reduce((max, body) => Math.max(max, body.vel.len()), 0);
  debugHud.innerHTML = `
    <span class="k">total energy</span><span class="v">${world.energy().toFixed(3)} J</span>
    <span class="k">energy drift</span><span class="v ${driftClass}">${driftPct.toFixed(4)} % of E₀${world.energyMode === 'open' ? ' (open)' : ''}</span>
    <span class="k">|momentum|</span><span class="v">${world.momentum().len().toFixed(3)} kg·m/s</span>
    <span class="k">body count</span><span class="v">${world.bodies.length}</span>
    <span class="k">contacts this step</span><span class="v">${world.collisionsThisStep + world.wallHitsThisStep}</span>
    <span class="k">max speed</span><span class="v">${maxSpeed.toFixed(3)} m/s</span>
    <span class="k">measured FPS</span><span class="v">${hud.fps.toFixed(1)}</span>`;
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
