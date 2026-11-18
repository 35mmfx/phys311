const setTarget = (param, value, context, timeConstant = 0.04) => {
  param.cancelScheduledValues(context.currentTime);
  param.setTargetAtTime(value, context.currentTime, timeConstant);
};

export class CockpitSound {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
    this.thrusting = false;
    this.rotation = 0;
    this.paused = false;
    this.missionStatus = 'flying';
  }

  async enable() {
    if (!this.context) this._createAudioGraph();
    await this.context.resume();
    this.enabled = true;
    setTarget(this.master.gain, 0.32, this.context, 0.12);
    this.switchClick();
  }

  disable() {
    if (!this.context || !this.enabled) return;
    this.enabled = false;
    setTarget(this.master.gain, 0, this.context, 0.08);
  }

  reset() {
    this.thrusting = false;
    this.rotation = 0;
    this.paused = false;
    this.missionStatus = 'flying';
    if (this.enabled) this.switchClick();
    this._setFlightGains(0, 0);
  }

  update({ thrusting = false, rotation = 0, paused = false, missionStatus = 'flying',
           impactSpeed = 0 } = {}) {
    if (!this.enabled || !this.context) return;

    if (thrusting !== this.thrusting) this.relayClick(thrusting);
    if (paused !== this.paused) this.switchClick();
    if (missionStatus !== this.missionStatus && missionStatus !== 'flying') {
      this.impact(impactSpeed, missionStatus === 'landed');
    }

    this.thrusting = thrusting;
    this.rotation = rotation;
    this.paused = paused;
    this.missionStatus = missionStatus;
    this._setFlightGains(thrusting && !paused ? 1 : 0, rotation && !paused ? 1 : 0);
  }

  switchClick() {
    if (!this.enabled || !this.context) return;
    this._click(1500, 0.012, 0.035);
  }

  relayClick(closing) {
    if (!this.enabled || !this.context) return;
    this._click(closing ? 2200 : 1100, 0.018, 0.055);
  }

  creak() {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  impact(speed, safeLanding) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const amount = Math.max(0.25, Math.min(1, speed / 8));
    const noise = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    noise.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(safeLanding ? 420 : 760, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22 * amount, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (safeLanding ? 0.24 : 0.42));
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.45);
    this.creak();
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

    this._noiseLoop(680, 0.04, 'lowpass');
    this._tone(92, 'sine', 0.012);
    this._tone(184, 'sine', 0.004);
    this._tone(60, 'sine', 0.0025);

    const engineNoise = this._noiseLoop(900, 0, 'bandpass');
    this.engineGain = engineNoise.gain;
    this.engineGain.gain.value = 0;
    const engineTone = this._tone(48, 'sawtooth', 0);
    this.engineToneGain = engineTone.gain;
    this.engineToneGain.gain.value = 0;

    const pump = this._tone(31, 'sawtooth', 0);
    this.pumpGain = pump.gain;
    this.pumpGain.gain.value = 0;
    const pumpLfo = context.createOscillator();
    const pumpDepth = context.createGain();
    pumpLfo.frequency.value = 7;
    pumpDepth.gain.value = 0;
    pumpLfo.connect(pumpDepth).connect(this.pumpGain.gain);
    pumpLfo.start();
    this.pumpDepth = pumpDepth;

    const servo = this._tone(210, 'sawtooth', 0);
    this.servoGain = servo.gain;
    this.servoGain.gain.value = 0;
  }

  _noiseLoop(cutoff, volume, type) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = cutoff;
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

  _setFlightGains(engine, actuator) {
    if (!this.context) return;
    const context = this.context;
    setTarget(this.engineGain.gain, engine * 0.075, context, 0.08);
    setTarget(this.engineToneGain.gain, engine * 0.018, context, 0.08);
    setTarget(this.pumpGain.gain, engine * 0.012, context, 0.06);
    setTarget(this.pumpDepth.gain, engine * 0.006, context, 0.06);
    setTarget(this.servoGain.gain, actuator * 0.012, context, 0.05);
  }

  _click(frequency, volume, duration) {
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration);
  }
}
