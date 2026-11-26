const setTarget = (param, value, context, timeConstant = 0.04) => {
  param.cancelScheduledValues(context.currentTime);
  param.setTargetAtTime(value, context.currentTime, timeConstant);
};

export class CockpitSound {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.volume = 0.75;
    this.thrusting = false;
    this.engineLevel = null;
    this.fuelBand = null;
    this.paused = false;
    this.missionStatus = 'flying';
  }

  async enable() {
    if (!this.context) this._createAudioGraph();
    await this.context.resume();
    this.enabled = true;
    setTarget(this.master.gain, this.volume, this.context, 0.12);
    this.switchClick();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.context) {
      setTarget(this.master.gain, this.enabled ? this.volume : 0, this.context, 0.04);
    }
  }

  async disable() {
    if (!this.context || !this.enabled) return;
    this.enabled = false;
    this.master.gain.setValueAtTime(0, this.context.currentTime);
    await this.context.suspend();
  }

  reset() {
    this.thrusting = false;
    this.paused = false;
    this.missionStatus = 'flying';
    if (this.enabled) this.switchClick();
    this._setFlightGains(0);
  }

  update({ thrusting = false, paused = false, missionStatus = 'flying',
           impactSpeed = 0, impactKind = '', fuelFraction = 1 } = {}) {
    if (!this.enabled || !this.context) return;

    if (paused !== this.paused) this.switchClick();
    if (missionStatus !== this.missionStatus && missionStatus !== 'flying') {
      if (impactKind === 'side-wall') this.sideImpact(impactSpeed);
      else this.impact(impactSpeed, missionStatus === 'landed');
    }

    this.thrusting = thrusting;
    this.paused = paused;
    this.missionStatus = missionStatus;
    const engine = thrusting && !paused ? 1 : 0;
    const fuelBand = Math.round(fuelFraction * 20) / 20;
    if (engine !== this.engineLevel || (engine && fuelBand !== this.fuelBand)) {
      this._setFlightGains(engine, fuelFraction);
      this.engineLevel = engine;
      this.fuelBand = fuelBand;
    }
  }

  switchClick() {
    if (!this.enabled || !this.context) return;
    this._click(1280, 0.045, 0.035, 0.09);
  }

  creak() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const second = this.context.createOscillator();
    osc.type = 'triangle';
    second.type = 'sine';
    osc.frequency.setValueAtTime(112, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.32);
    second.frequency.setValueAtTime(177, now);
    second.frequency.exponentialRampToValueAtTime(91, now + 0.27);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain);
    second.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    second.start(now);
    osc.stop(now + 0.4);
    second.stop(now + 0.4);
  }

  impact(speed, safeLanding) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const amount = Math.max(0.35, Math.min(1, speed / 5));
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const thud = this.context.createOscillator();
    const thudGain = this.context.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(safeLanding ? 520 : 760, now);
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime((safeLanding ? 0.13 : 0.26) * amount, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (safeLanding ? 0.3 : 0.55));
    thud.type = 'sine';
    thud.frequency.setValueAtTime(safeLanding ? 76 : 94, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.22);
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime((safeLanding ? 0.24 : 0.38) * amount, now + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    noise.connect(filter).connect(gain).connect(this.master);
    thud.connect(thudGain).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.58);
    thud.start(now);
    thud.stop(now + 0.34);
    this.creak();
  }

  sideImpact(speed) {
    if (!this.enabled || !this.context) return;
    this.impact(speed, false);
    const now = this.context.currentTime;
    const amount = Math.max(0.35, Math.min(1, speed / 5));
    for (const [delay, frequency, level] of [
      [0, 1250, 0.34],
      [0.055, 820, 0.24],
      [0.12, 1680, 0.16]
    ]) {
      const noise = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      const start = now + delay;
      noise.buffer = this.noiseBuffer;
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 0.9;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(level * amount, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.095);
      noise.connect(filter).connect(gain).connect(this.master);
      noise.start(start);
      noise.stop(start + 0.105);
    }
  }

  _createAudioGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio is not supported by this browser.');

    this.context = new AudioContextClass();
    const context = this.context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);
    this.noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noiseData = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    this._noiseLoop(620, 0.09, 'lowpass');
    this._tone(58, 'sine', 0.025);
    this._tone(116, 'sine', 0.009);
    this._tone(690, 'sine', 0.003);

    const engineNoise = this._noiseLoop(260, 0, 'bandpass', 0.7);
    this.engineGain = engineNoise.gain;
    this.engineGain.gain.value = 0;
    const engineLow = this._noiseLoop(145, 0, 'lowpass');
    this.engineLowGain = engineLow.gain;
    this.engineLowGain.gain.value = 0;
    const engineTone = this._tone(43, 'triangle', 0);
    this.engineTone = engineTone.osc;
    this.engineToneGain = engineTone.gain;
    this.engineToneGain.gain.value = 0;
    const engineHarmonic = this._tone(86, 'sawtooth', 0);
    this.engineHarmonicGain = engineHarmonic.gain;
    this.engineHarmonicGain.gain.value = 0;

    const pump = this._tone(27, 'sawtooth', 0);
    this.pumpGain = pump.gain;
    this.pumpGain.gain.value = 0;
    const pumpLfo = context.createOscillator();
    const pumpDepth = context.createGain();
    pumpLfo.frequency.value = 5.5;
    pumpDepth.gain.value = 0;
    pumpLfo.connect(pumpDepth).connect(this.pumpGain.gain);
    pumpLfo.start();
    this.pumpDepth = pumpDepth;

  }

  _noiseLoop(cutoff, volume, type, quality = 1) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = quality;
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return { source, gain };
  }

  _tone(frequency, type, volume) {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain).connect(this.master);
    osc.start();
    return { osc, gain };
  }

  _setFlightGains(engine, fuelFraction = 1) {
    if (!this.context) return;
    const context = this.context;
    setTarget(this.engineGain.gain, engine * 0.2, context, 0.14);
    setTarget(this.engineLowGain.gain, engine * 0.14, context, 0.14);
    setTarget(this.engineToneGain.gain, engine * 0.065, context, 0.14);
    setTarget(this.engineHarmonicGain.gain, engine * 0.025, context, 0.14);
    setTarget(this.pumpGain.gain, engine * 0.019, context, 0.08);
    setTarget(this.pumpDepth.gain, engine * 0.012, context, 0.08);
    setTarget(this.engineTone.frequency, 40 + (1 - fuelFraction) * 11, context, 0.2);
  }

  _click(frequency, volume, duration, bodyVolume) {
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const body = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    const clickNoise = this.context.createBufferSource();
    const clickFilter = this.context.createBiquadFilter();
    const noiseGain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, now);
    body.frequency.exponentialRampToValueAtTime(105, now + duration * 1.7);
    bodyGain.gain.setValueAtTime(bodyVolume, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 1.8);
    clickNoise.buffer = this.noiseBuffer;
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 2400;
    clickFilter.Q.value = 0.8;
    noiseGain.gain.setValueAtTime(volume * 0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    osc.connect(gain).connect(this.master);
    body.connect(bodyGain).connect(this.master);
    clickNoise.connect(clickFilter).connect(noiseGain).connect(this.master);
    osc.start(now);
    body.start(now);
    clickNoise.start(now);
    osc.stop(now + duration);
    body.stop(now + duration * 2);
    clickNoise.stop(now + 0.015);
  }
}
