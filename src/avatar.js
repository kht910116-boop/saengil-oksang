import * as THREE from 'three';
import { mergeStatic } from './merge.js';

// 말랑한 마시멜로 인형: 통통한 몸통 하나에 작은 팔다리. 걸을 때 젤리처럼 출렁인다.
const INK = 0x2a2238;
const CHEEK = 0xf2a0a8;

// 위아래가 둥근 원기둥(마시멜로) 단면
function marshmallowGeometry(r = 0.44, h = 1.0, round = 0.2) {
  const pts = [new THREE.Vector2(0, 0)];
  const seg = 8;
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - round + Math.cos(a) * round, round + Math.sin(a) * round));
  }
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - round + Math.cos(a) * round, h - round + Math.sin(a) * round));
  }
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, 28);
  g.computeVertexNormals();
  return g;
}

const bodyGeo = marshmallowGeometry();
const limbGeo = new THREE.CapsuleGeometry(0.075, 0.16, 4, 10);
const footGeo = new THREE.SphereGeometry(0.12, 14, 10);
const eyeGeo = new THREE.SphereGeometry(0.045, 12, 10);
const cheekGeo = new THREE.CircleGeometry(0.06, 16);
const mouthGeo = new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI);
const inkMat = new THREE.MeshBasicMaterial({ color: INK });
const WHITE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const cheekMat = new THREE.MeshBasicMaterial({ color: CHEEK, transparent: true, opacity: 0.8, depthWrite: false });

