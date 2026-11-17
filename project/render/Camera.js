// Camera.js — the ONLY place that knows pixels exist.
// World y points up; canvas y points down. The flip lives here and nowhere else.
export class Camera {
  constructor({ cx = 0, cy = 0, scale = 30 } = {}) {
    this.cx = cx; this.cy = cy;          // world point at canvas centre
    this.scale = scale;                  // pixels per metre (CSS pixels)
    this.w = 800; this.h = 500;          // CSS size, updated on resize
  }
  resize(w, h) { this.w = w; this.h = h; }

  toScreen(x, y) {
    return [ (x - this.cx) * this.scale + this.w / 2,
             this.h / 2 - (y - this.cy) * this.scale ];     // <-- the flip
  }
  toWorld(px, py) {
    return [ (px - this.w / 2) / this.scale + this.cx,
             (this.h / 2 - py) / this.scale + this.cy ];    // <-- exact inverse
  }
  // Fit a world rectangle with margin. Used by Reset and by the resize handler.
  fit(xmin, xmax, ymin, ymax, margin = 1.08) {
    const sx = this.w / ((xmax - xmin) * margin);
    const sy = this.h / ((ymax - ymin) * margin);
    this.scale = Math.min(sx, sy);
    this.cx = (xmin + xmax) / 2;
    this.cy = (ymin + ymax) / 2;
  }
}
