// engine/Accumulator.js -- fixed physics timestep, variable render rate.
//
// Never integrate with the wall-clock frame time: a 144 Hz monitor would
// get different physics from a 60 Hz one, and a stalled tab would get a
// single catastrophic step. Consume real time in fixed DT chunks instead.

export class Accumulator {
  constructor(DT = 1 / 240, maxFrame = 0.25) {
    this.DT = DT;            // fixed physics step (s)
    this.maxFrame = maxFrame;// clamp: refuse to simulate more than this per frame
    this.acc = 0;
    this.lastMs = null;
    this.stepsLastFrame = 0;
    this.clamped = false;
  }

  reset() { this.acc = 0; this.lastMs = null; }

  // cb(DT) is called 0..N times. Returns alpha in [0,1) for render
  // interpolation between the last two physics states.
  advance(nowMs, cb) {
    if (this.lastMs === null) { this.lastMs = nowMs; return 0; }
    let frame = (nowMs - this.lastMs) / 1000;   // ms -> SECONDS
    this.lastMs = nowMs;

    this.clamped = frame > this.maxFrame;
    if (this.clamped) frame = this.maxFrame;    // avoid the spiral of death

    this.acc += frame;
    let n = 0;
    while (this.acc >= this.DT) { cb(this.DT); this.acc -= this.DT; n++; }
    this.stepsLastFrame = n;
    return this.acc / this.DT;                  // leftover fraction
  }
}
