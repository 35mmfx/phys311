// engine/Forces.js -- every force is an object with
//     apply(bodies, t)            -> adds to body.force
//     potential(bodies)  [opt]    -> potential energy, for the conservation HUD
//
// RULE: internal forces must be applied as an equal-and-opposite PAIR.
// If you write `a.applyForce(F)` you must write `b.applyForce(F.neg())`
// on the very next line. That is what makes momentum conservation a
// structural guarantee instead of something World has to police.

import { Vec2, vec } from './Vec2.js';

export class UniformGravity {
  constructor(g = 9.81, groundY = 0) { this.g = g; this.groundY = groundY; }
  apply(bodies) {
    for (const b of bodies) {
      if (b.fixed) continue;
      b.applyForce(vec(0, -b.mass * this.g));
    }
  }
  potential(bodies) {
    let U = 0;
    for (const b of bodies) if (!b.fixed) U += b.mass * this.g * (b.pos.y - this.groundY);
    return U;
  }
}

export class NewtonGravity {
  // Pairwise 1/r^2 attraction. softening avoids the r->0 singularity.
  constructor(G = 1, softening = 0) { this.G = G; this.softening = softening; }
  apply(bodies) {
    const e2 = this.softening ** 2;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const d = b.pos.sub(a.pos);
        const r2 = d.len2() + e2;
        const r = Math.sqrt(r2);
        if (r === 0) continue;
        const F = d.scale(this.G * a.mass * b.mass / (r2 * r));
        a.applyForce(F);          // equal ...
        b.applyForce(F.neg());    // ... and opposite
      }
    }
  }
  potential(bodies) {
    const e2 = this.softening ** 2;
    let U = 0;
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const r = Math.sqrt(bodies[j].pos.sub(bodies[i].pos).len2() + e2);
        if (r > 0) U -= this.G * bodies[i].mass * bodies[j].mass / r;
      }
    return U;
  }
}

export class Spring {
  // Hookean spring between two bodies (damping c is dissipative: no potential).
  constructor(a, b, k, restLength, c = 0) {
    this.a = a; this.b = b; this.k = k; this.restLength = restLength; this.c = c;
  }
  apply() {
    const d = this.b.pos.sub(this.a.pos);
    const L = d.len();
    if (L === 0) return;
    const n = d.scale(1 / L);
    const stretch = L - this.restLength;
    const vRel = this.b.vel.sub(this.a.vel).dot(n);
    const mag = this.k * stretch + this.c * vRel;
    const F = n.scale(mag);
    this.a.applyForce(F);
    this.b.applyForce(F.neg());
  }
  potential() {
    const L = this.b.pos.sub(this.a.pos).len();
    return 0.5 * this.k * (L - this.restLength) ** 2;
  }
}

export class QuadraticDrag {
  // F = -(1/2) rho Cd A |v| v, rolled into one coefficient b: F = -b|v|v
  constructor(b = 0.01) { this.b = b; }
  apply(bodies) {
    for (const body of bodies) {
      if (body.fixed) continue;
      const s = body.vel.len();
      if (s === 0) continue;
      body.applyForce(body.vel.scale(-this.b * s));
    }
  }
  // dissipative: no potential energy. Energy leaves the system on purpose.
}

export class PointAttractor {
  // Fixed centre of attraction -- useful for single-body orbit tests.
  constructor(center = vec(0, 0), mu = 1, softening = 1e-6) {
    this.center = center.clone(); this.mu = mu; this.softening = softening;
  }
  apply(bodies) {
    for (const b of bodies) {
      if (b.fixed) continue;
      const d = this.center.sub(b.pos);
      const r2 = d.len2() + this.softening ** 2;
      const r = Math.sqrt(r2);
      b.applyForce(d.scale(this.mu * b.mass / (r2 * r)));
    }
  }
  potential(bodies) {
    let U = 0;
    for (const b of bodies) if (!b.fixed) {
      const r = Math.sqrt(this.center.sub(b.pos).len2() + this.softening ** 2);
      U -= this.mu * b.mass / r;
    }
    return U;
  }
}
