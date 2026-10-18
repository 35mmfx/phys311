import { Vec2 } from './engine/vec2.js';
import { Body } from './engine/body.js';
import { Gravity, Spring } from './engine/forces.js';
import { Euler, EulerCromer, VelocityVerlet } from './engine/integrators.js';
import { World } from './engine/world.js';
import { Camera } from './render/camera.js';
import { draw } from './render/renderer.js';

const G = 9.81;
const MAX_FRAME = 0.25;

const canvas = document.getElementById("sim");
const ctx = canvas.getContext("2d");
const logEl = document.getElementById("log");

let dtDenom = 240;
let DT = 1 / dtDenom;
let world, hud, paused = false;
let accumulator = 0;
let lastTime = performance.now() / 1000;
let fpsEMA = 60;

function makeIntegrator(name) {
  if (name === "euler")        return new Euler();
  if (name === "euler-cromer") return new EulerCromer();
  return new VelocityVerlet();
}

function buildProjectile(integratorName) {
  const w = new World(makeIntegrator(integratorName));
  const v0 = 25, th = 45 * Math.PI / 180;
  w.add(new Body({
    mass: 1, radius: 0.35, color: "#ff8200",
    pos: new Vec2(0, 0),
    vel: new Vec2(v0 * Math.cos(th), v0 * Math.sin(th))
  }));
  w.addForce(new Gravity(G));
  w.primeAccelerations();
  w.meta = { kind: "projectile", camera: new Camera(13, 60, 470), yRef: 0 };
  return w;
}

function buildSpring(integratorName) {
  const w = new World(makeIntegrator(integratorName));
  const b = w.add(new Body({
    mass: 1, radius: 0.09, color: "#4ec9b0",
    pos: new Vec2(1, 0), vel: new Vec2(0, 0)
  }));
  w.addForce(new Spring(b, new Vec2(0, 0), 1.0, 0));
  w.primeAccelerations();
  w.meta = { kind: "spring", camera: new Camera(180, 450, 260), anchor: new Vec2(0, 0) };
  return w;
}

function buildScene(sceneName, integratorName) {
  return sceneName === "spring" ? buildSpring(integratorName)
                                : buildProjectile(integratorName);
}

function resetSim() {
  const sceneName = document.getElementById("scene").value;
  const method    = document.getElementById("integrator").value;
  dtDenom = parseInt(document.getElementById("dt").value, 10);
  DT = 1 / dtDenom;

  world = buildScene(sceneName, method);
  hud = { E0: world.totalEnergy(), fps: 60, lastSteps: 0,
          method: method, dtDenom: dtDenom };
  accumulator = 0;
  lastTime = performance.now() / 1000;
}

function frame(nowMs) {
  const now = nowMs / 1000;
  let frameTime = now - lastTime;
  lastTime = now;

  if (frameTime > 0) fpsEMA = 0.9 * fpsEMA + 0.1 * (1 / frameTime);
  hud.fps = fpsEMA;

  if (frameTime > MAX_FRAME) frameTime = MAX_FRAME;

  let n = 0;
  if (!paused) {
    accumulator += frameTime;
    while (accumulator >= DT) {
      world.step(DT);
      accumulator -= DT;
      n++;
      if (world.steps % 4 === 0) {
        const b = world.bodies[0];
        b.trail.push(b.pos.clone());
        if (b.trail.length > 600) b.trail.shift();
      }
      if (world.meta.kind === "projectile" && world.bodies[0].pos.y < 0) {
        paused = true;
        document.getElementById("pause").textContent = "Resume";
        break;
      }
    }
  }
  hud.lastSteps = n;

  draw(ctx, canvas, world, hud);
  requestAnimationFrame(frame);
}

