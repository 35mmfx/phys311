export class World {
  constructor(integrator) {
    this.bodies = []; this.forces = [];
    this.integrator = integrator;
    this.time = 0; this.steps = 0;
  }
  add(b)      { this.bodies.push(b); return b; }
  addForce(f) { this.forces.push(f); return f; }

  clearForces() { for (const b of this.bodies) b.force.zero(); }
  applyForces() { for (const f of this.forces) f.apply(this); }

  primeAccelerations() {
    this.clearForces(); this.applyForces();
    for (const b of this.bodies) {
      if (b.fixed) continue;
      b.acc.set(b.force.x * b.invMass, b.force.y * b.invMass);
    }
  }

  step(dt) {
    this.clearForces();
    this.applyForces();
    this.integrator.step(this, dt);
    this.time += dt;
    this.steps += 1;
  }

  kineticEnergy() {
    let K = 0;
    for (const b of this.bodies) if (!b.fixed) K += 0.5 * b.mass * b.vel.lengthSq();
    return K;
  }
  potentialEnergy() {
    let U = 0;
    for (const f of this.forces) if (f.potentialEnergy) U += f.potentialEnergy(this);
    return U;
  }
  totalEnergy() { return this.kineticEnergy() + this.potentialEnergy(); }
}
