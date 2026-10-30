import { Vec2 } from "./vec2.js";
import { resolveCollisions } from "./collisions.js";
import { EulerCromer } from "./integrators.js";

export class World {
  constructor({
    integrator = new EulerCromer(),
    bounds = null,
    restitution = 0.9,
    collisionMode = "grid"
  } = {}) {
    if (!integrator || typeof integrator.step !== "function") {
      throw new TypeError("Integrator must provide a step(world, dt) method.");
    }
    if (bounds) {
      const { xMin, xMax, yMin, yMax } = bounds;
      if (![xMin, xMax, yMin, yMax].every(Number.isFinite)
        || xMin >= xMax || yMin >= yMax) {
        throw new RangeError("Bounds must have finite, increasing min/max values.");
      }
    }
    if (!Number.isFinite(restitution) || restitution < 0 || restitution > 1) {
      throw new RangeError("Restitution must be between 0 and 1.");
    }
    if (!["grid", "bruteForce"].includes(collisionMode)) {
      throw new RangeError("Collision mode must be 'grid' or 'bruteForce'.");
    }

    this.bodies = [];
    this.forces = [];
    this.integrator = integrator;
    this.bounds = bounds;
    this.restitution = restitution;
    this.collisionMode = collisionMode;
    this.time = 0;
    this.pairChecks = 0;
    this.jitterBugDemo = false;
    this.baseline = null;
  }

  add(body) {
    this.bodies.push(body);
    return body;
  }

  addForce(force) {
    if (!force || typeof force.apply !== "function") {
      throw new TypeError("A force must provide an apply(world) method.");
    }
    this.forces.push(force);
    return force;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) {
      throw new RangeError("Time step must be a positive finite number.");
    }

    for (const body of this.bodies) body.clearForce();
    for (const force of this.forces) force.apply(this);
    this.integrator.step(this, dt);
    this.pairChecks = 0;
    resolveCollisions(this);
    this.time += dt;
  }

  captureBaseline() {
    this.baseline = {
      energy: this.totalEnergy(),
      momentum: this.totalMomentum()
    };
    return this.baseline;
  }

  kineticEnergy() {
    return this.bodies.reduce((sum, body) => sum + body.kineticEnergy(), 0);
  }

  potentialEnergy() {
    let energy = 0;
    for (const force of this.forces) {
      if (typeof force.potentialEnergy === "function") {
        energy += force.potentialEnergy(this);
      }
    }
    return energy;
  }

  totalEnergy() {
    return this.kineticEnergy() + this.potentialEnergy();
  }

  totalMomentum() {
    const momentum = new Vec2();
    for (const body of this.bodies) {
      if (!body.isStatic) momentum.addScaled(body.vel, body.m);
    }
    return momentum;
  }

  totalAngularMomentum() {
    let angularMomentum = 0;
    for (const body of this.bodies) {
      if (body.isStatic) continue;
      angularMomentum += body.m * (
        body.pos.x * body.vel.y - body.pos.y * body.vel.x
      ) + body.I * body.omega;
    }
    return angularMomentum;
  }
}
