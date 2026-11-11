export class SpatialGrid {
  constructor(bodies) {
    let largestRadius = 0;
    for (const body of bodies) largestRadius = Math.max(largestRadius, body.radius);
    this.cellSize = largestRadius > 0 ? 2 * largestRadius : 1;
    this.cells = new Map();
    this.bodyCells = [];
    for (let index = 0; index < bodies.length; index++) {
      this.add(index, bodies[index]);
    }
  }

  cellsFor(body) {
    const minX = Math.floor((body.pos.x - body.radius) / this.cellSize);
    const maxX = Math.floor((body.pos.x + body.radius) / this.cellSize);
    const minY = Math.floor((body.pos.y - body.radius) / this.cellSize);
    const maxY = Math.floor((body.pos.y + body.radius) / this.cellSize);
    const keys = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) keys.push(`${x},${y}`);
    }
    return keys;
  }

  add(index, body) {
    const keys = this.cellsFor(body);
    this.bodyCells[index] = keys;
    for (const key of keys) {
      let cell = this.cells.get(key);
      if (!cell) {
        cell = new Set();
        this.cells.set(key, cell);
      }
      cell.add(index);
    }
  }

  update(index, body) {
    for (const key of this.bodyCells[index]) {
      const cell = this.cells.get(key);
      cell.delete(index);
      if (cell.size === 0) this.cells.delete(key);
    }
    this.add(index, body);
  }

  pairKeysNear(index, afterKey, bodyCount) {
    const neighbours = new Set();
    for (const key of this.bodyCells[index]) {
      for (const otherIndex of this.cells.get(key)) {
        if (otherIndex !== index) neighbours.add(otherIndex);
      }
    }

    const keys = [];
    for (const otherIndex of neighbours) {
      const first = Math.min(index, otherIndex);
      const second = Math.max(index, otherIndex);
      const pairKey = first * bodyCount + second;
      if (pairKey > afterKey) keys.push(pairKey);
    }
    return keys;
  }
}
