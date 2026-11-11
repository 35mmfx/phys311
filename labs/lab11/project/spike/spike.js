// Disposable one-body vertical-thrust spike. Run with: node spike.js
// No UI and no imports from the project engine.
const G = 1.62;
const THRUST = 8000;
const ISP = 300;
const G0 = 9.81;
const DRY_MASS = 1000;
const INITIAL_FUEL = 150;
const RADIUS = 0.42;
const DT = 1 / 240;
const RESTITUTION = 0.25;
const SAFE_SPEED = 1.8;

function run(delay, burnDuration, variableMass = true) {
  let y = 12;
  let vy = -6;
  let mass = DRY_MASS + INITIAL_FUEL;
  let fuel = INITIAL_FUEL;
  let time = 0;

  for (let step = 0; step < 15 / DT; step++) {
    const throttle = time >= delay && time < delay + burnDuration && fuel > 0 ? 1 : 0;
    const burned = Math.min(fuel, THRUST * throttle * DT / (ISP * G0));
    const forceMass = variableMass ? mass - burned / 2 : mass;
    const acceleration = THRUST * throttle / forceMass - G;
    y += vy * DT + 0.5 * acceleration * DT * DT;
    vy += acceleration * DT;
    fuel -= burned;
    if (variableMass) mass -= burned;
    time += DT;

    if (y <= RADIUS) {
      const impactSpeed = vy;
      y = RADIUS;
      vy = -RESTITUTION * vy;
      return {
        delay,
        burnDuration,
        time,
        impactSpeed,
        reboundSpeed: vy,
        fuelRemaining: fuel,
        mass,
        safe: Math.abs(impactSpeed) <= SAFE_SPEED
      };
    }
  }
  return null;
}

function sweep(variableMass) {
  const landings = [];
  let invalidState = false;
  for (let delay = 0.5; delay <= 1.5001; delay += 0.05) {
    for (let duration = 0.5; duration <= 2.0001; duration += 0.05) {
      const result = run(Number(delay.toFixed(2)), Number(duration.toFixed(2)), variableMass);
      if (!result) continue;
      if (result.fuelRemaining < -1e-10 || result.mass < DRY_MASS - 1e-10) {
        invalidState = true;
      }
      if (result.safe) landings.push(result);
    }
  }
  return { landings, invalidState };
}

function formatRange(results, key) {
  if (!results.length) return 'none';
  const values = results.map(result => result[key]);
  return `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)} s`;
}

function runSpike() {
  const variable = sweep(true);
  const fixed = sweep(false);
  const example = run(0.90, 1.35, true);
  const fixedExample = run(0.90, 1.35, false);
  if (!example || !fixedExample || variable.invalidState || fixed.invalidState) {
    throw new Error('Spike failed a fuel, mass, or landing-state check.');
  }
  if (variable.landings.length === 0 || fixed.landings.length === 0) {
    throw new Error('No safe landing was found in the tested control range.');
  }

  return [
    'Vertical lander risk spike — variable mass and finite fuel',
    `Model: one body, lunar gravity, vertical 8 kN thrust, flat-pad contact; dt=${DT.toFixed(6)} s.`,
    `Start: y=12 m, vy=-6 m/s, mass=${(DRY_MASS + INITIAL_FUEL)} kg; dry mass=${DRY_MASS} kg; fuel=${INITIAL_FUEL} kg.`,
    `Control sweep: ${variable.landings.length}/651 variable-mass schedules landed at <=${SAFE_SPEED} m/s.`,
    `Safe timing window: thrust delay ${formatRange(variable.landings, 'delay')}; burn duration ${formatRange(variable.landings, 'burnDuration')}.`,
    `Representative schedule (0.90 s delay, 1.35 s burn): impact=${example.impactSpeed.toFixed(3)} m/s, fuel=${example.fuelRemaining.toFixed(2)} kg, mass=${example.mass.toFixed(2)} kg.`,
    `Same schedule with mass artificially held constant: impact=${fixedExample.impactSpeed.toFixed(3)} m/s.`,
    `Fixed-mass comparison: ${fixed.landings.length}/651 schedules landed at <=${SAFE_SPEED} m/s.`,
    `Collision response: e=${RESTITUTION}; rebound speed=${example.reboundSpeed.toFixed(3)} m/s. Fuel/mass lower-bound checks passed.`
  ].join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runSpike };
  if (require.main === module) console.log(runSpike());
}
