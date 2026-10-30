// main.js -- the ONLY file that knows about both layers.
// It wires DOM controls to the engine and drives the render loop.
// Notice how little code this is: that is the point of the separation.

import { World } from './engine/World.js';
import { Accumulator } from './engine/Accumulator.js';
import { INTEGRATORS } from './engine/Integrators.js';
import { Camera } from './render/Camera.js';
import { Renderer } from './render/Renderer.js';
import { HUD } from './render/HUD.js';
import { SCENES } from './scenes/scenes.js';
import { validate } from './tests/validate.js';

const $ = (id) => document.getElementById(id);
const canvas = $('sim');
const camera = new Camera(canvas);
const renderer = new Renderer(canvas, camera);
const hud = new HUD($('hud'));

let world = null;
let acc = new Accumulator(1 / 240);
let running = true;
let sceneKey = 'collisions';

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(r.width));
  canvas.height = Math.max(240, Math.floor(r.width * 0.62));
  if (world) camera.fit(world.view.xmin, world.view.ymin, world.view.xmax, world.view.ymax);
}

function buildScene() {
  world = SCENES[sceneKey].make();
  const I = INTEGRATORS[$('integrator').value];
  world.integrator = new I();
  world.broadPhase = $('broadphase').value;
  world.captureBaseline();          // ONCE, here. Never inside the frame loop.
  renderer.clearTrails();
  acc = new Accumulator(parseFloat($('dt').value));
  camera.fit(world.view.xmin, world.view.ymin, world.view.xmax, world.view.ymax);
  $('note').textContent = world.note || '';
  $('dtLabel').textContent = (+$('dt').value).toExponential(0).replace('e-', 'e-');
}

/* ------------------------------------------------------------ controls */

function fillSelects() {
  const s = $('scene');
  for (const [k, v] of Object.entries(SCENES)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = v.label; s.appendChild(o);
  }
  s.value = sceneKey;
  const i = $('integrator');
  for (const [k, C] of Object.entries(INTEGRATORS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = C.label; i.appendChild(o);
  }
  i.value = 'VelocityVerlet';
}

function wire() {
  $('scene').onchange = (e) => { sceneKey = e.target.value; buildScene(); };
  $('integrator').onchange = buildScene;
  $('broadphase').onchange = () => { world.broadPhase = $('broadphase').value; };
  $('dt').onchange = buildScene;
  $('reset').onclick = buildScene;
  $('playpause').onclick = () => {
    running = !running;
    $('playpause').textContent = running ? 'Pause' : 'Play';
    acc.reset();                 // discard the time spent paused
  };
  $('stepOnce').onclick = () => { world.step(acc.DT); renderer.recordTrails(world); };
  $('trails').onchange  = (e) => { renderer.showTrails = e.target.checked; renderer.clearTrails(); };
  $('vectors').onchange = (e) => { renderer.showVectors = e.target.checked; };
  $('grid').onchange    = (e) => { renderer.showGrid = e.target.checked; };
  $('runTests').onclick = () => {
    const panel = $('testOut');
    panel.style.display = 'block';
    panel.textContent = 'running...';
    setTimeout(() => {
      const r = validate();
      panel.textContent = r.text;
      panel.className = 'tests ' + (r.passed === r.total ? 'good' : 'bad');
    }, 20);
  };
  window.addEventListener('resize', resize);

  // click-drag to pan, wheel to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.offsetX, y: e.offsetY, c: { ...camera.center } };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    camera.center.x = drag.c.x - (e.offsetX - drag.x) / camera.scale;
    camera.center.y = drag.c.y + (e.offsetY - drag.y) / camera.scale;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.scale *= Math.exp(-e.deltaY * 0.0015);
  }, { passive: false });
}

/* ----------------------------------------------------------- the loop */

function frame(nowMs) {
  if (running) {
    acc.advance(nowMs, (DT) => world.step(DT));
    renderer.recordTrails(world);
  }
  renderer.draw(world);          // render EVERY frame, even when paused
  hud.update(world, acc);
  requestAnimationFrame(frame);
}

fillSelects();
wire();
resize();
buildScene();
requestAnimationFrame(frame);
