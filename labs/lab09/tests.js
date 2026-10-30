import { Body } from "./engine/body.js";
import { resolvePair } from "./engine/collisions.js";
import { VelocityVerlet } from "./engine/integrators.js";
import { World } from "./engine/world.js";
import { Vec2 } from "./engine/vec2.js";
import { seededRandom } from "./engine/random.js";
import {
  createBilliards,
  createGravityOrbit,
  createJitterDemo,
  createRotationDemo
} from "./scenes.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function relativeDifference(current, initial) {
  return Math.abs(current - initial) / Math.max(Math.abs(initial), 1e-12);
}

function runGasCondition(restitution, duration = 60, collisionMode = "grid") {
  const world = createBilliards({ restitution });
  world.bounds = null;
  world.collisionMode = collisionMode;
  world.captureBaseline();
  const initialEnergy = world.totalEnergy();
  const initialMomentum = world.totalMomentum();
  const momentumScale = Math.max(initialMomentum.length(), 1);
  const steps = Math.round(duration * 240);
  let previousEnergy = initialEnergy;
  let monotonicEnergy = true;

  for (let i = 0; i < steps; i++) {
    world.step(1 / 240);
    const energy = world.totalEnergy();
    if (energy > previousEnergy + 1e-10 * Math.max(initialEnergy, 1)) {
      monotonicEnergy = false;
    }
    previousEnergy = energy;
  }

  return {
    world,
    momentumDrift: world.totalMomentum().sub(initialMomentum).length() / momentumScale,
    initialMomentum: initialMomentum.length(),
    finalMomentum: world.totalMomentum().length(),
    energyDrift: relativeDifference(world.totalEnergy(), initialEnergy),
    energyDecreased: world.totalEnergy() < initialEnergy,
    monotonicEnergy,
    initialEnergy,
    finalEnergy: world.totalEnergy()
  };
}

function check(name, run) {
  try {
    const detail = run();
    return { name, passed: true, detail };
  } catch (error) {
    return { name, passed: false, detail: error.message };
  }
}

