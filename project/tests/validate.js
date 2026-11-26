// validate.js — headless validation. Run:  node tests/validate.js
// Everything here runs in plain Node with NO browser, which is only possible
// because engine/ never touches the DOM. That is the Week 9 layering rule
// paying its final dividend.
import { World, Body, Vec2 } from '../engine/World.js';
import { resolvePair, resolveWalls } from '../engine/Collisions.js';
import { UniformGravity, Spring, NewtonGravity, PointerSpring, LanderDrive } from '../engine/Forces.js';
import { Camera }   from '../render/Camera.js';
import { Renderer } from '../render/Renderer.js';
import { StateURL } from '../ui/StateURL.js';
import { serializeSamples } from '../ui/CSVExport.js';
import { eventToWorld, slingshotVelocity } from '../input.js';
import { SCENES, setConservativeMode } from '../scenes.js';
import { predictLanding } from '../engine/Trajectory.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, detail = '') => {
  c ? pass++ : fail++;
  console.log(`${c ? '  PASS' : '  FAIL'}  ${name}${detail ? '   ' + detail : ''}`);
};
const H = t => console.log(`\n${t}\n${'-'.repeat(t.length)}`);

const ST = { scene:'billiards', integrator:'verlet', dt:1/240, restitution:0.95,
             gravity:9.81, drag:0, speed:1, count:24, seed:12345, throttle:0.6 };
const snap = w => w.bodies.map(b => [b.pos.x, b.pos.y, b.vel.x, b.vel.y]);
const maxdiff = (A, B) => Math.max(...A.flat().map((v, i) => Math.abs(v - B.flat()[i])));
const splitCSV = row => row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

// ---------------------------------------------------------------- 1
H('1. Camera: pixels <-> world is an exact inverse');
{
  const cam = new Camera({ cx: 1.7, cy: -0.4, scale: 37.5 });
  cam.resize(961, 517);                       // deliberately odd, non-square
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i * 37 % 23) - 11.5, y = (i * 61 % 17) - 8.5;
    const [px, py] = cam.toScreen(x, y);
    const [wx, wy] = cam.toWorld(px, py);
    worst = Math.max(worst, Math.abs(wx - x), Math.abs(wy - y));
  }
  ok(worst < 1e-12, 'round trip error < 1e-12', `worst = ${worst.toExponential(2)}`);
  const [, topPy] = cam.toScreen(0, 10), [, botPy] = cam.toScreen(0, -10);
  ok(topPy < botPy, 'world +y maps to smaller canvas y (the flip)',
     `y=+10 -> ${topPy.toFixed(1)} px, y=-10 -> ${botPy.toFixed(1)} px`);

  const scaled = new Camera({ scale: 10 });
  scaled.resize(400, 200);
  const canvas = {
    width: 800, height: 400,
    getBoundingClientRect: () => ({ left: 50, top: 25, width: 200, height: 100 })
  };
  const topLeft = eventToWorld({ clientX: 50, clientY: 25 }, canvas, scaled);
  const bottomRight = eventToWorld({ clientX: 250, clientY: 125 }, canvas, scaled);
  ok(Math.abs(topLeft[0] + 20) < 1e-12 && Math.abs(topLeft[1] - 10) < 1e-12
     && Math.abs(bottomRight[0] - 20) < 1e-12
     && Math.abs(bottomRight[1] + 10) < 1e-12,
     'CSS-scaled, high-DPI pointer corners map to camera world bounds',
     `top-left (${topLeft.map(v => v.toFixed(1)).join(', ')}) m; ` +
     `bottom-right (${bottomRight.map(v => v.toFixed(1)).join(', ')}) m`);
}

// ---------------------------------------------------------------- 2
H('2. Determinism: Reset reproduces the run exactly');
{
  const a = SCENES.billiards(ST).world, b = SCENES.billiards(ST).world;
  for (let i = 0; i < 3000; i++) { a.step(a.DT); b.step(b.DT); }
  ok(maxdiff(snap(a), snap(b)) === 0, 'two builds agree bit-for-bit after 3000 steps',
     `collisions = ${a.collisions}`);
  const code = readFileSync(join(ROOT, 'scenes.js'), 'utf8')
                 .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/Math\.random/.test(code), 'seeded PRNG only: no Math.random in scene code',
     'Math.random would break both Reset and permalinks');
}

// ---------------------------------------------------------------- 3
H('3. Step button: N single steps == one N-step run');
{
  const a = SCENES.chain(ST).world, b = SCENES.chain(ST).world;
  for (let i = 0; i < 1500; i++) a.stepOnce();
  for (let i = 0; i < 1500; i++) b.step(b.DT);
  ok(maxdiff(snap(a), snap(b)) === 0, 'pausing changes nothing about the physics',
     `t = ${a.time.toFixed(4)} s`);
}

// ---------------------------------------------------------------- 4
H('4. Accumulator: wall-clock jitter does not change the physics');
{
  const run = (frames) => {
    const w = SCENES.chain(ST).world;
    for (const f of frames) w.advance(f, 8);
    return w;
  };
  const N = 600;
  const smooth60  = Array(N).fill(1 / 60);
  const smooth144 = Array(Math.round(N * 144 / 60)).fill(1 / 144);
  const rnd = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const jitter = []; let tot = 0;
  while (tot < N / 60) { const f = 0.004 + rnd() * 0.028; jitter.push(f); tot += f; }
  const A = run(smooth60), B = run(smooth144), C = run(jitter);
  ok(Math.abs(A.time - B.time) < 1e-9 && Math.abs(A.time - C.time) < 0.02,
     'all three frame patterns reach the same simulated time',
     `60Hz ${A.time.toFixed(4)}s | 144Hz ${B.time.toFixed(4)}s | jittery ${C.time.toFixed(4)}s`);
  ok(A.steps === B.steps, 'identical substep count at 60 Hz and 144 Hz',
     `${A.steps} vs ${B.steps} steps`);
  const stall = SCENES.chain(ST).world;
  const r = stall.advance(2.0, 8);           // a 2-second tab freeze
  ok(r.substeps === 8, 'clamp caps a 2 s stall at 8 substeps (no spiral of death)',
     `unclamped would be ${Math.round(2.0 / stall.DT)}`);
}

