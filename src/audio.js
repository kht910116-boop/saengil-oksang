import { MELODY, BEAT, LEAD_IN, SONG_SECONDS, SONG_BEATS, CHORDS } from './song.js';

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

function tone(freq, start, dur, { type = 'sine', gain = 0.18, to = 0, glide = 0.12, dest = null } = {}) {
  if (start < ctx.currentTime - 0.03) return; // 이미 지난 음은 건너뛴다(노래 중간에 소리를 켠 경우)
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + glide); // 음이 미끄러지듯 올라가거나 내려간다
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest || master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

// 맑은 종소리: 기본음과 배음(2.76배)을 함께 울린다
function bell(freq, start, gain = 0.08) {
  tone(freq, start, 1.6, { type: 'sine', gain });
  tone(freq * 2.76, start, 0.5, { type: 'sine', gain: gain * 0.25 });
  tone(freq * 2, start, 0.9, { type: 'triangle', gain: gain * 0.15 });
}

// 작은 방 울림(잔향) 한 번 만들어 계속 쓴다
let impulse = null;
function roomImpulse() {
  if (impulse) return impulse;
  const len = Math.floor(ctx.sampleRate * 1.6);
  impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return impulse;
}

// 잡음 한 덩어리(반복용)
function noiseBuffer(sec, brown = true) {
  const len = Math.floor(ctx.sampleRate * sec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3; } else d[i] = w;
  }
  return buf;
}
function noiseLoop(filterType, freq, gain, { brown = true, q = 0.7 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(3, brown);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ambientBus);
  src.start();
  ambientNodes.push(src);
  return { src, f, g };
}
// 느리게 출렁이는 값(바람·파도)
function lfo(param, rate, depth) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = rate;
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
  ambientNodes.push(o);
  return o;
}

// 장소마다 다른 배경 소리(파일 없이 코드로): 도시 소음 · 파도 · 눈바람과 장작 · 높은 바람과 열기구 버너 · 우주선 웅웅거림
let ambientBus = null;
let ambientVenue = 'rooftop';
let ambientTimer = null;
let ambientNodes = []; // 장소를 바꿀 때 멈출 소리 원천들
const AMBIENCES = {
  rooftop() {
    noiseLoop('lowpass', 380, 0.22);
    return () => { if (Math.random() < 0.3) tone(330 + Math.random() * 60, ctx.currentTime, 0.9, { type: 'sine', gain: 0.012, to: 300, glide: 0.8 }); }; // 먼 자동차 경적
  },
  cruise() {
    const w = noiseLoop('lowpass', 520, 0.18);
    lfo(w.g.gain, 0.11, 0.12); // 밀려왔다 빠지는 파도
    lfo(w.f.frequency, 0.11, 260);
    const hiss = noiseLoop('highpass', 2500, 0.012, { brown: false });
    lfo(hiss.g.gain, 0.11, 0.01);
    return () => {
      // 먼 뱃고동
      if (Math.random() < 0.35) {
        const t = ctx.currentTime;
        [98, 98 * 1.5].forEach((f) => tone(f, t, 2.6, { type: 'sawtooth', gain: 0.012 }));
      }
    };
  },
  aurora() {
    const wind = noiseLoop('bandpass', 500, 0.16, { q: 1.4 });
    lfo(wind.f.frequency, 0.07, 280); // 휘이잉 높낮이가 바뀌는 눈바람
    lfo(wind.g.gain, 0.05, 0.08);
    return () => { // 벽난로 장작 타닥
      const t = ctx.currentTime;
      for (let i = 0; i < 4 + Math.random() * 6; i++) noiseBurst(t + Math.random() * 1.5, 0.015, 0.03 + Math.random() * 0.03, 2500 + Math.random() * 2000);
    };
  },
  sky() {
    const wind = noiseLoop('bandpass', 900, 0.08, { q: 0.9 });
    lfo(wind.f.frequency, 0.05, 400);
    return () => { // 열기구 버너가 '화르르'
      if (Math.random() < 0.5) {
        const t = ctx.currentTime;
        sweep(t, 1.3, 0.09, 300, 700, 'lowpass', false);
      }
    };
  },
  space() {
    const t = ctx.currentTime;
    for (const [f, gn] of [[55, 0.05], [55.6, 0.04], [82.5, 0.025]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = gn;
      o.connect(g).connect(ambientBus);
      o.start(t);
      ambientNodes.push(o);
    }
    noiseLoop('lowpass', 160, 0.1); // 우주선 공기 순환 소리
    return () => { // 먼 무전 삐빅
      if (Math.random() < 0.4) [1320, 1760].forEach((f, i) => tone(f, ctx.currentTime + i * 0.09, 0.07, { type: 'square', gain: 0.008 }));
    };
  },
};
function startAmbient() {
  if (ambientBus) {
    const old = ambientBus;
    const oldNodes = ambientNodes;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => { for (const n of oldNodes) { try { n.stop(); } catch { /* 이미 멈춤 */ } } old.disconnect(); }, 2000);
  }
  ambientNodes = [];
  clearInterval(ambientTimer);
  ambientBus = ctx.createGain();
  ambientBus.gain.value = 0;
  ambientBus.connect(master);
  ambientBus.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  const event = (AMBIENCES[ambientVenue] || AMBIENCES.rooftop)();
  ambientTimer = setInterval(() => { if (on) event?.(); }, 9000 + Math.random() * 4000);
  ambient = true;
}