export function runValidation() {
  return [
    check("Elastic isolated gas: momentum and energy (60 s)", () => {
      const result = runGasCondition(1);
      assert(result.momentumDrift < 1e-10, `relative momentum drift ${result.momentumDrift}`);
      assert(result.energyDrift < 1e-8, `relative energy drift ${result.energyDrift}`);
      return `|p|: ${result.initialMomentum.toFixed(6)} → ${result.finalMomentum.toFixed(6)}, E: ${result.initialEnergy.toFixed(6)} → ${result.finalEnergy.toFixed(6)} J, ΔE/E₀=${result.energyDrift.toExponential(3)}`;
    }),
    check("Inelastic isolated gas: e=0.8 (60 s)", () => {
      const result = runGasCondition(0.8);
      assert(result.momentumDrift < 1e-10, `relative momentum drift ${result.momentumDrift}`);
      assert(result.energyDecreased, "mechanical energy did not decrease");
      assert(result.monotonicEnergy, "mechanical energy increased between steps");
      return `|p|: ${result.initialMomentum.toFixed(6)} → ${result.finalMomentum.toFixed(6)}, E: ${result.initialEnergy.toFixed(6)} → ${result.finalEnergy.toFixed(6)} J, ΔE/E₀=${(-result.energyDrift).toExponential(3)}, monotonic decrease`;
    }),
    check("Three-body softened gravity: 60 s", () => {
      const world = createGravityOrbit();
      world.integrator = new VelocityVerlet();
      world.captureBaseline();
      const initialEnergy = world.totalEnergy();
      const initialMomentum = world.totalMomentum();
      const steps = 60 * 600;
      for (let i = 0; i < steps; i++) world.step(1 / 600);
      assert(world.bodies.every((body) =>
        [body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite)
      ), "a body became non-finite");
      const energyDrift = relativeDifference(world.totalEnergy(), initialEnergy);
      assert(energyDrift < 1e-4, `relative energy drift ${energyDrift}`);
      const momentumDrift = world.totalMomentum().sub(initialMomentum).length();
      return `ΔE/E₀=${energyDrift.toExponential(3)}, |Δp|=${momentumDrift.toExponential(3)}, t=${world.time.toFixed(1)} s`;
    }),
    check("Separating guard prevents jitter impulse", () => {
      const good = createJitterDemo();
      const a = good.bodies[0];
      const b = good.bodies[1];
      const initialVelocity = a.vel.x;
      for (let i = 0; i < 20; i++) good.step(1 / 240);
      assert(a.vel.x === initialVelocity, "guarded separating pair received an impulse");

      const broken = createJitterDemo({ disabledGuard: true });
      let previousSign = Math.sign(broken.bodies[0].vel.x);
      let reversals = 0;
      for (let i = 0; i < 20; i++) {
        broken.step(1 / 240);
        const sign = Math.sign(broken.bodies[0].vel.x);
        if (sign !== previousSign) reversals++;
        previousSign = sign;
      }
      assert(reversals >= 3, `only ${reversals} spurious velocity reversals`);
      return `guarded reversals=0; guard-disabled false reversals=${reversals}`;
    }),
    check("Elastic overlap resolution conserves momentum", () => {
      const a = new Body({
        pos: new Vec2(-0.4, 0), vel: new Vec2(1, 0), mass: 2, radius: 0.5
      });
      const b = new Body({
        pos: new Vec2(0.4, 0), vel: new Vec2(-1, 0), mass: 3, radius: 0.5
      });
      const momentumBefore = 2 * a.vel.x + 3 * b.vel.x;
      assert(resolvePair(a, b, 1), "overlapping bodies did not resolve");
      const momentumAfter = 2 * a.vel.x + 3 * b.vel.x;
      assert(Math.abs(momentumAfter - momentumBefore) < 1e-12, "pair impulse changed momentum");
      return `momentum before=${momentumBefore.toFixed(6)}, after=${momentumAfter.toFixed(6)}`;
    }),
    check("Spatial grid matches all-pairs physics", () => {
      const grid = runGasCondition(1, 20, "grid");
      const bruteForce = runGasCondition(1, 20, "bruteForce");
      const gridState = worldStateValues(grid.world);
      const bruteForceState = worldStateValues(bruteForce.world);
      assert(statesMatch(gridState, bruteForceState), "grid and brute-force final states differ");
      assert(grid.momentumDrift < 1e-10, `grid momentum drift ${grid.momentumDrift}`);

      const makeMixedRadiusWorld = (collisionMode) => {
        const random = seededRandom(442);
        const world = new World({ collisionMode, restitution: 0.9 });
        for (let i = 0; i < 30; i++) {
          world.add(new Body({
            pos: new Vec2((random() - 0.5) * 8, (random() - 0.5) * 8),
            vel: new Vec2((random() - 0.5) * 2, (random() - 0.5) * 2),
            mass: 0.5 + random(),
            radius: 0.08 + random() * 0.5
          }));
        }
        return world;
      };
      const mixedGrid = makeMixedRadiusWorld("grid");
      const mixedBruteForce = makeMixedRadiusWorld("bruteForce");
      for (let i = 0; i < 600; i++) {
        mixedGrid.step(1 / 240);
        mixedBruteForce.step(1 / 240);
      }
      assert(
        statesMatch(worldStateValues(mixedGrid), worldStateValues(mixedBruteForce)),
        "grid and all-pairs diverged for mixed radii"
      );
      return `20-body 20 s and mixed-radius 30-body runs are bit-identical; grid momentum drift=${grid.momentumDrift.toExponential(3)}`;
    }),
    check("Torque-free rotation conserves angular momentum", () => {
      const world = createRotationDemo();
      const initialAngularMomentum = world.totalAngularMomentum();
      const initialAngle = world.bodies[0].theta;
      for (let i = 0; i < 60 * 240; i++) world.step(1 / 240);
      assert(world.bodies[0].theta !== initialAngle, "rotation did not advance");
      assert(
        world.totalAngularMomentum() === initialAngularMomentum,
        `angular momentum changed from ${initialAngularMomentum} to ${world.totalAngularMomentum()}`
      );
      return `L=${initialAngularMomentum.toFixed(6)} → ${world.totalAngularMomentum().toFixed(6)} kg·m²/s over ${world.time.toFixed(1)} s`;
    }),
    check("Applied torque changes angular velocity", () => {
      const world = new World();
      const body = world.add(new Body({
        mass: 2,
        radius: 1,
        I: 4
      }));
      world.addForce({
        apply(currentWorld) {
          currentWorld.bodies[0].applyTorque(8);
        }
      });
      world.step(0.1);
      assert(Math.abs(body.omega - 0.2) < 1e-12, `unexpected angular velocity ${body.omega}`);
      assert(Math.abs(body.theta - 0.02) < 1e-12, `unexpected angle ${body.theta}`);
      return `I=${body.I.toFixed(1)}, τ=8 N·m → ω=${body.omega.toFixed(3)} rad/s`;
    }),
    check("Seeded fixed-step replay is bit-identical", () => {
      const result = runDeterministicReplay(() => {
        const world = createBilliards({ restitution: 1 });
        world.bounds = null;
        return world;
      });
      assert(result.identical, "repeated seeded runs produced different final state values");
      return `${result.valuesCompared} final values match exactly after ${result.duration.toFixed(1)} s`;
    })
  ];
}

