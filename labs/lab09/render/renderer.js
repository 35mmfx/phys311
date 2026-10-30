export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("A 2D canvas context is required.");
    this.camera = camera;
    this.showTrails = false;
    this.trails = new Map();
    this.maxTrailPoints = 180;
  }

  clearTrails() {
    this.trails.clear();
  }

  recordTrails(world) {
    for (const body of world.bodies) {
      let trail = this.trails.get(body.id);
      if (!trail) {
        trail = [];
        this.trails.set(body.id, trail);
      }
      trail.push({ x: body.pos.x, y: body.pos.y });
      if (trail.length > this.maxTrailPoints) trail.shift();
    }
  }

  draw(world) {
    const { ctx, canvas, camera } = this;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    if (world.bounds) {
      const { xMin, xMax, yMin, yMax } = world.bounds;
      const left = camera.toScreenX(xMin);
      const top = camera.toScreenY(yMax);
      const right = camera.toScreenX(xMax);
      const bottom = camera.toScreenY(yMin);
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, right - left, bottom - top);
    }

    for (const force of world.forces) {
      if (!force.bodyA || !force.bodyB) continue;
      ctx.beginPath();
      ctx.moveTo(
        camera.toScreenX(force.bodyA.pos.x),
        camera.toScreenY(force.bodyA.pos.y)
      );
      ctx.lineTo(
        camera.toScreenX(force.bodyB.pos.x),
        camera.toScreenY(force.bodyB.pos.y)
      );
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (this.showTrails) {
      for (const body of world.bodies) {
        const trail = this.trails.get(body.id);
        if (!trail || trail.length < 2) continue;
        ctx.beginPath();
        trail.forEach((point, index) => {
          const x = camera.toScreenX(point.x);
          const y = camera.toScreenY(point.y);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = ["#ff8200", "#2ea8a1", "#6c8cff", "#d66b9c"][body.id % 4];
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    for (const body of world.bodies) {
      const x = camera.toScreenX(body.pos.x);
      const y = camera.toScreenY(body.pos.y);
      const radius = camera.toScreenLen(body.radius);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = body.isStatic
        ? "#64748b"
        : ["#ff8200", "#2ea8a1", "#6c8cff", "#d66b9c", "#9b72cf"][body.id % 5];
      ctx.fill();
      ctx.strokeStyle = body.isStatic ? "#334155" : "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + radius * Math.cos(body.theta),
        y + radius * Math.sin(body.theta)
      );
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
