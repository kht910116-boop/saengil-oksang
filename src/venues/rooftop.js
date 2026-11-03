import * as THREE from 'three';
import { PAL, stars, moon, cakeTable, decoBalloons, stringLights, city, finishWorld } from './common.js';

// 도시 옥상: 불 켜진 도시가 내려다보이는 밤 옥상
export function buildRooftop(scene) {
  const W = 26;
  const D = 20;
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
  tank.position.set(-W / 2 + 2.2, 0, -D / 2 + 2.2);
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
  const hx = W / 2 - 0.6;
  const hz = D / 2 - 0.6;
  const poles = [[-hx, -hz], [hx * 0.35, -hz], [hx, -hz], [hx, 0], [hx, hz], [-hx * 0.35, hz], [-hx, hz], [-hx, 0]].map(([x, z]) => new THREE.Vector3(x, 4.6, z));
  const spans = poles.map((_, i) => [i, (i + 1) % poles.length, 0.7]);
  spans.push([0, 4, 1.4], [2, 6, 1.4], [3, 7, 1.2]);
  const lights = stringLights(group, poles, spans);

  city(group);
  stars(group);
  moon(group, new THREE.Vector3(-70, 60, -110));

  return finishWorld(scene, group, {
    id: 'rooftop',
    floor,
    hemi,
    obstacles,
    balloons,
    ...cake,
    ...lights,
    bounds: { w: W - 1.2, d: D - 1.2 },
    entrance: new THREE.Vector3(0, 0, D / 2 - 1.5),
    cakeTop: new THREE.Vector3(0, 1.9, 0),
    hemiBase: 0.9,
    palette: { ...PAL, sky: 0x1f2547 },
  });
}