// Logging Helpers & Validation Suite
function clearLog() { logEl.textContent = ""; }
function say(s, cls) {
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = s + "";
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

function vec2SelfTest() {
  const a = new Vec2(3, 4), b = new Vec2(1, -2);
  say("=== Vec2 self-test (Lab 8 Part A) ===", "dim");
  const checks = [
    ["a.add(b)",       `(${a.add(b).x}, ${a.add(b).y})`,            "(4, 2)"],
    ["a.sub(b)",       `(${a.sub(b).x}, ${a.sub(b).y})`,            "(2, 6)"],
    ["a.mul(2)",       `(${a.mul(2).x}, ${a.mul(2).y})`,            "(6, 8)"],
    ["a.dot(b)",       a.dot(b).toFixed(10),                        "-5.0000000000"],
    ["a.length()",     a.length().toFixed(10),                      "5.0000000000"],
    ["a.lengthSq()",   a.lengthSq().toFixed(10),                    "25.0000000000"],
    ["a.normalized()", `(${a.normalized().x.toFixed(10)}, ${a.normalized().y.toFixed(10)})`,
                       "(0.6000000000, 0.8000000000)"],
    ["|normalized|",   a.normalized().length().toFixed(15),         "1.000000000000000"]
  ];
  let allPass = true;
  for (const [name, got, want] of checks) {
    const pass = got === want;
    if (!pass) allPass = false;
    say((pass ? "  PASS  " : "  FAIL  ") + name.padEnd(16) + "= " + got.padEnd(30) +
        (pass ? "" : " expected " + want), pass ? "ok" : "bad");
  }
  say(allPass ? "  -> all Vec2 operations agree with Python exactly."
              : "  -> MISMATCH: fix Vec2 before trusting anything downstream.",
      allPass ? "ok" : "bad");
  say("");
}

function runHeadless(sceneName, method, dt, tEnd) {
  const w = buildScene(sceneName, method);
  const E0 = w.totalEnergy();
  let Emin = E0, Emax = E0;
  while (w.time < tEnd - 1e-12) {
    w.step(dt);
    const E = w.totalEnergy();
    if (E < Emin) Emin = E;
    if (E > Emax) Emax = E;
  }
  const b = w.bodies[0];
  return { x: b.pos.x, y: b.pos.y, vx: b.vel.x, vy: b.vel.y,
           t: w.time, n: w.steps, E0: E0, E: w.totalEnergy(),
           worst: Math.max(Math.abs(Emax - E0), Math.abs(Emin - E0)) / E0 };
}

function row(label, got, ref, tol) {
  const err = Math.abs(got - ref);
  const pass = err <= tol;
  say("  " + (pass ? "PASS" : "FAIL") + "  " + label.padEnd(22) +
      got.toFixed(12).padStart(18) + ref.toFixed(12).padStart(20) +
      ("  err " + err.toExponential(2)), pass ? "ok" : "bad");
  return pass;
}

function validate() {
  clearLog();
  vec2SelfTest();

  const DTv = 1 / 240;
  let allPass = true;

  say("=== Projectile: v0=25 m/s @ 45 deg, DT=1/240, t_end=2.0 s ===", "dim");
  say("        quantity                        JavaScript       Python (ref)");

  const REF = {
    "euler-cromer": { x: 35.355339059327, y: 15.694464059327,
                      vy: -1.942330470336, dE: -1.283148e-3 },
    "verlet":       { x: 35.355339059327, y: 15.735339059327,
                      vy: -1.942330470336, dE: 2.364686e-15 }
  };

  for (const m of ["euler-cromer", "verlet"]) {
    const r = runHeadless("projectile", m, DTv, 2.0);
    say("  -- " + m + "  (" + r.n + " steps) --", "dim");
    if (r.n !== 480) {
      say("  FAIL  step count = " + r.n + ", expected 480 " +
          "-> your loop condition is wrong; nothing else will match.", "bad");
      allPass = false;
    }
    allPass = row("x (m)",  r.x,  REF[m].x,  1e-9) && allPass;
    allPass = row("y (m)",  r.y,  REF[m].y,  1e-9) && allPass;
    allPass = row("vy (m/s)", r.vy, REF[m].vy, 1e-9) && allPass;
    const dE = (r.E - r.E0) / r.E0;
    say("        dE/E0" + " ".padEnd(17) +
        (dE >= 0 ? "+" : "") + dE.toExponential(6).padStart(17) +
        ("  ref " + REF[m].dE.toExponential(6)), "dim");
  }

  say("");
  say("=== Euler-Cromer error vs. the Week 2 §5.5 closed form ===", "dim");
  const ec = runHeadless("projectile", "euler-cromer", DTv, 2.0);
  const yExact = 25 * Math.sin(45 * Math.PI / 180) * 2 - 0.5 * G * 4;
  const dyMeas = ec.y - yExact;
  const dyPred = -0.5 * G * 2.0 * DTv;
  say("  measured  y_EC - y_exact  = " + dyMeas.toFixed(15) + " m");
  say("  predicted -0.5*g*t*dt     = " + dyPred.toFixed(15) + " m");
  say("  difference                = " + Math.abs(dyMeas - dyPred).toExponential(2) + " m",
      Math.abs(dyMeas - dyPred) < 1e-11 ? "ok" : "bad");

  say("");
  say("=== Spring oscillator: m=k=1, x0=1, v0=0, 10 periods, DT=1/240 ===", "dim");
  const T10 = 10 * 2 * Math.PI;
  const refWorst = { "euler": 2.992709e-1, "euler-cromer": 2.087683e-3,
                     "verlet": 4.340278e-6 };
  const refX = { "euler": 1.139854950642, "euler-cromer": 0.999995657522,
                 "verlet": 0.999998836099 };
  say("  method        x(10T)            max|dE|/E0      Python ref");
  for (const m of ["euler", "euler-cromer", "verlet"]) {
    const r = runHeadless("spring", m, DTv, T10);
    const okx = Math.abs(r.x - refX[m]) < 1e-9;
    if (!okx) allPass = false;
    say("  " + (okx ? "PASS" : "FAIL") + "  " + m.padEnd(14) +
        r.x.toFixed(12).padStart(16) + r.worst.toExponential(3).padStart(16) +
        refWorst[m].toExponential(3).padStart(16), okx ? "ok" : "bad");
  }

  say("");
  say("=== Fixed-timestep accumulator: frame-rate independence ===", "dim");
  function accRun(frames, clamp) {
    let acc = 0, t = 0, steps = 0, worst = 0;
    for (let ft of frames) {
      if (ft > clamp) ft = clamp;
      acc += ft;
      let k = 0;
      while (acc >= DTv) { t += DTv; steps++; k++; acc -= DTv; }
      if (k > worst) worst = k;
    }
    return { t, steps, worst };
  }
  const smooth = new Array(600).fill(1 / 60);
  const hi     = new Array(1440).fill(1 / 144);
  const jitter = [];
  for (let i = 0; i < 300; i++) jitter.push(1 / 40, 1 / 120);

  say("  pattern         frames   steps        sim_t(s)   worst steps/frame");
  for (const [name, f] of [["smooth 60 Hz", smooth], ["144 Hz", hi],
                           ["jittery", jitter]]) {
    const r = accRun(f, MAX_FRAME);
    const ok = r.steps === 2400 && Math.abs(r.t - 10) < 1e-9;
    if (!ok) allPass = false;
    say("  " + (ok ? "PASS" : "FAIL") + "  " + name.padEnd(14) +
        String(f.length).padStart(7) + String(r.steps).padStart(8) +
        r.t.toFixed(10).padStart(16) + String(r.worst).padStart(16),
        ok ? "ok" : "bad");
  }

  const stall = new Array(300).fill(1 / 60);
  stall.push(2.0);
  for (let i = 0; i < 299; i++) stall.push(1 / 60);
  const c1 = accRun(stall, MAX_FRAME), c2 = accRun(stall, 1e9);
  say("");
  say("=== Why the frame-time clamp matters (one 2 s tab-switch) ===", "dim");
  say("  clamped at 0.25 s : worst frame = " + c1.worst + " steps, " +
      "sim_t = " + c1.t.toFixed(4) + " s", "ok");
  say("  NO clamp          : worst frame = " + c2.worst + " steps, " +
      "sim_t = " + c2.t.toFixed(4) + " s", "bad");

  say("");
  say(allPass
      ? "######  ALL CHECKS PASSED -- this port agrees with Python to 1e-9+  ######"
      : "######  SOME CHECKS FAILED -- see the FAIL rows above  ######",
      allPass ? "ok" : "bad");
}

// UI Event Listeners
document.getElementById("pause").addEventListener("click", (e) => {
  paused = !paused;
  e.target.textContent = paused ? "Resume" : "Pause";
  lastTime = performance.now() / 1000;
});

document.getElementById("reset").addEventListener("click", () => {
  resetSim();
  paused = false;
  document.getElementById("pause").textContent = "Pause";
});

for (const id of ["integrator", "scene", "dt"]) {
  document.getElementById(id).addEventListener("change", () => {
    resetSim();
    paused = false;
    document.getElementById("pause").textContent = "Pause";
  });
}

document.getElementById("validate").addEventListener("click", validate);

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); document.getElementById("pause").click(); }
  if (e.key === "r" || e.key === "R") document.getElementById("reset").click();
});

// Start application
resetSim();
vec2SelfTest();
requestAnimationFrame(frame);
