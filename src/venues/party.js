import * as THREE from 'three';
import { spotMarker, textPlane } from './common.js';
import { mergeColored } from '../merge.js';

// 장소마다 테마가 다른 '파티 차림': 테이블과 음식, 선물, 줄 장식, 현수막, 입구 아치, 앉을 자리, 바닥 장식.
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

// ── 테마별 음식·소품 ──
// 크루즈: 해산물 플래터·주스 잔 탑·촛대·빵 바구니
function seafoodPlatter() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 24), mat(0xd8e6f0, { rough: 0.3, metal: 0.3 }), 0, 0.025, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), mat(0xeef6ff, { emissive: 0.15, rough: 0.2 }), 0, 0.06, 0)); // 얼음
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const sh = mesh(new THREE.TorusGeometry(0.045, 0.022, 6, 10, Math.PI * 1.3), mat(0xff8a5c, { emissive: 0.15 }), Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2);
    sh.rotation.set(Math.PI / 2, 0, -a);
    g.add(sh);
  }
  const lob = mesh(new THREE.CapsuleGeometry(0.06, 0.22, 4, 8), mat(0xd9402e, { emissive: 0.12 }), 0, 0.12, 0);
  lob.rotation.z = Math.PI / 2;
  g.add(lob);
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0xfff27a, { emissive: 0.2 }), -0.12 + i * 0.08, 0.1, 0.12)); // 레몬
  return g;
}
function coupeTower() {
  const g = new THREE.Group();
  const glass = mat(0xffffff, { rough: 0.05, transparent: true, opacity: 0.45 });
  const juice = mat(0xffd66b, { emissive: 0.35, rough: 0.1 });
  const rows = [[3, 0], [2, 0.16], [1, 0.32]];
  for (const [n, y] of rows) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (i - (n - 1) / 2) * 0.13;
      const z = (j - (n - 1) / 2) * 0.13;
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.012, 0.06, 10, 1, true), glass, x, y + 0.13, z));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 5), glass, x, y + 0.05, z));
      g.add(mesh(new THREE.CylinderGeometry(0.052, 0.02, 0.03, 10), juice, x, y + 0.13, z));
    }
  }
  return g;
}
function candelabra() {
  const g = new THREE.Group();
  const gold = mat(0xffd34d, { metal: 0.7, rough: 0.25, emissive: 0.2 });
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.03, 16), gold, 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), gold, 0, 0.2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.02, 0.02), gold, 0, 0.38, 0));
  for (const x of [-0.2, 0, 0.2]) {
    g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), mat(0xfff8ec, { emissive: 0.2 }), x, 0.47, 0));
    g.add(mesh(new THREE.SphereGeometry(0.02, 6, 5), mat(0xffc46b, { emissive: 1.4 }), x, 0.57, 0));
  }
  return g;
}
function breadBasket() {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.1, 14, 1, true), mat(0xb07a45, { rough: 0.9 }), 0, 0.05, 0);
  b.material.side = THREE.DoubleSide;
  g.add(b);
  for (let i = 0; i < 4; i++) { const r = mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), mat(0xe0a35a), -0.08 + i * 0.055, 0.1, 0); r.rotation.z = Math.PI / 2 + i * 0.3; g.add(r); }
  return g;
}
// 오로라: 핫초코·진저브레드 하우스·쿠키·지팡이 사탕
function cocoaBar() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 16), mat(0xb0332e, { rough: 0.4 }), 0, 0.15, 0));
  const sp = mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.18, 8), mat(0xb0332e, { rough: 0.4 }), 0.16, 0.2, 0);
  sp.rotation.z = -0.9;
  g.add(sp, mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(0xb0332e), 0, 0.31, 0));
  for (let i = 0; i < 5; i++) {
    const x = -0.15 + (i % 3) * 0.17 + 0.3;
    const z = i < 3 ? 0.14 : -0.14;
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.1, 12), mat([0xffffff, 0xd94a5a, 0x5aa060][i % 3], { rough: 0.5 }), x, 0.05, z));
    g.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.01, 12), mat(0x5a2e1c, { emissive: 0.1 }), x, 0.095, z));
    for (let k = 0; k < 3; k++) g.add(mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), mat(0xffffff, { emissive: 0.25 }), x - 0.02 + k * 0.02, 0.105, z + (k % 2) * 0.015));
  }
  return g;
}
function gingerHouse() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.24), mat(0xb5753a), 0, 0.1, 0));
  for (const s of [-1, 1]) {
    const r = mesh(new THREE.BoxGeometry(0.34, 0.025, 0.2), mat(0xffffff, { emissive: 0.25 }), 0, 0.27, s * 0.07);
    r.rotation.x = s * 0.75;
    g.add(r);
  }
  g.add(mesh(new THREE.BoxGeometry(0.07, 0.1, 0.01), mat(0x8a4a2a), 0, 0.05, 0.125));
  for (const x of [-0.1, 0.1]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), mat(0xffd97a, { emissive: 0.6 }), x, 0.12, 0.125));
  return g;
}
function cookies() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 20), mat(0xffffff, { rough: 0.3 }), 0, 0.008, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const c = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 5), mat(0xc98a4a), Math.cos(a) * 0.12, 0.025 + (i % 2) * 0.02, Math.sin(a) * 0.12);
    g.add(c, mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 5), mat(0xffffff, { emissive: 0.2 }), c.position.x, c.position.y + 0.004, c.position.z));
  }
  return g;
}
function candyCanes() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const cane = new THREE.Group();
    cane.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), mat(i % 2 ? 0xd94a5a : 0xffffff, { emissive: 0.15 }), 0, 0.11, 0));
    const hook = mesh(new THREE.TorusGeometry(0.04, 0.015, 6, 10, Math.PI), mat(i % 2 ? 0xffffff : 0xd94a5a, { emissive: 0.15 }), 0.04, 0.22, 0);
    cane.add(hook);
    cane.position.set(-0.08 + i * 0.05, 0, 0);
    cane.rotation.y = i;
    g.add(cane);
  }
  return g;
}
// 열기구: 티 세트·샌드위치 탑·레모네이드·과일 타르트
function teaSet() {
  const g = new THREE.Group();
  const china = mat(0xffffff, { rough: 0.25, emissive: 0.1 });
  const pot = mesh(new THREE.SphereGeometry(0.12, 14, 10), china, 0, 0.12, 0);
  pot.scale.y = 0.85;
  const spout = mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.14, 8), china, 0.14, 0.14, 0);
  spout.rotation.z = -0.8;
  const handle = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), china, -0.12, 0.13, 0);
  g.add(pot, spout, handle, mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xf29bb3), 0, 0.23, 0));
  for (const [x, z] of [[0.25, 0.1], [0.25, -0.12], [-0.25, 0.1]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 14), china, x, 0.004, z));
    g.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.05, 12), china, x, 0.033, z));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.005, 12), mat(0xc98a4a, { emissive: 0.1 }), x, 0.053, z));
  }
  return g;
}
function sandwichTower() {
  const g = new THREE.Group();
  const gold = mat(0xffd34d, { metal: 0.6, rough: 0.3 });
  g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), gold, 0, 0.27, 0));
  [[0.22, 0.02], [0.16, 0.22], [0.11, 0.42]].forEach(([r, y], t) => {
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.015, 18), mat(0xffffff, { rough: 0.3 }), 0, y, 0));
    const n = t === 2 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sw = new THREE.Group();
      sw.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 3), mat(0xf2d9a8), 0, 0, 0));
      sw.add(mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 3), mat(t === 1 ? 0xff8a8a : 0x8fd36a, { emissive: 0.15 }), 0, 0.016, 0));
      sw.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 3), mat(0xf2d9a8), 0, 0.032, 0));
      sw.position.set(Math.cos(a) * r * 0.6, y + 0.02, Math.sin(a) * r * 0.6);
      sw.rotation.y = a;
      g.add(sw);
    }
  });
  return g;
}
function lemonade() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.28, 16), mat(0xffffff, { rough: 0.05, transparent: true, opacity: 0.4 }), 0, 0.14, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.22, 16), mat(0xfff27a, { emissive: 0.35 }), 0, 0.12, 0));
  for (let i = 0; i < 3; i++) { const l = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12), mat(0xffe14a, { emissive: 0.3 }), -0.02 + i * 0.02, 0.1 + i * 0.05, 0.05); l.rotation.x = 1.2; g.add(l); }
  return g;
}
function fruitTart() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.06, 24), mat(0xe0a35a), 0, 0.03, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24), mat(0xfff3c8, { emissive: 0.1 }), 0, 0.065, 0));
  const fr = [0xe5484d, 0x7a4fa0, 0x6cc070, 0xff9a3c];
  for (let i = 0; i < 16; i++) { const a = i * 2.39; const r = 0.03 + (i % 5) * 0.03; g.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), mat(fr[i % 4], { emissive: 0.15 }), Math.cos(a) * r, 0.085, Math.sin(a) * r)); }
  return g;
}
// 우주: 빛나는 시험관 음료·행성 마카롱·우주식 팩
function testTubes() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.04, 0.12), mat(0xc9d0de, { metal: 0.7, rough: 0.3 }), 0, 0.14, 0));
  const cols = [0x4fd8ff, 0xff4fa0, 0x9bff6b, 0xffd34f, 0xb48cff];
  cols.forEach((c, i) => {
    const x = -0.2 + i * 0.1;
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.26, 10), mat(0xffffff, { rough: 0.05, transparent: true, opacity: 0.35 }), x, 0.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10), mat(c, { emissive: 1.2 }), x, 0.1, 0));
  });
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 0.12), mat(0xc9d0de, { metal: 0.7, rough: 0.3 }), 0, 0.01, 0));
  return g;
}
function planetMacarons() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.015, 20), mat(0x3a4258, { metal: 0.6, rough: 0.3 }), 0, 0.008, 0));
  const cols = [0xff7ab8, 0x7ad7ff, 0xffd34f, 0xb48cff, 0x9bff6b];
  cols.forEach((c, i) => {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.13;
    const z = Math.sin(a) * 0.13;
    g.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), mat(c, { emissive: 0.4 }), x, 0.065, z));
    const ring = mesh(new THREE.TorusGeometry(0.075, 0.008, 4, 20), mat(0xffffff, { emissive: 0.6 }), x, 0.065, z);
    ring.rotation.x = Math.PI / 2 + 0.4;
    g.add(ring);
  });
  return g;
}
function spaceFood() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.025), mat(0xd8dde8, { metal: 0.8, rough: 0.25 }), -0.15 + i * 0.1, 0.09, 0);
    p.rotation.z = (i - 1.5) * 0.12;
    g.add(p, mesh(new THREE.BoxGeometry(0.08, 0.05, 0.027), mat([0xff4fa0, 0x4fd8ff, 0xffd34f, 0x9bff6b][i], { emissive: 0.6 }), p.position.x, 0.1, 0.001));
  }
  return g;
}
// 옥상: 바비큐 그릴·쿨러·피자 상자·감자튀김
function bbqGrill() {
  const g = new THREE.Group();
  const black = mat(0x22222a, { metal: 0.5, rough: 0.4 });
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.25, 0.55), black, 0, 0.75, 0));
  for (const [x, z] of [[-0.48, -0.22], [0.48, -0.22], [-0.48, 0.22], [0.48, 0.22]]) g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65, 6), black, x, 0.32, z));
  g.add(mesh(new THREE.BoxGeometry(1.0, 0.02, 0.45), mat(0xff5a1f, { emissive: 1.0 }), 0, 0.86, 0)); // 숯불
  for (let i = 0; i < 6; i++) {
    const sk = new THREE.Group();
    sk.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 4), mat(0xd8c3a0), 0, 0, 0));
    for (let k = 0; k < 4; k++) sk.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat([0x8a3a1c, 0x6cc070, 0xe5484d, 0x8a3a1c][k], { emissive: 0.1 }), 0, -0.13 + k * 0.08, 0));
    sk.rotation.x = Math.PI / 2;
    sk.position.set(-0.4 + i * 0.16, 0.92, 0);
    g.add(sk);
  }
  return g;
}
function cooler() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.4, 0.45), mat(0x2f8fd8, { rough: 0.5 }), 0, 0.2, 0));
  g.add(mesh(new THREE.BoxGeometry(0.66, 0.02, 0.41), mat(0xeef6ff, { emissive: 0.2 }), 0, 0.41, 0));
  const cols = [0xe5484d, 0x4fbf7a, 0xffb347, 0x7ad7ff, 0xb48cff, 0xe5484d];
  cols.forEach((c, i) => g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), mat(c, { metal: 0.6, rough: 0.3, emissive: 0.1 }), -0.24 + (i % 3) * 0.2 + (i > 2 ? 0.1 : 0), 0.46, i > 2 ? 0.1 : -0.08)));
  return g;
}
function pizzaBoxes() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), mat(0xd9c3a0), 0.02 * i, 0.03 + i * 0.065, -0.01 * i));
  const p = pizza();
  p.position.set(0, 0.2, 0);
  g.add(p);
  return g;
}
function fries() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 0.08), mat(0xe5484d, { emissive: 0.1 }), 0, 0.07, 0));
  for (let i = 0; i < 10; i++) { const f = mesh(new THREE.BoxGeometry(0.018, 0.12, 0.018), mat(0xffd166, { emissive: 0.2 }), -0.05 + (i % 5) * 0.025, 0.17, -0.02 + Math.floor(i / 5) * 0.03); f.rotation.z = (i % 3 - 1) * 0.12; g.add(f); }
  return g;
}

