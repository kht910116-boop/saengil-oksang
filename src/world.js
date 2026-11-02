import * as THREE from 'three';

// 옥상 크기 (x: 좌우, z: 앞뒤)
export const ROOF = { w: 26, d: 20 };

const PALETTE = {
  sky: 0x1f2547,
  roof: 0x4a3f5c,
  parapet: 0x3a3150,
  cap: 0x5c5070,
  wire: 0x1a1626,
  bulb: 0xffc46b,
  pink: 0xf29bb3,
  mint: 0x8fd3c1,
  paper: 0xfbf4e8,
};

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3f5c';
  g.fillRect(0, 0, 256, 256);
  // 콘크리트 얼룩
  for (let i = 0; i < 900; i++) {
    const v = 60 + Math.random() * 30;
    g.fillStyle = `rgba(${v + 20},${v},${v + 35},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  g.strokeStyle = 'rgba(30,24,44,0.55)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(ROOF.w / 2.5, ROOF.d / 2.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 128; y += 12) {
    for (let x = 5; x < 64; x += 10) {
      if (Math.random() < 0.38) {
        const warm = Math.random() < 0.8;
        g.fillStyle = warm ? `rgba(255,${190 + Math.random() * 40},${110 + Math.random() * 40},1)` : 'rgba(170,200,255,1)';
        g.fillRect(x, y, 6, 7);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// 두 기둥 사이 처진 전선 곡선
function sagCurve(a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(PALETTE.sky, 0.011);

  const hemi = new THREE.HemisphereLight(0x7d86c4, 0x2a2235, 0.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xb8c4ff, 0.55);
  moon.position.set(-20, 30, -10);
  scene.add(moon);

  // 바닥
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOF.w, 0.6, ROOF.d),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.95 })
  );
  floor.position.y = -0.3;
  floor.name = 'floor';
  scene.add(floor);

  // 난간
  const parMat = new THREE.MeshStandardMaterial({ color: PALETTE.parapet, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: PALETTE.cap, roughness: 0.8 });
  const walls = [
    [ROOF.w + 0.6, ROOF.d / 2 + 0.15, 0, true],
    [ROOF.w + 0.6, -ROOF.d / 2 - 0.15, 0, true],
    [ROOF.d, ROOF.w / 2 + 0.15, 0, false],
    [ROOF.d, -ROOF.w / 2 - 0.15, 0, false],
  ];
  for (const [len, off, , alongX] of walls) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.3, 1.0, alongX ? 0.3 : len), parMat);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.42, 0.1, alongX ? 0.42 : len), capMat);
    if (alongX) { w.position.set(0, 0.5, off); cap.position.set(0, 1.05, off); }
    else { w.position.set(off, 0.5, 0); cap.position.set(off, 1.05, 0); }
    scene.add(w, cap);
  }

  const obstacles = []; // {x, z, r}

  // 물탱크
  const tank = new THREE.Group();
  const tankBody = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 2.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x6a8fb0, roughness: 0.6, metalness: 0.2 })
  );
  tankBody.position.y = 2.1;
  const tankTop = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x5a7a98 }));
  tankTop.position.y = 3.45;
  tank.add(tankBody, tankTop);
  for (const [lx, lz] of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), parMat);
    leg.position.set(lx, 0.5, lz);
    tank.add(leg);
  }
  tank.position.set(-ROOF.w / 2 + 2.2, 0, -ROOF.d / 2 + 2.2);
  scene.add(tank);
  obstacles.push({ x: tank.position.x, z: tank.position.z, r: 1.7 });

  // 화분
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb4785a, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a6e, roughness: 0.8 });
  for (const [px, pz] of [[ROOF.w / 2 - 1.2, -ROOF.d / 2 + 1.2], [ROOF.w / 2 - 1.2, ROOF.d / 2 - 1.2], [-ROOF.w / 2 + 1.2, ROOF.d / 2 - 1.2]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 14), potMat);
    pot.position.set(px, 0.35, pz);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), leafMat);
    leaf.position.set(px, 1.2, pz);
    leaf.scale.set(1, 1.2, 1);
    scene.add(pot, leaf);
    obstacles.push({ x: px, z: pz, r: 0.8 });
  }

  // 테이블과 케이크
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 28), new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.7 }));
  top.position.y = 0.95;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.95, 12), parMat);
  leg.position.y = 0.47;
  const cake1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.32, 28), new THREE.MeshStandardMaterial({ color: PALETTE.pink, roughness: 0.6 }));
  cake1.position.y = 1.17;
  const cake2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 28), new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.6 }));
  cake2.position.y = 1.46;
  table.add(top, leg, cake1, cake2);
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), new THREE.MeshStandardMaterial({ color: PALETTE.mint }));
    candle.position.set(Math.cos(a) * 0.22, 1.69, Math.sin(a) * 0.22);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    flame.scale.y = 1.6;
    flame.position.set(candle.position.x, 1.83, candle.position.z);
    table.add(candle, flame);
    flames.push(flame);
  }
  const candleLight = new THREE.PointLight(0xffb45e, 3.6, 9, 1.6);
  candleLight.position.y = 2.1;
  table.add(candleLight);
  table.position.set(0, 0, 0);
  scene.add(table);
  obstacles.push({ x: 0, z: 0, r: 1.6 });

  // 풍선
  const balloons = [];
  const bColors = [PALETTE.pink, PALETTE.mint, 0xffd97a, PALETTE.pink, 0xb9a6f2];
  bColors.forEach((col, i) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }));
    b.scale.y = 1.18;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 8), b.material);
    knot.position.y = -0.52;
    knot.rotation.x = Math.PI;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.4, 4), new THREE.MeshBasicMaterial({ color: 0xe8e0f0 }));
    str.position.y = -1.75;
    g.add(b, knot, str);
    const base = new THREE.Vector3(1.2 + (i % 3) * 0.45, 3.1 + (i % 2) * 0.5, -0.8 + Math.floor(i / 3) * 0.6);
    g.position.copy(base);
    g.userData.base = base;
    g.userData.phase = i * 1.3;
    scene.add(g);
    balloons.push(g);
  });

  // 전구 기둥과 전선
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2640, roughness: 0.7 });
  const poleH = 4.6;
  const hx = ROOF.w / 2 - 0.6;
  const hz = ROOF.d / 2 - 0.6;
  // 기둥은 모서리와 좌우 변 가운데에만 둔다(카메라 시야를 가리지 않게)
  const polePts = [
    [-hx, -hz], [hx * 0.35, -hz], [hx, -hz],
    [hx, 0], [hx, hz], [-hx * 0.35, hz], [-hx, hz], [-hx, 0],
  ].map(([x, z]) => new THREE.Vector3(x, poleH, z));
  for (const p of polePts) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, poleH, 8), poleMat);
    pole.position.set(p.x, poleH / 2, p.z);
    scene.add(pole);
  }
  // 둘레 + 가로지르는 줄
  const spans = [];
  for (let i = 0; i < polePts.length; i++) spans.push([polePts[i], polePts[(i + 1) % polePts.length], 0.7]);
  spans.push([polePts[0], polePts[4], 1.4]);
  spans.push([polePts[2], polePts[6], 1.4]);
  spans.push([polePts[3], polePts[7], 1.2]);

  const wireMat = new THREE.MeshBasicMaterial({ color: PALETTE.wire });
  const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const bulbs = [];
  const lanternSlots = [];
  let order = 0;
  for (const [a, b, sag] of spans) {
    const curve = sagCurve(a, b, sag);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.018, 4, false), wireMat);
    scene.add(tube);
    const len = a.distanceTo(b);
    const n = Math.max(6, Math.round(len / 0.9));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = curve.getPointAt(t);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, emissive: PALETTE.bulb, emissiveIntensity: 0.18 });
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.copy(p).add(new THREE.Vector3(0, -0.1, 0));
      bulb.userData.order = order++;
      scene.add(bulb);
      bulbs.push(bulb);
      // 짝수 전구 아래가 1순위 자리, 홀수 전구 아래는 자리가 찼을 때 쓰는 2순위 자리
      lanternSlots.push({ pos: p.clone().add(new THREE.Vector3(0, -0.55, 0)), tier: i % 2 });
    }
  }

  // 도시 야경
  const winTex = windowTexture();
  const bldMat = (rx, ry) => {
    const em = winTex.clone();
    em.needsUpdate = true;
    em.wrapS = em.wrapT = THREE.RepeatWrapping;
    em.repeat.set(rx, ry);
    em.offset.set(Math.random(), Math.random());
    return new THREE.MeshStandardMaterial({ color: 0x232846, roughness: 1, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.9 });
  };
  for (let i = 0; i < 70; i++) {
    const ang = (i / 70) * Math.PI * 2 + Math.random() * 0.05;
    const dist = 34 + Math.random() * 45;
    const w = 4 + Math.random() * 6;
    const h = 6 + Math.random() * (dist > 55 ? 40 : 22);
    const d = 4 + Math.random() * 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bldMat(w / 4, h / 8));
    m.position.set(Math.cos(ang) * dist, h / 2 - 18, Math.sin(ang) * dist);
    m.rotation.y = -ang;
    scene.add(m);
  }

  // 별과 달
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 900; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * 0.45;
    const r = 180;
    sp.push(Math.cos(th) * Math.sin(ph) * r, Math.cos(ph) * r * 0.9 + 10, Math.sin(th) * Math.sin(ph) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff3dc, size: 0.9, sizeAttenuation: true, fog: false }));
  scene.add(stars);
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
  moonMesh.position.set(-70, 60, -110);
  scene.add(moonMesh);

  function update(t) {
    for (const f of flames) f.scale.set(1 + Math.sin(t * 17 + f.position.x * 40) * 0.12, 1.6 + Math.sin(t * 23 + f.position.z * 30) * 0.25, 1);
    candleLight.intensity = 3.4 + Math.sin(t * 13) * 0.4 + Math.sin(t * 29) * 0.25;
    for (const b of balloons) {
      const ph = b.userData.phase;
      b.position.y = b.userData.base.y + Math.sin(t * 1.1 + ph) * 0.12;
      b.rotation.z = Math.sin(t * 0.8 + ph) * 0.06;
    }
  }

  return { bulbs, lanternSlots, obstacles, floor, hemi, update, PALETTE };
}
