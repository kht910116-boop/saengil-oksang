import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildWorld, ROOF } from './world.js';
import { createAvatar } from './avatar.js';
import { sound } from './audio.js';
import { api, connectRoom } from './net.js';
import './style.css';

// ── 경로: / 옥상 만들기 · /r/demo 샘플 · /r/:id 실제 옥상 ──
const path = location.pathname;
const roomMatch = path.match(/^\/r\/([\w-]{4,16})\/?$/);
const MODE = path === '/' || path === '/index.html' ? 'landing' : roomMatch?.[1] === 'demo' ? 'demo' : roomMatch ? 'room' : 'landing';
const ROOM_ID = MODE === 'room' ? roomMatch[1] : null;
const OWNER_KEY = new URLSearchParams(location.search).get('k');
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
  { name: '수아', color: 0x8fd3c1, msg: '올해도 제일 먼저 축하할게!' },
  { name: '도윤', color: 0xb9a6f2, msg: '민지야 생일 축하해. 밥 한번 사라 ㅋㅋ' },
  { name: '하은', color: 0xffc46b, msg: '우리 10년째 친구인 거 알지? 사랑해' },
  { name: '엄마', color: 0xf29bb3, msg: '우리 딸, 태어나줘서 고마워' },
  { name: '지호', color: 0x8fd3c1, msg: '새로운 일 꼭 잘될 거야. 응원해' },
  { name: '서진', color: 0xfbf4e8, msg: '생일 축하! 다음 주에 케이크 먹으러 가자' },
];

// 옥상 상태
const ROOF_STATE = { owner: '민지', igniteAt: Date.now() + 3 * 86400_000, isOwner: false };
let serverOffset = 0;
const serverNow = () => Date.now() + serverOffset;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
};

// ── 렌더러 ──
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

const world = buildWorld(scene);
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
  if (perf.level >= 2) return;
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
  const av = createAvatar({ color: opts.color, hat: true, hatColor: isOwner ? 0xffd34d : opts.hatColor ?? HAT_COLORS[0], crown: isOwner });
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
  p.label.remove();
  people.splice(people.indexOf(p), 1);
}

let me = null;

// ── 등불 ──
const lanterns = [];
const lanternIds = new Set();
const slots = world.lanternSlots.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

function lanternMesh(hex) {
  const g = new THREE.Group();
  const paperMat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.8, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14, 1, true), paperMat);
  const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.32, 14, 4, true), new THREE.MeshBasicMaterial({ color: 0x2a2238, wireframe: true, transparent: true, opacity: 0.18 }));
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a2238, roughness: 0.6 });
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 12), capMat);
  capT.position.y = 0.18;
  const capB = capT.clone();
  capB.position.y = -0.18;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), new THREE.MeshBasicMaterial({ color: 0x1a1626 }));
  cord.position.y = 0.4;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), new THREE.MeshBasicMaterial({ color: hex }));
  tassel.position.y = -0.28;
  tassel.rotation.x = Math.PI;
  g.add(body, ribs, capT, capB, cord, tassel);
  g.userData.paperMat = paperMat;
  return g;
}

function hangLantern({ id = null, name, msg, color, slot = lanterns.length }, { from = null } = {}) {
  if (id != null) {
    if (lanternIds.has(id)) return null;
    lanternIds.add(id);
  }
  const at = slots[slot % slots.length];
  const m = lanternMesh(color);
  m.position.copy(from || at);
  if (litLevel > 1) m.userData.paperMat.emissiveIntensity = 1.6;
  scene.add(m);
  const l = { mesh: m, slot: at.clone(), name, msg, phase: Math.random() * 6, fly: from ? 0 : 1, from: from ? from.clone() : null };
  m.userData.lantern = l;
  lanterns.push(l);
  return l;
}

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
  if (!me) return;
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(lanterns.map((l) => l.mesh), true);
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
const HALF_W = ROOF.w / 2 - 0.6;
const HALF_D = ROOF.d / 2 - 0.6;
function collide(p) {
  p.x = THREE.MathUtils.clamp(p.x, -HALF_W, HALF_W);
  p.z = THREE.MathUtils.clamp(p.z, -HALF_D, HALF_D);
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
  me.av.root.position.addScaledVector(move, 3.6 * dt);
  collide(me.av.root.position);
  me.speed = move.length();
  me.dirX = move.dot(camRight);
}