// ── 테이블 ──
function table(style) {
  const g = new THREE.Group();
  const L = 3.8;
  const W = 1.1;
  const H = style.h || 0.85;
  if (style.kind === 'cloth') {
    g.add(mesh(new THREE.BoxGeometry(L, 0.06, W), mat(style.cloth, { rough: 0.9 }), 0, H, 0));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 16; i++) {
        const p = mesh(new THREE.CylinderGeometry(0.13, 0.13, H - 0.05, 8, 1, true, 0, Math.PI), mat(i % 2 ? style.skirt : style.cloth, { rough: 0.9 }), -L / 2 + 0.12 + i * ((L - 0.24) / 15), (H - 0.05) / 2, side * (W / 2));
        p.rotation.y = side > 0 ? 0 : Math.PI;
        p.material.side = THREE.DoubleSide;
        g.add(p);
      }
    }
    if (style.runner) g.add(mesh(new THREE.BoxGeometry(L, 0.065, 0.3), mat(style.runner, { emissive: 0.15 }), 0, H + 0.002, 0));
  } else if (style.kind === 'wood') { // 나무 피크닉 테이블
    const wood = mat(style.wood || 0x9a6a40, { rough: 0.85 });
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(L, 0.06, 0.2), wood, 0, H, -0.44 + i * 0.22));
    for (const x of [-1.6, 1.6]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.BoxGeometry(0.08, H, 0.08), wood, x, H / 2, z));
  } else if (style.kind === 'neon') { // 빛나는 테두리의 금속 카운터
    g.add(mesh(new THREE.BoxGeometry(L, H, W), mat(0x2a3042, { metal: 0.7, rough: 0.3 }), 0, H / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(L + 0.04, 0.05, W + 0.04), mat(0xd8dde8, { metal: 0.8, rough: 0.2 }), 0, H, 0));
    for (const z of [-W / 2 - 0.02, W / 2 + 0.02]) g.add(mesh(new THREE.BoxGeometry(L, 0.04, 0.02), mat(style.glow, { emissive: 1.4 }), 0, H - 0.08, z));
    g.add(mesh(new THREE.BoxGeometry(L, 0.04, 0.02), mat(style.glow2, { emissive: 1.4 }), 0, 0.06, W / 2 + 0.02));
  } else if (style.kind === 'wicker') { // 하얀 정원 테이블 + 꽃무늬 식탁보
    g.add(mesh(new THREE.BoxGeometry(L, 0.05, W), mat(0xfff8ec, { rough: 0.8 }), 0, H, 0));
    for (let i = 0; i < 22; i++) g.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), mat([0xf29bb3, 0xffd97a, 0xb9a6f2][i % 3], { emissive: 0.2 }), -L / 2 + 0.1 + i * 0.17, H - 0.03, W / 2 + 0.01));
    for (const x of [-1.6, 1.6]) for (const z of [-0.4, 0.4]) g.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, H, 8), mat(0xffffff, { rough: 0.5 }), x, H / 2, z));
  }
  g.userData.H = H;
  return g;
}

