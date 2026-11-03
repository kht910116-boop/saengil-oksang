import * as THREE from 'three';
import { PAL, skyDome, stars, cakeTable, decoBalloons, stringLights, finishWorld, spotMarker, puffs } from './common.js';
import { sound } from '../audio.js';

// 구름 위 열기구 광장: 노을 진 구름 바다 위에 떠 있는 둥근 광장, 주변을 열기구들이 둥실 떠다닌다.
function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#e9d9c4';
  g.fillRect(0, 0, 512, 512);
  // 동심원 돌바닥
  for (let r = 24; r < 256; r += 24) {
    const n = Math.round((r * Math.PI * 2) / 40);
    g.strokeStyle = 'rgba(150,110,90,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r / 24) * 0.3;
      g.beginPath();
      g.moveTo(256 + Math.cos(a) * (r - 24), 256 + Math.sin(a) * (r - 24));
      g.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r);
      g.stroke();
      const v = Math.random() * 20;
      g.fillStyle = `rgba(${200 + v},${170 + v},${150 + v},0.25)`;
      g.beginPath();
      g.arc(256 + Math.cos(a + 0.05) * (r - 12), 256 + Math.sin(a + 0.05) * (r - 12), 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // 가운데 별 무늬
  g.fillStyle = '#d98b7a';
  g.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const rr = k % 2 ? 30 : 70;
    g.lineTo(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cloud(scale, mat) {
  const g = new THREE.Group();
  const n = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), mat);
    const r = (0.8 + Math.random() * 0.9) * scale;
    s.scale.set(r * 1.3, r * 0.75, r);
    s.position.set((i - n / 2) * scale * 0.9 + Math.random() * scale * 0.4, Math.random() * scale * 0.35, (Math.random() - 0.5) * scale);
    g.add(s);
  }
  return g;
}

function hotAirBalloon(colA, colB) {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI;
    const r = Math.sin(a) * (t < 0.55 ? 1 : 0.85 + 0.15 * Math.cos((t - 0.55) * 4)) * 2.4 + (t > 0.85 ? -0.3 * (t - 0.85) * 6 : 0);
    prof.push(new THREE.Vector2(Math.max(0.35, r), 5.2 - t * 5.2));
  }
  prof[prof.length - 1].x = 0.45;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const cg = c.getContext('2d');
  for (let k = 0; k < 8; k++) {
    cg.fillStyle = k % 2 ? colA : colB;
    cg.fillRect(k * 32, 0, 32, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  env.position.y = 1.4;
  const glow = new THREE.PointLight(0xffa640, 0.9, 6, 2);
  glow.position.y = 1.6;
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.9 }));
  basket.position.y = 0;
  g.add(env, glow, basket);
  for (const [x, z] of [[0.35, 0.35], [-0.35, 0.35], [0.35, -0.35], [-0.35, -0.35]]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), new THREE.MeshBasicMaterial({ color: 0x3a2a20 }));
    rope.position.set(x, 0.95, z);
    g.add(rope);
  }
  return g;
}