// 같은 색·밝기의 재료는 모든 인형이 함께 쓴다(휴대폰에서 그리는 부담을 줄임)
const softCache = new Map();
function soft(color, emissive = 0.16) {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}|${emissive}`;
  let m = softCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0, emissive: c, emissiveIntensity: emissive });
    softCache.set(key, m);
  }
  return m;
}
// 옷 색을 살짝 밝힌 마시멜로 색
function pastel(hex, k = 0.28) {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
}

function partyHat(color) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 20), soft(color, 0.2));
  cone.position.y = 0.21;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 6, 20), soft(0xfbf4e8, 0.3));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.14;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), soft(0xfbf4e8, 0.3));
  pom.position.y = 0.44;
  g.add(cone, stripe, pom);
  return g;
}

function crown() {
  const g = new THREE.Group();
  const gold = GOLD_MAT;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24, 1, true), gold);
  band.position.y = 0.05;
  g.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 8), gold);
    spike.position.set(Math.sin(a) * 0.19, 0.16, Math.cos(a) * 0.19);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), soft(i % 2 ? 0xf29bb3 : 0x8fd3c1, 0.5));
    gem.position.set(Math.sin(a) * 0.2, 0.05, Math.cos(a) * 0.2);
    g.add(spike, gem);
  }
  return g;
}

// ── 파티 의상: 드레스·정장·파티복. 옷 색은 그 사람의 색을 따른다 ──
const GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.3, metalness: 0.5, emissive: 0xffb800, emissiveIntensity: 0.25, side: THREE.DoubleSide });
const GOLD = () => GOLD_MAT;

function dress(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, emissive: color, emissiveIntensity: 0.14, side: THREE.DoubleSide });
  // 허리에서 퍼지는 치마(물결 단)
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    prof.push(new THREE.Vector2(0.455 + t * t * 0.2, 0.62 - t * 0.5));
  }
  const skirt = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), mat);
  const pos = skirt.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.2) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      pos.setY(i, y + Math.sin(a * 8) * 0.025);
    }
  }
  skirt.geometry.computeVertexNormals();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.452, 0.455, 0.12, 28, 1, true), mat);
  top.position.y = 0.66;
  const trim = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.018, 6, 32), soft(0xfbf4e8, 0.35));
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.62;
  // 가슴의 리본
  const bow = new THREE.Group();
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 10), soft(0xfbf4e8, 0.3));
    w.rotation.z = s * Math.PI / 2;
    w.position.x = s * 0.06;
    bow.add(w);
  }
  bow.position.set(0, 0.63, 0.46);
  g.add(skirt, top, trim, bow);
  return { group: g, sleeve: null };
}

function suit(color) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.55, metalness: 0.05 });
  // 몸을 감싼 재킷(앞이 V자로 열려 셔츠가 보인다)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.458, 0.462, 0.5, 32, 1, true, 0.42, Math.PI * 2 - 0.84), jacket);
  body.position.y = 0.4;
  body.material.side = THREE.DoubleSide;
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.452, 0.456, 0.5, 12, 1, true, -0.42, 0.84), soft(0xfbf4e8, 0.2));
  shirt.position.y = 0.4;
  // 옷깃
  const lapelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.35), roughness: 0.4 });
  for (const s of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.02), lapelMat);
    l.position.set(s * 0.16, 0.5, 0.43);
    l.rotation.z = s * 0.35;
    l.rotation.y = s * 0.35;
    g.add(l);
  }
  // 나비넥타이와 단추
  const tie = new THREE.Group();
  const tieMat = soft(0x2a2238, 0.05);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), tieMat);
    w.rotation.z = s * Math.PI / 2;
    w.position.x = s * 0.05;
    tie.add(w);
  }
  tie.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), tieMat));
  tie.position.set(0, 0.62, 0.46);
  for (const y of [0.42, 0.3]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), GOLD());
    b.position.set(0, y, 0.462);
    g.add(b);
  }
  g.add(body, shirt, tie);
  return { group: g, sleeve: jacket };
}

function partyWear(color) {
  const g = new THREE.Group();
  // 반짝이 상의: 빛을 받으면 반짝이는 금속 느낌
  const sequin = new THREE.MeshStandardMaterial({ color, roughness: 0.18, metalness: 0.75, emissive: color, emissiveIntensity: 0.22, flatShading: true });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.458, 0.462, 0.42, 18, 3, true), sequin);
  top.position.y = 0.38;
  // 목에 두른 깃털 목도리
  const boa = new THREE.Group();
  const boaMat = soft(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55), 0.3);
  const fluff = new THREE.SphereGeometry(0.07, 8, 6);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const f = new THREE.Mesh(fluff, boaMat);
    f.position.set(Math.sin(a) * 0.45, 0.6 + Math.sin(a * 3) * 0.02, Math.cos(a) * 0.45);
    if (Math.cos(a) > 0.82) f.position.y -= 0.04; // 얼굴 앞은 살짝 내린다
    boa.add(f);
  }
  g.add(top, boa);
  return { group: g, sleeve: null };
}

// 주인공 망토: 등 뒤로 늘어진 붉은 망토와 흰 털 깃
function cape() {
  const g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ color: 0xb3203a, roughness: 0.7, emissive: 0x5a0a18, emissiveIntensity: 0.25, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.66, 0.9, 24, 4, true, Math.PI / 2 + 0.25, Math.PI - 0.5), velvet);
  cloth.position.y = -0.45;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.02, 6, 24, Math.PI - 0.5), GOLD());
  hem.rotation.x = Math.PI / 2;
  hem.rotation.z = Math.PI + 0.25;
  hem.position.y = -0.9;
  const fur = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.06, 8, 28, Math.PI + 0.6), soft(0xfbf4e8, 0.3));
  fur.rotation.x = Math.PI / 2;
  fur.rotation.z = Math.PI - 0.3;
  g.add(cloth, hem, fur);
  g.position.y = 1.0;
  return g;
}

export const OUTFIT_BUILDERS = { dress, suit, party: partyWear };

// ── 꾸미기 소품: 리본 · 고양이 귀 · 토끼 귀 · 동그란 안경 · 꽃 핀 ──
function ribbon() {
  const g = new THREE.Group();
  const m = soft(0xff5c8a, 0.2);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 12), m);
    w.rotation.z = s * Math.PI / 2;
    w.position.x = s * 0.11;
    g.add(w);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), m));
  g.position.set(0.17, 1.1, 0.05);
  g.rotation.z = -0.35;
  return g;
}
function catEars(color) {
  const g = new THREE.Group();
  const outer = soft(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.1), 0.14);
  const inner = soft(0xffb6c8, 0.2);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), outer);
    e.position.set(s * 0.22, 1.16, 0);
    e.rotation.set(0, Math.PI / 4, s * -0.3);
    const i = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), inner);
    i.position.set(s * 0.215, 1.14, 0.04);
    i.rotation.set(0, Math.PI / 4, s * -0.3);
    g.add(e, i);
  }
  return g;
}
function bunnyEars(color) {
  const g = new THREE.Group();
  const outer = soft(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35), 0.14);
  const inner = soft(0xffb6c8, 0.2);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.38, 4, 10), outer);
    e.position.set(s * 0.13, 1.4, -0.02);
    e.rotation.z = s * -0.22;
    e.scale.z = 0.55;
    const i = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.28, 4, 8), inner);
    i.position.set(s * 0.13 + s * 0.004, 1.4, 0.015);
    i.rotation.z = s * -0.22;
    i.scale.z = 0.4;
    g.add(e, i);
  }
  return g;
}
function glasses() {
  const g = new THREE.Group();
  const m = soft(0x2a2238, 0.05);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20), m);
    r.position.set(s * 0.13, 0.82, 0.455);
    g.add(r);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), m);
    arm.position.set(s * 0.215, 0.83, 0.3);
    g.add(arm);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.012), m);
  bridge.position.set(0, 0.84, 0.46);
  g.add(bridge);
  return g;
}
function flowerPin() {
  const g = new THREE.Group();
  const petal = soft(0xfff1a8, 0.2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), petal);
    p.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0);
    p.scale.z = 0.5;
    g.add(p);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), soft(0xff8a3c, 0.25)));
  g.position.set(-0.27, 1.0, 0.3);
  g.rotation.y = -0.6;
  return g;
}
// 손 소품 모양(간식: 컵케이크·새우·쿠키·샌드위치·우주식·꼬치 / 음료: 컵·주스잔·머그·찻잔·시험관·캔)
const PROP_BUILDERS = {
  cupcake() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.07, 10), soft(0xf6e2c8, 0.1))); const t = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), soft(0xf29bb3, 0.2)); t.position.y = 0.06; t.scale.y = 0.8; g.add(t); return g; },
  shrimp() { const g = new THREE.Group(); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.025, 6, 10, Math.PI * 1.3), soft(0xff8a5c, 0.2)); sh.rotation.x = Math.PI / 2; g.add(sh, new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), soft(0xd8c3a0, 0.1))); return g; },
  cookie() { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 5), soft(0xc98a4a, 0.1)); c.rotation.x = Math.PI / 2; const ic = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.028, 5), soft(0xffffff, 0.2)); ic.rotation.x = Math.PI / 2; g.add(c, ic); return g; },
  sandwich() { const g = new THREE.Group(); [[0xf2d9a8, 0], [0x8fd36a, 0.02], [0xff8a8a, 0.035], [0xf2d9a8, 0.055]].forEach(([c, y]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 3), soft(c, 0.12)); m.position.y = y; g.add(m); }); return g; },
  spacefood() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.02), soft(0xd8dde8, 0.15))); const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.022), soft(0x4fd8ff, 0.6)); g.add(l); return g; },
  skewer() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), soft(0xd8c3a0, 0.1))); [0x8a3a1c, 0x6cc070, 0xe5484d, 0x8a3a1c].forEach((c, k) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), soft(c, 0.12)); m.position.y = 0.04 + k * 0.05; g.add(m); }); return g; },
  cup() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.13, 12), soft(0xffffff, 0.15))); const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 12), soft(0xff6b8a, 0.35)); j.position.y = 0.03; g.add(j); return g; },
  coupe() { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.015, 0.06, 12), soft(0xffd66b, 0.4)); b.position.y = 0.09; g.add(b, new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), soft(0xffffff, 0.2))); return g; },
  mug() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.11, 12), soft(0xd94a5a, 0.15))); const h = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 5, 10), soft(0xd94a5a, 0.15)); h.position.x = 0.065; g.add(h); const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), soft(0xffffff, 0.3)); m.position.y = 0.065; g.add(m); return g; },
  teacup() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.06, 12), soft(0xffffff, 0.2))); const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.008, 14), soft(0xffffff, 0.2)); sc.position.y = -0.035; const h = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 5, 10), soft(0xf29bb3, 0.2)); h.position.x = 0.06; g.add(sc, h); return g; },
  tube() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10), soft(0xffffff, 0.2))); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), new THREE.MeshBasicMaterial({ color: 0x4fd8ff })); l.position.y = -0.03; g.add(l); return g; },
  can() { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 12), soft(0xe5484d, 0.2))); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.01, 12), soft(0xd8dde8, 0.2)); t.position.y = 0.07; g.add(t); return g; },
};

export const ACCESSORY_BUILDERS = { ribbon, cat: catEars, bunny: bunnyEars, glasses, flower: flowerPin };
const HAT_OFF = new Set(['ribbon', 'cat', 'bunny']); // 머리 위 소품과 고깔모자는 같이 쓰지 않는다

export function createAvatar({ props: propTheme = null, color = 0xf29bb3, hat = false, hatColor = 0xffc46b, crown: wearsCrown = false, outfit = null, accessory = null } = {}) {
  const root = new THREE.Group();
  const turn = new THREE.Group(); // 바라보는 방향
  const jelly = new THREE.Group(); // 출렁임(찌그러짐)
  root.add(turn);
  turn.add(jelly);

  const bodyMat = soft(pastel(color));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.12;
  jelly.add(body);

  // 얼굴(앞쪽 +z)
  const face = new THREE.Group();
  // 눈: 깜빡이고 표정에 따라 바뀌도록 따로 둔다(가운데를 기준점으로)
  const eyes = new THREE.Group();
  eyes.position.set(0, 0.82, 0);
  const eyeParts = new THREE.Group();
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, inkMat);
    e.position.set(s * 0.13, 0, 0.425);
    e.scale.set(1, 1.15, 0.5);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), WHITE_MAT); // 눈빛
    hl.position.set(s * 0.13 + 0.016, 0.02, 0.452);
    eyeParts.add(e, hl);
  }
  eyes.add(mergeStatic(eyeParts));
  // 웃는 눈(^^)
  const happyEyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 12, Math.PI), inkMat);
    arc.position.set(s * 0.13, -0.01, 0.44);
    happyEyes.add(arc);
  }
  mergeStatic(happyEyes);
  happyEyes.visible = false;
  eyes.add(happyEyes);
  jelly.add(eyes);
  // 동그랗게 벌린 입(놀람·노래)
  const mouthO = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), soft(0x7a2a3a, 0.1));
  mouthO.position.set(0, 0.7, 0.43);
  mouthO.scale.set(1, 1.2, 0.4);
  mouthO.visible = false;
  jelly.add(mouthO);
  const cL = new THREE.Mesh(cheekGeo, cheekMat);
  const cR = new THREE.Mesh(cheekGeo, cheekMat);
  cL.position.set(-0.24, 0.7, 0.405);
  cR.position.set(0.24, 0.7, 0.405);
  cL.rotation.y = -0.5;
  cR.rotation.y = 0.5;
  const mouth = new THREE.Mesh(mouthGeo, inkMat);
  mouth.position.set(0, 0.73, 0.44);
  mouth.rotation.z = Math.PI;
  face.add(cL, cR);
  jelly.add(mergeStatic(face));
  jelly.add(mouth); // 입은 표정에 따라 숨기므로 따로

  // 팔(옷 색)·발
  const limbMat = soft(color, 0.12);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const aL = new THREE.Mesh(limbGeo, bodyMat);
  const aR = new THREE.Mesh(limbGeo, bodyMat);
  aL.position.y = -0.12;
  aR.position.y = -0.12;
  armL.add(aL);
  armR.add(aR);
  armL.position.set(-0.45, 0.62, 0);
  armR.position.set(0.45, 0.62, 0);
  armL.rotation.z = -0.35;
  armR.rotation.z = 0.35;
  jelly.add(armL, armR);
  // 손에 드는 소품(간식·음료): 장소마다 다르고, 몸짓을 할 때만 보인다
  let propKinds = { eat: 'cupcake', drink: 'cup', ...(propTheme || {}) };
  const propCache = {};
  const props = { eat: null, cheers: null };
  const holdProp = (slot, kind) => {
    const key = `${slot}:${kind}`;
    if (!propCache[key]) {
      const g = (PROP_BUILDERS[kind] || PROP_BUILDERS[slot === 'eat' ? 'cupcake' : 'cup'])();
      mergeStatic(g);
      g.position.set(0, -0.27, 0.02);
      g.visible = false;
      armR.add(g);
      propCache[key] = g;
    }
    return propCache[key];
  };
  const hideProps = () => { for (const g of Object.values(propCache)) g.visible = false; };
  const wear = OUTFIT_BUILDERS[outfit]?.(color) || null;
  if (wear) {
    jelly.add(mergeStatic(wear.group));
    if (wear.sleeve) { aL.material = wear.sleeve; aR.material = wear.sleeve; }
  }
  const footL = new THREE.Mesh(footGeo, limbMat);
  const footR = new THREE.Mesh(footGeo, limbMat);
  footL.scale.set(1, 0.6, 1.25);
  footR.scale.set(1, 0.6, 1.25);
  footL.position.set(-0.17, 0.07, 0.03);
  footR.position.set(0.17, 0.07, 0.03);
  turn.add(footL, footR);

  // 배 쪽 옷 색 띠(누가 누군지 구분)
  if (!wear) {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.447, 0.447, 0.16, 28, 1, true), limbMat);
    belt.position.y = 0.42;
    jelly.add(belt);
  }
  let capeG = null;

  if (wearsCrown) {
    const c = mergeStatic(crown());
    c.position.y = 1.1;
    jelly.add(c);
    capeG = cape();
    const capePos = capeG.position.clone();
    capeG.position.set(0, 0, 0);
    mergeStatic(capeG);
    capeG.position.copy(capePos);
    jelly.add(capeG);
  }
  const acc = ACCESSORY_BUILDERS[accessory];
  if (acc && !(wearsCrown && HAT_OFF.has(accessory))) jelly.add(mergeStatic(acc(color)));
  if (wearsCrown) { /* 왕관은 위에서 씌웠다 */ } else if (hat && !HAT_OFF.has(accessory)) {
    const h = mergeStatic(partyHat(hatColor));
    h.position.set(0.08, 1.08, 0);
    h.rotation.z = -0.22;
    jelly.add(h);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x120e1c, transparent: true, opacity: 0.38, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  root.add(shadow);

  let walkT = Math.random() * 6;
  let blinkT = 1 + Math.random() * 3;
  let lookT = 2 + Math.random() * 4;
  let lookOff = 0;
  let gestureKind = null;
  let gestureT = 0;
  const GESTURE_LEN = { clap: 1.0, heart: 1.4, cheer: 1.8, wave: 1.6, spin: 0.9, bow: 1.3, flip: 1.1, surprise: 0.9, cry: 2.2, stretch: 1.8, wiggle: 2.0, eat: 2.0, cheers: 1.8, highfive: 1.2, hug: 2.0, ringhands: 6.2, conga: 7.2 };
  let poseK = 0; // 자세(앉기·눕기 등)로 바뀌는 정도 0~1
  let lastPose = null; // 풀리는 동안에도 같은 자세로 돌아오게
  let hop = 0;
  let idle = 0;
  let heading = 0;
  const last = new THREE.Vector3();
  let hasLast = false;

  const angleTo = (from, to) => {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  const api = {
    faceCamera: false,
    faceTarget: null, // 이 지점을 바라본다(촛불 끄기)
    lean: 0, // 앞으로 숙이기 0~1
    puff: 0, // 숨을 들이쉬어 부푼 정도 0~1
    sway: 0, // 노래할 때 좌우로 흔들기 0~1
    swayPhase: 0, // 흔들기 박자(모두 같은 값을 주면 다 같이 흔든다)
    // 몸짓: clap(박수) · heart(머리 위 하트) · cheer(만세) · wave(손 흔들기) · spin(한 바퀴)
    gesture(kind) { hideProps(); gestureKind = kind; gestureT = 0; },
    // 떠난 사람의 인형이 쓰던 그래픽 메모리를 돌려준다(여럿이 같이 쓰는 모양·재료는 남긴다)
    dispose() {
      const sharedMats = new Set([...softCache.values(), GOLD_MAT, inkMat, WHITE_MAT, cheekMat]);
      const sharedGeos = new Set([bodyGeo, limbGeo, footGeo, eyeGeo, cheekGeo, mouthGeo]);
      root.traverse((o) => {
        if (o.geometry && !sharedGeos.has(o.geometry)) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) if (!sharedMats.has(m)) m.dispose();
      });
    },
    setProps(t) { propKinds = { eat: 'cupcake', drink: 'cup', ...(t || {}) }; },
    // 계속 유지하는 자세: sit(앉기) · lie(벌러덩) · sleep(졸기) · dance(춤). 걸으면 풀린다.
    pose: null,
    root,
    lift: 0, // 땅에서 떠 있는 높이(무중력·트램펄린·열기구)
    get labelY() { return 1.72 + this.lift; },
    hop() { hop = 1; },
    update(dt, speed, camera) {
      // 실제로 움직인 방향으로 몸을 돌린다. 오래 서 있으면 천천히 카메라 쪽을 본다.
      const pos = root.position;
      if (hasLast) {
        const dx = pos.x - last.x;
        const dz = pos.z - last.z;
        if (dx * dx + dz * dz > 1e-6) { heading = Math.atan2(dx, dz); idle = 0; }
        else idle += dt;
      }
      last.copy(pos);
      hasLast = true;
      let target = heading;
      const facing = idle > 1.2 || api.faceCamera; // 단체 사진처럼 카메라를 봐야 할 때는 바로 돌아본다
      if (facing) target = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      if (api.faceTarget) target = Math.atan2(api.faceTarget.x - pos.x, api.faceTarget.z - pos.z); // 케이크 쪽 보기
      turn.rotation.y += angleTo(turn.rotation.y, target + lookOff) * Math.min(1, dt * (api.faceCamera || api.faceTarget ? 8 : idle > 1.2 ? 2.5 : 10));

      const moving = speed > 0.05;
      // 표정: 기쁨(^^) · 놀람(O) · 잠(감은 눈) · 평소(가끔 깜빡임)
      const happy = ['cheer', 'heart', 'wiggle', 'spin', 'cheers', 'stretch'].includes(gestureKind) || api.pose === 'dance' || api.pose === 'lie' || api.sway > 0.5;
      const wow = ['surprise', 'flip'].includes(gestureKind) || hop > 0.2;
      const closed = api.pose === 'sleep' || gestureKind === 'cry';
      blinkT -= dt;
      if (blinkT < 0) blinkT = 2.5 + Math.random() * 3.5;
      const blink = blinkT < 0.12 ? 0.12 : 1;
      happyEyes.visible = happy || closed;
      eyes.children[0].visible = !happy && !closed;
      eyes.scale.set(wow ? 1.25 : 1, closed ? 0.6 : wow ? 1.3 : blink, 1);
      happyEyes.rotation.x = closed ? Math.PI : 0; // 잘 때는 아래로 감은 눈
      const chew = gestureKind === 'eat' ? Math.abs(Math.sin(gestureT * 9)) : 0;
      mouthO.visible = wow || chew > 0.5 || (api.sway > 0.5 && Math.sin(api.swayPhase * 2) > 0.3);
      mouth.visible = !mouthO.visible;
      // 가만히 있을 때는 가끔 두리번
      if (!moving && !gestureKind && !api.pose) { lookT -= dt; if (lookT < 0) { lookT = 3 + Math.random() * 5; lookOff = (Math.random() - 0.5) * 0.9; } } else lookOff = 0;
      walkT += dt * (moving ? 12 : 2.2);
      if (hop > 0) hop = Math.max(0, hop - dt * 1.6);
      const hopK = Math.sin(hop * Math.PI);

      // 젤리 출렁임: 위아래로 늘었다 줄면 옆으로는 반대로
      const squish = moving ? Math.sin(walkT * 2) * 0.07 : Math.sin(walkT) * 0.025;
      const land = hop > 0 && hop < 0.25 ? (0.25 - hop) * 0.8 : 0;
      const sy = 1 + squish + hopK * 0.12 - land;
      const pf = 1 + api.puff * 0.12; // 숨을 들이쉬면 볼이 빵빵하게
      jelly.scale.set(pf / Math.sqrt(sy), sy * (1 + api.puff * 0.05), pf / Math.sqrt(sy));
      jelly.rotation.x = api.lean * 0.38;
      jelly.position.y = (moving ? Math.abs(Math.sin(walkT)) * 0.08 : 0) + hopK * 0.75;
      jelly.rotation.z = moving ? Math.sin(walkT) * 0.06 : 0;
      if (api.sway) jelly.rotation.z += Math.sin(api.swayPhase) * 0.13 * api.sway; // 노래에 맞춰 좌우로

      // 팔과 발
      const swing = moving ? Math.sin(walkT) * 0.6 : 0;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      armL.rotation.z = -0.35 - hopK * 1.9;
      armR.rotation.z = 0.35 + hopK * 1.9;
      // 몸짓은 팔 움직임 위에 덮어쓴다
      if (gestureKind) {
        gestureT += dt;
        const len = GESTURE_LEN[gestureKind] || 1;
        const k = gestureT / len;
        const env = Math.min(1, gestureT * 6) * Math.min(1, (len - gestureT) * 5); // 부드럽게 시작하고 끝남
        if (gestureKind === 'clap') {
          const c = 0.35 + Math.abs(Math.sin(gestureT * 14)) * 0.45;
          armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, -1.25, env);
          armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, -1.25, env);
          armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, c, env);
          armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, -c, env);
        } else if (gestureKind === 'heart') {
          armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, -2.95, env);
          armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 2.95, env);
          armL.rotation.x = armR.rotation.x = -0.25 * env;
        } else if (gestureKind === 'cheer') {
          const w = Math.sin(gestureT * 12) * 0.25;
          armL.rotation.z = THREE.MathUtils.lerp(armL.rotation.z, -2.4 + w, env);
          armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 2.4 - w, env);
        } else if (gestureKind === 'wave') {
          armR.rotation.z = THREE.MathUtils.lerp(armR.rotation.z, 2.5 + Math.sin(gestureT * 10) * 0.35, env);
        } else if (gestureKind === 'spin') {
          jelly.rotation.y = THREE.MathUtils.smootherstep(k, 0, 1) * Math.PI * 2;
        }
        else if (gestureKind === 'eat') { // 간식을 입으로 냠냠(볼이 오물오물)
          holdProp('eat', propKinds.eat).visible = true;
          armR.rotation.x = -1.7 * env + Math.sin(gestureT * 9) * 0.15 * env;
          armR.rotation.z = -0.55 * env;
          jelly.scale.x *= 1 + Math.abs(Math.sin(gestureT * 9)) * 0.04 * env;
        } else if (gestureKind === 'cheers') { // 컵을 높이 들고 건배
          holdProp('drink', propKinds.drink).visible = true;
          const up = Math.min(1, gestureT * 3);
          armR.rotation.z = (0.35 + 2.0 * up) * env;
          armR.rotation.x = -0.4 * env;
          jelly.rotation.z -= 0.08 * env;
        } else if (gestureKind === 'highfive') { // 손바닥을 높이 들어 짝!
          armR.rotation.z = (0.35 + 2.3 * Math.min(1, gestureT * 4)) * env;
          armR.rotation.x = -0.7 * env;
        } else if (gestureKind === 'hug') { // 두 팔로 꼭 안기
          armL.rotation.x = armR.rotation.x = -1.35 * env;
          armL.rotation.z = 0.75 * env;
          armR.rotation.z = -0.75 * env;
          jelly.scale.x *= 1 - 0.05 * env;
        } else if (gestureKind === 'ringhands') { // 양옆 사람과 손잡기
          armL.rotation.z = -1.35 * env;
          armR.rotation.z = 1.35 * env;
        } else if (gestureKind === 'conga') { // 앞사람 어깨에 손 얹기
          armL.rotation.x = armR.rotation.x = -1.45 * env;
          armL.rotation.z = 0.25 * env;
          armR.rotation.z = -0.25 * env;
        } else if (gestureKind === 'bow') { // 꾸벅 인사
          jelly.rotation.x += Math.sin(Math.min(1, k) * Math.PI) * 0.7;
          armL.rotation.x = armR.rotation.x = 0.3 * env;
        } else if (gestureKind === 'flip') { // 공중제비
          const kk = THREE.MathUtils.smootherstep(k, 0.1, 0.9);
          jelly.position.y += Math.sin(Math.min(1, k) * Math.PI) * 1.3;
          jelly.rotation.x = -kk * Math.PI * 2;
          armL.rotation.z = -2.6 * env;
          armR.rotation.z = 2.6 * env;
        } else if (gestureKind === 'surprise') { // 깜짝
          jelly.position.y += Math.sin(Math.min(1, k * 2) * Math.PI) * 0.35;
          jelly.scale.y *= 1 + Math.sin(Math.min(1, k * 2) * Math.PI) * 0.18;
          armL.rotation.z = -2.2 * env;
          armR.rotation.z = 2.2 * env;
        } else if (gestureKind === 'cry') { // 감동해서 얼굴 감싸기
          armL.rotation.x = armR.rotation.x = -1.5 * env;
          armL.rotation.z = 0.9 * env;
          armR.rotation.z = -0.9 * env;
          jelly.rotation.z += Math.sin(gestureT * 22) * 0.04 * env;
          jelly.rotation.x += 0.12 * env;
        } else if (gestureKind === 'stretch') { // 기지개
          armL.rotation.z = -2.9 * env;
          armR.rotation.z = 2.9 * env;
          jelly.scale.y *= 1 + 0.12 * env;
          jelly.rotation.z += Math.sin(gestureT * 2.5) * 0.12 * env;
        } else if (gestureKind === 'wiggle') { // 엉덩이춤
          jelly.rotation.y = Math.sin(gestureT * 14) * 0.5 * env;
          jelly.position.y += Math.abs(Math.sin(gestureT * 14)) * 0.08;
          armL.rotation.z = -1.2 * env;
          armR.rotation.z = 1.2 * env;
        }
        if (gestureT >= len) { gestureKind = null; jelly.rotation.y = 0; hideProps(); }
      }
      // 자세: 걸으면 풀린다
      if (moving && api.pose) api.pose = null;
      poseK = THREE.MathUtils.lerp(poseK, api.pose ? 1 : 0, Math.min(1, dt * 6));
      if (poseK > 0.01) {
        const pk = poseK;
        if (api.pose === 'sit' || api.pose === 'sleep' || (!api.pose && lastPose !== 'lie' && lastPose !== 'dance')) {
          jelly.scale.y *= 1 - 0.3 * pk; // 털썩 주저앉아 납작하게
          jelly.position.y -= 0.04 * pk;
          footL.position.z = footR.position.z = 0.03 + 0.28 * pk;
          footL.position.y = footR.position.y = 0.07 + 0.08 * pk;
          armL.rotation.x = armR.rotation.x = -0.7 * pk;
          if (api.pose === 'sleep') jelly.rotation.x += (0.18 + Math.sin(walkT * 1.2) * 0.08) * pk; // 꾸벅꾸벅
        } else if (api.pose === 'lie' || lastPose === 'lie') { // 벌러덩 누워 하늘 보기
          jelly.rotation.x = -1.45 * pk;
          jelly.position.y += 0.42 * pk;
          jelly.position.z = -0.1 * pk;
          footL.position.y = footR.position.y = 0.07 + 0.35 * pk;
          footL.position.z = footR.position.z = 0.25 * pk;
          armL.rotation.z = -1.4 * pk + Math.sin(walkT * 2) * 0.15 * pk;
          armR.rotation.z = 1.4 * pk - Math.sin(walkT * 2) * 0.15 * pk;
        } else if (api.pose === 'dance' || lastPose === 'dance') { // 신나게 춤
          const b = walkT * 5;
          jelly.position.y += Math.abs(Math.sin(b)) * 0.18 * pk;
          jelly.rotation.z += Math.sin(b) * 0.18 * pk;
          jelly.rotation.y = Math.sin(b * 0.5) * 0.6 * pk;
          armL.rotation.z = (-0.6 - (Math.sin(b) > 0 ? 1.8 : 0.4)) * pk;
          armR.rotation.z = (0.6 + (Math.sin(b) > 0 ? 0.4 : 1.8)) * pk;
          footL.position.y = 0.07 + Math.max(0, Math.sin(b)) * 0.1 * pk;
          footR.position.y = 0.07 + Math.max(0, -Math.sin(b)) * 0.1 * pk;
        }
      } else if (!api.pose) jelly.position.z = 0;
      if (api.pose) lastPose = api.pose;
      footL.position.z = 0.03 + (moving ? Math.sin(walkT) * 0.12 : 0);
      footR.position.z = 0.03 - (moving ? Math.sin(walkT) * 0.12 : 0);
      footL.position.y = 0.07 + (moving ? Math.max(0, Math.sin(walkT)) * 0.06 : 0);
      footR.position.y = 0.07 + (moving ? Math.max(0, -Math.sin(walkT)) * 0.06 : 0);

      turn.position.y = api.lift;
      shadow.scale.setScalar(Math.max(0.25, 1 - jelly.position.y * 0.4 - api.lift * 0.12));
      // 걸으면 망토가 뒤로 펄럭인다
      if (capeG) capeG.rotation.x = THREE.MathUtils.lerp(capeG.rotation.x, moving ? -0.28 - Math.sin(walkT * 2) * 0.05 : -0.04, Math.min(1, dt * 6));
    },
  };
  return api;
}
