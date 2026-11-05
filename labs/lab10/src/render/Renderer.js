// Renderer.js — draws a World. Reads the world, never mutates it.
export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.cam    = camera;
    this.dpr    = 1;
    this.showTrails = true;
    this.showVelocity = false;
    this.showForceVectors = false;
    this.trails = new Map();             // body.id -> array of [x,y]
    this.maxTrail = 160;
    this.reducedMotion = false;
  }

  // Handle Retina / high-DPI screens: back the canvas with more device pixels
  // than CSS pixels, then scale the context once so all drawing stays in CSS units.
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.canvas.width  = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.cam.resize(w, h);
  }

  clearTrails() { this.trails.clear(); }

  recordTrails(world) {
    if (!this.showTrails || this.reducedMotion) return;
    for (const b of world.bodies) {
      if (!this.trails.has(b.id)) this.trails.set(b.id, []);
      const t = this.trails.get(b.id);
      t.push([b.pos.x, b.pos.y]);
      if (t.length > this.maxTrail) t.shift();
    }
  }

  draw(world, { grabbed = null, target = null, cursor = null, slingshot = null } = {}) {
    const ctx = this.ctx, cam = this.cam;
    ctx.clearRect(0, 0, cam.w, cam.h);

    this._grid(world);
    if (world.bounds) this._bounds(world.bounds);

    if (this.showTrails && !this.reducedMotion) {
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const b of world.bodies) {
        const t = this.trails.get(b.id);
        if (!t || t.length < 2) continue;
        ctx.strokeStyle = b.color;
        for (let i = 1; i < t.length; i++) {
          const [x0, y0] = cam.toScreen(...t[i - 1]);
          const [x1, y1] = cam.toScreen(...t[i]);
          ctx.globalAlpha = 0.06 + 0.72 * (i / (t.length - 1));
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      }
      ctx.restore();
    }

    for (const f of world.forces)
      if (f.constructor.name === 'Spring' && f.enabled) {
        const [ax, ay] = cam.toScreen(f.a.pos.x, f.a.pos.y);
        const [bx, by] = cam.toScreen(f.b.pos.x, f.b.pos.y);
        ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }

    if (this.showVelocity) this._velocityVectors(world);
    if (this.showForceVectors) this._forceVectors(world);

    for (const b of world.bodies) {
      const [px, py] = cam.toScreen(b.pos.x, b.pos.y);
      const r = Math.max(2.5, b.radius * cam.scale);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = b.color; ctx.fill();
      if (b === grabbed) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
      else if (b.fixed)  { ctx.lineWidth = 2; ctx.strokeStyle = '#333';    ctx.stroke(); }
    }

    if (grabbed && target) {              // the rubber band
      const [gx, gy] = cam.toScreen(grabbed.pos.x, grabbed.pos.y);
      const [tx, ty] = cam.toScreen(target.x, target.y);
      ctx.save();
      ctx.setLineDash([6, 5]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.restore();
    }

    if (slingshot && slingshot.origin && slingshot.current) this._slingshot(slingshot, world);
    if (cursor) this._crosshair(cursor);
  }

  _velocityVectors(world) {
    const ctx = this.ctx, cam = this.cam;
    ctx.save();
    ctx.strokeStyle = '#7ee787';
    ctx.fillStyle = '#7ee787';
    ctx.lineWidth = 1.5;
    for (const b of world.bodies) {
      if (b.fixed) continue;
      const [x, y] = cam.toScreen(b.pos.x, b.pos.y);
      const vx = b.vel.x * 0.35;
      const vy = b.vel.y * 0.35;
      const [tx, ty] = cam.toScreen(b.pos.x + vx, b.pos.y + vy);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      const angle = Math.atan2(ty - y, tx - x);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 5 * Math.cos(angle - Math.PI / 6), ty - 5 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tx - 5 * Math.cos(angle + Math.PI / 6), ty - 5 * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _forceVectors(world) {
    const ctx = this.ctx, cam = this.cam;
    ctx.save();
    ctx.strokeStyle = '#ffd866';
    ctx.fillStyle = '#ffd866';
    ctx.lineWidth = 1.25;
    for (const b of world.bodies) {
      if (b.fixed || !b.force) continue;
      const len = Math.hypot(b.force.x, b.force.y);
      if (len < 1e-8) continue;
      const sx = b.pos.x + b.force.x * 0.08;
      const sy = b.pos.y + b.force.y * 0.08;
      const [x, y] = cam.toScreen(b.pos.x, b.pos.y);
      const [tx, ty] = cam.toScreen(sx, sy);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      const angle = Math.atan2(ty - y, tx - x);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 5 * Math.cos(angle - Math.PI / 6), ty - 5 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(tx - 5 * Math.cos(angle + Math.PI / 6), ty - 5 * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _slingshot(slingshot, world) {
    const ctx = this.ctx, cam = this.cam;
    const { origin, current } = slingshot;
    const launchVelocity = slingshot.velocity || {
      x: (origin.x - current.x) * 5.5,
      y: (origin.y - current.y) * 5.5
    };
    let velocity = {
      x: launchVelocity.x + (slingshot.body ? slingshot.body.vel.x : 0),
      y: launchVelocity.y + (slingshot.body ? slingshot.body.vel.y : 0)
    };
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > 30) velocity = { x: velocity.x * 30 / speed, y: velocity.y * 30 / speed };
    const [bx, by] = cam.toScreen(origin.x, origin.y);
    const [ax, ay] = cam.toScreen(current.x, current.y);
    const gravity = world.forces.find(f => f.constructor.name === 'UniformGravity')?.g || 0;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#ffd866';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(bx, by, Math.max(3, 0.26 * cam.scale), 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.globalAlpha = 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffd866';
    ctx.stroke();

    ctx.strokeStyle = '#ffd866';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const time = i * 0.08;
      const px = origin.x + velocity.x * time;
      const py = origin.y + velocity.y * time - 0.5 * gravity * time * time;
      const [sx, sy] = cam.toScreen(px, py);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  _crosshair(position) {
    const [x, y] = this.cam.toScreen(position[0], position[1]);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#d2a8ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, this.cam.h);
    ctx.moveTo(0, y); ctx.lineTo(this.cam.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _grid(world) {
    const ctx = this.ctx, cam = this.cam;
    const [x0, y0] = cam.toWorld(0, cam.h);
    const [x1, y1] = cam.toWorld(cam.w, 0);
    let s = 1;
    while ((x1 - x0) / s > 22) s *= 2;
    ctx.strokeStyle = '#242424'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / s) * s; x <= x1; x += s) {
      const [px] = cam.toScreen(x, 0); ctx.moveTo(px, 0); ctx.lineTo(px, cam.h);
    }
    for (let y = Math.ceil(y0 / s) * s; y <= y1; y += s) {
      const [, py] = cam.toScreen(0, y); ctx.moveTo(0, py); ctx.lineTo(cam.w, py);
    }
    ctx.stroke();
  }

  _bounds(bn) {
    const ctx = this.ctx, cam = this.cam;
    const [x0, y1] = cam.toScreen(bn.xmin, bn.ymax);
    const [x1, y0] = cam.toScreen(bn.xmax, bn.ymin);
    ctx.strokeStyle = '#ff8200'; ctx.lineWidth = 2;
    ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
  }
}
