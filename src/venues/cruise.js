import * as THREE from 'three';
import { PAL, skyDome, stars, moon, cakeTable, decoBalloons, stringLights, city, finishWorld } from './common.js';

// 밤바다 크루즈: 달빛 아래 유람선 꼭대기 갑판. 배가 나아가며 양옆 도시 야경이 천천히 지나간다.
function plankTexture(w, d) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a3c';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const v = 120 + Math.random() * 30;
    g.fillStyle = `rgb(${v + 30},${v - 10},${v - 45})`;
    g.fillRect(0, y + 1, 256, 30);
    g.fillStyle = 'rgba(40,24,14,0.6)';
    g.fillRect(0, y, 256, 2);
    for (let k = 0; k < 18; k++) {
      g.fillStyle = `rgba(60,36,20,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * 256, y + 4 + Math.random() * 24, 30 + Math.random() * 60, 1);
    }
    g.fillStyle = 'rgba(40,24,14,0.5)';
    g.fillRect(((y / 32) % 2) * 128 + 60, y, 2, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 4, d / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function waveTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1636';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const w = 6 + Math.random() * 26;
    g.strokeStyle = `rgba(140,170,230,${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + w / 2, y - 2 - Math.random() * 3, x + w, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCruise(scene) {
  const W = 22;
  const D = 16;
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x0f1838);
  scene.fog = new THREE.FogExp2(0x1a2550, 0.0065);
  skyDome(group, '#070c24', '#2a3b70', { mid: '#16214d' });

  const hemi = new THREE.HemisphereLight(0x8aa0e0, 0x1a2040, 0.85);
  const moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.7);
  moonLight.position.set(-30, 40, -60);
  group.add(hemi, moonLight);

  // 바다: 물결 무늬가 흘러가는 넓은 수면 + 달빛 길
  const waves = waveTexture();
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: waves, color: 0x6f86c4, roughness: 0.4, metalness: 0.35 }));
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -4.2;
  group.add(ocean);
  const glow = document.createElement('canvas');
  glow.width = 64;
  glow.height = 256;
  const gg = glow.getContext('2d');
  const grad = gg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,240,200,0)');
  grad.addColorStop(0.5, 'rgba(255,240,200,0.55)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  gg.fillStyle = grad;
  gg.fillRect(0, 0, 64, 256);
  const glowTex = new THREE.CanvasTexture(glow);
  const moonPath = new THREE.Mesh(new THREE.PlaneGeometry(10, 160), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  moonPath.rotation.x = -Math.PI / 2;
  moonPath.rotation.z = 0.35;
  moonPath.position.set(-18, -4.1, -80);
  group.add(moonPath);

  // 선체와 갑판
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), new THREE.MeshStandardMaterial({ map: plankTexture(W, D), roughness: 0.8 }));
  floor.position.y = -0.3;
  group.add(floor);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.55 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 4, D + 0.6), hullMat);
  hull.position.y = -2.6;
  group.add(hull);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.66, 0.35, D + 0.66), new THREE.MeshStandardMaterial({ color: 0x1d2c66, roughness: 0.5 }));
  stripe.position.y = -1.3;
  group.add(stripe);
  // 뱃머리(앞쪽 −z)
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-(W + 0.6) / 2, 0);
  bowShape.lineTo((W + 0.6) / 2, 0);
  bowShape.lineTo(0, -10);
  bowShape.closePath();
  const bow = new THREE.Mesh(new THREE.ExtrudeGeometry(bowShape, { depth: 4, bevelEnabled: false }), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, -0.6, -D / 2 - 0.3);
  group.add(bow);
  const bowDeck = new THREE.Mesh(new THREE.ExtrudeGeometry(bowShape, { depth: 0.6, bevelEnabled: false }), new THREE.MeshStandardMaterial({ map: plankTexture(10, 10), roughness: 0.8 }));
  bowDeck.rotation.x = Math.PI / 2;
  bowDeck.position.set(0, 0, -D / 2 - 0.3);
  group.add(bowDeck);
  // 둥근 창(선체 옆 불빛)
  const portMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let i = 0; i < 9; i++) {
    for (const side of [-1, 1]) {
      const port = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), portMat);
      port.position.set(side * (W / 2 + 0.32), -2.6, -D / 2 + 1.2 + i * 1.7);
      port.rotation.y = side * Math.PI / 2;
      group.add(port);
    }
  }

  // 흰 난간과 구명튜브(뒤쪽 가운데는 승선 입구로 비운다)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 });
  const addRail = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(z2 - z1, x2 - x1);
    for (const h of [0.55, 1.05]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), railMat);
      r.position.set((x1 + x2) / 2, h, (z1 + z2) / 2);
      r.rotation.y = -ang;
      group.add(r);
    }
    const n = Math.max(2, Math.round(len / 1.6));
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), railMat);
      p.position.set(x1 + ((x2 - x1) * i) / n, 0.55, z1 + ((z2 - z1) * i) / n);
      group.add(p);
    }
  };
  const hx = W / 2;
  const hz = D / 2;
  addRail(-hx, -hz, -hx, hz);
  addRail(hx, -hz, hx, hz);
  addRail(-hx, hz, -1.6, hz);
  addRail(1.6, hz, hx, hz);
  addRail(-hx, -hz, 0, -hz - 9.4);
  addRail(hx, -hz, 0, -hz - 9.4);
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xff7a3c, roughness: 0.5 });
  for (const [x, z, ry] of [[-hx - 0.05, -3, Math.PI / 2], [hx + 0.05, 3, Math.PI / 2], [-hx - 0.05, 4, Math.PI / 2], [hx + 0.05, -4, Math.PI / 2]]) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 18), buoyMat);
    b.position.set(x, 0.8, z);
    b.rotation.y = ry;
    group.add(b);
  }

  const obstacles = [];
  // 굴뚝(뒤 왼쪽)과 돛대(앞 가운데)
  const funnel = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 3.6, 20), new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.5 }));
  f1.position.y = 1.8;
  const f2 = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 0.6, 20), new THREE.MeshStandardMaterial({ color: 0x1d2c66 }));
  f2.position.y = 3.3;
  funnel.add(f1, f2);
  funnel.position.set(-hx + 2.4, 0, hz - 2.6);
  group.add(funnel);
  obstacles.push({ x: funnel.position.x, z: funnel.position.z, r: 1.6 });
  const mastH = 8.5;
  const mastZ = -hz - 4.5; // 뱃머리 쪽(하늘 이름 뒤)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, mastH, 10), railMat);
  mast.position.set(0, mastH / 2, mastZ);
  group.add(mast);
  obstacles.push({ x: 0, z: mastZ, r: 0.6 });
  // 갑판 의자
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2f4f8f, roughness: 0.7 });
  for (const [x, z] of [[hx - 1.6, -hz + 2], [hx - 1.6, -hz + 4], [hx - 1.6, hz - 2.5]]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.8), chairMat);
    ch.position.set(x, 0.25, z);
    ch.rotation.x = -0.12;
    group.add(ch);
    obstacles.push({ x, z, r: 0.9 });
  }

  const cake = cakeTable(group, { legColor: 0x1d2c66 });
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group);

  // 돛대 꼭대기에서 난간으로 내려오는 전구 줄(배 장식등) + 둘레 줄
  const top = new THREE.Vector3(0, mastH - 0.3, mastZ);
  const pts = [top,
    new THREE.Vector3(-hx, 1.2, -hz), new THREE.Vector3(-hx, 1.2, 0), new THREE.Vector3(-hx, 1.2, hz),
    new THREE.Vector3(hx, 1.2, hz), new THREE.Vector3(hx, 1.2, 0), new THREE.Vector3(hx, 1.2, -hz),
    new THREE.Vector3(0, 1.2, -hz - 9.4),
    new THREE.Vector3(-hx * 0.5, 4.2, hz), new THREE.Vector3(hx * 0.5, 4.2, hz)];
  const spans = [[0, 1, 0.6], [0, 2, 1.0], [0, 3, 1.6], [0, 4, 1.6], [0, 5, 1.0], [0, 6, 0.6], [0, 7, 0.4], [0, 8, 1.4], [0, 9, 1.4], [8, 9, 0.6], [3, 8, 0.5], [4, 9, 0.5]];
  // 뒤쪽 줄을 매달 작은 기둥 두 개
  for (const p of [pts[8], pts[9]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.y, 8), railMat);
    pole.position.set(p.x, p.y / 2, p.z);
    group.add(pole);
  }
  const lights = stringLights(group, pts, spans, { drawPoles: false, wireColor: 0x2a3050 });

  // 양옆 도시 야경(배가 나아가며 천천히 지나간다)
  const shore = new THREE.Group();
  city(shore, { count: 40, distMin: 110, distMax: 150, yBase: -14, hMax: 34, arc: [Math.PI * 0.15, Math.PI * 0.85] });
  city(shore, { count: 40, distMin: 110, distMax: 150, yBase: -14, hMax: 34, arc: [Math.PI * 1.15, Math.PI * 1.85] });
  group.add(shore);
  // 멀리 다리의 불빛
  const bridgeDots = [];
  for (let i = 0; i <= 60; i++) {
    const x = -140 + i * (280 / 60);
    bridgeDots.push(x, 6 - Math.cos((i / 60) * Math.PI * 2) * 4, -230);
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bridgeDots, 3));
  group.add(new THREE.Points(bgeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 1.6, fog: false })));

  stars(group, { count: 1100 });
  moon(group, new THREE.Vector3(-60, 55, -150), 6);

  return finishWorld(scene, group, {
    id: 'cruise',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { w: W - 1.4, d: D - 1.4 },
    entrance: new THREE.Vector3(0, 0, hz - 1.2),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 0.85,
    palette: { ...PAL, sky: 0x0f1838 },
    extraUpdate(t, dt) {
      waves.offset.y -= dt * 0.05;
      waves.offset.x = Math.sin(t * 0.2) * 0.02;
      shore.rotation.y += dt * 0.004;
    },
  });
}
