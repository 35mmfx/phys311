import { Vec2 } from "./vec2.js";
import { SpatialGrid } from "./spatial-grid.js";

function validateRestitution(restitution) {
  if (!Number.isFinite(restitution) || restitution < 0 || restitution > 1) {
    throw new RangeError("Restitution must be between 0 and 1.");
  }
}

export function resolvePair(
  a,
  b,
  restitution = 0.9,
  { disableSeparatingGuard = false } = {}
) {
  validateRestitution(restitution);
  const displacement = b.pos.sub(a.pos);
  const distanceSq = displacement.lengthSq();
  const radiusSum = a.radius + b.radius;
  if (distanceSq >= radiusSum * radiusSum) return false;

  const invMassSum = a.invMass + b.invMass;
  if (invMassSum === 0) return false;

  const distance = Math.sqrt(distanceSq);
  const normal = distance === 0
    ? new Vec2(1, 0)
    : displacement.mul(1 / distance);
  const overlap = radiusSum - distance;
  const correction = Math.max(overlap - 1e-4, 0) * 0.8 / invMassSum;
  a.pos.addScaled(normal, -correction * a.invMass);
  b.pos.addScaled(normal, correction * b.invMass);

  const relativeVelocity = b.vel.sub(a.vel);
  const normalSpeed = relativeVelocity.dot(normal);
  if (normalSpeed > 0 && !disableSeparatingGuard) return true;

  const impulse = -(1 + restitution) * normalSpeed / invMassSum;
  a.vel.addScaled(normal, -impulse * a.invMass);
  b.vel.addScaled(normal, impulse * b.invMass);
  return true;
}

function resolveBounds(body, bounds, restitution) {
  const { xMin, xMax, yMin, yMax } = bounds;
  const left = xMin + body.radius;
  const right = xMax - body.radius;
  const bottom = yMin + body.radius;
  const top = yMax - body.radius;
  if (left > right || bottom > top) {
    throw new RangeError("World bounds must be wider and taller than each body diameter.");
  }

  if (body.pos.x < left) {
    body.pos.x = left;
    if (body.vel.x < 0) body.vel.x = -body.vel.x * restitution;
  } else if (body.pos.x > right) {
    body.pos.x = right;
    if (body.vel.x > 0) body.vel.x = -body.vel.x * restitution;
  }

  if (body.pos.y < bottom) {
    body.pos.y = bottom;
    if (body.vel.y < 0) body.vel.y = -body.vel.y * restitution;
  } else if (body.pos.y > top) {
    body.pos.y = top;
    if (body.vel.y > 0) body.vel.y = -body.vel.y * restitution;
  }
}

export function resolveCollisions(world) {
  validateRestitution(world.restitution);
  if (world.bounds) {
    for (const body of world.bodies) resolveBounds(body, world.bounds, world.restitution);
  }

  const resolve = (i, j) => {
    world.pairChecks++;
    return resolvePair(world.bodies[i], world.bodies[j], world.restitution, {
      disableSeparatingGuard: world.jitterBugDemo
    });
  };

  if (world.collisionMode === "bruteForce") {
    for (let i = 0; i < world.bodies.length; i++) {
      for (let j = i + 1; j < world.bodies.length; j++) resolve(i, j);
    }
    return;
  }
  if (world.collisionMode !== "grid") {
    throw new RangeError("Collision mode must be 'grid' or 'bruteForce'.");
  }

  const bodies = world.bodies;
  const grid = new SpatialGrid(bodies);
  const queued = new Set();
  const heap = [];
  const push = (key) => {
    let index = heap.length;
    heap.push(key);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent] <= key) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = key;
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && heap[right] < heap[left] ? right : left;
        if (heap[child] >= last) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const enqueueNear = (index, afterKey) => {
    for (const key of grid.pairKeysNear(index, afterKey, bodies.length)) {
      if (queued.has(key)) continue;
      queued.add(key);
      push(key);
    }
  };

  for (let i = 0; i < bodies.length; i++) enqueueNear(i, -1);
  let lastKey = -1;
  while (heap.length > 0) {
    const key = pop();
    if (key <= lastKey) continue;
    lastKey = key;
    const i = Math.floor(key / bodies.length);
    const j = key % bodies.length;
    const a = bodies[i];
    const b = bodies[j];
    const oldAX = a.pos.x;
    const oldAY = a.pos.y;
    const oldBX = b.pos.x;
    const oldBY = b.pos.y;
    if (!resolve(i, j)) continue;

    if (a.pos.x !== oldAX || a.pos.y !== oldAY) {
      grid.update(i, a);
      enqueueNear(i, key);
    }
    if (b.pos.x !== oldBX || b.pos.y !== oldBY) {
      grid.update(j, b);
      enqueueNear(j, key);
    }
  }
}
