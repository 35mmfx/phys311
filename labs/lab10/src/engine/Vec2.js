// Vec2.js — minimal 2D vector. Pure math: no DOM, no canvas.
export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  clone()        { return new Vec2(this.x, this.y); }
  set(x, y)      { this.x = x; this.y = y; return this; }
  copy(v)        { this.x = v.x; this.y = v.y; return this; }

  add(v)         { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)         { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s)         { return new Vec2(this.x * s, this.y * s); }

  addTo(v)       { this.x += v.x; this.y += v.y; return this; }   // in place
  mulTo(s)       { this.x *= s;   this.y *= s;   return this; }   // in place

  dot(v)         { return this.x * v.x + this.y * v.y; }
  cross(v)       { return this.x * v.y - this.y * v.x; }          // scalar z-component
  len()          { return Math.hypot(this.x, this.y); }
  len2()         { return this.x * this.x + this.y * this.y; }

  norm() {
    const L = this.len();
    return L > 1e-12 ? new Vec2(this.x / L, this.y / L) : new Vec2(0, 0);
  }

  static zero()  { return new Vec2(0, 0); }
}
