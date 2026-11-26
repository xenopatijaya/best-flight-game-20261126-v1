// audio.js — one job: every sound, synthesised live with WebAudio.
// No audio files: engine hum, wind, chimes, thuds and warnings.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: a low sawtooth through a low-pass, pitch follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      // Wind: looped noise through a band-pass, loudness follows airspeed.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 600;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function start() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Continuous engine/wind levels from the flight state. */
  function update(throttle, speed, airborne) {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0, t, 0.1);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 75, t, 0.1);
    engineFilter.frequency.setTargetAtTime(280 + throttle * 900, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.16, (speed / 92) * 0.16), t, 0.15);
    windFilter.frequency.setTargetAtTime(350 + speed * 9, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || !started) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function ringChime() {
    blip(880, 0.5, 'sine', 0.22);
    blip(1318, 0.6, 'sine', 0.16, 0.07);
  }

  function touchdown() {
    blip(90, 0.25, 'sine', 0.5);
    blip(55, 0.35, 'triangle', 0.3, 0.02);
  }

  function crashSound() {
    if (!ctx || !started) return;
    const t = ctx.currentTime;
    const len = ctx.sampleRate * 0.7;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    blip(70, 0.6, 'sine', 0.5);
  }

  function warning() {
    blip(660, 0.16, 'square', 0.1);
    blip(660, 0.16, 'square', 0.1, 0.22);
  }

  function fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.55, 'triangle', 0.18, i * 0.11));
  }

  return { start, update, ringChime, touchdown, crashSound, warning, fanfare };
}
