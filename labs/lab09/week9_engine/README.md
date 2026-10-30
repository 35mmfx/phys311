# Physics 311 — Block 3, Week 9
## Reference project: *Structuring a JS Physics Engine*

A complete, runnable JavaScript physics engine demonstrating every idea from the
Week 9 lesson. Study it, run it, break it — then build your own for Lab 9.

---

## Two ways to run it

### 1. `standalone.html` — just double-click it
Everything inlined into one file. No server, no setup. Use this if you only
want to *see* it work.

### 2. `index.html` — the real project (recommended)
This is the modular version, and it is the structure Lab 9 asks you to build.
ES6 modules are blocked over `file://` by browser security, so you need a
local server:

- **VS Code:** install the **Live Server** extension, right-click
  `index.html` → *Open with Live Server*.
- **Any terminal with Python:** `python -m http.server 8000`, then open
  <http://localhost:8000>.

> If you open `index.html` by double-clicking, the page will be blank and the
> console will say *"Cross origin requests are only supported for http"*.
> That is the `file://` restriction, not a bug in the code.

### 3. Headless — no browser at all
```
node tests/validate.js
```
Runs the same 9 checks and exits non-zero on failure. **This is the payoff
for the layering rule** (below): because `engine/` never mentions the DOM,
your physics runs anywhere.

---

## Layout

```
index.html          page + controls
standalone.html     single-file build (no server needed)
styles.css
main.js             the ONLY file that knows about both layers

engine/             pure physics - no DOM, ever
  Vec2.js           2D vector; returns new objects by default
  Body.js           state of one disc (pos, vel, theta, omega, I)
  Forces.js         UniformGravity, NewtonGravity, Spring, QuadraticDrag
  Integrators.js    Euler, EulerCromer, VelocityVerlet
  Collision.js      broad phase, narrow phase, impulse response, BoxBounds
  World.js          owns bodies + forces; step(dt); diagnostics
  Accumulator.js    fixed physics timestep, variable frame rate

render/             drawing only - reads the world, never changes it
  Camera.js         world <-> screen; the ONLY place the y-flip lives
  Renderer.js       discs, trails, vectors, grid, bounds
  HUD.js            live conservation readout

scenes/scenes.js    7 scenes; each returns a fresh World
tests/validate.js   9 headless checks (Node + in-page)
```

---

## The layering rule

> **Nothing in `engine/` may mention `ctx`, `canvas`, `document`, `window`,
> `requestAnimationFrame`, or a colour.**

Check it yourself:

```
grep -rn "ctx\|canvas\|document\|window\|requestAnimationFrame" engine/
```

The only hits are `typeof performance !== 'undefined'` guards in `World.js`,
which exist precisely so the engine also runs in Node. Lab 9 grades this.

Why it matters: it is what makes `tests/validate.js` possible, it is what will
let you swap the renderer in Physics 312 (Three.js replaces `render/`, your
`engine/` survives untouched), and it is what keeps a convergence study from
becoming a refactor.

---

## Verified reference values

Produced by `node tests/validate.js`. Your Lab 9 engine should reproduce these.

| Check | Expected |
|---|---|
| Projectile range, v₀ = 25 m/s at 45° | **63.710499 m** (err 4.5e-9) |
| Spring, 10 periods, dt = 0.01, max \|ΔE\|/E₀ | Euler **1.18**, EC **2.04e-1**, Verlet **5.06e-3** |
| Verlet convergence, error ratio on dt halving | **4.00, 4.00** (second order) |
| Isolated collisions (walls off), \|Δp\|/\|p₀\| | **< 1.5e-16** at every e |
| Isolated box KE kept, e = 1 / 0.9 / 0.5 / 0 | **100 / 86.7 / 58.8 / 45.7 %** |
| Box **with** walls, e = 1 | ΔE/E₀ = **2e-16**, but \|Δp\|/\|p₀\| = **1.36** |
| Figure-eight, 4 periods, dt = 1e-4 | ΔE/E₀ = **-1.0e-15**, \|p\| = **5.7e-14** |
| Brute force vs spatial hash, N = 120 | **7140** vs **5** checks/step, position difference **exactly 0** |
| Separating overlapped pair | no impulse applied |

---

## Five things to look for in the code

1. **Equal-and-opposite on consecutive lines.** In `Forces.js`, every internal
   force does `a.applyForce(F); b.applyForce(F.neg());` back to back. That is
   why momentum conservation is *structural* — `World` never checks it.

2. **The separating guard.** `Collision.js` has `if (vn > 0) return;`. Delete
   it and overlapping-but-separating pairs get re-resolved every frame,
   pumping energy in. Try it — the box will heat up and explode.

3. **Positional correction splits by inverse mass**, so pushing bodies apart
   adds no net momentum. A heavy body barely moves.

4. **The baseline is captured once**, in `buildScene()`, not inside the frame
   callback. Move `captureBaseline()` into `frame()` and the HUD will read
   0.0000 % drift forever — an instrument measuring itself.

5. **The accumulator clamps.** `maxFrame = 0.25 s`. Switch tabs for two
   seconds without the clamp and the next frame tries 480 physics steps,
   which takes longer than a frame, which makes the next frame worse: the
   spiral of death.

---

## Things to try

- **Scene 1 (projectile) + switch integrators.** Nothing changes. Constant
  force makes Verlet *exact* and Euler/Euler-Cromer differ only by
  ±½gtΔt — see the Week 2 §5.5 insert. A projectile **cannot** grade an
  integrator.
- **Scene 6 (spring chain) + switch to Euler.** Now watch the HUD go red.
  Position-dependent force switches the feedback loop back on.
- **Scene 4 (isolated) vs Scene 2 (walls).** Momentum is machine-zero in one
  and badly violated in the other. Both are correct physics — a wall is an
  external force.
- **Scene 7 (crowd) + toggle broad phase.** Pair checks drop from 31125 to a
  few dozen. The trajectories must stay bit-identical.
- **Scene 3 (e = 0.8).** Energy decays. Lower `e` does *not* always mean less
  energy kept: at e = 0 bodies clump, stop colliding, and dissipation shuts
  itself off.

---

## Lab 9 reminder

Your submission needs its own `engine/` + `render/` split, a working
conservation HUD, a broad phase with a measured check-count comparison, and
deployment to GitHub Pages. Reusing the *structure* of this project is
expected; copying the files is not. Cite this reference in your README.
