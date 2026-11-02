import * as THREE from 'three';

// 종이를 오려 만든 납작한 인형. 앞면은 색종이, 뒤에는 흰 테두리 종이가 한 겹 더 있다.
const DEPTH = 0.035;

function bodyShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.34 * s, 0);
  sh.lineTo(0.34 * s, 0);
  sh.quadraticCurveTo(0.4 * s, 0.05 * s, 0.32 * s, 0.62 * s);
  sh.quadraticCurveTo(0.26 * s, 0.86 * s, 0, 0.88 * s);
  sh.quadraticCurveTo(-0.26 * s, 0.86 * s, -0.32 * s, 0.62 * s);
  sh.quadraticCurveTo(-0.4 * s, 0.05 * s, -0.34 * s, 0);
  return sh;
}

function circleShape(r) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  return sh;
}

function hatShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.2 * s, 0);
  sh.lineTo(0.2 * s, 0);
  sh.lineTo(0.02 * s, 0.46 * s);
  sh.lineTo(-0.02 * s, 0.46 * s);
  sh.closePath();
  return sh;
}

function flat(shape, color, z = 0) {
  const m = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 18 }),
    // 밤에도 종이 색이 묻히지 않도록 자기 색을 살짝 낸다
    new THREE.MeshStandardMaterial({ color, roughness: 0.92, emissive: color, emissiveIntensity: 0.22 })
  );
  m.position.z = z;
  return m;
}

const PAPER = 0xfbf4e8;
const INK = 0x2a2238;

function crownShape(s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.26 * s, 0);
  sh.lineTo(0.26 * s, 0);
  sh.lineTo(0.3 * s, 0.26 * s);
  sh.lineTo(0.15 * s, 0.13 * s);
  sh.lineTo(0, 0.3 * s);
  sh.lineTo(-0.15 * s, 0.13 * s);
  sh.lineTo(-0.3 * s, 0.26 * s);
  sh.closePath();
  return sh;
}

export function createAvatar({ color = 0xf29bb3, hat = false, hatColor = 0xffc46b, crown = false } = {}) {
  const root = new THREE.Group();
  const doll = new THREE.Group(); // 카메라를 바라보며 흔들리는 부분
  root.add(doll);

  // 흰 테두리 종이(뒤)
  const bodyBack = flat(bodyShape(1.12), PAPER, -0.03);
  bodyBack.position.set(0, -0.05, -0.03);
  const headBack = flat(circleShape(0.36), PAPER, -0.03);
  headBack.position.set(0, 1.12, -0.03);

  // 색종이(앞)
  const body = flat(bodyShape(1), color, 0);
  const head = flat(circleShape(0.31), 0xf6dcc4, 0.005);
  head.position.set(0, 1.12, 0.005);

  // 얼굴
  const face = new THREE.Group();
  const eyeGeo = new THREE.CircleGeometry(0.032, 10);
  const inkMat = new THREE.MeshBasicMaterial({ color: INK });
  const eL = new THREE.Mesh(eyeGeo, inkMat);
  const eR = new THREE.Mesh(eyeGeo, inkMat);
  eL.position.set(-0.1, 1.15, DEPTH + 0.012);
  eR.position.set(0.1, 1.15, DEPTH + 0.012);
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf2a0a8, transparent: true, opacity: 0.75 });
  const bL = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), blushMat);
  const bR = bL.clone();
  bL.position.set(-0.17, 1.06, DEPTH + 0.011);
  bR.position.set(0.17, 1.06, DEPTH + 0.011);
  const mouth = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 12, 1, Math.PI * 1.15, Math.PI * 0.7), inkMat);
  mouth.position.set(0, 1.07, DEPTH + 0.012);
  face.add(eL, eR, bL, bR, mouth);

  // 팔(종이 띠)
  const armMat = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  const armGeo = new THREE.BoxGeometry(0.1, 0.38, DEPTH);
  armGeo.translate(0, -0.17, 0);
  const armL = new THREE.Mesh(armGeo, armMat);
  const armR = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.36, 0.66, 0.01);
  armR.position.set(0.36, 0.66, 0.01);

  doll.add(bodyBack, headBack, body, head, face, armL, armR);

  if (crown) {
    const cb = flat(crownShape(1.2), PAPER, -0.02);
    cb.position.set(0, 1.33, -0.02);
    const c = flat(crownShape(1), 0xffd34d, 0.004);
    c.position.set(0, 1.37, 0.004);
    doll.add(cb, c);
  } else if (hat) {
    const hatBack = flat(hatShape(1.18), PAPER, -0.02);
    hatBack.position.set(0, 1.36, -0.02);
    const h = flat(hatShape(1), hatColor, 0.004);
    h.position.set(0, 1.4, 0.004);
    const pom = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshBasicMaterial({ color: PAPER }));
    pom.position.set(0, 1.88, DEPTH + 0.01);
    doll.add(hatBack, h, pom);
  }

  // 그림자
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x120e1c, transparent: true, opacity: 0.38, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  shadow.scale.set(1, 0.7, 1);
  root.add(shadow);

  doll.position.y = 0.02;
  let walkT = 0;
  let facing = 1;
  let hop = 0;

  return {
    root,
    labelY: 2.15,
    hop() { hop = 1; },
    update(dt, speed, camera, moveDirX = 0) {
      // 종이 인형은 항상 카메라 쪽을 바라본다(Y축 빌보드)
      const camYaw = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
      doll.rotation.y = camYaw;
      if (Math.abs(moveDirX) > 0.05) facing = moveDirX > 0 ? 1 : -1;
      doll.scale.x += (facing - doll.scale.x) * Math.min(1, dt * 12);

      const moving = speed > 0.05;
      walkT += dt * (moving ? 11 : 2);
      const bounce = moving ? Math.abs(Math.sin(walkT)) * 0.14 : Math.sin(walkT) * 0.012;
      if (hop > 0) hop = Math.max(0, hop - dt * 1.6);
      const hopY = Math.sin(hop * Math.PI) * 0.7;
      doll.position.y = 0.02 + bounce + hopY;
      doll.rotation.z = moving ? Math.sin(walkT) * 0.09 : 0;
      armL.rotation.z = moving ? Math.sin(walkT) * 0.5 : 0.08 + (hop > 0 ? 2.4 * Math.sin(hop * Math.PI) : 0);
      armR.rotation.z = moving ? -Math.sin(walkT) * 0.5 : -0.08 - (hop > 0 ? 2.4 * Math.sin(hop * Math.PI) : 0);
      shadow.scale.setScalar(1 - (bounce + hopY) * 0.5);
      shadow.scale.y *= 0.7;
    },
  };
}
