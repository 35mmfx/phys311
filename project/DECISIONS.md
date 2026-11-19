# Week 12 Decisions

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
