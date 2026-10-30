// engine/Collision.js -- broad phase + narrow phase + impulse response.
//
// Broad phase answers "which pairs COULD be touching?" cheaply.
// Narrow phase answers "are they actually touching?" exactly.
// Separating those two questions is the whole reason 300 bodies is tractable.

import { Vec2, vec } from './Vec2.js';

/* ---------------------------------------------------------- broad phase */

export function bruteForcePairs(bodies, stats) {
  const pairs = [];
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      if (stats) stats.checks++;
      pairs.push([bodies[i], bodies[j]]);
    }
  return pairs;
}

export class SpatialHash {
  // Uniform grid. cellSize should be >= 2 * largest radius.
  constructor(cellSize = 1) { this.cellSize = cellSize; this.map = new Map(); }

  _key(ix, iy) { return ix + ',' + iy; }

  build(bodies) {
    this.map.clear();
    const s = this.cellSize;
    for (const b of bodies) {
      const ix = Math.floor(b.pos.x / s), iy = Math.floor(b.pos.y / s);
      const k = this._key(ix, iy);
      let cell = this.map.get(k);
      if (!cell) { cell = []; this.map.set(k, cell); }
      cell.push(b);
      b._cx = ix; b._cy = iy;
    }
  }

  // Each body is tested against its own cell and 4 of the 8 neighbours,
  // so every pair is produced exactly once.
  pairs(bodies, stats) {
    this.build(bodies);
    const out = [];
    const seenOffsets = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1]];
    for (const b of bodies) {
      for (const [dx, dy] of seenOffsets) {
        const cell = this.map.get(this._key(b._cx + dx, b._cy + dy));
        if (!cell) continue;
        for (const other of cell) {
          if (dx === 0 && dy === 0 && other === b) continue;
          // within the same cell, keep each unordered pair once
          if (dx === 0 && dy === 0 && cell.indexOf(other) < cell.indexOf(b)) continue;
          if (stats) stats.checks++;
          out.push([b, other]);
        }
      }
    }
    return out;
  }
}

/* --------------------------------------------------------- narrow phase */

export function overlapping(a, b) {
  const d = b.pos.sub(a.pos);
  const R = a.radius + b.radius;
  return d.len2() < R * R;
}

/* -------------------------------------------------------------- response */

// Impulse-based resolution of a disc-disc contact.
// Returns true if an impulse was actually applied.
export function resolveContact(a, b, restitution = null) {
  const d = b.pos.sub(a.pos);
  const dist = d.len();
  const R = a.radius + b.radius;
  if (dist === 0 || dist >= R) return false;

  const n = d.scale(1 / dist);                 // unit normal, a -> b
  const vRel = b.vel.sub(a.vel);
  const vn = vRel.dot(n);                      // closing speed along n

  // GUARD: if they are already separating, do nothing. Without this line
  // an overlapping-but-separating pair gets re-resolved every frame and
  // pumps energy into the simulation (the "sticky pair" bug).
  if (vn > 0) { positionalCorrection(a, b, n, R - dist); return false; }

  const e = restitution !== null ? restitution
                                 : Math.min(a.restitution, b.restitution);
  const invSum = a.invMass + b.invMass;
  if (invSum === 0) return false;

  const jImp = -(1 + e) * vn / invSum;         // scalar impulse
  const J = n.scale(jImp);
  if (!a.fixed) a.vel.addInPlace(J.scale(-a.invMass));
  if (!b.fixed) b.vel.addInPlace(J.scale( b.invMass));

  positionalCorrection(a, b, n, R - dist);
  return true;
}

// Push the pair apart so they stop overlapping. Split by INVERSE MASS so
// the correction adds no net momentum (a heavy body barely moves).
export function positionalCorrection(a, b, n, depth, percent = 0.8, slop = 1e-4) {
  const invSum = a.invMass + b.invMass;
  if (invSum === 0) return;
  const mag = Math.max(depth - slop, 0) / invSum * percent;
  const corr = n.scale(mag);
  if (!a.fixed) a.pos.addInPlace(corr.scale(-a.invMass));
  if (!b.fixed) b.pos.addInPlace(corr.scale( b.invMass));
}

/* ------------------------------------------------------------- boundaries */

// Axis-aligned box. NOTE: walls are an EXTERNAL force -- momentum is NOT
// conserved while they are on. Energy still is, at e = 1, because a wall
// only flips a velocity component and does no work.
export class BoxBounds {
  constructor(xmin, ymin, xmax, ymax, restitution = 1.0) {
    Object.assign(this, { xmin, ymin, xmax, ymax, restitution });
    this.enabled = true;
    this.hits = 0;
  }
  apply(bodies) {
    if (!this.enabled) return;
    const e = this.restitution;
    for (const b of bodies) {
      if (b.fixed) continue;
      const r = b.radius;
      if (b.pos.x - r < this.xmin) { b.pos.x = this.xmin + r; b.vel.x = Math.abs(b.vel.x) * e; this.hits++; }
      if (b.pos.x + r > this.xmax) { b.pos.x = this.xmax - r; b.vel.x = -Math.abs(b.vel.x) * e; this.hits++; }
      if (b.pos.y - r < this.ymin) { b.pos.y = this.ymin + r; b.vel.y = Math.abs(b.vel.y) * e; this.hits++; }
      if (b.pos.y + r > this.ymax) { b.pos.y = this.ymax - r; b.vel.y = -Math.abs(b.vel.y) * e; this.hits++; }
    }
  }
}
