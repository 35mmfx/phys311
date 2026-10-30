import { Body } from "./engine/body.js";
import { Drag, Gravity, NewtonGravity, Spring } from "./engine/forces.js";
import { EulerCromer, VelocityVerlet } from "./engine/integrators.js";
import { World } from "./engine/world.js";
import { Vec2 } from "./engine/vec2.js";
import { seededRandom } from "./engine/random.js";

const COLORS = ["#ff8200", "#2ea8a1", "#6c8cff", "#d66b9c", "#9b72cf"];

export function createBilliards({ restitution = 1, count = 20, seed = 311 } = {}) {
  const random = seededRandom(seed);
  const world = new World({
    integrator: new EulerCromer(),
    bounds: { xMin: -5, xMax: 5, yMin: -4, yMax: 4 },
    restitution
  });
  const columns = 5;
  const spacing = 1.45;

  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    world.add(new Body({
      mass: 0.8 + random() * 0.7,
      pos: new Vec2(
        (column - (columns - 1) / 2) * spacing,
        (row - (Math.ceil(count / columns) - 1) / 2) * spacing
      ),
      vel: new Vec2((random() - 0.5) * 4, (random() - 0.5) * 4),
      radius: 0.32
    }));
  }

  world.view = { xMin: -5.3, xMax: 5.3, yMin: -4.3, yMax: 4.3 };
  world.description = "20-body billiards: pair and wall collisions, adjustable restitution.";
  return world;
}

export function createGravityOrbit() {
  const world = new World({ integrator: new VelocityVerlet(), restitution: 1 });
  const count = 3;
  const mass = 1;
  const side = 2;
  const softening = 0.02;
  const radius = side / Math.sqrt(3);
  const angularSpeed = Math.sqrt(
    3 * mass / (side * side + softening * softening) ** 1.5
  );

  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * i / count;
    const position = new Vec2(radius * Math.cos(angle), radius * Math.sin(angle));
    const velocity = new Vec2(
      -angularSpeed * position.y,
      angularSpeed * position.x
    );
    world.add(new Body({ mass, pos: position, vel: velocity, radius: 0.11 }));
  }

  world.addForce(new NewtonGravity(1, softening));
  world.view = { xMin: -2, xMax: 2, yMin: -2, yMax: 2 };
  world.description = "Three-body softened Newtonian gravity; Verlet integrator and trails.";
  return world;
}

export function createSpringNetwork() {
  const world = new World({ integrator: new VelocityVerlet(), restitution: 1 });
  const bodies = [];
  const spacing = 1.2;
  const count = 5;

  for (let i = 0; i < count; i++) {
    const body = world.add(new Body({
      mass: 1,
      pos: new Vec2((i - (count - 1) / 2) * spacing, i === 2 ? 0.65 : 0),
      radius: 0.18,
      isStatic: i === 0 || i === count - 1
    }));
    bodies.push(body);
  }

  for (let i = 0; i < bodies.length - 1; i++) {
    world.addForce(new Spring(bodies[i], bodies[i + 1], 12, spacing));
  }

  world.view = { xMin: -3.4, xMax: 3.4, yMin: -1.6, yMax: 1.6 };
  world.description = "Five-mass spring chain with fixed endpoints; energy is the useful diagnostic.";
  return world;
}

export function createJitterDemo({ disabledGuard = false } = {}) {
  const world = new World({ integrator: new EulerCromer(), restitution: 1 });
  world.jitterBugDemo = disabledGuard;
  world.add(new Body({
    pos: new Vec2(-0.25, 0),
    vel: new Vec2(-0.5, 0),
    radius: 0.3
  }));
  world.add(new Body({
    pos: new Vec2(0.25, 0),
    vel: new Vec2(0.5, 0),
    radius: 0.3
  }));
  world.view = { xMin: -2, xMax: 2, yMin: -1, yMax: 1 };
  world.description = disabledGuard
    ? "Jitter-bug repro: guard disabled; overlapping, separating bodies receive a false impulse."
    : "Guard enabled: overlapping, separating bodies are corrected without a false impulse.";
  return world;
}

export function createRotationDemo() {
  const world = new World({ integrator: new VelocityVerlet(), restitution: 1 });
  const bodies = [
    { x: -1.5, y: 0.6, radius: 0.55, mass: 2, theta: 0, omega: 1.4 },
    { x: 0, y: -0.5, radius: 0.42, mass: 1.4, theta: 0.7, omega: -0.8 },
    { x: 1.5, y: 0.6, radius: 0.32, mass: 1, theta: -0.4, omega: 0.5 }
  ];
  for (const body of bodies) {
    world.add(new Body({
      pos: new Vec2(body.x, body.y),
      radius: body.radius,
      mass: body.mass,
      theta: body.theta,
      omega: body.omega
    }));
  }
  world.view = { xMin: -2.6, xMax: 2.6, yMin: -1.6, yMax: 1.6 };
  world.description = "Torque-free rigid discs spin in place; total angular momentum is conserved.";
  return world;
}

export const SCENES = {
  billiards: {
    label: "Billiards / ball pit",
    make: ({ restitution }) => createBilliards({ restitution })
  },
  gravity: {
    label: "Three-body gravity",
    make: () => createGravityOrbit()
  },
  springs: {
    label: "Spring network",
    make: () => createSpringNetwork()
  },
  jitter: {
    label: "Collision guard demonstration",
    make: ({ disabledGuard = false } = {}) => createJitterDemo({ disabledGuard })
  },
  rotation: {
    label: "Torque-free rotation",
    make: () => createRotationDemo()
  }
};
