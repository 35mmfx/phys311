// render/Renderer.js -- draws a World. Reads the world; never changes it.
// If you ever feel the urge to write `body.vel.x = ...` in this file,
// that code belongs in engine/.

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.showTrails = true;
    this.showVectors = false;
    this.showGrid = true;
    this.trails = new Map();       // body -> array of world points
    this.trailLength = 400;
  }

  clearTrails() { this.trails.clear(); }

  recordTrails(world) {
    if (!this.showTrails) return;
    for (const b of world.bodies) {
      let t = this.trails.get(b);
      if (!t) { t = []; this.trails.set(b, t); }
      t.push({ x: b.pos.x, y: b.pos.y });
      if (t.length > this.trailLength) t.shift();
    }
  }

  draw(world) {
    const { ctx, canvas, camera } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);   // every frame, always
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.showGrid) this._grid();
    if (world.bounds && world.bounds.enabled) this._bounds(world.bounds);
    if (this.showTrails) this._trails();

    for (const b of world.bodies) this._body(b);
    if (this.showVectors) for (const b of world.bodies) this._vectors(b);
  }

  _grid() {
    const { ctx, canvas, camera } = this;
    const step = this._niceStep(120 / camera.scale);
    const tl = camera.screenToWorld({ x: 0, y: 0 });
    const br = camera.screenToWorld({ x: canvas.width, y: canvas.height });
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(tl.x / step) * step; x < br.x; x += step) {
      const s = camera.worldToScreen({ x, y: 0 });
      ctx.moveTo(s.x, 0); ctx.lineTo(s.x, canvas.height);
    }
    for (let y = Math.ceil(br.y / step) * step; y < tl.y; y += step) {
      const s = camera.worldToScreen({ x: 0, y });
      ctx.moveTo(0, s.y); ctx.lineTo(canvas.width, s.y);
    }
    ctx.stroke();
  }

  _niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  _bounds(b) {
    const { ctx, camera } = this;
    const a = camera.worldToScreen({ x: b.xmin, y: b.ymax });
    const c = camera.worldToScreen({ x: b.xmax, y: b.ymin });
    ctx.strokeStyle = 'rgba(255,130,0,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
  }

  _trails() {
    const { ctx, camera } = this;
    ctx.lineWidth = 1.5;
    for (const [body, pts] of this.trails) {
      if (pts.length < 2) continue;
      ctx.strokeStyle = body.color + '66';
      ctx.beginPath();
      let s = camera.worldToScreen(pts[0]);
      ctx.moveTo(s.x, s.y);
      for (let i = 1; i < pts.length; i++) {
        s = camera.worldToScreen(pts[i]);
        ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
  }

  _body(b) {
    const { ctx, camera } = this;
    const s = camera.worldToScreen(b.pos);
    const r = Math.max(camera.lengthToScreen(b.radius), 2);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    // orientation spoke, so rotation is visible
    if (r > 4) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + r * Math.cos(b.theta), s.y - r * Math.sin(b.theta));
      ctx.stroke();
    }
  }

  _vectors(b) {
    const { ctx, camera } = this;
    const s = camera.worldToScreen(b.pos);
    const k = camera.scale * 0.12;
    const arrow = (vx, vy, col) => {
      if (vx === 0 && vy === 0) return;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + vx * k, s.y - vy * k);   // flip y here too
      ctx.stroke();
    };
    arrow(b.vel.x, b.vel.y, '#4ec9f5');
    arrow(b.acc.x, b.acc.y, '#ff5d5d');
  }
}
