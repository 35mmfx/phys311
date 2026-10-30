// engine/Integrators.js -- swappable time-steppers.
// Each exposes step(world, dt). They differ ONLY in the order of updates.
//
// See Week 2 section 5.5: on a projectile (constant force) Euler and
// Euler-Cromer are equally accurate -- the position error is +/- (1/2) g t dt.
// Use the spring or the orbit scene to see them actually separate.

export class Euler {
  static label = 'Euler (explicit)';
  step(world, dt) {
    world.computeAccelerations();
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.pos.addInPlace(b.vel.scale(dt));       // uses OLD velocity
      b.vel.addInPlace(b.acc.scale(dt));
      b.theta += b.omega * dt;
    }
  }
}

export class EulerCromer {
  static label = 'Euler-Cromer (symplectic)';
  step(world, dt) {
    world.computeAccelerations();
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.vel.addInPlace(b.acc.scale(dt));       // velocity FIRST
      b.pos.addInPlace(b.vel.scale(dt));       // then NEW velocity
      b.theta += b.omega * dt;
    }
  }
}

export class VelocityVerlet {
  static label = 'Velocity Verlet (symplectic, 2nd order)';
  step(world, dt) {
    world.computeAccelerations();                       // a(t)
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.pos.addInPlace(b.vel.scale(dt).add(b.acc.scale(0.5 * dt * dt)));
      b.halfVel = b.vel.add(b.acc.scale(0.5 * dt));     // stash v(t+dt/2)
      b.theta += b.omega * dt;
    }
    world.computeAccelerations();                       // a(t+dt)
    for (const b of world.bodies) {
      if (b.fixed) continue;
      b.vel = b.halfVel.add(b.acc.scale(0.5 * dt));
    }
  }
}

export const INTEGRATORS = { Euler, EulerCromer, VelocityVerlet };
