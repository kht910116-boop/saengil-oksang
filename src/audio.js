// 효과음은 코드로 합성하고, BGM은 public/audio/ 의 mp3 파일을 상황별로 튼다(BGM_GUIDE.md 참고).
let ctx = null;
let master = null;
let ambient = null;
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

// BGM: 상황마다 다른 곡을 부드럽게 바꿔 튼다. 파일이 없으면 조용히 넘어간다.
const TRACKS = {
  rooftop: { src: '/audio/bgm-rooftop.mp3', loop: true, volume: 0.42 },
  door: { src: '/audio/bgm-door.mp3', loop: true, volume: 0.38 },
  midnight: { src: '/audio/bgm-midnight.mp3', loop: false, volume: 0.6 },
  landing: { src: '/audio/bgm-rooftop.mp3', loop: true, volume: 0.32 },
};
const players = {};
let wanted = null; // 지금 틀어야 하는 곡 이름
let after = null; // 한 번만 트는 곡이 끝난 뒤 돌아갈 곡

function player(name) {
  if (players[name]) return players[name];
  const t = TRACKS[name];
  const a = new Audio(t.src);
  a.loop = t.loop;
  a.preload = 'auto';
  a.volume = 0;
  a.dataset.missing = '';
  a.addEventListener('error', () => { a.dataset.missing = '1'; });
  a.addEventListener('ended', () => { if (wanted === name && after) { const next = after; after = null; sound.music(next); } });
  players[name] = a;
  // 녹화 중이면 새 곡도 녹화 소리에 연결
  if (sound._dest) { try { ctx.createMediaElementSource(a).connect(master); } catch { /* 이미 연결됨 */ } }
  return a;
}

function fade(a, to, ms = 900) {
  const from = a.volume;
  const start = performance.now();
  clearInterval(a._fade);
  a._fade = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / ms);
    a.volume = from + (to - from) * k;
    if (k >= 1) {
      clearInterval(a._fade);
      if (to === 0) a.pause();
    }
  }, 40);
}

function applyMusic() {
  for (const [name, a] of Object.entries(players)) {
    if (name !== wanted || !on) fade(a, 0);
  }
  if (!on || !wanted) return;
  const a = player(wanted);
  if (a.dataset.missing) return;
  if (!TRACKS[wanted].loop && a.ended) a.currentTime = 0;
  a.play().then(() => fade(a, TRACKS[wanted].volume)).catch(() => {});
}

export const sound = {
  get enabled() { return on; },
  async toggle() {
    ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    on = !on;
    master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.1);
    if (on && !ambient) startAmbient();
    applyMusic();
    return on;
  },
  // 상황별 곡 바꾸기. thenTrack을 주면 한 번만 트는 곡이 끝난 뒤 그 곡으로 돌아간다.
  music(name, thenTrack = null) {
    wanted = name;
    after = thenTrack;
    // 소리를 켠 사람만 곡 파일을 받는다(전송량 절약). 한 번만 트는 곡은 처음부터.
    if (name && !TRACKS[name].loop && players[name]) {
      try { players[name].currentTime = 0; } catch { /* 아직 불러오는 중 */ }
    }
    applyMusic();
  },
  // 영상 녹화용: 효과음과 BGM을 한 줄기 소리로 내보낸다
  stream() {
    ensure();
    if (!sound._dest) {
      sound._dest = ctx.createMediaStreamDestination();
      master.connect(sound._dest);
      for (const a of Object.values(players)) {
        try { ctx.createMediaElementSource(a).connect(master); } catch { /* 이미 연결됨 */ }
      }
    }
    return sound._dest.stream;
  },
  pop() {
    if (!on) return;
    const t = ctx.currentTime;
    tone(220, t, 0.25, { type: 'sine', gain: 0.12 });
    [1568, 2093, 2637].forEach((f, i) => tone(f, t + 0.05 + i * 0.04, 0.6, { type: 'triangle', gain: 0.03 }));
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