// ── 줄 장식 ──
function lineDeco(g, a, b, sag, style) {
  const n = Math.max(4, Math.round(a.distanceTo(b) / (style.step || 0.55)));
  const dir = Math.atan2(b.x - a.x, b.z - a.z);
  const at = (t) => { const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; return p; };
  for (let i = 1; i < n; i++) {
    const p = at(i / n);
    const c = style.colors[i % style.colors.length];
    let o;
    if (style.kind === 'pennant') {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0, 0, 0.17, 0, 0, 0, -0.34, 0], 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
      o = new THREE.Mesh(geo, mat(c, { emissive: 0.2, rough: 0.9 }));
      o.material.side = THREE.DoubleSide;
      o.rotation.y = dir + Math.PI / 2;
    } else if (style.kind === 'signal') { // 신호 깃발(사각, 두 색)
      o = new THREE.Group();
      const f1 = mesh(new THREE.PlaneGeometry(0.3, 0.15), mat(c, { emissive: 0.2, rough: 0.9 }), 0, -0.1, 0);
      const f2 = mesh(new THREE.PlaneGeometry(0.3, 0.15), mat(style.colors[(i + 2) % style.colors.length], { emissive: 0.2, rough: 0.9 }), 0, -0.25, 0);
      f1.material.side = THREE.DoubleSide;
      f2.material.side = THREE.DoubleSide;
      o.add(f1, f2);
      o.rotation.y = dir + Math.PI / 2;
    } else if (style.kind === 'snowflake') { // 눈송이
      o = new THREE.Group();
      for (let k = 0; k < 3; k++) { const b2 = mesh(new THREE.BoxGeometry(0.26, 0.025, 0.012), mat(c, { emissive: 0.5 }), 0, 0, 0); b2.rotation.z = (k * Math.PI) / 3; o.add(b2); }
      o.position.y = -0.18;
      o.rotation.y = dir + Math.PI / 2;
    } else if (style.kind === 'flower') { // 꽃송이와 잎
      o = new THREE.Group();
      o.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(c, { emissive: 0.2 }), 0, -0.05, 0));
      o.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(0xffd34d, { emissive: 0.3 }), 0, -0.05, 0.07));
      o.add(mesh(new THREE.ConeGeometry(0.04, 0.12, 5), mat(0x6cc070, { emissive: 0.1 }), 0.09, -0.08, 0));
    } else if (style.kind === 'neon') { // 네온 별
      o = mesh(new THREE.OctahedronGeometry(0.09, 0), mat(c, { emissive: 1.3 }), 0, -0.15, 0);
      o.scale.z = 0.4;
    } else { // 'bulbs': 큰 동그란 전구(카페 조명)
      o = mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(c, { emissive: 1.1 }), 0, -0.08, 0);
    }
    o.position.add(p);
    g.add(o);
  }
  const wire = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => at(i / 12)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(wire, 24, style.kind === 'neon' ? 0.02 : 0.012, 4, false), mat(style.wire || 0xfbf4e8, { emissive: style.kind === 'neon' ? 1.2 : 0.08 })));
}

