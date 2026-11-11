export class HUD {
  constructor(element) {
    if (!element) throw new TypeError("HUD needs a target element.");
    this.element = element;
  }

  update(world, fps, physicsMs = 0, renderMs = 0) {
    const momentum = world.totalMomentum();
    const baseline = world.baseline || world.captureBaseline();
    const energy = world.totalEnergy();
    const energyDrift = Math.abs(baseline.energy) > 1e-12
      ? (energy - baseline.energy) / Math.abs(baseline.energy)
      : energy - baseline.energy;
    const driftPercent = 100 * energyDrift;
    this.element.classList.toggle("drift-warning", Math.abs(driftPercent) > 1);
    const values = [
      ["time", `${world.time.toFixed(2)} s`],
      ["bodies", world.bodies.length],
      ["energy", `${energy.toFixed(3)} J`],
      ["energy drift", `${driftPercent.toFixed(3)}%`],
      ["|momentum|", `${momentum.length().toFixed(3)} kg·m/s`],
      ["angular momentum", `${world.totalAngularMomentum().toFixed(3)} kg·m²/s`],
      ["pair checks", world.pairChecks],
      ["physics", `${physicsMs.toFixed(2)} ms`],
      ["render", `${renderMs.toFixed(2)} ms`],
      ["FPS", fps.toFixed(0)]
    ];
    this.element.replaceChildren(...values.map(([label, value]) => {
      const item = document.createElement("span");
      item.className = "hud-item";
      item.textContent = `${label}: ${value}`;
      return item;
    }));
  }
}