function updateNpc(p, dt) {
  if (!p.target) {
    p.wait -= dt;
    if (p.wait <= 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() < 0.4 ? 2.2 + Math.random() : 3 + Math.random() * 7;
      p.target = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      collide(p.target);
    }
    p.speed = 0;
    p.dirX = 0;
    return;
  }
  const d = p.target.clone().sub(p.av.root.position);
  if (d.length() < 0.2) { p.target = null; p.wait = 2 + Math.random() * 5; p.speed = 0; return; }
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
  pos.lerp(p.net, Math.min(1, dt * 8));
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

function setSkyName(owner) {
  if (skyName) scene.remove(skyName);
  skyName = makeSkyName(['생일 축하해', owner]);
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
    g.shadowColor = 'rgba(255,196,107,0.95)';
    g.shadowBlur = 36;
    g.fillStyle = '#fff3d6';
    g.font = '150px Jua, sans-serif';
    g.fillText(line1, 700, 190);
    g.font = '250px Jua, sans-serif';
    g.fillText(line2, 700, 450);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 4.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.position.set(0, 10.5, -6);
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
    points: new THREE.Points(geo, mat),
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

function startIgnite() {
  if (ignite) return;
  resetLights();
  ignite = { t: 0, clicked: new Set() };
  ignitedThisSession = true;
  document.body.classList.add('is-igniting');
  setStatus('자정이에요. 다 같이 불을 켜요');
}

function updateIgnite(dt) {
  if (!ignite) return;
  ignite.t += dt;
  const t = ignite.t;
  const total = world.bulbs.length;
  world.hemi.intensity = THREE.MathUtils.lerp(world.hemi.intensity, t < 1.2 ? 0.35 : 0.75, dt * 3);
  for (const b of world.bulbs) {
    const on = t > 1.2 + (b.userData.order / total) * 3.4;
    b.material.emissiveIntensity = THREE.MathUtils.lerp(b.material.emissiveIntensity, on ? 3.2 : 0.05, dt * (on ? 10 : 4));
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
    sparks.burst();
    sound.swell();
    people.forEach((p, i) => setTimeout(() => p.av.hop(), i * 90));
    setStatus(`${ROOF_STATE.owner}의 생일이에요. 등불 ${lanterns.length}개가 함께 켜졌어요`);
  }
  skyName.material.opacity = THREE.MathUtils.lerp(skyName.material.opacity, t > 4.8 ? 1 : 0, dt * 1.5);
  if (t > 4.8) skyName.position.y = 10.5 + Math.sin(t * 0.8) * 0.15;
  if (t > 14) {
    ignite = null;
    litLevel = 3.2;
    document.body.classList.remove('is-igniting');
    igniteBtn.textContent = '점등 다시 보기';
    igniteBtn.hidden = false;
  }
}

function resetLights() {
  for (const b of world.bulbs) b.material.emissiveIntensity = 0.18;
  for (const l of lanterns) l.mesh.userData.paperMat.emissiveIntensity = 0.55;
  if (skyName) skyName.material.opacity = 0;
}

function setLitInstantly() {
  litLevel = 3.2;
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

const soundBtn = document.querySelector('#btn-sound');
soundBtn.addEventListener('click', async () => {
  const on = await sound.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.querySelector('span').textContent = on ? '소리 끄기' : '소리 켜기';
});

const bubble = document.querySelector('#bubble');
let bubbleFor = null;
function showLantern(l) {
  bubbleFor = l;
  bubble.innerHTML = '<p class="bubble-msg"></p><p class="bubble-from"></p>';
  bubble.querySelector('.bubble-msg').textContent = l.msg;
  bubble.querySelector('.bubble-from').textContent = `${l.name}의 등불`;
  bubble.hidden = false;
  sound.chime();
}
function hideBubble() { bubble.hidden = true; bubbleFor = null; }

document.querySelector('#btn-support').addEventListener('click', () => {
  openSheet(`
    <h2>전구 보태기</h2>
    <p class="sheet-lead">생일 옥상은 누구나 무료로 열 수 있어요. 전구값을 조금 보태주시면 다음 옥상을 켜는 데 써요.</p>
    <div class="qr-slot" role="img" aria-label="카카오페이 송금 QR이 들어갈 자리">카카오페이 송금 QR<br><small>이미지를 넣을 자리예요</small></div>
    <button class="btn wide" data-close>닫기</button>`);
});

// 날짜 표시(한국 시간)
function kstParts(ms) {
  const d = new Date(ms + KST);
  return { m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function countdownText() {
  const left = ROOF_STATE.igniteAt - serverNow();
  const { m, d } = kstParts(ROOF_STATE.igniteAt);
  if (left <= 0) return left > -86400_000 ? `${m}월 ${d}일 · 오늘 생일이에요` : `${m}월 ${d}일의 옥상`;
  const s = Math.floor(left / 1000);
  if (s >= 86400) return `${m}월 ${d}일 자정까지 ${Math.floor(s / 86400)}일 ${Math.floor((s % 86400) / 3600)}시간`;
  if (s >= 3600) return `자정까지 ${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  return `자정까지 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ── 등불 달기(공통 시트) ──
function openLanternSheet(onSubmit, defaultName) {
  openSheet(`
    <h2>등불 달기</h2>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}에게 남길 한 줄을 적어주세요. 등불은 자정에 다 같이 켜져요.</p>
    <form id="lantern-form">
      <label class="field"><span>내 이름</span><input id="lantern-name" name="name" maxlength="10" required placeholder="예: 수아" value="${esc(defaultName || '')}"></label>
      <label class="field"><span>남길 말</span><textarea id="lantern-msg" name="msg" maxlength="40" rows="2" required placeholder="생일 축하해!"></textarea><small class="char-count">0 / 40</small></label>
      <fieldset class="swatches"><legend>등불 색</legend>
        ${LANTERN_COLORS.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c.hex}" ${i === 0 ? 'checked' : ''}><span style="--c:${hex6(c.hex)}" aria-label="${c.name}"></span></label>`).join('')}
      </fieldset>
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">이 등불 달기</button>
    </form>`);
  const form = document.querySelector('#lantern-form');
  const ta = form.querySelector('textarea');
  const cnt = form.querySelector('.char-count');
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.length} / 40`; });
  ta.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '등불 다는 중…';
    try {
      await onSubmit({ name: fd.get('name').trim(), msg: fd.get('msg').trim(), color: Number(fd.get('color')) });
      closeSheet();
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = '이 등불 달기';
    }
  });
}

function afterHang() {
  sound.chime();
  me?.av.hop();
  setStatus(`등불을 달았어요. 지금 ${lanterns.length}개의 등불이 ${ROOF_STATE.owner}를 기다려요`);
}

// ── 모드별 시작 ──
async function startLanding() {
  setSkyName('민지');
  document.querySelector('#owner').textContent = '생일 옥상';
  document.querySelector('#date').textContent = '친구 생일 자정에 다 같이 불을 켜요';
  DEMO_FRIENDS.forEach((f, i) => {
    const a = (i / DEMO_FRIENDS.length) * Math.PI * 2;
    addPerson({ name: f.name, color: f.color, hatColor: HAT_COLORS[i % 4] }, new THREE.Vector3(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5), { npc: true });
    hangLantern({ name: f.name, msg: f.msg, color: f.color });
  });
  const months = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('');
  const days = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('');
  const today = kstParts(Date.now());
  openSheet(`
    <h2>생일 옥상 만들기</h2>
    <p class="sheet-lead">친구들이 등불을 모으는 동안 주인공은 문밖에서 기다려요. 생일 자정이 되면 문이 열리고 모두의 화면에서 함께 불이 켜져요.</p>
    <form id="create-form">
      <label class="field"><span>주인공 이름</span><input id="create-owner" name="owner" maxlength="10" required placeholder="예: 민지"></label>
      <div class="field-row">
        <label class="field"><span>생일 월</span><select id="create-month" name="month">${months}</select></label>
        <label class="field"><span>생일 일</span><select id="create-day" name="day">${days}</select></label>
      </div>
      <label class="check"><input id="create-test" type="checkbox" name="test"> 시험해 보기: 1분 뒤를 자정으로 할게요</label>
      <p class="form-error" role="alert"></p>
      <button class="btn primary wide" type="submit">옥상 열기</button>
      <a class="text-link" href="/r/demo">샘플 옥상 먼저 둘러보기</a>
    </form>`, { locked: true });
  const form = document.querySelector('#create-form');
  form.month.value = String(today.m);
  form.day.value = String(today.d);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '옥상 여는 중…';
    try {
      const r = await api('/api/rooftops', {
        method: 'POST',
        body: { owner: form.owner.value, month: Number(form.month.value), day: Number(form.day.value), testSeconds: form.test.checked ? 60 : 0 },
      });
      store.set(`owner:${r.id}`, r.ownerKey);
      showCreated(r);
    } catch (err) {
      form.querySelector('.form-error').textContent = err.message;
      btn.disabled = false;
      btn.textContent = '옥상 열기';
    }
  });
}

