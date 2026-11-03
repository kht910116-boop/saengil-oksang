import * as THREE from 'three';

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
const cheekMat = new THREE.MeshBasicMaterial({ color: CHEEK, transparent: true, opacity: 0.8, depthWrite: false });

function soft(color, emissive = 0.16) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0, emissive: color, emissiveIntensity: emissive });
}
// 옷 색을 살짝 밝힌 마시멜로 색
function pastel(hex, k = 0.28) {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
}

function partyHat(color) {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 20), soft(color, 0.2));
  cone.position.y = 0.21;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 6, 20), soft(0xfbf4e8, 0.25));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 0.14;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), soft(0xfbf4e8, 0.3));
  pom.position.y = 0.44;
  g.add(cone, stripe, pom);
  return g;
}

function crown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.35, metalness: 0.35, emissive: 0xffb800, emissiveIntensity: 0.25 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 24, 1, true), gold);
  band.material.side = THREE.DoubleSide;
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
const GOLD = () => new THREE.MeshStandardMaterial({ color: 0xffd34d, roughness: 0.3, metalness: 0.5, emissive: 0xffb800, emissiveIntensity: 0.25 });

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

export function createAvatar({ color = 0xf29bb3, hat = false, hatColor = 0xffc46b, crown: wearsCrown = false, outfit = null } = {}) {
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
  const eL = new THREE.Mesh(eyeGeo, inkMat);
  const eR = new THREE.Mesh(eyeGeo, inkMat);
  eL.position.set(-0.13, 0.82, 0.425);
  eR.position.set(0.13, 0.82, 0.425);
  eL.scale.set(1, 1.15, 0.5);
  eR.scale.set(1, 1.15, 0.5);
  const cL = new THREE.Mesh(cheekGeo, cheekMat);
  const cR = new THREE.Mesh(cheekGeo, cheekMat);
  cL.position.set(-0.24, 0.7, 0.405);
  cR.position.set(0.24, 0.7, 0.405);
  cL.rotation.y = -0.5;
  cR.rotation.y = 0.5;
  const mouth = new THREE.Mesh(mouthGeo, inkMat);
  mouth.position.set(0, 0.73, 0.44);
  mouth.rotation.z = Math.PI;
  face.add(eL, eR, cL, cR, mouth);
  jelly.add(face);

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
  const wear = OUTFIT_BUILDERS[outfit]?.(color) || null;
  if (wear) {
    jelly.add(wear.group);
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
    const c = crown();
    c.position.y = 1.1;
    jelly.add(c);
    capeG = cape();
    jelly.add(capeG);
  } else if (hat) {
    const h = partyHat(hatColor);
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
    root,
    labelY: 1.72,
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
      turn.rotation.y += angleTo(turn.rotation.y, target) * Math.min(1, dt * (api.faceCamera ? 8 : idle > 1.2 ? 2.5 : 10));

      const moving = speed > 0.05;
      walkT += dt * (moving ? 12 : 2.2);
      if (hop > 0) hop = Math.max(0, hop - dt * 1.6);
      const hopK = Math.sin(hop * Math.PI);

      // 젤리 출렁임: 위아래로 늘었다 줄면 옆으로는 반대로
      const squish = moving ? Math.sin(walkT * 2) * 0.07 : Math.sin(walkT) * 0.025;
      const land = hop > 0 && hop < 0.25 ? (0.25 - hop) * 0.8 : 0;
      const sy = 1 + squish + hopK * 0.12 - land;
      jelly.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      jelly.position.y = (moving ? Math.abs(Math.sin(walkT)) * 0.08 : 0) + hopK * 0.75;
      jelly.rotation.z = moving ? Math.sin(walkT) * 0.06 : 0;

      // 팔과 발
      const swing = moving ? Math.sin(walkT) * 0.6 : 0;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
      armL.rotation.z = -0.35 - hopK * 1.9;
      armR.rotation.z = 0.35 + hopK * 1.9;
      footL.position.z = 0.03 + (moving ? Math.sin(walkT) * 0.12 : 0);
      footR.position.z = 0.03 - (moving ? Math.sin(walkT) * 0.12 : 0);
      footL.position.y = 0.07 + (moving ? Math.max(0, Math.sin(walkT)) * 0.06 : 0);
      footR.position.y = 0.07 + (moving ? Math.max(0, -Math.sin(walkT)) * 0.06 : 0);

      shadow.scale.setScalar(1 - jelly.position.y * 0.4);
      // 걸으면 망토가 뒤로 펄럭인다
      if (capeG) capeG.rotation.x = THREE.MathUtils.lerp(capeG.rotation.x, moving ? -0.28 - Math.sin(walkT * 2) * 0.05 : -0.04, Math.min(1, dt * 6));
    },
  };
  return api;
}