function worldStateValues(world) {
  const values = [world.time, world.bodies.length];
  for (const body of world.bodies) {
    values.push(
      body.m,
      body.radius,
      body.I,
      body.pos.x,
      body.pos.y,
      body.vel.x,
      body.vel.y,
      body.theta,
      body.omega,
      body.acc.x,
      body.acc.y,
      body.force.x,
      body.force.y,
      body.torque,
      body.angularAcc
    );
  }
  return values;
}

function statesMatch(first, second) {
  return first.length === second.length
    && first.every((value, index) => Object.is(value, second[index]));
}

export function runDeterministicReplay(
  worldFactory,
  { duration = 10, dt = 1 / 240 } = {}
) {
  if (typeof worldFactory !== "function") {
    throw new TypeError("Replay requires a function that creates a fresh world.");
  }
  if (!Number.isFinite(duration) || duration <= 0
    || !Number.isFinite(dt) || dt <= 0) {
    throw new RangeError("Replay duration and time step must be positive finite numbers.");
  }

  const steps = Math.round(duration / dt);
  const first = worldFactory();
  const second = worldFactory();
  const initialStatesMatch = statesMatch(
    worldStateValues(first),
    worldStateValues(second)
  );
  for (let i = 0; i < steps; i++) {
    first.step(dt);
    second.step(dt);
  }
  const firstState = worldStateValues(first);
  const secondState = worldStateValues(second);
  return {
    identical: initialStatesMatch && statesMatch(firstState, secondState),
    duration: steps * dt,
    steps,
    bodyCount: first.bodies.length,
    valuesCompared: firstState.length
  };
}

function createBroadPhaseWorld(count, collisionMode) {
  const random = seededRandom(9000 + count);
  const world = new World({ restitution: 1, collisionMode });
  for (let i = 0; i < count; i++) {
    world.add(new Body({
      pos: new Vec2((random() - 0.5) * 40, (random() - 0.5) * 40),
      vel: new Vec2(random() - 0.5, random() - 0.5),
      mass: 0.8 + random() * 0.4,
      radius: 0.2
    }));
  }
  return world;
}

