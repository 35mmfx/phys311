// Pointer and keyboard event handling for the simulation.
export function eventToWorld(event, canvas, camera) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError('Canvas must have a non-zero display and drawing-buffer size.');
  }

  const pixelX = (event.clientX - rect.left) * (canvas.width / rect.width);
  const pixelY = (event.clientY - rect.top) * (canvas.height / rect.height);
  return camera.toWorld(
    pixelX * (camera.w / canvas.width),
    pixelY * (camera.h / canvas.height)
  );
}

export function slingshotVelocity(origin, current) {
  const scale = 5.5;
  const maxSpeed = 30;
  let x = (origin.x - current.x) * scale;
  let y = (origin.y - current.y) * scale;
  const speed = Math.hypot(x, y);
  if (speed > maxSpeed) {
    x *= maxSpeed / speed;
    y *= maxSpeed / speed;
  }
  return { x, y };
}

export class PointerInput {
  constructor(canvas, camera, world, spring, {
    onSpawn = null, onLaunch = () => {}, onCursor = () => {}, slingshotMode = false
  } = {}) {
    this.canvas = canvas; this.cam = camera;
    this.world = world; this.spring = spring;
    this.onSpawn = onSpawn;
    this.onLaunch = onLaunch;
    this.onCursor = onCursor;
    this.spawnMode = false;
    this.slingshotMode = slingshotMode;
    this.cursor = null;
    this.launch = null;
    this.activePointerId = null;
    this._bind();
  }

  _updateCursor(ev) {
    this.cursor = eventToWorld(ev, this.canvas, this.cam);
    this.onCursor(this.cursor);
    return this.cursor;
  }

  _clearCursor() {
    this.cursor = null;
    this.onCursor(null);
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      if (this.activePointerId !== null) return;
      c.setPointerCapture(ev.pointerId);
      this.activePointerId = ev.pointerId;
      const [x, y] = this._updateCursor(ev);
      if (this.slingshotMode) {
        if (this.world.pick(x, y, 0.15)) return;
        const origin = { x, y };
        this.launch = { body: null, origin, current: { x, y }, velocity: { x: 0, y: 0 } };
        return;
      }
      if (this.spawnMode) { this.onSpawn && this.onSpawn(x, y); return; }
      const b = this.world.pick(x, y, 0.15);
      if (!b) return;
      this.spring.grab(b, x, y); c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', (ev) => {
      const [x, y] = this._updateCursor(ev);
      if (this.launch) {
        this.launch.current = { x, y };
        this.launch.velocity = slingshotVelocity(this.launch.origin, this.launch.current);
        return;
      }
      if (this.spring.active) this.spring.moveTo(x, y);
      else c.style.cursor = this.world.pick(x, y, 0.15) ? 'grab' : 'crosshair';
    });
    const end = (ev, shouldLaunch) => {
      if (ev.pointerId !== this.activePointerId) return;
      if (this.launch && shouldLaunch) {
        this._updateCursor(ev);
        this.launch.current = { x: this.cursor[0], y: this.cursor[1] };
        this.launch.velocity = slingshotVelocity(this.launch.origin, this.launch.current);
        this.onLaunch({
          ...this.launch
        });
      }
      this.launch = null;
      if (this.spring.active) { this.spring.release(); c.classList.remove('grabbing'); }
      if (c.hasPointerCapture?.(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
      this.activePointerId = null;
      if (ev.pointerType && ev.pointerType !== 'mouse') this._clearCursor();
    };
    c.addEventListener('pointerup', ev => end(ev, true));
    c.addEventListener('pointercancel', ev => end(ev, false));
    c.addEventListener('pointerleave', () => {
      if (!this.spring.active && !this.launch) this._clearCursor();
    });
    window.addEventListener('blur', () => {
      this.launch = null;
      this.spring.release();
      this.activePointerId = null;
    });
  }
}

export class KeyboardInput {
  constructor(world, spring, camera, actions) {
    this.world = world; this.spring = spring; this.cam = camera;
    this.actions = actions;
    this.selected = null;
    this._held = null;
    this.slingshotMode = false;
    this.launch = null;
    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup',   (e) => this._up(e));
  }