// 잡음을 거르는 주파수를 움직이며 내는 소리(바람·입김·쉭)
function sweep(start, dur, gain, f0, f1, type = 'bandpass', white = true, q = 1) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.1, !white);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, start);
  f.frequency.exponentialRampToValueAtTime(f1, start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master);
  src.start(start);
  src.stop(start + dur + 0.1);
}

// BGM: 상황마다 다른 곡을 부드럽게 바꿔 튼다. 파일이 없으면 조용히 넘어간다.
// 미리보기 페이지처럼 다른 경로에 올릴 때는 window.__AUDIO_BASE 로 곡 위치를 바꾼다
const AUDIO_BASE = (typeof window !== 'undefined' && window.__AUDIO_BASE) || '/audio/';
const TRACKS = {
  rooftop: { src: `${AUDIO_BASE}bgm-rooftop.mp3`, loop: true, volume: 0.42 },
  door: { src: `${AUDIO_BASE}bgm-door.mp3`, loop: true, volume: 0.38 },
  midnight: { src: `${AUDIO_BASE}bgm-midnight.mp3`, loop: false, volume: 0.6 },
  landing: { src: `${AUDIO_BASE}bgm-landing.mp3`, loop: true, volume: 0.32 }, // Make a Wish
  party: { src: `${AUDIO_BASE}bgm-party.mp3`, loop: true, volume: 0.4 }, // 점등 뒤 파티(Birthday Chimes)
  fanfare: { src: `${AUDIO_BASE}bgm-fanfare.mp3`, loop: false, volume: 0.55 }, // 주인공 입장(Royal Entrance)
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
  // 아이폰은 audio.volume 을 무시해서(항상 최대), 음량은 Web Audio 의 gain 으로 조절한다
  if (!ctx) ensure();
  try {
    const g = ctx.createGain();
    g.gain.value = 0;
    ctx.createMediaElementSource(a).connect(g).connect(master);
    a._gain = g;
  } catch { a.volume = 0; }
  a.dataset.missing = '';
  a.addEventListener('error', () => { a.dataset.missing = '1'; });
  a.addEventListener('ended', () => { if (wanted === name && after) { const next = after; after = null; sound.music(next); } });
  players[name] = a;
  return a;
}

