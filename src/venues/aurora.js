import * as THREE from 'three';
import { PAL, skyDome, stars, cakeTable, decoBalloons, stringLights, finishWorld, spotMarker, puffs, mergeStatic } from './common.js';
import { sound } from '../audio.js';

// 오로라 유리돔: 눈 덮인 설원 한가운데 투명한 유리 돔. 점등 때 오로라가 하늘을 덮는다.
const AURORA_VERT = `
  uniform float uTime;
  uniform float uSeed;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 0.035 + uTime * 0.35 + uSeed) * 9.0 + sin(p.x * 0.11 - uTime * 0.6 + uSeed * 2.0) * 2.5;
    p.y += sin(p.x * 0.05 + uTime * 0.25 + uSeed) * 3.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const AURORA_FRAG = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uBoost;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  void main() {
    float curtain = 0.55 + 0.45 * sin(vUv.x * 60.0 + uTime * 1.3 + uSeed * 5.0) * sin(vUv.x * 23.0 - uTime * 0.7);
    float fadeY = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
    float fadeX = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
    vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.9, vUv.y));
    float a = fadeY * fadeX * (0.35 + 0.65 * curtain) * (0.22 + uBoost * 0.33);
    gl_FragColor = vec4(col * a, a);
  }`;

function snowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe8f6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v - 20},${v - 8},${v},${Math.random() * 0.25})`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#7a4f36';
  g.fillRect(0, 0, 512, 512);
  for (let r = 16; r < 256; r += 16) {
    g.strokeStyle = `rgba(${50 + Math.random() * 30},${30 + Math.random() * 15},20,0.55)`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  // 가운데 둥근 러그
  g.fillStyle = '#9b3c4f';
  g.beginPath();
  g.arc(256, 256, 64, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f2d39a';
  g.lineWidth = 4;
  for (const r of [59, 50]) {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function pine(scale, color = 0x1f4a44, snow = true) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 0.8 * scale, 6), new THREE.MeshStandardMaterial({ color: 0x4a3226 }));
  trunk.position.y = 0.4 * scale;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f6ff, roughness: 0.9, flatShading: true });
  for (let k = 0; k < 3; k++) {
    const r = (1.3 - k * 0.32) * scale;
    const h = (1.5 - k * 0.2) * scale;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), leaf);
    cone.position.y = (1.2 + k * 0.85) * scale;
    g.add(cone);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, h * 0.4, 7), white);
      cap.position.y = cone.position.y + h * 0.3;
      g.add(cap);
    }
  }
  return g;
}

export function buildAurora(scene) {
  const R = 24; // 큰 유리 돔: 가운데 파티 구역, 뒤쪽 스케이트장, 왼쪽 벽난로, 오른쪽 눈사람·오로라 수정
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x0a1830);
  scene.fog = new THREE.FogExp2(0x16304a, 0.006);
  skyDome(group, '#040b1e', '#2b4a6e', { mid: '#0c2140' });

  const hemi = new THREE.HemisphereLight(0x9cc4ff, 0x3a4660, 0.95);
  const moonLight = new THREE.DirectionalLight(0xd4e4ff, 0.5);
  moonLight.position.set(30, 40, -50);
  group.add(hemi, moonLight);

  // 설원
  const snowField = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ map: snowTexture(), color: 0xc8d6ee, roughness: 1 }));
  snowField.rotation.x = -Math.PI / 2;
  snowField.position.y = -0.62;
  group.add(snowField);

  // 돔 바닥(둥근 나무 마루 + 러그)
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.3, 0.6, 48), [
    new THREE.MeshStandardMaterial({ color: 0x4a3226, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: woodRingTexture(), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x4a3226 }),
  ]);
  floor.position.y = -0.3;
  group.add(floor);

  // 유리 돔과 금속 뼈대
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }),
  );
  group.add(glass);
  const ribs = new THREE.Group();
  const ribMat = new THREE.MeshStandardMaterial({ color: 0xd8dde8, roughness: 0.35, metalness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 64, Math.PI), ribMat);
    rib.rotation.y = (i / 6) * Math.PI;
    ribs.add(rib);
  }
  for (const y of [R * 0.45, R * 0.8]) {
    const rr = Math.sqrt(R * R - y * y);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05, 6, 64), ribMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ribs.add(ring);
  }
  const base = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 8, 64), ribMat);
  base.rotation.x = Math.PI / 2;
  base.position.y = 0.05;
  ribs.add(base);
  group.add(mergeStatic(ribs));
  // 입구 아치
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.1, 8, 24, Math.PI), ribMat);
  arch.position.set(0, 1.4, R - 0.05);
  group.add(arch);

  const obstacles = [];
  // 실내 소품: 장식 트리, 소파 두 개, 벽난로
  const tree = pine(1.2, 0x2d6b55, false);
  tree.position.set(-9, 0, -6);
  group.add(tree);
  const ornCols = [0xff6b6b, 0xffd166, 0x7bdff2, 0xf29bb3];
  for (let i = 0; i < 18; i++) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: ornCols[i % 4], emissive: ornCols[i % 4], emissiveIntensity: 0.5 }));
    const h = 1.2 + Math.random() * 2.8;
    const a = Math.random() * Math.PI * 2;
    const rr = (1.6 - (h - 1.2) * 0.38) * 1.2 * 0.85;
    o.position.set(tree.position.x + Math.cos(a) * rr, h * 1.2 * 0.85, tree.position.z + Math.sin(a) * rr);
    group.add(o);
  }
  obstacles.push({ x: tree.position.x, z: tree.position.z, r: 1.8 });
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.9 });
  for (const [x, z, ry] of [[-15.5, 3, 1.4], [-15.5, 9.5, 1.8]]) {
    const s = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1), sofaMat);
    seat.position.y = 0.35;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.3), sofaMat);
    back.position.set(0, 0.8, -0.4);
    s.add(seat, back);
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    group.add(s);
    obstacles.push({ x, z, r: 1.4 });
  }
  const fire = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x6a6f7a, roughness: 1 }));
  stone.position.y = 0.25;
  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
  embers.scale.y = 0.5;
  embers.position.y = 0.55;
  const fireLight = new THREE.PointLight(0xff8a3a, 2.4, 8, 1.6);
  fireLight.position.y = 1.2;
  fire.add(stone, embers, fireLight);
  fire.position.set(-12, 0, 6);
  group.add(fire);
  obstacles.push({ x: fire.position.x, z: fire.position.z, r: 1.3 });

  const cake = cakeTable(group, { legColor: 0x4a3226 });
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group, undefined, [0x9fd8ff, PAL.mint, 0xffffff, PAL.lavender, 0x9fd8ff]);

  // 돔 안쪽 고리에 매단 전구 줄 + 꼭대기 중심에서 내려오는 줄
  const ringR = 10.5;
  const ringY = 4.4;
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2 + Math.PI / 10;
    ring.push(new THREE.Vector3(Math.cos(a) * ringR, ringY, Math.sin(a) * ringR));
  }
  const pts = [...ring, new THREE.Vector3(0, 8.2, 0)];
  const hub = pts.length - 1;
  const spans = ring.map((_, i) => [i, (i + 1) % ring.length, 0.6]);
  for (let i = 0; i < ring.length; i += 2) spans.push([hub, i, 1.0]);
  const lights = stringLights(group, pts, spans, { drawPoles: true, poleColor: 0xd8dde8, wireColor: 0x3a4660 });
  // 가운데 고리는 돔 꼭대기에서 내려온 줄에 매단다
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, R - 8.2, 4), new THREE.MeshBasicMaterial({ color: 0x3a4660 }));
  cable.position.y = 8.2 + (R - 8.2) / 2;
  group.add(cable);

  const outside = new THREE.Group();
  // 바깥: 눈 덮인 소나무 숲과 먼 산
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = R + 6 + Math.random() * 70;
    const p = pine(1 + Math.random() * 1.6);
    p.position.set(Math.cos(a) * d, -0.6, Math.sin(a) * d);
    p.rotation.y = Math.random() * 6;
    outside.add(p);
  }
  const mtMat = new THREE.MeshStandardMaterial({ color: 0x31435f, roughness: 1, flatShading: true });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe8f0ff, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2;
    const d = 170 + Math.random() * 60;
    const h = 40 + Math.random() * 50;
    const r = 35 + Math.random() * 30;
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mtMat);
    m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 6), capMat);
    cap.position.set(m.position.x, h - 2 - h * 0.16, m.position.z);
    outside.add(m, cap);
  }

  group.add(mergeStatic(outside));

  stars(group, { count: 1300, color: 0xeaf2ff });

  // 오로라 커튼
  const auroras = [];
  const colorSets = [[0x2bff9a, 0x7a5cff], [0x4dffc3, 0x2b8cff], [0x9bff6b, 0xff5ca8]];
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: i * 1.7 },
        uBoost: { value: 0 },
        uColorA: { value: new THREE.Color(colorSets[i % 3][0]) },
        uColorB: { value: new THREE.Color(colorSets[i % 3][1]) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(260, 60, 120, 1), mat);
    ribbon.position.set(-20 + i * 18, 55 + i * 7, -110 + i * 22);
    ribbon.rotation.x = -0.35;
    ribbon.rotation.y = (i - 1.5) * 0.25;
    ribbon.frustumCulled = false;
    group.add(ribbon);
    auroras.push(mat);
  }

  // 돔 바깥으로 내리는 눈
  const SNOW = 1400;
  const sp = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    let x;
    let z;
    do { x = (Math.random() - 0.5) * 160; z = (Math.random() - 0.5) * 160; } while (x * x + z * z < (R + 1) * (R + 1));
    sp[i * 3] = x;
    sp[i * 3 + 1] = Math.random() * 40;
    sp[i * 3 + 2] = z;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false }));
  snow.frustumCulled = false;
  group.add(snow);

  // ── 놀거리 ──
  const fx = puffs(group, { color: '255,255,255' });
  const ember = puffs(group, { color: '255,170,80', additive: true });
  // 스케이트장(뒤쪽): 위에서는 미끄러진다
  const RINK = new THREE.Vector3(0, 0, -14);
  const rinkR = 6.5;
  const iceTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#cfe8ff';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 0.5 + Math.random();
      g.beginPath();
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      g.arc(x, y, 20 + Math.random() * 80, Math.random() * 6, Math.random() * 6);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ice = new THREE.Mesh(new THREE.CircleGeometry(rinkR, 48), new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.05, metalness: 0.2, emissive: 0x1a3a5a, emissiveIntensity: 0.3 }));
  ice.rotation.x = -Math.PI / 2;
  ice.position.set(RINK.x, 0.015, RINK.z);
  group.add(ice);
  const rinkEdge = new THREE.Mesh(new THREE.TorusGeometry(rinkR, 0.08, 6, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6fb8ff, emissiveIntensity: 0.6 }));
  rinkEdge.rotation.x = Math.PI / 2;
  rinkEdge.position.set(RINK.x, 0.1, RINK.z);
  group.add(rinkEdge);
  // 눈사람(함께 만들기): 누를 때마다 한 단계씩
  const snowman = new THREE.Group();
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const coal = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const parts = [
    (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 16), snowMat); m.position.y = 0.8; return m; })(),
    (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.65, 20, 16), snowMat); m.position.y = 2.0; return m; })(),
    (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 16), snowMat); m.position.y = 2.95; return m; })(),
    (() => {
      const g = new THREE.Group();
      for (const x of [-0.15, 0.15]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), coal); e.position.set(x, 3.05, 0.4); g.add(e); }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0xff8a3c }));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 2.95, 0.6);
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 8, 20), new THREE.MeshStandardMaterial({ color: 0xd94a5a }));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = 2.55;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 16), coal);
      hat.position.y = 3.5;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 16), coal);
      brim.position.y = 3.3;
      g.add(nose, scarf, hat, brim);
      return g;
    })(),
  ];
  for (const m of parts) { m.visible = false; snowman.add(m); }
  const snowPile = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), snowMat);
  snowman.add(snowPile);
  snowman.position.set(14, 0, 4);
  snowman.rotation.y = -0.9;
  group.add(snowman);
  obstacles.push({ x: 14, z: 4, r: 1.3 });
  let snowStage = 0;
  let snowWave = 0;
  // 오로라 수정: 누르면 오로라 색이 바뀌며 크게 일렁인다
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshStandardMaterial({ color: 0x9fffd8, emissive: 0x2bff9a, emissiveIntensity: 0.8, roughness: 0.1, transparent: true, opacity: 0.9 }));
  crystal.scale.y = 1.8;
  crystal.position.set(14, 1.9, -9);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0xc8d6ee, roughness: 0.6 }));
  plinth.position.set(14, 0.3, -9);
  group.add(crystal, plinth);
  obstacles.push({ x: 14, z: -9, r: 1.0 });
  const palettes = [[0x2bff9a, 0x7a5cff], [0xff5ca8, 0x7ad7ff], [0xffd166, 0xff6b6b], [0x9b7bff, 0x4dffc3]];
  let palIdx = 0;
  let pulse = 0;
  let flare = 0;
  const hotspots = [
    {
      id: 'snowman', label: '눈사람', verb: '눈 굴려서 보태기', shared: true, cool: 1500,
      pos: new THREE.Vector3(12.4, 0, 5.4),
      run() {
        sound.boing();
        fx.emit(new THREE.Vector3(14, 1, 4), { n: 10, spread: 0.8, up: 1.4, size: 0.25, grow: 1, life: 1.2 });
        if (snowStage < parts.length) {
          parts[snowStage].visible = true;
          snowStage++;
          if (snowStage === parts.length) { sound.shimmer(); snowWave = 2; return { status: '눈사람이 완성됐어요!' }; }
          return { status: `눈사람 만드는 중 (${snowStage}/${parts.length})` };
        }
        snowWave = 2; // 다 만든 뒤에는 눈사람이 들썩
        return {};
      },
    },
    {
      id: 'fire', label: '벽난로', verb: '장작 넣기', shared: true, cool: 3000,
      pos: new THREE.Vector3(-10.4, 0, 6),
      run() {
        sound.crackle();
        flare = 1;
        ember.emit(new THREE.Vector3(-12, 0.8, 6), { n: 16, spread: 0.5, up: 2.2, size: 0.12, grow: 0.3, life: 1.6 });
        return { status: '타닥타닥, 불이 활활 타올라요' };
      },
    },
    {
      id: 'aurora', label: '오로라 수정', verb: '오로라 부르기', shared: true, cool: 4000,
      pos: new THREE.Vector3(12.8, 0, -7.6),
      run() {
        sound.shimmer();
        palIdx = (palIdx + 1) % palettes.length;
        auroras.forEach((m, i) => {
          const [a, b] = palettes[(palIdx + i) % palettes.length];
          m.uniforms.uColorA.value.setHex(a);
          m.uniforms.uColorB.value.setHex(b);
        });
        crystal.material.emissive.setHex(palettes[palIdx][0]);
        pulse = 1;
        return { status: '오로라 빛이 바뀌었어요' };
      },
    },
  ];
  for (const hs of hotspots) hs.marker = spotMarker(group, hs.pos, 0x9fd8ff);

  let boost = 0;
  let boostTarget = 0;
  return finishWorld(scene, group, {
    id: 'aurora',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { w: (R - 1.2) * 2, d: (R - 1.2) * 2, r: R - 1.2 },
    hotspots,
    roam: 15,
    zones: [{ kind: 'slide', test: (p) => (p.x - RINK.x) ** 2 + (p.z - RINK.z) ** 2 < rinkR * rinkR }],
    entrance: new THREE.Vector3(0, 0, R - 1.6),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 0.95,
    palette: { ...PAL, sky: 0x0a1830 },
    // 내 시점 카메라는 유리 돔 안에 머문다(뼈대가 화면을 가리지 않게)
    clampCamera(v) {
      const lim = R - 1.1;
      const d = v.length();
      if (d > lim) v.multiplyScalar(lim / d);
      v.y = Math.max(v.y, 1.2);
    },
    // 점등이 시작되면 오로라가 밝아진다(0~1)
    ignite(k) { boostTarget = k; },
    extraUpdate(t, dt) {
      boost += (boostTarget - boost) * Math.min(1, dt * 1.5);
      pulse = Math.max(0, pulse - dt / 3);
      for (const m of auroras) { m.uniforms.uTime.value = t; m.uniforms.uBoost.value = Math.max(boost, pulse); }
      crystal.rotation.y = t * 0.6;
      crystal.position.y = 1.9 + Math.sin(t * 1.5) * 0.12;
      if (snowWave > 0) { snowWave = Math.max(0, snowWave - dt); snowman.rotation.z = Math.sin(snowWave * 12) * 0.08 * snowWave; }
      flare = Math.max(0, flare - dt / 4);
      fx.tick(dt);
      ember.tick(dt);
      const arr = snowGeo.attributes.position.array;
      for (let i = 0; i < SNOW; i++) {
        arr[i * 3 + 1] -= dt * (1.2 + (i % 5) * 0.25);
        arr[i * 3] += Math.sin(t + i) * dt * 0.2;
        if (arr[i * 3 + 1] < -0.6) arr[i * 3 + 1] = 40;
      }
      snowGeo.attributes.position.needsUpdate = true;
      fireLight.intensity = 2.2 + flare * 4 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2;
      embers.scale.set(1 + flare * 0.6, 0.5 + flare * 0.8, 1 + flare * 0.6);
    },
  });
}
