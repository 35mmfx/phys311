# Spike Findings — variable-mass lunar landing

**Risk tested:** Will finite fuel and the changing thrust-to-mass ratio make a soft landing too difficult to control?
**Code:** `spike.js` (run `node spike.js`; recorded output is in `output.txt`).

## What I tried

I built a disposable one-dimensional model: one lander, lunar gravity, 8 kN upward thrust, 150 kg of propellant, 1,000 kg dry mass, and a flat surface. From 12 m, descending at 6 m/s, I tested 651 combinations of thrust delay and burn duration at `DT = 1/240 s`. The model updated mass as fuel burned, checked the fuel/mass bounds, measured touchdown speed, and applied a simple restitution response. I compared the same schedules with mass held constant.

## What happened

Thirty-five variable-mass schedules landed at or below 1.8 m/s, with safe thrust delays from 0.85–0.95 s. A 0.90 s delay and 1.35 s burn touched down at -1.004 m/s with 146.34 kg of fuel remaining; holding mass constant changed impact speed to -0.998 m/s. The fixed-mass sweep had 36 safe schedules. Fuel/mass checks passed and the impact produced a small rebound. The timing matters, but this model cannot tell whether players will find the safe window.

## Scope decision

I am **keeping variable-mass thrust in MUST**, not moving it to COULD: safe, fuel-bounded landings were possible, and mass change had a modest effect in this starting case. The spike does not test lateral control, attitude, or player reaction time, so it cannot establish whether real players can land reliably. Keep the proposal's wider-pad/lower-start fallback and test playability while tuning.
