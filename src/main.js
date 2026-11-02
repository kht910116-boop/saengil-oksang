import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildWorld, ROOF } from './world.js';
import { createAvatar } from './avatar.js';
import { sound } from './audio.js';
import './style.css';

// ── 샘플 데이터 (실제 서비스에서는 서버에서 받는다) ──
const PAGE = {
  owner: '민지',
  dateLabel: '11월 5일',
  daysLeft: 3,
};
const LANTERN_COLORS = [
  { name: '호박', hex: 0xffc46b },
  { name: '분홍', hex: 0xf29bb3 },
  { name: '민트', hex: 0x8fd3c1 },
  { name: '라벤더', hex: 0xb9a6f2 },
  { name: '하양', hex: 0xfbf4e8 },
];
const FRIENDS = [
  { name: '수아', color: 0x8fd3c1, msg: '올해도 제일 먼저 축하할게!' },
  { name: '도윤', color: 0xb9a6f2, msg: '민지야 생일 축하해. 밥 한번 사라 ㅋㅋ' },
  { name: '하은', color: 0xffc46b, msg: '우리 10년째 친구인 거 알지? 사랑해' },
  { name: '엄마', color: 0xf29bb3, msg: '우리 딸, 태어나줘서 고마워' },
  { name: '지호', color: 0x8fd3c1, msg: '새로운 일 꼭 잘될 거야. 응원해' },
  { name: '서진', color: 0xfbf4e8, msg: '생일 축하! 다음 주에 케이크 먹으러 가자' },
];

// ── 렌더러 ──
const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);

const world = buildWorld(scene);
// 카메라 쪽에서 비추는 은은한 보조광: 종이 인형 얼굴이 어둡게 묻히지 않게
const fill = new THREE.DirectionalLight(0xffe2c0, 0.9);
camera.add(fill);
fill.position.set(0.5, 1, 1);
fill.target.position.set(0, 0, -5);
camera.add(fill.target);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.72);
composer.addPass(bloom);
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

// ── 아바타 ──
const labelsEl = document.querySelector('#labels');
const people = [];
function addPerson(opts, pos, isMe = false) {
  const av = createAvatar(opts);
  av.root.position.copy(pos);
  scene.add(av.root);
  const label = document.createElement('div');
  label.className = 'name-label' + (isMe ? ' is-me' : '');
  label.textContent = opts.name;
  labelsEl.appendChild(label);
  const p = { av, label, isMe, vel: new THREE.Vector3(), target: null, wait: Math.random() * 3, speed: 0, dirX: 0 };
  people.push(p);
  return p;
}

const me = addPerson({ name: '나', color: 0xf29bb3, hat: true, hatColor: 0x8fd3c1 }, new THREE.Vector3(0, 0, 3.2), true);
FRIENDS.forEach((f, i) => {
  const a = (i / FRIENDS.length) * Math.PI * 2;
  addPerson(
    { name: f.name, color: f.color, hat: i % 2 === 0, hatColor: [0xffc46b, 0xf29bb3, 0xb9a6f2][i % 3] },
    new THREE.Vector3(Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5)
  );
});
document.querySelector('#count').textContent = `함께 있는 친구 ${people.length}명`;

// ── 등불 ──
const lanterns = [];
const slots = world.lanternSlots.slice();
// 테이블에서 가까운 줄부터 채우도록 정렬
slots.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

function lanternMesh(hex) {
  const g = new THREE.Group();
  const paperMat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 14, 1, true), paperMat);
  body.material.side = THREE.DoubleSide;
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

function hangLantern({ name, msg, hex }, { animateFrom = null } = {}) {
  const slot = slots[lanterns.length % slots.length];
  const m = lanternMesh(hex);
  m.position.copy(animateFrom || slot);
  scene.add(m);
  const l = { mesh: m, slot: slot.clone(), name, msg, hex, phase: Math.random() * 6, fly: animateFrom ? 0 : 1, from: animateFrom ? animateFrom.clone() : null };
  m.userData.lantern = l;
  lanterns.push(l);
  return l;
}

FRIENDS.forEach((f) => hangLantern({ name: f.name, msg: f.msg, hex: f.color }));

// ── 조작 ──
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
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

