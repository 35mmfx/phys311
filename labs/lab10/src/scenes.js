// scenes.js — every scene is a pure function (state) -> World.
// Deterministic by construction: the RNG is seeded from the state, so
// "Reset" reproduces the identical run and a permalink reproduces it on
// someone else's machine. (Math.random() here would break both.)
import { World, Body, Vec2 } from './engine/World.js';
import { UniformGravity, QuadraticDrag, Spring, NewtonGravity, PointerSpring }
  from './engine/Forces.js';

function mulberry32(seed) {                 // 8-line deterministic PRNG
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ['#ff8200', '#58a6ff', '#7ee787', '#f778ba', '#ffd866', '#c792ea'];

function base(state, opts) {
  const w = new World({
    dt: state.dt, integrator: state.integrator,
    restitution: state.restitution, ...opts
  });
  return w;
}

function attachCommon(w, state, { gravity = true } = {}) {
  if (gravity) w.addForce(new UniformGravity(state.gravity));
  w.addForce(new QuadraticDrag(state.drag));
  const ps = new PointerSpring();
  w.addForce(ps);                           // input, as a force, like any other
  w.pointer = ps;
  return w;
}

export const SCENES = {

  // 1. Billiards: collisions in a box. Walls are external -> momentum breaks.
  billiards(state) {
    Body.resetIds();
    const bounds = { xmin: -6, xmax: 6, ymin: -4, ymax: 4 };
    const w = base(state, { bounds, useHash: state.count > 40, cell: 1.0 });
    const rnd = mulberry32(1234);
    for (let i = 0; i < state.count; i++) {
      w.add(new Body({
        pos: new Vec2(-5.2 + rnd() * 10.4, -3.2 + rnd() * 6.4),
        vel: new Vec2((rnd() - 0.5) * 7, (rnd() - 0.5) * 7),
        mass: 1, radius: 0.26, color: PALETTE[i % PALETTE.length]
      }));
    }
    attachCommon(w, state, { gravity: false });
    w.momentumConserved = false;          // the walls are an external force
    w.markReference();
    return { world: w, view: [-6.5, 6.5, -4.5, 4.5] };
  },

  // 2. Spring chain: position-dependent force -> integrators finally separate.
  chain(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(3, Math.min(14, state.count));
    const anchor = w.add(new Body({ pos: new Vec2(-3, 3), fixed: true,
                                    radius: 0.18, color: '#888' }));
    let prev = anchor;
    for (let i = 1; i <= n; i++) {
      const b = w.add(new Body({ pos: new Vec2(-3 + i * 0.75, 3), mass: 1,
                                 radius: 0.18, color: PALETTE[i % PALETTE.length] }));
      w.addForce(new Spring(prev, b, 90, 0.75, 0));
      prev = b;
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-6, 6, -5, 4.5] };
  },

  // 3. Orbits: pure N-body, no walls -> momentum must hold to machine zero.
  orbits(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const sun = w.add(new Body({ pos: new Vec2(0, 0), mass: 400, radius: 0.5,
                                 color: '#ffd866', tag: 'sun' }));
    const rnd = mulberry32(99);
    const n = Math.max(1, Math.min(12, Math.round(state.count / 4)));
    for (let i = 0; i < n; i++) {
      const r = 2 + i * 0.9 + rnd() * 0.2;
      const v = Math.sqrt(400 / r);
      w.add(new Body({ pos: new Vec2(r, 0), vel: new Vec2(0, v), mass: 1,
                       radius: 0.16, color: PALETTE[i % PALETTE.length] }));
    }
    // Remove net drift so the barycentre stays put and p0 is exactly zero.
    let px = 0, py = 0, M = 0;
    for (const b of w.bodies) { px += b.mass * b.vel.x; py += b.mass * b.vel.y; M += b.mass; }
    for (const b of w.bodies) { b.vel.x -= px / M; b.vel.y -= py / M; }
    w.addForce(new NewtonGravity(1.0, 0.05));
    attachCommon(w, state, { gravity: false });
    w.momentumConserved = true;           // isolated: must hold to ~1e-15
    w.markReference();
    return { world: w, view: [-13, 13, -9, 9] };
  },

  // 4. Projectile: the control case. Change integrators here and NOTHING
  //    happens -- constant force is degenerate (Week 2, section 5.5).
  projectile(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(1, Math.min(9, Math.round(state.count / 3)));
    for (let i = 0; i < n; i++) {
      const th = (15 + i * (60 / Math.max(1, n - 1 || 1))) * Math.PI / 180;
      w.add(new Body({ pos: new Vec2(-10, -4),
                       vel: new Vec2(18 * Math.cos(th), 18 * Math.sin(th)),
                       mass: 1, radius: 0.22, color: PALETTE[i % PALETTE.length] }));
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-11, 25, -5, 12] };
  },

  // 5. Pendulum grid: easy to grab, obvious when you inject energy by dragging.
  pendulums(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(2, Math.min(10, Math.round(state.count / 3)));
    for (let i = 0; i < n; i++) {
      const x = -4.5 + i * (9 / Math.max(1, n - 1));
      const top = w.add(new Body({ pos: new Vec2(x, 3.5), fixed: true,
                                   radius: 0.12, color: '#888' }));
      const L = 1.6 + i * 0.22;
      const bob = w.add(new Body({ pos: new Vec2(x + L * Math.sin(0.5),
                                                 3.5 - L * Math.cos(0.5)),
                                   mass: 1, radius: 0.24,
                                   color: PALETTE[i % PALETTE.length] }));
      w.addForce(new Spring(top, bob, 2500, L, 0));   // stiff spring ~ rigid rod
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-6.5, 6.5, -2.5, 4.5] };
  }
};

export const SCENE_LIST = [
  ['billiards',  'Billiards in a box'],
  ['chain',      'Spring chain'],
  ['orbits',     'N-body orbits'],
  ['projectile', 'Projectile (control case)'],
  ['pendulums',  'Pendulum row']
];

export { mulberry32 };
