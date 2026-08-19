/* Puffin Flight — tiny WebAudio sound engine.
 * No audio files: every sound is synthesised. Context is created lazily on the
 * first user gesture so browsers don't block it, and everything is a no-op if
 * WebAudio is unavailable.
 */
(function (PF) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;
  var failed = false;

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    } catch (e) {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  /* One synth voice: osc -> gain envelope -> master. */
  function tone(opts) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    var t0 = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + dur);
    }
    var peak = opts.gain == null ? 0.6 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /* Short filtered noise burst — used for the splash and the wipeout. */
  function noise(opts) {
    if (muted || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    var dur = opts.dur || 0.3;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var frames = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = opts.filter || 'lowpass';
    filter.frequency.setValueAtTime(opts.freq || 900, t0);
    if (opts.freqTo) filter.frequency.exponentialRampToValueAtTime(opts.freqTo, t0 + dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain == null ? 0.35 : opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  PF.audio = {
    /* Call from a real user gesture before playing anything. */
    unlock: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.28;
      return muted;
    },
    flap: function () {
      tone({ type: 'sine', from: 380, to: 620, dur: 0.09, gain: 0.28 });
    },
    fiber: function () {
      tone({ type: 'triangle', from: 880, dur: 0.1, gain: 0.4 });
      tone({ type: 'triangle', from: 1320, dur: 0.13, gain: 0.32, delay: 0.06 });
    },
    router: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'triangle', from: f, dur: 0.16, gain: 0.34, delay: i * 0.06 });
      });
    },
    buffer: function () {
      // Deliberately unlovely: the sound of Big Cable.
      [0, 0.18, 0.36].forEach(function (d) {
        tone({ type: 'square', from: 180, to: 120, dur: 0.14, gain: 0.16, delay: d });
      });
    },
    stageUp: function () {
      [392, 523, 659].forEach(function (f, i) {
        tone({ type: 'triangle', from: f, dur: 0.28, gain: 0.3, delay: i * 0.09 });
      });
    },
    splash: function () {
      noise({ dur: 0.5, freq: 2400, freqTo: 300, gain: 0.3 });
    },
    wipeout: function () {
      tone({ type: 'sawtooth', from: 320, to: 90, dur: 0.45, gain: 0.22 });
      noise({ dur: 0.45, freq: 1200, freqTo: 200, gain: 0.22, delay: 0.05 });
    }
  };
})(window.PF = window.PF || {});
