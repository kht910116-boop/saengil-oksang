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

export function createAvatar({ color = 0xf29bb3, hat = false, hatColor = 0xffc46b, crown: wearsCrown = false } = {}) {
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
  const footL = new THREE.Mesh(footGeo, limbMat);
  const footR = new THREE.Mesh(footGeo, limbMat);
  footL.scale.set(1, 0.6, 1.25);
  footR.scale.set(1, 0.6, 1.25);
  footL.position.set(-0.17, 0.07, 0.03);
  footR.position.set(0.17, 0.07, 0.03);
  turn.add(footL, footR);

  // 배 쪽 옷 색 띠(누가 누군지 구분)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.447, 0.447, 0.16, 28, 1, true), limbMat);
  belt.position.y = 0.42;
  jelly.add(belt);

  if (wearsCrown) {
    const c = crown();
    c.position.y = 1.1;
    jelly.add(c);
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

  return {
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
      if (idle > 1.2) target = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      turn.rotation.y += angleTo(turn.rotation.y, target) * Math.min(1, dt * (idle > 1.2 ? 2.5 : 10));

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
    },
  };
}
