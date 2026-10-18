export class Euler {
  step(world, dt) {
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.acc.set(b.force.x * b.invMass, b.force.y * b.invMass);
      b.pos.addScaled(b.vel, dt);     // position uses the OLD velocity
      b.vel.addScaled(b.acc, dt);     // ...then velocity.
    }
  }
}

export class EulerCromer {
  step(world, dt) {
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.acc.set(b.force.x * b.invMass, b.force.y * b.invMass);
      b.vel.addScaled(b.acc, dt);     // velocity FIRST
      b.pos.addScaled(b.vel, dt);     // then position, with NEW velocity
    }
  }
}

export class VelocityVerlet {
  step(world, dt) {
    // 1. drift + half kick, using acceleration carried on body
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.pos.x += b.vel.x * dt + 0.5 * b.acc.x * dt * dt;
      b.pos.y += b.vel.y * dt + 0.5 * b.acc.y * dt * dt;
    }
    // 2. recompute forces at NEW positions
    world.clearForces();
    world.applyForces();
    // 3. finish velocity with average of old and new acceleration
    for (const b of world.bodies) {
      if (b.fixed) continue;
      const axN = b.force.x * b.invMass, ayN = b.force.y * b.invMass;
      b.vel.x += 0.5 * (b.acc.x + axN) * dt;
      b.vel.y += 0.5 * (b.acc.y + ayN) * dt;
      b.acc.set(axN, ayN);            // carry forward
    }
  }
}
