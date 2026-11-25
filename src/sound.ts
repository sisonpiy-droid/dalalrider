let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let muted = localStorage.getItem('dalalrider_muted') === '1';

let engineNodes: AudioNode[] = [];
let engineGain: GainNode | null = null;
let engineParams: { update: (speed: number, t: number) => void } | null = null;
let engineRunning = false;

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(compressor).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function getMaster(): GainNode {
  ensureCtx();
  return master!;
}

export function isMuted(): boolean { return muted; }
export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem('dalalrider_muted', muted ? '1' : '0');
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx!.currentTime, 0.05);
  return muted;
}

function playOneShot(setup: (ctx: AudioContext, dest: GainNode, t: number) => void) {
  if (muted) return;
  try {
    const c = ensureCtx();
    setup(c, getMaster(), c.currentTime);
  } catch {}
}

type EnginePreset = {
  name: string;
  build: (c: AudioContext, dest: AudioNode) => { nodes: AudioNode[]; update: (speed: number, t: number) => void };
};

function buildPulsePreset(name: string, opts: {
  freq: number; decay: number; noiseAmt: number; attack: number;
  fltBase: number; fltRange: number; rateBase: number; rateRange: number;
  filterType?: BiquadFilterType; Q?: number;
}): EnginePreset {
  return {
    name,
    build(c, dest) {
      const dur = 1 / 25;
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const p = i / len;
        const env = p < opts.attack ? p / opts.attack : Math.exp(-(p - opts.attack) * opts.decay);
        const tone = Math.sin(2 * Math.PI * opts.freq * p) * (1 - opts.noiseAmt);
        const noise = (Math.random() * 2 - 1) * opts.noiseAmt;
        d[i] = env * (tone + noise);
      }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      src.playbackRate.value = opts.rateBase;
      const flt = c.createBiquadFilter();
      flt.type = opts.filterType || 'lowpass';
      flt.frequency.value = opts.fltBase;
      if (opts.Q) flt.Q.value = opts.Q;
      const out = c.createGain(); out.gain.value = 0.25;
      src.connect(flt).connect(out).connect(dest);
      src.start();
      return { nodes: [src], update(speed, t) {
        src.playbackRate.setTargetAtTime(opts.rateBase + speed * opts.rateRange, t, 0.06);
        flt.frequency.setTargetAtTime(opts.fltBase + speed * opts.fltRange, t, 0.06);
        out.gain.setTargetAtTime(0.15 + speed * 0.35, t, 0.08);
      }};
    }
  };
}

const ENGINE_PRESETS: EnginePreset[] = [
  buildPulsePreset('Gritty mid', { freq: 180, decay: 7, noiseAmt: 0.45, attack: 0.1, fltBase: 700, fltRange: 3500, rateBase: 0.5, rateRange: 4.5 }),
];

export function startEngine() {
  if (engineRunning) return;
  const c = ensureCtx();
  const dest = getMaster();

  engineGain = c.createGain();
  engineGain.gain.value = 1;
  engineGain.connect(dest);

  const preset = ENGINE_PRESETS[0];
  const result = preset.build(c, engineGain);
  engineNodes = result.nodes;
  engineParams = result;
  engineRunning = true;
}

export function updateEngine(speed: number) {
  if (!engineRunning || !ctx || !engineParams) return;
  engineParams.update(speed, ctx.currentTime);
}

export function stopEngine() {
  if (!engineRunning) return;
  for (const n of engineNodes) { try { (n as OscillatorNode).stop?.(); (n as AudioBufferSourceNode).stop?.(); } catch {} }
  engineNodes = []; engineParams = null; engineGain = null;
  engineRunning = false;
}

type CrashBuilder = { name: string; play: (c: AudioContext, dest: AudioNode, t: number) => void };

function noiseBuf(c: AudioContext, dur: number, shapeFn: (p: number) => number): AudioBuffer {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * shapeFn(i / len);
  return buf;
}

const CRASH_PRESETS: CrashBuilder[] = [
  { name: 'Crunch',
    play(c, dest, t) {
      const osc = c.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
      const og = c.createGain();
      og.gain.setValueAtTime(0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(og).connect(dest); osc.start(t); osc.stop(t + 0.25);

      const crunch = c.createBufferSource();
      crunch.buffer = noiseBuf(c, 0.4, p => p < 0.02 ? p / 0.02 : Math.exp(-p * 9));
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 4);
      shaper.curve = curve;
      const cf = c.createBiquadFilter(); cf.type = 'lowpass';
      cf.frequency.setValueAtTime(4500, t);
      cf.frequency.exponentialRampToValueAtTime(600, t + 0.35);
      const cg = c.createGain();
      cg.gain.setValueAtTime(0.35, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      crunch.connect(shaper).connect(cf).connect(cg).connect(dest);
      crunch.start(t);

      const clank = c.createOscillator(); clank.type = 'square';
      clank.frequency.setValueAtTime(320, t + 0.02);
      clank.frequency.exponentialRampToValueAtTime(95, t + 0.12);
      const kf = c.createBiquadFilter(); kf.type = 'bandpass'; kf.frequency.value = 700; kf.Q.value = 2;
      const kg = c.createGain();
      kg.gain.setValueAtTime(0.14, t + 0.02);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      clank.connect(kf).connect(kg).connect(dest);
      clank.start(t + 0.02); clank.stop(t + 0.18);

      const tail = c.createBufferSource();
      tail.buffer = noiseBuf(c, 0.5, p => Math.random() < 0.12 ? Math.exp(-p * 5) : 0);
      const tf = c.createBiquadFilter(); tf.type = 'highpass'; tf.frequency.value = 1500;
      const tg = c.createGain();
      tg.gain.setValueAtTime(0.1, t + 0.08);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      tail.connect(tf).connect(tg).connect(dest);
      tail.start(t + 0.08);
    }},
];

export function playCrash() {
  playOneShot((c, dest, t) => { CRASH_PRESETS[0].play(c, dest, t); });
}

type SoundPreset = { name: string; play: (c: AudioContext, dest: AudioNode, t: number) => void };
let landingPreset = 0;

export function playLanding() {
  playOneShot((c, dest, t) => {
    const src = c.createBufferSource(); src.buffer = noiseBuf(c, 0.12, p => Math.pow(1 - p, 2));
    const g = c.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    src.connect(f).connect(g).connect(dest); src.start(t);
  });
}

export function playTrick() {
  playOneShot((c, dest, t) => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = c.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(0.06, t + i * 0.06); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.08);
      osc.connect(g).connect(dest); osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.08);
    });
  });
}