// ── 입구 아치 ──
function archDeco(g, at, ry, r, style) {
  const arch = new THREE.Group();
  if (style.kind === 'neon') {
    const ring = mesh(new THREE.TorusGeometry(r, 0.09, 10, 48, Math.PI), mat(style.colors[0], { emissive: 1.5 }), 0, 0, 0);
    const ring2 = mesh(new THREE.TorusGeometry(r - 0.25, 0.05, 8, 48, Math.PI), mat(style.colors[1], { emissive: 1.5 }), 0, 0, 0);
    arch.add(ring, ring2);
    for (const s of [-1, 1]) arch.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12), mat(0x3a4258, { metal: 0.7 }), s * r, 0.1, 0));
  } else if (style.kind === 'ice') {
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI;
      const b = mesh(new THREE.OctahedronGeometry(0.28, 0), mat(i % 2 ? 0xdff2ff : 0xb8e2ff, { emissive: 0.35, rough: 0.05, transparent: true, opacity: 0.8 }), Math.cos(a) * r, Math.sin(a) * r * 1.15, 0);
      b.rotation.z = a;
      arch.add(b);
    }
  } else if (style.kind === 'rope') { // 밧줄과 구명튜브
    arch.add(mesh(new THREE.TorusGeometry(r, 0.07, 8, 40, Math.PI), mat(0xc9a36a, { rough: 0.9 }), 0, 0, 0));
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * Math.PI;
      const buoy = mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 16), mat(i % 2 ? 0xffffff : 0xff6a3c, { emissive: 0.15 }), Math.cos(a) * r, Math.sin(a) * r, 0.05);
      arch.add(buoy);
    }
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * Math.PI; arch.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(i % 2 ? 0x1d2c66 : 0xffffff, { emissive: 0.15, rough: 0.35 }), Math.cos(a) * (r + 0.3), Math.sin(a) * (r + 0.3), -0.15)); }
  } else { // 'balloon' 또는 'flower'
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * Math.PI;
      for (const off of [-0.18, 0.18]) {
        const flower = style.kind === 'flower';
        arch.add(mesh(new THREE.SphereGeometry(flower ? 0.2 : 0.26, 10, 8), mat(style.colors[(i + (off > 0 ? 2 : 0)) % style.colors.length], { emissive: 0.15, rough: flower ? 0.8 : 0.35 }), Math.cos(a) * r, Math.sin(a) * r * 1.15, off));
        if (flower && i % 2) arch.add(mesh(new THREE.ConeGeometry(0.1, 0.25, 5), mat(0x6cc070, { emissive: 0.1 }), Math.cos(a) * (r + 0.25), Math.sin(a) * (r + 0.25) * 1.15, off));
      }
    }
  }
  arch.position.copy(at);
  arch.rotation.y = ry;
  g.add(arch);
}