export function runBroadPhaseBenchmarks() {
  const rows = [];
  const dt = 1 / 240;
  const warmupSteps = 10;
  const measuredSteps = 120;
  for (const count of [200, 500]) {
    const bruteForce = createBroadPhaseWorld(count, "bruteForce");
    const grid = createBroadPhaseWorld(count, "grid");
    const initialMomentum = grid.totalMomentum();
    for (let i = 0; i < warmupSteps; i++) {
      bruteForce.step(dt);
      grid.step(dt);
    }

    const measure = (world) => {
      let checks = 0;
      const start = performance.now();
      for (let i = 0; i < measuredSteps; i++) {
        world.step(dt);
        checks += world.pairChecks;
      }
      return {
        millisecondsPerStep: (performance.now() - start) / measuredSteps,
        checksPerStep: checks / measuredSteps
      };
    };
    const bruteForceResult = measure(bruteForce);
    const gridResult = measure(grid);
    assert(
      statesMatch(worldStateValues(bruteForce), worldStateValues(grid)),
      `grid and brute-force physics differ at ${count} bodies`
    );
    const momentumDrift = grid.totalMomentum().sub(initialMomentum).length();
    assert(momentumDrift < 1e-10, `grid momentum drift is ${momentumDrift} at ${count} bodies`);
    rows.push({
      count,
      bruteForceMs: bruteForceResult.millisecondsPerStep,
      gridMs: gridResult.millisecondsPerStep,
      speedup: bruteForceResult.millisecondsPerStep / gridResult.millisecondsPerStep,
      bruteForceChecks: bruteForceResult.checksPerStep,
      gridChecks: gridResult.checksPerStep
    });
  }
  return rows;
}

export async function runPerformanceBenchmarks(currentWorld, renderer) {
  const camera = renderer.camera;
  const oldCamera = {
    scale: camera.scale,
    originX: camera.originX,
    originY: camera.originY
  };
  const rows = [];

  try {
    for (const count of [20, 50, 100, 200]) {
      const random = seededRandom(9000 + count);
      const world = new World({
        bounds: { xMin: -12, xMax: 12, yMin: -12, yMax: 12 },
        restitution: 1
      });
      const columns = Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const column = i % columns;
        const row = Math.floor(i / columns);
        world.add(new Body({
          pos: new Vec2(
            (column - columns / 2) * 1.1,
            (row - Math.ceil(count / columns) / 2) * 1.1
          ),
          vel: new Vec2(random() - 0.5, random() - 0.5),
          radius: 0.2
        }));
      }

      camera.scale = Math.min(renderer.canvas.clientWidth / 26, renderer.canvas.clientHeight / 26);
      camera.originX = renderer.canvas.clientWidth / 2;
      camera.originY = renderer.canvas.clientHeight / 2;
      const sample = await new Promise((resolve) => {
        let frameCount = 0;
        let physicsTime = 0;
        let renderTime = 0;
        let accumulator = 0;
        let previousTime = null;
        let startedAt = null;

        const measureFrame = (timestamp) => {
          if (startedAt === null) startedAt = timestamp;
          if (previousTime !== null) {
            accumulator += Math.min((timestamp - previousTime) / 1000, 0.1);
          }
          previousTime = timestamp;

          while (accumulator >= 1 / 120) {
            const start = performance.now();
            world.step(1 / 120);
            physicsTime += performance.now() - start;
            accumulator -= 1 / 120;
          }

          const renderStart = performance.now();
          renderer.draw(world);
          renderTime += performance.now() - renderStart;
          frameCount++;

          if (timestamp - startedAt >= 1000) {
            const elapsedMs = timestamp - startedAt;
            resolve({
              fps: frameCount * 1000 / elapsedMs,
              physicsMs: physicsTime / frameCount,
              renderMs: renderTime / frameCount
            });
          } else {
            requestAnimationFrame(measureFrame);
          }
        };

        requestAnimationFrame(measureFrame);
      });

      rows.push({
        count,
        physicsMs: sample.physicsMs,
        renderMs: sample.renderMs,
        fps: sample.fps
      });
    }
  } finally {
    camera.scale = oldCamera.scale;
    camera.originX = oldCamera.originX;
    camera.originY = oldCamera.originY;
    renderer.draw(currentWorld);
  }

  return rows;
}
