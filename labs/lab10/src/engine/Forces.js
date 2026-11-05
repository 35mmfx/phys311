// Forces.js — every force is an object with apply(bodies, t).
// WEEK 10 KEY IDEA: user input is just another Force. PointerSpring lives
// here, in engine/, and knows nothing about mice, pixels, or the DOM. The UI
// layer only ever writes a world-coordinate target into it.
import { Vec2 } from './Vec2.js';

export class UniformGravity {
  constructor(g = 9.81) { this.g = g; this.enabled = true; }
  apply(bodies) {
    if (!this.enabled) return;
    for (const b of bodies) {
      if (b.fixed) continue;
      b.applyForce(new Vec2(0, -b.mass * this.g));
    }
  }
  energy(bodies) {                       // potential energy bookkeeping
    if (!this.enabled) return 0;
    let U = 0;
    for (const b of bodies) U += b.mass * this.g * b.pos.y;
    return U;
  }
}

export class QuadraticDrag {
  constructor(c = 0.0) { this.c = c; this.enabled = true; }
  apply(bodies) {
    if (!this.enabled || this.c === 0) return;
    for (const b of bodies) {
      if (b.fixed) continue;
      const s = b.vel.len();
      if (s < 1e-12) continue;
      b.applyForce(b.vel.mul(-this.c * s));
    }
  }
  energy() { return 0; }                 // dissipative: tracked as lost work
  dissipation(bodies) {                  // power removed, for the energy ledger
    let P = 0;
    if (!this.enabled || this.c === 0) return 0;
    for (const b of bodies) {
      if (b.fixed) continue;
      const s = b.vel.len();
      P += this.c * s * s * s;
    }
    return P;
  }
}

export class Spring {
  // Hookean link between two bodies. Equal and opposite by construction.
  constructor(a, b, k = 40, rest = 1, damp = 0) {
    this.a = a; this.b = b; this.k = k; this.rest = rest; this.damp = damp;
    this.enabled = true;
  }
  apply() {
    if (!this.enabled) return;
    const d = this.b.pos.sub(this.a.pos);
    const L = d.len();
    if (L < 1e-12) return;
    const n = d.mul(1 / L);
    const relv = this.b.vel.sub(this.a.vel).dot(n);
    const mag = this.k * (L - this.rest) + this.damp * relv;
    const F = n.mul(mag);
    this.a.applyForce(F);
    this.b.applyForce(F.mul(-1));        // Newton's third law, structurally
  }
  energy() {
    if (!this.enabled) return 0;
    const L = this.b.pos.sub(this.a.pos).len();
    return 0.5 * this.k * (L - this.rest) ** 2;
  }
}

export class NewtonGravity {
  constructor(G = 1.0, soft = 0.02) { this.G = G; this.soft = soft; this.enabled = true; }
  apply(bodies) {
    if (!this.enabled) return;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const d = b.pos.sub(a.pos);
        const r2 = d.len2() + this.soft * this.soft;
        const F = d.mul(this.G * a.mass * b.mass / (r2 * Math.sqrt(r2)));
        a.applyForce(F);
        b.applyForce(F.mul(-1));
      }
    }
  }
  energy(bodies) {
    if (!this.enabled) return 0;
    let U = 0;
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const r = Math.sqrt(bodies[j].pos.sub(bodies[i].pos).len2() + this.soft ** 2);
        U -= this.G * bodies[i].mass * bodies[j].mass / r;
      }
    return U;
  }
}

export class PointerSpring {
  // The user's finger, modelled as a damped spring to a moving anchor.
  // grabbed === null  -> contributes nothing at all.
  // This is an EXTERNAL force: while active, momentum is NOT conserved.
  // That is physics, not a bug, and validate.js asserts it both ways.
  constructor({ k = 120, damp = 8 } = {}) {
    this.k = k; this.damp = damp;
    this.grabbed = null;                 // a Body, or null
    this.target  = new Vec2(0, 0);       // WORLD coordinates, set by ui/Pointer.js
    this.enabled = true;
  }
  grab(body, worldX, worldY) { this.grabbed = body; this.target.set(worldX, worldY); }
  moveTo(worldX, worldY)     { this.target.set(worldX, worldY); }
  release()                  { this.grabbed = null; }
  get active()               { return this.enabled && this.grabbed !== null; }

  apply() {
    if (!this.active) return;
    const b = this.grabbed;
    if (b.fixed) return;
    const d = this.target.sub(b.pos);
    const F = d.mul(this.k).sub(b.vel.mul(this.damp));
    b.applyForce(F);
  }
  energy() {
    if (!this.active) return 0;
    return 0.5 * this.k * this.target.sub(this.grabbed.pos).len2();
  }
}