function showCreated(r) {
  const friendUrl = `${location.origin}/r/${r.id}`;
  const ownerUrl = `${friendUrl}?k=${r.ownerKey}`;
  const { m, d } = kstParts(r.igniteAt);
  const isTest = r.igniteAt - r.now < 3600_000;
  openSheet(`
    <h2>${esc(r.owner)}의 옥상을 열었어요</h2>
    <p class="sheet-lead">${isTest ? '시험용 옥상이라 1분 뒤에 불이 켜져요.' : `${m}월 ${d}일 자정에 불이 켜져요.`} 링크 두 개를 각각 보내주세요.</p>
    <div class="link-card">
      <p class="link-title">친구들에게 보낼 링크</p>
      <p class="link-desc">친구들이 들어와서 등불을 달아요.</p>
      <input id="link-friend" readonly value="${esc(friendUrl)}">
      <button class="btn" data-copy="link-friend">친구 링크 복사</button>
    </div>
    <div class="link-card">
      <p class="link-title">${esc(r.owner)}에게 보낼 링크</p>
      <p class="link-desc">자정 전에는 닫힌 문만 보여요. 등불 내용은 자정까지 비밀이에요.</p>
      <input id="link-owner" readonly value="${esc(ownerUrl)}">
      <button class="btn" data-copy="link-owner">주인공 링크 복사</button>
    </div>
    <p class="copy-status" role="status"></p>
    <a class="btn primary wide" href="/r/${esc(r.id)}">옥상으로 가서 첫 등불 달기</a>`, { locked: true });
  sheetBody.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const input = document.getElementById(b.dataset.copy);
    input.select();
    copyText(input.value, sheetBody.querySelector('.copy-status'));
  }));
}