export function buildSky(scene) {
  const R = 24; // 넓은 광장: 가운데 파티, 둘레에 탈 수 있는 열기구 3대, 뒤쪽 소원의 종, 구름 트램펄린 2개
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x3a2a5c);
  scene.fog = new THREE.FogExp2(0x8a5a7c, 0.0045);
  skyDome(group, '#141537', '#ffae7a', { mid: '#7a3f78' });

  const hemi = new THREE.HemisphereLight(0xffc6b0, 0x6a4a8a, 1.0);
  const sun = new THREE.DirectionalLight(0xffa070, 0.9);
  sun.position.set(80, 20, -60);
  group.add(hemi, sun);
  // 지평선에 걸린 노을 해
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: 0xffc27a, fog: false }));
  sunDisc.position.set(160, -2, -220);
  sunDisc.lookAt(0, 0, 0);
  group.add(sunDisc);

  // 떠 있는 광장: 돌바닥 + 아래쪽 섬 바위
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.6, 56), [
    new THREE.MeshStandardMaterial({ color: 0xcbb59c, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0xcbb59c }),
  ]);
  floor.position.y = -0.3;
  group.add(floor);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(R, 9, 12, 3), new THREE.MeshStandardMaterial({ color: 0x8a6a7a, roughness: 1, flatShading: true }));
  rock.rotation.x = Math.PI;
  rock.position.y = -5.1;
  group.add(rock);
  // 바닥 둘레 꽃 화단과 낮은 난간(입구 쪽은 비움)
  const railMat = new THREE.MeshStandardMaterial({ color: 0xfaf3e8, roughness: 0.5 });
  const flowerCols = [0xff8fab, 0xffd166, 0xffffff, 0xc9a7ff];
  const N = 76;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.16) continue;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6), railMat);
    post.position.set(Math.cos(a) * (R - 0.25), 0.45, Math.sin(a) * (R - 0.25));
    group.add(post);
    const a2 = ((i + 1) / N) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a2 - Math.PI / 2), Math.cos(a2 - Math.PI / 2))) < 0.16) continue;
    const mid = (a + a2) / 2;
    const len = 2 * (R - 0.25) * Math.sin((a2 - a) / 2);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
    bar.position.set(Math.cos(mid) * (R - 0.25), 0.9, Math.sin(mid) * (R - 0.25));
    bar.rotation.y = -mid + Math.PI / 2;
    group.add(bar);
    if (i % 2 === 0) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: flowerCols[i % 4], roughness: 0.7, flatShading: true }));
      f.position.set(Math.cos(mid) * (R - 0.7), 0.2, Math.sin(mid) * (R - 0.7));
      group.add(f);
    }
  }

  const obstacles = [];
  // 탈 수 있는 열기구 3대
  const rideDefs = [['ride1', -16, -10, '#ff7a8a', '#ffe08a'], ['ride2', 16, -10, '#5ec8ff', '#ffffff'], ['ride3', -16, 9, '#b48cff', '#ffc6e0']];
  const docks = rideDefs.map(([id, x, z, a, b]) => {
    const hb = hotAirBalloon(a, b);
    hb.scale.setScalar(1.15);
    hb.position.set(x, 0.3, z);
    group.add(hb);
    obstacles.push({ x, z, r: 1.3 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xd98b7a, roughness: 0.8 }));
    pad.position.set(x, 0.06, z);
    group.add(pad);
    return { id, hb, home: new THREE.Vector3(x, 0.3, z), ride: null, glow: hb.children.find((c) => c.isLight) };
  });
  // 소원의 종 탑(뒤쪽)
  const bellTower = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xfaf3e8, roughness: 0.6 });
  for (const x of [-1.3, 1.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 5, 12), towerMat);
    col.position.set(x, 2.5, 0);
    bellTower.add(col);
  }
  const roofT = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0xd98b7a, roughness: 0.7 }));
  roofT.position.y = 5.8;
  roofT.rotation.y = Math.PI / 4;
  const beamT = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 0.3), towerMat);
  beamT.position.y = 4.9;
  const bellPivot = new THREE.Group();
  bellPivot.position.y = 4.8;
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 1.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  bell.position.y = -0.6;
  bellPivot.add(bell);
  bellTower.add(roofT, beamT, bellPivot);
  bellTower.position.set(0, 0, -19);
  group.add(bellTower);
  obstacles.push({ x: -1.3, z: -19, r: 0.5 }, { x: 1.3, z: -19, r: 0.5 });
  let bellSwing = 0;
  // 구름 트램펄린 2개
  const trampDefs = [[16, 8, 2.6], [8, 16, 2.4]];
  for (const [x, z, r] of trampDefs) {
    const c = cloud(1.1, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffd6e8, emissiveIntensity: 0.35 }));
    c.scale.set(r * 0.9, 0.35, r * 0.9);
    c.position.set(x, 0.05, z);
    group.add(c);
  }
  // 벤치
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x9a6a4c, roughness: 0.8 });
  for (const [x, z, ry] of [[9, -6, -0.6], [-9, -7, 0.6], [-6, 13, 2.4]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.7), benchMat);
    b.position.set(x, 0.4, z);
    b.rotation.y = ry;
    group.add(b);
    obstacles.push({ x, z, r: 1.2 });
  }

  const cake = cakeTable(group, { legColor: 0x9a6a4c });
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group, undefined, [0xff9eb5, 0xffd97a, 0xffffff, 0xffb37a, PAL.lavender]);

  // 둘레 기둥 8개에 전구 줄
  const poleR = 11;
  const poles = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8 + Math.PI / 2;
    poles.push(new THREE.Vector3(Math.cos(a) * poleR, 4.6, Math.sin(a) * poleR));
  }
  const spans = poles.map((_, i) => [i, (i + 1) % poles.length, 0.7]);
  spans.push([0, 4, 1.4], [2, 6, 1.4], [1, 5, 1.3]);
  const lights = stringLights(group, poles, spans, { poleColor: 0xf5ead8 });

  // 구름 바다(아래)와 떠다니는 구름(옆)
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xfff2f0, roughness: 1, emissive: 0xc07a9a, emissiveIntensity: 0.35 });
  const clouds = [];
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 150;
    const c = cloud(3 + Math.random() * 5, cloudMat);
    c.position.set(Math.cos(a) * d, -12 - Math.random() * 10, Math.sin(a) * d);
    group.add(c);
    clouds.push(c);
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 90;
    const c = cloud(2 + Math.random() * 3, cloudMat);
    c.position.set(Math.cos(a) * d, 4 + Math.random() * 25, Math.sin(a) * d);
    group.add(c);
    clouds.push(c);
  }

  // 주변을 떠다니는 열기구들
  const fliers = [];
  const pairs = [['#ff6b6b', '#ffd166'], ['#5ec8ff', '#ffffff'], ['#b48cff', '#ffc6e0'], ['#7ae0a0', '#fff1a8'], ['#ff9f5a', '#ffffff'], ['#ff7ab8', '#7ad7ff']];
  pairs.forEach(([a, b], i) => {
    const hb = hotAirBalloon(a, b);
    const ang = (i / pairs.length) * Math.PI * 2 + 0.3;
    const dist = 36 + (i % 3) * 14;
    hb.scale.setScalar(1.6 + (i % 2) * 0.8);
    hb.position.set(Math.cos(ang) * dist, 2 + (i % 3) * 5, Math.sin(ang) * dist);
    hb.userData = { ang, dist, baseY: hb.position.y, ph: i * 1.1 };
    group.add(hb);
    fliers.push(hb);
  });

  stars(group, { count: 500, minY: 40, spread: 0.3 });

  // ── 놀거리 ──
  const petals = puffs(group, { color: '255,180,200' });
  const hotspots = [
    ...docks.map((dk) => ({
      id: dk.id, label: '열기구', verb: '열기구 타기', shared: true, cool: 18000,
      pos: dk.home.clone().add(new THREE.Vector3(0, 0, 2.3)),
      labelY: 2.4,
      run({ person }) {
        if (dk.ride || !person) return {};
        dk.ride = { person, t: 0, burn: 0 };
        person.busyUntil = performance.now() + 17000;
        person.target = null;
        sound.burner();
        return { status: '열기구가 하늘로 떠올라요' };
      },
    })),
    {
      id: 'bell', label: '소원의 종', verb: '소원의 종 치기', shared: true, cool: 4000,
      pos: new THREE.Vector3(0, 0, -16.6), labelY: 2.2,
      run({ confetti }) {
        sound.bigBell();
        bellSwing = 1;
        petals.emit(new THREE.Vector3(0, 4.5, -19), { n: 22, spread: 2.5, up: 0.8, size: 0.3, grow: 0.4, life: 3 });
        confetti?.burst(new THREE.Vector3(0, 5, -18), 90);
        return { status: '댕~ 소원이 하늘에 닿았어요' };
      },
    },
  ];
  for (const hs of hotspots) hs.marker = spotMarker(group, hs.pos, 0xffb3c8);
  const trampTest = (p) => trampDefs.some(([x, z, r]) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);

  return finishWorld(scene, group, {
    id: 'sky',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { w: (R - 1.2) * 2, d: (R - 1.2) * 2, r: R - 1.2 },
    hotspots,
    roam: 15,
    zones: [{ kind: 'bounce', test: trampTest }],
    entrance: new THREE.Vector3(0, 0, R - 1.6),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 1.0,
    palette: { ...PAL, sky: 0x3a2a5c },
    extraUpdate(t, dt) {
      for (const hb of fliers) {
        const u = hb.userData;
        u.ang += dt * 0.012;
        hb.position.set(Math.cos(u.ang) * u.dist, u.baseY + Math.sin(t * 0.5 + u.ph) * 1.2, Math.sin(u.ang) * u.dist);
        hb.rotation.y += dt * 0.05;
      }
      for (let i = 0; i < clouds.length; i++) clouds[i].position.x += Math.sin(i) * dt * 0.15;
      // 열기구 타기: 타고 → 위로 → 둥실 → 내려와 내린다(약 16초)
      const now = performance.now();
      for (const dk of docks) {
        const r = dk.ride;
        if (!r) { dk.hb.position.set(dk.home.x, dk.home.y + Math.sin(t * 0.9 + dk.home.x) * 0.08, dk.home.z); continue; }
        r.t += dt;
        const p = r.person;
        const aborted = !(p.busyUntil > now); // 점등식 등으로 중간에 끝난 경우
        const k = r.t;
        let y = 0.3;
        if (k < 1.5) y = 0.3;
        else if (k < 7) y = 0.3 + THREE.MathUtils.smootherstep(k, 1.5, 7) * 16;
        else if (k < 10) y = 16.3 + Math.sin((k - 7) * 1.2) * 0.4;
        else y = 16.3 - THREE.MathUtils.smootherstep(k, 10, 16) * 16;
        const drift = k > 1.5 && k < 16 ? Math.sin((k - 1.5) / 14.5 * Math.PI) * 4 : 0;
        dk.hb.position.set(dk.home.x - Math.sign(dk.home.x) * drift, y, dk.home.z);
        if (!aborted) {
          p.av.root.position.set(dk.hb.position.x, 0, dk.hb.position.z);
          p.av.lift = y + 0.05;
          p.speed = 0;
        }
        r.burn -= dt;
        if (k > 1.5 && k < 7 && r.burn <= 0) { r.burn = 2.5; sound.burner(); }
        if (dk.glow) dk.glow.intensity = 0.9 + (k > 1.5 && k < 7 ? 2.5 + Math.random() : 0);
        if (k > 16.5 || aborted) {
          if (!aborted) { p.av.root.position.set(dk.home.x, 0, dk.home.z + 2.4); p.busyUntil = 0; }
          p.av.lift = 0;
          dk.ride = null;
        }
      }
      if (bellSwing > 0) { bellSwing = Math.max(0, bellSwing - dt / 3); bellPivot.rotation.x = Math.sin(t * 7) * 0.5 * bellSwing; }
      petals.tick(dt);
    },
  });
}