// 카메라: 드래그로 회전, 휠/두 손가락으로 거리 조절, 짧게 탭하면 그곳으로 걷기
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
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // 등불을 눌렀나?
  const hits = ray.intersectObjects(lanterns.map((l) => l.mesh), true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.lantern) o = o.parent;
    if (o) return showLantern(o.userData.lantern, x, y);
  }
  // 바닥을 눌렀으면 그곳으로 걷기
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
  const speed = 3.6;
  me.av.root.position.addScaledVector(move, speed * dt);
  collide(me.av.root.position);
  me.speed = move.length();
  me.dirX = move.dot(camRight);
}

function updateFriend(p, dt) {
  if (!p.target) {
    p.wait -= dt;
    if (p.wait <= 0) {
      const nearTable = Math.random() < 0.4;
      const a = Math.random() * Math.PI * 2;
      const r = nearTable ? 2.2 + Math.random() : 3 + Math.random() * 7;
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

// ── 점등 연출 ──
let ignite = null; // { t }
let litLevel = 0.18; // 전구 밝기 기본값
const skyName = makeSkyName(['생일 축하해', PAGE.owner]);
scene.add(skyName);
const sparks = makeSparks();
scene.add(sparks.points);

// 하늘에 뜨는 이름: 두 줄(축하 문구 / 이름)로 그려서 세로 화면에서도 잘리지 않게 한다
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 4.8), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  m.position.set(0, 10.5, -6);
  m.userData.redraw = draw;
  return m;
}
document.fonts?.ready.then(() => skyName.userData.redraw());

function makeSparks() {
  const n = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) vel.push(new THREE.Vector3());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffd99a, size: 0.16, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const points = new THREE.Points(geo, mat);
  return {
    points,
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
  ignite = { t: 0, clicked: new Set() };
  document.body.classList.add('is-igniting');
  setStatus('곧 자정이에요. 다 같이 불을 켜요');
}

function updateIgnite(dt) {
  if (!ignite) return;
  ignite.t += dt;
  const t = ignite.t;
  const total = world.bulbs.length;
  // 0~1.2초: 어두워짐 / 1.2~4.6초: 전구가 차례로 켜짐 / 4.8초: 하늘에 이름
  world.hemi.intensity = THREE.MathUtils.lerp(world.hemi.intensity, t < 1.2 ? 0.35 : 0.75, dt * 3);
  for (const b of world.bulbs) {
    const at = 1.2 + (b.userData.order / total) * 3.4;
    const on = t > at;
    const target = on ? 3.2 : t < 1.2 ? 0.05 : 0.05;
    b.material.emissiveIntensity = THREE.MathUtils.lerp(b.material.emissiveIntensity, target, dt * (on ? 10 : 4));
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
    setStatus(`${PAGE.owner}의 생일이에요. 등불 ${lanterns.length}개가 함께 켜졌어요`);
  }
  skyName.material.opacity = THREE.MathUtils.lerp(skyName.material.opacity, t > 4.8 ? 1 : 0, dt * 1.5);
  if (t > 4.8) skyName.position.y = 10.5 + Math.sin(t * 0.8) * 0.15;
  if (t > 14) {
    ignite = null;
    litLevel = 3.2;
    document.body.classList.remove('is-igniting');
    document.querySelector('#btn-ignite').textContent = '점등 다시 보기';
  }
}

function resetLights() {
  litLevel = 0.18;
  for (const b of world.bulbs) b.material.emissiveIntensity = 0.18;
  for (const l of lanterns) l.mesh.userData.paperMat.emissiveIntensity = 0.55;
  skyName.material.opacity = 0;
}

// ── UI ──
const statusEl = document.querySelector('#status');
let statusTimer = null;
function setStatus(text, ms = 5200) {
  statusEl.textContent = text;
  statusEl.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove('show'), ms);
}

document.querySelector('#owner').textContent = `${PAGE.owner}의 생일 옥상`;
document.querySelector('#date').textContent = `${PAGE.dateLabel} · ${PAGE.daysLeft}일 남음`;

const sheet = document.querySelector('#sheet');
const sheetBody = sheet.querySelector('.sheet-body');
function openSheet(html) {
  sheetBody.innerHTML = html;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('open'));
}
function closeSheet() {
  sheet.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; }, 220);
}
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