function startDemo() {
  ROOF_STATE.owner = '민지';
  setSkyName('민지');
  document.querySelector('#owner').textContent = '민지의 생일 옥상';
  document.querySelector('#date').textContent = '샘플 옥상이에요';
  me = addPerson({ name: '나', color: 0xf29bb3, hatColor: 0x8fd3c1 }, new THREE.Vector3(0, 0, 3.2), { isMe: true });
  DEMO_FRIENDS.forEach((f, i) => {
    const a = (i / DEMO_FRIENDS.length) * Math.PI * 2;
    addPerson({ name: f.name, color: f.color, hatColor: HAT_COLORS[i % 4] }, new THREE.Vector3(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5), { npc: true });
    hangLantern({ name: f.name, msg: f.msg, color: f.color });
  });
  countEl.textContent = `함께 있는 친구 ${people.length}명`;
  igniteBtn.textContent = '점등 미리보기';
  igniteBtn.hidden = false;
  igniteBtn.addEventListener('click', startIgnite);
  document.querySelector('#btn-lantern').addEventListener('click', () => openLanternSheet(async ({ name, msg, color }) => {
    hangLantern({ name: name || '나', msg, color }, { from: me.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) });
    afterHang();
  }, '나'));
  setStatus('화면을 눌러 걸어보세요. 등불을 누르면 친구의 말이 보여요', 6000);
}

