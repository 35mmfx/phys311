import { SCENES } from './scenes.js';

const END_TIME = 2.0;
const TIMESTEPS = [1 / 30, 1 / 60, 1 / 120, 1 / 240, 1 / 480, 1 / 960];
const STATE = {
  integrator: 'verlet',
  restitution: 0.25,
  gravity: 1.62,
  drag: 0,
  speed: 1,
  count: 24,
  seed: 1,
  throttle: 0.6
};

function run(dt) {
  const { world } = SCENES.lunar({ ...STATE, dt });
  if (world.bodies.length !== 1) {
    throw new Error('Convergence setup must contain only the lander.');
  }

  world.landerDrive.thrusting = true;
  const steps = Math.round(END_TIME / dt);
  for (let i = 0; i < steps; i++) world.step(dt);

  if (Math.abs(world.time - END_TIME) > 1e-10) {
    throw new Error(`Run ended at t = ${world.time}, not ${END_TIME} s.`);
  }
  if (world.mission.status !== 'flying') {
    throw new Error(`Mission ended before t = ${END_TIME} s at dt = ${dt}.`);
  }
  return { dt, steps, y: world.lander.pos.y };
}

const runs = TIMESTEPS.map(run);
const reference = runs[runs.length - 1];
const errors = runs.map(result => Math.abs(result.y - reference.y));
const ratios = errors.map((error, i) =>
  i > 0 && error > 0 ? errors[i - 1] / error : null
);

// Use successive observable differences to estimate order without bias from
// measuring every error against a finite-resolution reference.
const differences = runs.slice(0, -1).map((result, i) =>
  Math.abs(result.y - runs[i + 1].y)
);
if (differences.some(difference => !Number.isFinite(difference) || difference === 0)) {
  throw new Error('Adjacent runs must produce finite, distinct observables.');
}
const orders = differences.slice(0, -1).map((difference, i) =>
  Math.log2(difference / differences[i + 1])
);
const sortedOrders = [...orders].sort((a, b) => a - b);
const middle = Math.floor(sortedOrders.length / 2);
const estimatedOrder = sortedOrders.length % 2
  ? sortedOrders[middle]
  : (sortedOrders[middle - 1] + sortedOrders[middle]) / 2;

console.log(`Lunar thrust flight: t = ${END_TIME.toFixed(1)} s, Velocity Verlet`);
console.log('dt (s)       steps   lander y (m)     error vs. finest (m)   error ratio');
for (let i = 0; i < runs.length; i++) {
  const result = runs[i];
  const ratio = ratios[i] === null ? '-' : ratios[i].toFixed(3);
  console.log(
    `${result.dt.toFixed(7)}  ${String(result.steps).padStart(5)}   ` +
    `${result.y.toFixed(9)}   ${errors[i].toExponential(3).padStart(18)}   ${ratio}`
  );
}
console.log(`Finest-run reference: dt = ${reference.dt.toFixed(7)} s`);
console.log(`Estimated convergence order: ${estimatedOrder.toFixed(2)}`);
