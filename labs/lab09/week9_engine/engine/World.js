// engine/World.js -- owns bodies, forces, boundaries, integrator, diagnostics.
//
// THE LAYERING RULE (Week 9): nothing in engine/ may mention
//   ctx, canvas, document, window, requestAnimationFrame, or a colour.
// If this file stays clean, the same code runs in Node for your convergence
// study, in a Web Worker, and in the browser. Break the rule and the
// headless validation in tests/ becomes impossible to write.

import { Vec2, vec } from './Vec2.js';
import { EulerCromer } from './Integrators.js';
import { bruteForcePairs, SpatialHash, resolveContact } from './Collision.js';

export class World {
  constructor({ integrator = new EulerCromer(), broadPhase = 'brute' } = {}) {
    this.bodies = [];
    this.forces = [];
    this.bounds = null;
    this.integrator = integrator;
    this.t = 0;
    this.steps = 0;
    this.collisionCount = 0;
    this.broadPhase = broadPhase;         // 'brute' | 'hash'
    this.hash = new SpatialHash(1);
    this.stats = { checks: 0, pairs: 0, lastStepMs: 0 };
    this._baseline = null;
  }

  add(...bodies)      { this.bodies.push(...bodies); return this; }
  addForce(...forces) { this.forces.push(...forces); return this; }

  /* -------------------------------------------------- force accumulation */

  computeAccelerations() {
    for (const b of this.bodies) b.clearForces();
    for (const f of this.forces) f.apply(this.bodies, this.t);
    for (const b of this.bodies) {
      b.acc = b.fixed ? vec(0, 0) : b.force.scale(b.invMass);
    }
  }

  /* -------------------------------------------------------------- stepping */

  step(dt) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    this.integrator.step(this, dt);          // 1. move
    if (this.bounds) this.bounds.apply(this.bodies);   // 2. boundaries
    this.resolveCollisions();                 // 3. contacts

    this.t += dt;
    this.steps++;
    const t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.stats.lastStepMs = t1 - t0;
  }

  resolveCollisions() {
    if (this.bodies.length < 2) return;
    this.stats.checks = 0;
    let pairs;
    if (this.broadPhase === 'hash') {
      let maxR = 0;
      for (const b of this.bodies) maxR = Math.max(maxR, b.radius);
      this.hash.cellSize = Math.max(2 * maxR, 1e-6);
      pairs = this.hash.pairs(this.bodies, this.stats);
    } else {
      pairs = bruteForcePairs(this.bodies, this.stats);
    }
    this.stats.pairs = pairs.length;
    for (const [a, b] of pairs) {
      if (resolveContact(a, b)) this.collisionCount++;
    }
  }

  /* ----------------------------------------------------------- diagnostics */

  kineticEnergy() {
    let K = 0;
    for (const b of this.bodies) K += b.kinetic() + b.rotational();
    return K;
  }

  potentialEnergy() {
    let U = 0;
    for (const f of this.forces) if (f.potential) U += f.potential(this.bodies);
    return U;
  }

  totalEnergy() { return this.kineticEnergy() + this.potentialEnergy(); }

  momentum() {
    const p = vec(0, 0);
    for (const b of this.bodies) if (!b.fixed) p.addInPlace(b.momentum());
    return p;
  }

  angularMomentum(about = vec(0, 0)) {
    let L = 0;
    for (const b of this.bodies) {
      if (b.fixed) continue;
      L += b.mass * b.pos.sub(about).cross(b.vel) + b.I * b.omega;
    }
    return L;
  }

  centerOfMass() {
    let M = 0; const c = vec(0, 0);
    for (const b of this.bodies) {
      if (b.fixed) continue;
      M += b.mass; c.addInPlace(b.pos.scale(b.mass));
    }
    return M === 0 ? c : c.scale(1 / M);
  }

  // Capture the initial invariants ONCE. The conservation HUD compares
  // against THIS, never against a value recomputed inside the frame
  // callback -- an instrument measured against itself always reads 0.000%.
  captureBaseline() {
    this._baseline = {
      E: this.totalEnergy(),
      p: this.momentum(),
      L: this.angularMomentum(),
      t: this.t
    };
    return this._baseline;
  }

  get baseline() {
    if (!this._baseline) this.captureBaseline();
    return this._baseline;
  }

  drift() {
    const b = this.baseline;
    const E = this.totalEnergy();
    const p = this.momentum();
    const L = this.angularMomentum();
    const rel = (now, then) => (Math.abs(then) < 1e-12 ? Math.abs(now - then)
                                                       : (now - then) / Math.abs(then));
    const p0mag = b.p.len();
    return {
      E, p, L,
      dE: rel(E, b.E),
      dL: rel(L, b.L),
      dp: p0mag < 1e-12 ? p.sub(b.p).len() : p.sub(b.p).len() / p0mag
    };
  }
}
