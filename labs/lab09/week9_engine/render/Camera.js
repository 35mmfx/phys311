// render/Camera.js -- the ONLY place the y-flip lives.
//
// World coords: y up, metres, origin wherever the scene wants it.
// Screen coords: y DOWN, pixels, origin at the canvas top-left.
// Every sign confusion in a canvas physics project comes from doing this
// conversion in more than one place. Do it here, once.

export class Camera {
  constructor(canvas, { center = { x: 0, y: 0 }, scale = 40 } = {}) {
    this.canvas = canvas;
    this.center = { ...center };   // world point shown at canvas centre
    this.scale = scale;            // pixels per metre
  }

  worldToScreen(p) {
    return {
      x: this.canvas.width  / 2 + (p.x - this.center.x) * this.scale,
      y: this.canvas.height / 2 - (p.y - this.center.y) * this.scale   // flip
    };
  }

  screenToWorld(s) {
    return {
      x: this.center.x + (s.x - this.canvas.width  / 2) / this.scale,
      y: this.center.y - (s.y - this.canvas.height / 2) / this.scale    // flip
    };
  }

  lengthToScreen(L) { return L * this.scale; }

  fit(xmin, ymin, xmax, ymax, pad = 1.08) {
    const w = (xmax - xmin) * pad, h = (ymax - ymin) * pad;
    this.scale = Math.min(this.canvas.width / w, this.canvas.height / h);
    this.center = { x: (xmin + xmax) / 2, y: (ymin + ymax) / 2 };
  }
}
