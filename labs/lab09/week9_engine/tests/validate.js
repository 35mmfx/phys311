// tests/validate.js -- headless validation. Runs in Node AND in the browser.
//
//   node tests/validate.js         (from the project root)
//
// This file is the payoff for the layering rule. Because engine/ and
// scenes/ never mention the DOM, the exact same code that draws your
// simulation can be run with no canvas at all -- which is what makes a
// convergence study possible.

import { World } from '../engine/World.js';
import { Body } from '../engine/Body.js';
import { vec } from '../engine/Vec2.js';
import { UniformGravity, NewtonGravity, Spring } from '../engine/Forces.js';
import { Euler, EulerCromer, VelocityVerlet } from '../engine/Integrators.js';
import { bruteForcePairs, SpatialHash, resolveContact } from '../engine/Collision.js';
import { collisionBox, figureEight, springChain, crowd } from '../scenes/scenes.js';

const results = [];
const log = [];
function out(s) { log.push(s); if (typeof window === 'undefined') console.log(s); }
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  out(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${detail}`);
}

function run(world, dt, T) {
  world.captureBaseline();
  const n = Math.round(T / dt);
  for (let i = 0; i < n; i++) world.step(dt);
  return world;
}

export function validate() {
  results.length = 0; log.length = 0;
  out('='.repeat(78));
  out('WEEK 9 ENGINE -- HEADLESS VALIDATION');
  out('='.repeat(78));

  /* --- 1. projectile range: the Week 1 answer key ---------------------- */
  out('\n[1] Projectile range, v0 = 25 m/s at 45 deg, Verlet, dt = 1e-4');
  {
    const w = new World({ integrator: new VelocityVerlet() });
    const th = Math.PI / 4;
    w.add(new Body({ pos: vec(0, 0), vel: vec(25 * Math.cos(th), 25 * Math.sin(th)) }));
    w.addForce(new UniformGravity(9.81, 0));
    const dt = 1e-4;
    let prev = null, range = null;
    for (let i = 0; i < 100000; i++) {
      prev = { x: w.bodies[0].pos.x, y: w.bodies[0].pos.y };
      w.step(dt);
      const p = w.bodies[0].pos;
      if (p.y < 0) {                       // interpolate to y = 0
        const f = prev.y / (prev.y - p.y);
        range = prev.x + f * (p.x - prev.x);
        break;
      }
    }
    const exact = 25 ** 2 * Math.sin(2 * th) / 9.81;
    out(`    numerical = ${range.toFixed(6)} m   exact = ${exact.toFixed(6)} m`);
    check('projectile range matches theory', Math.abs(range - exact) < 1e-3,
          `|err| = ${Math.abs(range - exact).toExponential(2)} m`);
  }

  /* --- 2. integrators on a SPRING (not a projectile) ------------------- */
  out('\n[2] Spring, 10 periods, dt = 0.01: max |dE|/E0');
  out('    (a projectile cannot separate these -- see Week 2 section 5.5)');
  {
    const k = 10, m = 1, T = 2 * Math.PI * Math.sqrt(m / k);
    const rows = [];
    for (const I of [Euler, EulerCromer, VelocityVerlet]) {
      const w = new World({ integrator: new I() });
      const a = new Body({ pos: vec(0, 0), mass: 1e9, fixed: true, radius: 0.01 });
      const b = new Body({ pos: vec(1, 0), mass: m, radius: 0.01 });
      w.add(a, b);
      w.addForce(new Spring(a, b, k, 0, 0));
      w.captureBaseline();
      let worst = 0;
      const n = Math.round(10 * T / 0.01);
      for (let i = 0; i < n; i++) { w.step(0.01); worst = Math.max(worst, Math.abs(w.drift().dE)); }
      rows.push([I.label, worst]);
      out(`    ${I.label.padEnd(38)} ${worst.toExponential(3)}`);
    }
    check('Verlet beats Euler-Cromer beats Euler', rows[2][1] < rows[1][1] && rows[1][1] < rows[0][1],
          `${rows[0][1].toExponential(2)} > ${rows[1][1].toExponential(2)} > ${rows[2][1].toExponential(2)}`);
  }

  /* --- 3. Verlet is 2nd order ------------------------------------------ */
  out('\n[3] Verlet convergence on the spring chain (error ratio should be ~4)');
  {
    const ref = (dt) => {
      const w = springChain({ n: 6, k: 40 });
      run(w, dt, 2.0);
      return w.bodies[3].pos.y;
    };
    const fine = ref(1e-5);
    const e1 = Math.abs(ref(4e-3) - fine);
    const e2 = Math.abs(ref(2e-3) - fine);
    const e3 = Math.abs(ref(1e-3) - fine);
    out(`    dt=4e-3 err=${e1.toExponential(3)}`);
    out(`    dt=2e-3 err=${e2.toExponential(3)}  ratio=${(e1 / e2).toFixed(2)}`);
    out(`    dt=1e-3 err=${e3.toExponential(3)}  ratio=${(e2 / e3).toFixed(2)}`);
    check('Verlet is second order', Math.abs(e2 / e3 - 4) < 0.6,
          `ratio = ${(e2 / e3).toFixed(3)} (expect 4.00)`);
  }

  /* --- 4. isolated collisions conserve momentum exactly ---------------- */
  out('\n[4] Isolated collisions (walls off): |dp|/|p0| for several e');
  {
    let worst = 0;
    for (const e of [1.0, 0.9, 0.5, 0.0]) {
      const w = collisionBox({ n: 10, e, seed: 7, walls: false, spread: 2.6 });
      run(w, 0.002, 12);
      const d = w.drift();
      worst = Math.max(worst, Math.abs(d.dp));
      out(`    e = ${e.toFixed(1)}   |dp|/|p0| = ${d.dp.toExponential(2)}` +
          `   KE kept = ${(100 * w.kineticEnergy() / w.baseline.E).toFixed(2)} %` +
          `   collisions = ${w.collisionCount}`);
    }
    check('momentum conserved to machine precision', worst < 1e-12,
          `worst = ${worst.toExponential(2)}`);
  }

  /* --- 5. elastic box: walls break p but not E ------------------------- */
  out('\n[5] Box with walls, e = 1: energy kept, momentum NOT');
  {
    const w = collisionBox({ n: 14, e: 1.0, seed: 7, walls: true });
    run(w, 0.002, 10);
    const d = w.drift();
    out(`    dE/E0 = ${(100 * d.dE).toFixed(6)} %   |dp|/|p0| = ${d.dp.toExponential(2)}`);
    out(`    wall hits = ${w.bounds.hits}   pair collisions = ${w.collisionCount}`);
    check('elastic walls do no work', Math.abs(d.dE) < 1e-10,
          `dE/E0 = ${d.dE.toExponential(2)}`);
  }

  /* --- 6. figure-eight choreography ------------------------------------ */
  out('\n[6] Figure-eight, 4 periods, Verlet, dt = 1e-4');
  {
    const w = figureEight();
    const r0 = w.bodies.map(b => b.pos.clone());
    run(w, 1e-4, 4 * w.period);
    const d = w.drift();
    const back = Math.max(...w.bodies.map((b, i) => b.pos.sub(r0[i]).len()));
    out(`    dE/E0 = ${d.dE.toExponential(3)}   |p| = ${w.momentum().len().toExponential(2)}`);
    out(`    dL/L0 = ${d.dL.toExponential(3)}   max return error = ${back.toExponential(3)}`);
    check('figure-eight closes and conserves', Math.abs(d.dE) < 1e-6 && back < 1e-2,
          `dE = ${d.dE.toExponential(2)}, return = ${back.toExponential(2)}`);
  }

  /* --- 7. broad phase must not change the physics ---------------------- */
  out('\n[7] Brute force vs spatial hash: same physics, different cost');
  {
    const mk = (bp) => { const w = crowd({ n: 120, seed: 3 }); w.broadPhase = bp; return w; };
    const wb = mk('brute'), wh = mk('hash');
    run(wb, 0.004, 3); run(wh, 0.004, 3);
    const diff = Math.max(...wb.bodies.map((b, i) => b.pos.sub(wh.bodies[i].pos).len()));
    out(`    brute: ${wb.stats.checks} checks/step, ${wb.collisionCount} collisions`);
    out(`    hash : ${wh.stats.checks} checks/step, ${wh.collisionCount} collisions`);
    out(`    max position difference = ${diff.toExponential(3)}`);
    check('broad phase is physics-neutral', diff < 1e-9,
          `max |dr| = ${diff.toExponential(2)}`);
    check('hash does fewer checks than brute', wh.stats.checks < wb.stats.checks / 4,
          `${wh.stats.checks} vs ${wb.stats.checks}`);
  }

  /* --- 8. the separating guard ----------------------------------------- */
  out('\n[8] Sticky-pair guard: overlapping but separating pair');
  {
    const a = new Body({ pos: vec(0, 0),    vel: vec(-1, 0), radius: 0.5 });
    const b = new Body({ pos: vec(0.9, 0),  vel: vec( 1, 0), radius: 0.5 });
    const applied = resolveContact(a, b);
    out(`    impulse applied = ${applied} (must be false: they are separating)`);
    check('separating pair is not re-resolved', applied === false, 'guard works');
  }

  const passed = results.filter(r => r.ok).length;
  out('\n' + '='.repeat(78));
  out(`${passed} / ${results.length} checks passed`);
  out('='.repeat(78));
  return { results, text: log.join('\n'), passed, total: results.length };
}

if (typeof window === 'undefined') {
  const { passed, total } = validate();
  process.exit(passed === total ? 0 : 1);
}
