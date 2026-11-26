# Fuel for the Final Flare

A single-scene lunar-landing challenge built for the Week 12 MUST tier. The
lander uses finite propellant, variable mass, keyboard/touch controls, and
fixed-step velocity-Verlet integration. The physics modules in `engine/` do
not access the DOM or canvas; `render/` handles drawing, and `main.js` wires
the app together. [Play the live demo](https://35mmfx.github.io/phys311/project/).

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
- The lander starts at a seeded-random `x` from `-7 m` to `7 m`. Easy and
  normal missions start from `10 m` to `14 m` altitude; hard missions start
  from `15 m` to `18 m`. Restart chooses a new start; shared URLs preserve
  their seed.
- The lander radius is `0.42 m`; the pad is centered at `x = 0`. Difficulty
  changes pad width, starting fuel, and asteroid frequency:

  | Difficulty | Pad width | Starting fuel | Asteroids |
  |---|---:|---:|---|
  | Easy | 4.4 m | 45 kg | 3 every start |
  | Normal (default) | 2.9 m | 39 kg | 6 every start |
  | Hard | 2.0 m | 30 kg | 12 every start |

  Changing difficulty restarts the mission; restart and shared links retain it.
  Asteroids have a `0.2 m` radius and can destroy the lander on contact. The
  opening group launches quickly with randomized directions and a downward
  inclination; later asteroids arrive at longer, seeded-random intervals.
  Asteroids stop at the ground instead of bouncing back. When an asteroid
  strikes the lander, the impact dust is centered at the contact point rather
  than on the landing pad.
- The late-descent vehicle has an approximate non-descent-propellant mass of
  `6,900 kg` (including ascent propellant and equipment), plus the selected
  remaining descent propellant. The HUD's remaining-fuel percentage is relative
  to the selected difficulty's starting reserve.
- Maximum descent thrust is `45,000 N` and specific impulse is `304 s`.
  The slider sets 10–100% thrust; holding a thrust control fires at that
  setting, and releasing it shuts the engine off. The continuous slider is a
  simplification and does not model Apollo's restricted throttle regions.
- This starts in the final metres with low horizontal speed; it does **not**
  simulate orbital-speed braking, the preceding fuel burn, or a full 12–13
  minute powered descent. The small lander, flat arena, and asteroid hazards
  are game simplifications, not Apollo geometry or mission conditions.
- Thrust points along `(-sin θ, cos θ)`. Fuel flow is
  `T / (Isp g0)`, with `g0 = 9.81 m/s²`. The integrator uses midpoint mass
  during each fixed `1/240 s` step, then clamps fuel and mass at their lower
  bounds.
- Contact has restitution `e = 0.25`. Touchdown is evaluated before the
  collision response. To land safely, the lander must be on the pad, with
  vertical speed at most `1.8 m/s`, horizontal speed at most `1.1 m/s`, and
  angle within `15°` of upright (subject to the documented numerical tolerances).
  Safe landings score `50 + round(50 × fuel remaining / starting fuel)`, from
  50 to 100 points; half the starting fuel remaining earns 75. Crashes and
  ongoing flights score 0. The score uses the mission's starting reserve,
  not the HUD's percentage of the original tank.
- After landing or crashing, the debrief reports the outcome, score, frozen
  flight time, and fuel used and remaining.
- Attitude is steered directly at a fixed rate; rotational inertia, terrain
  shape, and atmosphere are not modeled.
- Euler, Euler-Cromer, and Velocity Verlet integrators all affect lunar
  lander motion. They share the same forces and collisions, but differ in
  numerical accuracy; Velocity Verlet is the default.
- A yellow dashed trajectory and ground marker show approximate future contact
  if the current thrust on/off state and throttle continue and orientation is
  held fixed. The prediction uses the selected integrator, lunar gravity, and
  fuel depletion, with a timestep no finer than `1/60 s`. It stops at the first
  wall, ceiling, or ground contact (or 30 seconds), and ignores asteroids.
  It does not predict future steering or guarantee a safe touchdown.

## Architecture

- `engine/` contains bodies, forces, collision resolution, integrators, and
  the fixed-step `World`; it has no browser or rendering dependencies.
- `scenes.js` builds deterministic simulation presets from state.
- `render/` draws the world; `input.js` and `ui/` translate browser input and
  display controls, diagnostics, and exports.
- `main.js` connects the scene, engine, renderer, and user interface.

## Controls

Click the game area to activate keyboard controls. Use **← / →**, **A / D**,
or numeric keypad **4 / 6** to steer; hold **↑ / ↓**, **W / S**, or keypad
**8 / 2** to thrust. Set **Engine throttle** in the Mission panel before or
during a burn. The up/down keys activate the same engine, which always
pushes along the lander's current orientation. The on-screen buttons provide
press-and-hold touch controls. **Space** pauses, **.** advances one fixed step,
and **R** resets the mission and re-baselines the energy reference.

On a phone or tablet, no keyboard is needed. The **↶**, **Thrust**, and **↷**
buttons sit directly below the canvas, with a small gap, so they cannot cover the landing pad.
Pause, Restart, and Step sit in a separate row beneath those flight controls.
Press and hold a flight button to
steer or fire the engine; release to stop.

Enable **Cockpit sound** in the Mission panel and adjust **Cockpit volume** for
a synthesized interior mix: ventilation and avionics hum, structure-borne
engine rumble, pulsing propellant pumps, relay clicks, hull creaks, touchdown
thuds, and a distinct rattling side-wall collision. Steering has no synthesized
sound. The engine is heard as vibration through the cabin rather than an
exterior rocket roar. Sound is off by default and starts only after an explicit
click; no audio files or network requests are used. Muting suspends the audio
context, and the engine audio updates only when thrust state changes.

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

## Limitations

The validated timestep range is specific to the study in
[`VALIDATION.md`](./VALIDATION.md), not a universal stability guarantee.
Orbital evolution loses accuracy at coarse timesteps, and body-count
performance has not been benchmarked across devices. The lunar scenario is a
short final-approach game, not a full Apollo descent; it omits orbital braking,
atmosphere, terrain shape, and rotational inertia. Its continuous throttle
and asteroids are deliberate simplifications.

## Validation

`npm test` runs the headless physics suite and a browser-entry smoke test. The
physics suite includes the proposal's rocket-equation, 60-second
free-fall-energy, fuel-bound, and touchdown checks, plus accumulator checks at
60 Hz, 144 Hz, and jittered frame intervals, and a spring-chain DT-halving
convergence check, randomized collision-conservation checks, and mission
debrief accounting, difficulty, and trajectory prediction. The live-site check and real-device touch check
remain part of deployment verification; see
[`PROGRESS.md`](./PROGRESS.md).

| Validation | Measured result |
|---|---|
| 2 s powered-flight convergence, Velocity Verlet | Estimated order 2.00 over `DT = 1/30` to `1/960 s`. |
| 60 s isolated orbit, `DT = 1/240 s` | Maximum `|ΔE/E₀| = 0.586%`; Euler comparison: 73.44%. |
| Momentum and collisions | Orbit `|Δp|/|p₀| = 5.57e-13`; 500 randomized collisions max `1.036e-15`, with no kinetic-energy increases. |
| Analytic and driven checks | Free-fall position error `8.23e-14%`; constant-force work-ledger discrepancy `5.36e-14`. |
| Coarse-step orbital stress | 12 planets, `DT = 1/30 s`, 60 s: maximum `|ΔE/E₀| = 36.80%`. |

See [`VALIDATION.md`](./VALIDATION.md) for test conditions, complete convergence
data, and limitations.

Run `npm run convergence` for a headless, two-second lunar thrust flight at six
timesteps. It reports the lander's final height, error against the finest run,
successive error ratios, and an estimated convergence order for Velocity
Verlet.

## Credits and references

The engine parameters are Apollo-inspired rather than a reconstruction. See
NASA's [descent propulsion system report](https://ntrs.nasa.gov/citations/19730011150)
and [Apollo 14 flight evaluation](https://ntrs.nasa.gov/citations/19730021081).
GitHub Copilot assisted with code, tests, and documentation; generated
suggestions were reviewed against the implementation and local test results.

## GitHub Pages

The repository's Pages workflow publishes Lab 9 at the site root and this
project at `https://35mmfx.github.io/phys311/project/`. After pushing changes,
wait for the GitHub Pages deployment to finish, then verify the URL in a fresh
browser session.
