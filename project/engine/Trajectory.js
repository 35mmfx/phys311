import { World } from './World.js';
import { LanderDrive } from './Forces.js';

// Project the current thrust setting with attitude held fixed; never mutate the live world.
export function predictLanding(world) {
  if (!world.lander || !world.mission || world.mission.status !== 'flying') return null;
  const source = world.lander, drive = world.landerDrive;
  const body = Object.assign(Object.create(Object.getPrototypeOf(source)), source, {
    pos: source.pos.clone(), vel: source.vel.clone(),
    acc: source.acc.clone(), force: source.force.clone()
  });
  const prediction = new World({ dt: Math.max(world.DT, 1 / 60) });
  prediction.integrator = world.integrator;
  prediction.add(body);
  const projectedDrive = prediction.addForce(new LanderDrive(body, {
    gravity: drive.g, thrust: drive.thrust, rotationRate: drive.rotationRate,
    dryMass: drive.dryMass, fuelMass: drive.fuel, maxFuel: drive.maxFuel,
    isp: drive.isp, g0: drive.g0, throttle: drive.throttle
  }));
  projectedDrive.thrusting = drive.thrusting && !world.conservativeMode;

  const points = [{ x: body.pos.x, y: body.pos.y }];
  const { xmin, xmax, ymin, ymax } = world.bounds;
  const limits = [
    { kind: 'floor', axis: 'y', value: ymin + body.radius, sign: -1 },
    { kind: 'wall', axis: 'x', value: xmin + body.radius, sign: -1 },
    { kind: 'wall', axis: 'x', value: xmax - body.radius, sign: 1 },
    { kind: 'ceiling', axis: 'y', value: ymax - body.radius, sign: 1 }
  ];
  const maxSteps = Math.ceil(30 / prediction.DT);
  for (let i = 0; i < maxSteps; i++) {
    const previous = { x: body.pos.x, y: body.pos.y };
    prediction.stepOnce();
    let hit = null;
    for (const limit of limits) {
      const start = previous[limit.axis], end = body.pos[limit.axis];
      if (limit.sign * (end - limit.value) < 0) continue;
      const fraction = end === start ? 0 : (limit.value - start) / (end - start);
      if (fraction >= 0 && fraction <= 1 && (!hit || fraction < hit.fraction))
        hit = { kind: limit.kind, fraction };
    }
    if (hit) {
      const point = {
        x: previous.x + (body.pos.x - previous.x) * hit.fraction,
        y: previous.y + (body.pos.y - previous.y) * hit.fraction
      };
      points.push(point);
      return { points, kind: hit.kind, position: point, time: (i + hit.fraction) * prediction.DT };
    }
    if ((i + 1) % 6 === 0) points.push({ x: body.pos.x, y: body.pos.y });
  }
  points.push({ x: body.pos.x, y: body.pos.y });
  return { points, kind: 'none', position: null, time: 30 };
}
