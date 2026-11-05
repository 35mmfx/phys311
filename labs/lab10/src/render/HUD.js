// HUD.js — the honesty instrument. Reports drift against a reference captured
// ONCE at scene build time. If you recompute E0 every frame you will always
// read 0.000% and learn nothing (see Exam Q22).
export class HUD {
  constructor(el) { this.el = el; this.fps = 60; this._last = null; }

  tick(now) {
    if (this._last !== null) {
      const inst = 1000 / Math.max(1e-6, now - this._last);
      this.fps = this.fps * 0.9 + inst * 0.1;
    }
    this._last = now;
  }

  update(world, { substeps = 0, paused = false, cursor = null } = {}) {
    const dE = world.driftE();
    const dP = world.driftP();
    const energyOpen = world.energyMode === 'open';
    const bad = !energyOpen && Math.abs(dE) > 0.01;
    const expectP = world.momentumConserved && !(world.pointer && world.pointer.active);
    const badP = expectP && dP > 1e-6;
    const lander = world.lander;
    const drive = world.landerDrive;
    const impact = world.mission?.impact;
    this.el.innerHTML = `
      <span class="k">t</span><span class="v">${world.time.toFixed(2)} s</span>
      <span class="k">steps</span><span class="v">${world.steps}</span>
      <span class="k">bodies</span><span class="v">${world.bodies.length}</span>
      ${lander ? `
      <span class="k">altitude</span><span class="v">${Math.max(0, lander.pos.y - lander.radius).toFixed(2)} m</span>
      <span class="k">${impact ? 'vertical impact speed' : 'vertical speed'}</span><span class="v">${(impact ? impact.verticalSpeed : lander.vel.y).toFixed(2)} m/s</span>
      <span class="k">${impact ? 'horizontal impact speed' : 'horizontal speed'}</span><span class="v">${(impact ? impact.horizontalSpeed : lander.vel.x).toFixed(2)} m/s</span>
      <span class="k">${impact ? 'impact angle' : 'orientation'}</span><span class="v">${((impact ? impact.angle : lander.angle) * 180 / Math.PI).toFixed(0)}°</span>
      <span class="k">propulsion reserve</span><span class="v">${drive.charge.toFixed(0)}%</span>
      ` : ''}
      <span class="k">KE</span><span class="v">${world.kinetic().toFixed(3)} J</span>
      <span class="k">E mech</span><span class="v">${world.mechanical().toFixed(3)} J</span>
      <span class="k">E lost</span><span class="v">${(world.inelastic + world.dissipated).toFixed(3)} J</span>
      <span class="k">&Delta;E/E&#8320;</span>
      <span class="v ${energyOpen ? 'na' : (bad ? 'bad' : 'ok')}" title="${energyOpen ? 'Open system: solar charging and electric thrust exchange energy with the lander.' : 'Closed-system energy drift'}">${(dE * 100).toFixed(3)} %${energyOpen ? ' (open)' : ''}</span>
      <span class="k">&Delta;p/p&#8320;</span>
      <span class="v ${badP ? 'bad' : (expectP ? 'ok' : 'na')}" title="${expectP ? 'isolated system: must hold' : 'external forces present: not expected to hold'}">${dP.toExponential(2)}${expectP ? '' : ' n/a'}</span>
      <span class="k">cursor</span>
      <span class="v">${cursor ? `x ${cursor[0].toFixed(2)}, y ${cursor[1].toFixed(2)} m` : 'outside canvas'}</span>
      <span class="k">fps</span><span class="v">${this.fps.toFixed(0)}</span>
      <span class="k">sub/frame</span><span class="v">${substeps}${paused ? ' (paused)' : ''}</span>`;
    // Screen readers: announce only the physics honesty numbers, not fps.
    this.el.setAttribute('aria-label',
      `time ${world.time.toFixed(1)} seconds, ${energyOpen ? 'open-system energy change' : 'energy drift'} ${(dE*100).toFixed(2)} percent`);
  }
}
