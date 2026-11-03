import * as THREE from 'three';
import { PAL, stars, cakeTable, decoBalloons, stringLights, finishWorld, spotMarker, puffs, softDot, mergeStatic } from './common.js';
import { sound } from '../audio.js';

// 우주 전망 라운지: 지구가 내려다보이는 우주정거장 라운지
function panelTexture(w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4258';
  g.fillRect(0, 0, 256, 256);
  for (const [x, y] of [[0, 0], [128, 0], [0, 128], [128, 128]]) {
    const v = 58 + Math.random() * 10;
    g.fillStyle = `rgb(${v},${v + 6},${v + 22})`;
    g.fillRect(x + 3, y + 3, 122, 122);
    g.fillStyle = 'rgba(160,180,220,0.35)';
    for (const [bx, by] of [[10, 10], [114, 10], [10, 114], [114, 114]]) g.fillRect(x + bx, y + by, 4, 4);
  }
  g.fillStyle = 'rgba(120,230,255,0.5)';
  g.fillRect(0, 126, 256, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 4, d / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 바다·대륙·얼음을 그린 지구 표면(가짜 잡음)
function earthTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const sea = g.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, '#1d4f8a');
  sea.addColorStop(0.5, '#1a6aa8');
  sea.addColorStop(1, '#1d4f8a');
  g.fillStyle = sea;
  g.fillRect(0, 0, 1024, 512);
  const blob = (x, y, r, col) => {
    g.fillStyle = col;
    for (let k = 0; k < 26; k++) {
      g.beginPath();
      g.arc(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 0.9, r * (0.25 + Math.random() * 0.4), 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * 1024;
    const y = 120 + Math.random() * 280;
    blob(x, y, 60 + Math.random() * 70, '#3f7a4a');
    blob(x + 20, y + 10, 40 + Math.random() * 30, '#8a7a4a');
  }
  g.fillStyle = '#eef4ff';
  g.fillRect(0, 0, 1024, 26);
  g.fillRect(0, 486, 1024, 26);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 1024;
    const y = 40 + Math.random() * 432;
    g.fillStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.25})`;
    g.beginPath();
    g.ellipse(x, y, 20 + Math.random() * 60, 6 + Math.random() * 12, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

const ATMO_VERT = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const ATMO_FRAG = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
    gl_FragColor = vec4(vec3(0.35, 0.65, 1.0) * f * 1.6, f);
  }`;

function nebula(col) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, col);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
}

