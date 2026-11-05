# Physics 311 — Block 3, Week 10 Reference Project
### Interactivity, UI & Publishing

A complete, runnable browser simulation showing everything Week 10 asks for:
pointer dragging, a live control panel, pause/step/reset, keyboard accessibility,
shareable permalinks, an honest conservation HUD, and a GitHub-Pages-ready layout.

This is the Week 9 engine with a **UI layer added on top**. The `engine/` folder
is unchanged in character: it still contains no `canvas`, no `document`, no pixels.

---

## 1. Three ways to run it

| How | What to do | Use it when |
|---|---|---|
| **Standalone** | double-click `standalone.html` | you just want to see it work, right now |
| **Modules** | open the folder in VS Code → right-click `index.html` → **Open with Live Server** | this is the structure Lab 10 asks for |
| **Headless** | `node tests/validate.js` | checking the physics without a browser |

> **`index.html` will NOT work from a `file://` URL.** Browsers block ES6 modules
> over `file://`, and you will see:
> `Access to script ... has been blocked by CORS policy`
> or `Failed to load module script`.
> That is not a bug in your code. Use Live Server, or run
> `python3 -m http.server 8000` in this folder and visit `http://localhost:8000`.
> `standalone.html` exists so you have something to open when a server is not handy.

---

## 2. Try these five things first

1. **Drag a ball.** Click and hold any body, then whip it around. Watch
   `Δp/p₀` — on scene 3 it is `n/a` until you grab something, because *your finger
   is an external force*.
   Move the pointer across the canvas to see its world coordinates and crosshair.
2. **Scene 4, then scene 2.** On the projectile, switch Euler → Verlet and
   nothing changes. On the spring chain, Euler turns the HUD red within a second.
   Constant force cannot judge an integrator (Week 2, §5.5).
3. **Drag the restitution slider to 0.5.** Energy visibly drains, but `ΔE/E₀`
   stays at `0.000 %`. The ledger books inelastic loss separately, so the drift
   readout measures *your solver*, not *your physics*.
4. **Press Space, then `.` repeatedly.** Each press advances exactly one
   fixed timestep — `tests/validate.js` check 3 proves it. Use `+`/`-` to
   adjust speed without changing the timestep.
5. **Click "Copy link."** Paste it in a new tab. The whole configuration
   comes back. This is how you send your instructor a bug report.

---

## 3. Layout

```
index.html           module version (needs a server)
standalone.html      generated single-file build (double-clickable)
styles.css
.nojekyll            tells GitHub Pages not to run Jekyll
src/
  engine/            PURE PHYSICS - no DOM, runs in Node
    Vec2.js  Body.js  Integrators.js  Forces.js  Collisions.js  World.js
  render/            PIXELS - the only place that knows about canvas
    Camera.js  Renderer.js  HUD.js
  ui/                Permalink state handling
    StateURL.js
  scenes.js          scene builders: (state) -> World
  main.js            the only file that wires all three layers together
input.js             Pointer and keyboard event handling
ui.js                Control-panel wiring
tests/
  validate.js        Headless physics, input, and publishing checks
  smoke-dom.js       boots main.js against a stub DOM
```

**The layering rule, restated for Week 10:** input and control wiring belong
outside `engine/`, but the *force they produce* belongs inside it.
`PointerSpring` lives in `Forces.js` and knows only about world coordinates.
`input.js` converts pointer pixels to world coordinates and writes a target
into it. That is why dragging works identically
with a mouse, a finger, a stylus, or the arrow keys — three input paths, one
force object.

### Part A control choices

Pointer positions are converted through the canvas bounding rectangle into the
camera's logical drawing coordinates before `Camera.toWorld` is called. The HUD
reports the resulting world coordinates and the renderer marks them with a
crosshair. The timestep slider is limited to 0.001–0.020 s; the 0.020 s ceiling
is half the approximately 0.040 s Verlet stability limit for the stiffest
spring in the pendulum scene (omega = sqrt(2500/1) = 50 rad/s and
DT < 2/omega). Gravity, restitution, and drag sliders update the existing
forces/parameters live, and the energy-drift reference is reset when those
physics settings change. Speed ranges from 0.25 to 2 times and scales accumulated
frame time without changing the fixed timestep; the frame loop raises its
bounded substep budget when a smaller timestep requires it. Press `.` for one
fixed step, Space to pause/resume, R to reset, and `+`/`-` to change speed.

### Part B — direct manipulation and visual physics

- **Grab and drag:** hold a body to pull it with the `PointerSpring` force. It
  remains in the collision solver, and releasing lets its acquired velocity
  carry it onward.
- **Slingshot:** turn on **Slingshot launch**, press on empty canvas space to
  place a body, drag opposite the desired direction, then release. The preview
  uses the same capped launch velocity and current uniform gravity; it is an
  ideal path that ignores drag and does not predict collisions or interactions
  with other bodies.
- **Keyboard:** Tab keeps its normal job of moving through controls. Use `[` and
  `]` to select a body, arrows to pull it, and release the arrows to let it go.
  When a slider or select menu has focus, its arrow keys change its value.
  With Slingshot launch enabled, focus the canvas and press `L` to place at an
  open spot near the center, use arrows to aim, and press Enter to launch.
