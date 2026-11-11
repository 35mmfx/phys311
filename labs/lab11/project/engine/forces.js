export class Gravity {
  constructor(g = 9.81) {
    if (!Number.isFinite(g) || g < 0) {
      throw new RangeError("Gravity strength must be a non-negative finite number.");
    }
    this.g = g;
  }

  apply(world) {
    for (const body of world.bodies) {
      if (!body.isStatic) body.force.y -= body.m * this.g;
    }
  }

  potentialEnergy(world) {
    let energy = 0;
    for (const body of world.bodies) energy += body.m * this.g * body.pos.y;
    return energy;
  }
}

export class Drag {
  constructor(coefficient = 0.1) {
    if (!Number.isFinite(coefficient) || coefficient < 0) {
      throw new RangeError("Drag coefficient must be a non-negative finite number.");
    }
    this.coefficient = coefficient;
  }

  apply(world) {
    for (const body of world.bodies) {
      if (body.isStatic) continue;
      const speed = body.vel.length();
      if (speed > 0) body.force.addScaled(body.vel, -this.coefficient * speed);
    }
  }
}

export class Spring {
  constructor(bodyA, bodyB, springConstant, restLength) {
    if (!bodyA || !bodyB || bodyA === bodyB) {
      throw new TypeError("A spring needs two distinct bodies.");
    }
    if (!Number.isFinite(springConstant) || springConstant < 0) {
      throw new RangeError("Spring constant must be a non-negative finite number.");
    }
    if (!Number.isFinite(restLength) || restLength < 0) {
      throw new RangeError("Spring rest length must be a non-negative finite number.");
    }

    this.bodyA = bodyA;
    this.bodyB = bodyB;
    this.springConstant = springConstant;
    this.restLength = restLength;
  }

  apply() {
    const displacement = this.bodyB.pos.sub(this.bodyA.pos);
    const length = displacement.length();
    if (length === 0) return;

    const magnitude = this.springConstant * (length - this.restLength);
    const force = displacement.mul(magnitude / length);
    if (!this.bodyA.isStatic) this.bodyA.force.addTo(force);
    if (!this.bodyB.isStatic) this.bodyB.force.addScaled(force, -1);
  }

  potentialEnergy() {
    const extension = this.bodyB.pos.sub(this.bodyA.pos).length() - this.restLength;
    return 0.5 * this.springConstant * extension * extension;
  }
}

export class NewtonGravity {
  constructor(G = 1, softening = 0.01) {
    if (!Number.isFinite(G) || G < 0) {
      throw new RangeError("G must be a non-negative finite number.");
    }
    if (!Number.isFinite(softening) || softening < 0) {
      throw new RangeError("Softening must be a non-negative finite number.");
    }
    this.G = G;
    this.softening = softening;
  }

  apply(world) {
    for (let i = 0; i < world.bodies.length; i++) {
      const a = world.bodies[i];
      for (let j = i + 1; j < world.bodies.length; j++) {
        const b = world.bodies[j];
        const displacement = b.pos.sub(a.pos);
        const softenedDistanceSq = displacement.lengthSq() + this.softening ** 2;
        if (softenedDistanceSq === 0) continue;

        const scale = this.G * a.m * b.m
          / (softenedDistanceSq * Math.sqrt(softenedDistanceSq));
        a.force.addScaled(displacement, scale);
        b.force.addScaled(displacement, -scale);
      }
    }
  }

  potentialEnergy(world) {
    let energy = 0;
    for (let i = 0; i < world.bodies.length; i++) {
      const a = world.bodies[i];
      for (let j = i + 1; j < world.bodies.length; j++) {
        const b = world.bodies[j];
        const distance = Math.sqrt(
          b.pos.sub(a.pos).lengthSq() + this.softening ** 2
        );
        if (distance > 0) energy -= this.G * a.m * b.m / distance;
      }
    }
    return energy;
  }
}
