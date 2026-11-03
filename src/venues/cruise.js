import * as THREE from 'three';
import { PAL, skyDome, stars, moon, cakeTable, decoBalloons, stringLights, city, finishWorld, spotMarker, puffs, mergeStatic } from './common.js';
import { sound } from '../audio.js';
import { partyDressing } from './party.js';

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
  // 긴 유람선: 뒤쪽(+z) 승선구 → 가운데 파티 구역(케이크) → 수영장 → 조타석 → 뱃머리(망원경)
  const X = 13; // 갑판 반폭
  const Z0 = -30; // 사각 갑판 앞 끝
  const Z1 = 12; // 뒤 끝
  const BOW = -40; // 뱃머리 끝
  const L = Z1 - Z0;
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x0f1838);
  scene.fog = new THREE.FogExp2(0x1a2550, 0.0055);
  skyDome(group, '#070c24', '#2a3b70', { mid: '#16214d' });

  const hemi = new THREE.HemisphereLight(0x8aa0e0, 0x1a2040, 0.85);
  const moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.7);
  moonLight.position.set(-30, 40, -60);
  group.add(hemi, moonLight);

  // 바다와 달빛 길
  const waves = waveTexture();
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ map: waves, color: 0x6f86c4, roughness: 0.4, metalness: 0.35 }));
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
  const moonPath = new THREE.Mesh(new THREE.PlaneGeometry(12, 200), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  moonPath.rotation.x = -Math.PI / 2;
  moonPath.rotation.z = 0.35;
  moonPath.position.set(-22, -4.1, -100);
  group.add(moonPath);

  // 갑판(바닥은 하나로: 화면을 누르면 이 위로 걸어간다)
  const deckMat = new THREE.MeshStandardMaterial({ map: plankTexture(X * 2, L), roughness: 0.8 });
  const bowShape = new THREE.Shape();
  bowShape.moveTo(-X, Z0);
  bowShape.lineTo(-X, Z1);
  bowShape.lineTo(X, Z1);
  bowShape.lineTo(X, Z0);
  bowShape.quadraticCurveTo(X * 0.75, BOW + 3, 0, BOW);
  bowShape.quadraticCurveTo(-X * 0.75, BOW + 3, -X, Z0);
  const deckGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 0.6, bevelEnabled: false });
  deckGeo.rotateX(Math.PI / 2);
  const floor = new THREE.Mesh(deckGeo, deckMat);
  floor.position.y = 0;
  // 위에서 내려다본 모양을 그대로 쓰도록 z를 뒤집는다(Shape의 y → 월드 z)
  floor.scale.z = 1;
  group.add(floor);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.55 });
  const hullGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 4, bevelEnabled: false });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, hullMat);
  hull.position.y = -0.6;
  hull.scale.set(1.02, 1, 1.01);
  group.add(hull);
  const stripe = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x1d2c66, roughness: 0.5 }));
  stripe.scale.set(1.025, 0.08, 1.012);
  stripe.position.y = -1.4;
  group.add(stripe);
  // 난간·둥근 창·구명정처럼 움직이지 않는 장식은 deco에 모았다가 한 덩어리로 합친다
  const deco = new THREE.Group();
  // 둥근 창
  const portMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (let z = Z0 + 2; z < Z1; z += 2.2) {
    for (const side of [-1, 1]) {
      const port = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), portMat);
      port.position.set(side * (X * 1.02 + 0.02), -2.6, z);
      port.rotation.y = side * Math.PI / 2;
      deco.add(port);
    }
  }

  // 난간(뒤쪽 가운데는 승선구)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 });
  const addRail = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(z2 - z1, x2 - x1);
    for (const h of [0.55, 1.05]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.06), railMat);
      r.position.set((x1 + x2) / 2, h, (z1 + z2) / 2);
      r.rotation.y = -ang;
      deco.add(r);
    }
    const n = Math.max(2, Math.round(len / 1.8));
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), railMat);
      p.position.set(x1 + ((x2 - x1) * i) / n, 0.55, z1 + ((z2 - z1) * i) / n);
      deco.add(p);
    }
  };
  addRail(-X, Z0, -X, Z1);
  addRail(X, Z0, X, Z1);
  addRail(-X, Z1, -1.8, Z1);
  addRail(1.8, Z1, X, Z1);
  const bowPts = new THREE.QuadraticBezierCurve(new THREE.Vector2(X, Z0), new THREE.Vector2(X * 0.75, BOW + 3), new THREE.Vector2(0, BOW)).getPoints(6);
  for (let i = 0; i < bowPts.length - 1; i++) {
    addRail(bowPts[i].x, bowPts[i].y, bowPts[i + 1].x, bowPts[i + 1].y);
    addRail(-bowPts[i].x, bowPts[i].y, -bowPts[i + 1].x, bowPts[i + 1].y);
  }
  // 구명정과 구명튜브
  const boatMat = new THREE.MeshStandardMaterial({ color: 0xff8a3c, roughness: 0.6 });
  for (const z of [-20, -6, 6]) {
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3.2, 4, 10), boatMat);
      b.rotation.x = Math.PI / 2;
      b.position.set(side * (X + 1.4), 1.6, z);
      deco.add(b);
      const davit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), railMat);
      davit.position.set(side * (X + 0.7), 2.5, z);
      deco.add(davit);
    }
  }

  group.add(mergeStatic(deco));

  const obstacles = [];
  const fx = puffs(group);
  // 굴뚝(뒤 왼쪽) — 뱃고동
  const funnel = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 5, 24), new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.5 }));
  f1.position.y = 2.5;
  const f2 = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.8, 24), new THREE.MeshStandardMaterial({ color: 0x1d2c66 }));
  f2.position.y = 4.6;
  const hornM = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xd6b24a, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  hornM.rotation.z = Math.PI / 2;
  hornM.position.set(1.6, 3.6, 0);
  funnel.add(f1, f2, hornM);
  funnel.position.set(-8.5, 0, 7.5);
  group.add(funnel);
  obstacles.push({ x: -8.5, z: 7.5, r: 2.0 });

  // 수영장(앞쪽 오른쪽)
  const pool = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 4.4), new THREE.MeshStandardMaterial({ color: 0xe8eef6, roughness: 0.5 }));
  rim.position.y = 0.2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.6), new THREE.MeshStandardMaterial({ color: 0x3fc4e8, emissive: 0x0a6a8a, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  const poolLight = new THREE.PointLight(0x5fd8ff, 1.6, 8, 1.6);
  poolLight.position.y = 0.8;
  pool.add(rim, water, poolLight);
  pool.position.set(7, 0, -10);
  group.add(pool);
  obstacles.push({ x: 5.2, z: -10, r: 2.3 }, { x: 8.8, z: -10, r: 2.3 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2f4f8f, roughness: 0.7 });
  for (const z of [-15, -13]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.9), chairMat);
    ch.position.set(7, 0.25, z);
    group.add(ch);
    obstacles.push({ x: 7, z, r: 0.9 });
  }

  // 조타석: 받침대와 큰 조타륜
  const helm = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.3, 12), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.7 }));
  stand.position.y = 0.65;
  const wheel = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6a40, roughness: 0.6 });
  const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), woodMat);
  wheel.add(rimW);
  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), woodMat);
    spoke.rotation.z = (i / 8) * Math.PI;
    wheel.add(spoke);
  }
  wheel.position.set(0, 1.55, 0.2);
  helm.add(stand, wheel);
  helm.position.set(0, 0, -21);
  group.add(helm);
  obstacles.push({ x: 0, z: -21, r: 0.7 });

  // 뱃머리 망원경
  const scope = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xd6b24a, metalness: 0.7, roughness: 0.3 }));
  tube.rotation.x = Math.PI / 2 - 0.25;
  tube.position.y = 1.35;
  const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.25, 1.1, 3), railMat);
  tri.position.y = 0.55;
  scope.add(tube, tri);
  scope.position.set(0, 0, -35);
  group.add(scope);
  obstacles.push({ x: 0, z: -35, r: 0.5 });

  const cake = cakeTable(group, { legColor: 0x1d2c66, theme: 'cruise' });
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group);

  // 파티 구역 위 전구 줄: 돛대 꼭대기에서 사방으로
  const mastH = 10;
  const mastZ = -12.5;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, mastH, 10), railMat);
  mast.position.set(0, mastH / 2, mastZ);
  group.add(mast);
  obstacles.push({ x: 0, z: mastZ, r: 0.6 });
  const top = new THREE.Vector3(0, mastH - 0.3, mastZ);
  const hx = 11;
  const pts = [top,
    new THREE.Vector3(-hx, 4.4, -8), new THREE.Vector3(-hx, 4.4, 0), new THREE.Vector3(-hx, 4.4, 8),
    new THREE.Vector3(hx, 4.4, 8), new THREE.Vector3(hx, 4.4, 0), new THREE.Vector3(hx, 4.4, -8),
    new THREE.Vector3(0, 1.4, BOW + 1),
    new THREE.Vector3(-hx * 0.4, 4.4, 10), new THREE.Vector3(hx * 0.4, 4.4, 10)];
  const spans = [[0, 1, 0.8], [0, 2, 1.2], [0, 3, 1.8], [0, 4, 1.8], [0, 5, 1.2], [0, 6, 0.8], [0, 7, 1.4], [0, 8, 1.6], [0, 9, 1.6], [8, 9, 0.6], [3, 8, 0.6], [4, 9, 0.6], [1, 2, 0.6], [2, 3, 0.6], [4, 5, 0.6], [5, 6, 0.6]];
  for (const p of pts.slice(1, 7).concat([pts[8], pts[9]])) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, p.y, 8), railMat);
    pole.position.set(p.x, p.y / 2, p.z);
    group.add(pole);
  }
  const lights = stringLights(group, pts, spans, { drawPoles: false, wireColor: 0x2a3050 });

  // 배 밖 풍경(조타륜을 돌리면 이 풍경이 돌아 배가 방향을 트는 것처럼 보인다)
  const scenery = new THREE.Group();
  city(scenery, { count: 46, distMin: 120, distMax: 170, yBase: -14, hMax: 36, arc: [Math.PI * 0.12, Math.PI * 0.88] });
  city(scenery, { count: 46, distMin: 120, distMax: 170, yBase: -14, hMax: 36, arc: [Math.PI * 1.12, Math.PI * 1.88] });
  const bridgeDots = [];
  for (let i = 0; i <= 70; i++) bridgeDots.push(-160 + i * (320 / 70), 6 - Math.cos((i / 70) * Math.PI * 2) * 4, -250);
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bridgeDots, 3));
  scenery.add(new THREE.Points(bgeo, new THREE.PointsMaterial({ color: 0xffe2a8, size: 1.6, fog: false })));
  // 등대: 빙글 도는 불빛
  const lighthouse = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 22, 16), towerMat);
  tower.position.y = 4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 4, 16), new THREE.MeshStandardMaterial({ color: 0xc23b3b }));
  band.position.y = 2;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
  lamp.position.y = 16;
  const beamTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(255,245,200,0.9)');
    gr.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 32);
    return new THREE.CanvasTexture(c);
  })();
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(90, 6), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.geometry.translate(45, 0, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 16;
  beamPivot.add(beam);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(14, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2a3250, flatShading: true }));
  rock.position.y = -8;
  lighthouse.add(tower, band, lamp, beamPivot, rock);
  lighthouse.position.set(-90, -4, -190);
  scenery.add(lighthouse);
  group.add(scenery);

  stars(group, { count: 1200 });
  moon(group, new THREE.Vector3(-60, 55, -170), 6);

  // ── 놀거리 ──
  let turnBoost = 0;
  let wheelSpin = 0;
  const hotspots = [
    {
      id: 'horn', label: '뱃고동', verb: '뱃고동 울리기', shared: true, cool: 4000,
      pos: new THREE.Vector3(-8.5, 0, 4.4),
      run() {
        sound.shipHorn();
        const top = new THREE.Vector3(-8.5 + 1.9, 3.6, 7.5);
        fx.emit(top, { n: 14, spread: 0.3, size: 0.5, grow: 4, life: 2.6, vel: new THREE.Vector3(1.6, 1.4, 0) });
        fx.emit(new THREE.Vector3(-8.5, 5.2, 7.5), { n: 10, spread: 0.8, up: 1.6, size: 0.9, grow: 3, life: 3 });
        return { status: '뿌우우~ 뱃고동이 울렸어요' };
      },
    },
    {
      id: 'wheel', label: '조타륜', verb: '조타륜 돌리기', shared: true, cool: 6000,
      pos: new THREE.Vector3(0, 0, -19.4),
      run() {
        sound.creak();
        turnBoost = 1;
        wheelSpin = Math.PI * 2;
        return { status: '배가 천천히 방향을 틀어요' };
      },
    },
    {
      id: 'scope', label: '망원경', verb: '망원경으로 등대 보기', cool: 6000,
      pos: new THREE.Vector3(0, 0, -33.6),
      run({ isMe }) {
        if (!isMe) return {};
        const target = lighthouse.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 12, 0));
        return { view: { pos: new THREE.Vector3(0, 2.2, -36.5), look: target, fov: 12, ms: 5500 }, status: '멀리 등대가 반짝여요' };
      },
    },
  ];
  for (const hs of hotspots) hs.marker = spotMarker(group, hs.pos, hs.id === 'scope' ? 0x8fd3c1 : 0xffc46b);
  // 파티 차림: 왼쪽 뷔페, 케이크 옆 선물, 케이크 뒤 현수막, 승선구 풍선 아치, 둘레 기둥 사이 깃발 줄
  const lo = (p) => new THREE.Vector3(p.x, 3.5, p.z);
  const party = partyDressing(group, {
    theme: 'cruise',
    seating: [{ x: 9.5, z: 4.5, ry: -Math.PI / 2 }, { x: 9.5, z: 1, ry: -Math.PI / 2 }],
    extras(deco, k) {
      for (const z of [-5.2, 1.4]) { const b = k.barrel(); b.position.set(-9.6, 0, z); deco.add(b); k.obstacles.push({ x: -9.6, z, r: 0.45 }); }
    },
    buffet: { x: -8, z: -2, ry: Math.PI / 2 },
    arch: { x: 0, z: Z1 - 1.4 },
    banner: { x: 0, y: 3.0, z: -5.6 },
    bunting: [[lo(pts[1]), lo(pts[2]), 0.5], [lo(pts[2]), lo(pts[3]), 0.5], [lo(pts[4]), lo(pts[5]), 0.5], [lo(pts[5]), lo(pts[6]), 0.5], [lo(pts[8]), lo(pts[9]), 0.4], [lo(pts[3]), lo(pts[8]), 0.4], [lo(pts[4]), lo(pts[9]), 0.4], [lo(pts[1]), lo(pts[6]), 1.2]],
  });
  obstacles.push(...party.obstacles);
  hotspots.push(...party.hotspots);

  return finishWorld(scene, group, {
    // 점등 구도: 갑판 뒤 난간 안쪽에서(난간·구명튜브가 앞을 가리지 않게)
    igniteView: (portrait) => (portrait ? { cam: [0, 4.3, 11.2], look: [0, 4.2, -1] } : { cam: [0, 4.8, 11.3], look: [0, 4.3, -1], fov: 60 }),
    skyNameZ: -6,
    id: 'cruise',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    hotspots,
    seats: party.seats,
    props: party.props,
    roam: 18,
    bounds: { minX: -X, maxX: X, minZ: BOW + 2, maxZ: Z1 },
    // 뱃머리는 끝으로 갈수록 좁아진다
    clampExtra(p) {
      if (p.z < Z0) {
        const k = (p.z - BOW) / (Z0 - BOW);
        const half = Math.max(0.6, X * Math.sqrt(Math.max(0, k)) - 0.8);
        p.x = THREE.MathUtils.clamp(p.x, -half, half);
      }
    },
    entrance: new THREE.Vector3(0, 0, Z1 - 1.2),
    cakeTop: new THREE.Vector3(0, 2.4, 0),
    hemiBase: 0.85,
    palette: { ...PAL, sky: 0x0f1838 },
    extraUpdate(t, dt) {
      waves.offset.y -= dt * (0.05 + turnBoost * 0.03);
      waves.offset.x = Math.sin(t * 0.2) * 0.02 + turnBoost * 0.05;
      scenery.rotation.y += dt * (0.003 + turnBoost * 0.06);
      turnBoost = Math.max(0, turnBoost - dt / 8);
      if (wheelSpin > 0) { const step = Math.min(wheelSpin, dt * 3); wheel.rotation.z += step; wheelSpin -= step; }
      beamPivot.rotation.y = t * 0.8;
      water.material.emissiveIntensity = 0.5 + Math.sin(t * 2) * 0.12;
      fx.tick(dt);
    },
  });
}
