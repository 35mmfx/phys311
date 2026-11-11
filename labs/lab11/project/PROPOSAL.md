# Final Project Proposal — Fuel for the Final Flare

**Name:** [Zaki Daouk] · **Date:** 11/15/2026 Week 11 · **Repo:** [https://github.com/35mmfx/phys311] → `labs/lab11/project/`

## A1 — Title & pitch

**Fuel for the Final Flare — a precision lunar-lander game.** Visitors steer a lander onto a glowing Moon pad, managing its engine and dwindling fuel while the flight display shows how close they are to a safe touchdown.

## A2 — The physics

Use SI units (m, s, kg) and one translating lander with directly steered attitude (no rotation dynamics). Forces: \(\vec F_g=-mg_L\hat y\), \(g_L=1.62\ \mathrm{m/s^2}\); \(\vec F_T=T_{\max}u(-\sin\theta,\cos\theta)\), \(0\le u\le1\); \(\dot m=-T_{\max}u/(I_{\rm sp}g_0)\), \(g_0=9.81\ \mathrm{m/s^2}\); \(\vec a=(\vec F_g+\vec F_T)/m\). Clamp fuel at zero and mass at dry mass. Flat-ground/pad contact uses the existing solver (\(e=0.25\)); evaluate touchdown before impact response. No drag or atmosphere.

The **one new physics feature** is variable-mass rocket propulsion: finite fuel burns under thrust, changing mass and acceleration. Use Lab 10's velocity Verlet at fixed `DT = 1/240 s`; update mass at the substep midpoint, synchronize inverse mass, and clamp the final burn to remaining fuel. Handle contact impulses separately.

Starting scale: a 20 m × 18 m arena, 0.42 m lander radius, and 2.9 m pad. Tuning values: 1,000 kg dry mass, 150 kg fuel, 8 kN maximum thrust, and \(I_{\rm sp}=300\ \mathrm s\).

## A3 — Three-tier scope

- **MUST — end of Week 12:** One lunar scene with finite fuel, variable mass, clear landing/crash outcomes, keyboard/touch controls, pause/step/reset, and HUD (altitude, speed, attitude, fuel, score); physics checks, controls/model documentation, deployed to GitHub Pages.
- **SHOULD — Week 13:** Explain mass-dependent acceleration and add a landing/fuel debrief.
- **COULD — prepared to drop:** Sound; level editor; extra scenes.

## A4 — Validation plan

1. **Rocket equation:** Disable gravity/contact; burn from \(m_0=1150\) to \(m_f=1050\) kg. Compare \(\Delta v\) with \(I_{\rm sp}g_0\ln(m_0/m_f)\); at `DT = 1/240 s`, relative error **< 1%**.
2. **Switch-off energy:** Disable thrust and contact, hold mass at 1,150 kg, and simulate lunar free-fall from \(y=12\) m, \(v_y=-6\ \mathrm{m/s}\) for 60 s with Verlet at `DT = 1/240 s`. For \(E=\frac12mv_y^2+mg_Ly\), expect constant energy; maximum \(|\Delta E/E_0|\) must be **< \(10^{-8}\)**.
3. **Fuel bound:** Burn past depletion. Fuel must stay ≥0 kg, mass ≥1,000 kg, and thrust become zero. Tolerance: **no negative fuel or mass**.
4. **Touchdown:** Pad center, \(v_x=0.5\), \(v_y=-1.0\ \mathrm{m/s}\), \(\theta=0^\circ\) must pass; \(x=1.46\) m from center, \(|v_y|=1.81\), \(|v_x|=1.11\ \mathrm{m/s}\), or \(|\theta|=16^\circ\) must fail. Limits: 1.45 m pad half-width, \(|v_y|\le1.8\), \(|v_x|\le1.1\ \mathrm{m/s}\), \(|\theta|\le15^\circ\); input tolerance **0.001 m, 0.001 m/s, 0.01°**.

## A5 — Biggest risk + fallback

The thing most likely to sink this project is that variable thrust-to-mass makes precision landings too difficult for new players, and my fallback is to start closer and slower with a 4 m safe pad, keeping the narrow precision zone as an optional high-score target.

## A6 — Week-by-week timeline

| Week | Deliverable |
|---|---|
| 11 | Proposal, 90-minute variable-mass thrust spike, findings. |
| 12 | MUST, physics checks, docs, GitHub Pages deployment. |
| 13 | SHOULD, validation report, final docs and peer review. |
| 14 | Final polish, public presentation, and project write-up. |

## A7 — Audience

For physics students and curious players: a safe landing takes fuel management plus control of touchdown speed, position, and attitude.
