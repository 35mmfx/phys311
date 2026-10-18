import { Vec2 } from './vec2.js';

export class Body {
  constructor({ mass = 1, pos = new Vec2(), vel = new Vec2(), radius = 0.25,
                color = "#ff8200", fixed = false } = {}) {
    this.mass = mass;
    this.invMass = fixed ? 0 : 1 / mass;
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.acc = new Vec2();
    this.force = new Vec2();
    this.radius = radius;
    this.color = color;
    this.fixed = fixed;
    this.trail = [];
  }
}
