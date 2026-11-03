import { MELODY, BASS, BEAT, LEAD_IN, SONG_SECONDS } from './song.js';

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

function tone(freq, start, dur, { type = 'sine', gain = 0.18, to = 0, glide = 0.12 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + glide); // 음이 미끄러지듯 올라가거나 내려간다
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
// 미리보기 페이지처럼 다른 경로에 올릴 때는 window.__AUDIO_BASE 로 곡 위치를 바꾼다
const AUDIO_BASE = (typeof window !== 'undefined' && window.__AUDIO_BASE) || '/audio/';
const TRACKS = {
  rooftop: { src: `${AUDIO_BASE}bgm-rooftop.mp3`, loop: true, volume: 0.42 },
  door: { src: `${AUDIO_BASE}bgm-door.mp3`, loop: true, volume: 0.38 },
  midnight: { src: `${AUDIO_BASE}bgm-midnight.mp3`, loop: false, volume: 0.6 },
  landing: { src: `${AUDIO_BASE}bgm-rooftop.mp3`, loop: true, volume: 0.32 },
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

// 잡음 한 번(불꽃 소리용)
function noiseBurst(start, dur, gain, freq) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start(start);
}

const reactLast = {};

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
  // 불꽃 터지는 소리: 낮은 '펑' + 잡음 + 반짝이는 고음(작은 불꽃은 가볍게)
  pop(pattern = 'peony') {
    if (!on) return;
    const t = ctx.currentTime;
    const small = pattern === 'small';
    tone(small ? 260 : 150, t, small ? 0.2 : 0.4, { type: 'sine', gain: small ? 0.08 : 0.16 });
    noiseBurst(t, small ? 0.15 : 0.35, small ? 0.05 : 0.11, 900);
    [1568, 2093, 2637].forEach((f, i) => tone(f, t + 0.05 + i * 0.04, 0.6, { type: 'triangle', gain: small ? 0.015 : 0.03 }));
  },
  // 타닥타닥: 짧은 잡음을 흩뿌린다
  crackle() {
    if (!on) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 26; i++) noiseBurst(t + Math.random() * 0.9, 0.025, 0.04 + Math.random() * 0.03, 3000 + Math.random() * 3000);
  },
  // 리액션 효과음: 짝짝(박수 두 번), 하트(말랑하게 올라가는 '뿅'), 별(반짝이는 높은 음)
  // 내가 누른 건 또렷하게, 다른 사람 것은 작게. 많은 사람이 동시에 눌러도 시끄럽지 않게 간격을 둔다.
  react(kind, mine = false) {
    if (!on) return;
    const now = ctx.currentTime;
    const last = reactLast[kind] || 0;
    if (now - last < (mine ? 0.06 : 0.14)) return;
    reactLast[kind] = now;
    const v = mine ? 1 : 0.45;
    const t = now + 0.005;
    if (kind === 'clap') {
      for (const off of [0, 0.13]) {
        // 손뼉 한 번 = 아주 짧은 잡음 몇 겹(손바닥 여러 군데가 부딪히는 느낌)
        for (let k = 0; k < 3; k++) noiseBurst(t + off + k * 0.008, 0.045, 0.22 * v, 1100 + Math.random() * 900);
        noiseBurst(t + off, 0.12, 0.05 * v, 2400);
      }
    } else if (kind === 'heart') {
      tone(520, t, 0.28, { type: 'sine', gain: 0.16 * v, to: 780, glide: 0.1 });
      tone(780, t + 0.11, 0.38, { type: 'sine', gain: 0.13 * v, to: 1040, glide: 0.12 });
      tone(1560, t + 0.11, 0.3, { type: 'triangle', gain: 0.025 * v });
    } else if (kind === 'party') {
      [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.045, 0.45, { type: 'triangle', gain: 0.05 * v }));
      for (let i = 0; i < 6; i++) noiseBurst(t + 0.05 + Math.random() * 0.3, 0.02, 0.025 * v, 6000 + Math.random() * 3000);
    }
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
  // 생일 축하 노래 반주(오르골 소리). delay초 뒤에 시작하고, 그동안 배경 음악은 작게 줄인다.
  birthdaySong(delay = 0) {
    if (!on) return;
    const t0 = ctx.currentTime + Math.max(0, delay) + LEAD_IN * BEAT;
    const bgm = wanted && players[wanted];
    if (bgm) {
      fade(bgm, TRACKS[wanted].volume * 0.15, 600);
      setTimeout(() => { if (on && players[wanted] === bgm) fade(bgm, TRACKS[wanted].volume, 1500); }, (delay + SONG_SECONDS + 0.5) * 1000);
    }
    // 준비 박: 똑, 똑
    for (let i = 0; i < LEAD_IN; i++) tone(1760, t0 - (LEAD_IN - i) * BEAT, 0.08, { type: 'square', gain: 0.03 });
    let b = 0;
    for (const [f, len] of MELODY) {
      const t = t0 + b * BEAT;
      tone(f, t, Math.max(0.5, len * BEAT * 1.6), { type: 'triangle', gain: 0.13 });
      tone(f * 2, t, 0.5, { type: 'sine', gain: 0.035 });
      b += len;
    }
    for (const [at, f] of BASS) tone(f, t0 + at * BEAT, BEAT * 2.6, { type: 'sine', gain: 0.12 });
  },
  swell() {
    if (!on) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.12, 2.6, { gain: 0.1 }));
  },
};
