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

export class PointerInput {
  constructor(canvas, camera, world, spring, { onSpawn = null, onCursor = () => {}, slingshotMode = false } = {}) {
    this.canvas = canvas; this.cam = camera;
    this.world = world; this.spring = spring;
    this.onSpawn = onSpawn;
    this.onCursor = onCursor;
    this.spawnMode = false;
    this.slingshotMode = slingshotMode;
    this.cursor = null;
    this.launch = null;
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
      c.setPointerCapture(ev.pointerId);
      const [x, y] = this._updateCursor(ev);
      if (this.spawnMode) { this.onSpawn && this.onSpawn(x, y); return; }
      const b = this.world.pick(x, y, 0.15);
      if (!b) return;
      if (this.slingshotMode) {
        this.launch = { body: b, current: { x, y } };
        return;
      }
      this.spring.grab(b, x, y); c.classList.add('grabbing');
    });
    c.addEventListener('pointermove', (ev) => {
      const [x, y] = this._updateCursor(ev);
      if (this.launch) {
        this.launch.current = { x, y };
        return;
      }
      if (this.spring.active) this.spring.moveTo(x, y);
      else c.style.cursor = this.world.pick(x, y, 0.15) ? 'grab' : 'crosshair';
    });
    const end = (ev) => {
      if (this.launch) {
        const { body, current } = this.launch;
        const dx = body.pos.x - current.x;
        const dy = body.pos.y - current.y;
        body.vel.x += dx * 5.5;
        body.vel.y += dy * 5.5;
        this.launch = null;
      }
      if (this.spring.active) { this.spring.release(); c.classList.remove('grabbing'); }
      if (c.hasPointerCapture?.(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
      if (ev.pointerType && ev.pointerType !== 'mouse') this._clearCursor();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (!this.spring.active && !this.launch) this._clearCursor();
    });
    window.addEventListener('blur', () => {
      this.launch = null;
      this.spring.release();
    });
  }
}

export class KeyboardInput {
  constructor(world, spring, camera, actions) {
    this.world = world; this.spring = spring; this.cam = camera;
    this.actions = actions;
    this.selected = null;
    this._held = null;
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
      case 'Tab':    this._cycle(e.shiftKey ? -1 : 1); e.preventDefault(); break;
      case 'ArrowUp': case 'ArrowDown':
      case 'ArrowLeft': case 'ArrowRight':
        this._nudge(e.key); e.preventDefault(); break;
      default:
        if ('12345'.includes(e.key)) A.preset(Number(e.key) - 1);
    }
  }

  _up(e) {
    if (e.key.startsWith('Arrow')) { this.spring.release(); this._held = null; }
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