export function buildSpace(scene) {
  const W = 24;
  const D = 18;
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x03040c);
  scene.fog = null;

  const hemi = new THREE.HemisphereLight(0x9ab4ff, 0x2a2a40, 0.85);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.0);
  sun.position.set(60, 30, 40);
  group.add(hemi, sun);

  // 지구(아래 앞쪽) + 구름층 + 대기 빛
  const earth = new THREE.Group();
  const ER = 130;
  const surface = new THREE.Mesh(new THREE.SphereGeometry(ER, 64, 32), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0.05 }));
  const cloudsTex = cloudTexture();
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.012, 64, 32), new THREE.MeshStandardMaterial({ map: cloudsTex, transparent: true, depthWrite: false, roughness: 1 }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(ER * 1.08, 64, 32), new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
  earth.add(surface, clouds, atmo);
  earth.position.set(-30, -112, -230); // 앞쪽 지평선에 둥근 지구가 걸린다
  earth.rotation.z = 0.35;
  group.add(earth);

  // 별, 성운, 먼 해
  stars(group, { count: 2600, radius: 260, minY: -120, spread: 1, size: 1.1 });
  for (const [col, x, y, z, s] of [['rgba(150,90,255,0.55)', 120, 80, -200, 180], ['rgba(60,200,255,0.45)', -160, 120, -120, 160], ['rgba(255,90,170,0.4)', 40, 160, 180, 200]]) {
    const sp = new THREE.Sprite(nebula(col));
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    group.add(sp);
  }
  const sunGlow = new THREE.Sprite(nebula('rgba(255,240,210,0.9)'));
  sunGlow.position.set(200, 90, 140);
  sunGlow.scale.setScalar(60);
  group.add(sunGlow);

  // 금속 바닥과 받침
  // 넓은 전망 갑판: 가운데 라운지(케이크), 앞쪽 큰 창과 망원경, 왼쪽 무중력 구역, 오른쪽 순간이동 패드
  const PX = 20;
  const ZF = -26;
  const ZB = 12;
  const DW = PX * 2;
  const DD = ZB - ZF;
  const DZ = (ZB + ZF) / 2;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(DW, 0.6, DD), new THREE.MeshStandardMaterial({ map: panelTexture(DW, DD), roughness: 0.5, metalness: 0.55 }));
  floor.position.set(0, -0.3, DZ);
  group.add(floor);
  const under = new THREE.Mesh(new THREE.BoxGeometry(DW + 1, 2.5, DD + 1), new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.6, metalness: 0.6 }));
  under.position.set(0, -1.9, DZ);
  group.add(under);
  // 가장자리 유리 난간 + 빛나는 띠
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x6fe3ff });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const hx = W / 2;
  const hz = D / 2;
  const glassG = new THREE.Group();
  for (const [len, x, z, alongX] of [[DW, 0, ZF, true], [DD, -PX, DZ, false], [DD, PX, DZ, false], [PX - 1.6, -(PX + 1.6) / 2, ZB, true], [PX - 1.6, (PX + 1.6) / 2, ZB, true]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), glassMat);
    pane.position.set(x, 0.55, z);
    if (!alongX) pane.rotation.y = Math.PI / 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.08, 0.06, alongX ? 0.08 : len), edgeMat);
    strip.position.set(x, 1.12, z);
    const strip2 = strip.clone();
    strip2.position.y = 0.03;
    glassG.add(pane, strip, strip2);
  }
  group.add(mergeStatic(glassG));

  // 머리 위 트러스 뼈대(전구 줄을 거는 기둥 겸용)
  const trussMat = new THREE.MeshStandardMaterial({ color: 0xc9d0de, roughness: 0.4, metalness: 0.7 });
  const postsXZ = [[-hx + 0.5, -hz + 0.5], [0, -hz + 0.5], [hx - 0.5, -hz + 0.5], [hx - 0.5, hz - 0.5], [-hx + 0.5, hz - 0.5]];
  const H = 5.2;
  for (const [x, z] of postsXZ) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), trussMat);
    post.position.set(x, H / 2, z);
    group.add(post);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), edgeMat);
    lamp.position.set(x, H, z);
    group.add(lamp);
  }
  const beam = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.16), trussMat);
    m.position.set((a[0] + b[0]) / 2, H + 0.1, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    group.add(m);
  };
  beam(postsXZ[0], postsXZ[2]);
  beam(postsXZ[2], postsXZ[3]);
  beam(postsXZ[4], postsXZ[0]);

  const obstacles = [];
  // 먼 태양전지판과 안테나
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b2f6a, emissive: 0x0a1840, roughness: 0.3, metalness: 0.8 });
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 0.3), trussMat);
    arm.position.set(side * (PX + 9), -1.5, -8);
    group.add(arm);
    for (let k = 0; k < 3; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 7), panelMat);
      p.position.set(side * (PX + 4 + k * 5.2), -1.5, -8);
      p.rotation.x = 0.4;
      group.add(p);
    }
  }
  // 라운지 소품: 둥근 소파 두 개, 망원경
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f7, roughness: 0.6 });
  for (const [x, z] of [[-hx + 3.5, -hz + 3.2], [hx - 3.5, hz - 3.2]]) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.35, 10, 24, Math.PI * 1.3), seatMat);
    s.rotation.x = Math.PI / 2;
    s.position.set(x, 0.35, z);
    group.add(s);
    obstacles.push({ x, z, r: 1.4 });
  }
  const scope = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 12), trussMat);
  tube.rotation.z = 0.9;
  tube.position.y = 1.3;
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a4258, wireframe: true }));
  tri.position.y = 0.55;
  scope.add(tube, tri);
  scope.position.set(0, 0, ZF + 2.2);
  group.add(scope);
  obstacles.push({ x: 0, z: ZF + 2.2, r: 0.8 });

  // ── 놀거리 ──
  const glowFx = puffs(group, { color: '140,220,255', additive: true });
  // 무중력 구역: 빛나는 원통 안에서는 몸이 둥둥 뜬다
  const ZG = new THREE.Vector3(-13, 0, -14);
  const zgR = 4.5;
  const zgCyl = new THREE.Mesh(new THREE.CylinderGeometry(zgR, zgR, 7, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ad7ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  zgCyl.position.set(ZG.x, 3.5, ZG.z);
  const zgRing = new THREE.Mesh(new THREE.TorusGeometry(zgR, 0.07, 8, 64), edgeMat);
  zgRing.rotation.x = Math.PI / 2;
  zgRing.position.set(ZG.x, 0.05, ZG.z);
  const zgRing2 = zgRing.clone();
  zgRing2.position.y = 7;
  group.add(zgCyl, zgRing, zgRing2);
  const zgN = 60;
  const zgGeo = new THREE.BufferGeometry();
  const zgPos = new Float32Array(zgN * 3);
  for (let i = 0; i < zgN; i++) { const a = Math.random() * 6.28; const r = Math.random() * zgR; zgPos.set([ZG.x + Math.cos(a) * r, Math.random() * 7, ZG.z + Math.sin(a) * r], i * 3); }
  zgGeo.setAttribute('position', new THREE.BufferAttribute(zgPos, 3));
  const zgDots = new THREE.Points(zgGeo, new THREE.PointsMaterial({ map: softDot('170,230,255'), size: 0.25, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(zgDots);
  // 순간이동 패드 두 개
  const padA = new THREE.Vector3(15, 0, 6);
  const padB = new THREE.Vector3(15, 0, -20);
  const pads = [padA, padB].map((p) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.15, 32), new THREE.MeshStandardMaterial({ color: 0x3a4258, metalness: 0.7, roughness: 0.3 }));
    base.position.y = 0.075;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xb48cff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    const beamC = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beamC.position.y = 1.5;
    g.add(base, ring, beamC);
    g.position.copy(p);
    group.add(g);
    return { g, ring, beamC, flash: 0 };
  });
  const flashPad = (i) => { pads[i].flash = 1; glowFx.emit(new THREE.Vector3(pads[i].g.position.x, 0.6, pads[i].g.position.z), { n: 16, spread: 1.4, up: 2.4, size: 0.25, grow: 0.5, life: 1.2 }); };
  const teleport = (from, to) => ({ person, isMe }) => {
    sound.teleport();
    flashPad(from);
    flashPad(to);
    if (person) {
      const dst = pads[to].g.position;
      person.av.root.position.set(dst.x - 2.2, 0, dst.z);
      person.target = null;
      if (person.net && !isMe) person.net.copy(person.av.root.position);
    }
    return { status: '쀼웅! 순간이동했어요' };
  };
  const hotspots = [
    {
      id: 'zerog', label: '무중력 구역', verb: '무중력 구역 가운데로', cool: 2000, pos: new THREE.Vector3(ZG.x + zgR + 1.2, 0, ZG.z), r: 2.2,
      run({ person }) {
        if (person) { person.target = ZG.clone(); }
        return { status: '둥실~ 몸이 떠올라요' };
      },
    },
    { id: 'tpA', label: '순간이동', verb: '저쪽 패드로 순간이동', shared: true, cool: 2500, pos: padA.clone(), r: 1.6, run: teleport(0, 1) },
    { id: 'tpB', label: '순간이동', verb: '저쪽 패드로 순간이동', shared: true, cool: 2500, pos: padB.clone(), r: 1.6, run: teleport(1, 0) },
    {
      id: 'scope', label: '지구 망원경', verb: '망원경으로 지구 보기', cool: 6000, pos: new THREE.Vector3(0, 0, ZF + 3.6),
      run({ isMe }) {
        if (!isMe) return {};
        const target = earth.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(10, 60, 40));
        return { view: { pos: new THREE.Vector3(0, 2.4, ZF + 1.2), look: target, fov: 22, ms: 5500 }, status: '우리가 사는 지구가 보여요' };
      },
    },
  ];
  for (const hs of hotspots) hs.marker = hs.id === 'scope' ? spotMarker(group, hs.pos, 0x7ad7ff) : null;

  const cake = cakeTable(group, { legColor: 0xc9d0de, topColor: 0xeaf0ff });
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group, undefined, [0x7ad7ff, 0xb48cff, 0xffffff, 0xff9ecb, 0x7ad7ff]);

  const pts = postsXZ.map(([x, z]) => new THREE.Vector3(x, H - 0.1, z));
  const spans = [[0, 1, 0.7], [1, 2, 0.7], [2, 3, 0.9], [3, 4, 1.4], [4, 0, 0.9], [0, 3, 1.6], [2, 4, 1.6], [1, 3, 1.4], [1, 4, 1.4]];
  const lights = stringLights(group, pts, spans, { drawPoles: false, wireColor: 0x55607a, bulbColor: 0x8fd0ff });

  // 지나가는 작은 위성
  const sat = new THREE.Group();
  const satBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1.4), trussMat);
  const satWing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.05, 1), panelMat);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a4a }));
  blink.position.y = 0.7;
  sat.add(satBody, satWing, blink);
  group.add(sat);

  return finishWorld(scene, group, {
    id: 'space',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { minX: -PX + 0.6, maxX: PX - 0.6, minZ: ZF + 0.6, maxZ: ZB - 0.6 },
    hotspots,
    roam: 16,
    zones: [{ kind: 'float', test: (p) => (p.x - ZG.x) ** 2 + (p.z - ZG.z) ** 2 < zgR * zgR }],
    entrance: new THREE.Vector3(0, 0, ZB - 1.2),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 0.85,
    palette: { ...PAL, sky: 0x03040c },
    extraUpdate(t, dt) {
      surface.rotation.y += dt * 0.004;
      clouds.rotation.y += dt * 0.006;
      const a = t * 0.05;
      sat.position.set(Math.cos(a) * 70, 25 + Math.sin(a * 2) * 6, Math.sin(a) * 70 - 30);
      sat.rotation.y = -a;
      blink.visible = Math.sin(t * 5) > 0.6;
      const zp = zgGeo.attributes.position.array;
      for (let i = 0; i < zgN; i++) { zp[i * 3 + 1] += dt * (0.3 + (i % 4) * 0.1); if (zp[i * 3 + 1] > 7) zp[i * 3 + 1] = 0; }
      zgGeo.attributes.position.needsUpdate = true;
      zgCyl.material.opacity = 0.07 + Math.sin(t * 1.5) * 0.03;
      for (const pd of pads) {
        pd.flash = Math.max(0, pd.flash - dt * 1.4);
        pd.beamC.material.opacity = pd.flash * 0.5;
        pd.ring.rotation.z = t * 1.5;
        pd.ring.material.color.setHSL(0.75 + Math.sin(t * 2) * 0.05, 0.9, 0.65 + pd.flash * 0.3);
      }
      glowFx.tick(dt);
    },
  });
}