let conn = null;
let myId = null;
async function startRoom() {
  let data;
  try {
    data = await api(`/api/rooftops/${ROOM_ID}${OWNER_KEY ? `?k=${encodeURIComponent(OWNER_KEY)}` : ''}`);
  } catch (err) {
    openSheet(`<h2>옥상을 열지 못했어요</h2><p class="sheet-lead">${esc(err.message)}</p><a class="btn primary wide" href="/">새 옥상 만들기</a>`, { locked: true });
    return;
  }
  serverOffset = data.now - Date.now();
  Object.assign(ROOF_STATE, { owner: data.owner, igniteAt: data.igniteAt, isOwner: !!data.isOwner });
  setSkyName(data.owner);
  document.querySelector('#owner').textContent = `${data.owner}의 생일 옥상`;
  const tick = () => { document.querySelector('#date').textContent = countdownText(); };
  tick();
  setInterval(tick, 1000);

  const before = serverNow() < ROOF_STATE.igniteAt;
  igniteBtn.hidden = before;
  igniteBtn.textContent = '점등 다시 보기';
  igniteBtn.addEventListener('click', startIgnite);

  if (ROOF_STATE.isOwner && serverNow() < ROOF_STATE.igniteAt - 15_000) {
    return showDoor(data.lanternCount || 0);
  }
  for (const l of data.lanterns) hangLantern(l);
  if (!before) setLitInstantly();

  if (ROOF_STATE.isOwner) return enterRoom({ name: data.owner, color: 0xffc46b });
  const saved = store.get('visitor');
  askVisitor(saved);
}

