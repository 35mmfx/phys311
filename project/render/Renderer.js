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
    this.dustMission = null;
    this.dustParticles = [];
    this.dustTriggered = false;
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

  draw(world, {
    grabbed = null, target = null, cursor = null, slingshot = null,
    frameSeconds = 1 / 60, prediction = null
  } = {}) {
    const ctx = this.ctx, cam = this.cam;
    ctx.clearRect(0, 0, cam.w, cam.h);

    this._grid(world);
    if (world.bounds) this._bounds(world.bounds);
    if (world.lander) this._landerScene(world);
    if (prediction) this._trajectory(prediction, world);

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
    if (world.mission) this._drawImpactDust(world, frameSeconds);

    for (const b of world.bodies) {
      if (b.tag === 'lander') {
        this._landerCraft(b, world.landerDrive);
        continue;
      }
      if (b.tag === 'asteroid') {
        this._asteroid(b, world.time);
        continue;
      }
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

  _trajectory(prediction, world) {
    const ctx = this.ctx, cam = this.cam;
    ctx.save();
    ctx.strokeStyle = '#ffd866';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    prediction.points.forEach((point, index) => {
      const [x, y] = cam.toScreen(point.x, point.y);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (prediction.kind === 'floor') {
      const [x, y] = cam.toScreen(prediction.position.x, world.bounds.ymin);
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawImpactDust(world, frameSeconds) {
    const mission = world.mission;
    if (mission !== this.dustMission) {
      this.dustMission = mission;
      this.dustParticles = [];
      this.dustTriggered = false;
    }

    if (!this.dustTriggered && mission.status === 'crashed' && mission.impact) {
      this.dustTriggered = true;
      const { verticalSpeed, horizontalSpeed } = mission.impact;
      if (Math.abs(verticalSpeed) > 1.8 || Math.abs(horizontalSpeed) > 1.1) {
        const impactSeverity = Math.min(1.7, Math.max(
          Math.abs(verticalSpeed) / 1.8,
          Math.abs(horizontalSpeed) / 1.1
        ));
        const count = 32;
        for (let i = 0; i < count; i++) {
          const angle = Math.PI * (i + 0.5) / count;
          const speed = 1.1 + ((i * 7) % 11) / 10 * (1 + impactSeverity * 0.3);
          this.dustParticles.push({
            x: world.lander.pos.x,
            y: world.bounds.ymin + 0.025,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0,
            life: 1.3 + ((i * 3) % 7) * 0.12,
            radius: 0.12 + ((i * 5) % 8) * 0.02
          });
        }
      }
    }

    const dt = Number.isFinite(frameSeconds)
      ? Math.min(Math.max(frameSeconds, 0), 0.1)
      : 0;
    const ctx = this.ctx, cam = this.cam;
    this.dustParticles = this.dustParticles.filter(particle => {
      particle.age += dt;
      const progress = particle.age / particle.life;
      if (progress >= 1) return false;

      const x = particle.x + particle.vx * particle.age;
      const y = particle.y + particle.vy * particle.age - 0.35 * particle.age ** 2;
      const [sx, sy] = cam.toScreen(x, y);
      const radius = (particle.radius + particle.age * 0.24) * cam.scale;
      const opacity = 0.85 * (1 - progress);
      const gradient = ctx.createRadialGradient(
        sx, sy, radius * 0.08, sx, sy, radius
      );
      gradient.addColorStop(0, `rgba(210,192,160,${opacity})`);
      gradient.addColorStop(1, 'rgba(210,192,160,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
  }

  _landerScene(world) {
    const ctx = this.ctx, cam = this.cam, mission = world.mission;
    const [groundX, groundY] = cam.toScreen(world.bounds.xmin, world.bounds.ymin);
    const [rightX, bottomY] = cam.toScreen(world.bounds.xmax, world.bounds.ymin - 1);
    ctx.fillStyle = '#292a2b';
    ctx.fillRect(groundX, groundY, rightX - groundX, bottomY - groundY);

    const [padLeft, padY] = cam.toScreen(mission.padCenter - mission.padHalfWidth, 0);
    const [padRight] = cam.toScreen(mission.padCenter + mission.padHalfWidth, 0);
    ctx.strokeStyle = '#7ee787';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(padLeft, padY); ctx.lineTo(padRight, padY); ctx.stroke();
    ctx.lineWidth = 1;
    for (let i = 0; i < 13; i++) {
      const x = world.bounds.xmin + 1 + i * 1.5;
      const [sx, sy] = cam.toScreen(x, 0);
      ctx.strokeStyle = '#5b6065';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 0.3 * cam.scale, sy + 0.22 * cam.scale); ctx.stroke();
    }

  }

  _landerCraft(body, drive) {
    const ctx = this.ctx, cam = this.cam;
    const [x, y] = cam.toScreen(body.pos.x, body.pos.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-body.angle);
    ctx.scale(cam.scale, cam.scale);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.075;
    ctx.strokeStyle = '#59636e';
    ctx.beginPath();
    ctx.moveTo(-0.19, 0.12); ctx.lineTo(-0.38, 0.43); ctx.lineTo(-0.14, 0.43);
    ctx.moveTo(0.19, 0.12); ctx.lineTo(0.38, 0.43); ctx.lineTo(0.14, 0.43);
    ctx.stroke();
    ctx.lineWidth = 0.027;
    ctx.strokeStyle = '#d5dde5';
    ctx.beginPath();
    ctx.moveTo(-0.19, 0.12); ctx.lineTo(-0.38, 0.43); ctx.lineTo(-0.14, 0.43);
    ctx.moveTo(0.19, 0.12); ctx.lineTo(0.38, 0.43); ctx.lineTo(0.14, 0.43);
    ctx.stroke();

    ctx.lineCap = 'butt';
    ctx.fillStyle = '#4b535d';
    ctx.beginPath();
    ctx.moveTo(-0.11, 0.18); ctx.lineTo(-0.085, 0.34);
    ctx.lineTo(0.085, 0.34); ctx.lineTo(0.11, 0.18); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#aeb8c2';
    ctx.fillRect(-0.13, 0.17, 0.26, 0.045);

    const hull = ctx.createLinearGradient(-0.24, 0, 0.24, 0);
    hull.addColorStop(0, '#f4f7fa');
    hull.addColorStop(0.34, '#cbd3dc');
    hull.addColorStop(0.7, '#8995a2');
    hull.addColorStop(1, '#4d5864');
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = '#e6edf3';
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(0, -0.34); ctx.lineTo(-0.25, -0.04);
    ctx.lineTo(-0.19, 0.22); ctx.lineTo(0.19, 0.22);
    ctx.lineTo(0.25, -0.04); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.27)';
    ctx.beginPath();
    ctx.moveTo(0, -0.30); ctx.lineTo(-0.20, -0.035);
    ctx.lineTo(-0.095, 0.17); ctx.lineTo(0, 0.2); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(22,29,37,0.32)';
    ctx.beginPath();
    ctx.moveTo(0, -0.30); ctx.lineTo(0.20, -0.035);
    ctx.lineTo(0.16, 0.17); ctx.lineTo(0, 0.2); ctx.closePath();
    ctx.fill();

    const canopy = ctx.createLinearGradient(-0.1, -0.27, 0.1, -0.04);
    canopy.addColorStop(0, '#d7f0ff');
    canopy.addColorStop(0.42, '#5d8ca5');
    canopy.addColorStop(1, '#233b4c');
    ctx.fillStyle = canopy;
    ctx.strokeStyle = '#f2f6fa';
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(0, -0.285); ctx.lineTo(-0.145, -0.095);
    ctx.lineTo(0.145, -0.095); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(-0.105, -0.12); ctx.lineTo(-0.025, -0.245); ctx.stroke();

    ctx.fillStyle = '#272d34';
    ctx.fillRect(-0.205, -0.018, 0.41, 0.105);
    ctx.fillStyle = '#ff8200';
    ctx.fillRect(-0.19, -0.005, 0.018, 0.079);
    ctx.font = 'bold 0.064px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff4e8';
    ctx.fillText('UT Mission', 0.005, 0.034);

    ctx.fillStyle = '#687481';
    for (const [px, py] of [[-0.155, 0.12], [0.155, 0.12], [-0.205, -0.005], [0.205, -0.005]]) {
      ctx.beginPath(); ctx.arc(px, py, 0.012, 0, Math.PI * 2); ctx.fill();
    }

    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#aeb8c2';
    ctx.beginPath();
    ctx.moveTo(-0.4, 0.43); ctx.lineTo(-0.12, 0.43);
    ctx.moveTo(0.12, 0.43); ctx.lineTo(0.4, 0.43);
    ctx.stroke();

    if (drive.thrusting && drive.fuel > 0 && !body.fixed) {
      const flame = ctx.createLinearGradient(0, 0.24, 0, 0.58);
      flame.addColorStop(0, '#fff0a6');
      flame.addColorStop(0.35, '#ffb02e');
      flame.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = flame;
      ctx.beginPath(); ctx.moveTo(-0.12, 0.24); ctx.lineTo(0, 0.58);
      ctx.lineTo(0.12, 0.24); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _asteroid(body, time) {
    const ctx = this.ctx, cam = this.cam;
    const [x, y] = cam.toScreen(body.pos.x, body.pos.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.7);
    ctx.scale(body.radius * cam.scale, body.radius * cam.scale);
    ctx.beginPath();
    ctx.moveTo(-0.9, -0.15);
    ctx.lineTo(-0.55, -0.8);
    ctx.lineTo(0.1, -0.95);
    ctx.lineTo(0.75, -0.55);
    ctx.lineTo(0.9, 0.2);
    ctx.lineTo(0.45, 0.8);
    ctx.lineTo(-0.35, 0.9);
    ctx.lineTo(-0.85, 0.45);
    ctx.closePath();
    ctx.fillStyle = body.color;
    ctx.fill();
    ctx.strokeStyle = '#514b44';
    ctx.lineWidth = 0.08;
    ctx.stroke();
    ctx.fillStyle = '#655e55';
    ctx.beginPath();
    ctx.arc(-0.3, -0.2, 0.18, 0, 2 * Math.PI);
    ctx.arc(0.35, 0.3, 0.12, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
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
