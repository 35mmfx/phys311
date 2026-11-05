// World.js — owns bodies, forces, the integrator, and the fixed-timestep clock.
// Contains NO reference to canvas, ctx, document, window, or pixels.
import { Vec2 } from './Vec2.js';
import { Body } from './Body.js';
import { INTEGRATORS, Verlet } from './Integrators.js';
import { resolvePair, resolveWalls, SpatialHash } from './Collisions.js';

export class World {
  constructor({ dt = 1 / 240, integrator = 'verlet', restitution = 1.0,
                bounds = null, useHash = false, cell = 1.0 } = {}) {
    this.DT          = dt;               // fixed physics timestep
    this.integrator  = INTEGRATORS[integrator] || Verlet;
    this.restitution = restitution;
    this.bounds      = bounds;           // null = unbounded (isolated system)
    this.useHash     = useHash;
    this.hash        = new SpatialHash(cell);

    this.bodies  = [];
    this.forces  = [];
    this.time    = 0;
    this.steps   = 0;
    this.collisions = 0;
    this.wallHits   = 0;
    this.dissipated = 0;                 // energy removed by drag, cumulative
    this.inelastic  = 0;                 // energy removed by e<1 impacts, cumulative
    this._acc    = 0;                    // leftover accumulator time
    // Is this an ISOLATED system? Only then must total momentum be conserved.
    // Walls, uniform gravity and the pointer spring are all EXTERNAL.
    this.momentumConserved = false;
    this._E0     = null;                 // reference energy, set ONCE
  }

  add(body)        { this.bodies.push(body); return body; }
  addForce(f)      { this.forces.push(f);    return f; }
  find(tag)        { return this.bodies.find(b => b.tag === tag); }
  setIntegrator(n) { this.integrator = INTEGRATORS[n] || this.integrator; }

  accumulateForces() {
    for (const b of this.bodies) b.clearForce();
    for (const f of this.forces) f.apply(this.bodies, this.time);
  }

  step(dt) {
    const drag = this.forces.find(f => f instanceof Object && typeof f.dissipation === 'function');
    if (drag) this.dissipated += drag.dissipation(this.bodies) * dt;

    this.integrator.step(this, dt);

    // Energy ledger: an inelastic impact removes REAL energy. Book it, so the
    // HUD's drift readout measures the INTEGRATOR and not the physics. Without
    // this, e = 0.95 looks identical to a broken solver.
    const Ebefore = this.kinetic() + this.potential();

    const pairs = this.useHash
      ? this.hash.candidatePairs(this.bodies)
      : allPairs(this.bodies);
    for (const [a, b] of pairs)
      if (resolvePair(a, b, this.restitution)) this.collisions++;

    if (this.bounds)
      for (const b of this.bodies)
        if (resolveWalls(b, this.bounds, this.restitution)) this.wallHits++;

    this.inelastic += Ebefore - (this.kinetic() + this.potential());

    this.time  += dt;
    this.steps += 1;
  }

  // Fixed-timestep accumulator. Returns alpha in [0,1) for render interpolation.
  advance(frameSeconds, maxSteps = 8) {
    this._acc += Math.min(frameSeconds, maxSteps * this.DT);  // clamp: no spiral of death
    let n = 0;
    while (this._acc >= this.DT && n < maxSteps) {
      this.step(this.DT);
      this._acc -= this.DT;
      n++;
    }
    return { substeps: n, alpha: this._acc / this.DT };
  }

  // One deterministic substep, for the Step button while paused.
  stepOnce() { this.step(this.DT); return 1; }

  kinetic()   { return this.bodies.reduce((s, b) => s + b.kinetic(), 0); }
  potential() { return this.forces.reduce((s, f) =>
                  s + (typeof f.energy === 'function' ? f.energy(this.bodies) : 0), 0); }
  energy()    { return this.kinetic() + this.potential()
                     + this.dissipated + this.inelastic; }
  mechanical(){ return this.kinetic() + this.potential(); }
  momentum()  { return this.bodies.reduce((p, b) => p.add(b.momentum()), Vec2.zero()); }

  markReference() { this._E0 = this.energy(); this._p0 = this.momentum(); }
  get E0() { return this._E0; }
  get p0() { return this._p0 || Vec2.zero(); }

  driftE() {
    if (this._E0 === null || Math.abs(this._E0) < 1e-12) return 0;
    return (this.energy() - this._E0) / Math.abs(this._E0);
  }
  driftP() {
    const p0 = this.p0.len();
    if (p0 < 1e-12) return this.momentum().len();
    return this.momentum().sub(this.p0).len() / p0;
  }

  // Pick the nearest body whose disc contains (x,y). Pure geometry: the UI
  // layer converts pixels to world coordinates before calling this.
  pick(x, y, slack = 0.0) {
    let best = null, bestD = Infinity;
    for (const b of this.bodies) {
      const d = Math.hypot(b.pos.x - x, b.pos.y - y);
      if (d <= b.radius + slack && d < bestD) { best = b; bestD = d; }
    }
    return best;
  }
}

function allPairs(bodies) {
  const out = [];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) out.push([bodies[i], bodies[j]]);
  return out;
}

export { Body, Vec2 };