// ---------------------------------------------------------------- 5
H('5. Input is a Force: inactive PointerSpring contributes exactly nothing');
{
  const w1 = SCENES.orbits(ST).world;        // already carries a PointerSpring
  const w2 = new World({ dt: ST.dt, integrator: 'verlet' });
  Body.resetIds();
  const ref = SCENES.orbits(ST).world;
  ref.forces = ref.forces.filter(f => !(f instanceof PointerSpring));  // remove it
  for (let i = 0; i < 2000; i++) { w1.step(w1.DT); ref.step(ref.DT); }
  ok(maxdiff(snap(w1), snap(ref)) === 0,
     'with and without the pointer force: bit-identical while released');
}

// ---------------------------------------------------------------- 6
H('6. Dragging injects momentum - and that is correct physics');
{
  const { world } = SCENES.orbits(ST);
  for (let i = 0; i < 1200; i++) world.step(world.DT);
  const before = world.driftP();
  ok(before < 1e-12, 'isolated N-body: |dp|/|p0| at machine zero while untouched',
     `${before.toExponential(2)}`);

  const b = world.bodies[2];
  world.pointer.grab(b, b.pos.x + 1.2, b.pos.y + 0.8);
  for (let i = 0; i < 600; i++) { world.step(world.DT); }
  const during = world.momentum().len();
  ok(during > 1e-3, 'while grabbed, total momentum is NOT conserved (external force)',
     `|p| = ${during.toExponential(2)}`);

  world.pointer.release();
  world.markReference();                     // honest re-baseline after the kick
  for (let i = 0; i < 1200; i++) world.step(world.DT);
  ok(world.driftP() < 1e-12, 'after release, conservation resumes to machine zero',
     `${world.driftP().toExponential(2)}`);
}

// ---------------------------------------------------------------- 7
H('7. Scene 4 is degenerate; scene 2 separates the integrators');
{
  const drift = (scene, integ, steps) => {
    const s = { ...ST, integrator: integ, dt: 1 / 240, drag: 0 };
    const { world } = SCENES[scene](s);
    let worst = 0;
    for (let i = 0; i < steps; i++) { world.step(world.DT); worst = Math.max(worst, Math.abs(world.driftE())); }
    return worst;
  };
  const pE = drift('projectile', 'euler', 1200), pV = drift('projectile', 'verlet', 1200);
  const cE = drift('chain', 'euler', 1200),      cV = drift('chain', 'verlet', 1200);
  console.log(`         projectile:  Euler ${pE.toExponential(2)}   Verlet ${pV.toExponential(2)}`);
  console.log(`         chain     :  Euler ${cE.toExponential(2)}   Verlet ${cV.toExponential(2)}`);
  ok(pE < 1e-2, 'constant force: Euler looks fine, so it proves nothing');
  ok(cE / Math.max(cV, 1e-18) > 1e3, 'position-dependent force: Euler is >1000x worse',
     `ratio = ${(cE / cV).toExponential(1)}`);
}

// ---------------------------------------------------------------- 8
H('8. Permalink: encode/decode round trip');
{
  const s = { scene:'orbits', integrator:'ec', dt:1/180, restitution:0.37,
              gravity:3.71, drag:0.012, speed:1.45, count:57, seed:987654321, throttle:0.45 };
  const back = StateURL.decode(StateURL.encode(s), ST);
  const same = Object.keys(s).every(k => Math.abs((back[k] ?? 0) - s[k]) < 1e-9 || back[k] === s[k]);
  ok(same && StateURL.encode(s).startsWith('?'),
     'every control survives the shareable query string', StateURL.encode(s).slice(0, 72) + '...');
  const partial = StateURL.decode('?scene=chain&int=verlet', ST);
  ok(partial.scene === 'chain' && partial.dt === ST.dt,
     'a hand-edited or truncated query falls back to defaults, no crash');
  const legacy = StateURL.decode('#scene=projectile&int=ec', ST);
  ok(legacy.scene === 'projectile' && legacy.integrator === 'ec',
     'previously published hash-based links remain readable');
  const clamped = StateURL.decode(
    '#dt=1&g=100&e=-1&drag=3&speed=0&n=900&throttle=2',
    ST
  );
  ok(clamped.dt === 0.02 && clamped.gravity === 25 && clamped.restitution === 0
     && clamped.drag === 0.2 && clamped.speed === 0.25 && clamped.count === 120
     && clamped.throttle === 1,
     'shareable URL parameters are clamped to the slider ranges');
  const flagged = StateURL.decode('?debug=1&conservative=1', ST);
  ok(flagged.debug && flagged.conservative,
     'debug and conservative test modes are restored from URL flags');
  ok(StateURL.encode({ ...s, debug: true, conservative: true }).includes('debug=1')
     && StateURL.encode({ ...s, debug: true, conservative: true }).includes('conservative=1'),
     'debug and conservative test modes survive permalink updates');
  ok(StateURL.decode(StateURL.encode({ ...s, difficulty: 'hard' }), ST).difficulty === 'hard'
     && StateURL.decode('?difficulty=invalid', ST).difficulty === 'normal',
     'difficulty survives shared links and invalid difficulty falls back to normal');
}

