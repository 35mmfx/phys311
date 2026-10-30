# Lab 9: Modular Physics Engine

The Lab 9 implementation is in this directory. The pre-existing `week9_engine/`
reference project is kept separate and unchanged. Lab 9 ports the modular
engine/render architecture into the root-level `engine/` and `render/` folders.

## Run it

Open this directory in VS Code and start Live Server at `index.html`. ES modules
must be served over HTTP, not opened directly with `file:`.

## Scenes and controls

- **Billiards / ball pit:** 20 circles in a bounded box. Pair and wall
  collisions are active; change the restitution slider to compare elastic and
  inelastic impacts.
- **Three-body gravity:** three equal masses in a softened, near-circular
  Newtonian orbit. Velocity Verlet is the default; turn on trails to view the
  paths over time.
- **Spring network:** five connected masses with fixed endpoints and an
  initially displaced center mass. Spring potential energy provides a useful
  conservation diagnostic.
- **Collision guard demonstration:** compare the default separating guard
  with the intentionally disabled version using the checkbox. The unchecked
  state is the correct collision response. This extra debugging scene is in
  addition to the three required assignment scenes.
- **Torque-free rotation:** three rigid discs spin without applied torque.
  Their orientation markers and the HUD's total angular momentum make
  rotational motion and conservation visible.

Use the **Scene** selector to load a fresh simulation and the **Integrator**
selector to switch between Euler-Cromer and Velocity Verlet in every scene.
Other controls: adjust restitution, toggle trails, pause/play, step once, reset,
and compare two deterministic replays. The live HUD shows time, body count,
total energy, fractional energy drift, linear and angular momentum, pair checks,
physics/render time, and FPS. Energy drift above 1% is highlighted red.

Select **Run validation & benchmarks** for the isolated-collision momentum
and energy checks, the 60-second gravity stability check, spatial-grid versus
all-pairs equivalence, torque-free angular-momentum conservation, deterministic
replay, timed 20/50/100/200-body samples, and before/after grid timings at 200
and 500 bodies.

## Module layout

```text
engine/
  vec2.js         2D vector math, copied unchanged from Lab 8
  body.js         Body state, mass/inertia, force/torque, kinetic energy
  forces.js       Gravity, quadratic drag, spring, softened Newton gravity
  integrators.js  Euler-Cromer and Velocity Verlet
  collisions.js   Circle-pair and world-bound collision response
  spatial-grid.js Uniform-grid broad phase with ordered pair resolution
  random.js       Seeded pseudo-random number generator
  world.js        Bodies, force registry, stepping, energy and momentum
render/
  camera.js       Physics-to-screen coordinates, copied unchanged from Lab 8
  renderer.js     Canvas drawing, springs, and optional trails
  hud.js          Live conservation and timing diagnostics
scenes.js         Scene construction; no scene-specific engine changes
tests.js          Browser-runnable conservation, stability, and timing checks
index.html        Controls and canvas
main.js           Scene wiring and fixed-step animation loop
style.css         Responsive page styling
lab9_writeup.md   Experiment results, diagram, and performance discussion
evidence/         Captured scene and collision-guard screenshots
```

The spatial grid is the default broad phase. It indexes each body's bounding
box and processes candidate pairs in the same order as the all-pairs resolver;
this preserves collision results while avoiding distant pair checks.
The HUD's pair-check count is the number of candidate pairs passed to the
narrow-phase collision resolver. `World.collisionMode = "bruteForce"` remains
available as a benchmark baseline.

The `engine/` layer has no canvas, DOM, or rendering references. Forces follow
the `apply(world)` interface; conservative forces also provide
`potentialEnergy(world)`. Lab 8's `Vec2` and camera utilities were copied
unchanged. This project follows the architecture taught by the course's
`week9_engine/` reference, while maintaining its own implementation.

## Physics note

The momentum and energy tests disable box walls: a wall supplies an external
impulse, so momentum of the moving bodies alone cannot be conserved with walls
active. In the isolated, no-gravity gas, the pair impulses conserve momentum
for both tested restitution values. Elastic impacts retain kinetic energy;
inelastic impacts dissipate it. `Body` uses a uniform-disc inertia by default
(\(I = \frac{1}{2}mr^2\)); torque is integrated by both integrators, and the
HUD reports orbital plus spin angular momentum.

## GitHub Pages

The repository workflow `.github/workflows/deploy-lab09.yml` publishes this
directory as the Pages site when changes are pushed to `main`. Enable **GitHub
Actions** as the Pages source in the repository's Settings → Pages. After the
workflow succeeds, the expected site URL is
<https://35mmfx.github.io/phys311/>.