// ── 테마별 장식 소품 ──
function iceSwan() {
  const g = new THREE.Group();
  const ice = mat(0xcfeeff, { emissive: 0.35, rough: 0.05, transparent: true, opacity: 0.75 });
  g.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 16), mat(0xe8f0ff, { rough: 0.5 }), 0, 0.3, 0));
  const body = mesh(new THREE.SphereGeometry(0.4, 16, 12), ice, 0, 0.9, 0);
  body.scale.set(1, 0.7, 1.4);
  const neck = mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16, Math.PI * 1.1), ice, 0, 1.3, -0.35);
  neck.rotation.y = Math.PI / 2;
  for (const s of [-1, 1]) { const w = mesh(new THREE.SphereGeometry(0.3, 12, 8), ice, s * 0.3, 1.0, 0.1); w.scale.set(0.3, 0.7, 1.2); w.rotation.z = s * 0.4; g.add(w); }
  g.add(body, neck);
  return g;
}
function litTree(h = 2.2) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), mat(0x6a4a30), 0, 0.2, 0));
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.ConeGeometry(0.7 - k * 0.18, h * 0.4, 8), mat(0x2d6b55, { rough: 0.9 }), 0, 0.5 + k * h * 0.22 + h * 0.2, 0));
  for (let i = 0; i < 16; i++) { const y = 0.6 + Math.random() * h * 0.75; const r = 0.62 * (1 - (y - 0.4) / (h + 0.3)); const a = Math.random() * 6.28; g.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), mat([0xffd34d, 0xff6b6b, 0x7ad7ff][i % 3], { emissive: 1.2 }), Math.cos(a) * r, y, Math.sin(a) * r)); }
  g.add(mesh(new THREE.OctahedronGeometry(0.13, 0), mat(0xffd34d, { emissive: 1.2 }), 0, h + 0.65, 0));
  return g;
}
function pinwheel(c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), mat(0xfaf3e8), 0, 0.55, 0));
  for (let k = 0; k < 4; k++) { const b = mesh(new THREE.ConeGeometry(0.12, 0.22, 3), mat(k % 2 ? c : 0xffffff, { emissive: 0.2 }), 0, 1.1, 0.02); b.rotation.z = (k * Math.PI) / 2; b.translateY(0.1); g.add(b); }
  return g;
}
function flowerPot(c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.35, 12), mat(0xd98b7a), 0, 0.17, 0));
  for (let i = 0; i < 7; i++) { const a = i * 0.9; g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(i % 2 ? c : 0xffffff, { emissive: 0.2 }), Math.cos(a) * 0.12, 0.42 + (i % 3) * 0.05, Math.sin(a) * 0.12)); }
  g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0x6cc070, { rough: 0.9 }), 0, 0.36, 0));
  return g;
}
function holoRing(c, r) {
  const m = mesh(new THREE.TorusGeometry(r, 0.03, 6, 48), mat(c, { emissive: 1.4 }), 0, 0, 0);
  m.rotation.x = Math.PI / 2;
  return m;
}
function saturnBalloon(c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.35, 14, 12), mat(c, { emissive: 0.3, rough: 0.35 }), 0, 0, 0));
  const ring = mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 28), mat(0xffffff, { emissive: 0.5 }), 0, 0, 0);
  ring.rotation.x = Math.PI / 2 + 0.4;
  g.add(ring, mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.2, 4), mat(0xe8e0f0), 0, -1.45, 0));
  return g;
}
function rocket() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.6, 16), mat(0xf2f2f7, { metal: 0.3, rough: 0.4 }), 0, 1.1, 0));
  g.add(mesh(new THREE.ConeGeometry(0.3, 0.6, 16), mat(0xe5484d, { emissive: 0.1 }), 0, 2.2, 0));
  g.add(mesh(new THREE.CircleGeometry(0.12, 16), mat(0x7ad7ff, { emissive: 0.8 }), 0, 1.4, 0.32));
  for (let k = 0; k < 3; k++) { const f = mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), mat(0xe5484d, { emissive: 0.1 }), 0, 0.45, 0); f.rotation.y = (k * Math.PI * 2) / 3; f.translateZ(0.35); g.add(f); }
  return g;
}
function barrel() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 16), mat(0x8a5a3c, { rough: 0.9 }), 0, 0.4, 0));
  for (const y of [0.15, 0.65]) { const h = mesh(new THREE.TorusGeometry(0.33, 0.02, 4, 20), mat(0x3a3150, { metal: 0.5 }), 0, y, 0); h.rotation.x = Math.PI / 2; g.add(h); }
  return g;
}

