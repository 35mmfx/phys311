import { Vec2 } from './vec2.js';

export class Gravity {
  constructor(g = 9.81) { this.g = g; }
  apply(world) {
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.force.y -= b.mass * this.g;
    }
  }
  potentialEnergy(world) {
    let U = 0;
    for (const b of world.bodies) if (!b.fixed) U += b.mass * this.g * b.pos.y;
    return U;
  }
}

export class Spring {
  constructor(body, anchor, k, restLength = 0) {
    this.body = body; this.anchor = anchor.clone();
    this.k = k; this.restLength = restLength;
  }
  apply() {
    const d = this.body.pos.sub(this.anchor);
    const L = d.length();
    if (L === 0) return;                            // guard: avoid 0/0
    const stretch = L - this.restLength;
    this.body.force.addTo(d.mul(-this.k * stretch / L));
  }
  potentialEnergy() {
    const s = this.body.pos.sub(this.anchor).length() - this.restLength;
    return 0.5 * this.k * s * s;
  }
}
