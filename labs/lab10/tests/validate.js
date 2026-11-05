// validate.js — headless validation. Run:  node tests/validate.js
// Everything here runs in plain Node with NO browser, which is only possible
// because engine/ never touches the DOM. That is the Week 9 layering rule
// paying its final dividend.
import { World, Body, Vec2 } from '../src/engine/World.js';
import { UniformGravity, Spring, NewtonGravity, PointerSpring, LanderDrive } from '../src/engine/Forces.js';
import { Camera }   from '../src/render/Camera.js';
import { StateURL } from '../src/ui/StateURL.js';
import { eventToWorld, slingshotVelocity } from '../input.js';
import { SCENES }   from '../src/scenes.js';
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
             gravity:9.81, drag:0, speed:1, count:24 };
const snap = w => w.bodies.map(b => [b.pos.x, b.pos.y, b.vel.x, b.vel.y]);
const maxdiff = (A, B) => Math.max(...A.flat().map((v, i) => Math.abs(v - B.flat()[i])));

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
  const code = readFileSync(join(ROOT, 'src/scenes.js'), 'utf8')
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
              gravity:3.71, drag:0.012, speed:1.45, count:57 };
  const back = StateURL.decode(StateURL.encode(s), ST);
  const same = Object.keys(s).every(k => Math.abs((back[k] ?? 0) - s[k]) < 1e-9 || back[k] === s[k]);
  ok(same, 'every control survives the URL hash', StateURL.encode(s).slice(0, 72) + '...');
  const partial = StateURL.decode('#scene=chain&int=verlet', ST);
  ok(partial.scene === 'chain' && partial.dt === ST.dt,
     'a hand-edited or truncated hash falls back to defaults, no crash');
  const clamped = StateURL.decode(
    '#dt=1&g=100&e=-1&drag=3&speed=0&n=900',
    ST
  );
  ok(clamped.dt === 0.02 && clamped.gravity === 25 && clamped.restitution === 0
     && clamped.drag === 0.2 && clamped.speed === 0.25 && clamped.count === 120,
     'permalink parameters are clamped to the slider ranges');
}

// ---------------------------------------------------------------- 9
H('9. Layering audit: both engine copies are free of DOM and event APIs');
{
  const bad = [];
  const forbidden = /\b(?:document|window|canvas|ctx|event|pointerevent|mouseevent|keyboardevent|htmlelement|htmlcanvaselement|element|node)\b|addEventListener|removeEventListener|getContext|querySelector|\bon(?:click|input|change|pointer\w*|key\w*)\b/i;
  for (const dir of ['engine', 'src/engine']) {
    for (const f of readdirSync(join(ROOT, dir)).filter(name => name.endsWith('.js'))) {
      const source = readFileSync(join(ROOT, dir, f), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      const match = code.match(forbidden);
      if (match) bad.push(`${dir}/${f}: ${match[0]}`);
    }
  }
  ok(bad.length === 0, 'no DOM or event APIs in either engine/',
     bad.join(', ') || 'engine/ and src/engine/ are clean');
}

// --------------------------------------------------------------- 10
H('10. Publishing audit: safe for GitHub Pages');
{
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const abs = [...html.matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map(m => m[1]);
  ok(abs.length === 0, 'no absolute paths (they break on a project-page subpath)',
     abs.join(', ') || 'all relative');

  const refs = [...html.matchAll(/(?:src|href)="([^":#]+)"/g)].map(m => m[1]);
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
H('14. Lunar lander: steer, recharge, and classify touchdown');
{
  const { world } = SCENES.lunar(ST);
  const { lander, landerDrive: drive, mission } = world;
  ok(lander.tag === 'lander' && drive instanceof LanderDrive && mission.status === 'flying',
     'lunar scene builds one controllable lander with an active mission');

  const reserve = drive.charge;
  drive.thrusting = true;
  for (let i = 0; i < 120; i++) world.step(world.DT);
  ok(drive.charge < reserve && lander.vel.y > -1.8,
     'powered thrust consumes reserve and slows the initial descent',
     `reserve ${reserve.toFixed(1)}% -> ${drive.charge.toFixed(1)}%, vy=${lander.vel.y.toFixed(2)} m/s`);

  drive.thrusting = false;
  drive.rotation = 0;
  drive.charge = 95;
  for (let i = 0; i < 120; i++) world.step(world.DT);
  ok(drive.charge > 95 && drive.charge <= drive.maxCharge,
     'solar alignment recharges the propulsion reserve without exceeding capacity',
     `reserve=${drive.charge.toFixed(1)}%`);

  const safe = SCENES.lunar(ST).world;
  safe.lander.pos.set(0, safe.lander.radius + 0.001);
  safe.lander.vel.set(0.4, -1.2);
  safe.lander.angle = 0;
  safe.step(safe.DT);
  ok(safe.mission.status === 'landed' && safe.lander.fixed && safe.lander.vel.len2() === 0,
     'upright, low-speed contact inside the pad is a successful landing',
     safe.mission.message);

  const missed = SCENES.lunar(ST).world;
  missed.lander.pos.set(4, missed.lander.radius + 0.001);
  missed.lander.vel.set(0, -1);
  missed.step(missed.DT);
  ok(missed.mission.status === 'crashed' && /missed the landing pad/.test(missed.mission.message),
     'a soft touchdown outside the pad is a crash');

  const fast = SCENES.lunar(ST).world;
  fast.lander.pos.set(0, fast.lander.radius + 0.001);
  fast.lander.vel.set(0, -3);
  fast.lander.angle = 0;
  fast.lander.angle = 0;
  fast.step(fast.DT);
  ok(fast.mission.status === 'crashed' && /speed was too high/.test(fast.mission.message),
     'a high-speed touchdown on the pad is a crash');

  const isolated = new World({ dt: ST.dt, integrator: 'verlet' });
  Body.resetIds();
  const testBody = isolated.add(new Body({
    pos: new Vec2(0, 10000), vel: new Vec2(2, -3), mass: 1, radius: 0.1
  }));
  isolated.addForce(new LanderDrive(testBody));
  isolated.markReference();
  for (let i = 0; i < 60 / isolated.DT; i++) isolated.step(isolated.DT);
  const energyDrift = Math.abs(isolated.driftE());
  console.log(`         unpowered 60 s lunar free fall: |dE/E0| = ${energyDrift.toExponential(3)}`);
  ok(energyDrift < 1e-8,
     'closed-system lunar free fall keeps mechanical energy within 1e-8 over 60 s',
     `|dE/E0|=${energyDrift.toExponential(3)}`);
}

console.log(`\n${'='.repeat(58)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(58)}`);
process.exit(fail ? 1 : 0);