// 선물 더미(테마 색)
function giftPile(cols) {
  const g = new THREE.Group();
  const boxes = [[0.7, 0.55, 0.6, 0, 0, 0], [0.5, 0.45, 0.5, 1, 0.62, 0.15], [0.42, 0.35, 0.42, 2, 0.1, 0.6], [0.35, 0.3, 0.35, 3, 0.05, 0, true], [0.3, 0.6, 0.3, 4, -0.5, 0.35]];
  for (const [w, h, d, ci, x, z, onTop] of boxes) {
    const y = onTop ? 0.55 : 0;
    const c = cols.box[ci % cols.box.length];
    const rc = cols.ribbon[ci % cols.ribbon.length];
    g.add(mesh(new THREE.BoxGeometry(w, h, d), mat(c, { emissive: 0.12 }), x, y + h / 2, z));
    g.add(mesh(new THREE.BoxGeometry(w + 0.01, h + 0.01, 0.07), mat(rc, { emissive: 0.2 }), x, y + h / 2, z));
    g.add(mesh(new THREE.BoxGeometry(0.07, h + 0.01, d + 0.01), mat(rc, { emissive: 0.2 }), x, y + h / 2, z));
    for (const s of [-1, 1]) { const bow = mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), mat(rc, { emissive: 0.2 }), x + s * 0.06, y + h + 0.05, z); bow.rotation.y = Math.PI / 2; g.add(bow); }
  }
  return g;
}

// 앉을 자리: 벤치(2인)·소파·쿠션 의자. 자리 위치와 높이·방향을 돌려준다.
function seatFurniture(kind, cols) {
  const g = new THREE.Group();
  const seats = [];
  if (kind === 'bench') {
    const wood = mat(cols[0], { rough: 0.85 });
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood, 0, 0.45, 0));
    g.add(mesh(new THREE.BoxGeometry(1.8, 0.45, 0.07), wood, 0, 0.72, -0.24));
    for (const x of [-0.8, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), wood, x, 0.22, 0));
    seats.push([-0.45, 0.49], [0.45, 0.49]);
  } else if (kind === 'sofa') {
    const fab = mat(cols[0], { rough: 0.95 });
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.42, 0.8), fab, 0, 0.21, 0));
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.55, 0.22), fab, 0, 0.6, -0.3));
    for (const x of [-0.95, 0.95]) g.add(mesh(new THREE.BoxGeometry(0.2, 0.55, 0.8), fab, x, 0.32, 0));
    for (const x of [-0.45, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.85, 0.12, 0.6), mat(cols[1], { rough: 0.95 }), x, 0.47, 0.05));
    seats.push([-0.45, 0.53], [0.45, 0.53]);
  } else if (kind === 'pod') { // 우주 라운지 둥근 의자
    for (const x of [-0.55, 0.55]) {
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.4, 20), mat(cols[0], { rough: 0.4, metal: 0.3 }), x, 0.2, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20), mat(cols[1], { emissive: 0.6 }), x, 0.42, 0));
    }
    seats.push([-0.55, 0.46], [0.55, 0.46]);
  } else if (kind === 'blanket') { // 피크닉 담요와 쿠션
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.02, 1.4), mat(cols[0], { rough: 0.95 }), 0, 0.01, 0));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(2.0, 0.022, 0.1), mat(0xffffff, { rough: 0.95 }), 0, 0.012, -0.55 + i * 0.28));
    for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 16), mat(cols[1], { rough: 0.95 }), x, 0.08, 0.1));
    seats.push([-0.5, 0.17], [0.5, 0.17]);
  }
  return { g, seats };
}

