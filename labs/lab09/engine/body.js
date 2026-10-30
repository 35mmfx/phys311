import { Vec2 } from "./vec2.js";

let nextBodyId = 0;

export class Body {
  constructor({
    mass = 1,
    pos = new Vec2(),
    vel = new Vec2(),
    radius = 0.25,
    isStatic = false,
    theta = 0,
    omega = 0,
    I = 0.5 * mass * radius ** 2
  } = {}) {
    if (!Number.isFinite(mass) || mass <= 0) {
      throw new RangeError("Body mass must be a positive finite number.");
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError("Body radius must be a positive finite number.");
    }
    if (!Number.isFinite(theta) || !Number.isFinite(omega)) {
      throw new RangeError("Body angle and angular velocity must be finite numbers.");
    }
    if (!Number.isFinite(I) || I <= 0) {
      throw new RangeError("Body moment of inertia must be a positive finite number.");
    }
    if (!(pos instanceof Vec2) || !(vel instanceof Vec2)) {
      throw new TypeError("Body position and velocity must be Vec2 instances.");
    }

    this.id = nextBodyId++;
    this.m = mass;
    this.invMass = isStatic ? 0 : 1 / mass;
    this.pos = pos.clone();
    this.vel = isStatic ? new Vec2() : vel.clone();
    this.acc = new Vec2();
    this.force = new Vec2();
    this.theta = theta;
    this.omega = isStatic ? 0 : omega;
    this.I = I;
    this.torque = 0;
    this.angularAcc = 0;
    this.radius = radius;
    this.isStatic = isStatic;
  }

  clearForce() {
    this.force.zero();
    this.torque = 0;
  }

  applyTorque(torque) {
    if (!Number.isFinite(torque)) {
      throw new TypeError("Applied torque must be a finite number.");
    }
    this.torque += torque;
  }

  kineticEnergy() {
    return this.isStatic
      ? 0
      : 0.5 * this.m * this.vel.lengthSq() + 0.5 * this.I * this.omega ** 2;
  }
}
