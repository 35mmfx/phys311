// StateURL.js — encode the control-panel state into the URL hash so a student
// can send a link that reproduces the EXACT configuration they are asking about.
// Deliberately tiny and human-readable: no base64, no JSON blob.
export const StateURL = {
  encode(s) {
    const p = new URLSearchParams();
    p.set('scene', s.scene);
    p.set('int',   s.integrator);
    p.set('dt',    String(s.dt));
    p.set('e',     String(s.restitution));
    p.set('g',     String(s.gravity));
    p.set('drag',  String(s.drag));
    p.set('speed', String(s.speed));
    p.set('n',     String(s.count));
    return '#' + p.toString();
  },

  decode(hash, defaults) {
    const p = new URLSearchParams((hash || '').replace(/^#/, ''));
    const num = (k, d) => {
      const v = parseFloat(p.get(k));
      return Number.isFinite(v) ? v : d;
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    return {
      scene:       p.get('scene') || defaults.scene,
      integrator:  p.get('int')   || defaults.integrator,
      dt:          clamp(num('dt',    defaults.dt),          0.001, 0.02),
      restitution: clamp(num('e',     defaults.restitution), 0,     1),
      gravity:     clamp(num('g',     defaults.gravity),     0,     25),
      drag:        clamp(num('drag',  defaults.drag),        0,     0.2),
      speed:       clamp(num('speed', defaults.speed),       0.25,  2),
      count:       Math.round(clamp(num('n', defaults.count), 3,   120))
    };
  },

  write(s) {
    // replaceState, not location.hash: no history entry per slider nudge.
    if (typeof history !== 'undefined' && history.replaceState)
      history.replaceState(null, '', StateURL.encode(s));
  }
};
