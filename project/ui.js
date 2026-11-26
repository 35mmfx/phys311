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
    slider('throttle', 'throttle', v => `${Math.round(v * 100)}%`);

    this.$('integrator').addEventListener('change', e => {
      s.integrator = e.target.value;
      this.updateIntegratorProperties();
      this.onChange('integrator');
    });
    this.$('scene').addEventListener('change', e => {
      s.scene = e.target.value; this.onRebuild();
    });
    this.$('difficulty').addEventListener('change', e => {
      s.difficulty = e.target.value; this.onRebuild();
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
    this.$('debug-mode').addEventListener('change', e => {
      s.debug = e.target.checked;
      this.onChange('debug');
    });
    this.$('conservative-mode').addEventListener('change', e => {
      s.conservative = e.target.checked;
      this.onChange('conservative');
    });

    for (const [id, act] of [['btn-play','togglePause'], ['btn-step','stepOnce'],
                             ['btn-reset','reset'], ['btn-link','copyLink'],
                             ['btn-csv','downloadCSV']])
      this.$(id).addEventListener('click', () => this.onAction(act));
  }

  syncToDOM() {
    const s = this.state, set = (id, v) => { const e = this.$(id); if (e) e.value = v; };
    set('dt', s.dt); set('rest', s.restitution); set('grav', s.gravity);
    set('drag', s.drag); set('speed', s.speed); set('count', s.count);
    set('throttle', s.throttle);
    set('difficulty', s.difficulty);
    set('integrator', s.integrator); set('scene', s.scene);
    this.$('trails').checked = s.trails;
    this.$('vel').checked    = s.velocityVectors;
    this.$('force').checked  = s.forceVectors;
    this.$('slingshot').checked = s.slingshotMode;
    this.$('spawn').checked  = s.spawnMode;
    this.$('debug-mode').checked = s.debug;
    this.$('conservative-mode').checked = s.conservative;
    const lander = s.scene === 'lunar';
    this.$('conservative-mode').disabled = !lander;
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
    put('throttle', `${Math.round(s.throttle * 100)}%`);
    this.updateIntegratorProperties();
  }

  updateIntegratorProperties() {
    const property = this.$('integrator-properties');
    if (!property) return;
    const descriptions = {
      euler: 'Euler (explicit): first-order accuracy. It updates position using the old velocity and is least stable for changing thrust or gravity; smaller timesteps reduce position and velocity error.',
      ec: 'Euler-Cromer: first-order accuracy, but velocity is updated before position. It is symplectic and usually more stable than explicit Euler for lunar thrust and gravity.',
      verlet: 'Velocity Verlet: second-order accuracy and symplectic. It evaluates forces at both ends of a step, giving the most accurate trajectory and asteroid/thrust response at the fixed timestep.'
    };
    property.textContent = descriptions[this.state.integrator] || descriptions.verlet;
  }

  setPlayLabel(paused) {
    const b = this.$('btn-play');
    const label = paused ? 'Play' : 'Pause';
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', String(!paused));
  }
}
