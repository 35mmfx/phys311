# Validation report

All measurements below were made with the headless JavaScript engine. The
default lunar mission uses a fixed `DT = 1/240 s`; the controlled studies
specify their own timestep. `npm test` runs the automated physics and
browser-entry checks, while `npm run convergence` reproduces the B1 study.

## B1 — Headless convergence

The observable is the lander's final height after a 2.0 s constant-throttle
flight, with identical initial conditions and Velocity Verlet. The six runs
use a common `dt` that divides the end time exactly. Error is measured against
the finest run (`dt = 1/960 s`); each ratio is the previous row's error divided
by the current row's error.

| DT (s) | Steps | Final height (m) | Error vs. finest (m) | Successive error ratio |
|---:|---:|---:|---:|---:|
| 1/30 | 60 | 10.804909489 | 8.395e-7 | — |
| 1/60 | 120 | 10.804908859 | 2.092e-7 | 4.012 |
| 1/120 | 240 | 10.804908701 | 5.170e-8 | 4.048 |
| 1/240 | 480 | 10.804908662 | 1.231e-8 | 4.200 |
| 1/480 | 960 | 10.804908652 | 2.462e-9 | 5.000 |
| 1/960 | 1,920 | 10.804908650 | 0 | — |

The estimated order is **2.00**, consistent with Velocity Verlet. The finest
run has zero error by definition, so its successive error ratio is undefined.

## B2 — Conservation

**Long run.** In the isolated six-planet Newtonian orbit scene (one central
body, no drag or walls), Velocity Verlet at `DT = 1/240 s` was run for 60 s
(14,400 steps). Maximum absolute energy deviation was
`|ΔE/E₀| = 5.861e-3` (0.586%); the final deviation was 0.180%. In the same
configuration, an initial horizontal velocity offset of 0.5 m/s on one
orbiting body gives `|p₀| = 0.5 kg·m/s`; maximum `|Δp|/|p₀|` over 60 s was
`5.570e-13`. Angular momentum, measured about the scene origin, drifted by at
most 2.065% over the same run.

**Integrator comparison.** On the same six-planet scene at `DT = 1/240 s` for
60 s, the maximum absolute relative energy deviation was 0.586% for Velocity
Verlet and 73.44% for explicit Euler. The Euler result is substantially worse;
the comparison does not imply the Verlet result is exact.

**Stress case.** The worst energy result in this measured set was a 60 s,
12-planet orbital run at `DT = 1/30 s` (1,800 steps), with the same 0.5 m/s
horizontal perturbation and no drag. Its maximum `|ΔE/E₀|` was 36.80%.
Momentum drift remained `6.188e-13` relative to the deliberately nonzero
initial momentum. This coarse timestep is not suitable for accurate orbital
evolution. It is the worst of the tested configurations, not a search over
every possible initial state.

## B3 — Analytic limit and work ledger

**Analytic free fall.** A 2 kg body started at `y₀ = 100 m`,
`v₀ = 3 m/s`, under uniform `g = 9.81 m/s²`. After 2 s at
`DT = 1/240 s`, Velocity Verlet measured `y = 86.38000000000007 m` and
`v = -16.619999999999926 m/s`; the analytic values are 86.38 m and
-16.62 m/s. Relative errors were `8.23e-14%` in position and `4.49e-13%` in
velocity. The residual is floating-point roundoff; constant acceleration is
integrated exactly apart from that roundoff.

**Driven work ledger.** A 3 kg body with initial `vₓ = 2 m/s` was driven by a
constant 12 N force for 10 s at `DT = 1/240 s` using Velocity Verlet. The
kinetic-energy change was `2639.999999999781 J`; midpoint accumulation of
`∫F·v dt` gave `2639.999999999922 J`, a relative discrepancy of
`5.36e-14`. This checks the constant-force integrator ledger; it does not
include energy carried by expelled propellant in the variable-mass lander
model.

**Inelastic collision behavior.** A deterministic seeded set of 500 isolated
two-body collisions with restitution sampled in `[0, 1)` was checked with the
pair resolver. Maximum `|Δp|/|p₀|` was `1.036e-15`; kinetic energy increased in
zero trials. The automated test is part of `npm test`.

## B4 — Limitations

- The convergence result covers a 2 s powered flight and `DT` values from
  1/30 through 1/960 s; it does not establish accuracy for every scene or
  timestep. The orbital stress result above demonstrates the failure at
  `DT = 1/30 s`.
- The current lunar mission has one lander and up to five asteroids (one to
  six bodies total). A body-count performance threshold has not been measured
  across devices; the larger inherited scenes are not a benchmark.
- The project models the final low-speed landing phase, not orbital braking,
  the preceding fuel burn, or a full-duration powered descent. Atmosphere,
  terrain shape, and rotational inertia are omitted. The README describes
  these simplifications and the idealized continuously variable throttle.
- No unfixed physics bug is known from the local test suite. Real-device touch
  testing and external peer review remain outside these automated checks.