// 테마 정의: 색·음식·줄 장식·아치·현수막·앉을 자리·먹기/마시기 문구와 손 소품
const THEMES = {
  cruise: {
    table: { kind: 'cloth', cloth: 0xffffff, skirt: 0x1d2c66, runner: 0xd6b24a },
    food: () => [[seafoodPlatter(), -1.35], [coupeTower(), -0.6], [candelabra(), 0.05], [breadBasket(), 0.6], [fruitBowl(), 1.3]],
    line: { kind: 'signal', colors: [0xe5484d, 0xffd34d, 0x1d2c66, 0xffffff, 0x2f8fd8], wire: 0xc9a36a, step: 0.5 },
    arch: { kind: 'rope' },
    gifts: { box: [0x1d2c66, 0xffffff, 0x2f8fd8, 0xe5484d, 0xffffff], ribbon: [0xd6b24a, 0x1d2c66, 0xffffff] },
    banner: { back: 0xffffff, color: '#1d2c66' },
    confetti: [0xffffff, 0x2f8fd8, 0xd6b24a, 0x1d2c66],
    seats: { kind: 'bench', cols: [0x9a6a40] },
    eat: ['선상 디너', '선상 디너 먹기'], drink: ['주스 건배', '스파클링 주스 건배'],
    props: { eat: 'shrimp', drink: 'coupe' },
  },
  aurora: {
    table: { kind: 'cloth', cloth: 0xf2f6ff, skirt: 0x9fd8ff, runner: 0xd94a5a },
    food: () => [[cocoaBar(), -1.25], [gingerHouse(), -0.4], [cookies(), 0.3], [candyCanes(), 0.85], [cupcakeTower(), 1.45]],
    line: { kind: 'snowflake', colors: [0xffffff, 0xcfeeff, 0x9fd8ff], wire: 0xdfe8f6, step: 0.6 },
    arch: { kind: 'ice' },
    gifts: { box: [0xd94a5a, 0x2d6b55, 0xffffff, 0xd94a5a, 0x9fd8ff], ribbon: [0xffd34d, 0xffffff, 0xd94a5a] },
    banner: { back: 0xeaf4ff, color: '#2b6cb0' },
    confetti: [0xffffff, 0xcfeeff, 0x9fd8ff],
    seats: { kind: 'sofa', cols: [0xe8dcc6, 0xd94a5a] },
    eat: ['쿠키', '쿠키 먹기'], drink: ['핫초코', '핫초코 마시기'],
    props: { eat: 'cookie', drink: 'mug' },
  },
  sky: {
    table: { kind: 'wicker', h: 0.8 },
    food: () => [[teaSet(), -1.3], [sandwichTower(), -0.45], [lemonade(), 0.2], [fruitTart(), 0.75], [macaronTower(), 1.4]],
    line: { kind: 'flower', colors: [0xf29bb3, 0xffd97a, 0xffffff, 0xb9a6f2, 0xff9eb5], wire: 0x6cc070, step: 0.45 },
    arch: { kind: 'flower', colors: [0xf29bb3, 0xffffff, 0xffd97a, 0xb9a6f2, 0xff9eb5] },
    gifts: { box: [0xffd6e0, 0xfff1a8, 0xe0d4ff, 0xc8f0e0, 0xffffff], ribbon: [0xf29bb3, 0xb9a6f2, 0xffd97a] },
    banner: { back: 0xfff5f8, color: '#d9467a' },
    confetti: [0xf29bb3, 0xffffff, 0xffd97a, 0xb9a6f2],
    seats: { kind: 'blanket', cols: [0xf29bb3, 0xfff1a8] },
    eat: ['샌드위치', '샌드위치 먹기'], drink: ['티타임', '홍차 마시기'],
    props: { eat: 'sandwich', drink: 'teacup' },
  },
  space: {
    table: { kind: 'neon', glow: 0x6fe3ff, glow2: 0xff4fa0 },
    food: () => [[testTubes(), -1.3], [planetMacarons(), -0.45], [spaceFood(), 0.3], [donuts(), 0.95], [testTubes(), 1.5]],
    line: { kind: 'neon', colors: [0x6fe3ff, 0xff4fa0, 0xb48cff, 0xffd34f], wire: 0x6fe3ff, step: 0.7 },
    arch: { kind: 'neon', colors: [0xb48cff, 0x6fe3ff] },
    gifts: { box: [0x3a4258, 0xb48cff, 0x2a3042, 0x6fe3ff, 0x3a4258], ribbon: [0x6fe3ff, 0xff4fa0, 0xffd34f] },
    banner: { back: 0x14182a, color: '#6fe3ff', neon: true },
    confetti: [0x6fe3ff, 0xb48cff, 0xff4fa0, 0xffffff],
    seats: { kind: 'pod', cols: [0xf2f2f7, 0x6fe3ff] },
    eat: ['우주 간식', '우주 간식 먹기'], drink: ['우주 음료', '빛나는 우주 음료'],
    props: { eat: 'spacefood', drink: 'tube' },
  },
  rooftop: {
    table: { kind: 'wood', wood: 0xa0703f },
    food: () => [[pizzaBoxes(), -1.3], [chickenBucket(), -0.55], [fries(), 0.05], [donuts(), 0.6], [bottles(), 1.35]],
    line: { kind: 'bulbs', colors: [0xffd27a, 0xff9f5a, 0xfff1c8], wire: 0x1a1626, step: 0.6 },
    arch: { kind: 'balloon', colors: [0xff5c8a, 0xffd34d, 0x4fd8ff, 0x9bff6b, 0xb48cff] },
    gifts: { box: [0xff5c8a, 0x4fd8ff, 0xffd34d, 0x9bff6b, 0xb48cff], ribbon: [0xffffff, 0x2a2238] },
    banner: { back: 0x2a2238, color: '#ffd34d' },
    confetti: [0xff5c8a, 0xffd34d, 0x4fd8ff, 0x9bff6b],
    seats: { kind: 'bench', cols: [0xa0703f] },
    eat: ['바비큐', '바비큐 꼬치 먹기'], drink: ['탄산', '탄산 건배'],
    props: { eat: 'skewer', drink: 'can' },
  },
};

