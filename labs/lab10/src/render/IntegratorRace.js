import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { SCENES } from '../scenes.js';

const RACE_SOLVERS = [
  ['euler', 'Euler'],
  ['ec', 'Euler–Cromer'],
  ['verlet', 'Velocity Verlet']
];

export class IntegratorRace {
  constructor({ leftCanvas, rightCanvas, plotCanvas, leftSelect, rightSelect,
                readout, resetButton, onIntegratorsChange = () => {}, dt,
                leftIntegrator = 'euler', rightIntegrator = 'verlet' }) {
    this.canvases = [leftCanvas, rightCanvas];
    this.plotCanvas = plotCanvas;
    this.leftSelect = leftSelect;
    this.rightSelect = rightSelect;
    this.readout = readout;
    this.onIntegratorsChange = onIntegratorsChange;
    this.dt = dt;
    this.integrators = [leftIntegrator, rightIntegrator];
    this.worlds = [];
    this.cameras = [new Camera(), new Camera()];
    this.renderers = this.canvases.map((canvas, i) => new Renderer(canvas, this.cameras[i]));
    this.samples = [];
    this.accumulator = 0;
    this.sampleLimit = 1600;
    this.view = [-6, 6, -5, 4.5];
    this.leftSelect.addEventListener('change', () => {
      this.integrators[0] = this.leftSelect.value;
      this.reset();
      this.onIntegratorsChange(...this.integrators);
    });
    this.rightSelect.addEventListener('change', () => {
      this.integrators[1] = this.rightSelect.value;
      this.reset();
      this.onIntegratorsChange(...this.integrators);
    });
    resetButton.addEventListener('click', () => this.reset());
    this.populateSelects();
    this.reset();
  }

  setIntegrators(left, right) {
    if (left === this.integrators[0] && right === this.integrators[1]) return;
    this.integrators = [left, right];
    this.leftSelect.value = left;
    this.rightSelect.value = right;
    this.reset();
  }

  populateSelects() {
    for (const select of [this.leftSelect, this.rightSelect]) {
      select.replaceChildren(...RACE_SOLVERS.map(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }));
    }
    this.leftSelect.value = this.integrators[0];
    this.rightSelect.value = this.integrators[1];
  }

  reset() {
    const state = {
      dt: this.dt,
      integrator: this.integrators[0],
      restitution: 1,
      gravity: 9.81,
      drag: 0,
      count: 9
    };
    this.worlds = this.integrators.map(integrator =>
      SCENES.chain({ ...state, integrator }).world
    );
    this.cameras.forEach((camera, i) => {
      const rect = this.canvases[i].getBoundingClientRect();
      camera.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      camera.fit(...this.view);
      this.renderers[i].resize();
    });
    this.accumulator = 0;
    this.samples = [{ time: 0, divergence: 0 }];
    this._drawPlot();
    this.draw();
  }

  resize() {
    this.cameras.forEach((camera, i) => {
      this.renderers[i].resize();
      camera.fit(...this.view);
    });
    this._resizePlot();
    this.draw();
  }

  advance(seconds) {
    this.accumulator += Math.min(seconds, this.dt * 64);
    let steps = 0;
    while (this.accumulator >= this.dt && steps < 64) {
      for (const world of this.worlds) world.step(this.dt);
      this.accumulator -= this.dt;
      steps++;
      const divergence = this.divergence();
      if (!Number.isFinite(divergence)) {
        this.readout.textContent = 'Divergence exceeded the numeric range; reset the race.';
        return;
      }
      this.samples.push({ time: this.worlds[0].time, divergence });
      if (this.samples.length > this.sampleLimit) this.samples.shift();
    }
  }

  divergence() {
    const [a, b] = this.worlds;
    if (!a || !b || a.bodies.length !== b.bodies.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.bodies.length; i++) {
      const dx = a.bodies[i].pos.x - b.bodies[i].pos.x;
      const dy = a.bodies[i].pos.y - b.bodies[i].pos.y;
      sum += dx * dx + dy * dy;
    }
    return Math.sqrt(sum / a.bodies.length);
  }

  draw() {
    this.renderers.forEach((renderer, i) => renderer.draw(this.worlds[i]));
    this._drawPlot();
  }

  _resizePlot() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.plotCanvas.getBoundingClientRect();
    this.plotCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.plotCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.plotCanvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _drawPlot() {
    const ctx = this.plotCanvas.getContext('2d');
    const rect = this.plotCanvas.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.plotCanvas.width !== Math.round(width * dpr) ||
        this.plotCanvas.height !== Math.round(height * dpr)) this._resizePlot();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, width, height);

    const pad = { left: 48, right: 12, top: 12, bottom: 28 };
    const plotWidth = Math.max(1, width - pad.left - pad.right);
    const plotHeight = Math.max(1, height - pad.top - pad.bottom);
    const lastTime = this.samples.length ? this.samples[this.samples.length - 1].time : 0;
    const firstTime = Math.max(0, lastTime - 20);
    const visible = this.samples.filter(sample => sample.time >= firstTime);
    const maxY = Math.max(0.01, ...visible.map(sample => sample.divergence));

    ctx.strokeStyle = '#30363d';
    ctx.fillStyle = '#9aa4af';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotHeight * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
      ctx.fillText((maxY * (1 - i / 4)).toPrecision(2), 3, y + 4);
    }
    ctx.fillText(`${firstTime.toFixed(1)} s`, pad.left, height - 7);
    ctx.fillText(`${lastTime.toFixed(1)} s`, width - 48, height - 7);
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotWidth, plotHeight);
    ctx.clip();
    ctx.strokeStyle = '#ff8200';
    ctx.lineWidth = 2;
    ctx.beginPath();
    visible.forEach((sample, i) => {
      const x = pad.left + ((sample.time - firstTime) / Math.max(1e-9, lastTime - firstTime || 1)) * plotWidth;
      const y = pad.top + plotHeight * (1 - sample.divergence / maxY);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    const divergence = this.divergence();
    this.readout.textContent = `Time ${lastTime.toFixed(2)} s · RMS position difference ${divergence.toExponential(3)} m`;
  }
}
