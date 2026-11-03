import * as THREE from 'three';
import { spotMarker, textPlane } from './common.js';
import { mergeColored } from '../merge.js';

// 모든 장소에 공통으로 까는 '파티 차림': 뷔페 테이블과 음식, 선물 더미, 깃발 줄, 현수막, 풍선 아치, 바닥 색종이.
// 움직이지 않는 것들이라 재료별로 합쳐서 휴대폰에서도 몇 번 만에 그린다.
const C = {
  cloth: 0xfbf4e8, skirt: 0xf29bb3, wood: 0x8a5a3c, plate: 0xffffff, gold: 0xffd34d,
  pink: 0xf29bb3, mint: 0x8fd3c1, lav: 0xb9a6f2, butter: 0xffd97a, cream: 0xfff3e0, choco: 0x6b3f2a,
  red: 0xe5484d, crust: 0xe0a35a, cheese: 0xffd166, chicken: 0xc77a2e, grape: 0x7a4fa0, orange: 0xff9a3c, green: 0x6cc070,
};
const matCache = new Map();
function mat(hex, { emissive = 0.08, rough = 0.6, metal = 0, transparent = false, opacity = 1 } = {}) {
  const key = `${hex}|${emissive}|${rough}|${metal}|${opacity}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: emissive, roughness: rough, metalness: metal, transparent, opacity }));
  }
  return matCache.get(key);
}
function mesh(geo, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  return o;
}

// ── 음식 ──
function cupcake(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.08, 10), mat(0xf6e2c8), 0, 0.04, 0));
  const top = mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(color, { emissive: 0.15 }), 0, 0.1, 0);
  top.scale.y = 0.8;
  g.add(top, mesh(new THREE.SphereGeometry(0.02, 6, 5), mat(C.red, { emissive: 0.2 }), 0, 0.16, 0));
  return g;
}
function cupcakeTower() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), mat(C.gold, { metal: 0.6, rough: 0.3 }), 0, 0.37, 0));
  const tiers = [[0.38, 0.02, 7], [0.28, 0.27, 5], [0.17, 0.52, 3]];
  const cols = [C.pink, C.mint, C.lav, C.butter];
  tiers.forEach(([r, y, n], t) => {
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.02, 20), mat(C.plate, { rough: 0.3 }), 0, y, 0));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = cupcake(cols[(i + t) % cols.length]);
      c.position.set(Math.cos(a) * r * 0.65, y + 0.01, Math.sin(a) * r * 0.65);
      g.add(c);
    }
  });
  return g;
}
function macaronTower() {
  const g = new THREE.Group();
  const cols = [C.pink, C.mint, C.lav, C.butter, 0xffb3a7];
  let y = 0.03;
  for (let row = 0; row < 6; row++) {
    const r = 0.22 - row * 0.032;
    const n = Math.max(1, Math.round((r * Math.PI * 2) / 0.07));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + row * 0.3;
      const m = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.035, 10), mat(cols[(i + row) % cols.length], { emissive: 0.12 }), Math.cos(a) * r, y, Math.sin(a) * r);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = -a;
      g.add(m);
    }
    y += 0.06;
  }
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), mat(C.plate, { rough: 0.3 }), 0, 0.005, 0));
  return g;
}
function pizza() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), mat(0xd9c3a0), 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.03, 24), mat(C.crust), 0, 0.04, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 24), mat(C.cheese, { emissive: 0.12 }), 0, 0.058, 0));
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4;
    const r = 0.06 + (i % 3) * 0.06;
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), mat(C.red, { emissive: 0.1 }), Math.cos(a) * r, 0.066, Math.sin(a) * r));
  }
  return g;
}
function chickenBucket() {
  const g = new THREE.Group();
  const bucket = mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 16, 1, true), mat(0xffffff, { rough: 0.5 }), 0, 0.15, 0);
  bucket.material.side = THREE.DoubleSide;
  g.add(bucket, mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 16, 1, true), mat(C.red), 0, 0.22, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leg = mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 8), mat(C.chicken, { rough: 0.8 }), Math.cos(a) * 0.08, 0.32, Math.sin(a) * 0.08);
    leg.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    g.add(leg);
  }
  return g;
}
function donuts() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), mat(C.plate, { rough: 0.3 }), 0, 0.01, 0));
  const glaze = [C.pink, C.choco, C.cream, C.mint];
  [[-0.1, 0.05, -0.06], [0.1, 0.05, -0.04], [0, 0.05, 0.1], [0, 0.12, 0]].forEach(([x, y, z], i) => {
    const d = mesh(new THREE.TorusGeometry(0.075, 0.035, 8, 16), mat(0xe8b070), x, y, z);
    d.rotation.x = Math.PI / 2;
    const t = mesh(new THREE.TorusGeometry(0.075, 0.03, 8, 16), mat(glaze[i], { emissive: 0.12 }), x, y + 0.02, z);
    t.rotation.x = Math.PI / 2;
    t.scale.z = 0.6;
    g.add(d, t);
  });
  return g;
}
function fruitBowl() {
  const g = new THREE.Group();
  const bowl = mesh(new THREE.SphereGeometry(0.25, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x9fd8ff, { rough: 0.2, transparent: true, opacity: 0.85 }), 0, 0.25, 0);
  bowl.material.side = THREE.DoubleSide;
  g.add(bowl);
  const fr = [[C.orange, 0.07], [C.red, 0.065], [C.green, 0.06], [C.orange, 0.07], [C.red, 0.06]];
  fr.forEach(([c, r], i) => { const a = i * 1.3; g.add(mesh(new THREE.SphereGeometry(r, 10, 8), mat(c, { emissive: 0.12 }), Math.cos(a) * 0.1, 0.2 + (i % 2) * 0.05, Math.sin(a) * 0.1)); });
  for (let i = 0; i < 10; i++) g.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), mat(C.grape, { emissive: 0.15 }), 0.08 + (i % 3) * 0.04, 0.24 + Math.floor(i / 3) * 0.035, -0.06 + (i % 2) * 0.03));
  return g;
}
function punchBowl() {
  const g = new THREE.Group();
  const bowl = mesh(new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff, { rough: 0.05, transparent: true, opacity: 0.5 }), 0, 0.32, 0);
  bowl.material.side = THREE.DoubleSide;
  const juice = mesh(new THREE.CircleGeometry(0.27, 20), mat(0xff6b8a, { emissive: 0.35, rough: 0.1 }), 0, 0.27, 0);
  juice.rotation.x = -Math.PI / 2;
  g.add(bowl, juice, mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.04, 16), mat(0xffffff, { rough: 0.2 }), 0, 0.02, 0));
  for (let i = 0; i < 6; i++) {
    const x = -0.35 + (i % 3) * 0.12 + (i > 2 ? 0.75 : 0);
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 10), mat(0xffffff, { rough: 0.1, transparent: true, opacity: 0.6 }), x, 0.045, 0.22));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 10), mat(0xff6b8a, { emissive: 0.3 }), x, 0.03, 0.22));
  }
  return g;
}
function bottles() {
  const g = new THREE.Group();
  [[0x4fbf7a, -0.08], [0xffb347, 0.06], [0x7ad7ff, 0.18]].forEach(([c, x]) => {
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 12), mat(c, { rough: 0.15, emissive: 0.15 }), x, 0.12, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.08, 10), mat(c, { rough: 0.15, emissive: 0.15 }), x, 0.28, 0));
  });
  return g;
}

// 뷔페 테이블: 길이 3.8, 식탁보와 주름 치마, 위에 음식
function buffet() {
  const g = new THREE.Group();
  const L = 3.8;
  const W = 1.1;
  const H = 0.85;
  g.add(mesh(new THREE.BoxGeometry(L, 0.06, W), mat(C.cloth, { rough: 0.9 }), 0, H, 0));
  // 주름 잡힌 치마(앞뒤)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      const p = mesh(new THREE.CylinderGeometry(0.13, 0.13, H - 0.05, 8, 1, true, 0, Math.PI), mat(i % 2 ? C.skirt : C.cloth, { rough: 0.9 }), -L / 2 + 0.12 + i * ((L - 0.24) / 15), (H - 0.05) / 2, side * (W / 2));
      p.rotation.y = side > 0 ? 0 : Math.PI;
      p.material.side = THREE.DoubleSide;
      g.add(p);
    }
  }
  const items = [[cupcakeTower(), -1.4], [pizza(), -0.75], [chickenBucket(), -0.15], [donuts(), 0.42], [macaronTower(), 0.95], [fruitBowl(), 1.48]];
  for (const [o, x] of items) { o.position.set(x, H + 0.03, -0.12); g.add(o); }
  const pb = punchBowl();
  pb.position.set(0.3, H + 0.03, 0.28);
  const bt = bottles();
  bt.position.set(-1.1, H + 0.03, 0.3);
  g.add(pb, bt);
  return g;
}

// 선물 더미
function giftPile() {
  const g = new THREE.Group();
  const boxes = [[0.7, 0.55, 0.6, C.pink, C.gold, 0, 0], [0.5, 0.45, 0.5, C.mint, 0xffffff, 0.62, 0.15], [0.42, 0.35, 0.42, C.lav, C.gold, 0.1, 0.6], [0.35, 0.3, 0.35, C.butter, C.pink, 0.05, 0, true], [0.3, 0.6, 0.3, 0xff8a65, 0xffffff, -0.5, 0.35]];
  for (const [w, h, d, c, rc, x, z, onTop] of boxes) {
    const y = onTop ? 0.55 : 0;
    g.add(mesh(new THREE.BoxGeometry(w, h, d), mat(c, { emissive: 0.12 }), x, y + h / 2, z));
    g.add(mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.07), mat(rc, { emissive: 0.2, metal: rc === C.gold ? 0.5 : 0 }), x, y + h / 2, z));
    g.add(mesh(new THREE.BoxGeometry(0.07, h + 0.01, d + 0.01), mat(rc, { emissive: 0.2, metal: rc === C.gold ? 0.5 : 0 }), x, y + h / 2, z));
    for (const s of [-1, 1]) {
      const bow = mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), mat(rc, { emissive: 0.2 }), x + s * 0.06, y + h + 0.05, z);
      bow.rotation.y = Math.PI / 2;
      g.add(bow);
    }
  }
  return g;
}

// 깃발 줄: 두 점 사이 처진 줄에 알록달록 삼각 깃발
function bunting(g, a, b, sag = 0.6) {
  const cols = [C.pink, C.mint, C.butter, C.lav, 0xff8a65];
  const n = Math.max(4, Math.round(a.distanceTo(b) / 0.55));
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0, 0, 0.17, 0, 0, 0, -0.34, 0], 3));
  flag.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  flag.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  const dir = Math.atan2(b.x - a.x, b.z - a.z);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    const f = new THREE.Mesh(flag, mat(cols[i % cols.length], { emissive: 0.2, rough: 0.9 }));
    f.material.side = THREE.DoubleSide;
    f.position.copy(p);
    f.rotation.y = dir + Math.PI / 2;
    g.add(f);
  }
  const wire = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => { const t = i / 12; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; return p; }));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(wire, 24, 0.012, 4, false), mat(0xfbf4e8)));
}

// 풍선 아치(입구)
function balloonArch(g, at, ry = 0, r = 2.4) {
  const cols = [C.pink, 0xffffff, C.mint, C.butter, C.lav];
  const arch = new THREE.Group();
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI;
    for (const off of [-0.18, 0.18]) {
      const b = mesh(new THREE.SphereGeometry(0.26, 12, 10), mat(cols[(i + (off > 0 ? 2 : 0)) % cols.length], { emissive: 0.15, rough: 0.35 }), Math.cos(a) * r, Math.sin(a) * r * 1.15, off);
      arch.add(b);
    }
  }
  arch.position.copy(at);
  arch.rotation.y = ry;
  g.add(arch);
}

// 바닥에 흩뿌린 색종이
function floorConfetti(g, r = 7, n = 260) {
  const cols = [C.pink, C.mint, C.butter, C.lav, 0xffffff];
  const geo = new THREE.PlaneGeometry(0.07, 0.045);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 2.2 + Math.random() * r;
    const m = new THREE.Mesh(geo, mat(cols[i % cols.length], { emissive: 0.15 }));
    m.material.side = THREE.DoubleSide;
    m.position.set(Math.cos(a) * d, 0.012, Math.sin(a) * d);
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    g.add(m);
  }
}

// 장소마다 위치만 다르게 부른다.
// buffet: {x, z, ry} · arch: {x, z, ry} · gifts: {x, z} · bunting: [[a, b, sag]] · banner: {x, y, z, ry}
export function partyDressing(group, { buffet: bf, arch, gifts = { x: -2.6, z: -0.8 }, bunting: lines = [], banner, confettiR = 7 } = {}) {
  const deco = new THREE.Group();
  const obstacles = [];
  const hotspots = [];
  if (bf) {
    const b = buffet();
    b.position.set(bf.x, 0, bf.z);
    b.rotation.y = bf.ry || 0;
    deco.add(b);
    // 테이블 길이 방향으로 장애물 3개
    const ax = Math.cos(bf.ry || 0);
    const az = -Math.sin(bf.ry || 0);
    for (const k of [-1.3, 0, 1.3]) obstacles.push({ x: bf.x + ax * k, z: bf.z + az * k, r: 0.85 });
    // 테이블 앞(+z 방향을 돌린 쪽)에서 먹기·건배
    const fx = Math.sin(bf.ry || 0);
    const fz = Math.cos(bf.ry || 0);
    const front = (k) => new THREE.Vector3(bf.x + ax * k + fx * 1.25, 0, bf.z + az * k + fz * 1.25);
    hotspots.push(
      { id: 'eat', label: '간식', verb: '간식 먹기', cool: 2000, pos: front(-0.9), r: 1.6, run: () => ({ emote: 'eat' }) },
      { id: 'cheers', label: '음료', verb: '건배하기', cool: 2000, pos: front(0.9), r: 1.6, run: () => ({ emote: 'cheers' }) },
    );
  }
  const gp = giftPile();
  gp.position.set(gifts.x, 0, gifts.z);
  gp.rotation.y = 0.4;
  deco.add(gp);
  obstacles.push({ x: gifts.x, z: gifts.z, r: 0.75 });
  for (const [a, b, sag] of lines) bunting(deco, a, b, sag);
  if (arch) balloonArch(deco, new THREE.Vector3(arch.x, 0, arch.z), arch.ry || 0, arch.r || 2.4);
  floorConfetti(deco, confettiR);
  group.add(mergeColored(deco));
  // 현수막은 글자가 있어서 따로(합치지 않음)
  if (banner) {
    const bn = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.0), new THREE.MeshStandardMaterial({ color: C.cream, emissive: C.cream, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    const words = textPlane('생일 축하해', { w: 4.2, h: 0.85, color: '#e0457a', solid: true });
    words.position.z = 0.01;
    const words2 = words.clone();
    words2.position.z = -0.01;
    words2.rotation.y = Math.PI;
    bn.add(back, words, words2);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, banner.y + 0.5, 8), mat(0xfbf4e8));
      pole.position.set(s * 2.4, -(banner.y + 0.5) / 2 + 0.5, 0);
      bn.add(pole);
    }
    bn.position.set(banner.x, banner.y, banner.z);
    bn.rotation.y = banner.ry || 0;
    group.add(bn);
    obstacles.push({ x: banner.x - 2.4 * Math.cos(banner.ry || 0), z: banner.z + 2.4 * Math.sin(banner.ry || 0), r: 0.3 });
    obstacles.push({ x: banner.x + 2.4 * Math.cos(banner.ry || 0), z: banner.z - 2.4 * Math.sin(banner.ry || 0), r: 0.3 });
  }
  for (const hs of hotspots) hs.marker = spotMarker(group, hs.pos, 0xffd97a);
  return { obstacles, hotspots };
}
