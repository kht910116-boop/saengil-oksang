import * as THREE from 'three';
import { PAL, stars, moon, cakeTable, decoBalloons, stringLights, city, finishWorld, spotMarker, textPlane } from './common.js';
import { sound } from '../audio.js';

// 도시 옥상: 불 켜진 도시가 내려다보이는 밤 옥상
export function buildRooftop(scene) {
  // 넓은 옥상: 가운데 파티, 왼쪽 뒤 댄스 플로어(미러볼), 오른쪽 뒤 네온 포토존, 왼쪽 앞 달 망원경
  const W = 44;
  const D = 34;
  const group = new THREE.Group();
  scene.background = new THREE.Color(0x1f2547);
  scene.fog = new THREE.FogExp2(0x1f2547, 0.011);

  const hemi = new THREE.HemisphereLight(0x7d86c4, 0x2a2235, 0.9);
  const sun = new THREE.DirectionalLight(0xb8c4ff, 0.55);
  sun.position.set(-20, 30, -10);
  group.add(hemi, sun);

  // 콘크리트 바닥
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3f5c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 60 + Math.random() * 30;
    g.fillStyle = `rgba(${v + 20},${v},${v + 35},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  g.strokeStyle = 'rgba(30,24,44,0.55)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(W / 2.5, D / 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  floor.position.y = -0.3;
  group.add(floor);

  // 난간
  const parMat = new THREE.MeshStandardMaterial({ color: 0x3a3150, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x5c5070, roughness: 0.8 });
  for (const [len, off, alongX] of [[W + 0.6, D / 2 + 0.15, true], [W + 0.6, -D / 2 - 0.15, true], [D, W / 2 + 0.15, false], [D, -W / 2 - 0.15, false]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.3, 1.0, alongX ? 0.3 : len), parMat);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.42, 0.1, alongX ? 0.42 : len), capMat);
    if (alongX) { w.position.set(0, 0.5, off); cap.position.set(0, 1.05, off); } else { w.position.set(off, 0.5, 0); cap.position.set(off, 1.05, 0); }
    group.add(w, cap);
  }

  const obstacles = [];
  // 물탱크
  const tank = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 20), new THREE.MeshStandardMaterial({ color: 0x6a8fb0, roughness: 0.6, metalness: 0.2 }));
  body.position.y = 2.1;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x5a7a98 }));
  roof.position.y = 3.45;
  tank.add(body, roof);
  for (const [lx, lz] of [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), parMat);
    leg.position.set(lx, 0.5, lz);
    tank.add(leg);
  }
  tank.position.set(-W / 2 + 2.2, 0, 4);
  group.add(tank);
  obstacles.push({ x: tank.position.x, z: tank.position.z, r: 1.7 });
  // 화분
  const potMat = new THREE.MeshStandardMaterial({ color: 0xb4785a, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a6e, roughness: 0.8 });
  for (const [px, pz] of [[W / 2 - 1.2, -D / 2 + 1.2], [W / 2 - 1.2, D / 2 - 1.2], [-W / 2 + 1.2, D / 2 - 1.2]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 14), potMat);
    pot.position.set(px, 0.35, pz);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), leafMat);
    leaf.position.set(px, 1.2, pz);
    leaf.scale.set(1, 1.2, 1);
    group.add(pot, leaf);
    obstacles.push({ x: px, z: pz, r: 0.8 });
  }

  const cake = cakeTable(group);
  obstacles.push(cake.obstacle);
  const balloons = decoBalloons(group);

  // 전구 줄: 모서리와 좌우 변 가운데 기둥(카메라를 가리지 않게)
  const hx = 12.4; // 전구 줄은 가운데 파티 구역 위에만
  const hz = 9.4;
  const poles = [[-hx, -hz], [hx * 0.35, -hz], [hx, -hz], [hx, 0], [hx, hz], [-hx * 0.35, hz], [-hx, hz], [-hx, 0]].map(([x, z]) => new THREE.Vector3(x, 4.6, z));
  const spans = poles.map((_, i) => [i, (i + 1) % poles.length, 0.7]);
  spans.push([0, 4, 1.4], [2, 6, 1.4], [3, 7, 1.2]);
  const lights = stringLights(group, poles, spans);

  city(group, { distMin: 40, distMax: 90 });
  stars(group);
  const moonM = moon(group, new THREE.Vector3(-70, 60, -110));

  // ── 놀거리 ──
  // 댄스 플로어: 누군가 올라서면 바닥 칸이 번쩍이고 미러볼이 돈다
  const DF = new THREE.Vector3(-17, 0, -8.5);
  const dfN = 6;
  const tiles = [];
  for (let i = 0; i < dfN; i++) {
    for (let j = 0; j < dfN; j++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 1.25), new THREE.MeshStandardMaterial({ color: 0x222233, emissive: 0x000000, roughness: 0.3 }));
      m.position.set(DF.x + (i - (dfN - 1) / 2) * 1.32, 0.03, DF.z + (j - (dfN - 1) / 2) * 1.32);
      group.add(m);
      tiles.push(m);
    }
  }
  const half = (dfN * 1.32) / 2;
  const ballPivot = new THREE.Group();
  ballPivot.position.set(DF.x, 6, DF.z);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15, flatShading: true, emissive: 0x333344 }));
  ballPivot.add(ball);
  const discoLights = [0xff4fa0, 0x4fd8ff, 0xffd34f].map((c, i) => {
    const l = new THREE.SpotLight(c, 0, 14, 0.35, 0.6, 1.2);
    l.position.copy(ballPivot.position);
    group.add(l, l.target);
    return l;
  });
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), new THREE.MeshBasicMaterial({ color: 0x1a1626 }));
  wire.position.set(DF.x, 7.6, DF.z);
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 1, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x3a3150 }));
  gantry.position.set(DF.x, 9.1, DF.z);
  group.add(ballPivot, wire, gantry);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 9.1, 0.2), gantry.material);
    leg.position.set(DF.x + sx * (half + 0.5), 4.55, DF.z);
    group.add(leg);
  }
  let discoBoost = 0;
  // 네온 포토존
  const PZ = new THREE.Vector3(14, 0, -12);
  const frame = new THREE.Group();
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff7ab8 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 10, 48, Math.PI), neonMat);
  arch.position.y = 2.6;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 8), neonMat);
    post.position.set(sx * 2.2, 1.3, 0);
    frame.add(post);
  }
  const sign = textPlane('생일 축하해', { w: 3.6, h: 0.9, color: '#ff7ab8' });
  sign.position.y = 5.3;
  const heart = textPlane('♥', { w: 1.2, h: 1.2, color: '#ff4f7a' });
  heart.position.set(0, 3.9, 0);
  const neonLight = new THREE.PointLight(0xff7ab8, 2.2, 9, 1.6);
  neonLight.position.set(0, 2.5, 1.2);
  frame.add(arch, sign, heart, neonLight);
  frame.position.copy(PZ);
  group.add(frame);
  // 달 망원경
  const scope = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 1.7, 12), new THREE.MeshStandardMaterial({ color: 0xd6dbe6, metalness: 0.6, roughness: 0.3 }));
  tube.rotation.z = 0.9;
  tube.rotation.y = -0.6;
  tube.position.y = 1.4;
  const tri = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3150, wireframe: true }));
  tri.position.y = 0.55;
  scope.add(tube, tri);
  scope.position.set(-16, 0, 11);
  group.add(scope);
  obstacles.push({ x: -16, z: 11, r: 0.7 });

  const hotspots = [
    {
      id: 'disco', label: '댄스 플로어', verb: '음악 크게! 미러볼 켜기', shared: true, cool: 5000, pos: new THREE.Vector3(DF.x + half + 1.2, 0, DF.z),
      run({ person }) {
        discoBoost = 1;
        sound.partyHorn();
        if (person) person.target = DF.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
        return { status: '댄스 타임! 플로어 위에서 들썩여요' };
      },
    },
    {
      id: 'photo', label: '네온 포토존', verb: '포토존에서 사진 찍기', cool: 6000, pos: PZ.clone().add(new THREE.Vector3(0, 0, 0.4)), r: 2.2,
      run({ person, isMe }) {
        if (!isMe || !person) return {};
        person.av.root.position.set(PZ.x, 0, PZ.z + 0.4);
        person.target = null;
        person.av.faceCamera = true;
        setTimeout(() => { person.av.faceCamera = false; person.av.gesture('heart'); }, 900);
        return { view: { pos: new THREE.Vector3(PZ.x, 2.4, PZ.z + 6.5), look: new THREE.Vector3(PZ.x, 2.4, PZ.z), fov: 50, ms: 3200 }, photo: '네온 포토존' };
      },
    },
    {
      id: 'scope', label: '달 망원경', verb: '망원경으로 달 보기', cool: 6000, pos: new THREE.Vector3(-14.6, 0, 11),
      run({ isMe }) {
        if (!isMe) return {};
        return { view: { pos: new THREE.Vector3(-16, 1.9, 11), look: moonM.position.clone(), fov: 6, ms: 5500 }, status: '달이 이렇게 가까이!' };
      },
    },
  ];
  for (const hs of hotspots) hs.marker = spotMarker(group, hs.pos, hs.id === 'photo' ? 0xff7ab8 : 0xffc46b);
  const onFloor = (p) => Math.abs(p.x - DF.x) < half && Math.abs(p.z - DF.z) < half;

  return finishWorld(scene, group, {
    id: 'rooftop',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { w: W - 1.2, d: D - 1.2 },
    hotspots,
    roam: 15,
    zones: [{ kind: 'dance', test: onFloor }],
    extraUpdate(t, dt, ctx) {
      const dancers = (ctx.people || []).filter((p) => onFloor(p.av.root.position)).length;
      discoBoost = Math.max(0, discoBoost - dt / 10);
      const k = Math.min(1, dancers * 0.5 + discoBoost);
      tiles.forEach((m, i) => {
        const on = Math.sin(t * 6 + i * 1.7) > 0.3;
        m.material.emissive.setHSL((i * 0.13 + t * 0.2) % 1, 0.9, on ? 0.35 * k + 0.04 : 0.03);
      });
      ball.rotation.y = t * (0.4 + k * 1.2);
      discoLights.forEach((l, i) => {
        l.intensity = 30 * k;
        const a = t * (0.8 + i * 0.3) + i * 2.1;
        l.target.position.set(DF.x + Math.cos(a) * 3, 0, DF.z + Math.sin(a) * 3);
      });
      neonLight.intensity = 2 + Math.sin(t * 3) * 0.3 + (Math.sin(t * 17) > 0.97 ? -1.5 : 0); // 가끔 깜빡이는 네온
    },
    entrance: new THREE.Vector3(0, 0, D / 2 - 1.5),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 0.9,
    palette: { ...PAL, sky: 0x1f2547 },
  });
}