// ---------------------------------------------------------------- 9
H('9. Layering audit: engine is free of DOM and event APIs');
{
  const bad = [];
  const forbidden = /\b(?:document|window|canvas|ctx|event|pointerevent|mouseevent|keyboardevent|htmlelement|htmlcanvaselement|element|node)\b|addEventListener|removeEventListener|getContext|querySelector|\bon(?:click|input|change|pointer\w*|key\w*)\b/i;
  for (const dir of ['engine']) {
    for (const f of readdirSync(join(ROOT, dir)).filter(name => name.endsWith('.js'))) {
      const source = readFileSync(join(ROOT, dir, f), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      const match = code.match(forbidden);
      if (match) bad.push(`${dir}/${f}: ${match[0]}`);
    }
  }
  ok(bad.length === 0, 'no DOM or event APIs in engine/',
     bad.join(', ') || 'engine/ is clean');
}

// --------------------------------------------------------------- 10
H('10. Publishing audit: safe for GitHub Pages');
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const abs = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map(m => m[1]);
  ok(abs.length === 0, 'no absolute paths (they break on a project-page subpath)',
     abs.join(', ') || 'all relative');
  ok(/Variables to notice/.test(html)
     && /Euler-Cromer/.test(html)
     && /touchdown timing/.test(html),
     'Variables to notice explains fuel and integrator effects');
  ok(/Lunar Lander: Fuel for the Final Flare/.test(html),
     'page title uses the Lunar Lander showcase name');

  const refs = [...html.matchAll(/(?:src|href)="([^":#]+)"/g)].map(m => m[1].split(/[?#]/)[0]);
  const missing = refs.filter(r => { try { readFileSync(join(ROOT, r)); return false; }
                                     catch { return true; } });
  ok(missing.length === 0, 'every referenced file exists with EXACT case',
     missing.join(', ') || refs.join(', '));

  const inputIds = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  const labelIds = [...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map(m => m[1]);
  const unlabeled = inputIds.filter(id => !labelIds.includes(id));
  ok(unlabeled.length === 0, 'every input has an explicit label association',
     unlabeled.join(', ') || `${inputIds.length} inputs labeled`);
  ok(/<canvas\b[^>]*>[\s\S]*?\S[\s\S]*?<\/canvas>/.test(html),
     'canvas contains fallback text for unsupported rendering');

  let nojekyll = true;
  try { readFileSync(join(ROOT, '.nojekyll')); } catch { nojekyll = false; }
  ok(nojekyll, '.nojekyll present (Jekyll otherwise hides folders beginning with _)');
}

// --------------------------------------------------------------- 11
H('11. Energy ledger: inelastic loss is booked, not blamed on the solver');
{
  console.log('          e      KE kept     ledger dE/E0    collisions');
  let worst = 0;
  for (const e of [1.0, 0.95, 0.5, 0.0]) {
    const { world } = SCENES.billiards({ ...ST, restitution: e, integrator: 'verlet' });
    for (let i = 0; i < 2400; i++) world.step(world.DT);
    worst = Math.max(worst, Math.abs(world.driftE()));
    console.log(`       ${e.toFixed(2)}   ${(100 * world.kinetic() / world.E0).toFixed(2).padStart(8)}%` +
                `   ${world.driftE().toExponential(2).padStart(12)}   ${String(world.collisions).padStart(8)}`);
  }
  ok(worst < 1e-12, 'drift stays at machine zero at every restitution',
     `worst = ${worst.toExponential(2)}`);
  // Billiards is ANOTHER degenerate case: between impacts the net force is
  // zero, so Euler is exact there too. Only a force-carrying scene can judge
  // the solver -- which is exactly the Week 2 section 5.5 argument again.
  const eul = SCENES.billiards({ ...ST, restitution: 0.5, integrator: 'euler' }).world;
  for (let i = 0; i < 2400; i++) eul.step(eul.DT);
  ok(Math.abs(eul.driftE()) < 1e-12,
     'billiards is force-free between impacts, so Euler is exact there too',
     `Euler dE/E0 = ${eul.driftE().toExponential(2)} -- use scene 2 to judge a solver`);
}

// ---------------------------------------------------------------- 11b
H('11b. Randomized isolated collisions conserve momentum and do not add KE');
{
  let state = 20261123;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  let worstMomentum = 0, energyIncreases = 0, maxEnergyIncrease = 0, resolvedCount = 0;
  for (let i = 0; i < 500; i++) {
    const angle = random() * Math.PI * 2;
    const normal = new Vec2(Math.cos(angle), Math.sin(angle));
    const massA = 0.5 + random() * 4, massB = 0.5 + random() * 4;
    const radiusA = 0.2, radiusB = 0.2;
    const distance = (radiusA + radiusB) * (0.2 + 0.7 * random());
    const approachSpeed = 0.1 + random() * 8, tangentSpeed = (random() - 0.5) * 2;
    const a = new Body({
      pos: new Vec2(0, 0), vel: new Vec2(3, tangentSpeed),
      mass: massA, radius: radiusA
    });
    const b = new Body({
      pos: normal.mul(distance),
      vel: new Vec2(3, tangentSpeed).sub(normal.mul(approachSpeed)),
      mass: massB, radius: radiusB
    });
    const p0 = a.momentum().add(b.momentum());
    const k0 = a.kinetic() + b.kinetic();
    const restitution = random();
    if (!resolvePair(a, b, restitution)) continue;
    resolvedCount++;
    const relativeMomentumError = a.momentum().add(b.momentum()).sub(p0).len() / p0.len();
    const deltaKE = a.kinetic() + b.kinetic() - k0;
    worstMomentum = Math.max(worstMomentum, relativeMomentumError);
    if (deltaKE > 0) {
      energyIncreases++;
      maxEnergyIncrease = Math.max(maxEnergyIncrease, deltaKE);
    }
  }
  ok(resolvedCount === 500 && energyIncreases === 0 && worstMomentum < 1e-12,
     '500 isolated randomized impacts conserve momentum and never increase KE',
     `max |dP|/|P0|=${worstMomentum.toExponential(3)}, KE increases=${energyIncreases}, max increase=${maxEnergyIncrease.toExponential(3)} J`);
}

// --------------------------------------------------------------- 12
H('12. Slingshot: aim opposite the launch direction and cap speed');
{
  const v = slingshotVelocity({ x: 2, y: 1 }, { x: 1, y: 3 });
  ok(v.x > 0 && v.y < 0, 'pulling left and down launches right and up',
     `velocity = (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) m/s`);
  const fast = slingshotVelocity({ x: 0, y: 0 }, { x: -100, y: -100 });
  ok(Math.abs(Math.hypot(fast.x, fast.y) - 30) < 1e-12,
     'extreme pointer drags are capped at 30 m/s',
     `speed = ${Math.hypot(fast.x, fast.y).toFixed(1)} m/s`);
}

// --------------------------------------------------------------- 13
H('13. Teleporting: direct position edits can tunnel through collisions');
{
  const world = new World({ dt: ST.dt, restitution: 1 });
  Body.resetIds();
  const moved = world.add(new Body({ pos: new Vec2(-2, 0), radius: 0.5 }));
  const obstacle = world.add(new Body({ pos: new Vec2(0, 0), radius: 0.5 }));
  moved.pos.set(2, 0);
  world.step(world.DT);
  ok(moved.pos.x > obstacle.pos.x && world.collisions === 0,
     'a direct move from x=-2 to x=+2 passes the stationary body unseen',
     `final x = ${moved.pos.x.toFixed(1)}, collisions = ${world.collisions}`);
  ok(moved.vel.len2() === 0,
     'teleporting changes position without providing a physical collision impulse');
}

// --------------------------------------------------------------- 14
H('14. Lunar lander: variable mass, finite fuel, and touchdown');
{
  const missionState = { ...ST, scene: 'lunar', seed: 2468 };
  const { world } = SCENES.lunar(missionState);
  const { lander, landerDrive: drive, mission } = world;
  ok(lander.tag === 'lander' && drive instanceof LanderDrive && mission.status === 'flying',
     'lunar scene builds one controllable lander with an active mission');
  ok(drive.fuel === 39 && drive.maxFuel === 39 && lander.mass === 6939,
     'normal lunar final approach starts with 39 kg of fuel');

  const repeat = SCENES.lunar(missionState).world;
  const otherStart = SCENES.lunar({ ...missionState, seed: missionState.seed + 1 }).world;
  ok(lander.pos.x === repeat.lander.pos.x && lander.pos.y === repeat.lander.pos.y
     && (lander.pos.x !== otherStart.lander.pos.x || lander.pos.y !== otherStart.lander.pos.y),
     'seeded random starts reproduce from a link and vary with the seed');
  ok(lander.pos.x >= -7 && lander.pos.x <= 7
     && lander.pos.y - lander.radius >= 10 && lander.pos.y - lander.radius <= 14,
     'randomized starts stay within the documented x and altitude ranges');
  const normalDynamic = SCENES.lunar({ ...missionState, difficulty: 'normal' }).world;
  for (let i = 0; i < 120 && normalDynamic.mission.status === 'flying'; i++)
    normalDynamic.step(normalDynamic.DT);
  const earlyAsteroids = normalDynamic.bodies.filter(body => body.tag === 'asteroid');
  ok(earlyAsteroids.length >= 3
     && earlyAsteroids.every(asteroid => asteroid.vel.y < 0),
     'opening asteroid burst is dense and inclined toward the surface');
  for (let i = 0; i < 3000 && normalDynamic.mission.status === 'flying'; i++)
    normalDynamic.step(normalDynamic.DT);
  ok(normalDynamic.mission.asteroidLaunched > 6 && normalDynamic.mission.asteroidLaunched <= 9
     && normalDynamic.bodies.filter(body => body.tag === 'asteroid').length <= 9,
     'normal missions launch more asteroids during a seeded descent');

  const reserve = drive.charge;
  const fuelAtStart = drive.fuel;
  drive.thrusting = true;
  for (let i = 0; i < 120; i++) world.step(world.DT);
  ok(drive.fuel < fuelAtStart && drive.charge < reserve && lander.mass > drive.dryMass
     && lander.vel.y > -1.8,
     'powered thrust burns finite fuel, reduces mass, and slows the initial descent',
     `fuel ${fuelAtStart.toFixed(2)} -> ${drive.fuel.toFixed(2)} kg, mass=${lander.mass.toFixed(2)} kg, vy=${lander.vel.y.toFixed(2)} m/s`);

  drive.thrusting = false;
  drive.rotation = 0;
  const remainingFuel = drive.fuel;
  for (let i = 0; i < 120; i++) world.step(world.DT);
  ok(drive.fuel === remainingFuel,
     'unpowered flight does not regenerate finite propellant',
     `fuel remains ${drive.fuel.toFixed(2)} kg`);

  const throttleRun = throttle => {
    const w = new World({ dt: 1 / 240 });
    const body = w.add(new Body({ pos: new Vec2(0, 0), mass: 7200 }));
    const motor = w.addForce(new LanderDrive(body, {
      gravity: 0, dryMass: 6900, fuelMass: 300, maxFuel: 8200,
      thrust: 45000, isp: 304, throttle
    }));
    motor.thrusting = true;
    for (let i = 0; i < 240; i++) w.step(w.DT);
    return { burned: 300 - motor.fuel, velocity: body.vel.y };
  };
  const halfThrottle = throttleRun(0.5);
  const fullThrottle = throttleRun(1);
  const expectedFullBurn = 45000 / (304 * 9.81);
  ok(Math.abs(fullThrottle.burned - expectedFullBurn) < 1e-8
     && Math.abs(halfThrottle.burned * 2 - fullThrottle.burned) < 1e-8
     && halfThrottle.velocity > 0 && halfThrottle.velocity < fullThrottle.velocity,
     'throttle scales both fuel flow and acceleration',
     `half=${halfThrottle.burned.toFixed(3)} kg/s, full=${fullThrottle.burned.toFixed(3)} kg/s`);

  const rocket = new World({ dt: 1 / 240, integrator: 'verlet', bounds: null });
  Body.resetIds();
  const rocketBody = rocket.add(new Body({
    pos: new Vec2(0, 1000), mass: 1150, radius: 0.1
  }));
  const rocketDrive = rocket.addForce(new LanderDrive(rocketBody, {
    gravity: 0, dryMass: 1000, fuelMass: 150, maxFuel: 150,
    thrust: 8000, isp: 300, g0: 9.81
  }));
  rocket.lander = rocketBody;
  rocket.landerDrive = rocketDrive;
  rocketDrive.thrusting = true;
  const burnSteps = Math.round((100 * 300 * 9.81 / 8000) / rocket.DT);
  for (let i = 0; i < burnSteps; i++) rocket.step(rocket.DT);
  const expectedDeltaV = 300 * 9.81 * Math.log(1150 / rocketBody.mass);
  const rocketError = Math.abs((rocketBody.vel.y - expectedDeltaV) / expectedDeltaV);
  const burned = 1150 - rocketBody.mass;
  ok(rocketError < 0.01 && Math.abs(burned - 100) < 0.01,
     'fixed-step midpoint-mass thrust matches the rocket equation within 1% near a 100 kg burn',
     `error=${(rocketError * 100).toExponential(3)}%, burn=${burned.toFixed(5)} kg, Δv=${rocketBody.vel.y.toFixed(3)} m/s`);

  const depletionWorld = new World({ dt: 1 / 240, integrator: 'verlet', bounds: null });
  Body.resetIds();
  const depletionBody = depletionWorld.add(new Body({
    pos: new Vec2(0, 1000), mass: 1000.01, radius: 0.1
  }));
  const depletionDrive = depletionWorld.addForce(new LanderDrive(depletionBody, {
    gravity: 0, dryMass: 1000, fuelMass: 0.01, maxFuel: 0.01,
    thrust: 8000, isp: 300, g0: 9.81
  }));
  depletionDrive.thrusting = true;
  depletionWorld.step(depletionWorld.DT);
  ok(depletionDrive.fuel === 0 && depletionBody.mass === depletionDrive.dryMass
     && depletionBody.vel.y > 0 && !depletionDrive.thrusting,
     'final partial burn clamps fuel and mass at their lower bounds and cuts thrust');

  const touchdown = ({ x = 0, vx = 0.5, vy = -1, angle = 0, fuel, difficulty = 'normal' } = {}) => {
    const world = SCENES.lunar({ ...missionState, difficulty }).world;
    world.bodies = world.bodies.filter(body => body.tag !== 'asteroid');
    if (fuel !== undefined) {
      world.landerDrive.fuel = fuel;
      world.landerDrive._syncMassCharge();
    }
    world.lander.pos.set(x, world.lander.radius + 0.001);
    world.lander.vel.set(vx, vy + 1.62 * world.DT);
    world.lander.angle = angle * Math.PI / 180;
    world.step(world.DT);
    return world;
  };
  const safe = touchdown();
  ok(safe.mission.status === 'landed' && safe.mission.score === 100
     && safe.lander.fixed && safe.lander.vel.len2() === 0,
     'proposal touchdown case (0.5, -1.0 m/s, upright) lands safely',
     safe.mission.message);
  ok(safe.mission.debrief.outcome === 'landed'
     && safe.mission.debrief.elapsedTime === safe.mission.elapsedTime
     && safe.mission.debrief.fuelUsed === 0
     && safe.mission.debrief.fuelRemaining === 39
     && safe.mission.debrief.score === 100,
     'landing debrief records outcome, frozen time, and fuel');
  const halfFuel = touchdown({ fuel: 19.5 });
  const emptyFuel = touchdown({ fuel: 0 });
  const hardHalfFuel = touchdown({ difficulty: 'hard', fuel: 15 });
  const fuelRichCrash = touchdown({ x: 2, fuel: 39 });
  ok(halfFuel.mission.score === 75 && hardHalfFuel.mission.score === 75
     && emptyFuel.mission.score === 50 && fuelRichCrash.mission.score === 0
     && halfFuel.mission.debrief.score === 75 && fuelRichCrash.mission.debrief.score === 0,
     'scores reward remaining fuel relative to each difficulty only after a safe landing');
  const frozenLandingTime = safe.mission.elapsedTime;
  safe.step(safe.DT);
  ok(frozenLandingTime > 0 && safe.mission.elapsedTime === frozenLandingTime,
     'mission time is captured at touchdown');
  const fueledLanding = SCENES.lunar(missionState).world;
  fueledLanding.bodies = fueledLanding.bodies.filter(body => body.tag !== 'asteroid');
  fueledLanding.landerDrive.thrusting = true;
  for (let i = 0; i < 20; i++) fueledLanding.step(fueledLanding.DT);
  fueledLanding.landerDrive.thrusting = false;
  fueledLanding.lander.pos.set(0, fueledLanding.lander.radius + 0.001);
  fueledLanding.lander.vel.set(0, -1 + 1.62 * fueledLanding.DT);
  fueledLanding.lander.angle = 0;
  fueledLanding.step(fueledLanding.DT);
  ok(fueledLanding.mission.debrief.outcome === 'landed'
     && fueledLanding.mission.debrief.fuelUsed > 0
     && Math.abs(fueledLanding.mission.debrief.fuelUsed
       + fueledLanding.mission.debrief.fuelRemaining - 39) < 1e-10,
     'landing debrief accounts for fuel consumed during the mission',
     `used=${fueledLanding.mission.debrief.fuelUsed.toFixed(3)} kg, remaining=${fueledLanding.mission.debrief.fuelRemaining.toFixed(3)} kg`);
  const thresholdSafe = touchdown({
    x: 1.45 - 1.1 * (1 / 240), vx: 1.1, vy: -1.8, angle: 15
  });
  ok(thresholdSafe.mission.status === 'landed',
     'touchdown exactly on each stated inclusive limit passes',
     `${thresholdSafe.mission.message}; impact=${JSON.stringify(thresholdSafe.mission.impact)}`);

  const missed = touchdown({ x: 1.46, vx: 0 });
  ok(missed.mission.status === 'crashed' && /missed the landing pad/.test(missed.mission.message)
     && missed.mission.debrief.outcome === 'crashed',
     'proposal miss at 1.46 m outside pad center crashes');

  const fast = touchdown({ vx: 0, vy: -1.81 });
  ok(fast.mission.status === 'crashed' && /speed was too high/.test(fast.mission.message),
     'proposal vertical speed just above 1.8 m/s crashes');
  const sideCrash = SCENES.lunar(ST).world;
  sideCrash.lander.pos.x = sideCrash.bounds.xmax + sideCrash.lander.radius + 0.1;
  sideCrash.lander.vel.set(4, -2);
  sideCrash.step(sideCrash.DT);
  ok(sideCrash.mission.status === 'crashed'
     && sideCrash.mission.impact.kind === 'side-wall'
     && sideCrash.mission.impact.horizontalSpeed === 4,
     'side-wall crashes preserve pre-impact speed for the crash sound');
  let asteroidCrash = null;
  for (let seed = 0; seed < 20 && !asteroidCrash; seed++) {
    const candidate = SCENES.lunar({ ...missionState, seed, difficulty: 'hard' }).world;
    for (let i = 0; i < 3000 && candidate.mission.status === 'flying'; i++)
      candidate.step(candidate.DT);
    const asteroid = candidate.bodies.filter(body => body.tag === 'asteroid').slice(-1)[0];
    if (!asteroid) continue;
    candidate.mission.status = 'flying';
    candidate.mission.debrief = null;
    candidate.lander.pos.set(asteroid.pos.x, asteroid.pos.y);
    candidate.lander.vel.set(0, 0);
    candidate.step(candidate.DT);
    asteroidCrash = candidate;
  }
  ok(asteroidCrash && asteroidCrash.mission.status === 'crashed'
     && asteroidCrash.mission.impact.kind === 'asteroid',
     'asteroid contact crashes the lander');
  const floorAsteroid = new Body({
    pos: new Vec2(0, 0.1), vel: new Vec2(2, -3),
    mass: 350, radius: 0.2, tag: 'asteroid'
  });
  const floorHit = resolveWalls(floorAsteroid, {
    xmin: -10, xmax: 10, ymin: 0, ymax: 20
  }, 0.25);
  ok(floorHit && floorAsteroid.pos.y === 0.2
     && floorAsteroid.vel.y === 0,
     'asteroids stop at the ground instead of bouncing');
  const gradients = [];
  const drawContext = new Proxy({}, { get: (_, key) =>
    (key === 'createRadialGradient' || key === 'createLinearGradient')
      ? () => { gradients.push(key); return { addColorStop() {} }; }
      : () => {} });
  const renderer = new Renderer({ getContext: () => drawContext }, new Camera({ scale: 24 }));
  renderer.cam.resize(800, 600);
  renderer.showTrails = false;
  if (asteroidCrash) renderer.draw(asteroidCrash, { frameSeconds: 0 });
  const asteroidDustPuffs = gradients.filter(name => name === 'createRadialGradient').length;
  ok(asteroidDustPuffs === 32, 'asteroid impact emits dust around the lander',
     `${asteroidDustPuffs} impact particles`);
  const touchdownGradients = [];
  const touchdownContext = new Proxy({}, { get: (_, key) =>
    (key === 'createRadialGradient' || key === 'createLinearGradient')
      ? () => { touchdownGradients.push(key); return { addColorStop() {} }; }
      : () => {} });
  const touchdownRenderer = new Renderer({ getContext: () => touchdownContext }, new Camera({ scale: 24 }));
  touchdownRenderer.cam.resize(800, 600);
  touchdownRenderer.showTrails = false;
  touchdownRenderer.draw(fast, { frameSeconds: 0 });
  const dustPuffs = touchdownGradients.filter(name => name === 'createRadialGradient').length;
  ok(dustPuffs === 32, 'fast touchdown emits a one-shot dust burst',
     `${dustPuffs} fading particles`);
  touchdownRenderer.draw(safe, { frameSeconds: 0 });
  ok(touchdownGradients.filter(name => name === 'createRadialGradient').length === dustPuffs,
     'safe touchdown does not emit dust');
  const lateralFast = touchdown({ vx: 1.11, vy: -1 });
  ok(lateralFast.mission.status === 'crashed' && /speed was too high/.test(lateralFast.mission.message),
     'proposal lateral speed just above 1.1 m/s crashes');

  const tilted = touchdown({ vx: 0, angle: 16 });
  ok(tilted.mission.status === 'crashed' && /tilted/.test(tilted.mission.message),
     'proposal attitude just beyond 15 degrees crashes');
  touchdownRenderer.draw(missed, { frameSeconds: 0 });
  touchdownRenderer.draw(tilted, { frameSeconds: 0 });
  ok(touchdownGradients.filter(name => name === 'createRadialGradient').length === dustPuffs,
     'slow missed-pad and tilted crashes do not emit dust');

  const isolated = new World({ dt: ST.dt, integrator: 'verlet' });
  Body.resetIds();
  const testBody = isolated.add(new Body({
    pos: new Vec2(0, 12), vel: new Vec2(0, -6), mass: 1150, radius: 0.1
  }));
  isolated.addForce(new LanderDrive(testBody, { gravity: 1.62, dryMass: 1150 }));
  isolated.markReference();
  for (let i = 0; i < 60 / isolated.DT; i++) isolated.step(isolated.DT);
  const energyDrift = Math.abs(isolated.driftE());
  console.log(`         proposal free fall from y=12 m, vy=-6 m/s for 60 s: |dE/E0| = ${energyDrift.toExponential(3)}`);
  ok(energyDrift < 1e-8,
     'proposal unpowered free-fall energy stays within 1e-8 for 60 s',
     `|dE/E0|=${energyDrift.toExponential(3)}`);

  const convergenceRuns = [];
  for (const dt of [1 / 240, 1 / 480, 1 / 960]) {
    const world = SCENES.chain({ ...ST, dt, integrator: 'verlet' }).world;
    for (let i = 0; i < 10 / dt; i++) world.step(dt);
    convergenceRuns.push(snap(world));
  }
  const coarseToMedium = maxdiff(convergenceRuns[0], convergenceRuns[1]);
  const mediumToFine = maxdiff(convergenceRuns[1], convergenceRuns[2]);
  console.log(`         DT-halving spring chain: 1/240 vs 1/480 max difference=${coarseToMedium.toExponential(3)} m; ` +
              `1/480 vs 1/960=${mediumToFine.toExponential(3)} m`);
  ok(mediumToFine < coarseToMedium,
     'DT-halving reduces the position difference on a position-dependent spring',
     `differences: ${coarseToMedium.toExponential(3)}, ${mediumToFine.toExponential(3)} m`);

  const conservative = SCENES.lunar(ST).world;
  const fuelBeforeMode = conservative.landerDrive.fuel;
  conservative.landerDrive.thrusting = true;
  conservative.landerDrive.rotation = 1;
  setConservativeMode(conservative, true);
  conservative.lander.pos.set(0, 0.421);
  conservative.lander.vel.set(0, -1);
  conservative.step(conservative.DT);
  ok(conservative.conservativeMode && conservative.restitution === 1
     && conservative.energyMode === 'closed'
     && conservative.landerDrive.fuel === fuelBeforeMode
     && conservative.lander.angle === 0.28
     && conservative.mission.status === 'flying'
     && !conservative.lander.fixed,
     'conservative mode disables thrust and scripted landing, and uses elastic contacts');

  const conservativeAsteroid = SCENES.lunar({
    ...ST, seed: 2010346869
  }).world;
  setConservativeMode(conservativeAsteroid, true);
  conservativeAsteroid.add(new Body({
    pos: new Vec2(8, 15), vel: new Vec2(0, 0),
    mass: 350, radius: 0.2, tag: 'asteroid', fixed: true
  }));
  for (let i = 0; i < 1574; i++) conservativeAsteroid.step(conservativeAsteroid.DT);
  ok(conservativeAsteroid.bodies.some(body => body.tag === 'asteroid')
     && Math.abs(conservativeAsteroid.driftE()) < 1e-8,
     'conservative lunar energy excludes gravity-free asteroid potential',
     `|dE/E0|=${Math.abs(conservativeAsteroid.driftE()).toExponential(3)}`);
}

H('Lunar difficulty and trajectory prediction');
{
  const easy = SCENES.lunar({ ...ST, difficulty: 'easy' }).world;
  const normal = SCENES.lunar({ ...ST, difficulty: 'normal' }).world;
  const hard = SCENES.lunar({ ...ST, difficulty: 'hard' }).world;
  ok(easy.landerDrive.fuel === 45 && normal.landerDrive.fuel === 39
     && hard.landerDrive.fuel === 30
     && easy.mission.padHalfWidth > normal.mission.padHalfWidth
     && normal.mission.padHalfWidth > hard.mission.padHalfWidth
     && easy.mission.asteroidCount === 5
     && normal.mission.asteroidCount === 9
     && hard.mission.asteroidCount === 12,
     'difficulty changes fuel, pad width and asteroid availability');
  ok(hard.lander.pos.y - hard.lander.radius >= 15
     && hard.lander.pos.y - hard.lander.radius <= 18,
     'hard difficulty starts between 15 and 18 m altitude');
  ok(hard.mission.asteroidRnd && hard.mission.nextAsteroidAt > 0,
     'hard difficulty has a seeded asteroid launch schedule');
  let validGroups = true;
  for (let seed = 0; seed < 100; seed++) {
    for (const [difficulty, count] of [['easy', 5], ['normal', 9], ['hard', 12]]) {
      const world = SCENES.lunar({ ...ST, seed, difficulty }).world;
      validGroups &&= world.mission.asteroidCount === count
        && world.mission.asteroidChance === 1
        && world.lander.pos.y - world.lander.radius >= 10;
      const repeat = SCENES.lunar({ ...ST, seed, difficulty }).world;
      validGroups &&= maxdiff(snap(world), snap(repeat)) === 0;
    }
  }
  ok(validGroups, 'smaller asteroid groups are seeded, non-overlapping, and sized by difficulty');
  for (const [difficulty, count] of [['easy', 5], ['normal', 9]]) {
    const world = SCENES.lunar({ ...ST, seed: 2468, difficulty }).world;
    world.lander.pos.set(0, 19);
    world.lander.vel.set(0, 0);
    world.lander.fixed = true;
    world.lander.invMass = 0;
    for (let i = 0; i < 1440; i++) world.step(world.DT);
    ok(world.mission.asteroidLaunched === count && world.mission.status === 'flying',
       `${difficulty} launches its full asteroid wave while the mission is flying`);
  }

  const projectAndFly = (thrusting, fuel, angle) => {
    const world = SCENES.lunar({ ...ST, difficulty: 'easy' }).world;
    world.lander.pos.set(-1, 8);
    world.lander.vel.set(0.5, -2);
    world.lander.angle = angle;
    world.landerDrive.fuel = fuel;
    world.landerDrive._syncMassCharge();
    world.landerDrive.thrusting = thrusting;
    const before = [world.time, ...snap(world).flat(), world.landerDrive.fuel, world.lander.angle];
    const prediction = predictLanding(world);
    const unchanged = JSON.stringify(before) === JSON.stringify(
      [world.time, ...snap(world).flat(), world.landerDrive.fuel, world.lander.angle]);
    while (world.mission.status === 'flying' && world.time < 30) world.stepOnce();
    return { world, prediction, unchanged };
  };
  const coast = projectAndFly(false, 300, 0);
  const powered = projectAndFly(true, 5, 0.3);
  ok([coast, powered].every(({ world, prediction, unchanged }) =>
    unchanged && prediction.kind === 'floor'
      && Math.abs(prediction.position.x - world.lander.pos.x) < 0.03
      && Math.abs(prediction.time - world.time) < 0.03),
    'coasting and fuel-limited powered projections match actual ground contact without mutating the world');
  ok(Math.abs(powered.prediction.position.x - coast.prediction.position.x) > 0.01
     && powered.world.landerDrive.fuel === 0,
     'projection responds to angled thrust and accounts for fuel exhaustion');
  const wall = SCENES.lunar({ ...ST, difficulty: 'easy' }).world;
  wall.lander.pos.set(9, 10); wall.lander.vel.set(4, 0);
  ok(predictLanding(wall).kind === 'wall',
     'wall impact is reported instead of a misleading ground landing');
  const ceiling = SCENES.lunar({ ...ST, difficulty: 'easy' }).world;
  ceiling.lander.pos.set(0, 17); ceiling.lander.vel.set(0, 4);
  ok(predictLanding(ceiling).kind === 'ceiling',
     'ceiling impact is reported instead of a misleading ground landing');
  const noContact = SCENES.lunar({ ...ST, difficulty: 'easy' }).world;
  noContact.lander.pos.set(0, 5); noContact.lander.vel.set(0, 0);
  noContact.landerDrive.g = 0;
  ok(predictLanding(noContact).kind === 'none',
     'a flight with no contact within the horizon has no landing marker');
  wall.mission.status = 'crashed';
  ok(predictLanding(wall) === null && predictLanding(SCENES.chain(ST).world) === null,
     'prediction is hidden after a mission or in another scene');
}

// --------------------------------------------------------------- 15
H('15. CSV export');
{
  const csv = serializeSamples([
    { time: 0, bodies: [{ id: 1, x: -1, y: 2 }],
      kinetic: 0, mechanical: 3, energy: 3, energyChangePct: 0, charge: 62, missionStatus: 'flying' },
    { time: 0.1, bodies: [{ id: 1, x: -0.5, y: 1.8 }, { id: 2, x: 4, y: 5 }],
      kinetic: 2, mechanical: 4, energy: 4, energyChangePct: 0.1, charge: 61, missionStatus: 'safe, flying' }
  ]);
  const [header, firstRow, secondRow] = csv.trimEnd().split('\r\n');
  ok(header.startsWith('t_s,body_1_id,body_1_x_m,body_1_y_m') &&
     header.includes('body_2_x_m') && header.endsWith('mission_status'),
     'CSV includes time, positions, diagnostics and resource/game state');
  ok(splitCSV(firstRow).length === splitCSV(header).length &&
     splitCSV(secondRow).length === splitCSV(header).length &&
     secondRow.endsWith('"safe, flying"'),
     'CSV rows keep a stable shape and quote comma-containing values');
}

console.log(`\n${'='.repeat(58)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(58)}`);
process.exit(fail ? 1 : 0);
