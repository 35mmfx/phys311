// scenes/scenes.js -- a scene is a pure function that returns a fresh World.
// No scene touches the canvas. That is what makes every one of them
// runnable headlessly in tests/validate.js.

import { Body } from '../engine/Body.js';
import { vec } from '../engine/Vec2.js';
import { World } from '../engine/World.js';
import { UniformGravity, NewtonGravity, Spring, QuadraticDrag } from '../engine/Forces.js';
import { BoxBounds } from '../engine/Collision.js';
import { EulerCromer, VelocityVerlet } from '../engine/Integrators.js';

const PALETTE = ['#ff8200', '#4ec9f5', '#8ad67b', '#f55d8b',
                 '#c792ea', '#ffd166', '#6ee7b7', '#fb7185'];

/* ----------------------------------------------------- 1. projectile */
export function projectile() {
  const w = new World({ integrator: new VelocityVerlet() });
  const speed = 25, deg = 45;
  w.add(new Body({
    pos: vec(-20, 0.2),
    vel: vec(speed * Math.cos(deg * Math.PI / 180),
             speed * Math.sin(deg * Math.PI / 180)),
    mass: 1, radius: 0.35, color: PALETTE[0], name: 'ball'
  }));
  w.addForce(new UniformGravity(9.81, 0));
  w.view = { xmin: -25, ymin: -2, xmax: 50, ymax: 22 };
  w.note = 'Range should be 63.71 m (Week 1). Verlet is EXACT here: '
         + 'constant force means no truncation error, so this scene cannot '
         + 'tell the integrators apart. Use the orbit or the chain for that.';
  return w;
}

/* ------------------------------------------------- 2. collisions in a box */
export function collisionBox({ n = 14, e = 1.0, seed = 7, walls = true, spread = null } = {}) {
  const rnd = mulberry32(seed);
  const w = new World({ integrator: new EulerCromer() });
  const L = 9;
  const S = spread !== null ? spread : L - 1;
  for (let i = 0; i < n; i++) {
    w.add(new Body({
      pos: vec((rnd() - 0.5) * 2 * S, (rnd() - 0.5) * 2 * S),
      vel: vec((rnd() - 0.5) * 8, (rnd() - 0.5) * 8),
      mass: 1, radius: 0.5, restitution: e,
      color: PALETTE[i % PALETTE.length], name: 'b' + i
    }));
  }
  if (walls) w.bounds = new BoxBounds(-L, -L, L, L, e);
  w.view = { xmin: -L - 1, ymin: -L - 1, xmax: L + 1, ymax: L + 1 };
  w.note = walls
    ? 'Walls ON: momentum is NOT conserved (a wall is an external force), '
      + 'but at e = 1 energy still is -- a wall flips a sign and does no work.'
    : 'Walls OFF: isolated system. |dp|/|p0| must stay at ~1e-16 for every e.';
  return w;
}

/* ------------------------------------------------- 3. figure-eight 3-body */
export function figureEight() {
  // Chenciner-Montgomery choreography. G = m = 1, period T = 6.32591398.
  const w = new World({ integrator: new VelocityVerlet() });
  const v = vec(0.93240737, 0.86473146);
  w.add(
    new Body({ pos: vec(-0.97000436,  0.24308753), vel: v.scale(0.5),  mass: 1, radius: 0.045, color: PALETTE[0], name: 'A' }),
    new Body({ pos: vec( 0.97000436, -0.24308753), vel: v.scale(0.5),  mass: 1, radius: 0.045, color: PALETTE[1], name: 'B' }),
    new Body({ pos: vec( 0,           0         ), vel: v.scale(-1),   mass: 1, radius: 0.045, color: PALETTE[2], name: 'C' })
  );
  w.addForce(new NewtonGravity(1, 0));
  w.view = { xmin: -1.4, ymin: -0.6, xmax: 1.4, ymax: 0.6 };
  w.period = 6.32591398;
  w.note = 'Eleven lines of scene setup, zero new engine code. Momentum stays '
         + 'at machine zero because NewtonGravity applies +F and -F on '
         + 'consecutive lines -- a structural guarantee, not a check.';
  return w;
}

/* ------------------------------------------------- 4. coupled spring chain */
export function springChain({ n = 6, k = 40 } = {}) {
  const w = new World({ integrator: new VelocityVerlet() });
  const a = 1.0;
  const bodies = [];
  for (let i = 0; i < n; i++) {
    bodies.push(new Body({
      pos: vec((i - (n - 1) / 2) * a, 0),
      mass: 1, radius: 0.18, fixed: (i === 0 || i === n - 1),
      color: (i === 0 || i === n - 1) ? '#8892a6' : PALETTE[i % PALETTE.length],
      name: 'm' + i
    }));
  }
  bodies[Math.floor(n / 2)].pos.y = 0.9;          // pluck
  w.add(...bodies);
  for (let i = 0; i < n - 1; i++)
    w.addForce(new Spring(bodies[i], bodies[i + 1], k, a, 0));
  w.view = { xmin: -n / 2 - 1, ymin: -2, xmax: n / 2 + 1, ymax: 2 };
  w.note = 'Conservative: dE/E0 should stay below ~1e-5 with Verlet and '
         + 'grow without bound with Euler. THIS is the scene that separates '
         + 'the integrators, because the force depends on position.';
  return w;
}

/* --------------------------------------- 5. crowd, for broad-phase profiling */
export function crowd({ n = 250, seed = 3 } = {}) {
  const rnd = mulberry32(seed);
  const w = new World({ integrator: new EulerCromer(), broadPhase: 'hash' });
  const L = 16;
  for (let i = 0; i < n; i++) {
    w.add(new Body({
      pos: vec((rnd() - 0.5) * 2 * (L - 0.6), (rnd() - 0.5) * 2 * (L - 0.6)),
      vel: vec((rnd() - 0.5) * 6, (rnd() - 0.5) * 6),
      mass: 1, radius: 0.22, restitution: 1.0,
      color: PALETTE[i % PALETTE.length]
    }));
  }
  w.bounds = new BoxBounds(-L, -L, L, L, 1.0);
  w.view = { xmin: -L - 1, ymin: -L - 1, xmax: L + 1, ymax: L + 1 };
  w.note = 'Toggle the broad phase and watch "pair checks" in the HUD. '
         + 'Brute force is N(N-1)/2 = 31125 for N = 250; the spatial hash '
         + 'is roughly linear. The PHYSICS must be identical either way.';
  return w;
}

/* --------------------------------------------- deterministic PRNG (seeded) */
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const SCENES = {
  projectile:   { label: '1 - Projectile (sanity check)',        make: () => projectile() },
  collisions:   { label: '2 - Collisions in a box (14 discs)',   make: () => collisionBox({ n: 14, e: 1.0 }) },
  inelastic:    { label: '3 - Same box, e = 0.8',                make: () => collisionBox({ n: 14, e: 0.8 }) },
  isolated:     { label: '4 - Isolated collisions (no walls)',   make: () => collisionBox({ n: 10, e: 0.9, walls: false, spread: 2.6 }) },
  figureEight:  { label: '5 - Figure-eight 3-body choreography', make: () => figureEight() },
  springChain:  { label: '6 - Coupled spring chain',             make: () => springChain({ n: 6 }) },
  crowd:        { label: '7 - 250-body crowd (broad phase)',     make: () => crowd({ n: 250 }) }
};
