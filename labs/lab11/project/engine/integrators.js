function applyForces(world) {
  for (const body of world.bodies) body.clearForce();
  for (const force of world.forces) force.apply(world);
}

export class EulerCromer {
  step(world, dt) {
    for (const body of world.bodies) {
      if (body.isStatic) continue;
      body.acc.set(body.force.x / body.m, body.force.y / body.m);
      body.angularAcc = body.torque / body.I;
      body.vel.addScaled(body.acc, dt);
      body.pos.addScaled(body.vel, dt);
      body.omega += body.angularAcc * dt;
      body.theta += body.omega * dt;
    }
  }
}

export class VelocityVerlet {
  step(world, dt) {
    for (const body of world.bodies) {
      if (body.isStatic) continue;
      body.acc.set(body.force.x / body.m, body.force.y / body.m);
      body.angularAcc = body.torque / body.I;
      body.vel.addScaled(body.acc, 0.5 * dt);
      body.pos.addScaled(body.vel, dt);
      body.omega += body.angularAcc * 0.5 * dt;
      body.theta += body.omega * dt;
    }

    applyForces(world);

    for (const body of world.bodies) {
      if (body.isStatic) continue;
      const nextAcceleration = body.force.mul(1 / body.m);
      body.vel.addScaled(nextAcceleration, 0.5 * dt);
      body.acc.set(nextAcceleration.x, nextAcceleration.y);
      body.angularAcc = body.torque / body.I;
      body.omega += body.angularAcc * 0.5 * dt;
    }
  }
}
