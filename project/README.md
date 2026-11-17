# Fuel for the Final Flare

A single-scene lunar-landing challenge built for the Week 12 MUST tier. The
lander uses finite propellant, variable mass, keyboard/touch controls, and
fixed-step velocity-Verlet integration. The physics modules in `engine/` do
not access the DOM or canvas; `render/` handles drawing, and `main.js` wires
the app together.

## Run locally

From this directory, serve the files over HTTP (ES modules do not run from
`file://`):

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/`. Node.js is needed only for the automated checks:

```powershell
npm test
```

## Mission model

- Coordinates are metres, time is seconds, and mass is kilograms. Positive
  `y` is up.
- The arena is 20 m wide with a flat floor at `y = 0`; lunar gravity is
  `1.62 m/s²`.
- The lander radius is `0.42 m`; the pad is centered at `x = 0` with a
  `1.45 m` half-width.
- Dry mass is `1,000 kg`, starting fuel is `150 kg`, maximum thrust is
  `8,000 N`, and specific impulse is `300 s`.
- Thrust points along `(-sin θ, cos θ)`. Fuel flow is
  `T / (Isp g0)`, with `g0 = 9.81 m/s²`. The integrator uses midpoint mass
  during each fixed `1/240 s` step, then clamps fuel and mass at their lower
  bounds.
- Contact has restitution `e = 0.25`. Touchdown is evaluated before the
  collision response. A score of 100 is awarded for a safe landing; flight or
  crash scores 0.
- Attitude is steered directly at a fixed rate; rotational inertia, terrain
  shape, and atmosphere are not modeled.

## Controls

Focus the canvas to use **← / →** or **A / D** to steer and hold **↑** or
**W** to thrust. The on-screen buttons provide press-and-hold touch controls.
**Space** pauses, **.** advances one fixed step, and **R** resets the mission
and re-baselines the energy reference.

Expand **Other scenes and simulation settings** for the inherited Lab 10
reference scenes. The required lunar mission is the default scene.

## Diagnostics and test mode

- Add `?debug=1` to the URL or select **Debug HUD**. The panel reports total
  energy, drift from the reset reference, momentum magnitude, body count,
  contacts resolved during the last physics step, maximum speed, and measured
  FPS. Drift turns red above the stated 1% tolerance.
- Select **Conservative test mode** or add `?conservative=1`. For the lunar
  scene this disables thrust and steering, sets `e = 1`, and leaves gravity
  as the conservative force. It also disables the scripted landing freeze so
  floor contact remains elastic. There is no drag or friction in the lunar
  model.
- The HUD labels powered flight as an open system: thrust changes the
  lander's mechanical energy and momentum.

## Validation

`npm test` runs the headless physics suite and a browser-entry smoke test. The
physics suite includes the proposal's rocket-equation, 60-second
free-fall-energy, fuel-bound, and touchdown checks, plus accumulator checks at
60 Hz, 144 Hz, and jittered frame intervals. The live-site check, real-device
touch check, and DevTools CPU-throttling check remain part of deployment
verification; see [`PROGRESS.md`](./PROGRESS.md).

## GitHub Pages

The repository's Pages workflow publishes Lab 9 at the site root and this
project at `https://35mmfx.github.io/phys311/project/`. After pushing changes,
wait for the GitHub Pages deployment to finish, then verify the URL in a fresh
browser session.
