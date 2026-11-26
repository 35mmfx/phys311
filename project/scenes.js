// scenes.js — every scene is a pure function (state) -> World.
// Randomized scenes use a state seed, so a permalink reproduces the same run.
import { World, Body, Vec2 } from './engine/World.js?v=20261126c';
import { UniformGravity, QuadraticDrag, Spring, NewtonGravity, PointerSpring, LanderDrive }
  from './engine/Forces.js';

function mulberry32(seed) {                 // 8-line deterministic PRNG
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ['#ff8200', '#58a6ff', '#7ee787', '#f778ba', '#ffd866', '#c792ea'];

export const LUNAR_DIFFICULTIES = {
  easy: {
    fuel: 45, padHalfWidth: 2.2, asteroidChance: 1, asteroidCount: 5,
    startAltitudeMin: 10, startAltitudeMax: 14,
    asteroidCadenceScale: 1, asteroidSpeedScale: 1
  },
  normal: {
    fuel: 39, padHalfWidth: 1.45, asteroidChance: 1, asteroidCount: 9,
    startAltitudeMin: 10, startAltitudeMax: 14,
    asteroidCadenceScale: 1, asteroidSpeedScale: 1
  },
  hard: {
    fuel: 30, padHalfWidth: 1.0, asteroidChance: 1, asteroidCount: 12,
    startAltitudeMin: 15, startAltitudeMax: 18,
    asteroidCadenceScale: 1, asteroidSpeedScale: 1
  },
  impossible: {
    fuel: 18, padHalfWidth: 0.65, asteroidChance: 1, asteroidCount: 24,
    startAltitudeMin: 18, startAltitudeMax: 19,
    asteroidCadenceScale: 0.3, asteroidSpeedScale: 1.35
  }
};

function base(state, opts) {
  const w = new World({
    dt: state.dt, integrator: state.integrator,
    restitution: state.restitution, ...opts
  });
  return w;
}

function attachCommon(w, state, { gravity = true } = {}) {
  if (gravity) w.addForce(new UniformGravity(state.gravity));
  w.addForce(new QuadraticDrag(state.drag));
  const ps = new PointerSpring();
  w.addForce(ps);                           // input, as a force, like any other
  w.pointer = ps;
  return w;
}

export const SCENES = {

  // 1. Billiards: collisions in a box. Walls are external -> momentum breaks.
  billiards(state) {
    Body.resetIds();
    const bounds = { xmin: -6, xmax: 6, ymin: -4, ymax: 4 };
    const w = base(state, { bounds, useHash: state.count > 40, cell: 1.0 });
    const rnd = mulberry32(1234);
    for (let i = 0; i < state.count; i++) {
      w.add(new Body({
        pos: new Vec2(-5.2 + rnd() * 10.4, -3.2 + rnd() * 6.4),
        vel: new Vec2((rnd() - 0.5) * 7, (rnd() - 0.5) * 7),
        mass: 1, radius: 0.26, color: PALETTE[i % PALETTE.length]
      }));
    }
    attachCommon(w, state, { gravity: false });
    w.momentumConserved = false;          // the walls are an external force
    w.markReference();
    return { world: w, view: [-6.5, 6.5, -4.5, 4.5] };
  },

  // 2. Spring chain: position-dependent force -> integrators finally separate.
  chain(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(3, Math.min(14, state.count));
    const anchor = w.add(new Body({ pos: new Vec2(-3, 3), fixed: true,
                                    radius: 0.18, color: '#888' }));
    let prev = anchor;
    for (let i = 1; i <= n; i++) {
      const b = w.add(new Body({ pos: new Vec2(-3 + i * 0.75, 3), mass: 1,
                                 radius: 0.18, color: PALETTE[i % PALETTE.length] }));
      w.addForce(new Spring(prev, b, 90, 0.75, 0));
      prev = b;
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-6, 6, -5, 4.5] };
  },

  // 3. Orbits: pure N-body, no walls -> momentum must hold to machine zero.
  orbits(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const sun = w.add(new Body({ pos: new Vec2(0, 0), mass: 400, radius: 0.5,
                                 color: '#ffd866', tag: 'sun' }));
    const rnd = mulberry32(99);
    const n = Math.max(1, Math.min(12, Math.round(state.count / 4)));
    for (let i = 0; i < n; i++) {
      const r = 2 + i * 0.9 + rnd() * 0.2;
      const v = Math.sqrt(400 / r);
      w.add(new Body({ pos: new Vec2(r, 0), vel: new Vec2(0, v), mass: 1,
                       radius: 0.16, color: PALETTE[i % PALETTE.length] }));
    }
    // Remove net drift so the barycentre stays put and p0 is exactly zero.
    let px = 0, py = 0, M = 0;
    for (const b of w.bodies) { px += b.mass * b.vel.x; py += b.mass * b.vel.y; M += b.mass; }
    for (const b of w.bodies) { b.vel.x -= px / M; b.vel.y -= py / M; }
    w.addForce(new NewtonGravity(1.0, 0.05));
    attachCommon(w, state, { gravity: false });
    w.momentumConserved = true;           // isolated: must hold to ~1e-15
    w.markReference();
    return { world: w, view: [-13, 13, -9, 9] };
  },

  // 4. Projectile: the control case. Change integrators here and NOTHING
  //    happens -- constant force is degenerate (Week 2, section 5.5).
  projectile(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(1, Math.min(9, Math.round(state.count / 3)));
    for (let i = 0; i < n; i++) {
      const th = (15 + i * (60 / Math.max(1, n - 1 || 1))) * Math.PI / 180;
      w.add(new Body({ pos: new Vec2(-10, -4),
                       vel: new Vec2(18 * Math.cos(th), 18 * Math.sin(th)),
                       mass: 1, radius: 0.22, color: PALETTE[i % PALETTE.length] }));
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-11, 25, -5, 12] };
  },

  // 5. Pendulum grid: easy to grab, obvious when you inject energy by dragging.
  pendulums(state) {
    Body.resetIds();
    const w = base(state, { bounds: null });
    const n = Math.max(2, Math.min(10, Math.round(state.count / 3)));
    for (let i = 0; i < n; i++) {
      const x = -4.5 + i * (9 / Math.max(1, n - 1));
      const top = w.add(new Body({ pos: new Vec2(x, 3.5), fixed: true,
                                   radius: 0.12, color: '#888' }));
      const L = 1.6 + i * 0.22;
      const bob = w.add(new Body({ pos: new Vec2(x + L * Math.sin(0.5),
                                                 3.5 - L * Math.cos(0.5)),
                                   mass: 1, radius: 0.24,
                                   color: PALETTE[i % PALETTE.length] }));
      w.addForce(new Spring(top, bob, 2500, L, 0));   // stiff spring ~ rigid rod
    }
    attachCommon(w, state, { gravity: true });
    w.markReference();
    return { world: w, view: [-6.5, 6.5, -2.5, 4.5] };
  },

  lunar(state) {
    Body.resetIds();
    const difficulty = LUNAR_DIFFICULTIES[state.difficulty] || LUNAR_DIFFICULTIES.normal;
    const bounds = { xmin: -10, xmax: 10, ymin: 0, ymax: 20 };
    const w = base(state, { bounds, restitution: 0.25 });
    const rnd = mulberry32(state.seed || 0);
    const landerRadius = 0.42;
    const altitudeRange = difficulty.startAltitudeMax - difficulty.startAltitudeMin;
    const lander = w.add(new Body({
      pos: new Vec2(-7 + rnd() * 14, landerRadius + difficulty.startAltitudeMin + rnd() * altitudeRange),
      vel: new Vec2(1.7, -0.8),
      mass: 6900 + difficulty.fuel,
      radius: landerRadius,
      color: '#e6edf3',
      tag: 'lander',
      angle: 0.28
    }));
    const drive = w.addForce(new LanderDrive(lander, {
      gravity: 1.62,
      dryMass: 6900,
      fuelMass: difficulty.fuel,
      maxFuel: difficulty.fuel,
      thrust: 45000,
      throttle: state.throttle,
      isp: 304,
      g0: 9.81
    }));
    w.lander = lander;
    w.landerDrive = drive;
    w.pointer = w.addForce(new PointerSpring());
    w.pointer.enabled = false;
    w.energyMode = 'open';
    w.momentumConserved = false;
    w.mission = {
      status: 'flying',
      message: 'Find the pad. Rotate to steer; hold ↑ to thrust and brake. Fuel is finite.',
      padCenter: 0,
      padHalfWidth: difficulty.padHalfWidth,
      verticalSpeedLimit: 1.8,
      horizontalSpeedLimit: 1.1,
      speedTolerance: 0.001,
      asteroidCount: difficulty.asteroidCount,
      asteroidChance: difficulty.asteroidChance,
      score: 0,
      elapsedTime: null,
      initialFuel: drive.fuel,
      asteroidLaunched: 0,
      nextAsteroidAt: (0.05 + rnd() * 0.08) * difficulty.asteroidCadenceScale,
      asteroidRnd: rnd,
      debrief: null
    };
    w.beforeCollisions = () => {
      if (w.conservativeMode) return;
      if (w.mission.status !== 'flying') return;
      const { xmin, xmax, ymin, ymax } = w.bounds;
      const r = lander.radius;
      const asteroid = w.bodies.find(body => body.tag === 'asteroid' &&
        body.pos.sub(lander.pos).len() < body.radius + r);
      if (asteroid) {
        w.mission.impact = {
          verticalSpeed: lander.vel.y,
          horizontalSpeed: lander.vel.x,
          angle: lander.angle,
          kind: 'asteroid',
          point: new Vec2(
            (lander.pos.x + asteroid.pos.x) * 0.5,
            (lander.pos.y + asteroid.pos.y) * 0.5
          )
        };
        w.mission.status = 'crashed';
        w.mission.message = 'Crash: the lander struck an asteroid.';
        return;
      }
      const sideImpact = lander.pos.x - r < xmin || lander.pos.x + r > xmax;
      const ceilingImpact = lander.pos.y + r > ymax;
      if (sideImpact || ceilingImpact) {
        w.mission.impact = {
          verticalSpeed: lander.vel.y,
          horizontalSpeed: lander.vel.x,
          angle: lander.angle,
          kind: sideImpact ? 'side-wall' : 'ceiling'
        };
        w.mission.status = 'crashed';
        w.mission.message = sideImpact
          ? 'Crash: the lander struck the canyon wall.'
          : 'Crash: the lander struck the canyon ceiling.';
        return;
      }
      if (lander.pos.y - r >= ymin) return;

      w.mission.impact = {
        verticalSpeed: lander.vel.y,
        horizontalSpeed: lander.vel.x,
        angle: lander.angle
      };
      const positionTolerance = 0.001;
      const angleTolerance = 0.01 * Math.PI / 180;
      const onPad = Math.abs(lander.pos.x - w.mission.padCenter)
        <= w.mission.padHalfWidth + positionTolerance;
      const softVerticalSpeed = Math.abs(lander.vel.y)
        <= w.mission.verticalSpeedLimit + w.mission.speedTolerance;
      const softHorizontalSpeed = Math.abs(lander.vel.x)
        <= w.mission.horizontalSpeedLimit + w.mission.speedTolerance;
      const upright = Math.abs(Math.atan2(Math.sin(lander.angle), Math.cos(lander.angle)))
        <= 15 * Math.PI / 180 + angleTolerance;
      if (onPad && softVerticalSpeed && softHorizontalSpeed && upright) {
        w.mission.status = 'landed';
        w.mission.score = 50 + Math.round(50 * drive.fuel / w.mission.initialFuel);
        w.mission.message = 'Touchdown! The lander is safely on the pad.';
      } else {
        w.mission.status = 'crashed';
        if (!onPad) w.mission.message = 'Crash: you missed the landing pad.';
        else if (!upright) w.mission.message = 'Crash: the lander was tilted at touchdown.';
        else w.mission.message = 'Crash: touchdown speed was too high.';
      }
    };
    w.beforeWalls = () => {
      if (w.conservativeMode) return;
      const { padCenter, padHalfWidth } = w.mission;
      for (const body of w.bodies) {
        if (body.tag !== 'asteroid' || body.fixed) continue;
        const clearance = padHalfWidth + body.radius + 0.1;
        const relativeX = body.pos.x - padCenter;
        const height = body.pos.y - bounds.ymin - body.radius - 0.3;
        if (height <= 0 && Math.abs(relativeX) <= clearance) {
          // Keep the asteroid above the pad even after a collision changes its course.
          body.pos.y = bounds.ymin + body.radius + 0.3;
          const speed = body.vel.len();
          body.vel.x *= 0.5;
          body.vel.y = Math.sqrt(Math.max(0, speed * speed - body.vel.x * body.vel.x));
        } else if (height > 0 && height <= 2 && body.vel.y < 0) {
          const impactX = relativeX + body.vel.x * height / -body.vel.y;
          if (Math.abs(impactX) <= clearance) {
            const side = relativeX < 0 ? -1 : relativeX > 0 ? 1 : body.vel.x < 0 ? -1 : 1;
            const dx = side * (clearance + 0.1) - relativeX;
            const distance = Math.hypot(dx, height);
            const speed = body.vel.len();
            body.vel.set(speed * dx / distance, -speed * height / distance);
          }
        }
      }
    };
    w.afterStep = () => {
      if (!w.conservativeMode
          && w.mission.status === 'flying'
          && w.mission.asteroidLaunched < w.mission.asteroidCount
          && w.time >= w.mission.nextAsteroidAt
          && w.time <= 8) {
        const rnd = w.mission.asteroidRnd;
        const fromLeft = rnd() < 0.5;
        const altitude = 5 + rnd() * 10;
        const speed = (1.8 + rnd() * 2.4) * difficulty.asteroidSpeedScale;
        const horizontalDirection = rnd() < 0.5 ? -1 : 1;
        const launchedEarly = w.mission.asteroidLaunched < 3;
        const verticalDirection = -(1.2 + rnd() * 1.8);
        w.add(new Body({
          pos: new Vec2(fromLeft ? -9.2 : 9.2, altitude),
          vel: new Vec2(horizontalDirection * speed, verticalDirection),
          mass: 350,
          radius: 0.2,
          color: '#8e8578',
          tag: 'asteroid'
        }));
        w.mission.asteroidLaunched++;
        w.mission.nextAsteroidAt = launchedEarly
          ? w.time + (0.08 + rnd() * 0.10) * difficulty.asteroidCadenceScale
          : w.time + (0.35 + rnd() * 0.55) * difficulty.asteroidCadenceScale;
      }
      if (w.mission.status === 'flying') {
        w.mission.elapsedTime = w.time;
      } else if (w.mission.elapsedTime === null) {
        w.mission.elapsedTime = w.time;
      }
      if (w.mission.status !== 'flying' && w.mission.debrief === null) {
        w.mission.debrief = {
          outcome: w.mission.status,
          score: w.mission.score,
          elapsedTime: w.mission.elapsedTime,
          fuelUsed: w.mission.initialFuel - drive.fuel,
          fuelRemaining: drive.fuel
        };
      }
      if (w.conservativeMode || w.mission.status === 'flying') {
        return;
      }
      if (lander.fixed) return;
      w.inelastic += lander.kinetic();
      lander.vel.set(0, 0);
      lander.fixed = true;
      lander.invMass = 0;
      drive.thrusting = false;
      drive.rotation = 0;
    };
    w.markReference();
    return { world: w, view: [-11, 11, -1, 21] };
  }
};

export function setConservativeMode(world, enabled) {
  if (!world.landerDrive) {
    world.conservativeMode = false;
    return;
  }
  world.conservativeMode = Boolean(enabled);
  world.landerDrive.thrusting = false;
  world.landerDrive.rotation = 0;
  world.restitution = enabled ? 1 : 0.25;
  world.energyMode = enabled ? 'closed' : 'open';
}

export const SCENE_LIST = [
  ['billiards',  'Billiards in a box'],
  ['chain',      'Spring chain'],
  ['orbits',     'N-body orbits'],
  ['projectile', 'Projectile (control case)'],
  ['pendulums',  'Pendulum row'],
  ['lunar',      'Lunar lander']
];

export { mulberry32 };
