// engine/Vec2.js -- 2D vector. Pure math: no DOM, no canvas, no window.
//
// DESIGN RULE: every method that returns a Vec2 returns a NEW Vec2.
// The only mutating methods are addInPlace / scaleInPlace, and they are
// named loudly so you can see aliasing bugs when you read the code.

export class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }

  clone()        { return new Vec2(this.x, this.y); }
  add(v)         { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)         { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s)       { return new Vec2(this.x * s, this.y * s); }
  neg()          { return new Vec2(-this.x, -this.y); }
  dot(v)         { return this.x * v.x + this.y * v.y; }
  cross(v)       { return this.x * v.y - this.y * v.x; }   // z-component
  len()          { return Math.hypot(this.x, this.y); }
  len2()         { return this.x * this.x + this.y * this.y; }
  perp()         { return new Vec2(-this.y, this.x); }

  normalized() {
    const L = this.len();
    return L === 0 ? new Vec2(0, 0) : new Vec2(this.x / L, this.y / L);
  }

  // Mutating -- use only in hot loops where you own the object.
  addInPlace(v)   { this.x += v.x; this.y += v.y; return this; }
  scaleInPlace(s) { this.x *= s;   this.y *= s;   return this; }
  set(x, y)       { this.x = x;    this.y = y;    return this; }
  zero()          { this.x = 0;    this.y = 0;    return this; }

  toString() { return `(${this.x.toFixed(6)}, ${this.y.toFixed(6)})`; }
}

export const vec = (x, y) => new Vec2(x, y);
