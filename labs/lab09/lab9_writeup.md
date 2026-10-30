# Lab 9 Write-up: Multi-Body Browser Simulation

## Module dependency diagram

```text
main.js ──┬── scenes.js ──┬── engine/body.js ── engine/vec2.js
          │               ├── engine/forces.js ─┘
          │               ├── engine/integrators.js
          │               └── engine/world.js ──┬── engine/collisions.js
          │                                      └── engine/spatial-grid.js
          ├── engine/random.js
          ├── engine/integrators.js
          ├── render/camera.js
          ├── render/renderer.js ── reads World and bodies
          ├── render/hud.js ─────── reads World diagnostics
          └── tests.js ──────────── exercises the engine and renderer

engine/ has no dependency on render/, the DOM, or canvas.
```

## B1: Separating guard / jitter demonstration

The collision resolver first separates overlapping circles with an
inverse-mass-weighted position correction. It then computes the relative normal
speed, `vn`. If `vn > 0`, the circles are already separating; applying another
restitution impulse would reverse them and make them approach again while
they still overlap. The **Collision guard demonstration** scene starts with an
overlapping pair moving apart. With the guard enabled it produces no false
velocity reversals; disabling it produced four reversals in the 20-step
browser validation, visibly making the pair vibrate.

Evidence: [guard enabled](./evidence/jitter-guard-enabled.png) and
[guard disabled](./evidence/jitter-guard-disabled.png).

## B2: Momentum and energy tests

The repeatable test uses 20 bodies, no gravity, no walls, `dt = 1/240 s`, and
60 simulated seconds. The wall boundary is deliberately disabled for this
conservation test: a box wall is an external impulse and therefore changes
the momentum of the ball-only system.

| Test condition | \(|p|, t=0\) (kg·m/s) | \(|p|, t=60\) (kg·m/s) | \(E_0\) (J) | \(E_{60}\) (J) | Result |
|---|---:|---:|---:|---:|---|
| Momentum test, elastic \(e=1\) | 4.532984 | 4.532984 | 32.693116 | 32.693116 | Momentum conserved to displayed precision |
| Energy test, elastic \(e=1\) | 4.532984 | 4.532984 | 32.693116 | 32.693116 | Energy conserved to displayed precision |
| Inelastic comparison, \(e=0.8\) | 4.532984 | 4.532984 | 32.693116 | 30.485371 | Momentum conserved; energy decreases monotonically (6.753%) |

Both tests start from the same deterministic initial conditions. The equal
and opposite pair impulses preserve total momentum independently of
restitution. For \(e<1\), some relative kinetic energy is dissipated at each
collision, so energy decreases while momentum remains conserved.

## C: Scene screenshots

- [Scene 1 — billiards / ball pit](./evidence/scene-billiards.png)
- [Scene 2 — softened three-body gravity](./evidence/scene-gravity.png)
- [Scene 3 — spring network](./evidence/scene-springs.png)

The HUD shows the initial energy baseline, energy drift, linear and angular
momentum, pair checks, timing, and FPS in each scene.

## Performance report

Browser request-animation-frame measurements (one-second sample per body
count; physics and render values are average milliseconds per displayed
frame):

| Bodies | Physics (ms/frame) | Render (ms/frame) | Measured FPS |
|---:|---:|---:|---:|
| 20 | 0.061 | 0.408 | 36.0 |
| 50 | 0.136 | 0.416 | 61.0 |
| 100 | 0.241 | 0.357 | 61.0 |
| 200 | 0.433 | 0.411 | 61.0 |

The all-pairs baseline checks \(n(n-1)/2\) candidate pairs per step. The grid
indexes each circle's bounding box into uniform cells and checks nearby
candidates only. The table compares average physics time per fixed step for
the same seeded, sparse, no-wall body distributions; both modes produced
bit-identical final states and conserved total momentum.

| Bodies | All-pairs (ms/step) | Spatial grid (ms/step) | Speedup | Pair checks all-pairs | Pair checks grid |
|---:|---:|---:|---:|---:|---:|
| 200 | 0.274 | 0.113 | 2.44× | 19,900 | 15.7 |
| 500 | 1.310 | 0.312 | 4.20× | 124,750 | 97.7 |

These are browser measurements and vary with machine load. The grid preserved
the brute-force resolver's pair ordering; dynamic cell updates enqueue
newly-near pairs in the same order if an earlier overlap correction moves a
body. A separate 20-body, 20-second test and a 30-body mixed-radius test also
produced bit-identical final states with both modes. The
request-animation-frame sample above was capped near 60 FPS for 50–200 bodies;
the 20-body sample was lower during this measurement, so I do not claim a
universal 60-FPS limit or a maximum tested body count based on that sample.

## Engine changes required by the scenes

The three graded scenes required no scene-specific engine changes:
`scenes.js` assembles bodies, forces, bounds, and integrators using the same
`World` and force interfaces. For the separate B1 debugging demonstration,
`World.jitterBugDemo` can intentionally bypass the separating guard so the
incorrect response can be reproduced without editing and restoring source
code. The three graded scenes leave that flag disabled. The collision
resolver otherwise includes inverse-mass position correction, static-body
support, restitution impulses, and the separating guard.

## Bonus: Rotational bodies

Each body now carries orientation \(\theta\), angular velocity \(\omega\),
moment of inertia \(I\) (defaulting to a uniform disc, \(I=\frac12mr^2\)),
and an accumulated torque \(\tau\). Both integrators update rotation, and
Velocity Verlet uses torque at both ends of a step. The renderer draws a
radius marker from each disc's center; the HUD reports total angular momentum,
including orbital and spin terms.

The torque-free rotation scene spins three separated discs in place. Over 60 s,
the measured total angular momentum remained \(0.350316\ \mathrm{kg\,m^2/s}\).
The validation also applies a constant torque of \(8\ \mathrm{N\,m}\) to a
body with \(I=4\ \mathrm{kg\,m^2}\), verifying the expected angular
acceleration.

## Bonus: Deterministic replay

Initial conditions use a shared seeded pseudo-random generator. **Run
deterministic replay** builds the selected scene twice from the same controls,
advances both worlds for 10 s at \(1/240\) s, and compares the final numeric
state with exact `Object.is` equality before resetting the visible scene. The
20-body billiards replay matched all 302 compared final-state values exactly.
The validation and timing controls are described in [README](./README.md).

## Reproducibility

Open `index.html` through VS Code Live Server, then use **Run validation &
benchmarks** or **Run deterministic replay**. The gas initial state uses a
fixed seed; the three-body run uses Velocity Verlet with `dt = 1/600 s` for
60 simulated seconds. Performance measurements depend on browser, display
refresh, and machine load.
