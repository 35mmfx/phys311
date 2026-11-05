export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  // allocating: return a NEW Vec2 (readable; use by default)
  add(v)     { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)     { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s)     { return new Vec2(this.x * s,   this.y * s);   }
  dot(v)     { return this.x * v.x + this.y * v.y; }
  lengthSq() { return this.x * this.x + this.y * this.y; }
  length()   { return Math.hypot(this.x, this.y); }
  clone()    { return new Vec2(this.x, this.y); }
  normalized() {
    const L = this.length();
    return L === 0 ? new Vec2(0, 0) : new Vec2(this.x / L, this.y / L);
  }

  // in-place: mutate THIS, allocate nothing (use inside hot loops)
  addTo(v)        { this.x += v.x;     this.y += v.y;     return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; return this; }
  set(x, y)       { this.x = x;        this.y = y;        return this; }
  zero()          { this.x = 0;        this.y = 0;        return this; }
}