function floorConfetti(g, cols, r = 7, n = 240) {
  const geo = new THREE.PlaneGeometry(0.07, 0.045);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 2.4 + Math.random() * r;
    const m = new THREE.Mesh(geo, mat(cols[i % cols.length], { emissive: 0.15 }));
    m.material.side = THREE.DoubleSide;
    m.position.set(Math.cos(a) * d, 0.012, Math.sin(a) * d);
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    g.add(m);
  }
}

// 장소마다 테마와 위치를 정해 부른다.
// buffet: {x, z, ry} · arch: {x, z, ry} · gifts: {x, z} · bunting: [[a, b, sag]] · banner: {x, y, z, ry}
// seating: [{x, z, ry}] 앉을 가구 위치 · extras: (deco, place) => {} 테마 소품을 놓는 함수
export function partyDressing(group, { theme = 'rooftop', buffet: bf, arch, gifts = { x: -2.6, z: -0.8 }, bunting: lines = [], banner, confettiR = 7, seating = [], extras = null } = {}) {
  const T = THEMES[theme] || THEMES.rooftop;
  const deco = new THREE.Group();
  const obstacles = [];
  const hotspots = [];
  const seats = [];
  if (bf) {
    const tb = table(T.table);
    const H = tb.userData.H;
    for (const [o, x] of T.food()) { o.position.set(x, H + 0.03, -0.1); tb.add(o); }
    tb.position.set(bf.x, 0, bf.z);
    tb.rotation.y = bf.ry || 0;
    deco.add(tb);
    const ax = Math.cos(bf.ry || 0);
    const az = -Math.sin(bf.ry || 0);
    for (const k of [-1.3, 0, 1.3]) obstacles.push({ x: bf.x + ax * k, z: bf.z + az * k, r: 0.85 });
    const fx = Math.sin(bf.ry || 0);
    const fz = Math.cos(bf.ry || 0);
    const front = (k) => new THREE.Vector3(bf.x + ax * k + fx * 1.25, 0, bf.z + az * k + fz * 1.25);
    hotspots.push(
      { id: 'eat', label: T.eat[0], verb: T.eat[1], cool: 2000, pos: front(-0.9), r: 1.6, run: () => ({ emote: 'eat' }) },
      { id: 'cheers', label: T.drink[0], verb: T.drink[1], cool: 2000, pos: front(0.9), r: 1.6, run: () => ({ emote: 'cheers' }) },
    );
  }
  // 앉을 자리
  for (const st of seating) {
    const { g, seats: local } = seatFurniture(T.seats.kind, T.seats.cols);
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.ry || 0;
    deco.add(g);
    const c = Math.cos(st.ry || 0);
    const s2 = Math.sin(st.ry || 0);
    for (const [lx, h] of local) seats.push({ pos: new THREE.Vector3(st.x + lx * c, 0, st.z - lx * s2), h, face: (st.ry || 0) });
  }
  const gp = giftPile(T.gifts);
  gp.position.set(gifts.x, 0, gifts.z);
  gp.rotation.y = 0.4;
  deco.add(gp);
  obstacles.push({ x: gifts.x, z: gifts.z, r: 0.75 });
  for (const [a, b, sag] of lines) lineDeco(deco, a, b, sag, T.line);
  if (arch) archDeco(deco, new THREE.Vector3(arch.x, 0, arch.z), arch.ry || 0, arch.r || 2.4, T.arch);
  floorConfetti(deco, T.confetti, confettiR);
  extras?.(deco, { mesh, mat, iceSwan, litTree, pinwheel, flowerPot, holoRing, saturnBalloon, rocket, barrel, obstacles });
  group.add(mergeColored(deco));
  // 현수막(글자는 따로)
  if (banner) {
    const bn = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.0), new THREE.MeshStandardMaterial({ color: T.banner.back, emissive: T.banner.back, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    const words = T.banner.neon ? textPlane('생일 축하해', { w: 4.2, h: 0.85, color: T.banner.color, glow: 20 }) : textPlane('생일 축하해', { w: 4.2, h: 0.85, color: T.banner.color, solid: true });
    words.position.z = 0.01;
    const words2 = words.clone();
    words2.position.z = -0.01;
    words2.rotation.y = Math.PI;
    bn.add(back, words, words2);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, banner.y + 0.5, 8), mat(T.banner.neon ? 0x6fe3ff : 0xfbf4e8, { emissive: T.banner.neon ? 1.2 : 0.08 }));
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
  // 앉기: 가구마다 버튼 하나(가장 가까운 빈자리에 앉는다)
  for (const st of seating) {
    const pos = new THREE.Vector3(st.x + Math.sin(st.ry || 0) * 1.0, 0, st.z + Math.cos(st.ry || 0) * 1.0);
    hotspots.push({ id: `seat${hotspots.length}`, label: '앉는 자리', verb: '앉기', cool: 800, pos, r: 1.5, seat: true });
  }
  return { obstacles, hotspots, seats, props: T.props };
}

export const bbqGrillDeco = () => bbqGrill();
export const coolerDeco = () => cooler();
