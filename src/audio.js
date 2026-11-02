// 효과음은 모두 코드로 합성한다. BGM은 public/audio/bgm.mp3 가 있으면 재생한다.
let ctx = null;
let master = null;
let ambient = null;
let bgm = null;
let on = false;

function ensure() {
  if (ctx) return ctx;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function startAmbient() {
  // 멀리서 들리는 도시 소리: 낮게 거른 잡음
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  src.connect(f).connect(g).connect(master);
  src.start();
  ambient = { src, g };
}

export const sound = {
  get enabled() { return on; },
  async toggle() {
    ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    on = !on;
    master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.1);
    if (on && !ambient) startAmbient();
    if (!bgm) {
      bgm = new Audio('/audio/bgm.mp3');
      bgm.loop = true;
      bgm.volume = 0.45;
      bgm.addEventListener('error', () => { bgm.dataset.missing = '1'; });
    }
    if (on && !bgm.dataset.missing) bgm.play().catch(() => {});
    if (!on && bgm) bgm.pause();
    return on;
  },
  chime() {
    if (!on) return;
    const t = ctx.currentTime;
    [784, 988, 1175].forEach((f, i) => tone(f, t + i * 0.09, 0.9, { gain: 0.12 }));
  },
  click(i = 0) {
    if (!on) return;
    const t = ctx.currentTime;
    const scale = [523, 587, 659, 784, 880, 1047];
    tone(scale[i % scale.length] * (i % 12 < 6 ? 1 : 1.5), t, 0.35, { type: 'triangle', gain: 0.06 });
  },
  swell() {
    if (!on) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.12, 2.6, { gain: 0.1 }));
  },
};