document.querySelector('#btn-lantern').addEventListener('click', () => {
  openSheet(`
    <h2>등불 달기</h2>
    <p class="sheet-lead">${PAGE.owner}에게 남길 한 줄을 적어주세요. 등불은 자정에 다 같이 켜져요.</p>
    <form id="lantern-form">
      <label class="field"><span>내 이름</span><input name="name" maxlength="10" required placeholder="예: 수아" value="나"></label>
      <label class="field"><span>남길 말</span><textarea name="msg" maxlength="40" rows="2" required placeholder="생일 축하해!"></textarea><small class="char-count">0 / 40</small></label>
      <fieldset class="swatches"><legend>등불 색</legend>
        ${LANTERN_COLORS.map((c, i) => `<label class="swatch"><input type="radio" name="color" value="${c.hex}" ${i === 0 ? 'checked' : ''}><span style="--c:#${c.hex.toString(16).padStart(6, '0')}" aria-label="${c.name}"></span></label>`).join('')}
      </fieldset>
      <button class="btn primary wide" type="submit">이 등불 달기</button>
    </form>`);
  const form = document.querySelector('#lantern-form');
  const ta = form.querySelector('textarea');
  const cnt = form.querySelector('.char-count');
  ta.addEventListener('input', () => { cnt.textContent = `${ta.value.length} / 40`; });
  ta.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const from = me.av.root.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const l = hangLantern({ name: fd.get('name').trim() || '나', msg: fd.get('msg').trim(), hex: Number(fd.get('color')) }, { animateFrom: from });
    if (litLevel > 1) l.mesh.userData.paperMat.emissiveIntensity = 1.6;
    closeSheet();
    sound.chime();
    me.av.hop();
    setStatus(`등불을 달았어요. 지금 ${lanterns.length}개의 등불이 ${PAGE.owner}를 기다려요`);
  });
});

document.querySelector('#btn-ignite').addEventListener('click', () => {
  resetLights();
  startIgnite();
});

document.querySelector('#btn-support').addEventListener('click', () => {
  openSheet(`
    <h2>전구 보태기</h2>
    <p class="sheet-lead">생일 옥상은 누구나 무료로 열 수 있어요. 전구값을 조금 보태주시면 다음 옥상을 켜는 데 써요.</p>
    <div class="qr-slot" role="img" aria-label="카카오페이 송금 QR이 들어갈 자리">카카오페이 송금 QR<br><small>이미지를 넣을 자리예요</small></div>
    <button class="btn wide" data-close>닫기</button>`);
});

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
  bubble.innerHTML = `<p class="bubble-msg"></p><p class="bubble-from"></p>`;
  bubble.querySelector('.bubble-msg').textContent = l.msg;
  bubble.querySelector('.bubble-from').textContent = `${l.name}의 등불`;
  bubble.hidden = false;
  sound.chime();
}
document.addEventListener('pointerdown', (e) => {
  if (!bubble.hidden && !e.target.closest('#bubble') && e.target !== canvas) { bubble.hidden = true; bubbleFor = null; }
});

// ── 루프 ──
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 6, 14);
const camLook = new THREE.Vector3();

function placeLabel(el, worldPos, yOff) {
  tmp.copy(worldPos).setY(worldPos.y + yOff).project(camera);
  if (tmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = '';
  const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  updateMe(dt);
  for (const p of people) if (!p.isMe) updateFriend(p, dt);

  // 카메라 따라가기
  const mp = me.av.root.position;
  const camDist = dist + (ignite ? 3 : 0);
  const want = new THREE.Vector3(mp.x + Math.sin(yaw) * camDist, 2.6 + camDist * 0.42, mp.z + Math.cos(yaw) * camDist);
  // 카메라가 난간 밖으로 나가 시야를 가리지 않도록 옥상 안쪽에 둔다
  want.x = THREE.MathUtils.clamp(want.x, -HALF_W - 0.2, HALF_W + 0.2);
  want.z = THREE.MathUtils.clamp(want.z, -HALF_D - 0.2, HALF_D + 0.2);
  // 점등 중에는 카메라를 낮추고 하늘을 올려다본다
  const sky = ignite ? THREE.MathUtils.smoothstep(ignite.t, 0.6, 2.4) : 0;
  want.y -= sky * (want.y - 1.4);
  camPos.lerp(want, Math.min(1, dt * (ignite ? 2 : 5)));
  camera.position.copy(camPos);
  const lookAt = new THREE.Vector3(mp.x * (1 - sky), 1.6 + sky * 7.4, mp.z * (1 - sky) + sky * -6);
  camLook.lerp(lookAt, Math.min(1, dt * (ignite ? 2 : 6)));
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
  requestAnimationFrame(frame);
}

document.body.classList.add('ready');
setStatus('화면을 눌러 걸어보세요. 등불을 누르면 친구의 말이 보여요', 6000);
frame();

// 테스트용 핸들
window.__lantern = { startIgnite, me, people, lanterns, camera, get skyOpacity() { return skyName.material.opacity; } };