export function playFinish() {
  playOneShot((c, dest, t) => {
    [392, 523, 659, 784, 784].forEach((freq, i) => {
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
      const g = c.createGain(); g.gain.setValueAtTime(0.12, t + i * 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + (i === 4 ? 0.5 : 0.12));
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
      osc.connect(f).connect(g).connect(dest); osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + (i === 4 ? 0.5 : 0.15));
    });
  });
}

export function playNos() {
  playOneShot((c, dest, t) => {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.linearRampToValueAtTime(0.15, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    osc.connect(f).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.5);
    const src = c.createBufferSource();
    src.buffer = noiseBuf(c, 0.3, p => p < 0.03 ? p / 0.03 : Math.exp(-p * 4));
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    const hpf = c.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;
    src.connect(hpf).connect(ng).connect(dest);
    src.start(t);
  });
}

export function playMoonReached() {
  playOneShot((c, dest, t) => {
    [523, 784, 1047, 1318, 1568].forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = c.createGain();
      g.gain.setValueAtTime(0.06, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.3);
      osc.connect(g).connect(dest);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.3);
    });
  });
}

export function playCombo() {
  playOneShot((c, dest, t) => {
    const osc = c.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, t); osc.frequency.setValueAtTime(900, t + 0.03); osc.frequency.setValueAtTime(700, t + 0.06); osc.frequency.setValueAtTime(1000, t + 0.09);
    const g = c.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(dest); osc.start(t); osc.stop(t + 0.12);
  });
}

let bellBuffer: AudioBuffer | null = null;
let bellLoading = false;

function loadBellBuffer(c: AudioContext): Promise<AudioBuffer | null> {
  if (bellBuffer) return Promise.resolve(bellBuffer);
  if (bellLoading) return Promise.resolve(null);
  bellLoading = true;
  return fetch('./sounds/opening-bell.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => c.decodeAudioData(buf))
    .then(decoded => { bellBuffer = decoded; return decoded; })
    .catch(() => { bellLoading = false; return null; });
}

export function preloadBell(): Promise<void> {
  try { return loadBellBuffer(ensureCtx()).then(() => {}); } catch { return Promise.resolve(); }
}

export function playOpeningBell() {
  if (muted) return;
  const c = ensureCtx();
  const buf = bellBuffer;
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.15;
  src.connect(g).connect(getMaster());
  src.start(0);
}

export function playCoin() {
  playOneShot((c, dest, t) => {
    [988, 1319].forEach((freq, i) => {
      const osc = c.createOscillator(); osc.type = 'square'; osc.frequency.value = freq;
      const g = c.createGain();
      const start = t + i * 0.05;
      g.gain.setValueAtTime(0.045, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.connect(g).connect(dest); osc.start(start); osc.stop(start + 0.12);
    });
  });
}

export function playPerfectLanding() {
  playOneShot((c, dest, t) => {
    [880, 1320].forEach((freq, i) => {
      const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const g = c.createGain();
      const start = t + i * 0.06;
      g.gain.setValueAtTime(0.07, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      osc.connect(g).connect(dest); osc.start(start); osc.stop(start + 0.15);
    });
  });
}

export function playStreakUp(level: number) {
  playOneShot((c, dest, t) => {
    const base = 523 * Math.pow(2, ((level - 2) * 4) / 12);
    [base, base * 1.5].forEach((freq, i) => {
      const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = freq;
      const g = c.createGain();
      const start = t + i * 0.05;
      g.gain.setValueAtTime(0.09, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.connect(g).connect(dest); osc.start(start); osc.stop(start + 0.12);
    });
    if (level >= 5) {
      const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = base * 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.07, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g).connect(dest); osc.start(t + 0.1); osc.stop(t + 0.4);
    }
  });
}

export function playStreakLost() {
  playOneShot((c, dest, t) => {
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(f).connect(g).connect(dest); osc.start(t); osc.stop(t + 0.35);
  });
}

export function playNamedCombo() {
  playOneShot((c, dest, t) => {
    [523, 659, 784, 1047, 1318].forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = i < 3 ? 'square' : 'sine';
      osc.frequency.value = freq;
      const g = c.createGain();
      const start = t + i * 0.04;
      g.gain.setValueAtTime(0.07, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(g).connect(dest);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  });
}
