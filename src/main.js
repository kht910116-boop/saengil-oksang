import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWorld } from './world.js';
import { CAKE } from './venues/common.js';
import { createAvatar } from './avatar.js';
import { sound } from './audio.js';
import { api, connectRoom, track, reportError } from './net.js';
import { createMeteors, createConfetti, createBreath } from './effects.js';
import { snapshot, composePhoto } from './photo.js';
import { createRecorder, saveVideo, calendarFile } from './recorder.js';

// 화면 오류는 운영자가 볼 수 있게 서버에 남긴다
window.addEventListener('error', (e) => reportError(`${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => reportError(`promise: ${e.reason?.message || e.reason}`));
import { LANTERN_TEMPLATES, renderTemplate, GIFT_ITEMS, PAYMENT_MODE, josa, validateName, revealLabel, LANTERN_RELATIONS, MAX_YEARS, THANKS_TEMPLATES, GOAL_LANTERNS, VENUES, DEFAULT_VENUE, BRAND, OUTFITS, DEFAULT_OUTFIT, ACCESSORIES, MAX_BOTS } from './config.js';
import { createGiftLayer } from './gifts.js';
import { composeMemoryCard } from './memory.js';
import { songLines, BEAT, LEAD_IN, SONG_BEATS } from './song.js';
import './style.css';

// ── 경로: / 파티장 만들기 · /r/demo 샘플 · /r/:id 실제 파티장 ──
const path = location.pathname;
const roomMatch = path.match(/^\/r\/([\w-]{4,16})\/?$/);
// 서버 없이 띄우는 미리보기 페이지는 window.__FORCE_MODE = 'demo' 로 샘플 파티장만 연다
const MODE = window.__FORCE_MODE || (path === '/' || path === '/index.html' ? 'landing' : roomMatch?.[1] === 'demo' ? 'demo' : roomMatch ? 'room' : 'landing');
const ROOM_ID = MODE === 'room' ? roomMatch[1] : null;
const QS = new URLSearchParams(location.search);
let OWNER_KEY = QS.get('k');
document.body.dataset.mode = MODE;

const KST = 9 * 3600_000;
const LANTERN_COLORS = [
  { name: '호박', hex: 0xffc46b },
  { name: '분홍', hex: 0xf29bb3 },
  { name: '민트', hex: 0x8fd3c1 },
  { name: '라벤더', hex: 0xb9a6f2 },
  { name: '하양', hex: 0xfbf4e8 },
];
const HAT_COLORS = [0xffc46b, 0xf29bb3, 0xb9a6f2, 0x8fd3c1];
const DEMO_FRIENDS = [
  { name: '수아', color: 0x8fd3c1, msg: '민지야, 생일 축하해!', outfit: 'dress', acc: 'bunny' },
  { name: '도윤', color: 0xb9a6f2, msg: '맛있는 거 먹으러 가자!', outfit: 'suit', acc: 'glasses' },
  { name: '하은', color: 0xffc46b, msg: '우리 오래오래 보자', outfit: 'party', acc: 'cat' },
  { name: '엄마', color: 0xf29bb3, msg: '태어나줘서 고마워', outfit: 'dress', acc: 'flower' },
  { name: '지호', color: 0x8fd3c1, msg: '꿈꾸는 일 모두 이루어지길', outfit: 'suit' },
  { name: '서진', color: 0xfbf4e8, msg: '다음 생일에도 같이 불 켜자', outfit: 'party', acc: 'ribbon' },
];

// 파티장 상태
const ROOF_STATE = { owner: '민지', igniteAt: Date.now() + 3 * 86400_000, endAt: 0, isOwner: false, role: 'friend', hidden: [], thanks: null, candlesOut: false, spectator: false, self: false, canManage: false, listed: false, bots: 0, humans: null };
let serverOffset = 0;
const serverNow = () => Date.now() + serverOffset;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

// 파티장을 만든 사람의 관리 키: 링크(?h=)로 오거나, 만든 기기에 저장돼 있다
let HOST_KEY = QS.get('h') || (ROOM_ID ? store.get(`host:${ROOM_ID}`) : null);
// 내 생일 파티를 직접 연 사람은 목록에서 들어와도 주인공으로(이 기기에 저장된 입장 키)
if (!OWNER_KEY && ROOM_ID) OWNER_KEY = store.get(`owner:${ROOM_ID}`) || null;
if (QS.get('h') && ROOM_ID) store.set(`host:${ROOM_ID}`, QS.get('h'));
function authQuery() {
  const p = new URLSearchParams();
  if (OWNER_KEY) p.set('k', OWNER_KEY);
  if (HOST_KEY) p.set('h', HOST_KEY);
  const str = p.toString();
  return str ? `?${str}` : '';
}
const authBody = () => ({ k: OWNER_KEY || undefined, h: HOST_KEY || undefined });

// ── 렌더러 ──
const canvas = document.querySelector('#scene');
// 카카오톡 안 브라우저: 외부 브라우저로 여는 길을 안내한다(3D와 소리가 더 안정적)
if (/KAKAOTALK/i.test(navigator.userAgent)) {
  const bar = document.querySelector('#inapp');
  bar.hidden = false;
  bar.querySelector('[data-open]').addEventListener('click', () => {
    track('inapp_open_external');
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
  });
  bar.querySelector('[data-close]').addEventListener('click', () => { bar.hidden = true; });
}
function showGlFail(reason) {
  track('webgl_fail');
  reportError(`webgl: ${reason}`);
  const el = document.querySelector('#glfail');
  el.hidden = false;
  el.querySelector('[data-copy]')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); el.querySelector('.glfail-status').textContent = '주소를 복사했어요. Chrome이나 Safari에 붙여넣어 주세요.'; } catch { el.querySelector('.glfail-status').textContent = '주소창의 주소를 길게 눌러 복사해 주세요.'; }
  });
  document.querySelector('#boot')?.remove();
}
let renderer;
try {
  // 화면은 후처리(빛 번짐)를 거쳐 그려져서 기본 안티에일리어싱 버퍼는 쓰이지 않는다 → 끄면 휴대폰 메모리 절약
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  showGlFail(e.message);
  throw e; // 3D 없이는 파티장을 그릴 수 없어서 여기서 멈춘다
}
// 메모리가 부족한 폰에서 3D가 잠깐 꺼지면 되살리고, 안 되면 새로고침을 권한다
let glLostTimer = null;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setStatus('화면을 다시 불러오고 있어요…', 6000);
  glLostTimer = setTimeout(() => {
    reportError('webgl context lost (not restored)');
    openSheet('<h2>화면이 멈췄어요</h2><p class="sheet-lead">휴대폰 메모리가 부족해서 3D 화면이 꺼졌어요. 새로고침하면 다시 들어올 수 있어요.</p><button class="btn primary wide" onclick="location.reload()">새로고침</button>', { locked: true });
  }, 6000);
});
canvas.addEventListener('webglcontextrestored', () => { clearTimeout(glLostTimer); setStatus('화면을 되살렸어요', 2500); });
// 휴대폰(손가락 조작)은 1.5배까지만: 화면 점이 2배일 때보다 그릴 양이 약 44% 적고 눈으로는 차이가 거의 없다
const IS_TOUCH = window.matchMedia?.('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.info.autoReset = false; // 한 화면(여러 단계 합계)의 그리기 횟수를 재려고 직접 초기화
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

let world = buildWorld(scene, QS.get('venue') || DEFAULT_VENUE);
sound.setVenue(world.id);
const fill = new THREE.DirectionalLight(0xffe2c0, 0.9);
camera.add(fill);
fill.position.set(0.5, 1, 1);
fill.target.position.set(0, 0, -5);
camera.add(fill.target);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.72);
composer.addPass(bloomPass);

// 느린 기기에서는 해상도를 낮추고 빛 번짐을 끈다
const perf = { sum: 0, n: 0, level: 0 };
function adaptQuality(dt) {
  if (perf.level >= 3 || ignite || lite) return; // 점등(녹화) 중에는 해상도를 바꾸지 않는다
  perf.sum += dt;
  perf.n += 1;
  if (perf.n < 90) return;
  const avg = perf.sum / perf.n;
  perf.sum = 0;
  perf.n = 0;
  if (avg > 0.034) {
    perf.level += 1;
    if (perf.level === 1) renderer.setPixelRatio(1);
    if (perf.level === 2) bloomPass.enabled = false;
    // 그래도 버벅이면 가볍게 보기를 권한다(한 번만)
    if (perf.level === 3 && !sheet.classList.contains('open') && !song && !procession && !groupPhoto && MODE !== 'landing' && !store.get('lite-asked')) {
      store.set('lite-asked', true); // 기기마다 한 번만 묻는다
      openSheet('<h2>화면이 버벅이나요?</h2><p class="sheet-lead">이 휴대폰에서는 3D 화면이 무거울 수 있어요. 가볍게 보기로 바꾸면 등불 목록과 점등 소식만 보여요. 등불 달기와 선물은 그대로 할 수 있어요.</p><button class="btn primary wide" id="go-lite">가볍게 보기로 바꾸기</button>');
      sheetBody.querySelector('#go-lite').addEventListener('click', () => { closeSheet(); setLite(true); track('lite_on'); });
    }
    resize();
  }
}
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ── 사람(아바타) ──
const labelsEl = document.querySelector('#labels');
const people = [];
const peersById = new Map();

function addPerson(opts, pos, { isMe = false, isOwner = false, npc = false } = {}) {
  const av = createAvatar({ props: world.props, color: opts.color, hat: true, hatColor: isOwner ? 0xffd34d : opts.hatColor ?? HAT_COLORS[0], crown: isOwner, outfit: OUTFITS[opts.outfit] ? opts.outfit : DEFAULT_OUTFIT, accessory: ACCESSORIES[opts.acc] ? opts.acc : null });
  av.root.position.copy(pos);
  scene.add(av.root);
  const label = document.createElement('div');
  label.className = 'name-label' + (isMe ? ' is-me' : '') + (isOwner ? ' is-owner' : '');
  label.textContent = isOwner ? `주인공 ${opts.name}` : opts.name;
  labelsEl.appendChild(label);
  const p = { av, label, isMe, isOwner, npc, target: null, wait: Math.random() * 3, speed: 0, dirX: 0, net: null };
  people.push(p);
  return p;
}
function removePerson(p) {
  scene.remove(p.av.root);
  p.av.dispose?.();
  p.label.remove();
  people.splice(people.indexOf(p), 1);
}

let me = null;

// ── 등불 ──
const lanterns = [];
const lanternIds = new Set();
// 1순위 자리를 테이블에서 가까운 순으로 채운 뒤 2순위 자리를 채운다
let slots = [];
function computeSlots() {
  slots = world.lanternSlots
    .slice()
    .sort((a, b) => a.tier - b.tier || Math.hypot(a.pos.x, a.pos.z) - Math.hypot(b.pos.x, b.pos.z))
    .map((s) => s.pos);
}
computeSlots();

// 등불 모양은 한 번만 만들어 모든 등불이 같이 쓴다(종이+술 / 검은 뚜껑+끈 두 덩어리)
const LANTERN_GEO = (() => {
  const body = new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14, 1, true);
  const tassel = new THREE.ConeGeometry(0.035, 0.14, 6);
  tassel.rotateX(Math.PI);
  tassel.translate(0, -0.28, 0);
  const capT = new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12);
  capT.translate(0, 0.18, 0);
  const capB = new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12);
  capB.translate(0, -0.18, 0);
  const cord = new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4);
  cord.translate(0, 0.4, 0);
  return { paper: mergeGeometries([body, tassel]), dark: mergeGeometries([capT, capB, cord]) };
})();
const LANTERN_DARK = new THREE.MeshStandardMaterial({ color: 0x2a2238, roughness: 0.6 });
function lanternMesh(hex) {
  const g = new THREE.Group();
  const paperMat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(LANTERN_GEO.paper, paperMat), new THREE.Mesh(LANTERN_GEO.dark, LANTERN_DARK));
  g.userData.paperMat = paperMat;
  return g;
}

function removeLantern(id) {
  const i = lanterns.findIndex((l) => l.id === id);
  if (i < 0) return;
  const [l] = lanterns.splice(i, 1);
  scene.remove(l.mesh);
  l.mesh.userData.paperMat?.dispose(); // 등불 모양은 같이 쓰므로 종이 재료만 정리
  lanternIds.delete(id);
  if (bubbleFor === l) hideBubble();
  updateGoal();
}

// 등불에 붙는 관계 설명: "친구 · 함께한 지 10년"
function lanternMeta(l) {
  const rel = l.rel >= 0 ? LANTERN_RELATIONS[l.rel] : '';
  return [rel, l.years > 0 ? `함께한 지 ${l.years}년` : ''].filter(Boolean).join(' · ');
}

// 공동 목표: 등불이 GOAL_LANTERNS개 모이면 점등 때 유성우
function updateGoal() {
  const el = document.querySelector('#goal');
  if (!el) return;
  const done = typeof litLevel !== 'undefined' && (litLevel > 1 || ignite);
  if (MODE === 'landing' || done) { el.hidden = true; return; }
  el.hidden = false;
  const n = lanterns.length;
  el.classList.toggle('reached', n >= GOAL_LANTERNS);
  el.textContent = n >= GOAL_LANTERNS ? `등불 ${n}개 · 점등 때 유성우가 내려요` : `등불 ${n}/${GOAL_LANTERNS} · 다 모이면 유성우`;
}

function hangLantern({ id = null, name, msg, color, slot = lanterns.length, rel = -1, years = 0 }, { from = null } = {}) {
  if (id != null) {
    if (lanternIds.has(id)) return null;
    lanternIds.add(id);
  }
  const at = slots[slot % slots.length];
  const m = lanternMesh(color);
  m.position.copy(from || at);
  if (litLevel > 1) m.userData.paperMat.emissiveIntensity = 1.6;
  scene.add(m);
  const l = { id, mesh: m, slot: at.clone(), name, msg, rel, years, color, phase: Math.random() * 6, fly: from ? 0 : 1, from: from ? from.clone() : null };
  m.userData.lantern = l;
  lanterns.push(l);
  updateGoal();
  return l;
}

// 파티 장소 바꾸기: 방 정보가 도착했을 때, 또는 만들기 화면에서 장소를 미리 볼 때
function loadVenue(id) {
  const v = VENUES[id] ? id : DEFAULT_VENUE;
  if (world.id === v) return world;
  world.dispose();
  clearSpotLabels();
  world = buildWorld(scene, v);
  sound.setVenue(v);
  for (const p of people) p.av.setProps?.(world.props);
  computeSlots();
  lanterns.forEach((l, i) => {
    const at = slots[i % slots.length];
    l.slot = at.clone();
    if (l.fly >= 1) l.mesh.position.copy(at);
  });
  for (const p of people) collide(p.av.root.position);
  if (litLevel > 1) world.ignite?.(1);
  if (ROOF_STATE.candlesOut) world.setCandles(false);
  return world;
}

// ── 파티장 선물 ──
const gifts = createGiftLayer(scene, { onBurst: (pattern) => sound.pop(pattern), onCrackle: () => sound.crackle() });
const giftLabel = (g) => (g.anonymous || !g.name ? '누군가' : g.name);

// ── 조작 ──
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const joy = { x: 0, y: 0, active: false };
const joyEl = document.querySelector('#joystick');
const knob = joyEl.querySelector('.knob');
let joyId = null;
joyEl.addEventListener('pointerdown', (e) => {
  joyId = e.pointerId;
  joyEl.setPointerCapture(e.pointerId);
  joy.active = true;
  moveJoy(e);
});
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e) => {
  if (e.pointerId !== joyId) return;
  joyId = null;
  joy.active = false;
  joy.x = joy.y = 0;
  knob.style.transform = 'translate(-50%, -50%)';
};
joyEl.addEventListener('pointerup', endJoy);
joyEl.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2);
  let dy = e.clientY - (r.top + r.height / 2);
  const max = r.width * 0.36;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
  joy.x = dx / max;
  joy.y = dy / max;
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

let yaw = 0;
let dist = 9.5;
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pointers = new Map();
let dragStart = null;
let pinchStart = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, yaw, t: performance.now(), moved: 0 };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), dist };
    dragStart = null;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    dist = THREE.MathUtils.clamp(pinchStart.dist * (pinchStart.d / d), 5, 18);
  } else if (dragStart) {
    const dx = e.clientX - dragStart.x;
    dragStart.moved = Math.max(dragStart.moved, Math.abs(dx) + Math.abs(e.clientY - dragStart.y));
    yaw = dragStart.yaw - dx * 0.006;
  }
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (dragStart && dragStart.moved < 8 && performance.now() - dragStart.t < 400) onTap(e.clientX, e.clientY);
  dragStart = null;
});
canvas.addEventListener('wheel', (e) => {
  dist = THREE.MathUtils.clamp(dist + e.deltaY * 0.01, 5, 18);
}, { passive: true });

function onTap(x, y) {
  if (!me || ceremony) return;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const giftHits = ray.intersectObjects(gifts.pickables(), true);
  const hits = ray.intersectObjects(lanterns.map((l) => l.mesh), true);
  if (giftHits.length && (!hits.length || giftHits[0].distance < hits[0].distance)) {
    let o = giftHits[0].object;
    while (o && !o.userData.gift) o = o.parent;
    if (o) return showGift(o);
  }
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.lantern) o = o.parent;
    if (o) return showLantern(o.userData.lantern);
  }
  hideBubble();
  const fh = ray.intersectObject(world.floor);
  if (fh.length) {
    me.target = fh[0].point.clone().setY(0);
    showTapRing(me.target);
  }
}

const tapRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }));
tapRing.rotation.x = -Math.PI / 2;
tapRing.position.y = 0.02;
scene.add(tapRing);
let tapRingT = 0;
function showTapRing(p) { tapRing.position.set(p.x, 0.02, p.z); tapRingT = 1; }

// ── 이동 ──
// 걸어 다닐 수 있는 영역: 사각형(w, d) 또는 둥근 바닥(r)
function clampToBounds(p, extra = 0) {
  const b = world.bounds;
  if (b.r) {
    const r = b.r - 0.6 + extra;
    const d = Math.hypot(p.x, p.z);
    if (d > r) { p.x *= r / d; p.z *= r / d; }
    return;
  }
  // 사각형: 가운데 기준(w, d) 또는 한쪽으로 긴 배처럼 범위(minX~maxX, minZ~maxZ)
  const minX = (b.minX ?? -b.w / 2) + 0.6 - extra;
  const maxX = (b.maxX ?? b.w / 2) - 0.6 + extra;
  const minZ = (b.minZ ?? -b.d / 2) + 0.6 - extra;
  const maxZ = (b.maxZ ?? b.d / 2) - 0.6 + extra;
  p.x = THREE.MathUtils.clamp(p.x, minX, maxX);
  p.z = THREE.MathUtils.clamp(p.z, minZ, maxZ);
  world.clampExtra?.(p, extra); // 뱃머리처럼 모양이 특별한 곳
}
function collide(p) {
  clampToBounds(p);
  for (const o of world.obstacles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const d = Math.hypot(dx, dz);
    const r = o.r + 0.3;
    if (d < r && d > 0.0001) { p.x = o.x + (dx / d) * r; p.z = o.z + (dz / d) * r; }
  }
}

const camRight = new THREE.Vector3();
const camFwd = new THREE.Vector3();
function updateMe(dt) {
  let ix = 0;
  let iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iz += 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (joy.active) { ix += joy.x; iz += joy.y; }
  camFwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (Math.hypot(ix, iz) > 0.08) {
    me.target = null;
    move.addScaledVector(camRight, ix).addScaledVector(camFwd, -iz);
    if (move.length() > 1) move.normalize();
  } else if (me.target) {
    const d = me.target.clone().sub(me.av.root.position);
    if (d.length() < 0.15) me.target = null;
    else move.copy(d.normalize());
  }
  const zone = world.zoneAt?.(me.av.root.position);
  if (zone?.kind === 'slide') {
    // 얼음 위: 미끄러지듯 가속하고 천천히 멈춘다
    me.vel = me.vel || new THREE.Vector3();
    me.vel.addScaledVector(move, 7 * dt);
    me.vel.multiplyScalar(Math.max(0, 1 - 0.55 * dt));
    if (me.vel.length() > 5) me.vel.setLength(5);
    me.av.root.position.addScaledVector(me.vel, dt);
    move.copy(me.vel).multiplyScalar(0.25);
  } else {
    me.vel?.set(0, 0, 0);
    me.av.root.position.addScaledVector(move, 3.6 * dt);
  }
  collide(me.av.root.position);
  me.speed = Math.min(1, move.length());
  me.dirX = move.dot(camRight);
}

function updateNpc(p, dt) {
  if (!p.target) {
    p.wait -= dt;
    if (p.wait <= 0) {
      const spots = world.hotspots || [];
      if (MODE === 'demo' && spots.length && Math.random() < 0.35) {
        // 샘플의 친구들은 가끔 놀거리로 가서 직접 써 본다
        p.goal = spots[Math.floor(Math.random() * spots.length)];
        p.target = p.goal.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2));
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() < 0.4 ? 2.2 + Math.random() : 3 + Math.random() * (world.roam || 7);
        p.target = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      collide(p.target);
    }
    p.speed = 0;
    p.dirX = 0;
    // 서 있는 동안 가끔 동작(샘플 친구들)
    p.emoteT = (p.emoteT ?? 2 + Math.random() * 6) - dt;
    if (p.emoteT <= 0 && !ceremony && MODE === 'demo' && Math.random() < 0.25) {
      // 가끔 근처 친구와 같이 하는 동작
      const kinds = Object.keys(GROUP_MOTIONS);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const two = kind === 'highfive' || kind === 'hug';
      const others = nearbyFor(p, two ? 1 : 4).filter((q) => q.npc);
      if (others.length + 1 >= GROUP_MOTIONS[kind][1] && kind !== 'selfie') {
        const o0 = others[0].av.root.position;
        const pp = p.av.root.position;
        startGroupMotion(kind, p, others, { cx: two ? (pp.x + o0.x) / 2 : pp.x, cz: two ? (pp.z + o0.z) / 2 : pp.z, ang: Math.atan2(o0.z - pp.z, o0.x - pp.x), at: Date.now() + 200 });
        p.emoteT = 8 + Math.random() * 8;
        return;
      }
    }
    if (p.emoteT <= 0 && !ceremony) {
      p.emoteT = 5 + Math.random() * 8;
      const pick = EMOTES[Math.floor(Math.random() * EMOTES.length)][0];
      playEmote(p, pick);
    }
    return;
  }
  const d = p.target.clone().sub(p.av.root.position);
  if (d.length() < 0.2) {
    p.target = null;
    p.wait = 2 + Math.random() * 5;
    p.speed = 0;
    if (p.goal) { useHotspot(p.goal, p, { remote: true }); p.goal = null; }
    return;
  }
  d.normalize();
  p.av.root.position.addScaledVector(d, 1.6 * dt);
  collide(p.av.root.position);
  p.speed = 1;
  camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
  p.dirX = d.dot(camRight);
}

// 다른 사람: 서버 위치로 부드럽게 따라간다
function updatePeer(p, dt) {
  if (!p.net) return;
  const pos = p.av.root.position;
  const before = pos.clone();
  if (pos.distanceTo(p.net) > 6) pos.copy(p.net); // 순간이동처럼 멀리 뛰면 바로 옮긴다
  else pos.lerp(p.net, Math.min(1, dt * 8));
  const moved = before.distanceTo(pos) / Math.max(dt, 0.001);
  p.speed = moved > 0.4 ? 1 : 0;
  camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
  p.dirX = p.speed ? pos.clone().sub(before).normalize().dot(camRight) : 0;
}

// ── 점등 연출 ──
let ignite = null;
let litLevel = 0.18;
let ignitedThisSession = false;
let skyName = null;
const sparks = makeSparks();
scene.add(sparks.points);
const meteors = createMeteors(scene);
const confetti = createConfetti(scene);
const breath = createBreath(scene);
let photoPending = false; // 다음 화면을 그린 직후 기념사진용으로 베낀다
let photoShot = null;

function setSkyName(owner) {
  if (skyName) scene.remove(skyName);
  skyName = makeSkyName(['생일 축하해', owner]);
  if (world.skyNameY) skyName.position.y = world.skyNameY;
  if (world.skyNameZ) skyName.position.z = world.skyNameZ;
  scene.add(skyName);
}

function makeSkyName([line1, line2]) {
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 640;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const line = (text, size, y) => {
      g.font = `${size}px Jua, sans-serif`;
      // 1) 어두운 번짐으로 뒤의 전구 불빛과 떼어 놓고 2) 금빛 빛무리 3) 밝은 글자
      g.shadowColor = 'rgba(20,10,40,0.85)'; g.shadowBlur = 28; g.lineWidth = 14; g.strokeStyle = 'rgba(40,20,60,0.55)'; g.strokeText(text, 700, y);
      g.shadowColor = 'rgba(255,196,107,0.95)'; g.shadowBlur = 40; g.fillStyle = '#fff3d6'; g.fillText(text, 700, y);
      g.shadowBlur = 0; g.fillStyle = '#fffaf0'; g.fillText(text, 700, y);
    };
    line(line1, 170, 180);
    line(line2, 260, 450);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 4.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.position.set(0, 10, -4.5);
  m.renderOrder = 20;
  m.material.depthTest = false; // 돔 뼈대·돛대·전구 줄에 가려지지 않게
  return m;
}

function makeSparks() {
  const n = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = Array.from({ length: n }, () => new THREE.Vector3());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffd99a, size: 0.16, transparent: true, opacity: 0, depthWrite: false, fog: false });
  return {
    points: Object.assign(new THREE.Points(geo, mat), { frustumCulled: false }),
    burst() {
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 18;
        pos[i * 3 + 1] = 10.5 + (Math.random() - 0.5) * 2.5;
        pos[i * 3 + 2] = -6 + (Math.random() - 0.5) * 1.5;
        vel[i].set((Math.random() - 0.5) * 1.2, Math.random() * 1.5 - 0.4, (Math.random() - 0.5) * 1.2);
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1;
    },
    update(dt) {
      if (mat.opacity <= 0) return;
      for (let i = 0; i < n; i++) {
        vel[i].y -= dt * 0.6;
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = Math.max(0, mat.opacity - dt * 0.12);
    },
  };
}

function startIgnite(opts = {}) {
  if (ignite) return;
  if (!opts.replay && !lite) startCeremony('ignite'); // 다시 보기는 혼자 보는 것이라 대열 없이
  resetLights();
  // 화면 그리는 속도와 상관없이 실제 시간으로 진행(느린 휴대폰에서도 친구들과 같은 박자, 슬로모션 없음)
  ignite = { t: 0, start: performance.now(), clicked: new Set(), replay: !!opts.replay };
  ignitedThisSession = true;
  document.body.classList.add('is-igniting');
  sound.music('midnight', 'party'); // 점등 곡이 끝나면 파티 곡으로
  // 다시 보기는 처음 녹화한 진짜 점등 영상을 덮어쓰지 않는다(놓친 사람이면 다시 보기를 녹화)
  if (!lite && !(opts.replay && recorder.blob)) recorder.start();
  track('ignite_seen');
  document.querySelector('#goal').hidden = true;
  hideCta();
  setStatus('점등 시간이에요. 다 같이 불을 켜요');
}

function updateIgnite(dt) {
  if (!ignite) return;
  ignite.t = (performance.now() - ignite.start) / 1000;
  const t = ignite.t;
  const total = world.bulbs.length;
  world.hemi.intensity = THREE.MathUtils.lerp(world.hemi.intensity, t < 1.2 ? world.hemiBase * 0.4 : world.hemiBase * 0.83, dt * 3);
  world.ignite?.(t > 1.2 ? 1 : 0);
  for (const b of world.bulbs) {
    const on = t > 1.2 + (b.userData.order / total) * 3.4;
    b.material.emissiveIntensity = THREE.MathUtils.lerp(b.material.emissiveIntensity, on ? 3.2 : 0.05, Math.min(1, dt * (on ? 10 : 4)));
    if (on && !ignite.clicked.has(b.userData.order) && b.userData.order % 3 === 0) {
      ignite.clicked.add(b.userData.order);
      sound.click(b.userData.order / 3);
    }
  }
  for (const l of lanterns) {
    l.mesh.userData.paperMat.emissiveIntensity = THREE.MathUtils.lerp(l.mesh.userData.paperMat.emissiveIntensity, t > 4.4 ? 1.6 : 0.25, dt * 3);
  }
  if (t > 4.8 && !ignite.named) {
    ignite.named = true;
    gifts.launchPending(300);
    if (lanterns.length >= GOAL_LANTERNS) meteors.start(9); // 공동 목표 달성 보상
    sparks.burst();
    sound.swell();
    // 불이 켜지는 순간: 주인공은 한 바퀴 돌고 만세, 친구들은 차례로 뛰며 만세
    const lead = ceremonyLead();
    people.forEach((p, i) => setTimeout(() => {
      p.av.hop();
      if (p === lead) { p.av.gesture('spin'); setTimeout(() => p.av.gesture('cheer'), 950); } else p.av.gesture(i % 3 ? 'cheer' : 'clap');
    }, p === lead ? 0 : 150 + i * 90));
    const giftN = gifts.list.length;
    setStatus(`${ROOF_STATE.owner}의 생일이에요. ${josa([lanterns.length ? `등불 ${lanterns.length}개` : '', giftN ? `선물 ${giftN}개` : ''].filter(Boolean).join('와 ') || '파티장의 불', '이가')} 함께 켜졌어요`);
  }
  skyName.material.opacity = THREE.MathUtils.lerp(skyName.material.opacity, t > 4.8 ? 1 : 0, dt * 1.5);
  if (t > 6.8 && !ignite.photo) { ignite.photo = true; photoPending = true; } // 이름이 떠오른 장면을 기념사진으로
  if (t > 4.8) skyName.position.y = (world.skyNameY ?? 10) + Math.sin(t * 0.8) * 0.15;
  if (t > 14) {
    recorder.stop();
    ignite = null;
    setTimeout(() => endCeremony('ignite'), 800);
    litLevel = 3.2;
    document.body.classList.remove('is-igniting');
    afterIgnite();
  }
}

// 점등이 끝난 뒤: 기념사진 버튼, 주인공의 촛불 끄기, "내 파티 만들기" 안내
function afterIgnite() {
  addPhotoButton();
  if ((ROOF_STATE.isOwner || MODE === 'demo') && !ROOF_STATE.candlesOut) addCandleButton();
  setTimeout(showCta, ROOF_STATE.isOwner ? 9000 : 2500);
}

function resetLights() {
  for (const b of world.bulbs) b.material.emissiveIntensity = 0.18;
  for (const l of lanterns) l.mesh.userData.paperMat.emissiveIntensity = 0.55;
  if (skyName) skyName.material.opacity = 0;
}

function setLitInstantly() {
  litLevel = 3.2;
  world.ignite?.(1);
  for (const l of lanterns) l.mesh.userData.paperMat.emissiveIntensity = 1.6;
}

// ── 공통 UI ──
const statusEl = document.querySelector('#status');
let statusTimer = null;
function setStatus(text, ms = 5200) {
  statusEl.textContent = text;
  statusEl.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), ms);
}

const sheet = document.querySelector('#sheet');
const sheetBody = sheet.querySelector('.sheet-body');
let sheetLocked = false;
function openSheet(html, { locked = false } = {}) {
  sheetLocked = locked;
  sheet.classList.toggle('locked', locked);
  sheetBody.innerHTML = html;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
}
function closeSheet() {
  sheet.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; }, 220);
}
sheet.addEventListener('click', (e) => {
  if (sheetLocked) return;
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex6 = (n) => '#' + n.toString(16).padStart(6, '0');

async function copyText(text, statusNode) {
  try {
    await navigator.clipboard.writeText(text);
    if (statusNode) statusNode.textContent = '링크를 복사했어요.';
    return true;
  } catch {
    if (statusNode) statusNode.textContent = '링크를 길게 눌러 복사해주세요.';
    return false;
  }
}

const igniteBtn = document.querySelector('#btn-ignite');
const countEl = document.querySelector('#count');
// 휴대폰에서 안내 문구를 제목(이름·날짜·목표) 바로 아래에 놓기 위해 제목 칸의 아래 끝을 CSS에 알려준다
{
  const titleEl = document.querySelector('.topbar .title');
  const setHudTop = () => document.documentElement.style.setProperty('--hud-top', `${Math.round(titleEl.getBoundingClientRect().bottom + 8)}px`);
  if (titleEl && 'ResizeObserver' in window) new ResizeObserver(setHudTop).observe(titleEl);
  addEventListener('resize', () => titleEl && setHudTop());
}

const soundBtn = document.querySelector('#btn-sound');
soundBtn.addEventListener('click', async () => {
  const on = await sound.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.querySelector('span').textContent = on ? '소리 끄기' : '소리 켜기';
});

const bubble = document.querySelector('#bubble');
let bubbleFor = null;
let bubbleY = 0.45;
const canHide = () => ROOF_STATE.canManage || (ROOF_STATE.role === 'owner' && serverNow() >= ROOF_STATE.igniteAt - 15_000);
function showGift(group) {
  const g = group.userData.gift;
  bubbleFor = { mesh: group };
  bubbleY = 3.2;
  bubble.innerHTML = '<p class="bubble-msg"></p><p class="bubble-from"></p>';
  bubble.querySelector('.bubble-msg').textContent = `${GIFT_ITEMS[g.item].name}`;
  bubble.querySelector('.bubble-from').textContent = `${josa(giftLabel(g), '이가')} 보낸 선물`;
  bubble.hidden = false;
  sound.paper();
}
function showLantern(l) {
  bubbleFor = l;
  bubbleY = 0.45;
  bubble.innerHTML = '<p class="bubble-msg"></p><p class="bubble-from"></p>';
  bubble.querySelector('.bubble-msg').textContent = l.msg;
  bubble.querySelector('.bubble-from').textContent = [`${l.name}의 등불`, lanternMeta(l)].filter(Boolean).join(' · ');
  if (MODE === 'room' && l.id != null) {
    const act = document.createElement('button');
    act.className = 'bubble-act';
    act.textContent = canHide() ? '이 등불 숨기기' : '신고';
    act.addEventListener('click', async () => {
      act.disabled = true;
      try {
        if (canHide()) {
          await api(`/api/rooftops/${ROOM_ID}/lanterns/${l.id}/hide`, { method: 'POST', body: authBody() });
          removeLantern(l.id);
          if (ROOF_STATE.role === 'host' && !ROOF_STATE.hidden.some((h) => h.id === l.id)) ROOF_STATE.hidden.push({ id: l.id, name: l.name, msg: l.msg });
          setStatus('등불을 숨겼어요.');
        } else {
          const r = await api(`/api/rooftops/${ROOM_ID}/lanterns/${l.id}/report`, { method: 'POST', body: {} });
          act.textContent = r.already ? '이미 신고했어요' : '신고했어요';
        }
      } catch (err) {
        act.textContent = err.message;
      }
    });
    bubble.appendChild(act);
  }
  bubble.hidden = false;
  sound.paper();
}
function hideBubble() { bubble.hidden = true; bubbleFor = null; }

document.querySelector('#btn-support').addEventListener('click', () => {
  openSheet(`
    <h2>전구 보태기</h2>
    <p class="sheet-lead">오늘의 주인공은 누구나 무료로 열 수 있어요. 전구값을 조금 보태주시면 다음 파티장을 켜는 데 써요.</p>
    <div class="qr-slot" role="img" aria-label="카카오페이 송금 QR이 들어갈 자리">카카오페이 송금 QR<br><small>이미지를 넣을 자리예요</small></div>
    <button class="btn wide" data-close>닫기</button>
    <p class="legal-links"><a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="/terms" target="_blank" rel="noopener">이용약관</a></p>`);
});

// 날짜 표시(한국 시간)
function kstParts(ms) {
  const d = new Date(ms + KST);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function countdownText() {
  const left = ROOF_STATE.igniteAt - serverNow();
  const label = revealLabel(ROOF_STATE.igniteAt);
  if (left <= 0) {
    // 점등 뒤: 닫히는 시각을 알린다(마지막 10분은 초 단위)
    const close = Math.floor((ROOF_STATE.endAt - serverNow()) / 1000);
    if (ROOF_STATE.endAt && close <= 600 && close > 0) return `파티장이 ${mmss(close)} 뒤에 닫혀요`;
    return `${label} · 오늘 생일이에요`;
  }
  const s = Math.floor(left / 1000);
  if (s >= 86400) return `${label}까지 ${Math.floor(s / 86400)}일 ${Math.floor((s % 86400) / 3600)}시간`;
  if (s >= 3600) return `점등까지 ${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  return `점등까지 ${mmss(s)}`;
}

// 하루짜리 파티장: 닫히기 2시간 전부터 예고하고, 닫히면 마무리 화면을 띄운다
let closeNoticeShown = false;
function checkClosing() {
  if (MODE !== 'room' || !ROOF_STATE.endAt) return;
  const left = ROOF_STATE.endAt - serverNow();
  const banner = document.querySelector('#closing');
  if (left <= 0) return showEnded();
  if (left <= 2 * 3600_000 && serverNow() >= ROOF_STATE.igniteAt) {
    banner.hidden = false;
    const d = new Date(ROOF_STATE.endAt + KST);
    const closeTime = `${d.getUTCHours()}시${d.getUTCMinutes() ? ` ${d.getUTCMinutes()}분` : ''}`;
    banner.textContent = left <= 600_000 ? `파티장이 ${mmss(Math.floor(left / 1000))} 뒤에 닫혀요. 기억 카드와 기념사진을 저장해 두세요` : `이 파티장은 ${closeTime}에 닫혀요. 등불과 선물도 함께 사라져요`;
    if (!closeNoticeShown) {
      closeNoticeShown = true;
      setStatus('파티장이 곧 닫혀요. 닫히면 등불과 선물이 모두 사라지니 등불 모아보기에서 기억 카드를 저장해 두세요', 7000);
    }
  }
}
let endedShown = false;
function showEnded() {
  if (endedShown) return;
  endedShown = true;
  sound.music(null);
  sound.closing();
  conn?.close();
  openSheet(`
    <h2>파티장이 닫혔어요</h2>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}의 생일 파티가 끝났어요. 함께해 준 모든 분께 고마워요. 등불과 선물은 약속대로 모두 지웠어요.</p>
    ${lanterns.length ? '<button class="btn wide" id="ended-memory">기억 카드 저장 (등불 전부 한 장에)</button>' : ''}
    ${photoShot ? '<button class="btn wide" id="ended-photo">기념사진 저장</button>' : ''}
    <a class="btn primary wide" id="ended-cta" href="/?ref=${esc(ROOM_ID || '')}">내 생일 파티 만들기</a>`, { locked: true });
  sheetBody.querySelector('#ended-photo')?.addEventListener('click', savePhoto);
  sheetBody.querySelector('#ended-memory')?.addEventListener('click', (e) => saveMemoryCard(e.currentTarget));
  sheetBody.querySelector('#ended-cta').addEventListener('click', () => track('cta_click'));
}

// ── 등불 달기(공통 시트) ──
function openLanternSheet(onSubmit, defaultName) {
  const tpls = LANTERN_TEMPLATES.map((_, i) => renderTemplate(i, ROOF_STATE.owner));
  openSheet(`
    <h2>등불 달기</h2>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}에게 전할 말을 골라주세요. 등불은 점등 때 다 같이 켜져요.</p>
    <form id="lantern-form">
      <label class="field"><span>내 이름</span><input id="lantern-name" name="name" maxlength="10" required placeholder="예: 수아" value="${esc(defaultName || '')}"></label>
      <fieldset class="templates"><legend>전할 말</legend>
        ${tpls.map((t, i) => `<label class="tpl"><input type="radio" name="tpl" value="${i}" ${i === 0 ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}
      </fieldset>
      <fieldset class="templates rels"><legend>${esc(ROOF_STATE.owner)}와의 사이 (고르지 않아도 돼요)</legend>
        ${LANTERN_RELATIONS.map((r, i) => `<label class="tpl"><input type="radio" name="rel" value="${i}"><span>${esc(r)}</span></label>`).join('')}
      </fieldset>
      <label class="field"><span>함께한 시간</span><select id="lantern-years" name="years"><option value="0">고르지 않을게요</option>${Array.from({ length: MAX_YEARS }, (_, i) => `<option value="${i + 1}">${i + 1}년</option>`).join('')}</select></label>
      <fieldset class="swatches"><legend>등불 색</legend>
        ${LANTERN_COLORS.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c.hex}" ${i === 0 ? 'checked' : ''}><span style="--c:${hex6(c.hex)}" aria-label="${c.name}"></span></label>`).join('')}
      </fieldset>
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">이 등불 달기</button>
    </form>`);
  const form = document.querySelector('#lantern-form');
  form.addEventListener('input', () => { form.querySelector('.form-error').textContent = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nc = validateName(fd.get('name'));
    if (!nc.ok) { form.querySelector('.form-error').textContent = nc.error; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '등불 다는 중…';
    try {
      const tpl = Number(fd.get('tpl'));
      const rel = fd.get('rel') === null ? -1 : Number(fd.get('rel'));
      await onSubmit({ name: nc.value, tpl, msg: tpls[tpl], color: Number(fd.get('color')), rel, years: Number(fd.get('years')) || 0 });
      closeSheet();
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = '이 등불 달기';
    }
  });
}

function afterHang() {
  sound.lanternUp(true);
  me?.av.hop();
  setStatus(`등불을 달았어요. 지금 ${lanterns.length}개의 등불이 ${josa(ROOF_STATE.owner, '을를')} 기다려요`);
}

// ── 점등 영상 ──
const recorder = createRecorder(canvas, () => (sound.enabled ? sound.stream() : null), () => showVideoButton());
async function saveIgniteVideo() {
  if (!recorder.blob) return;
  const r = await saveVideo(recorder.blob, `today-hero.${recorder.ext}`);
  if (r === 'downloaded') setStatus('점등 영상을 저장했어요. 스토리에 올려보세요');
}
function showVideoButton() {
  setStatus("점등 영상이 준비됐어요. '사진·영상'에서 저장해 스토리에 올려보세요", 6000);
}

// ── 점등 알림: 휴대폰 알림(30분·5분 전) 또는 캘린더 ──
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_STANDALONE = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function subscribePush() {
  const reg = await navigator.serviceWorker.register('/sw.js');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('알림이 꺼져 있어요. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.');
  const { key } = await api('/api/push/key');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  await api(`/api/rooftops/${ROOM_ID}/push`, { method: 'POST', body: { sub: sub.toJSON(), ...authBody() } });
  store.set(`push:${ROOM_ID}`, true);
}
function downloadCalendar() {
  const blob = calendarFile({ title: `${ROOF_STATE.owner}의 생일 파티 점등`, url: `${location.origin}/r/${ROOM_ID}`, at: ROOF_STATE.igniteAt });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'today-hero-ignite.ics';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  track('calendar_click');
}
function openReminder() {
  const done = store.get(`push:${ROOM_ID}`);
  const iosGuide = IS_IOS && !IS_STANDALONE;
  const pushPart = done
    ? '<p class="sheet-lead">이 기기로 점등 30분 전, 5분 전에 알림이 와요.</p>'
    : iosGuide
      ? '<div class="link-card"><p class="link-title">아이폰에서 알림 받기</p><p class="link-desc">아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있어요. 아래쪽 공유 버튼 → "홈 화면에 추가"를 누르고, 홈 화면의 "오늘의 주인공"으로 다시 열어서 이 버튼을 눌러주세요. (iOS 16.4 이상)</p></div>'
      : pushSupported()
        ? '<button class="btn primary wide" id="push-on">휴대폰 알림 받기 (점등 30분·5분 전)</button>'
        : '<p class="sheet-lead">이 브라우저는 알림을 지원하지 않아요. 캘린더에 넣어 두세요.</p>';
  openSheet(`<h2>점등 알림</h2><p class="sheet-lead">${revealLabel(ROOF_STATE.igniteAt)}에 다 같이 불을 켜요. 잊지 않게 알려드릴게요.</p>
    ${pushPart}
    <button class="btn wide" id="cal-on">캘린더에 넣기 (10분 전 알림)</button>
    <p class="form-error" role="alert"></p>
    <p class="legal-links">알림 신청 정보는 파티장이 닫힐 때 함께 지워요.</p>`);
  sheetBody.querySelector('#push-on')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = '신청하는 중…';
    try {
      await subscribePush();
      b.textContent = '알림을 신청했어요';
      setStatus('점등 30분 전과 5분 전에 알림이 와요');
    } catch (err) {
      sheetBody.querySelector('.form-error').textContent = err.message || '알림을 신청하지 못했어요.';
      b.disabled = false;
      b.textContent = '휴대폰 알림 받기 (점등 30분·5분 전)';
    }
  });
  sheetBody.querySelector('#cal-on').addEventListener('click', () => { downloadCalendar(); setStatus('캘린더에 추가하면 점등 10분 전에 알려드려요'); });
}
function addCalendarButton() {
  if (document.querySelector('#btn-calendar')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-calendar';
  btn.className = 'btn';
  btn.textContent = '점등 알림';
  document.querySelector('.actions').insertBefore(btn, igniteBtn);
  btn.addEventListener('click', openReminder);
}

// ── 등불 다시 불러오기(숨김 해제 등) ──
async function refreshLanterns() {
  try {
    const d = await api(`/api/rooftops/${ROOM_ID}${authQuery()}`);
    if (d.role === 'host') ROOF_STATE.hidden = d.lanterns.filter((l) => l.hidden);
    for (const l of d.lanterns) if (!l.hidden) hangLantern(l);
  } catch { /* 다음 이벤트 때 다시 */ }
}

// ── 오른쪽 위 버튼: 자주 쓰는 것만 바로 보이고 나머지는 '메뉴'에 모은다(작은 휴대폰에서 아래 버튼과 겹치지 않게) ──
const MENU_BUTTONS = new Set(['btn-manage', 'btn-group', 'btn-lite']);
function topMenu() {
  let panel = document.querySelector('#top-more');
  if (panel) return panel;
  const wrap = document.createElement('div');
  wrap.className = 'top-more-wrap';
  wrap.innerHTML = '<button id="btn-more" class="icon-btn" aria-expanded="false" aria-controls="top-more"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>메뉴</span></button><div id="top-more" hidden></div>';
  document.querySelector('.top-right').appendChild(wrap);
  panel = wrap.querySelector('#top-more');
  const more = wrap.querySelector('#btn-more');
  const setOpen = (open) => { panel.hidden = !open; more.setAttribute('aria-expanded', String(open)); };
  more.addEventListener('click', (e) => { e.stopPropagation(); setOpen(panel.hidden); });
  panel.addEventListener('click', (e) => { if (e.target.closest('button')) setOpen(false); });
  document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !wrap.contains(e.target)) setOpen(false); });
  return panel;
}
function placeTopButton(btn) {
  if (MENU_BUTTONS.has(btn.id)) { topMenu().appendChild(btn); return; }
  const right = document.querySelector('.top-right');
  const wrap = right.querySelector('.top-more-wrap');
  if (wrap) right.insertBefore(btn, wrap); else right.appendChild(btn);
}

// ── 가상 응원단: 파티장을 연 사람이 보낸 가상 친구. 모두의 화면에서 돌아다니고 점등식·단체 사진에도 함께한다 ──
const botIds = new Set();
function addBots(list) {
  for (const b of list) {
    if (botIds.has(b.id)) continue;
    botIds.add(b.id);
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 4;
    const p = addPerson({ name: b.name, color: b.color, hatColor: HAT_COLORS[(b.hat || 0) % 4], outfit: b.outfit, acc: b.acc }, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), { npc: true });
    p.bot = true;
    p.label.classList.add('is-bot');
    p.wait = Math.random() * 3;
  }
  ROOF_STATE.bots = botIds.size;
  renderCount();
}
function renderCount() {
  if (MODE !== 'room' || ROOF_STATE.humans == null) return;
  countEl.textContent = `함께 있는 친구 ${ROOF_STATE.humans}명${ROOF_STATE.bots ? ` · 응원단 ${ROOF_STATE.bots}` : ''}${ROOF_STATE.watching ? ` · 구경 ${ROOF_STATE.watching}명` : ''}`;
}

// ── 만든 사람의 관리 화면 ──
function addManageButton() {
  if (document.querySelector('#btn-manage')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-manage';
  btn.className = 'icon-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg><span>현황·관리</span>';
  placeTopButton(btn);
  btn.addEventListener('click', openManage);
}

// 준비 현황판: 숫자와 함께 지금 하면 좋은 일을 알려준다
function boardHtml(d) {
  const nL = d.lanterns.filter((l) => !l.hidden).length;
  const senders = new Set(d.lanterns.map((l) => l.name)).size;
  const left = d.igniteAt - serverNow();
  const before = left > 0;
  const hours = Math.floor(left / 3600_000);
  const tips = [];
  if (before && !d.ownerSeen) tips.push([`${josa(ROOF_STATE.owner, '이가')} 아직 주인공 링크를 열지 않았어요. 점등 시각을 알 수 있게 미리 보내주세요.`, 'owner']);
  if (before && nL < 5) tips.push(['등불이 아직 적어요. 단톡방에 친구 링크를 한 번 더 올려보세요.', 'friend']);
  else if (before && nL < GOAL_LANTERNS) tips.push([`등불 ${GOAL_LANTERNS}개를 모으면 점등 때 유성우가 내려요. ${GOAL_LANTERNS - nL}개 남았어요.`, 'friend']);
  if (before && left < 3 * 3600_000) tips.push(['곧 점등이에요. 친구들에게 점등 시각에 다시 들어오라고 알려주세요.', 'friend']);
  if (!tips.length) tips.push([before ? '준비가 잘 되고 있어요. 점등 시각에 다 같이 모여요.' : '점등이 끝났어요. 기억 카드를 저장해 두세요.', '']);
  const stat = (n, label) => `<div class="board-stat"><b>${n}</b><span>${label}</span></div>`;
  return `<div class="board-stats">${stat(nL, '등불')}${stat(senders, '보낸 친구')}${stat(d.gifts.length, '선물')}${stat(d.online, '지금 접속')}</div>
    <p class="board-when">${before ? (hours >= 1 ? `점등까지 ${hours}시간` : `점등까지 ${Math.max(1, Math.ceil(left / 60000))}분`) : '점등이 끝났어요'} · 주인공 링크 ${d.ownerSeen ? '열어봄' : '아직 안 열어봄'}</p>
    <ul class="board-tips">${tips.map(([t, link]) => `<li>${esc(t)}${link ? ` <button type="button" class="link-btn" data-copy-tip="${link}">${link === 'owner' ? '주인공 링크 복사' : '친구 링크 복사'}</button>` : ''}</li>`).join('')}</ul>`;
}
async function refreshBoard() {
  const el = sheetBody.querySelector('.board');
  if (!el) return;
  try {
    const d = await api(`/api/rooftops/${ROOM_ID}${authQuery()}`);
    el.innerHTML = boardHtml(d);
    el.querySelectorAll('[data-copy-tip]').forEach((b) => b.addEventListener('click', async () => {
      const base = `${location.origin}/r/${ROOM_ID}`;
      const url = b.dataset.copyTip === 'owner' ? `${base}?k=${ROOF_STATE.keys.ownerKey}` : base;
      b.textContent = (await copyText(url)) ? '복사했어요' : '복사하지 못했어요';
    }));
  } catch { el.innerHTML = '<p class="sheet-lead">현황을 불러오지 못했어요.</p>'; }
}

function openManage() {
  const base = `${location.origin}/r/${ROOM_ID}`;
  const links = ROOF_STATE.self ? [
    ['manage-friend', '친구 초대 링크', base],
    ['manage-owner', '내 입장 링크 (나만 보관)', `${base}?k=${ROOF_STATE.keys.ownerKey}`],
  ] : [
    ['manage-friend', '친구 링크', base],
    ['manage-owner', `${ROOF_STATE.owner}에게 보낼 링크`, `${base}?k=${ROOF_STATE.keys.ownerKey}`],
    ['manage-host', '내 관리 링크', `${base}?h=${ROOF_STATE.keys.hostKey}`],
  ];
  const botsLeft = MAX_BOTS - ROOF_STATE.bots;
  const hidden = ROOF_STATE.hidden;
  openSheet(`
    <h2>준비 현황 · 관리</h2>
    <p class="sheet-lead">이 화면은 파티장을 연 사람에게만 보여요.</p>
    <div class="board" aria-live="polite"><p class="sheet-lead">현황을 불러오는 중…</p></div>
    <h3 class="sheet-sub">가상 응원단 보내기 <small>${ROOF_STATE.bots}/${MAX_BOTS}명</small></h3>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}의 파티가 외롭지 않게 가상 친구를 보내요. 응원단은 파티장을 돌아다니고, 한 명마다 등불을 하나씩 달아요. 등불이 ${GOAL_LANTERNS}개 모이면 점등 때 모두가 유성우를 봐요. 이름 앞에 '응원단'이 붙어서 진짜 친구와 구분돼요.</p>
    <div class="bot-row">${[3, 5, 10].map((n) => `<button type="button" class="btn" data-bots="${n}"${botsLeft <= 0 ? ' disabled' : ''}>+${Math.min(n, Math.max(botsLeft, 0)) || n}명</button>`).join('')}</div>
    <label class="check list-toggle"><input type="checkbox" id="manage-listed"${ROOF_STATE.listed ? ' checked' : ''}> 파티장 목록에 보이기 <small>(누구나 첫 화면에서 골라 들어올 수 있어요)</small></label>
    ${links.map(([id, label, url]) => `
      <div class="link-card"><p class="link-title">${esc(label)}</p>
        <input id="${id}" readonly value="${esc(url)}"><button class="btn" data-copy="${id}">복사</button></div>`).join('')}
    <p class="copy-status" role="status"></p>
    <h3 class="sheet-sub">숨긴 등불 ${hidden.length}개</h3>
    ${hidden.length ? `<ul class="hidden-list">${hidden.map((l) => `<li><span><b>${esc(l.name)}</b> ${esc(l.msg)}</span><button class="btn" data-show="${l.id}">다시 보이기</button></li>`).join('')}</ul>` : '<p class="sheet-lead">숨긴 등불이 없어요. 등불을 누르면 숨길 수 있어요.</p>'}
    <h3 class="sheet-sub">파티장 지우기</h3>
    <p class="sheet-lead">등불이 모두 지워지고 되돌릴 수 없어요.</p>
    <button class="btn wide danger" id="delete-roof">이 파티장 지우기</button>
    <p class="form-error" role="alert"></p>`);
  refreshBoard();
  sheetBody.querySelectorAll('[data-bots]').forEach((b) => b.addEventListener('click', async () => {
    sheetBody.querySelectorAll('[data-bots]').forEach((x) => { x.disabled = true; });
    try {
      const r = await api(`/api/rooftops/${ROOM_ID}/bots`, { method: 'POST', body: { ...authBody(), count: Number(b.dataset.bots) } });
      setStatus(`응원단이 왔어요! 지금 응원단 ${r.bots.length}명이 함께해요`);
      track('bots_added');
      closeSheet();
    } catch (err) {
      sheetBody.querySelector('.form-error').textContent = err.message;
      sheetBody.querySelectorAll('[data-bots]').forEach((x) => { x.disabled = false; });
    }
  }));
  sheetBody.querySelector('#manage-listed')?.addEventListener('change', async (e) => {
    try {
      const r = await api(`/api/rooftops/${ROOM_ID}/listing`, { method: 'POST', body: { ...authBody(), listed: e.target.checked } });
      ROOF_STATE.listed = r.listed;
      setStatus(r.listed ? '파티장 목록에 보여요' : '이제 링크로만 들어올 수 있어요');
    } catch (err) { e.target.checked = !e.target.checked; sheetBody.querySelector('.form-error').textContent = err.message; }
  });
  sheetBody.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.copy);
    input.select();
    copyText(input.value, sheetBody.querySelector('.copy-status'));
  }));
  sheetBody.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      await api(`/api/rooftops/${ROOM_ID}/lanterns/${b.dataset.show}/show`, { method: 'POST', body: authBody() });
      ROOF_STATE.hidden = ROOF_STATE.hidden.filter((l) => String(l.id) !== b.dataset.show);
      b.closest('li').remove();
      refreshLanterns();
    } catch (err) {
      b.textContent = err.message;
    }
  }));
  const del = sheetBody.querySelector('#delete-roof');
  let armed = false;
  del.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      del.textContent = '정말 지울게요 (한 번 더 누르기)';
      return;
    }
    del.disabled = true;
    try {
      await api(`/api/rooftops/${ROOM_ID}`, { method: 'DELETE', body: authBody() });
      store.set(`host:${ROOM_ID}`, null);
      openSheet('<h2>파티장을 지웠어요</h2><p class="sheet-lead">등불이 모두 지워졌어요.</p><a class="btn primary wide" href="/">새 파티장 만들기</a>', { locked: true });
    } catch (err) {
      sheetBody.querySelector('.form-error').textContent = err.message;
      del.disabled = false;
    }
  });
}

// ── 선물하기 ──
const won = (n) => `${n.toLocaleString('ko-KR')}원`;
function giftSummary() {
  const c = {};
  for (const g of gifts.list) c[g.item] = (c[g.item] || 0) + 1;
  const parts = Object.entries(GIFT_ITEMS).filter(([k]) => c[k]).map(([k, v]) => `${v.name} ${c[k]}`);
  return parts.length ? `이 파티장에 온 선물: ${parts.join(', ')}` : '아직 온 선물이 없어요. 첫 선물을 보내보세요.';
}
function openGiftSheet(send, defaultName) {
  const colors = [0xf29bb3, 0x8fd3c1, 0xffc46b, 0xb9a6f2, 0xfbf4e8];
  openSheet(`
    <h2>선물하기</h2>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}의 파티장에 선물을 놓아요. ${esc(giftSummary())}</p>
    <form id="gift-form">
      <fieldset class="gift-items"><legend>선물</legend>
        ${Object.entries(GIFT_ITEMS).map(([k, v], i) => `
          <label class="gift-item"><input type="radio" name="item" value="${k}" ${i === 0 ? 'checked' : ''}>
            <span><b>${esc(v.name)}</b><em>${PAYMENT_MODE === 'free' ? '무료' : won(v.price)}</em><small>${esc(v.desc)}</small></span></label>`).join('')}
      </fieldset>
      <fieldset class="swatches"><legend>색</legend>
        ${colors.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><span style="--c:${hex6(c)}" aria-label="색 ${i + 1}"></span></label>`).join('')}
      </fieldset>
      <label class="field"><span>보내는 사람</span><input id="gift-name" name="name" maxlength="10" placeholder="예: 수아" value="${esc(defaultName || '')}"></label>
      <label class="check"><input id="gift-anon" type="checkbox" name="anonymous"> 익명으로 보내기 (이름 대신 "누군가"로 보여요)</label>
      ${PAYMENT_MODE === 'free' ? '<p class="test-note">지금은 모든 선물을 무료로 보낼 수 있어요. 10분에 10개까지 보낼 수 있어요.</p>' : ''}
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">${PAYMENT_MODE === 'free' ? '선물하기' : '결제하고 선물하기'}</button>
      <p class="legal-links">선물은 파티장을 꾸미는 디지털 선물이에요. 현금으로 바꿀 수 없어요.<br><button type="button" class="link-btn" id="open-support">서비스에 전구 보태기</button></p>
    </form>`);
  document.querySelector('#open-support').addEventListener('click', () => document.querySelector('#btn-support').click());
  const form = document.querySelector('#gift-form');
  const nameInput = form.querySelector('#gift-name');
  const anon = form.querySelector('#gift-anon');
  anon.addEventListener('change', () => { nameInput.disabled = anon.checked; });
  form.addEventListener('input', () => { form.querySelector('.form-error').textContent = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const item = fd.get('item');
    const body = { item, name: (nameInput.value || '').trim(), anonymous: anon.checked, color: Number(fd.get('color')) };
    if (!body.anonymous) {
      const nc = validateName(body.name);
      if (!nc.ok) { form.querySelector('.form-error').textContent = `${nc.error} 이름 없이 보내려면 익명으로 보내기를 골라주세요.`; return; }
      body.name = nc.value;
    } else body.name = '';
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '선물 보내는 중…';
    try {
      const gift = await send(body);
      closeSheet();
      onGiftArrived(gift, true);
      me?.av.hop();
      setStatus(`${josa(GIFT_ITEMS[item].name, '을를')} 보냈어요${body.anonymous ? '. 익명으로 보여요' : ''}`);
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = PAYMENT_MODE === 'free' ? '선물하기' : '결제하고 선물하기';
    }
  });
}
function giftSpot() {
  // 풍선은 보내는 사람 옆 빈 곳에 놓는다
  const p = me ? me.av.root.position : new THREE.Vector3();
  const a = Math.random() * Math.PI * 2;
  const spot = new THREE.Vector3(p.x + Math.cos(a) * 1.4, 0, p.z + Math.sin(a) * 1.4);
  collide(spot);
  return spot;
}
function onGiftArrived(gift, animate) {
  const added = gifts.add(gift, { from: animate });
  if (!added) return;
  sound.gift(gift.item);
  if (gift.item === 'fireworks' && (MODE === 'demo' ? litLevel > 1 : serverNow() >= ROOF_STATE.igniteAt)) gifts.launchNow(gift);
}
function wireGiftButton(send, defaultName) {
  const btn = document.createElement('button');
  btn.id = 'btn-gift';
  btn.className = 'btn';
  btn.textContent = '선물하기';
  document.querySelector('.actions').insertBefore(btn, document.querySelector('#btn-lantern'));
  btn.addEventListener('click', () => openGiftSheet(send, defaultName()));
}
let demoGiftId = 1000;

// ── 등불 모아보기(편지함) ──
function addTopButton(id, label, svg, onClick) {
  if (document.querySelector(`#${id}`)) return document.querySelector(`#${id}`);
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = 'icon-btn';
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg><span>${label}</span>`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  placeTopButton(btn);
  btn.addEventListener('click', onClick);
  return btn;
}
function wireLettersButton() {
  const btn = addTopButton('btn-letters', '등불 모아보기', '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>', openLetters);
  const refresh = () => { btn.querySelector('span').textContent = `등불 ${lanterns.length}`; };
  refresh();
  setInterval(refresh, 1500);
}
function openLetters() {
  track('letters_open');
  const list = lanterns.slice();
  const ownerAfter = ROOF_STATE.isOwner && serverNow() >= ROOF_STATE.igniteAt;
  openSheet(`
    <h2>등불 모아보기</h2>
    <p class="sheet-lead">${list.length ? `${josa(ROOF_STATE.owner, '을를')} 위해 등불 ${list.length}개가 걸렸어요.` : '아직 걸린 등불이 없어요. 첫 등불을 달아주세요.'}</p>
    ${ownerAfter ? `<div class="thanks-box"><p class="link-title">친구들에게 고마움 전하기</p>
      <div class="templates">${THANKS_TEMPLATES.map((t, i) => `<button type="button" class="tpl-btn" data-thanks="${i}">${esc(t)}</button>`).join('')}</div>
      <p class="copy-status" role="status">${ROOF_STATE.thanks ? `보낸 답례: ${esc(ROOF_STATE.thanks)}` : ''}</p></div>` : ''}
    <ul class="letters">${list.map((l, i) => `
      <li><i style="--c:${hex6(l.color)}" aria-hidden="true"></i>
        <div><p class="letter-msg">${esc(l.msg)}</p><p class="letter-from">${esc(l.name)}${lanternMeta(l) ? ` · ${esc(lanternMeta(l))}` : ''}</p></div>
        ${MODE === 'room' && l.id != null ? `<button type="button" class="bubble-act" data-letter="${i}">${canHide() ? '숨기기' : '신고'}</button>` : ''}
      </li>`).join('')}</ul>
    ${list.length ? '<button type="button" class="btn primary wide" id="save-memory">기억 카드로 저장 (등불 전부 한 장에)</button>' : ''}
    <a class="btn wide cta-link" href="/?ref=${esc(ROOM_ID || '')}">내 생일 파티도 만들기</a>`);
  sheetBody.querySelector('.cta-link').addEventListener('click', () => track('cta_click'));
  sheetBody.querySelector('#save-memory')?.addEventListener('click', (e) => saveMemoryCard(e.currentTarget));
  sheetBody.querySelectorAll('[data-thanks]').forEach((b) => b.addEventListener('click', () => sendThanks(Number(b.dataset.thanks), b)));
  sheetBody.querySelectorAll('[data-letter]').forEach((b) => b.addEventListener('click', async () => {
    const l = list[Number(b.dataset.letter)];
    b.disabled = true;
    try {
      if (canHide()) {
        await api(`/api/rooftops/${ROOM_ID}/lanterns/${l.id}/hide`, { method: 'POST', body: authBody() });
        removeLantern(l.id);
        b.closest('li').remove();
      } else {
        const r = await api(`/api/rooftops/${ROOM_ID}/lanterns/${l.id}/report`, { method: 'POST', body: {} });
        b.textContent = r.already ? '이미 신고했어요' : '신고했어요';
      }
    } catch (err) { b.textContent = err.message; }
  }));
}

// ── 주인공 답례 ──
async function sendThanks(tpl, btn) {
  const status = sheetBody.querySelector('.thanks-box .copy-status');
  try {
    if (MODE === 'room') await api(`/api/rooftops/${ROOM_ID}/thanks`, { method: 'POST', body: { ...authBody(), tpl } });
    showThanks(THANKS_TEMPLATES[tpl]);
    if (status) status.textContent = `보낸 답례: ${THANKS_TEMPLATES[tpl]}`;
  } catch (err) { if (status) status.textContent = err.message; }
}
function showThanks(text) {
  ROOF_STATE.thanks = text;
  const el = document.querySelector('#thanks-banner');
  el.hidden = false;
  el.textContent = `${ROOF_STATE.owner}의 답례 · ${text}`;
}

// ── 주인공의 촛불 끄기 ──
function addCandleButton() {
  if (document.querySelector('#btn-candles')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-candles';
  btn.className = 'btn primary';
  btn.textContent = MODE === 'demo' ? '촛불 끄기 미리보기' : '촛불 끄기';
  document.querySelector('.actions').prepend(btn);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      // 다 같이 생일 노래를 부른 뒤 촛불이 꺼진다
      if (MODE === 'room') {
        const r = await api(`/api/rooftops/${ROOM_ID}/candles`, { method: 'POST', body: authBody() });
        if (r.songAt) startSong(r.songAt - serverOffset);
        else blowCandles(true);
      } else startSong(Date.now() + 600);
    } catch (err) { setStatus(err.message); btn.disabled = false; }
  });
}
// ── 캐릭터 동작: 자주 쓰는 6가지만 판에 보인다(다른 동작도 받으면 그대로 재생). 모두의 화면에서 같이 보인다 ──
const EMOTES = [
  ['wave', '손 흔들기'], ['hop', '점프'], ['dance', '춤추기'],
  ['cheer', '만세'], ['heart', '하트'], ['cheers', '건배'],
];
const POSES = new Set(['sit', 'lie', 'sleep', 'dance']);
function playEmote(person, kind) {
  if (!person?.av) return;
  if (kind === 'hop') person.av.hop();
  else if (POSES.has(kind)) { person.target = null; person.av.pose = kind; person.wait = 6 + Math.random() * 6; }
  else person.av.gesture(kind);
  if (kind === 'surprise') { showFloat(person, '!', 'emote-bang'); sound.boing(); }
  if (kind === 'cry') showFloat(person, 'ㅠㅠ', 'emote-cry');
  if (kind === 'flip') sound.whoosh();
  if (kind === 'heart') showFloat(person, '♥', 'react-heart');
  if (kind === 'eat') { showFloat(person, '냠냠', 'emote-yum'); sound.nom(person === me); }
  if (kind === 'cheers') { showFloat(person, '짠!', 'emote-yum'); sound.clink(person === me); }
}
let lastEmoteAt = 0;
function sendEmote(kind) {
  if (!me || ceremony) return;
  if (performance.now() - lastEmoteAt < 850) return; // 서버와 같은 간격(너무 빨리 누르면 남에게 안 보이므로)
  lastEmoteAt = performance.now();
  playEmote(me, kind);
  conn?.send({ t: 'emote', kind });
  track('emote');
}
// 동작 고르기 판: 리액션 버튼 옆 '동작' 버튼으로 연다
function wireEmotes() {
  const bar = document.querySelector('#reactions');
  if (!bar || bar.querySelector('[data-emote-open]')) return;
  const open = document.createElement('button');
  open.type = 'button';
  open.dataset.emoteOpen = '1';
  open.setAttribute('aria-label', '동작');
  open.textContent = '동작';
  bar.appendChild(open);
  const panel = document.createElement('div');
  panel.id = 'emotes';
  panel.hidden = true;
  const renderPanel = () => {
    const near = me ? nearbyFor(me, 7).length : 0;
    panel.innerHTML = `${EMOTES.map(([k, n]) => `<button type="button" data-emote="${k}">${n}</button>`).join('')}
      <p class="emote-sub">같이 하기 · 근처 친구 ${near}명</p>
      ${GM_MENU.map((k) => [k, GROUP_MOTIONS[k]]).map(([k, [n, min]]) => `<button type="button" class="gm" data-gm="${k}"${near + 1 < min ? ' disabled' : ''}>${n}</button>`).join('')}`;
  };
  document.body.appendChild(panel);
  open.addEventListener('click', () => { if (panel.hidden) renderPanel(); panel.hidden = !panel.hidden; });
  panel.addEventListener('click', (e) => {
    const gmb = e.target.closest('[data-gm]');
    if (gmb && !gmb.disabled) { requestGroupMotion(gmb.dataset.gm); panel.hidden = true; return; }
    const b = e.target.closest('[data-emote]');
    if (!b) return;
    try { navigator.vibrate?.(10); } catch { /* 진동 없는 기기 */ }
    sendEmote(b.dataset.emote);
    panel.hidden = true;
  });
}
// ── 같이 하는 동작: 근처 친구와 하이파이브·포옹·빙글빙글·기차놀이·단체 셀카 ──
// 시작한 사람이 근처 사람을 모으고, 서버가 정한 같은 시각부터 모두의 화면에서 같은 안무를 한다.
// 판에는 3가지만 보인다(빙글빙글·기차놀이도 받으면 그대로 함께 한다)
const GM_MENU = ['highfive', 'hug', 'selfie'];
const GROUP_MOTIONS = { highfive: ['하이파이브', 2, 2.2], hug: ['포옹', 2, 2.8], ring: ['손잡고 빙글빙글', 3, 6.4], conga: ['기차놀이', 3, 7.4], selfie: ['단체 셀카', 2, 3.4] };
const GM_RANGE = 3.2;
function nearbyFor(person, max) {
  const pos = person.av.root.position;
  return people
    .filter((p) => p !== person && !p.gm && !(p.busyUntil > performance.now()) && p.av.root.position.distanceTo(pos) < GM_RANGE)
    .sort((a, b) => a.av.root.position.distanceToSquared(pos) - b.av.root.position.distanceToSquared(pos))
    .slice(0, max);
}
function startGroupMotion(kind, lead, others, { cx, cz, ang, at }) {
  const def = GROUP_MOTIONS[kind];
  if (!def || !lead || ceremony) return;
  // 자리 번호는 보낸 사람의 목록 순서 그대로(모르는 사람은 빈자리로 두어 모두의 화면에서 같은 자리)
  const slots = [lead, ...others];
  const list = slots.filter((p) => p && !p.gm);
  if (list.length < def[1]) return;
  const start = at;
  const dur = def[2];
  slots.forEach((p, i) => {
    if (!p || p.gm) return;
    p.gm = { kind, i, n: slots.length, start, dur, cx, cz, ang, list, fired: false };
    p.busyUntil = start + dur * 1000 + 200;
    p.target = null;
    p.av.pose = null;
  });
  if (kind === 'selfie' && lead === me) setStatus('다 같이 모여요! 단체 셀카', 3000);
}
let lastGmAt = 0;
function requestGroupMotion(kind) {
  const def = GROUP_MOTIONS[kind];
  if (!me || !def || ceremony) return;
  if (performance.now() - lastGmAt < 3100) return setStatus('잠시 후 다시 해 주세요');
  lastGmAt = performance.now();
  const max = kind === 'highfive' || kind === 'hug' ? 1 : 7;
  const others = nearbyFor(me, max);
  if (others.length + 1 < def[1]) return setStatus(`${def[0]}는 근처에 친구가 ${def[1] - 1}명 이상 있어야 해요`);
  const pos = me.av.root.position;
  const o0 = others[0].av.root.position;
  const two = max === 1;
  const cx = two ? (pos.x + o0.x) / 2 : pos.x;
  const cz = two ? (pos.z + o0.z) / 2 : pos.z;
  const ang = Math.atan2(o0.z - pos.z, o0.x - pos.x);
  const at = Date.now() + 400;
  startGroupMotion(kind, me, others, { cx, cz, ang, at });
  // 실제 친구만 서버로(샘플 친구는 내 화면에서만)
  const ids = others.map((p) => [...peersById.entries()].find(([, v]) => v === p)?.[0]).filter(Boolean);
  if (conn && ids.length) conn.send({ t: 'gmo', kind, ids, cx, cz, ang });
  track('group_motion');
}
function updateGroupMotions(dt) {
  const now = Date.now();
  for (const p of people) {
    const g = p.gm;
    if (!g) continue;
    const t = (now - g.start) / 1000;
    if (t > g.dur) { finishGroupMotion(p); continue; }
    const pos = p.av.root.position;
    const want = tmp2.set(g.cx, 0, g.cz);
    let face = null;
    const u = { x: Math.cos(g.ang), z: Math.sin(g.ang) };
    if (g.kind === 'highfive' || g.kind === 'hug') {
      const half = g.kind === 'hug' ? 0.31 : 0.45;
      const s = g.i === 0 ? -1 : 1;
      want.x += u.x * half * s;
      want.z += u.z * half * s;
      face = tmp3.set(g.cx - u.x * half * s * 3, 0, g.cz - u.z * half * s * 3);
      if (!g.fired && t > 0.55) {
        g.fired = true;
        p.av.gesture(g.kind);
        if (g.i === 0) {
          if (g.kind === 'highfive') setTimeout(() => { sound.react('clap', g.list.includes(me)); sparks.burst?.(); }, 420);
          else { sound.react('heart', g.list.includes(me)); setTimeout(() => g.list.forEach((q) => showFloat(q, '♥', 'react-heart')), 500); }
        }
      }
    } else if (g.kind === 'ring') {
      const r = Math.max(0.95, 0.5 + 0.24 * g.n);
      const a = (g.i / g.n) * Math.PI * 2 + Math.max(0, t - 0.8) * 1.5;
      want.x += Math.cos(a) * r;
      want.z += Math.sin(a) * r;
      face = tmp3.set(g.cx, 0, g.cz);
      p.av.sway = t > 0.8 ? 1 : 0;
      p.av.swayPhase = t * 7;
      if (!g.fired) { g.fired = true; p.av.gesture('ringhands'); if (g.i === 0) sound.react('party', g.list.includes(me)); }
    } else if (g.kind === 'conga') {
      const R = 2.6;
      const base = g.ang + Math.PI; // 시작한 사람 뒤쪽을 중심으로 돈다
      const ccx = g.cx + Math.cos(base) * -R;
      const ccz = g.cz + Math.sin(base) * -R;
      const th = base + Math.max(0, t - 0.6) * 0.75 - g.i * 0.42;
      want.set(ccx + Math.cos(th) * R, 0, ccz + Math.sin(th) * R);
      face = tmp3.set(want.x - Math.sin(th) * 2, 0, want.z + Math.cos(th) * 2);
      p.av.sway = t > 0.6 ? 1 : 0;
      p.av.swayPhase = t * 8;
      if (!g.fired) { g.fired = true; p.av.gesture('conga'); if (g.i === 0) sound.partyHorn(); }
    } else if (g.kind === 'selfie') {
      const off = g.i - (g.n - 1) / 2;
      want.x += off * 0.72;
      want.z += -Math.abs(off) * 0.22;
      p.av.faceCamera = true;
      if (!g.fired && t > 1.3) {
        g.fired = true;
        p.av.gesture(g.i % 2 ? 'heart' : 'cheer');
        if (g.i === 0 && p === me) {
          viewOverride = { pos: new THREE.Vector3(g.cx, 1.7, g.cz + 3.4), look: new THREE.Vector3(g.cx, 1.0, g.cz), fov: 55, until: performance.now() + 1700 };
          setTimeout(() => { spotShotTitle = '단체 셀카'; groupShotPending = true; sound.shutter(); }, 900);
        }
      }
    }
    collide(want); // 케이크·테이블을 뚫고 지나가지 않게
    const d = pos.distanceTo(want);
    const step = Math.min(d, dt * 4.5);
    if (d > 0.01) pos.add(tmp.copy(want).sub(pos).multiplyScalar(step / d));
    p.speed = d > 0.05 ? 1 : 0;
    if (face) p.av.faceTarget = face.clone();
    if (p.net && !p.isMe) p.net.copy(pos);
  }
}
function finishGroupMotion(p) {
  p.gm = null;
  p.busyUntil = 0;
  p.av.faceTarget = null;
  p.av.faceCamera = false;
  p.av.sway = 0;
  p.wait = 2 + Math.random() * 3;
}

// 조는 동안 머리 위에 Zzz
let zzzT = 0;
function updatePoses(dt) {
  zzzT -= dt;
  if (zzzT > 0) return;
  zzzT = 1.4;
  for (const p of people) if (p.av.pose === 'sleep') showFloat(p, 'Zzz', 'emote-zzz');
}

// ── 겹침 방지: 사람끼리 너무 가까우면 서로 살짝 밀어낸다 ──
// 내 인형과 샘플 친구들만 실제로 움직인다(다른 사람은 그 사람 화면에서 스스로 비켜서 위치가 온다).
function separatePeople(dt) {
  if (ceremony || groupPhoto || procession) return; // 대열을 맞출 때는 정해진 자리
  const MIN = 0.86;
  const now = performance.now();
  for (let i = 0; i < people.length; i++) {
    const a = people[i];
    for (let j = i + 1; j < people.length; j++) {
      const b = people[j];
      const pa = a.av.root.position;
      const pb = b.av.root.position;
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= MIN * MIN) continue;
      if (a.gm || b.gm) continue; // 같이 하는 동작(포옹 등)은 붙어 있어야 한다
      const d = Math.sqrt(d2) || 0.001;
      const push = Math.min(MIN - d, dt * 4) / d;
      const canA = (a.isMe || a.npc) && !(a.busyUntil > now) && a.av.pose !== 'sit';
      const canB = (b.isMe || b.npc) && !(b.busyUntil > now) && b.av.pose !== 'sit';
      const share = canA && canB ? 0.5 : 1;
      if (canA) { pa.x -= dx * push * share; pa.z -= dz * push * share; collide(pa); }
      if (canB) { pb.x += dx * push * share; pb.z += dz * push * share; collide(pb); }
    }
  }
}

// ── 장소별 놀거리: 가까이 가면 버튼이 뜨고, 함께 보는 놀거리는 모두의 화면에서 똑같이 일어난다 ──
const spotBtn = document.createElement('button');
spotBtn.id = 'spot-btn';
spotBtn.className = 'btn primary';
spotBtn.hidden = true;
document.body.appendChild(spotBtn);
let nearSpot = null;
const spotCool = new Map();
const spotLabels = new Map();
let viewOverride = null;
let spotShotTitle = null; // 포토존 사진 제목 // 망원경·포토존처럼 잠깐 카메라를 다른 곳으로
function spotCtx(person) {
  return { person, isMe: person === me, sound, confetti, sparks, people, setStatus, now: performance.now() };
}
// 앉기: 가장 가까운 빈자리로 가서 앉는다. 자리·높이는 위치로 정하므로 모두의 화면에서 같다.
function seatNear(pos, maxD = 0.4) {
  let best = null;
  let bd = maxD;
  for (const st of world.seats || []) { const d = Math.hypot(st.pos.x - pos.x, st.pos.z - pos.z); if (d < bd) { bd = d; best = st; } }
  return best;
}
function sitDown(person) {
  const free = (world.seats || []).filter((st) => !people.some((p) => p !== person && p.av.pose === 'sit' && Math.hypot(p.av.root.position.x - st.pos.x, p.av.root.position.z - st.pos.z) < 0.3));
  if (!free.length) { if (person === me) setStatus('빈자리가 없어요'); return; }
  const pos = person.av.root.position;
  free.sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos));
  const st = free[0];
  pos.set(st.pos.x, 0, st.pos.z);
  person.target = null;
  if (person.net && person !== me) person.net.copy(pos);
  if (person === me) sendEmote('sit');
  else playEmote(person, 'sit');
}
function useHotspot(hs, person, { remote = false } = {}) {
  if (!hs || ceremony) return;
  if (hs.seat) return sitDown(person);
  const res = hs.run?.(spotCtx(person)) || {};
  if (res.emote) { if (person === me && !remote) sendEmote(res.emote); else playEmote(person, res.emote); }
  if (person === me) {
    if (res.view) {
      viewOverride = { ...res.view, until: performance.now() + (res.view.ms || 5000) };
      document.body.classList.add('scope-view');
    }
    if (res.photo) setTimeout(() => { spotShotTitle = res.photo; groupShotPending = true; sound.shutter(); }, 1400);
    if (res.status) setStatus(res.status, 4000);
    if (hs.shared && conn && !remote) conn.send({ t: 'fx', id: hs.id });
    track('spot_use');
  }
}
function updateSpots() {
  const spots = world.hotspots || [];
  // 이름표: 가까운 놀거리만
  for (const hs of spots) {
    let el = spotLabels.get(hs);
    if (!el) {
      el = document.createElement('div');
      el.className = 'spot-label';
      el.textContent = hs.label;
      labelsEl.appendChild(el);
      spotLabels.set(hs, el);
    }
    const far = !me || me.av.root.position.distanceTo(hs.pos) > 15 || ceremony || ignite;
    if (far) el.style.display = 'none';
    else placeLabel(el, hs.pos, hs.labelY || 1.6);
  }
  let best = null;
  if (me && !ceremony && !ignite && !groupPhoto && !procession && !(me.busyUntil > performance.now())) {
    let bd = Infinity;
    for (const hs of spots) {
      if (hs.seat && me.av.pose === 'sit') continue; // 이미 앉아 있으면 '앉기' 버튼은 숨긴다
      const d = me.av.root.position.distanceTo(hs.pos);
      if (d < (hs.r || 2.4) && d < bd) { bd = d; best = hs; }
    }
  }
  if (best !== nearSpot) {
    nearSpot = best;
    spotBtn.hidden = !best;
    if (best) spotBtn.textContent = best.verb;
  }
}
spotBtn.addEventListener('click', () => {
  const hs = nearSpot;
  if (!hs) return;
  const last = spotCool.get(hs.id) ?? -Infinity; // 한 번도 안 썼으면 바로 쓸 수 있게(0이면 첫 몇 초 동안 막힘)
  if (performance.now() - last < (hs.cool || 2500)) return;
  spotCool.set(hs.id, performance.now());
  useHotspot(hs, me);
});
function clearSpotLabels() { for (const el of spotLabels.values()) el.remove(); spotLabels.clear(); nearSpot = null; spotBtn.hidden = true; }
// 구역 효과: 무중력은 둥둥, 트램펄린은 통통, 댄스 플로어는 들썩(위치만으로 정하므로 모두의 화면에서 같다)
function applyZones(t, dt) {
  const now = performance.now();
  people.forEach((p, i) => {
    if (p.busyUntil > now) return; // 열기구처럼 놀거리가 직접 움직이는 중
    const z = !ceremony && world.zoneAt?.(p.av.root.position);
    let lift = 0;
    if (ceremony?.kind === 'candles' && p === ceremonyLead() && p.av.root.position.distanceTo(LEAD_SPOT.candles) < 0.4) lift = PODIUM_H; // 단상 위
    // 의자에 앉은 사람: 자리 높이만큼 올라가고 의자가 보는 쪽을 본다
    const st = p.av.pose === 'sit' ? seatNear(p.av.root.position) : null;
    if (st) {
      lift = st.h;
      p.seatFace = p.seatFace || new THREE.Vector3();
      p.av.faceTarget = p.seatFace.set(p.av.root.position.x + Math.sin(st.face) * 3, 0, p.av.root.position.z + Math.cos(st.face) * 3);
      p.onSeat = true;
    } else if (p.onSeat) { p.onSeat = false; p.av.faceTarget = null; }
    if (z?.kind === 'float') lift = 0.9 + Math.sin(t * 1.3 + i) * 0.3;
    else if (z?.kind === 'bounce') lift = Math.abs(Math.sin(t * 2.6 + i * 0.7)) * 2.3;
    p.av.lift = z?.kind === 'bounce' ? lift : THREE.MathUtils.lerp(p.av.lift, lift, Math.min(1, dt * 3));
    if (!ceremony && !song) {
      p.av.sway = z?.kind === 'dance' ? 1 : 0;
      if (z?.kind === 'dance') p.av.swayPhase = t * 6 + i;
    }
  });
}

// ── 의식(점등식·촛불 끄기): 모두가 정해진 대열에 서고, 하트·별·박수만 보낼 수 있다 ──
// 대열은 모든 화면에서 같은 규칙으로 계산한다: 주인공은 케이크 바로 앞, 친구들은 케이크 뒤 반원에 가운데부터.
let ceremony = null;
const CEREMONY_TEXT = { ignite: '점등식이 시작돼요. 하트·별·박수로 함께해요', candles: '생일 노래 시간이에요. 하트·별·박수로 함께해요' };
function ceremonyLead() { return people.find((p) => p.isOwner) || me || null; }
// 점등식: 주인공은 케이크 앞(카메라 쪽). 촛불: 주인공은 케이크 바로 옆에서 모두를 보고 섰다가 몸을 돌려 분다(인형이 케이크보다 작아 뒤에 서면 가려진다)
const LEAD_SPOT = { ignite: new THREE.Vector3(0, 0, 2.5), candles: new THREE.Vector3(1.9, 0, 1.6) };
// 촛불을 불 때 주인공이 올라서는 작은 단상(케이크가 인형보다 커서)
const PODIUM_H = 0.62;
const podium = (() => {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, PODIUM_H, 28), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb800, emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.3 }));
  base.position.y = PODIUM_H / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0xfff3c0 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = PODIUM_H;
  g.add(base, rim);
  g.visible = false;
  scene.add(g);
  return g;
})();
function ceremonySpots(kind = ceremony?.kind || 'ignite') {
  const lead = ceremonyLead();
  const map = new Map();
  if (lead) map.set(lead, LEAD_SPOT[kind].clone());
  const rest = people.filter((p) => p !== lead).sort((a, b) => a.label.textContent.localeCompare(b.label.textContent, 'ko'));
  const spots = [];
  for (const r of [3.4, 4.4, 5.4, 6.4, 7.4]) {
    const a0 = Math.PI - 0.5;
    const a1 = Math.PI * 2 + 0.5;
    const n = Math.floor(((a1 - a0) * r) / 1.0);
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      ring.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    ring.sort((p, q) => Math.abs(p.x) - Math.abs(q.x)); // 케이크 뒤 가운데부터 채운다
    spots.push(...ring);
    if (spots.length >= rest.length) break;
  }
  rest.forEach((p, i) => { const sp = spots[i % spots.length].clone(); collide(sp); map.set(p, sp); });
  return map;
}
function startCeremony(kind) {
  podium.position.copy(LEAD_SPOT.candles);
  podium.visible = kind === 'candles';
  // 입장 행진·단체 사진이 남아 있으면 먼저 마무리(같은 의식이 이미 진행 중이어도)
  if (procession) { procession.t = procession.dur; updateProcession(0); }
  if (groupPhoto) { groupPhoto.el.remove(); groupPhoto = null; }
  if (ceremony?.kind === kind) return;
  hideBubble();
  if (!sheetLocked) closeSheet();
  ceremony = { kind, slots: ceremonySpots(kind) };
  for (const p of people) { if (p.gm) finishGroupMotion(p); p.target = null; p.goal = null; p.busyUntil = 0; p.av.lift = 0; p.av.pose = null; }
  viewOverride = null;
  document.body.classList.remove('scope-view');
  document.body.classList.add('ceremony');
  let hint = document.querySelector('#ceremony-hint');
  if (!hint) {
    hint = document.createElement('p');
    hint.id = 'ceremony-hint';
    hint.setAttribute('role', 'status');
    document.body.appendChild(hint);
  }
  hint.textContent = CEREMONY_TEXT[kind];
}
function endCeremony(kind) {
  if (!ceremony || (kind && ceremony.kind !== kind)) return;
  for (const p of people) {
    p.av.faceCamera = false;
    p.av.sway = 0;
    p.wait = 1.5 + Math.random() * 3;
    if (p.net && !p.isMe) p.net.copy(p.av.root.position); // 다음 위치가 올 때까지 대열 자리에서 기다린다
  }
  ceremony = null;
  podium.visible = false;
  document.body.classList.remove('ceremony');
  document.querySelector('#ceremony-hint')?.remove();
}
function updateCeremony(dt) {
  if (!ceremony) return;
  const lead = ceremonyLead();
  for (const p of people) {
    if (candleBlow && p === candleBlow.blower) continue; // 촛불 부는 사람은 그 연출이 움직인다
    let spot = ceremony.slots.get(p);
    if (!spot) { ceremony.slots = ceremonySpots(); spot = ceremony.slots.get(p); } // 도중에 들어온 사람
    const pos = p.av.root.position;
    const d = pos.distanceTo(spot);
    const step = Math.min(d, dt * 5);
    if (d > 0.01) pos.add(tmp.copy(spot).sub(pos).multiplyScalar(step / d));
    p.speed = d > 0.05 ? 1 : 0;
    p.dirX = 0;
    // 친구들은 주인공과 카메라 쪽을, 주인공은 점등 때 카메라를·촛불 때 케이크를 본다
    p.av.faceCamera = true;
  }
}
const CAKE_CENTER = new THREE.Vector3(0, 0, 0);

// 주인공 주위를 도는 금빛 반짝이: 누가 주인공인지 멀리서도 보인다
const aura = (() => {
  const n = 16;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.4, 'rgba(255,200,90,0.6)');
  grad.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  pts.visible = false;
  scene.add(pts);
  return {
    update(t) {
      const owner = people.find((p) => p.isOwner);
      pts.visible = !!owner;
      if (!owner) return;
      const o = owner.av.root.position;
      const arr = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const a = t * 0.9 + (i / n) * Math.PI * 2;
        const rise = (t * 0.35 + i / n) % 1;
        const r = 0.55 + Math.sin(t * 2 + i) * 0.06;
        arr[i * 3] = o.x + Math.cos(a) * r;
        arr[i * 3 + 1] = o.y + 0.15 + rise * 1.4;
        arr[i * 3 + 2] = o.z + Math.sin(a) * r;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = 0.75 + Math.sin(t * 3) * 0.2;
    },
  };
})();
const cerP = new THREE.Vector3();
const cerL = new THREE.Vector3();
const IGN_P = new THREE.Vector3();
// 화각: 가로 화면 점등 때만 잠시 넓혔다가 천천히 원래대로
const baseFov = () => (camera.aspect < 1 ? 62 : 50);
function easeFov(target, dt) {
  if (Math.abs(camera.fov - target) < 0.01) return;
  camera.fov = THREE.MathUtils.lerp(camera.fov, target, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();
}
const IGN_L = new THREE.Vector3();
// 점등 구도(장소가 igniteView로 바꿀 수 있다). 세로 화면은 더 뒤에서 넓게
function igniteView(portrait) {
  const v = world.igniteView?.(portrait);
  if (v) return v;
  return portrait ? { cam: [0, 3.9, 13.8], look: [0, 4.3, -1] } : { cam: [0, 4.2, 13.5], look: [0, 4.3, -1], fov: 58 };
}
function ceremonyCamera(dt) {
  const portrait = camera.aspect < 1;
  cerP.set(0, portrait ? 4.4 : 3.5, portrait ? 12.5 : 9.6);
  cerL.set(0, 1.5, 0);
  if (ceremony?.kind === 'candles') cerL.set(0.6, 1.5, 0);
  if (ignite) {
    // 불이 켜지는 동안 천천히 뒤로 물러나며 살짝 올려다본다:
    // 하늘의 '생일 축하해 · 이름'은 화면 위쪽에 크게, 케이크와 친구들은 아래쪽에 함께 담기게
    const k = THREE.MathUtils.smootherstep(ignite.t, 0.8, 4.6);
    const v = igniteView(portrait);
    cerP.lerp(IGN_P.set(...v.cam), k);
    cerL.lerp(IGN_L.set(...v.look), k);
    if (v.fov) easeFov(baseFov() + (v.fov - baseFov()) * k, dt);
  } else easeFov(baseFov(), dt);
  world.clampCamera?.(cerP);
  camPos.lerp(cerP, Math.min(1, dt * 2));
  camera.position.copy(camPos);
  camLook.lerp(cerL, Math.min(1, dt * 2.2));
}

// 점등 직전 5초: 모두의 화면에 큰 숫자와 딱따기 소리
const igniteCd = { last: null, el: null, demoAt: 0 };
function updateIgniteCountdown() {
  let left = Infinity;
  if (MODE === 'room' && (me || ROOF_STATE.spectator) && !ignitedThisSession && !store.get(`seen:${ROOM_ID}`)) left = ROOF_STATE.igniteAt - serverNow();
  else if (igniteCd.demoAt) left = igniteCd.demoAt - Date.now();
  // 점등이 끝내 시작되지 않은 경우(다른 탭에서 이미 봄 등) 의식을 풀어 준다
  if (ceremony?.kind === 'ignite' && !ignite && MODE === 'room' && serverNow() > ROOF_STATE.igniteAt + 3000) endCeremony('ignite');
  if (!(left > 0 && left <= 5000) || ignite) {
    if (igniteCd.el) { igniteCd.el.remove(); igniteCd.el = null; igniteCd.last = null; }
    if (igniteCd.demoAt && left <= 0) { igniteCd.demoAt = 0; startIgnite(); }
    return;
  }
  if (!igniteCd.el) {
    startCeremony('ignite');
    igniteCd.el = document.createElement('div');
    igniteCd.el.id = 'ignite-cd';
    igniteCd.el.setAttribute('aria-live', 'assertive');
    document.body.appendChild(igniteCd.el);
  }
  const n = Math.ceil(left / 1000);
  if (n !== igniteCd.last) {
    igniteCd.last = n;
    igniteCd.el.textContent = String(n);
    igniteCd.el.style.animation = 'none';
    void igniteCd.el.offsetWidth; // 숫자가 바뀔 때마다 튀어나오는 움직임을 다시
    igniteCd.el.style.animation = '';
    sound.tick(n === 1);
  }
}

// 촛불 끄기: 주인공이 케이크 앞으로 와서 숨을 들이쉬고 '후~' 불면 촛불이 하나씩 눕다가 꺼지고 연기가 오른다
let candleBlow = null;
function blowCandles(celebrate) {
  if (candleBlow || (ROOF_STATE.candlesOut && !celebrate)) return;
  ROOF_STATE.candlesOut = true;
  document.querySelector('#btn-candles')?.remove();
  if (!celebrate || lite || world.candleState !== 'lit') {
    world.setCandles(false);
    if (celebrate) celebrateCandles();
    return;
  }
  hideBubble();
  const blower = ceremonyLead();
  candleBlow = { t: 0, start: performance.now(), blower, front: LEAD_SPOT.candles.clone(), inhaled: false, blown: false, done: 0 };
  if (blower) { blower.target = null; blower.av.faceTarget = new THREE.Vector3(0, 0, 0); }
  sound.duck(5, 0.25);
  setStatus(`${josa(ROOF_STATE.owner, '이가')} 소원을 빌고 촛불을 불어요…`, 4000);
}
function updateCandleBlow(dt) {
  const cb = candleBlow;
  if (!cb) return;
  cb.t = (performance.now() - cb.start) / 1000; // 실제 시간 기준: 느린 기기도 다른 사람과 같은 박자로
  const b = cb.blower;
  // 1) 케이크 앞으로 다가가 숨을 크게 들이쉰다
  if (b) {
    const pos = b.av.root.position;
    const d = pos.distanceTo(cb.front);
    const step = Math.min(d, dt * 3.5);
    if (d > 0.02) pos.add(tmp.copy(cb.front).sub(pos).multiplyScalar(step / d));
    b.speed = d > 0.05 ? 1 : 0;
    if (b.net && !b.isMe) b.net.copy(pos);
    const inhale = THREE.MathUtils.smoothstep(cb.t, 0.8, 1.5);
    b.av.puff = cb.t < 1.55 ? inhale : Math.max(0, 1 - (cb.t - 1.55) * 2.5);
    b.av.lean = cb.t < 1.55 ? inhale * 0.3 : cb.t < 2.7 ? 1 : Math.max(0, 1 - (cb.t - 2.7) * 2);
  }
  if (cb.t > 0.85 && !cb.inhaled) { cb.inhaled = true; sound.inhale(); }
  // 2) '후~' 입김이 케이크로 날아가고 촛불이 눕다가 하나씩 꺼진다
  if (cb.t > 1.55 && !cb.blown) {
    cb.blown = true;
    sound.blow();
    const from = b ? b.av.root.position.clone() : new THREE.Vector3(0, 0, 2);
    const toCake = new THREE.Vector3(-from.x, 0, -from.z).normalize();
    breath.start(from.clone().add(new THREE.Vector3(0, 0.8 + PODIUM_H, 0)).addScaledVector(toCake, 0.42), new THREE.Vector3(0, CAKE.flameY, 0.05));
    world.blowOut({ from, snuffCb: () => sound.snuff() });
  }
  if (cb.blown && !cb.done && (world.candleState === 'out' || cb.t > 4.5)) { if (world.candleState !== 'out') world.setCandles(false); cb.done = cb.t; }
  // 3) 잠깐의 정적 뒤 축하
  if (cb.done && cb.t > cb.done + 0.7) {
    if (b) { b.av.faceTarget = null; b.av.lean = 0; b.av.puff = 0; b.wait = 3; }
    candleBlow = null;
    celebrateCandles();
  }
}
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();
function candleCamera(dt) {
  // 옆에서 보면 주인공이 몸을 숙이는 모습, 입김, 눕는 촛불이 한 화면에 들어온다
  // 세로 화면에서도 주인공과 케이크가 함께 들어오도록 화면 비율에 맞춰 거리를 정한다
  // 주인공→케이크 선에 수직인 쪽(카메라 앞쪽)에서 본다
  const from = candleBlow.blower ? candleBlow.blower.av.root.position : LEAD_SPOT.candles;
  const mid = tmp2.set(from.x * 0.5, 0, from.z * 0.5);
  const u = tmp3.set(-from.x, 0, -from.z).normalize();
  let px = u.z;
  let pz = -u.x;
  if (pz < 0) { px = -px; pz = -pz; }
  const d = camera.aspect < 1 ? 6.2 : 4.2;
  camPos.lerp(tmp.set(mid.x + px * d, 2.2 + d * 0.18, mid.z + pz * d), Math.min(1, dt * 2.2));
  camera.position.copy(camPos);
  camLook.lerp(tmp.set(mid.x, 1.65, mid.z), Math.min(1, dt * 2.5));
}
function celebrateCandles() {
  confetti.burst(new THREE.Vector3(0, 2.1, 0), 220);
  sparks.burst();
  sound.partyHorn();
  sound.applause(3.2);
  sound.swell();
  const lead = ceremonyLead();
  people.forEach((p, i) => setTimeout(() => {
    p.av.hop();
    if (p === lead) { p.av.gesture('spin'); setTimeout(() => p.av.gesture('cheer'), 950); } else p.av.gesture('cheer');
  }, 200 + i * 70));
  setStatus(`${josa(ROOF_STATE.owner, '이가')} 촛불을 껐어요! 생일 축하해요`, 6000);
  setTimeout(() => endCeremony('candles'), 3000);
}

// ── 생일 노래 떼창: 주인공이 촛불을 끄기 전에 모두의 화면에 같은 박자로 가사가 흐른다 ──
let song = null;
function startSong(atLocal) {
  if (song || ROOF_STATE.candlesOut) return;
  if (!lite) startCeremony('candles');
  document.querySelector('#btn-candles')?.remove();
  const lines = songLines(ROOF_STATE.owner);
  const el = document.createElement('div');
  el.id = 'song';
  el.setAttribute('role', 'status');
  el.innerHTML = `<p class="song-title">다 같이 불러요</p>${lines.map((l) => `<p class="song-line"><span data-text="${esc(l.text)}">${esc(l.text)}</span></p>`).join('')}`;
  // 소리가 꺼져 있으면 반주를 들을 수 있게 바로 켜는 버튼
  if (!sound.enabled) {
    const on = document.createElement('button');
    on.type = 'button';
    on.className = 'song-sound';
    on.textContent = '소리 켜고 같이 부르기';
    el.appendChild(on);
    on.addEventListener('click', async () => {
      const enabled = await sound.toggle();
      soundBtn.setAttribute('aria-pressed', String(enabled));
      soundBtn.querySelector('span').textContent = enabled ? '소리 끄기' : '소리 켜기';
      on.remove();
      const leadStart = song ? song.t0 - LEAD_IN * BEAT * 1000 : 0; // 준비 박이 시작되는 시각
      if (enabled && song) sound.birthdaySong(Math.max(0, (leadStart - Date.now()) / 1000), (Date.now() - leadStart) / 1000);
    });
  }
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  sound.birthdaySong((atLocal - Date.now()) / 1000);
  song = { t0: atLocal + LEAD_IN * BEAT * 1000, lines, el, hopped: new Set() };
}
function updateSong() {
  if (!song) return;
  const beat = (Date.now() - song.t0) / 1000 / BEAT;
  const rows = song.el.querySelectorAll('.song-line');
  song.lines.forEach((l, i) => {
    const p = THREE.MathUtils.clamp((beat - l.at) / l.len, 0, 1);
    rows[i].classList.toggle('on', beat >= l.at - 0.3 && beat < l.at + l.len);
    rows[i].classList.toggle('done', beat >= l.at + l.len);
    rows[i].style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
    // 줄이 바뀔 때마다 다 같이 살짝 뛴다
    // 줄이 바뀔 때마다 친구들이 박수
    if (beat >= l.at && !song.hopped.has(i)) { song.hopped.add(i); const lead = ceremonyLead(); people.forEach((pp, k) => { if (pp !== lead) setTimeout(() => pp.av.gesture('clap'), k * 40); }); }
  });
  // 다 같이 박자에 맞춰 좌우로 흔든다
  for (const p of people) { p.av.sway = beat > 0 ? Math.min(1, beat) : 0; p.av.swayPhase = beat * Math.PI; }
  song.el.querySelector('.song-title').textContent = beat < 0 ? `${Math.ceil(-beat)}… 다 같이 불러요` : `${ROOF_STATE.owner}에게 불러주는 노래`;
  if (beat > SONG_BEATS + 0.6) {
    const el = song.el;
    song = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 500);
    for (const p of people) p.av.sway = 0;
    blowCandles(true);
  }
}

// ── 가볍게 보기: 3D를 끄고 등불 목록과 점등 소식만 보여준다(오래된 휴대폰·데이터 절약) ──
let lite = false;
let liteTimer = null;
function renderLite() {
  const el = document.querySelector('#lite');
  if (!el) return;
  const lit = litLevel > 1 || ignite;
  const giftN = gifts.list.length;
  el.querySelector('.lite-state').textContent = lit ? `불이 켜졌어요! ${ROOF_STATE.owner}의 생일을 축하해요` : `${VENUES[world.id]?.name || ''} · 등불 ${lanterns.length}개${giftN ? ` · 선물 ${giftN}개` : ''}`;
  el.classList.toggle('lit', !!lit);
  el.querySelector('.letters').innerHTML = lanterns.length ? lanterns.map((l) => `<li><i style="--c:${hex6(l.color)}" aria-hidden="true"></i><div><p class="letter-msg">${esc(l.msg)}</p><p class="letter-from">${esc(l.name)}${lanternMeta(l) ? ` · ${esc(lanternMeta(l))}` : ''}</p></div></li>`).join('') : '<li class="lite-empty">아직 걸린 등불이 없어요. 첫 등불을 달아주세요.</li>';
}
function setLite(on) {
  lite = on;
  document.body.classList.toggle('lite', on);
  let el = document.querySelector('#lite');
  if (on && !el) {
    el = document.createElement('section');
    el.id = 'lite';
    el.setAttribute('aria-label', '가볍게 보기');
    el.innerHTML = '<p class="lite-state"></p><ul class="letters"></ul><button type="button" class="btn wide" id="lite-off">3D로 보기</button>';
    document.body.appendChild(el);
    el.querySelector('#lite-off').addEventListener('click', () => setLite(false));
  }
  clearInterval(liteTimer);
  if (on) { renderLite(); liteTimer = setInterval(renderLite, 1500); }
  store.set('lite', on);
  const b = document.querySelector('#btn-lite span');
  if (b) b.textContent = on ? '3D로 보기' : '가볍게 보기';
}
function wireLiteButton() {
  addTopButton('btn-lite', '가볍게 보기', '<path d="M4 6h16M4 12h16M4 18h10"/>', () => { setLite(!lite); track(lite ? 'lite_on' : 'lite_off'); });
  if (QS.get('lite') === '1' || store.get('lite')) setLite(true);
}

// ── 주인공 입장 행진: 친구들이 양옆으로 줄을 서고, 주인공이 조명을 받으며 입구에서 케이크까지 걸어 들어온다 ──
let procession = null;
let ogPose = false;
let overviewCam = false;
let cineCam = null;
let processionDone = false;
const spotLight = new THREE.SpotLight(0xfff0d0, 0, 22, 0.3, 0.55, 1.1);
scene.add(spotLight, spotLight.target);
function startProcession(owner, { then = null } = {}) {
  if (procession || processionDone || ignite || groupPhoto || ceremony || candleBlow || !owner) return false;
  processionDone = true;
  const from = world.entrance.clone();
  const to = new THREE.Vector3(0, 0, 2.4);
  const len = Math.max(2, from.distanceTo(to));
  const friends = people.filter((p) => p !== owner);
  const slots = new Map();
  const perSide = Math.max(1, Math.floor((len - 0.6) / 1.1));
  friends.forEach((p, i) => {
    const k = Math.floor(i / 2);
    const side = i % 2 ? 1 : -1;
    const rank = Math.floor(k / perSide);
    const along = ((k % perSide) + 0.6) / perSide;
    const spot = to.clone().lerp(from, Math.min(0.97, along));
    spot.x = side * (1.3 + rank * 0.95);
    collide(spot);
    slots.set(p, spot);
    p.target = null;
  });
  owner.av.root.position.copy(from);
  if (owner.net) owner.net.copy(from);
  owner.target = null;
  procession = { owner, from, to, t: 0, dur: 9, slots, clap: 0, then, startMs: performance.now() };
  // 입장 음악(팡파르 곡)을 한 번 틀고 원래 곡으로 돌아간다. 곡이 없으면 코드로 만든 팡파르
  const back = sound.track && sound.track !== 'fanfare' ? sound.track : 'rooftop';
  if (sound.enabled) sound.music('fanfare', back);
  else sound.fanfare();
  setStatus(`${josa(ROOF_STATE.owner, '이가')} 입장해요! 박수로 맞아주세요`, 6000);
  return true;
}
function updateProcession(dt) {
  if (!procession) return;
  const pr = procession;
  pr.t = Math.max(pr.t, (performance.now() - pr.startMs) / 1000); // 실제 시간 기준(느린 기기도 같은 박자)
  for (const [p, spot] of pr.slots) {
    const pos = p.av.root.position;
    const d = pos.distanceTo(spot);
    const step = Math.min(d, dt * 6);
    if (d > 0.01) pos.add(tmp.copy(spot).sub(pos).multiplyScalar(step / d));
    p.speed = d > 0.05 ? 1 : 0;
    if (p.net && !p.isMe) p.net.copy(pos);
  }
  // 친구들이 줄을 선 뒤(1.8초) 주인공이 천천히 걸어 들어온다
  const k = THREE.MathUtils.clamp((pr.t - 1.8) / (pr.dur - 3), 0, 1);
  const op = pr.owner.av.root.position;
  const prev = op.clone();
  op.lerpVectors(pr.from, pr.to, THREE.MathUtils.smoothstep(k, 0, 1));
  pr.owner.speed = prev.distanceTo(op) > dt * 0.05 ? 1 : 0;
  if (pr.owner.net && !pr.owner.isMe) pr.owner.net.copy(op);
  spotLight.position.set(op.x, 9, op.z + 2);
  spotLight.target.position.copy(op);
  spotLight.intensity = THREE.MathUtils.lerp(spotLight.intensity, pr.t < pr.dur - 0.8 ? 22 : 0, dt * 3);
  // 주인공은 걸어 들어오며 손을 흔든다
  pr.wave = (pr.wave ?? 0.3) - dt;
  if (pr.wave <= 0 && k > 0 && k < 1) { pr.wave = 1.8; pr.owner.av.gesture('wave'); }
  pr.clap -= dt;
  if (pr.clap <= 0 && pr.slots.size && k > 0 && k < 1) {
    pr.clap = 0.35;
    const list = [...pr.slots.keys()];
    showReaction(list[Math.floor(Math.random() * list.length)], Math.random() < 0.7 ? 'clap' : 'heart');
  }
  if (pr.t >= pr.dur) {
    for (const p of pr.slots.keys()) p.wait = 2 + Math.random() * 3;
    pr.owner.av.hop();
    spotLight.intensity = 0;
    procession = null;
    pr.then?.();
  }
}
function processionCamera(dt) {
  const pr = procession;
  const mid = pr.from.clone().lerp(pr.to, 0.5);
  camPos.lerp(tmp.set(6.5, 3.6, mid.z + 1.5), Math.min(1, dt * 2));
  camera.position.copy(camPos);
  camLook.lerp(pr.owner.av.root.position.clone().setY(1), Math.min(1, dt * 3));
}

// ── 단체 사진: 주인공이 누르면 3-2-1 뒤 모두가 케이크 뒤에 모여 같은 장면을 찍는다 ──
let groupPhoto = null;
let groupShotPending = false;
const PHOTO_CAM = new THREE.Vector3(0, 6.4, 7.6);
const PHOTO_LOOK = new THREE.Vector3(0, 0.7, -3.3);
function photoFormation(n) {
  const spots = [];
  const rows = [9, 11, 13, 15];
  for (let r = 0; r < rows.length && spots.length < n; r++) {
    const xs = [];
    for (let i = 0; i < rows[r]; i++) xs.push((i - (rows[r] - 1) / 2) * 0.95 + (r % 2 ? 0.47 : 0));
    xs.sort((a, b) => Math.abs(a) - Math.abs(b)); // 가운데부터 채운다
    for (const x of xs) {
      if (spots.length >= n) break;
      spots.push(new THREE.Vector3(x, 0, -3.3 - r * 1.05));
    }
  }
  return spots;
}
function startGroupPhoto(atLocal) {
  if (groupPhoto || ignite || song || ceremony || candleBlow) return;
  hideBubble();
  if (!sheetLocked) closeSheet();
  // 모두의 화면에서 같은 자리: 주인공이 가운데, 나머지는 이름 순
  const list = people.slice().sort((a, b) => (b.isOwner - a.isOwner) || a.label.textContent.localeCompare(b.label.textContent, 'ko'));
  const spots = photoFormation(list.length);
  const slots = new Map(list.map((p, i) => [p, spots[i]]));
  for (const p of list) { p.av.faceCamera = true; p.target = null; }
  const el = document.createElement('div');
  el.id = 'countdown';
  el.setAttribute('aria-live', 'assertive');
  document.body.appendChild(el);
  groupPhoto = { at: atLocal, slots, el, shot: false, last: '' };
  setStatus('단체 사진을 찍어요! 케이크 뒤로 모여요', 4000);
}
function updateGroupPhoto(dt) {
  if (!groupPhoto) return;
  for (const [p, spot] of groupPhoto.slots) {
    const pos = p.av.root.position;
    const d = pos.distanceTo(spot);
    const step = Math.min(d, dt * 6);
    if (d > 0.01) pos.add(tmp.copy(spot).sub(pos).multiplyScalar(step / d));
    p.speed = d > 0.05 ? 1 : 0;
    if (p.net) p.net.copy(pos);
  }
  const left = groupPhoto.at - Date.now();
  const label = left > 3000 ? '모여요' : left > 0 ? String(Math.ceil(left / 1000)) : '';
  if (label !== groupPhoto.last) {
    groupPhoto.last = label;
    groupPhoto.el.textContent = label;
    groupPhoto.el.classList.toggle('num', /\d/.test(label));
    if (/\d/.test(label)) sound.tick(label === '1');
  }
  if (left <= 0 && !groupPhoto.shot) {
    groupPhoto.shot = true;
    groupShotPending = true;
    groupPhoto.el.classList.add('flash');
    sound.shutter();
  }
  if (left < -1600) {
    for (const p of groupPhoto.slots.keys()) { p.av.faceCamera = false; p.wait = 2 + Math.random() * 3; }
    groupPhoto.el.remove();
    groupPhoto = null;
    people.forEach((p, i) => setTimeout(() => p.av.hop(), i * 50));
  }
}
async function finishGroupPhoto(shot, title = null) {
  const blob = await composePhoto(shot, {
    owner: ROOF_STATE.owner,
    when: `${title || '단체 사진'} · ${VENUES[world.id]?.name || ''}`,
    lanterns: lanterns.length,
    gifts: gifts.list.length,
    friends: people.length,
  });
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  openSheet(`<h2>${title ? `${esc(title)} 사진을 찍었어요` : '단체 사진을 찍었어요'}</h2><p class="sheet-lead">${title ? '사진을 저장해서 친구들에게 보내보세요.' : '모두의 화면에서 같은 순간을 찍었어요.'}</p>
    <img class="photo-preview" src="${url}" alt="${esc(ROOF_STATE.owner)}의 생일 파티 단체 사진">
    <button class="btn primary wide" id="save-group">사진 저장</button>`);
  sheetBody.querySelector('#save-group').addEventListener('click', async () => {
    track('group_photo_save');
    const r = await saveVideo(blob, 'today-hero-group.jpg');
    if (r === 'downloaded') setStatus('단체 사진을 저장했어요');
  });
}
let lastPhotoReq = 0;
function canStartPhoto() { return MODE === 'demo' || ROOF_STATE.isOwner || ROOF_STATE.role === 'host'; }
function wireGroupPhotoButton() {
  if (!canStartPhoto()) return;
  addTopButton('btn-group', '단체 사진', '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>', () => {
    if (ignite || song || ceremony || candleBlow) return setStatus('지금은 찍을 수 없어요. 잠시 후 다시 눌러주세요');
    if (MODE === 'demo') return startGroupPhoto(Date.now() + 5000);
    if (!conn) return setStatus('연결된 뒤에 찍을 수 있어요');
    if (Date.now() - lastPhotoReq < 15000) return setStatus('방금 찍었어요. 조금 뒤에 다시 찍을 수 있어요');
    lastPhotoReq = Date.now();
    conn.send({ t: 'photo' });
  });
}

// ── 기억 카드: 모든 등불 문구를 한 장으로 ──
async function saveMemoryCard(btn) {
  if (!lanterns.length) return setStatus('아직 걸린 등불이 없어요');
  if (btn) btn.disabled = true;
  try {
    const blob = await composeMemoryCard({
      owner: ROOF_STATE.owner,
      when: revealLabel(ROOF_STATE.igniteAt),
      venue: VENUES[world.id]?.name,
      lanterns: lanterns.map((l) => ({ msg: l.msg, name: l.name, meta: lanternMeta(l), color: l.color })),
      gifts: gifts.list.length,
      thanks: ROOF_STATE.thanks || '',
    });
    track('memory_save');
    sound.shutter();
    const r = await saveVideo(blob, 'today-hero-memory.jpg');
    if (r === 'downloaded') setStatus('기억 카드를 저장했어요. 파티장이 닫혀도 남아요');
  } catch (e) {
    reportError(`memory: ${e.message}`);
    setStatus('기억 카드를 만들지 못했어요. 다시 눌러주세요');
  } finally { if (btn) btn.disabled = false; }
}

// ── 점등 기념사진 ──
async function savePhoto() {
  if (!photoShot) {
    photoPending = true; // 지금 화면으로 찍는다
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!photoShot) return setStatus('사진을 만들지 못했어요. 다시 눌러주세요.');
  const giftN = gifts.list.length;
  const blob = await composePhoto(photoShot, {
    owner: ROOF_STATE.owner,
    when: revealLabel(ROOF_STATE.igniteAt),
    lanterns: lanterns.length,
    gifts: giftN,
    friends: people.filter((p) => !p.npc).length || people.length,
  });
  if (!blob) return setStatus('사진을 만들지 못했어요. 다시 눌러주세요.');
  track('photo_save');
  const r = await saveVideo(blob, 'today-hero-photo.jpg');
  sound.shutter();
  if (r === 'downloaded') setStatus('기념사진을 저장했어요. 단톡방이나 스토리에 올려보세요');
  if (r !== 'cancelled' && MODE === 'room' && !ROOF_STATE.isOwner) setTimeout(showCta, 1500); // 사진을 남긴 순간에 '내 파티도' 안내
}
// 점등 뒤 하단 버튼이 두 줄로 넘치지 않게: 기념사진·점등 영상·기억 카드·점등 다시 보기를 '사진·영상' 하나로 모은다
function addPhotoButton() {
  igniteBtn.hidden = true;
  document.querySelector('#btn-calendar')?.remove(); // 점등이 끝났으니 점등 알림은 필요 없다
  if (document.querySelector('#btn-photo')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-photo';
  btn.className = 'btn';
  btn.textContent = '사진·영상';
  document.querySelector('.actions').prepend(btn);
  btn.addEventListener('click', openKeepsakes);
}
function openKeepsakes() {
  openSheet(`<h2>추억 남기기</h2><p class="sheet-lead">파티장은 다음 날 닫혀요. 사진과 영상을 저장해 두세요.</p>
    <button class="btn primary wide" id="keep-photo">기념사진 저장</button>
    ${recorder.blob ? '<button class="btn wide" id="keep-video">점등 영상 저장</button>' : ''}
    ${lanterns.length ? '<button class="btn wide" id="keep-card">기억 카드 저장 (등불 문구 모음)</button>' : ''}
    <button class="btn wide" id="keep-replay">점등 다시 보기</button>`);
  sheetBody.querySelector('#keep-photo').addEventListener('click', savePhoto);
  sheetBody.querySelector('#keep-video')?.addEventListener('click', saveIgniteVideo);
  sheetBody.querySelector('#keep-card')?.addEventListener('click', (e) => saveMemoryCard(e.currentTarget));
  sheetBody.querySelector('#keep-replay').addEventListener('click', () => { closeSheet(); startIgnite({ replay: true }); });
}

// ── 친구 초대(공유) ──
function wireInviteButton() {
  addTopButton('btn-invite', '초대', '<circle cx="9" cy="8" r="3.2"/><path d="M3 19v-1a6 6 0 0 1 12 0v1M18 8v6M15 11h6"/>', async () => {
    track('share_click');
    const url = `${location.origin}/r/${ROOM_ID}`;
    const text = `${ROOF_STATE.owner}의 생일 파티에 등불을 달아주세요. ${revealLabel(ROOF_STATE.igniteAt)}에 다 같이 불을 켜요. (${ROOF_STATE.owner}에게는 비밀!)`;
    if (navigator.share) {
      try { await navigator.share({ title: '오늘의 주인공', text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    const ok = await copyText(`${text}\n${url}`);
    setStatus(ok ? '초대 링크를 복사했어요. 단톡방에 붙여넣어 주세요' : '주소창의 링크를 복사해서 보내주세요');
  });
}

// ── "내 생일 파티도 만들기" 안내 ──
function showCta() {
  const el = document.querySelector('#cta');
  if (!el || ROOF_STATE.ctaDismissed) return;
  el.hidden = false;
  document.body.classList.add('cta-on');
  el.querySelector('a').href = MODE === 'room' ? `/?ref=${ROOM_ID}` : '/';
  clearTimeout(showCta.timer);
  showCta.timer = setTimeout(hideCta, 20000);
}
function hideCta() { const el = document.querySelector('#cta'); if (el) el.hidden = true; document.body.classList.remove('cta-on'); }
document.querySelector('#cta [data-close]')?.addEventListener('click', () => { ROOF_STATE.ctaDismissed = true; hideCta(); });
document.querySelector('#cta a')?.addEventListener('click', () => track('cta_click'));

// ── 리액션(박수·하트·폭죽) ──
const REACT_SYMBOL = { clap: '짝짝', heart: '♥', party: '✦' };
const floats = [];
function showFloat(person, text, cls = '') {
  const el = document.createElement('span');
  el.className = `react-float ${cls}`;
  el.textContent = text;
  labelsEl.appendChild(el);
  floats.push({ el, person, t: 0, dx: (Math.random() - 0.5) * 0.4 });
}
function showReaction(person, kind) {
  sound.react(kind, !!person && person === me);
  person?.av?.gesture(kind === 'clap' ? 'clap' : kind === 'heart' ? 'heart' : 'cheer');
  const el = document.createElement('span');
  el.className = `react-float react-${kind}`;
  el.textContent = REACT_SYMBOL[kind];
  labelsEl.appendChild(el);
  floats.push({ el, person, t: 0, dx: (Math.random() - 0.5) * 0.6 });
}
function wireReactions() {
  const bar = document.querySelector('#reactions');
  bar.hidden = false;
  let tracked = false;
  bar.querySelectorAll('[data-react]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.react;
    try { navigator.vibrate?.(12); } catch { /* 진동 없는 기기 */ }
    showReaction(me, kind);
    conn?.send({ t: 'react', kind });
    if (!tracked) { tracked = true; track('react'); }
  }));
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const base = f.person?.av ? f.person.av.root.position : world.cakeTop;
    tmp.copy(base);
    tmp.x += f.dx;
    placeLabel(f.el, tmp, (f.person?.av ? f.person.av.labelY : 0.6) + 0.4 + f.t * 0.9);
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.6));
    if (f.t > 1.6) { f.el.remove(); floats.splice(i, 1); }
  }
}

// ── 모드별 시작 ──
async function startLanding() {
  sound.music('landing');
  setSkyName('민지');
  document.querySelector('#owner').textContent = '오늘의 주인공';
  document.querySelector('#date').textContent = '친구 생일에 다 같이 불을 켜요';
  track('landing_visit');
  DEMO_FRIENDS.forEach((f, i) => {
    const a = (i / DEMO_FRIENDS.length) * Math.PI * 2;
    addPerson({ name: f.name, color: f.color, hatColor: HAT_COLORS[i % 4], outfit: f.outfit, acc: f.acc }, new THREE.Vector3(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5), { npc: true });
    hangLantern({ name: f.name, msg: f.msg, color: f.color });
  });
  const months = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
  const days = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('');
  const today = kstParts(Date.now());
  const hourName = (h) => (h === 0 ? '자정 (0시)' : `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시`);
  const hours = [0, ...Array.from({ length: 16 }, (_, i) => i + 8)].map((h) => `<option value="${h}">${hourName(h)}</option>`).join('');
  openSheet(`
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-tab="rooms" aria-selected="true">파티장 고르기</button>
      <button type="button" role="tab" data-tab="create" aria-selected="false">새 파티 열기</button>
    </div>
    <section id="tab-rooms" role="tabpanel">
      <div class="rooms-head"><p class="sheet-lead">지금 열려 있는 생일 파티예요. 들어가고 싶은 파티장을 골라주세요.</p><button type="button" class="link-btn" id="rooms-refresh">새로고침</button></div>
      <div class="room-filter" role="group" aria-label="파티장 거르기">
        <button type="button" data-filter="all" aria-pressed="true">전체</button><button type="button" data-filter="live" aria-pressed="false">지금 파티 중</button><button type="button" data-filter="soon" aria-pressed="false">곧 점등</button>
      </div>
      <ul class="room-list" aria-live="polite"><li class="room-empty">파티장 목록을 불러오는 중…</li></ul>
      <button type="button" class="btn primary wide" id="go-create">+ 새 파티장 열기</button>
      <a class="text-link" href="/r/demo">샘플 파티장 먼저 둘러보기</a>
    </section>
    <section id="tab-create" role="tabpanel" hidden>
    <p class="sheet-lead">친구 생일을 몰래 준비하거나, 내 생일 파티를 직접 열 수 있어요. 정한 시각이 되면 모두의 화면에서 함께 불이 켜지고, 파티장은 생일 다음 날 0시 5분에 닫혀요.</p>
    <p class="capacity" role="status"></p>
    <form id="create-form">
      <fieldset class="who-pick"><legend>누구의 파티인가요?</legend>
        <label class="who"><input type="radio" name="who" value="friend" checked><span><b>친구 생일 · 깜짝 파티</b><small>주인공은 점등 전까지 문밖에서 기다려요</small></span></label>
        <label class="who"><input type="radio" name="who" value="self"><span><b>내 생일 · 직접 열기</b><small>바로 들어가서 친구들을 맞이해요</small></span></label>
      </fieldset>
      <label class="field"><span class="owner-label">주인공 이름</span><input id="create-owner" name="owner" maxlength="10" required placeholder="예: 민지"></label>
      <div class="field-row">
        <label class="field"><span>생일 월</span><select id="create-month" name="month">${months}</select></label>
        <label class="field"><span>생일 일</span><select id="create-day" name="day">${days}</select></label>
      </div>
      ${venuePickerHtml(world.id)}
      <label class="field"><span>다 같이 불을 켤 시각 (생일 당일)</span><select id="create-hour" name="hour">${hours}</select><small class="field-hint">자정이 부담되면 생일 저녁처럼 모이기 쉬운 시간을 골라주세요.</small></label>
      <label class="check"><input id="create-listed" type="checkbox" name="listed" checked> 파티장 목록에 보이기<small class="field-hint listed-hint">누구나 첫 화면에서 골라 들어올 수 있어요. 깜짝 파티라면 주인공도 목록에서 볼 수 있으니, 완전히 비밀로 하려면 꺼 주세요.</small></label>
      <label class="check"><input id="create-test" type="checkbox" name="test"> 시험해 보기: 1분 뒤에 바로 점등할게요</label>
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">파티장 열기</button>
      <button type="button" class="text-link" data-tab="rooms">← 파티장 목록으로</button>
    </form>
    </section>
    <p class="legal-links"><a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a> · <a href="/terms" target="_blank" rel="noopener">이용약관</a></p>`, { locked: true });
  const form = document.querySelector('#create-form');
  wireLandingTabs(QS.get('ref') || QS.get('tab') === 'create' ? 'create' : 'rooms');
  form.querySelectorAll('input[name=who]').forEach((r) => r.addEventListener('change', () => {
    const self = form.who.value === 'self';
    form.querySelector('.owner-label').textContent = self ? '내 이름' : '주인공 이름';
    form.querySelector('.listed-hint').textContent = self ? '누구나 첫 화면에서 골라 들어와 축하해 줄 수 있어요.' : '누구나 첫 화면에서 골라 들어올 수 있어요. 깜짝 파티라면 주인공도 목록에서 볼 수 있으니, 완전히 비밀로 하려면 꺼 주세요.';
  }));
  form.month.value = String(today.m);
  form.day.value = String(today.d);
  wireVenuePicker(form);
  // 오늘 더 만들 수 있는 파티장 수
  api('/api/capacity').then((c) => {
    const el = sheetBody.querySelector('.capacity');
    if (!el) return;
    if (c.left <= 0) {
      el.textContent = '오늘 만들 수 있는 파티장이 다 찼어요. 내일 0시에 다시 열려요.';
      el.classList.add('full');
      form.querySelector('button[type=submit]').disabled = true;
    } else if (c.left <= 30) el.textContent = `오늘 만들 수 있는 파티장이 ${c.left}개 남았어요.`;
  }).catch(() => {});
  form.addEventListener('input', () => { form.querySelector('.form-error').textContent = ''; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nc = validateName(form.owner.value);
    if (!nc.ok) { form.querySelector('.form-error').textContent = `주인공 ${nc.error}`; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '파티장 여는 중…';
    try {
      const r = await api('/api/rooftops', {
        method: 'POST',
        body: { owner: nc.value, month: Number(form.month.value), day: Number(form.day.value), hour: Number(form.hour.value), venue: form.venue.value, testSeconds: form.test.checked ? 60 : 0, ref: QS.get('ref') || undefined,
          self: form.who.value === 'self', listed: form.listed.checked },
      });
      store.set(`host:${r.id}`, r.hostKey);
      track(form.who.value === 'self' ? 'create_self' : 'create_friend');
      showCreated(r);
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = '파티장 열기';
    }
  });
}

// ── 첫 화면 탭: 파티장 고르기(게임 서버 고르듯) / 새 파티 열기 ──
let roomsCache = null;
let roomFilter = 'all';
let roomsTimer = null;
function wireLandingTabs(first) {
  const show = (tab) => {
    sheetBody.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    sheetBody.querySelector('#tab-rooms').hidden = tab !== 'rooms';
    sheetBody.querySelector('#tab-create').hidden = tab !== 'create';
    sheetBody.closest('.sheet-card')?.scrollTo?.(0, 0);
    if (tab === 'rooms') loadRooms();
  };
  sheetBody.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  sheetBody.querySelector('#go-create').addEventListener('click', () => show('create'));
  sheetBody.querySelector('#rooms-refresh').addEventListener('click', () => loadRooms());
  sheetBody.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    roomFilter = b.dataset.filter;
    sheetBody.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderRooms();
  }));
  clearInterval(roomsTimer);
  roomsTimer = setInterval(() => { if (!sheetBody.querySelector('#tab-rooms')?.hidden && !document.hidden) loadRooms(true); }, 20_000);
  show(first);
}
async function loadRooms(quiet = false) {
  const list = sheetBody.querySelector('.room-list');
  if (!list) return;
  if (!quiet && !roomsCache) list.innerHTML = '<li class="room-empty">파티장 목록을 불러오는 중…</li>';
  try {
    const d = await api('/api/rooftops');
    serverOffset = d.now - Date.now();
    roomsCache = d.rooms;
  } catch { if (!roomsCache) list.innerHTML = '<li class="room-empty">목록을 불러오지 못했어요. 새로고침을 눌러주세요.</li>'; return; }
  renderRooms();
}
function roomWhen(r) {
  const now = serverNow();
  if (now >= r.igniteAt) return { live: true, text: '지금 파티 중' };
  const left = r.igniteAt - now;
  const h = Math.floor(left / 3600_000);
  const m = Math.ceil((left % 3600_000) / 60_000);
  return { live: false, text: h >= 24 ? `${Math.floor(h / 24)}일 뒤 점등` : h >= 1 ? `${h}시간 ${m}분 뒤 점등` : `${m}분 뒤 점등` };
}
function renderRooms() {
  const list = sheetBody.querySelector('.room-list');
  if (!list || !roomsCache) return;
  const rooms = roomsCache.filter((r) => {
    const w = roomWhen(r);
    return roomFilter === 'all' || (roomFilter === 'live' ? w.live : !w.live && r.igniteAt - serverNow() < 6 * 3600_000);
  });
  if (!rooms.length) {
    list.innerHTML = `<li class="room-empty">${roomsCache.length ? '조건에 맞는 파티장이 없어요.' : '아직 열린 파티장이 없어요. 첫 파티장을 열어보세요!'}</li>`;
    return;
  }
  list.innerHTML = rooms.map((r) => {
    const w = roomWhen(r);
    const full = r.online >= r.cap;
    const load = full ? ['가득', 'full'] : r.online >= r.cap * 0.6 ? ['북적', 'busy'] : ['원활', 'ok'];
    const v = VENUES[r.venue] || VENUES[DEFAULT_VENUE];
    return `<li><a class="room-item${w.live ? ' live' : ''}" href="/r/${esc(r.id)}" data-venue="${esc(r.venue)}">
      <span class="room-thumb venue-thumb" aria-hidden="true"></span>
      <span class="room-main">
        <b class="room-title">${esc(r.owner)}의 생일 파티${r.self ? '' : ' <i class="room-tag">깜짝</i>'}</b>
        <span class="room-sub">${esc(v.name)} · <span class="${w.live ? 'room-live' : ''}">${w.text}</span></span>
        <span class="room-sub">등불 ${r.lanterns}개${r.bots ? ` · 응원단 ${r.bots}` : ''}</span>
      </span>
      <span class="room-load ${load[1]}" title="접속 ${r.online}/${r.cap}명"><b>${r.online}</b>/${r.cap}<small>${full ? '구경 가능' : load[0]}</small></span>
    </a></li>`;
  }).join('');
  list.querySelectorAll('.room-item').forEach((a) => a.addEventListener('click', () => track('room_pick')));
}

// 파티 장소 고르기: 고르면 뒤 배경이 바로 그 장소로 바뀐다
function venuePickerHtml(current) {
  const cards = Object.entries(VENUES).map(([id, v]) => `
    <label class="venue-card" data-venue="${id}"><input type="radio" name="venue" value="${id}"${id === current ? ' checked' : ''}><span class="venue-thumb"></span><span class="venue-name">${esc(v.name)}</span></label>`).join('');
  return `<fieldset class="venue-pick"><legend>파티 장소</legend><div class="venue-grid">${cards}</div><p class="venue-desc">${esc(VENUES[current]?.desc || '')}</p></fieldset>`;
}
function wireVenuePicker(root, onPick) {
  root.querySelectorAll('input[name=venue]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    loadVenue(r.value);
    sound.whoosh();
    root.querySelector('.venue-desc').textContent = VENUES[r.value].desc;
    sound.click?.(2);
    onPick?.(r.value);
  }));
}

function showCreated(r) {
  const friendUrl = `${location.origin}/r/${r.id}`;
  const ownerUrl = `${friendUrl}?k=${r.ownerKey}`;
  const hostUrl = `${friendUrl}?h=${r.hostKey}`;
  const isTest = r.igniteAt - r.now < 3600_000;
  if (r.self) {
    store.set(`owner:${r.id}`, r.ownerKey);
    openSheet(`
    <h2>${esc(r.owner)}님의 생일 파티장을 열었어요</h2>
    <p class="sheet-lead">${isTest ? '시험용 파티장이라 1분 뒤에 불이 켜지고 10분 뒤에 닫혀요.' : `${revealLabel(r.igniteAt)}에 다 같이 불을 켜고, 다음 날 0시 5분에 파티장이 닫혀요.`}</p>
    <div class="link-card">
      <p class="link-title">친구들에게 보낼 초대 링크</p>
      <p class="link-desc">${r.listed ? '파티장 목록에도 보여서 누구나 골라 들어올 수 있어요.' : '이 링크로만 들어올 수 있어요.'}</p>
      <input id="link-friend" readonly value="${esc(friendUrl)}">
      <button class="btn" data-copy="link-friend">초대 링크 복사</button>
    </div>
    <div class="link-card">
      <p class="link-title">내 입장 링크 (나만 보관)</p>
      <p class="link-desc">주인공으로 들어가는 링크예요. 응원단 보내기·관리도 여기서 해요. 다른 사람에게 보내지 마세요.</p>
      <input id="link-owner" readonly value="${esc(ownerUrl)}">
      <button class="btn" data-copy="link-owner">내 링크 복사</button>
    </div>
    <p class="copy-status" role="status"></p>
    <a class="btn primary wide" href="/r/${esc(r.id)}?k=${esc(r.ownerKey)}">내 파티장으로 들어가기</a>`, { locked: true });
    sheetBody.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
      const input = document.getElementById(b.dataset.copy);
      input.select();
      copyText(input.value, sheetBody.querySelector('.copy-status'));
    }));
    return;
  }
  openSheet(`
    <h2>${esc(r.owner)}의 파티장을 열었어요</h2>
    <p class="sheet-lead">${isTest ? '시험용 파티장이라 1분 뒤에 불이 켜지고 10분 뒤에 닫혀요.' : `${revealLabel(r.igniteAt)}에 불이 켜지고, 다음 날 0시 5분에 파티장이 닫혀요.`} 링크 두 개를 각각 보내주세요.</p>
    <div class="link-card">
      <p class="link-title">친구들에게 보낼 링크</p>
      <p class="link-desc">친구들이 들어와서 등불을 달아요.</p>
      <input id="link-friend" readonly value="${esc(friendUrl)}">
      <button class="btn" data-copy="link-friend">친구 링크 복사</button>
    </div>
    <div class="link-card">
      <p class="link-title">${esc(r.owner)}에게 보낼 링크</p>
      <p class="link-desc">점등 전에는 닫힌 문만 보여요. 등불 내용은 그때까지 비밀이에요.</p>
      <input id="link-owner" readonly value="${esc(ownerUrl)}">
      <button class="btn" data-copy="link-owner">주인공 링크 복사</button>
    </div>
    <div class="link-card">
      <p class="link-title">나만 갖고 있을 관리 링크</p>
      <p class="link-desc">링크를 다시 보거나, 등불을 숨기거나, 파티장을 지울 때 써요. 다른 사람에게 보내지 마세요.</p>
      <input id="link-host" readonly value="${esc(hostUrl)}">
      <button class="btn" data-copy="link-host">관리 링크 복사</button>
    </div>
    <p class="copy-status" role="status"></p>
    <a class="btn primary wide" href="/r/${esc(r.id)}">파티장으로 가서 첫 등불 달기</a>`, { locked: true });
  sheetBody.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.copy);
    input.select();
    copyText(input.value, sheetBody.querySelector('.copy-status'));
  }));
}

function startDemo() {
  sound.music('rooftop');
  ROOF_STATE.owner = '민지';
  setSkyName('민지');
  document.querySelector('#owner').textContent = '민지의 생일 파티';
  document.querySelector('#date').textContent = '샘플 파티장이에요';
  // 샘플에서는 다섯 장소를 바로 바꿔 볼 수 있다
  addTopButton('btn-venue', '장소', '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>', () => {
    openSheet(`<h2>파티 장소 둘러보기</h2><p class="sheet-lead">파티를 열 때 이 다섯 곳 중에서 고를 수 있어요.</p><form id="venue-form">${venuePickerHtml(world.id)}</form>`);
    wireVenuePicker(document.querySelector('#venue-form'), () => track('venue_preview'));
  });
  me = addPerson({ name: '나', color: 0xf29bb3, hatColor: 0x8fd3c1, outfit: QS.get('outfit') || 'dress', acc: QS.get('acc') || 'ribbon' }, new THREE.Vector3(0, 0, 3.2), { isMe: true, isOwner: QS.get('as') === 'owner' });
  DEMO_FRIENDS.forEach((f, i) => {
    const a = (i / DEMO_FRIENDS.length) * Math.PI * 2;
    addPerson({ name: f.name, color: f.color, hatColor: HAT_COLORS[i % 4], outfit: f.outfit, acc: f.acc }, new THREE.Vector3(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5), { npc: true });
    hangLantern({ name: f.name, msg: f.msg, color: f.color });
  });
  countEl.textContent = `함께 있는 친구 ${people.length}명`;
  // 샘플 선물
  [['balloons', 0x8fd3c1, '도윤', -6, -3], ['balloons', 0xffc46b, '', 6.5, 2], ['topping', 0xf29bb3, '엄마', 0, 0], ['topping', 0xf29bb3, '', 0, 0], ['topping', 0xf29bb3, '하은', 0, 0], ['fireworks', 0xb9a6f2, '', 0, 0], ['fireworks', 0xf29bb3, '수아', 0, 0]]
    .forEach(([item, color, name, x, z]) => gifts.add({ id: demoGiftId++, item, color, name, anonymous: !name, x, z }));
  wireGiftButton(async (b) => {
    const spot = giftSpot();
    return { id: demoGiftId++, item: b.item, color: b.color, name: b.anonymous ? '' : b.name, anonymous: b.anonymous, x: spot.x, z: spot.z };
  }, () => '나');
  igniteBtn.textContent = '점등 미리보기';
  igniteBtn.hidden = false;
  // 샘플: 처음 누르면 주인공 민지가 입장 행진을 한 뒤 점등한다
  igniteBtn.addEventListener('click', () => {
    if (QS.get('quick')) return startIgnite();
    if (processionDone) return startIgnite({ replay: true });
    const minji = addPerson({ name: '민지', color: 0xffc46b, outfit: 'dress' }, world.entrance.clone(), { npc: true, isOwner: true });
    startProcession(minji, { then: () => { igniteCd.demoAt = Date.now() + 3200; } });
  });
  document.querySelector('#btn-lantern').addEventListener('click', () => openLanternSheet(async ({ name, msg, color, rel, years }) => {
    hangLantern({ name: name || '나', msg, color, rel, years }, { from: me.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) });
    afterHang();
  }, '나'));
  wireLettersButton();
  wireGroupPhotoButton();
  wireLiteButton();
  wireEmotes();
  wireReactions();
  updateGoal();
  track('demo_visit');
  setStatus('화면을 눌러 걸어보세요. 등불을 누르면 친구의 말이 보여요', 6000);
}

let conn = null;
let myId = null;
async function startRoom() {
  let data;
  // 서버가 잠깐 끊겨도(재시작 등) 포기하지 않고 다시 연결한다
  for (let i = 0; ; i++) {
    try {
      data = await api(`/api/rooftops/${ROOM_ID}${authQuery()}`);
      break;
    } catch (err) {
      if (err.status && err.status < 500) {
        openSheet(`<h2>파티장을 열지 못했어요</h2><p class="sheet-lead">${esc(err.message)}</p><a class="btn primary wide" href="/">새 파티장 만들기</a>`, { locked: true });
        return;
      }
      openSheet('<h2>파티장에 연결하는 중이에요</h2><p class="sheet-lead">잠시 연결이 끊겼어요. 자동으로 다시 연결하고 있어요.</p>', { locked: true });
      await new Promise((r) => setTimeout(r, Math.min(10_000, 1500 * 2 ** i)));
    }
  }
  if (sheet.classList.contains('locked')) closeSheet();
  serverOffset = data.now - Date.now();
  Object.assign(ROOF_STATE, { owner: data.owner, igniteAt: data.igniteAt, endAt: data.endAt || 0, isOwner: data.role === 'owner', role: data.role, candlesOut: !!data.candlesOut,
    self: !!data.self, canManage: !!data.canManage, listed: !!data.listed });
  loadVenue(data.venue);
  if (data.thanks) showThanks(data.thanks);
  if (data.candlesOut) world.setCandles(false);
  if (HOST_KEY && data.role !== 'host') HOST_KEY = null; // 저장된 관리 키가 맞지 않으면 버린다
  if (data.canManage) {
    ROOF_STATE.hidden = data.lanterns.filter((l) => l.hidden);
    data.lanterns = data.lanterns.filter((l) => !l.hidden);
    ROOF_STATE.keys = { ownerKey: data.ownerKey, hostKey: data.hostKey };
    addManageButton();
  }
  setSkyName(data.owner);
  document.querySelector('#owner').textContent = `${data.owner}의 생일 파티`;
  const tick = () => { document.querySelector('#date').textContent = countdownText(); checkClosing(); };
  tick();
  setInterval(tick, 1000);

  const before = serverNow() < ROOF_STATE.igniteAt;
  igniteBtn.hidden = true; // 점등 뒤 '점등 다시 보기'는 '사진·영상' 안에 있다
  igniteBtn.textContent = '점등 다시 보기';
  igniteBtn.addEventListener('click', () => startIgnite({ replay: true }));

  if (ROOF_STATE.isOwner && !ROOF_STATE.self && serverNow() < ROOF_STATE.igniteAt - 15_000) {
    return showDoor(data.lanternCount || 0, data.giftCount || 0);
  }
  for (const l of data.lanterns) hangLantern(l);
  addBots(data.bots || []);
  for (const g of data.gifts || []) gifts.add(g);
  if (!before) setLitInstantly();
  if (before) addCalendarButton();
  updateGoal();
  // 이미 점등을 본 사람이 다시 들어오면 기념사진·촛불 버튼을 바로 보여준다
  if (!before && store.get(`seen:${ROOM_ID}`)) afterIgnite();

  if (ROOF_STATE.isOwner) return enterRoom({ name: data.owner, color: 0xffc46b, outfit: store.get('owner-outfit') });
  let saved = store.get('visitor');
  if (saved && !validateName(saved.name).ok) saved = null;
  askVisitor(saved);
}

function askVisitor(saved) {
  const colors = [0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffc46b];
  openSheet(`
    <h2>${esc(ROOF_STATE.owner)}의 파티장에 들어가요</h2>
    <p class="sheet-lead">${ROOF_STATE.self ? `${esc(ROOF_STATE.owner)}가 직접 연 생일 파티예요. 등불을 달고 ${revealLabel(ROOF_STATE.igniteAt)}에 다 같이 불을 켜요.` : `${esc(ROOF_STATE.owner)}는 ${revealLabel(ROOF_STATE.igniteAt)} 점등 전까지 이 파티장을 볼 수 없어요. 친구들끼리 등불을 모아 깜짝 놀라게 해주세요.`}</p>
    <form id="visitor-form">
      <label class="field"><span>내 이름</span><input id="visitor-name" name="name" maxlength="10" required placeholder="예: 수아" value="${esc(saved?.name || '')}"></label>
      <fieldset class="swatches"><legend>내 옷 색</legend>
        ${colors.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c}" ${(saved?.color ?? colors[0]) === c ? 'checked' : ''}><span style="--c:${hex6(c)}" aria-label="옷 색 ${i + 1}"></span></label>`).join('')}
      </fieldset>
      ${outfitPickerHtml(saved?.outfit)}
      ${accPickerHtml(saved?.acc)}
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">파티장으로 들어가기</button>
    </form>`, { locked: true });
  const form = document.querySelector('#visitor-form');
  form.addEventListener('input', () => { form.querySelector('.form-error').textContent = ''; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nc = validateName(form.name.value);
    if (!nc.ok) { form.querySelector('.form-error').textContent = nc.error; return; }
    const v = { name: nc.value, color: Number(new FormData(form).get('color')), outfit: new FormData(form).get('outfit') || DEFAULT_OUTFIT, acc: new FormData(form).get('acc') || 'none' };
    store.set('visitor', v);
    closeSheet();
    enterRoom(v);
  });
}

// 파티 의상 고르기(드레스·정장·파티복)
function outfitPickerHtml(current = DEFAULT_OUTFIT) {
  const cur = OUTFITS[current] ? current : DEFAULT_OUTFIT;
  return `<fieldset class="outfit-pick"><legend>파티 의상</legend><div class="outfit-row">${Object.entries(OUTFITS).map(([id, o]) => `<label class="outfit-chip"><input type="radio" name="outfit" value="${id}"${id === cur ? ' checked' : ''}><span>${esc(o.name)}</span></label>`).join('')}</div></fieldset>`;
}

// 꾸미기 소품 고르기
function accPickerHtml(current = 'none') {
  const cur = ACCESSORIES[current] ? current : 'none';
  return `<fieldset class="outfit-pick"><legend>꾸미기</legend><div class="outfit-row acc-row">${Object.entries(ACCESSORIES).map(([id, o]) => `<label class="outfit-chip"><input type="radio" name="acc" value="${id}"${id === cur ? ' checked' : ''}><span>${esc(o.name)}</span></label>`).join('')}</div></fieldset>`;
}

function showDoor(count, giftCount = 0) {
  const door = document.querySelector('#door');
  door.hidden = false;
  sound.music('door');
  const doorSound = door.querySelector('.door-sound');
  doorSound.addEventListener('click', async () => {
    const on = await sound.toggle();
    doorSound.textContent = on ? '소리 끄기' : '소리 켜고 기다리기';
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('span').textContent = on ? '소리 끄기' : '소리 켜기';
  });
  const title = door.querySelector('.door-title');
  const sub = door.querySelector('.door-sub');
  const cnt = door.querySelector('.door-count');
  title.textContent = `${ROOF_STATE.owner}님, 파티장 문은 ${revealLabel(ROOF_STATE.igniteAt)}에 열려요`;
  // 기다리는 동안 주인공이 입을 옷을 고른다(왕관과 망토는 주인공만)
  if (!door.querySelector('.outfit-pick')) {
    const wrap = document.createElement('form');
    wrap.className = 'door-outfit';
    wrap.innerHTML = outfitPickerHtml(store.get('owner-outfit')).replace('<legend>파티 의상</legend>', '<legend>입장할 때 입을 옷 · 왕관과 망토는 주인공만</legend>');
    door.querySelector('.door-sound').before(wrap);
    wrap.addEventListener('change', () => store.set('owner-outfit', new FormData(wrap).get('outfit')));
  }
  if (!door.querySelector('.door-remind')) {
    const rb = document.createElement('button');
    rb.type = 'button';
    rb.className = 'btn door-remind';
    rb.textContent = '문 열리기 전에 알림 받기';
    door.querySelector('.door-sound').after(rb);
    rb.addEventListener('click', openReminder);
  }
  track('owner_door');
  const render = () => {
    sub.textContent = countdownText();
    const things = [count ? `등불 ${count}개` : '', giftCount ? `선물 ${giftCount}개` : ''].filter(Boolean).join('와 ');
    cnt.textContent = things ? `문 너머에서 ${things}가 기다리고 있어요` : '친구들이 무언가를 준비하고 있어요';
  };
  render();
  const poll = setInterval(async () => {
    try {
      const d = await api(`/api/rooftops/${ROOM_ID}${authQuery()}`);
      if (d.now) serverOffset = d.now - Date.now(); // 기다리는 동안 기기 시계가 바뀌어도 맞춘다
      count = d.lanternCount ?? d.lanterns.length;
      giftCount = d.giftCount ?? (d.gifts || []).length;
    } catch { /* 다음에 다시 */ }
  }, 10_000);
  const timer = setInterval(() => {
    render();
    if (serverNow() >= ROOF_STATE.igniteAt - 15_000) {
      clearInterval(timer);
      clearInterval(poll);
      openDoor();
    }
  }, 500);
}

async function openDoor() {
  const door = document.querySelector('#door');
  door.classList.add('opening');
  sound.doorOpen();
  try {
    const d = await api(`/api/rooftops/${ROOM_ID}${authQuery()}`);
    for (const l of d.lanterns) hangLantern(l);
    for (const g of d.gifts || []) gifts.add(g);
    addBots(d.bots || []);
  } catch { /* 등불은 실시간으로 다시 받는다 */ }
  setTimeout(() => { door.hidden = true; }, 1600);
  enterRoom({ name: ROOF_STATE.owner, color: 0xffc46b, outfit: store.get('owner-outfit') });
}

let myVisitor = null;
function enterRoom(visitor) {
  myVisitor = visitor;
  sound.music(serverNow() >= ROOF_STATE.igniteAt ? 'party' : 'rooftop'); // 점등이 지났으면 파티 곡
  track(ROOF_STATE.isOwner ? 'owner_enter' : 'friend_visit');
  const spawn = new THREE.Vector3((Math.random() - 0.5) * 4, 0, 3 + Math.random() * 2);
  me = addPerson({ name: ROOF_STATE.isOwner ? ROOF_STATE.owner : visitor.name, color: visitor.color, hatColor: 0x8fd3c1, outfit: visitor.outfit, acc: visitor.acc }, spawn, { isMe: true, isOwner: ROOF_STATE.isOwner });
  countEl.textContent = '연결 중';
  conn = connectRoom({
    room: ROOM_ID,
    key: ROOF_STATE.isOwner ? OWNER_KEY : null,
    hostKey: ROOF_STATE.role === 'host' ? HOST_KEY : null,
    hello: { name: visitor.name, color: visitor.color, hat: Math.floor(Math.random() * 4), outfit: visitor.outfit, acc: visitor.acc },
    onMessage: handleNet,
    onClose: (code, fatal) => {
      if (code === 4004) return showEnded();
      if (code === 4003) openSheet('<h2>파티장이 지워졌어요</h2><p class="sheet-lead">만든 사람이 이 파티장을 지웠어요.</p><a class="btn primary wide" href="/">새 파티장 만들기</a>', { locked: true });
      if (code === 4002) setStatus('파티장이 가득 찼어요. 잠시 후 다시 들어와주세요.', 8000);
      else if (code === 4001) setStatus('아직 문이 열리지 않았어요.', 8000);
      else countEl.textContent = '다시 연결하는 중';
      if (fatal) countEl.textContent = '연결 끊김';
    },
  });
  document.querySelector('#btn-lantern').addEventListener('click', () => openLanternSheet(async ({ name, tpl, color, rel, years }) => {
    const l = await api(`/api/rooftops/${ROOM_ID}/lanterns`, { method: 'POST', body: { name, tpl, color, rel, years, peerId: myId } });
    hangLantern(l, { from: me ? me.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : null });
    afterHang();
  }, ROOF_STATE.isOwner ? ROOF_STATE.owner : visitor.name));
  wireGiftButton(async (b) => {
    const spot = giftSpot();
    return api(`/api/rooftops/${ROOM_ID}/gifts`, { method: 'POST', body: { ...b, x: spot.x, z: spot.z, peerId: myId } });
  }, () => (ROOF_STATE.isOwner ? ROOF_STATE.owner : visitor.name));
  wireLettersButton();
  wireGroupPhotoButton();
  wireLiteButton();
  wireEmotes();
  wireReactions();
  if (!ROOF_STATE.isOwner) wireInviteButton();
  setStatus(ROOF_STATE.isOwner ? '친구들이 준비한 파티장이에요. 곧 점등이에요' : `등불을 달고, ${revealLabel(ROOF_STATE.igniteAt)}에 다시 와서 같이 불을 켜요`, 6500);
}

function addPeer(v) {
  if (peersById.has(v.id) || v.id === myId) return;
  const p = addPerson({ name: v.name, color: v.color, hatColor: HAT_COLORS[v.hat % 4], outfit: v.outfit, acc: v.acc }, new THREE.Vector3(v.x, 0, v.z), { isOwner: v.owner });
  p.net = new THREE.Vector3(v.x, 0, v.z);
  peersById.set(v.id, p);
  return p;
}

function handleNet(m) {
  if (m.t === 'welcome') {
    myId = m.you;
    serverOffset = m.now - Date.now();
    lastSentPos.set(999, 0, 999); // 다시 연결되면 내 위치를 바로 알린다
    // 다시 연결되는 동안 놓친 '나감'을 바로잡는다: 지금 목록에 없는 사람은 지운다(유령·중복 방지)
    const alive = new Set(m.peers.map((v) => v.id));
    for (const [id, p] of [...peersById]) if (!alive.has(id)) { removePerson(p); peersById.delete(id); }
    for (const v of m.peers) addPeer(v);
    // 구경 모드였다가 자리가 나서 인형으로 들어온 경우 내 인형을 다시 만든다
    if (!m.spectator && !me && ROOF_STATE.spectator && myVisitor) {
      ROOF_STATE.spectator = false;
      document.body.classList.remove('is-spectator');
      me = addPerson({ name: ROOF_STATE.isOwner ? ROOF_STATE.owner : myVisitor.name, color: myVisitor.color, hatColor: 0x8fd3c1, outfit: myVisitor.outfit, acc: myVisitor.acc }, new THREE.Vector3(0, 0, 4), { isMe: true, isOwner: ROOF_STATE.isOwner });
    }
    if (m.spectator && me) {
      // 아바타 자리가 다 차서 구경 모드: 내 인형 없이 파티장을 둘러보고 등불·선물은 그대로 보낼 수 있다
      ROOF_STATE.spectator = true;
      removePerson(me);
      me = null;
      document.body.classList.add('is-spectator');
      setStatus('파티장이 가득 차서 구경 모드로 들어왔어요. 등불과 선물은 그대로 보낼 수 있어요', 7000);
    }
    countEl.textContent = `함께 있는 친구 ${m.peers.length + (m.spectator ? 0 : 1)}명`;
    // 주인공이 처음 들어오는 순간(점등 전후 잠깐)에는 입장 행진
    if (ROOF_STATE.isOwner && me && serverNow() < ROOF_STATE.igniteAt + 60_000) startProcession(me);
  } else if (m.t === 'join') {
    addPeer(m.peer);
    if (m.peer.owner) {
      if (serverNow() > ROOF_STATE.igniteAt + 60_000 || !startProcession(peersById.get(m.peer.id))) setStatus(`${josa(ROOF_STATE.owner, '이가')} 파티장에 들어왔어요!`, 6000);
    } else {
      sound.doorbell();
      setStatus(`${josa(m.peer.name, '이가')} 파티장에 들어왔어요`, 3000);
    }
  } else if (m.t === 'leave') {
    const p = peersById.get(m.id);
    if (p) { removePerson(p); peersById.delete(m.id); }
  } else if (m.t === 'bots') {
    addBots(m.bots || []);
    if (!ROOF_STATE.isOwner || ROOF_STATE.self) setStatus(`응원단 ${m.bots.length}명이 등불을 들고 왔어요`);
  } else if (m.t === 'count') {
    ROOF_STATE.humans = m.n;
    ROOF_STATE.watching = m.watching;
    renderCount();
  } else if (m.t === 'react') {
    showReaction(m.id ? peersById.get(m.id) : null, m.kind);
  } else if (m.t === 'thanks') {
    showThanks(m.text);
    setStatus(`${josa(ROOF_STATE.owner, '이가')} 답례를 남겼어요: ${m.text}`, 6000);
  } else if (m.t === 'candles') {
    if (m.songAt) startSong(m.songAt - serverOffset);
    else blowCandles(true);
  } else if (m.t === 'gmo') {
    const lead = peersById.get(m.by);
    const others = (m.ids || []).map((id) => (id === myId ? me : peersById.get(id)) || null);
    startGroupMotion(m.kind, lead, others, { cx: m.cx, cz: m.cz, ang: m.ang, at: m.at - serverOffset });
  } else if (m.t === 'emote') {
    playEmote(peersById.get(m.id), m.kind);
  } else if (m.t === 'fx') {
    const hs = (world.hotspots || []).find((h) => h.id === m.id);
    const who = m.by ? peersById.get(m.by) : null;
    if (hs && who) useHotspot(hs, who, { remote: true });
  } else if (m.t === 'photo') {
    startGroupPhoto(m.at - serverOffset);
  } else if (m.t === 'ended') {
    showEnded();
  } else if (m.t === 'state') {
    for (const [id, x, z] of m.p) {
      const p = peersById.get(id);
      if (p) p.net.set(x, 0, z);
    }
  } else if (m.t === 'hop') {
    peersById.get(m.id)?.av.hop();
  } else if (m.t === 'lantern-hide') {
    removeLantern(m.id);
    if (ROOF_STATE.role === 'host') refreshLanterns(); // 숨긴 등불 목록 갱신(신고 누적 자동 숨김 포함)
  } else if (m.t === 'lantern-show') {
    refreshLanterns();
  } else if (m.t === 'gift') {
    if (m.gift.by === myId) return; // 내가 보낸 선물은 이미 놓여 있다
    onGiftArrived(m.gift, true);
    setStatus(`${josa(giftLabel(m.gift), '이가')} ${josa(GIFT_ITEMS[m.gift.item].name, '을를')} 보냈어요`, 3500);
  } else if (m.t === 'lantern') {
    if (m.lantern.by === myId) return; // 내가 단 등불은 이미 걸려 있다
    const who = peersById.get(m.lantern.by);
    const l = hangLantern(m.lantern, { from: who ? who.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : null });
    if (l) { sound.lanternUp(false); setStatus(`${josa(m.lantern.name, '이가')} 등불을 달았어요`, 3000); }
  }
}

// ── 루프 ──
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 6, 14);
const camLook = new THREE.Vector3();
let lastSent = 0;
let lastSentPos = new THREE.Vector3(999, 0, 999);

function placeLabel(el, worldPos, yOff) {
  tmp.copy(worldPos).setY(worldPos.y + yOff).project(camera);
  if (tmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = '';
  const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
}

const doorEl = document.querySelector('#door');
let booted = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // 닫힌 문 화면이나 숨겨진 탭에서는 그리지 않는다
  if (document.hidden || (!doorEl.hidden && !doorEl.classList.contains('opening'))) return;
  if (lite) {
    // 3D를 그리지 않고 점등·노래 시각만 챙긴다
    updateSong();
    updateIgniteCountdown();
    updateIgnite(dt);
    if (MODE === 'room' && !ignitedThisSession && serverNow() >= ROOF_STATE.igniteAt && !store.get(`seen:${ROOM_ID}`) && serverNow() - ROOF_STATE.igniteAt < 600_000) {
      store.set(`seen:${ROOM_ID}`, true);
      startIgnite();
    }
    return;
  }
  adaptQuality(dt);

  if (groupPhoto) updateGroupPhoto(dt);
  else if (procession) updateProcession(dt);
  else if (ceremony) updateCeremony(dt);
  else {
    const busy = candleBlow?.blower; // 촛불을 부는 사람은 연출이 움직인다
    const nowMs = performance.now();
    if (me && me !== busy && !(me.busyUntil > nowMs)) updateMe(dt);
    for (const p of people) {
      if (p === busy || p.busyUntil > nowMs) continue; // 열기구를 탄 사람은 놀거리가 움직인다
      // 촛불을 부는 동안 다른 사람은 케이크와 카메라 사이를 비켜 준다
      if (candleBlow && p.av.root.position.z > 0.2 && p.av.root.position.z < 7) p.av.root.position.z -= dt * 3.5;
      if (p.npc) updateNpc(p, dt);
      else if (!p.isMe) updatePeer(p, dt);
    }
  }
  updateCandleBlow(dt);
  updateGroupMotions(dt);
  separatePeople(dt);
  applyZones(t, dt);
  updatePoses(dt);
  updateSpots();
  updateSong();
  updateIgniteCountdown();

  // 내 위치 보내기(초당 10번, 움직였을 때만)
  if (conn && me && !ceremony && performance.now() - lastSent > 100) {
    const pos = me.av.root.position;
    if (pos.distanceTo(lastSentPos) > 0.02) {
      if (conn.send({ t: 'pos', x: pos.x, z: pos.z, dx: me.dirX })) lastSentPos.copy(pos);
    }
    lastSent = performance.now();
  }

  // 실제 파티장: 자정이 되면 모두의 화면에서 점등
  if (MODE === 'room' && (me || ROOF_STATE.spectator) && !ignitedThisSession && serverNow() >= ROOF_STATE.igniteAt && !store.get(`seen:${ROOM_ID}`) &&
      (serverNow() - ROOF_STATE.igniteAt < 600_000 || ROOF_STATE.isOwner)) {
    // 자정 직후에 있던 사람, 또는 자정 뒤 처음 들어온 주인공에게 점등을 한 번 보여준다(본 뒤에는 '점등 다시 보기'로)
    store.set(`seen:${ROOM_ID}`, true);
    startIgnite();
  }

  // 카메라
  if (viewOverride && performance.now() > viewOverride.until) { viewOverride = null; document.body.classList.remove('scope-view'); resize(); }
  if (viewOverride && !ceremony && !ignite) {
    camPos.lerp(viewOverride.pos, Math.min(1, dt * 2.5));
    camera.position.copy(camPos);
    camLook.lerp(viewOverride.look, Math.min(1, dt * 2.5));
    camera.fov = THREE.MathUtils.lerp(camera.fov, viewOverride.fov || camera.fov, Math.min(1, dt * 2));
    camera.updateProjectionMatrix();
  } else if (cineCam) {
    const k = THREE.MathUtils.smootherstep(Math.min(1, (performance.now() - cineCam.start) / cineCam.ms), 0, 1);
    camera.position.lerpVectors(cineCam.p0, cineCam.p1, k);
    camLook.lerpVectors(cineCam.l0, cineCam.l1, k);
    if (cineCam.fov && Math.abs(camera.fov - cineCam.fov) > 0.01) { camera.fov = cineCam.fov; camera.updateProjectionMatrix(); }
  } else if (overviewCam) {
    const b = world.bounds;
    const cz = ((b.minZ ?? -(b.d || 2 * b.r) / 2) + (b.maxZ ?? (b.d || 2 * b.r) / 2)) / 2;
    const span = Math.max(b.maxX ? b.maxX - b.minX : b.w || 2 * b.r, b.maxZ ? b.maxZ - b.minZ : b.d || 2 * b.r);
    camera.position.set(0, span * 0.62, cz + span * 0.62);
    world.clampCamera?.(camera.position);
    camLook.set(0, 0, cz);
  } else if (ogPose) {
    camera.position.set(0, 5.2, 12.5);
    world.clampCamera?.(camera.position);
    camera.position.x += 0.9; // 돔 뼈대가 화면 한가운데를 가리지 않게 살짝 비켜서
    camLook.set(0, 3.2, 0);
  } else if (procession) processionCamera(dt);
  else if (candleBlow) candleCamera(dt);
  else if (ceremony || ignite?.replay) ceremonyCamera(dt); // 다시 보기도 점등식과 같은 구도로
  else if (groupPhoto) {
    camPos.lerp(PHOTO_CAM, Math.min(1, dt * 3));
    camera.position.copy(camPos);
    camLook.lerp(PHOTO_LOOK, Math.min(1, dt * 3));
  } else if (MODE === 'landing' || !me) {
    const a = t * 0.05;
    camPos.lerp(new THREE.Vector3(Math.sin(a) * 15, 7, Math.cos(a) * 15), Math.min(1, dt * 2));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(0, 2.4, 0), Math.min(1, dt * 2));
  } else {
    if (!viewOverride) easeFov(baseFov(), dt);
    const mp = me.av.root.position;
    const camDist = dist + (ignite ? 3 : 0);
    const lift = me.av.lift || 0; // 열기구·트램펄린으로 떠오르면 카메라도 따라 올라간다
    const want = new THREE.Vector3(mp.x + Math.sin(yaw) * camDist, 2.6 + camDist * 0.42 + lift, mp.z + Math.cos(yaw) * camDist);
    clampToBounds(want, 0.2);
    world.clampCamera?.(want);
    const sky = ignite ? THREE.MathUtils.smoothstep(ignite.t, 0.6, 2.4) : 0;
    want.y -= sky * (want.y - 1.4);
    camPos.lerp(want, Math.min(1, dt * (ignite ? 2 : 5)));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(mp.x * (1 - sky), 1.6 + lift * (1 - sky) + sky * 7.4, mp.z * (1 - sky) + sky * -6), Math.min(1, dt * (ignite ? 2 : 6)));
  }
  camera.lookAt(camLook);

  // 사람이 많으면 이름표가 화면을 덮으므로: 가까운 12명 + 나 + 주인공만 이름표를 보인다
  let labelSet = null;
  if (people.length > 14) {
    labelSet = new Set(people
      .map((p) => [p, p.av.root.position.distanceToSquared(camera.position)])
      .sort((x, y) => x[1] - y[1])
      .slice(0, 12)
      .map((x) => x[0]));
  }
  for (const p of people) {
    p.av.update(dt, p.speed, camera, p.dirX);
    const far = p.av.root.position.distanceTo(camera.position) > 22;
    const show = p.isMe || p.isOwner || (!far && (!labelSet || labelSet.has(p)));
    if (show) placeLabel(p.label, p.av.root.position, p.av.labelY);
    else p.label.style.display = 'none';
  }

  for (const l of lanterns) {
    if (l.fly < 1) {
      l.fly = Math.min(1, l.fly + dt * 0.7);
      const k = 1 - Math.pow(1 - l.fly, 3);
      l.mesh.position.lerpVectors(l.from, l.slot, k);
      l.mesh.position.y += Math.sin(k * Math.PI) * 1.2;
    } else {
      l.mesh.position.copy(l.slot);
    }
    l.mesh.rotation.z = Math.sin(t * 1.3 + l.phase) * 0.08;
    l.mesh.rotation.x = Math.cos(t * 1.1 + l.phase) * 0.05;
  }

  if (!ignite && litLevel > 1) {
    for (const b of world.bulbs) b.material.emissiveIntensity = 2.6 + Math.sin(t * 2 + b.userData.order) * 0.4;
  }

  if (tapRingT > 0) {
    tapRingT = Math.max(0, tapRingT - dt * 1.6);
    tapRing.material.opacity = tapRingT;
    tapRing.scale.setScalar(1 + (1 - tapRingT) * 0.8);
  }

  if (bubbleFor) placeLabel(bubble, bubbleFor.mesh.position, bubbleY);

  world.update(t, dt, { people, me });
  gifts.update(dt, t, { camera, viewHeight: renderer.domElement.height });
  updateIgnite(dt);
  sparks.update(dt);
  confetti.update(dt);
  aura.update(t);
  breath.update(dt);
  meteors.update(dt, camera);
  updateFloats(dt);
  renderer.info.reset();
  composer.render();
  if (photoPending) {
    // 3D 화면은 그린 직후에만 베낄 수 있다
    photoPending = false;
    try { photoShot = snapshot(renderer.domElement); } catch (e) { reportError(`photo: ${e.message}`); }
  }
  if (groupShotPending) {
    groupShotPending = false;
    const title = spotShotTitle;
    spotShotTitle = null;
    try { finishGroupPhoto(snapshot(renderer.domElement), title); } catch (e) { reportError(`group photo: ${e.message}`); }
  }
  if (!booted) {
    booted = true;
    const boot = document.querySelector('#boot');
    boot?.classList.add('done');
    setTimeout(() => boot?.remove(), 700);
  }
}

if (MODE === 'landing') startLanding();
else if (MODE === 'demo') startDemo();
else startRoom();
frame();

// 테스트용 핸들
window.__lantern = {
  // 시험용: 높은 곳에서 장소 전체 보기, 놀거리 목록, 놀거리 앞으로 순간 이동
  overview(on = true) { overviewCam = on; },
  get spots() { return (world.hotspots || []).map((h) => ({ id: h.id, label: h.label })); },
  goSpot(id) { const h = (world.hotspots || []).find((x) => x.id === id); if (h && me) { me.av.root.position.set(h.pos.x, 0, h.pos.z + 0.3); me.target = null; } },
  get lift() { return me ? me.av.lift : 0; },
  // 시험용: 실제로 나는 소리를 녹음해 확인
  recordAudio(ms) { return new Promise((res) => { const rec = new MediaRecorder(sound.stream()); const parts = []; rec.ondataavailable = (e) => parts.push(e.data); rec.onstop = async () => { const buf = await new Blob(parts).arrayBuffer(); let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]); res(btoa(bin)); }; rec.start(); setTimeout(() => rec.stop(), ms); }); },
  emote(kind) { sendEmote(kind); },
  // 시험용: 샘플 친구 n명을 내 옆으로 데려오고 같이 하는 동작 시작
  gather(n = 3) { people.filter((p) => p.npc).slice(0, n).forEach((p, i) => { p.target = null; p.wait = 30; p.av.root.position.set(me.av.root.position.x + (i - 1) * 1.1, 0, me.av.root.position.z - 1.2); }); },
  gm(kind) { requestGroupMotion(kind); },
  // 촬영용: 사람들을 한 곳에 세우고 자세를 정한다(cx, cz 중심, 간격 gap)
  stage(cx, cz, pose = null, n = 6, gap = 1.1) {
    const crew = [me, ...people.filter((p) => p.npc)].slice(0, n + 1);
    crew.forEach((p, i) => { const a = (i / crew.length) * Math.PI * 2; const r = i === 0 ? 0 : gap; p.target = null; p.goal = null; p.wait = 60; p.emoteT = 60; p.av.root.position.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r); if (pose) p.av.pose = pose; });
  },
  moveMe(x, z) { if (me) { me.av.root.position.set(x, 0, z); me.target = null; } },
  get mePos() { return me ? { x: me.av.root.position.x, y: me.av.lift, z: me.av.root.position.z } : null; },
  // 영상 촬영용: 카메라를 두 지점 사이로 천천히 움직이기, 등불이 날아와 걸리기
  cine(p0, l0, p1, l1, ms, fov) { cineCam = { p0: new THREE.Vector3(...p0), l0: new THREE.Vector3(...l0), p1: new THREE.Vector3(...p1), l1: new THREE.Vector3(...l1), start: performance.now(), ms, fov }; },
  cineOff() { cineCam = null; resize(); },
  flyLanterns(n = 8, gap = 280) {
    const msgs = ['생일 축하해!', '태어나줘서 고마워', '항상 응원해', '우리 오래오래 보자', '오늘 주인공은 너야', '꿈꾸는 일 다 이루어지길', '사랑해', '최고의 하루 되길'];
    for (let i = 0; i < n; i++) setTimeout(() => {
      const who = people[(i + 1) % people.length];
      hangLantern({ name: '친구', msg: msgs[i % msgs.length], color: [0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffc46b][i % 4] }, { from: who.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) });
      who.av.gesture('cheer');
    }, i * gap);
  },
  get gmActive() { return people.filter((p) => p.gm).length; },
  // 시험용: 사람·등불을 한꺼번에 늘려 꽉 찬 파티장을 흉내 낸다
  crowd(n = 33, nl = 44) {
    const outfits = ['dress', 'suit', 'party'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 8;
      addPerson({ name: `친구${i + 1}`, color: [0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffc46b][i % 4], hatColor: HAT_COLORS[i % 4], outfit: outfits[i % 3] }, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), { npc: true });
    }
    for (let i = 0; i < nl; i++) hangLantern({ name: '친구', msg: '생일 축하해', color: [0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffc46b][i % 4] });
  },
  get perf() { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, programs: i.programs?.length || 0, people: people.length, lanterns: lanterns.length, pr: renderer.getPixelRatio(), level: perf.level }; },
  // 미리보기 이미지(카카오톡·SNS) 촬영용: 불이 켜진 장면을 정해진 각도에서
  ogPose() { ogPose = true; setLitInstantly(); for (const b of world.bulbs) b.material.emissiveIntensity = 2.6; },
  get mode() { return MODE; },
  get lanterns() { return lanterns.length; },
  get slotCount() { return slots.length; },
  get gifts() { return gifts.list.length; },
  get fw() { return gifts.debug; },
  get people() { return people.map((p) => ({ name: p.label.textContent, me: p.isMe, x: +p.av.root.position.x.toFixed(2), z: +p.av.root.position.z.toFixed(2) })); },
  // 시험용: 카메라 위치와 하늘 이름이 화면 어디에 보이는지(-1~1이면 화면 안)
  get camInfo() {
    const n = skyName ? skyName.position.clone().project(camera) : null;
    return { cam: camera.position.toArray().map((v) => +v.toFixed(2)), look: camLook.toArray().map((v) => +v.toFixed(2)), fov: camera.fov, aspect: +camera.aspect.toFixed(3), name: n && [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(3)], namePos: skyName?.position.toArray(), opacity: skyName ? +skyName.material.opacity.toFixed(2) : 0 };
  },
  get skyOpacity() { return skyName ? skyName.material.opacity : 0; },
  get igniting() { return !!ignite; },
  get candlesOut() { return ROOF_STATE.candlesOut; },
  get candleState() { return world.candleState; },
  get blowT() { return candleBlow ? candleBlow.t : -1; },
  get thanks() { return ROOF_STATE.thanks; },
  get spectator() { return ROOF_STATE.spectator; },
  get photoReady() { return !!photoShot; },
  get meteors() { return meteors.active; },
  get endAt() { return ROOF_STATE.endAt; },
  walkTo(x, z) { if (me) me.target = new THREE.Vector3(x, 0, z); },
  openLantern(i) { if (lanterns[i]) showLantern(lanterns[i]); },
  addFireworks(n, colors = [0xf29bb3, 0xffc46b, 0x8fd3c1, 0xb9a6f2]) { for (let i = 0; i < n; i++) gifts.add({ id: 9000 + i, item: 'fireworks', color: colors[i % colors.length], name: '', anonymous: true, x: 0, z: 0 }); },
};
