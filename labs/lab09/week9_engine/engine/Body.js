// engine/Body.js -- state of one rigid disc. No rendering data except `color`,
// which is tolerated because it is inert and never read by the engine.

import { Vec2, vec } from './Vec2.js';

export class Body {
  constructor({
    pos = vec(0, 0),
    vel = vec(0, 0),
    mass = 1,
    radius = 0.25,
    theta = 0,            // orientation (rad)
    omega = 0,            // angular velocity (rad/s)
    inertiaCoeff = 0.5,   // I = coeff * m * r^2   (0.5 = uniform disc)
    restitution = 0.9,
    fixed = false,        // immovable (infinite mass)
    color = '#ff8200',
    name = ''
  } = {}) {
    this.pos = pos.clone();
    this.vel = vel.clone();
    this.acc = vec(0, 0);
    this.force = vec(0, 0);     // accumulator, cleared every step
    this.mass = mass;
    this.radius = radius;
    this.theta = theta;
    this.omega = omega;
    this.inertiaCoeff = inertiaCoeff;
    this.restitution = restitution;
    this.fixed = fixed;
    this.color = color;
    this.name = name;
  }

  get invMass() { return this.fixed ? 0 : 1 / this.mass; }
  get I()       { return this.inertiaCoeff * this.mass * this.radius ** 2; }
  get invI()    { return this.fixed ? 0 : 1 / this.I; }

  kinetic()    { return 0.5 * this.mass * this.vel.len2(); }
  rotational() { return 0.5 * this.I * this.omega ** 2; }
  momentum()   { return this.vel.scale(this.mass); }

  clearForces() { this.force.zero(); }
  applyForce(F) { this.force.addInPlace(F); }
}
