# Week 12 Decisions

## 2026-11-25 — Hard-mode altitude, fuel, and asteroid count
Did: set hard mode to 60 kg starting fuel, 10 asteroids every start, and a
15–18 m seeded starting altitude. Easy and normal retain 10–14 m starts.
Why: make hard mode increase both final-descent time and obstacle density
without changing the safe-touchdown limits.

## 2026-11-23 — Fuel efficiency score and difficulty reserves
Planned: award 100 points for any safe landing.
Did: award 50–100 points for safe landings based on the fraction of starting fuel remaining; crashes score 0. Set Easy/Normal/Hard starting fuel to 300/200/60 kg.
Why: make fuel efficiency meaningful and increase the challenge while explaining the score to players.

## 2026-11-18 — Apollo-inspired final approach
Planned: use the simplified lander with 15 kg of propellant.
Did: start a short final approach with 300 kg remaining from an 8,200 kg
descent tank, 6,900 kg of other mass, and a 45 kN throttleable engine.
Why: approximate the late landing phase without replacing the game with an
orbital descent. Throttle is continuous for gameplay; orbital braking and
the preceding propellant burn are not simulated.

## 2026-11-18 — Reduce fuel reserve to 15 kg
Planned: start each lunar mission with 25 kg of fuel.
Did: reduce the starting reserve and capacity to 15 kg.
Why: match the requested fuel reserve.

## 2026-11-18 — Reduce fuel reserve
Planned: start each lunar mission with 50 kg of fuel.
Did: reduce the starting reserve and capacity to 25 kg.
Why: the requested starting reserve is half the previous amount.

## 2026-11-18 — Randomized lunar missions
Planned: use the same fixed lunar start and 150 kg fuel reserve on every run.
Did: reduce fuel to 50 kg, randomize the seeded start within x = -7 to 7 m and altitude = 10 to 14 m, and add an asteroid hazard to about one in three starts.
Why: each restart offers a more varied challenge while seeded URLs remain reproducible; mission time freezes when the lander lands or crashes.

## 2026-11-18 — Remove optional integrator race
Planned: keep the side-by-side integrator race as an inherited Lab 10 demonstration.
Did: remove the race UI and its runtime wiring; keep the individual integrator setting and legacy scenes.
Why: the Week 12 assignment prioritizes the proposal's MUST tier and does not request the race.

## 2026-11-16 — Score definition
Planned: the proposal requires a score HUD but does not define a scoring scale.
Did: award 100 points for a safe landing and 0 while flying or after a crash.
Why: it makes the required score visible and meaningful without adding another progression system.

## 2026-11-16 — Touchdown tolerances
Planned: compare contact position, speed, and attitude with the proposal limits.
Did: allow 0.001 m, 0.001 m/s, and 0.01° tolerance at the inclusive limits.
Why: these are the tolerances specified in the proposal and prevent floating-point edge cases from rejecting a boundary pass.

## 2026-11-16 — Conservative test mode
Planned: isolate the lunar model's conservative dynamics for debugging.
Did: disable thrust/steering and scripted landing, and set restitution to 1.
Why: an automatic landing freeze would remove energy even though all modeled forces and contacts are conservative.