  _down(e) {
    if (e.target.matches('input, select, textarea, button, a, [contenteditable="true"]')) return;
    const A = this.actions;
    switch (e.key) {
      case ' ':      A.togglePause(); e.preventDefault(); break;
      case '.':      A.stepOnce(); e.preventDefault(); break;
      case 's': case 'S': A.stepOnce(); e.preventDefault(); break;
      case 'r': case 'R': A.reset(); e.preventDefault(); break;
      case 't': case 'T': A.toggleTrails(); e.preventDefault(); break;
      case '+': case '=': A.adjustSpeed(0.25); e.preventDefault(); break;
      case '-': case '_': A.adjustSpeed(-0.25); e.preventDefault(); break;
      case '[':      this._cycle(-1); e.preventDefault(); break;
      case ']':      this._cycle(1); e.preventDefault(); break;
      case 'l': case 'L':
        if (this.slingshotMode && !this.launch) {
          const [x, y] = this._emptyLaunchOrigin();
          this.launch = {
            body: null, origin: { x, y }, current: { x, y }, velocity: { x: 0, y: 0 }
          };
          this.actions.announce('Slingshot placed near the canvas center; use arrow keys to aim, then Enter to launch');
          e.preventDefault();
        }
        break;
      case 'Enter':
        if (this.launch) {
          this.actions.launch({
            ...this.launch
          });
          this.launch = null;
          e.preventDefault();
        }
        break;
      case 'ArrowUp': case 'ArrowDown':
      case 'ArrowLeft': case 'ArrowRight':
        if (this.launch) {
          const d = 0.35;
          if (e.key === 'ArrowUp') this.launch.current.y -= d;
          if (e.key === 'ArrowDown') this.launch.current.y += d;
          if (e.key === 'ArrowLeft') this.launch.current.x += d;
          if (e.key === 'ArrowRight') this.launch.current.x -= d;
          this.launch.velocity = slingshotVelocity(this.launch.origin, this.launch.current);
        } else this._nudge(e.key);
        e.preventDefault(); break;
      default:
        if ('12345'.includes(e.key)) A.preset(Number(e.key) - 1);
    }
  }

  _up(e) {
    if (e.key.startsWith('Arrow') && !this.launch) {
      this.spring.release(); this._held = null;
    }
  }

  _emptyLaunchOrigin() {
    const spacing = 24;
    const points = [];
    for (let y = spacing / 2; y < this.cam.h; y += spacing) {
      for (let x = spacing / 2; x < this.cam.w; x += spacing) {
        points.push({
          x, y,
          distance: (x - this.cam.w / 2) ** 2 + (y - this.cam.h / 2) ** 2
        });
      }
    }
    points.sort((a, b) => a.distance - b.distance);
    for (const point of points) {
      const [x, y] = this.cam.toWorld(point.x, point.y);
      if (!this.world.pick(x, y, 0.3)) return [x, y];
    }
    return this.cam.toWorld(this.cam.w / 2, this.cam.h / 2);
  }

  _cycle(dir) {
    const bs = this.world.bodies.filter(b => !b.fixed);
    if (!bs.length) return;
    const i = bs.indexOf(this.selected);
    this.selected = bs[(i + dir + bs.length) % bs.length];
    this.actions.announce(`Selected body ${this.selected.id}, ` +
      `position ${this.selected.pos.x.toFixed(1)}, ${this.selected.pos.y.toFixed(1)} metres`);
  }

  _nudge(key) {
    if (!this.selected) this._cycle(1);
    if (!this.selected) return;
    const b = this.selected;
    const d = 0.35;
    if (this._held !== b) { this.spring.grab(b, b.pos.x, b.pos.y); this._held = b; }
    const t = this.spring.target;
    if (key === 'ArrowUp')    t.y += d;
    if (key === 'ArrowDown')  t.y -= d;
    if (key === 'ArrowLeft')  t.x -= d;
    if (key === 'ArrowRight') t.x += d;
  }
}