function fade(a, to, ms = 900) {
  if (a._gain) {
    const g = a._gain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + ms / 1000);
    a._target = to;
    clearTimeout(a._fade);
    if (to === 0) a._fade = setTimeout(() => { if (a._target === 0) a.pause(); }, ms + 50);
    return;
  }
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
// 휴대폰이 잠기거나 전화가 와서 소리가 멈추면, 돌아와 화면을 만질 때 다시 켠다(소리를 켜 둔 경우만)
const wake = () => { if (on && ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  document.addEventListener('pointerdown', wake, { passive: true });
}

export const sound = {
  get enabled() { return on; },
  async toggle() {
    ensure();
    // 아이폰은 화면을 누른 그 순간에 재생을 시작해야 소리가 난다(기다린 뒤에 틀면 막힘)
    if (!on && wanted && TRACKS[wanted]) { try { const a = player(wanted); a.play().catch(() => {}); } catch { /* 다음에 다시 */ } }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* 다음 터치 때 다시 */ } } // 아이폰 'interrupted' 상태 포함
    on = !on;
    master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.1);
    if (on && !ambient) startAmbient();
    if (ambientBus) ambientBus.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.3);
    applyMusic();
    return on;
  },
  get track() { return wanted; },
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
  // 중요한 순간(입장 팡파르, 촛불 끄기)에는 배경 음악을 잠깐 작게
  duck(sec = 3, to = 0.2) {
    if (!on || !wanted || !players[wanted]) return;
    const a = players[wanted];
    const name = wanted;
    fade(a, TRACKS[name].volume * to, 400);
    clearTimeout(a._duck);
    a._duck = setTimeout(() => { if (on && wanted === name) fade(a, TRACKS[name].volume, 1500); }, sec * 1000);
  },
  // 장소를 바꾸면 배경 소리도 바뀐다
  setVenue(id) {
    if (id === ambientVenue) return;
    ambientVenue = id;
    if (ctx && on) startAmbient();
  },
  // 등불이 날아오를 때 '슈욱', 자리에 걸리면 맑은 종소리
  lanternUp(mine = true) {
    if (!on) return;
    const t = ctx.currentTime;
    const v = mine ? 1 : 0.5;
    sweep(t, 0.9, 0.06 * v, 400, 2400, 'bandpass', true, 2);
    bell(1046.5, t + 1.25, 0.09 * v);
    bell(1568, t + 1.33, 0.05 * v);
  },
  // 등불·선물을 눌러 말을 볼 때: 종이 넘기는 가벼운 소리
  paper() {
    if (!on) return;
    const t = ctx.currentTime;
    sweep(t, 0.12, 0.05, 3000, 6000, 'highpass', true);
    tone(1760, t + 0.02, 0.12, { type: 'triangle', gain: 0.03 });
  },
  // 선물이 도착했을 때(종류마다 다르게)
  gift(item) {
    if (!on) return;
    const t = ctx.currentTime;
    if (item === 'balloons') { // 고무풍선 '뾰옹'
      tone(380, t, 0.25, { type: 'sine', gain: 0.12, to: 900, glide: 0.18 });
      tone(760, t + 0.05, 0.2, { type: 'triangle', gain: 0.03, to: 1500, glide: 0.15 });
    } else if (item === 'topping') { // 케이크에 '톡'
      tone(420, t, 0.16, { type: 'sine', gain: 0.16, to: 180, glide: 0.1 });
      bell(2093, t + 0.06, 0.03);
    } else { // 불꽃: 올라가는 휘파람
      tone(900, t, 0.6, { type: 'sine', gain: 0.03, to: 2200, glide: 0.55 });
    }
    bell(1318.5, t + 0.12, 0.05);
  },
  // 친구가 들어올 때 '딩동'(작게)
  doorbell() {
    if (!on) return;
    const t = ctx.currentTime;
    bell(659.3, t, 0.05);
    bell(523.3, t + 0.22, 0.05);
  },
  // 주인공 문이 열릴 때: 묵직한 문소리와 따뜻한 화음
  doorOpen() {
    if (!on) return;
    const t = ctx.currentTime;
    tone(92, t, 1.2, { type: 'sawtooth', gain: 0.03, to: 64, glide: 1.0 });
    sweep(t, 1.2, 0.05, 200, 900, 'bandpass', false, 3);
    [392, 523.3, 659.3, 784].forEach((f, i) => tone(f, t + 0.6 + i * 0.08, 2.4, { type: 'sine', gain: 0.07 }));
  },
  // 입장 행진: 작은 북 연타 뒤 팡파르
  fanfare(delay = 0) {
    if (!on) return;
    const t = ctx.currentTime + delay;
    for (let i = 0; i < 26; i++) noiseBurst(t + i * 0.055, 0.04, 0.03 + (i / 26) * 0.09, 700 + Math.random() * 300);
    const f0 = t + 1.5;
    const notes = [[523.3, 0, 0.18], [523.3, 0.2, 0.18], [523.3, 0.4, 0.18], [659.3, 0.6, 0.5], [587.3, 1.1, 0.25], [659.3, 1.35, 0.25], [784, 1.6, 1.4]];
    for (const [f, at, len] of notes) {
      tone(f, f0 + at, len + 0.3, { type: 'sawtooth', gain: 0.035 });
      tone(f, f0 + at, len + 0.3, { type: 'square', gain: 0.02 });
      tone(f / 2, f0 + at, len + 0.3, { type: 'triangle', gain: 0.05 });
    }
    noiseBurst(f0 + 1.6, 0.6, 0.06, 5000); // 심벌즈
  },
  // 점등 직전 5초: 나무 딱따기 소리(마지막은 더 크게)
  tick(strong = false) {
    if (!on) return;
    const t = ctx.currentTime;
    tone(strong ? 1568 : 1175, t, 0.09, { type: 'sine', gain: strong ? 0.2 : 0.12 });
    noiseBurst(t, 0.02, 0.05, 3000);
  },
  // 사진 찰칵
  shutter() {
    if (!on) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.03, 0.2, 2500);
    noiseBurst(t + 0.07, 0.05, 0.14, 1800);
    tone(2400, t, 0.04, { type: 'square', gain: 0.015 });
  },
  // 촛불 끄기: 숨 들이쉬기 → '후~' → 심지가 꺼지는 '칙'
  inhale() {
    if (!on) return;
    sweep(ctx.currentTime, 0.55, 0.04, 600, 1600, 'bandpass', true, 1.2);
  },
  blow() {
    if (!on) return;
    const t = ctx.currentTime;
    sweep(t, 1.0, 0.16, 1400, 380, 'lowpass', true, 0.6);
    sweep(t, 0.9, 0.05, 900, 500, 'bandpass', true, 2);
  },
  snuff() {
    if (!on) return;
    sweep(ctx.currentTime, 0.18, 0.03, 5000, 2500, 'highpass', true);
  },
  // 박수 소리(여러 사람)
  applause(dur = 2.6, amount = 1) {
    if (!on) return;
    const t = ctx.currentTime;
    const n = Math.floor(dur * 34 * amount);
    for (let i = 0; i < n; i++) {
      const at = Math.random() * dur;
      const env = Math.min(1, at / 0.3) * Math.min(1, (dur - at) / 0.8);
      noiseBurst(t + at, 0.03, (0.05 + Math.random() * 0.07) * env, 900 + Math.random() * 1600);
    }
  },
  // 파티 나팔 '뿌우~'
  partyHorn() {
    if (!on) return;
    const t = ctx.currentTime;
    tone(440, t, 0.7, { type: 'sawtooth', gain: 0.03, to: 520, glide: 0.5 });
    tone(443, t, 0.7, { type: 'square', gain: 0.02, to: 524, glide: 0.5 });
    noiseBurst(t + 0.05, 0.3, 0.03, 4000); // 종이 나팔 펼쳐지는 소리
  },
  // 파티장이 닫힐 때: 오르골이 천천히 내려간다
  closing() {
    if (!on) return;
    const t = ctx.currentTime;
    [1046.5, 880, 784, 659.3, 587.3, 523.3].forEach((f, i) => bell(f, t + i * 0.42, 0.06));
  },
  nom(mine = true) { // 냠냠
    if (!on) return;
    const t = ctx.currentTime;
    const v = mine ? 1 : 0.5;
    for (let i = 0; i < 3; i++) { tone(330 + i * 20, t + i * 0.22, 0.09, { type: 'sine', gain: 0.07 * v, to: 220, glide: 0.08 }); noiseBurst(t + i * 0.22, 0.04, 0.03 * v, 1500); }
  },
  clink(mine = true) { // 짠!
    if (!on) return;
    const t = ctx.currentTime + 0.35;
    const v = mine ? 1 : 0.5;
    bell(2637, t, 0.06 * v);
    bell(3520, t + 0.02, 0.04 * v);
  },
  // ── 장소 놀거리 소리 ──
  shipHorn() { // 뱃고동 '뿌우우~'
    if (!on) return;
    const t = ctx.currentTime;
    for (const [f, g] of [[87.3, 0.05], [130.8, 0.04], [174.6, 0.02]]) {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = f;
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(g * 2.2, t + 0.25);
      gn.gain.setValueAtTime(g * 2.2, t + 2.2);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(lp).connect(gn).connect(master);
      o.start(t);
      o.stop(t + 3.3);
    }
  },
  creak() { // 조타륜 끼익
    if (!on) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 5; i++) tone(180 + Math.random() * 60, t + i * 0.18, 0.15, { type: 'sawtooth', gain: 0.02, to: 120, glide: 0.12 });
  },
  bigBell() { // 소원의 종 '댕~'
    if (!on) return;
    const t = ctx.currentTime;
    [[392, 0.16], [392 * 2.4, 0.05], [392 * 3, 0.04], [196, 0.1]].forEach(([f, g]) => tone(f, t, 4, { type: 'sine', gain: g }));
    noiseBurst(t, 0.05, 0.08, 2000);
  },
  shimmer() { // 반짝이는 소리(오로라·눈사람 완성)
    if (!on) return;
    const t = ctx.currentTime;
    [1318.5, 1568, 1975.5, 2349.3, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.07, 1.2, { type: 'sine', gain: 0.03 }));
  },
  teleport() { // 순간이동 '쀼웅'
    if (!on) return;
    const t = ctx.currentTime;
    tone(300, t, 0.5, { type: 'sine', gain: 0.1, to: 2400, glide: 0.4 });
    tone(2400, t + 0.42, 0.4, { type: 'triangle', gain: 0.04, to: 600, glide: 0.3 });
    sweep(t, 0.6, 0.05, 500, 6000, 'bandpass', true, 3);
  },
  boing() { // 트램펄린·눈 뭉치기 '통'
    if (!on) return;
    tone(220, ctx.currentTime, 0.3, { type: 'sine', gain: 0.12, to: 520, glide: 0.2 });
  },
  burner() { // 열기구 버너 '화르르'
    if (!on) return;
    sweep(ctx.currentTime, 1.4, 0.12, 250, 900, 'lowpass', false, 0.8);
  },
  // 장소 바꾸기 '휙'
  whoosh() {
    if (!on) return;
    sweep(ctx.currentTime, 0.5, 0.05, 300, 3000, 'bandpass', true, 1.5);
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
  // 생일 축하 노래 반주: 피아노 같은 멜로디 + 왈츠(쿵-짝-짝) 반주 + 은은한 울림, 끝에 화음으로 마무리.
  // delay초 뒤에 시작하고, 그동안 배경 음악은 작게 줄인다.
  birthdaySong(delay = 0, offset = 0) {
    if (!on) return;
    const t0 = ctx.currentTime + Math.max(0, delay) + LEAD_IN * BEAT - Math.max(0, offset); // offset: 이미 지난 박(초)
    const bgm = wanted && players[wanted];
    if (bgm) {
      fade(bgm, TRACKS[wanted].volume * 0.12, 600);
      setTimeout(() => { if (on && players[wanted] === bgm) fade(bgm, TRACKS[wanted].volume, 1500); }, (delay + SONG_SECONDS + 2) * 1000);
    }
    // 노래 전용 소리 길: 그대로 + 방 울림(잔향)
    const bus = ctx.createGain();
    bus.gain.value = 1.1;
    bus.connect(master);
    const verb = ctx.createConvolver();
    verb.buffer = roomImpulse();
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    bus.connect(verb).connect(wet).connect(master);
    setTimeout(() => { try { bus.disconnect(); wet.disconnect(); } catch { /* 이미 끊김 */ } }, (delay + SONG_SECONDS + 6) * 1000);
    // 준비 박: 똑, 똑
    for (let i = 0; i < LEAD_IN; i++) tone(1760, t0 - (LEAD_IN - i) * BEAT, 0.08, { type: 'square', gain: 0.03, dest: bus });
    // 멜로디(피아노 느낌: 삼각파 + 한 옥타브 위 사인 + 짧게 반짝이는 종)
    let b = 0;
    for (const [f, len] of MELODY) {
      const t = t0 + b * BEAT;
      const d = Math.max(0.45, len * BEAT * 1.4);
      tone(f, t, d, { type: 'triangle', gain: 0.17, dest: bus });
      tone(f * 2, t, d * 0.7, { type: 'sine', gain: 0.05, dest: bus });
      if (Math.abs(b - Math.round(b)) < 0.01 && Math.round(b) % 3 === 1) tone(f * 4, t, 0.35, { type: 'sine', gain: 0.018, dest: bus });
      b += len;
    }
    // 왈츠 반주: 1박 베이스(쿵), 2·3박 화음(짝 짝)
    for (const c of CHORDS) {
      for (let k = 0; k < c.len; k++) {
        const t = t0 + (c.at + k) * BEAT;
        if (k === 0) {
          tone(c.bass, t, BEAT * 1.6, { type: 'sine', gain: 0.17, dest: bus });
          tone(c.bass * 2, t, BEAT * 0.9, { type: 'triangle', gain: 0.04, dest: bus });
        } else {
          for (const f of c.tones) tone(f, t, BEAT * 0.7, { type: 'sine', gain: 0.045, dest: bus });
        }
      }
    }
    // 마무리: 도-미-솔-도 펼침화음과 길게 남는 화음
    const tEnd = t0 + SONG_BEATS * BEAT;
    [261.63, 329.63, 392, 523.25].forEach((f, i) => tone(f, tEnd + i * 0.09, 2.6, { type: 'triangle', gain: 0.07, dest: bus }));
    tone(130.81, tEnd, 2.8, { type: 'sine', gain: 0.15, dest: bus });
    [1046.5, 1318.5].forEach((f, i) => tone(f, tEnd + 0.4 + i * 0.12, 1.5, { type: 'sine', gain: 0.025, dest: bus }));
  },
  swell() {
    if (!on) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.12, 2.6, { gain: 0.1 }));
  },
};