function askVisitor(saved) {
  const colors = [0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffc46b];
  openSheet(`
    <h2>${esc(ROOF_STATE.owner)}의 옥상에 들어가요</h2>
    <p class="sheet-lead">${esc(ROOF_STATE.owner)}는 자정까지 이 옥상을 볼 수 없어요. 친구들끼리 등불을 모아 깜짝 놀라게 해주세요.</p>
    <form id="visitor-form">
      <label class="field"><span>내 이름</span><input id="visitor-name" name="name" maxlength="10" required placeholder="예: 수아" value="${esc(saved?.name || '')}"></label>
      <fieldset class="swatches"><legend>내 옷 색</legend>
        ${colors.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c}" ${(saved?.color ?? colors[0]) === c ? 'checked' : ''}><span style="--c:${hex6(c)}" aria-label="옷 색 ${i + 1}"></span></label>`).join('')}
      </fieldset>
      <button class="btn primary wide" type="submit">옥상으로 올라가기</button>
    </form>`, { locked: true });
  const form = document.querySelector('#visitor-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = { name: form.name.value.trim() || '친구', color: Number(new FormData(form).get('color')) };
    store.set('visitor', v);
    closeSheet();
    enterRoom(v);
  });
}

function showDoor(count) {
  const door = document.querySelector('#door');
  door.hidden = false;
  const title = door.querySelector('.door-title');
  const sub = door.querySelector('.door-sub');
  const cnt = door.querySelector('.door-count');
  title.textContent = `${ROOF_STATE.owner}님, 옥상 문은 자정에 열려요`;
  const render = () => {
    sub.textContent = countdownText();
    cnt.textContent = count > 0 ? `문 너머에서 등불 ${count}개가 기다리고 있어요` : '친구들이 무언가를 준비하고 있어요';
  };
  render();
  const poll = setInterval(async () => {
    try {
      const d = await api(`/api/rooftops/${ROOM_ID}?k=${encodeURIComponent(OWNER_KEY)}`);
      count = d.lanternCount ?? d.lanterns.length;
    } catch { /* 다음에 다시 */ }
  }, 15_000);
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
  try {
    const d = await api(`/api/rooftops/${ROOM_ID}?k=${encodeURIComponent(OWNER_KEY)}`);
    for (const l of d.lanterns) hangLantern(l);
  } catch { /* 등불은 실시간으로 다시 받는다 */ }
  setTimeout(() => { door.hidden = true; }, 1600);
  enterRoom({ name: ROOF_STATE.owner, color: 0xffc46b });
}

function enterRoom(visitor) {
  const spawn = new THREE.Vector3((Math.random() - 0.5) * 4, 0, 3 + Math.random() * 2);
  me = addPerson({ name: ROOF_STATE.isOwner ? ROOF_STATE.owner : visitor.name, color: visitor.color, hatColor: 0x8fd3c1 }, spawn, { isMe: true, isOwner: ROOF_STATE.isOwner });
  countEl.textContent = '연결 중';
  conn = connectRoom({
    room: ROOM_ID,
    key: ROOF_STATE.isOwner ? OWNER_KEY : null,
    hello: { name: visitor.name, color: visitor.color, hat: Math.floor(Math.random() * 4) },
    onMessage: handleNet,
    onClose: (code, fatal) => {
      if (code === 4002) setStatus('옥상이 가득 찼어요. 잠시 후 다시 들어와주세요.', 8000);
      else if (code === 4001) setStatus('아직 문이 열리지 않았어요.', 8000);
      else countEl.textContent = '다시 연결하는 중';
      if (fatal) countEl.textContent = '연결 끊김';
    },
  });
  document.querySelector('#btn-lantern').addEventListener('click', () => openLanternSheet(async ({ name, msg, color }) => {
    const l = await api(`/api/rooftops/${ROOM_ID}/lanterns`, { method: 'POST', body: { name, msg, color, peerId: myId } });
    hangLantern(l, { from: me.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) });
    afterHang();
  }, ROOF_STATE.isOwner ? ROOF_STATE.owner : visitor.name));
  setStatus(ROOF_STATE.isOwner ? '친구들이 준비한 옥상이에요. 곧 자정이에요' : '등불을 달고, 자정에 다시 와서 같이 불을 켜요', 6500);
}

function addPeer(v) {
  if (peersById.has(v.id) || v.id === myId) return;
  const p = addPerson({ name: v.name, color: v.color, hatColor: HAT_COLORS[v.hat % 4] }, new THREE.Vector3(v.x, 0, v.z), { isOwner: v.owner });
  p.net = new THREE.Vector3(v.x, 0, v.z);
  peersById.set(v.id, p);
  return p;
}

function handleNet(m) {
  if (m.t === 'welcome') {
    myId = m.you;
    serverOffset = m.now - Date.now();
    for (const v of m.peers) addPeer(v);
    countEl.textContent = `함께 있는 친구 ${m.peers.length + 1}명`;
  } else if (m.t === 'join') {
    addPeer(m.peer);
    if (m.peer.owner) setStatus(`${ROOF_STATE.owner}가 옥상에 들어왔어요!`, 6000);
    else setStatus(`${m.peer.name}이(가) 옥상에 올라왔어요`, 3000);
  } else if (m.t === 'leave') {
    const p = peersById.get(m.id);
    if (p) { removePerson(p); peersById.delete(m.id); }
  } else if (m.t === 'count') {
    countEl.textContent = `함께 있는 친구 ${m.n}명`;
  } else if (m.t === 'state') {
    for (const [id, x, z] of m.p) {
      const p = peersById.get(id);
      if (p) p.net.set(x, 0, z);
    }
  } else if (m.t === 'hop') {
    peersById.get(m.id)?.av.hop();
  } else if (m.t === 'lantern') {
    if (m.lantern.by === myId) return; // 내가 단 등불은 이미 걸려 있다
    const who = peersById.get(m.lantern.by);
    const l = hangLantern(m.lantern, { from: who ? who.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : null });
    if (l) setStatus(`${m.lantern.name}이(가) 등불을 달았어요`, 3000);
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
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // 닫힌 문 화면이나 숨겨진 탭에서는 그리지 않는다
  if (document.hidden || (!doorEl.hidden && !doorEl.classList.contains('opening'))) return;
  adaptQuality(dt);

  if (me) updateMe(dt);
  for (const p of people) {
    if (p.npc) updateNpc(p, dt);
    else if (!p.isMe) updatePeer(p, dt);
  }

  // 내 위치 보내기(초당 10번, 움직였을 때만)
  if (conn && me && performance.now() - lastSent > 100) {
    const pos = me.av.root.position;
    if (pos.distanceTo(lastSentPos) > 0.02) {
      conn.send({ t: 'pos', x: pos.x, z: pos.z, dx: me.dirX });
      lastSentPos.copy(pos);
    }
    lastSent = performance.now();
  }

  // 실제 옥상: 자정이 되면 모두의 화면에서 점등
  if (MODE === 'room' && me && !ignitedThisSession && serverNow() >= ROOF_STATE.igniteAt && serverNow() - ROOF_STATE.igniteAt < 120_000) {
    startIgnite();
  }

  // 카메라
  if (MODE === 'landing' || !me) {
    const a = t * 0.05;
    camPos.lerp(new THREE.Vector3(Math.sin(a) * 15, 7, Math.cos(a) * 15), Math.min(1, dt * 2));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(0, 2.4, 0), Math.min(1, dt * 2));
  } else {
    const mp = me.av.root.position;
    const camDist = dist + (ignite ? 3 : 0);
    const want = new THREE.Vector3(mp.x + Math.sin(yaw) * camDist, 2.6 + camDist * 0.42, mp.z + Math.cos(yaw) * camDist);
    want.x = THREE.MathUtils.clamp(want.x, -HALF_W - 0.2, HALF_W + 0.2);
    want.z = THREE.MathUtils.clamp(want.z, -HALF_D - 0.2, HALF_D + 0.2);
    const sky = ignite ? THREE.MathUtils.smoothstep(ignite.t, 0.6, 2.4) : 0;
    want.y -= sky * (want.y - 1.4);
    camPos.lerp(want, Math.min(1, dt * (ignite ? 2 : 5)));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(mp.x * (1 - sky), 1.6 + sky * 7.4, mp.z * (1 - sky) + sky * -6), Math.min(1, dt * (ignite ? 2 : 6)));
  }
  camera.lookAt(camLook);

  for (const p of people) {
    p.av.update(dt, p.speed, camera, p.dirX);
    placeLabel(p.label, p.av.root.position, p.av.labelY);
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

  if (bubbleFor) placeLabel(bubble, bubbleFor.mesh.position, 0.45);

  world.update(t);
  updateIgnite(dt);
  sparks.update(dt);
  composer.render();
}

if (MODE === 'landing') startLanding();
else if (MODE === 'demo') startDemo();
else startRoom();
frame();

// 테스트용 핸들
window.__lantern = {
  get mode() { return MODE; },
  get lanterns() { return lanterns.length; },
  get people() { return people.map((p) => ({ name: p.label.textContent, me: p.isMe, x: +p.av.root.position.x.toFixed(2), z: +p.av.root.position.z.toFixed(2) })); },
  get skyOpacity() { return skyName ? skyName.material.opacity : 0; },
  get igniting() { return !!ignite; },
  walkTo(x, z) { if (me) me.target = new THREE.Vector3(x, 0, z); },
};
