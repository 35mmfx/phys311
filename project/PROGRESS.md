# Week 12 Progress Log

**Status date:** 2026-11-18 — deployed; automated checks pass; manual browser/device checks and external discussion posts remain.

## MUST tier status

| Item | Status | Notes |
|---|---|---|
| Single lunar scene, finite fuel, variable mass | done | 1,000 kg dry mass + up to 150 kg fuel; mass updates at the step midpoint. |
| Clear landing/crash outcomes | done | Pad, speed, and attitude checks run before contact response. |
| Keyboard and touch controls | done | Arrow/WASD keyboard controls and press-and-hold touch buttons; smoke-tested. |
| Pause, step, reset | done | Reset rebuilds the scene and re-baselines `E₀`. |
| HUD: altitude, speed, attitude, fuel, score | done | Score is 100 for a safe landing and 0 otherwise. |
| Fixed timestep | done | `DT = 1/240 s`; automated 60 Hz, 144 Hz, and jittered-frame checks pass. |
| DevTools CPU-throttling verification | deferred | Still needs a manual browser check. |
| Debug HUD | done | All seven required diagnostics; 1% drift tolerance is identified and color-coded. |
| Conservative test mode | done | Thrust/steering disabled, restitution set to 1, and scripted impact freeze disabled. |
| Proposal physics checks | done | Rocket equation, 60 s unpowered free fall, fuel bounds, and touchdown boundaries pass. |
| Controls/model documentation | done | See [`README.md`](./README.md). |
| GitHub Pages deployment and live-site check | done | Deployed at `https://35mmfx.github.io/phys311/project/`; fresh-browser load, normal controls, console, and network requests checked. |

## Proposal validation results

| Test | Expected | Measured | Result |
|---|---|---|---|
| Rocket equation, nominal 100 kg burn | Relative Δv error < 1% | 100.00000 kg burned; Δv = 267.730 m/s; relative error = `8.634e-10%` | pass |
| Unpowered lunar free fall, 60 s | `|ΔE/E₀| < 1e-8` | `1.142e-10` | pass |
| Fuel depletion | Fuel ≥ 0, mass ≥ 1,000 kg, thrust stops | Fuel = 0, mass = 1,000 kg, thrusting = false | pass |
| Touchdown limits | Center case passes; each over-limit case fails | Center and exact inclusive limits pass; 1.46 m, 1.81 m/s, 1.11 m/s, and 16° fail | pass |

The test runner also verifies the fixed-step accumulator: both 60 Hz and
144 Hz produce 2,400 steps over 10 seconds; the jittered sequence produces
10.0083 seconds. A two-second stall is capped at eight substeps. Final local
test totals: **55 physics/publishing checks and 29 browser-entry checks passed**.

## Bonus convergence check

The position-dependent spring chain was run for 10 seconds at
`DT = 1/240 s`, `1/480 s`, and `1/960 s`. After DT halving, the maximum
position difference between runs decreases, confirming numerical convergence:
18.22 m between 1/240 and 1/480 s, and 15.09 m between 1/480 and 1/960 s.

## Recent visual polish

The lander now has a shaded metallic hull, canopy, and UT Mission side decal.
A fading dust plume is rendered only when vertical or horizontal touchdown
speed exceeds the safe limit; slow missed-pad and tilted crashes do not emit
dust. On narrow screens, touch controls overlay the bottom of the canvas to
keep the lander visible during play. These effects do not change the simulation
physics.

## Decisions

See [`DECISIONS.md`](./DECISIONS.md) for the score rule, numerical tolerances,
and conservative-mode behavior selected this week.

## Bugs fixed

1. **Boundary touchdown could fail due to floating-point edge values.**
   Symptom: an exact pad/speed/attitude limit could be treated as outside the
   inclusive limit. Cause: the comparisons omitted the proposal's numerical
   tolerances. Fix: apply the documented 0.001 m, 0.001 m/s, and 0.01° margins;
   the exact-limit regression test now passes.
2. **Lunar restitution could be overwritten by a shared settings value.**
   Symptom: a live settings update could replace the mission's specified
   `e = 0.25` with the generic `0.95` value. Cause: the shared live-update path
   applied its restitution value to every scene. Fix: preserve the lunar
   scene's specified restitution and only switch it to `e = 1` in conservative
   mode.

## Remaining Week 12 work

- Verify CPU throttling in DevTools and test the touch controls on a real
  phone; the automated browser test is not a substitute for device testing.
- Complete the Wednesday check-in and end-of-week beta-review discussion
  posts, peer reply, and Canvas submission; these external submissions are
  not represented as completed here.

## Week 13 plan

1. Explain how decreasing mass changes thrust-driven acceleration.
2. Add the landing/fuel debrief from the proposal's SHOULD tier.
3. Complete the validation report, final documentation, and peer review.
