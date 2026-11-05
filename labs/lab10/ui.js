// Binds the control panel to simulation state without manipulating the world.
export class Controls {
  constructor(state, { onChange, onRebuild, onAction }) {
    this.state = state;
    this.onChange = onChange; this.onRebuild = onRebuild; this.onAction = onAction;
    this._wire();
    this.syncToDOM();
  }

  $(id) { return document.getElementById(id); }

  _wire() {
    const s = this.state;
    const slider = (id, key, fmt, rebuild = false) => {
      const el = this.$(id), out = this.$(id + '-out');
      el.addEventListener('input', () => {
        s[key] = parseFloat(el.value);
        out.textContent = fmt(s[key]);
        el.setAttribute('aria-valuetext', fmt(s[key]));
        rebuild ? this.onRebuild() : this.onChange(key);
      });
    };
    slider('dt',    'dt',          v => `1/${Math.round(1 / v)} s`, true);
    slider('rest',  'restitution', v => v.toFixed(2));
    slider('grav',  'gravity',     v => `${v.toFixed(2)} m/s²`);
    slider('drag',  'drag',        v => v.toFixed(3));
    slider('speed', 'speed',       v => `${v.toFixed(2)}×`);
    slider('count', 'count',       v => `${v} bodies`, true);

    this.$('integrator').addEventListener('change', e => {
      s.integrator = e.target.value; this.onChange('integrator');
    });
    this.$('scene').addEventListener('change', e => {
      s.scene = e.target.value; this.onRebuild();
    });

    this.$('trails').addEventListener('change', e => {
      s.trails = e.target.checked; this.onChange('trails');
    });
    this.$('vel').addEventListener('change', e => {
      s.velocityVectors = e.target.checked; this.onChange('velocityVectors');
    });
    this.$('force').addEventListener('change', e => {
      s.forceVectors = e.target.checked; this.onChange('forceVectors');
    });
    this.$('slingshot').addEventListener('change', e => {
      s.slingshotMode = e.target.checked;
      if (s.slingshotMode) s.spawnMode = false;
      this.syncToDOM();
      this.onChange('slingshotMode');
    });
    this.$('spawn').addEventListener('change', e => {
      s.spawnMode = e.target.checked;
      if (s.spawnMode) s.slingshotMode = false;
      this.syncToDOM();
      this.onChange('spawnMode');
    });

    for (const [id, act] of [['btn-play','togglePause'], ['btn-step','stepOnce'],
                             ['btn-reset','reset'], ['btn-link','copyLink']])
      this.$(id).addEventListener('click', () => this.onAction(act));
  }

  syncToDOM() {
    const s = this.state, set = (id, v) => { const e = this.$(id); if (e) e.value = v; };
    set('dt', s.dt); set('rest', s.restitution); set('grav', s.gravity);
    set('drag', s.drag); set('speed', s.speed); set('count', s.count);
    set('integrator', s.integrator); set('scene', s.scene);
    this.$('trails').checked = s.trails;
    this.$('vel').checked    = s.velocityVectors;
    this.$('force').checked  = s.forceVectors;
    this.$('slingshot').checked = s.slingshotMode;
    this.$('spawn').checked  = s.spawnMode;
    const lander = s.scene === 'lunar';
    for (const id of ['count', 'rest', 'grav', 'drag', 'slingshot', 'spawn']) {
      const el = this.$(id);
      const row = el.closest('.row') || el.closest('.check');
      if (row) row.hidden = lander;
    }
    const put = (id, t) => { const e = this.$(id + '-out'); if (e) e.textContent = t; };
    put('dt', `1/${Math.round(1 / s.dt)} s`);
    put('rest', s.restitution.toFixed(2));
    put('grav', `${s.gravity.toFixed(2)} m/s²`);
    put('drag', s.drag.toFixed(3));
    put('speed', `${s.speed.toFixed(2)}×`);
    put('count', `${s.count} bodies`);
  }

  setPlayLabel(paused) {
    const b = this.$('btn-play');
    b.textContent = paused ? '▶ Play' : '⏸ Pause';
    b.setAttribute('aria-pressed', String(!paused));
  }
}