- **Visuals:** each is independently switchable: alpha-fading motion trails,
  scaled velocity arrows, and net-force arrows.

#### Part B write-up

Teleporting a body by assigning its position bypasses the force/integration and
collision steps: it can jump through another body or a wall without a collision
impulse, and it can create overlap or change energy without corresponding work
or a physically acquired velocity. In the two-body direct-position experiment
in `tests/validate.js`, moving one body from x = −2 m to x = +2 m in one step
placed it beyond a stationary body at x = 0 m; the collision count stayed zero
and its velocity stayed zero. That demonstrates tunneling and the missing
collision impulse.

The three visuals communicate:

- The fading trail reveals the path and recent direction of travel, making
  orbital shape and periodic motion easier to recognize.
- Velocity arrows reveal each body's instantaneous direction and relative
  speed, which position snapshots alone cannot show.
- Force arrows reveal the direction and relative magnitude of the net force
  acting on each body at that step.

The canvas resizes with the window and uses a device-pixel-ratio-scaled backing
buffer. Inputs have associated labels, the canvas includes fallback text, and
the canvas/control focus indicators remain visible. **Unplugged-mouse test:**
a keyboard-only browser check passed: Space paused the simulation, R reset it,
Tab moved focus to controls, the integrator changed to Euler-Cromer, and the
gravity slider changed from 9.81 to 9.82 m/s² with an arrow key. The physical
unplugged-mouse check still needs to be confirmed on the user's computer. For
gravity, Tab from the canvas to Preset, then Tab four more times to the Gravity
slider and press Left or Right; the visible value readout updates.

---

## 4. Verified numbers (`node tests/validate.js`)

| Check | Result |
|---|---|
| Camera pixel↔world round trip | worst error **8.9e-16** |
| Reset determinism, 3000 steps | **bit-for-bit identical** |
| 1500 single steps vs one 1500-step run | **bit-for-bit identical** |
| 60 Hz / 144 Hz / jittery frames | all reach **t = 10.0000 s**, 2400 substeps |
| 2 s tab stall, clamped | **8 substeps** instead of 480 |
| Released PointerSpring | contributes **exactly nothing** |
| Isolated N-body, untouched | \|Δp\|/\|p₀\| = **5.2e-14** |
| …while grabbed | \|p\| = **7.2e+1** — correctly *not* conserved |
| …after release | **4.0e-15** |
| Projectile: Euler vs Verlet | 8.2e-3 vs 3.0e-14 — **degenerate** |
| Spring chain: Euler vs Verlet | 1.6e+0 vs 1.6e-4 — **10⁴× worse** |
| Energy ledger at e = 1 / 0.95 / 0.5 / 0 | drift **≤ 8e-16** in every case |
| Permalink round trip | every control survives |
| DOM identifiers in `engine/` | **none** |
| Absolute paths in `index.html` | **none** |

---

## 5. Accessibility checklist (Lab 10 grades this)

- Every mouse action has a keyboard equivalent (`Keyboard.js`).
- The canvas is `tabindex="0"` and has a descriptive `aria-label`.
- Visible `:focus-visible` outline in UT orange on every control.
- Sliders carry `aria-valuetext` so a screen reader says "9.81 m/s²", not "9.81".
- A polite `aria-live` region announces pause, reset, scene changes and selection.
- `prefers-reduced-motion` disables trails.
- `touch-action: none` on the canvas so a drag does not scroll the page.
- Layout reflows to a single column below 860 px.

---

## 6. Publishing to GitHub Pages

1. Put this folder in your repo (e.g. `labs/week10/`), commit, push.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → `main` / `/ (root)`.
3. Wait ~60 s. Visit `https://USERNAME.github.io/REPO/labs/week10/`.

**The four failures that actually happen:**

| Symptom | Cause |
|---|---|
| Blank page, 404 on `main.js` | **Case.** `Vec2.js` ≠ `vec2.js`. Your laptop does not care; the server does. |
| Works locally, 404 everywhere online | An **absolute** path `/src/main.js`. Project pages live under `/REPO/`. Use `src/main.js`. |
| Folders beginning with `_` vanish | Jekyll. Keep the empty `.nojekyll` file. |
| Your fix is not showing up | Browser cache. Hard-reload with Ctrl/Cmd-Shift-R. |

Run `node tests/validate.js` before you deploy — check 10 catches the first two
automatically.

---

## 7. Rebuilding `standalone.html`

It is generated from `src/`, so edit `src/` and regenerate, never the other way:

```bash
python3 build_standalone.py
```

---

## 8. Honest limitations

- Collisions are **circle-only** and resolved in a single pass. A dense pile
  will jitter; that needs iterative solving, which is beyond Week 10.
- There is **no rotation**. Bodies carry `theta`/`omega` nowhere — spin was
  Week 6 in Python and is left as a Lab 10 extension.
- The spatial hash turns on above 40 bodies. Check 7 of the Week 9 project
  showed brute force and hash agree to **exactly 0.0**, so it is a speed
  optimisation only.
- `prefers-reduced-motion` stops trails but does not stop the simulation.

---
