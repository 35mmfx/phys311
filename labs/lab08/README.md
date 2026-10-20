# Lab 8: Browser Physics Simulation

This folder contains the Lab 8 browser simulation: `index.html` is the page,
`main.js` runs the simulation, `engine/` contains the physics classes, and
`render/` contains the canvas drawing code.

## Run the simulation

The page uses JavaScript ES modules, so serve it over HTTP rather than opening
`index.html` directly as a `file://` URL.

### Option 1: VS Code Live Server

1. Open this `lab08` folder in VS Code.
2. In the Explorer, right-click `index.html` and choose **Open with Live Server**.
3. The page should open in your browser.

### Option 2: Python's local web server

Open a terminal in this `lab08` folder and run:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000/> in your browser. Keep the terminal running
while using the simulation; press `Ctrl+C` in that terminal to stop the server.

## Controls

| Control | What it does |
| --- | --- |
| **Integrator (live switch)** | Switches the running simulation between Velocity Verlet, Euler-Cromer, and Euler without resetting its state. |
| **Scene** | Selects the Part A static coordinate diagram, the 20 m/s at 50° projectile, or the spring oscillator. Changing scenes resets the simulation. |
| **DT** | Selects the fixed physics step: 1/240, 1/120, 1/60, or 1/20 second. Changing DT resets the simulation. The 1/20 s option is coarse and useful for comparing integrators. |
| **Timestep mode** | Selects the fixed-step accumulator or variable frame-time stepping. Changing the mode keeps the current simulation state. |
| **Pause / Resume** | Pauses or resumes the simulation. Press **Space** to toggle it as well. |
| **Reset** | Restarts the selected scene with the current integrator, DT, and timestep mode. Press **R** to reset. |
| **Induce 500 ms lag (C2)** | Blocks the browser's main thread for about half a second, then reports the measured frame delay, simulated-time advance, energy change, and physics step count. Select the spring or projectile scene first; it does not run for the static Part A scene. |
| **Validate at t = 2.0 s** | Runs the built-in checks, including projectile reference comparisons and spring-oscillator results, and prints pass/fail details in the log. |
| **Run 10 s headless (C1)** | Runs 1,200 non-rendered steps at DT = 1/120 s using the currently selected integrator, then prints the projectile's final state and total energy. |

The canvas HUD shows the simulation time, position, speed, kinetic and potential
energy, total energy, step count, timestep mode, and active integrator. The
**Validate** and **Run 10 s headless** results appear in the log beneath the
controls; the Part A Vec2 self-test also writes its checks to the browser
Console.
