// Collisions.js — circle/circle detection + impulse response, and wall bounces.
// Walls are EXTERNAL: they break momentum conservation on purpose.
import { Vec2 } from './Vec2.js';

export function resolvePair(a, b, e) {
  const d  = b.pos.sub(a.pos);
  const L  = d.len();
  const R  = a.radius + b.radius;
  if (L >= R || L < 1e-12) return false;

  const n  = d.mul(1 / L);
  const rv = b.vel.sub(a.vel).dot(n);
  if (rv > 0) return false;              // already separating: do NOT re-resolve

  const invSum = a.invMass + b.invMass;
  if (invSum === 0) return false;

  const j = -(1 + e) * rv / invSum;
  const J = n.mul(j);
  a.vel.addTo(J.mul(-a.invMass));
  b.vel.addTo(J.mul( b.invMass));

  const corr = n.mul((R - L) / invSum * 0.8);   // positional correction,
  a.pos.addTo(corr.mul(-a.invMass));            // split by inverse mass so it
  b.pos.addTo(corr.mul( b.invMass));            // injects no momentum
  return true;
}

export function resolveWalls(body, bounds, e) {
  let hit = false;
  const { xmin, xmax, ymin, ymax } = bounds;
  const r = body.radius;
  if (body.pos.x - r < xmin) { body.pos.x = xmin + r; body.vel.x = -body.vel.x * e; hit = true; }
  if (body.pos.x + r > xmax) { body.pos.x = xmax - r; body.vel.x = -body.vel.x * e; hit = true; }
  if (body.pos.y - r < ymin) { body.pos.y = ymin + r; body.vel.y = -body.vel.y * e; hit = true; }
  if (body.pos.y + r > ymax) { body.pos.y = ymax - r; body.vel.y = -body.vel.y * e; hit = true; }
  return hit;
}

export class SpatialHash {
  constructor(cell = 1.0) { this.cell = cell; this.map = new Map(); }
  _key(ix, iy) { return ix + ',' + iy; }
  rebuild(bodies) {
    this.map.clear();
    for (const b of bodies) {
      const ix = Math.floor(b.pos.x / this.cell);
      const iy = Math.floor(b.pos.y / this.cell);
      const k = this._key(ix, iy);
      if (!this.map.has(k)) this.map.set(k, []);
      this.map.get(k).push(b);
    }
  }
  candidatePairs(bodies) {
    this.rebuild(bodies);
    const pairs = [];
    const seen = new Set();
    for (const b of bodies) {
      const ix = Math.floor(b.pos.x / this.cell);
      const iy = Math.floor(b.pos.y / this.cell);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nb = this.map.get(this._key(ix + dx, iy + dy));
          if (!nb) continue;
          for (const o of nb) {
            if (o.id <= b.id) continue;
            const key = b.id * 100000 + o.id;
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push([b, o]);
          }
        }
    }
    return pairs;
  }
}
