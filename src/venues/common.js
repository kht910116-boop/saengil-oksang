import * as THREE from 'three';
import { mergeStatic, mergeColored } from '../merge.js';
export { mergeStatic };

// 여러 파티 장소가 같이 쓰는 3D 부품: 하늘, 별, 달, 케이크 테이블, 풍선, 전구 줄, 도시 야경
export const PAL = {
  bulb: 0xffc46b,
  pink: 0xf29bb3,
  mint: 0x8fd3c1,
  paper: 0xfbf4e8,
  lavender: 0xb9a6f2,
  wire: 0x1a1626,
};

// 위아래 색이 이어지는 하늘 공(안쪽 면)
export function skyDome(group, top, bottom, { radius = 320, mid = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  if (mid) grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  group.add(m);
  return m;
}

export function stars(group, { count = 900, radius = 180, minY = 10, size = 0.9, color = 0xfff3dc, spread = 0.45 } = {}) {
  const sp = [];
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.random() * Math.PI * spread;
    sp.push(Math.cos(th) * Math.sin(ph) * radius, Math.cos(ph) * radius * 0.9 + minY, Math.sin(th) * Math.sin(ph) * radius);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, fog: false }));
  group.add(pts);
  return pts;
}

export function moon(group, pos, r = 5, color = 0xfff1d0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, fog: false }));
  m.position.copy(pos);
  group.add(m);
  return m;
}

// 케이크 테이블: 식탁보를 두른 둥근 테이블 위 3단 케이크(크림이 흘러내리고 딸기·마카롱·장미 크림), 접시와 컵.
// 움직이지 않는 부분은 한 덩어리로 합치고, 불꽃(흔들림·끄기)만 따로 둔다.
export const CAKE = { tableR: 1.6, topY: 1.92, flameY: 2.14 }; // 다른 코드가 위치를 맞출 때 쓰는 치수
export function cakeTable(group, { legColor = 0x3a3150, topColor = PAL.paper, at = new THREE.Vector3() } = {}) {
  const table = new THREE.Group();
  const deco = new THREE.Group();
  const M = (color, emissive = 0.1, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: rough, metalness: metal });
  const clothMat = M(topColor, 0.08, 0.9);
  const R = CAKE.tableR;
  // 테이블: 상판 + 바닥까지 내려오는 식탁보(물결 주름) + 아래 레이스 띠
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.08, 40), clothMat);
  top.position.y = 0.8;
  const skirtGeo = new THREE.CylinderGeometry(R + 0.02, R + 0.18, 0.78, 48, 1, true);
  const sp = skirtGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 18) * 0.025 * (0.5 - sp.getY(i)); // 아래로 갈수록 주름이 깊다
    sp.setX(i, x * k);
    sp.setZ(i, z * k);
  }
  skirtGeo.computeVertexNormals();
  const skirtMat = M(0xf7d6df, 0.1, 0.9);
  skirtMat.side = THREE.DoubleSide;
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.y = 0.39;
  const lace = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.03, 6, 48), M(0xffffff, 0.2));
  lace.rotation.x = Math.PI / 2;
  lace.position.y = 0.76;
  deco.add(top, skirt, lace);
  // 3단 케이크
  const tiers = [[0.85, 0.42, PAL.pink], [0.64, 0.36, PAL.paper], [0.44, 0.3, PAL.pink]];
  let y = 0.84;
  const cream = M(0xfff4e6, 0.06, 0.5);
  const berry = M(0xe5484d, 0.15, 0.35);
  const macCols = [PAL.mint, PAL.lavender, 0xffd97a];
  tiers.forEach(([r, h, c], ti) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), M(c, 0.05, 0.55));
    tier.position.y = y + h / 2;
    deco.add(tier);
    // 위 가장자리에서 흘러내리는 크림
    const drips = Math.round(r * 22);
    for (let i = 0; i < drips; i++) {
      const a = (i / drips) * Math.PI * 2;
      const len = 0.06 + ((i * 37) % 7) * 0.018;
      const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, len, 3, 6), cream);
      d.position.set(Math.cos(a) * (r + 0.005), y + h - len / 2 - 0.02, Math.sin(a) * (r + 0.005));
      deco.add(d);
    }
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.05, 40), cream);
    lid.position.y = y + h - 0.01;
    deco.add(lid);
    // 아래 테두리 장미 크림
    const ros = Math.round(r * 26);
    for (let i = 0; i < ros; i++) {
      const a = (i / ros) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), cream);
      b.position.set(Math.cos(a) * r, y + 0.03, Math.sin(a) * r);
      deco.add(b);
    }
    // 단 위 장식: 1·2단은 딸기와 마카롱을 번갈아, 3단은 딸기 고리
    const n = ti === 2 ? 8 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ti * 0.3;
      const rr = ti === 2 ? r * 0.72 : (r + tiers[ti + 1][0]) / 2;
      const px = Math.cos(a) * rr;
      const pz = Math.sin(a) * rr;
      if (ti < 2 && i % 2) {
        const mac = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), M(macCols[(i + ti) % 3], 0.15));
        mac.rotation.z = Math.PI / 2;
        mac.rotation.y = -a;
        mac.position.set(px, y + h + 0.06, pz);
        deco.add(mac);
      } else {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 8), berry);
        s.rotation.x = Math.PI;
        s.position.set(px, y + h + 0.07, pz);
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.03, 5), M(0x5aa060, 0.1));
        leaf.position.set(px, y + h + 0.135, pz);
        deco.add(s, leaf);
      }
    }
    y += h;
  });
  // 금빛 축하 토퍼
  const gold = M(0xffd34d, 0.35, 0.3, 0.6);
  for (const s of [-1, 1]) {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 5), gold);
    stick.position.set(s * 0.22, y + 0.17, -0.18);
    deco.add(stick);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), gold);
  star.position.set(0, y + 0.45, -0.18);
  star.scale.z = 0.4;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.02), gold);
  bar.position.set(0, y + 0.32, -0.18);
  deco.add(star, bar);
  // 접시에 놓인 케이크 조각·포크·컵(테이블 둘레)
  const plate = M(0xffffff, 0.1, 0.3);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.1 });
  const juice = M(0xff8fa8, 0.3, 0.2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const px = Math.cos(a) * 1.22;
    const pz = Math.sin(a) * 1.22;
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.02, 20), plate);
    pl.position.set(px, 0.85, pz);
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 3, 1, false, 0, Math.PI / 3.2), M(PAL.pink, 0.12));
    slice.position.set(px, 0.92, pz);
    slice.rotation.y = -a;
    const sb = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 6), berry);
    sb.rotation.x = Math.PI;
    sb.position.set(px, 1.0, pz);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.006, 0.16), M(0xd8dde8, 0.1, 0.3, 0.8));
    fork.position.set(px + Math.cos(a + 1.5) * 0.12, 0.865, pz + Math.sin(a + 1.5) * 0.12);
    fork.rotation.y = -a;
    const cx = Math.cos(a + 0.38) * 1.3;
    const cz = Math.sin(a + 0.38) * 1.3;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.13, 12), cupMat);
    cup.position.set(cx, 0.905, cz);
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.08, 12), juice);
    drink.position.set(cx, 0.885, cz);
    deco.add(pl, slice, sb, fork, cup, drink);
  }
  table.add(mergeColored(deco));
  // 초 5개(줄무늬)와 불꽃: 맨 윗단 위
  const flames = [];
  const candleCols = [PAL.mint, PAL.lavender, 0xffd97a, PAL.mint, PAL.lavender];
  const candleTop = y;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const cx = Math.cos(a) * 0.24;
    const cz = Math.sin(a) * 0.24 + 0.05;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), M(candleCols[i], 0.2));
    candle.position.set(cx, candleTop + 0.11, cz);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.007, 4, 10), M(0xffffff, 0.3));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(cx, candleTop + 0.13, cz);
    table.add(candle, stripe);
    // 불꽃은 심지 끝을 축으로 눕고 늘어나도록 아래쪽을 원점으로 둔다
    const flameGeo = new THREE.SphereGeometry(0.045, 10, 8);
    flameGeo.translate(0, 0.045, 0);
    const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    flame.scale.y = 1.6;
    flame.position.set(cx, candleTop + 0.23, cz);
    table.add(flame);
    flames.push(flame);
  }
  const candleLight = new THREE.PointLight(0xffb45e, 3.2, 10, 1.7);
  candleLight.position.y = candleTop + 0.55;
  table.add(candleLight);
  table.position.copy(at);
  group.add(table);
  return { flames, candleLight, obstacle: { x: at.x, z: at.z, r: R + 0.4 } };
}

// 테이블 옆 장식 풍선
export function decoBalloons(group, at = new THREE.Vector3(2.5, 0, -1.6), colors = [PAL.pink, PAL.mint, 0xffd97a, PAL.pink, PAL.lavender]) {
  const list = [];
  colors.forEach((col, i) => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), new THREE.MeshStandardMaterial({ color: col, roughness: 0.35 }));
    b.scale.y = 1.18;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 8), b.material);
    knot.position.y = -0.52;
    knot.rotation.x = Math.PI;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2.4, 4), new THREE.MeshBasicMaterial({ color: 0xe8e0f0 }));
    str.position.y = -1.75;
    g.add(b, knot, str);
    const base = new THREE.Vector3(at.x + (i % 3) * 0.45, 3.1 + (i % 2) * 0.5, at.z + Math.floor(i / 3) * 0.6);
    g.position.copy(base);
    g.userData.base = base;
    g.userData.phase = i * 1.3;
    group.add(g);
    list.push(g);
  });
  return list;
}

// 두 점 사이 처진 전선 곡선
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

// 전구 줄: 기둥(또는 고정점) 사이에 전선을 걸고 전구와 등불 자리를 만든다
export function stringLights(group, polePts, spans, { drawPoles = true, poleColor = 0x2c2640, wireColor = PAL.wire, bulbColor = PAL.bulb, spacing = 0.9 } = {}) {
  if (drawPoles) {
    const poleMat = new THREE.MeshStandardMaterial({ color: poleColor, roughness: 0.7 });
    for (const p of polePts) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, p.y, 8), poleMat);
      pole.position.set(p.x, p.y / 2, p.z);
      group.add(pole);
    }
  }
  const wireMat = new THREE.MeshBasicMaterial({ color: wireColor });
  const pts = [];
  const lanternSlots = [];
  for (const [ia, ib, sag] of spans) {
    const a = polePts[ia];
    const b = polePts[ib];
    const curve = sagCurve(a, b, sag);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.018, 4, false), wireMat));
    const n = Math.max(6, Math.round(a.distanceTo(b) / spacing));
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n);
      pts.push(p.clone().add(new THREE.Vector3(0, -0.1, 0)));
      // 짝수 전구 아래가 1순위 자리, 홀수 전구 아래는 자리가 찼을 때 쓰는 2순위 자리
      lanternSlots.push({ pos: p.clone().add(new THREE.Vector3(0, -0.55, 0)), tier: i % 2 });
    }
  }
  // 전구 전부를 한 번에 그린다(휴대폰 부담을 줄이려고). 각 전구 밝기는 색으로 표현하고,
  // 점등 코드가 쓰던 bulb.material.emissiveIntensity 를 그대로 쓸 수 있게 작은 대리 객체를 돌려준다.
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
  inst.frustumCulled = false;
  const dim = new THREE.Color(0x3a2f20);
  const glow = new THREE.Color(bulbColor);
  const tmpC = new THREE.Color();
  const m4 = new THREE.Matrix4();
  const bulbs = pts.map((p, i) => {
    m4.makeTranslation(p.x, p.y, p.z);
    inst.setMatrixAt(i, m4);
    let level = 0;
    const setLevel = (v) => {
      level = v;
      tmpC.copy(glow).multiplyScalar(v * 0.85).add(dim);
      inst.setColorAt(i, tmpC);
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    };
    setLevel(0.18);
    return { position: p, userData: { order: i }, material: { get emissiveIntensity() { return level; }, set emissiveIntensity(v) { setLevel(v); } } };
  });
  group.add(inst);
  return { bulbs, lanternSlots };
}

export function windowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 128; y += 12) {
    for (let x = 5; x < 64; x += 10) {
      if (Math.random() < 0.38) {
        g.fillStyle = Math.random() < 0.8 ? `rgba(255,${190 + Math.random() * 40},${110 + Math.random() * 40},1)` : 'rgba(170,200,255,1)';
        g.fillRect(x, y, 6, 7);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// 불 켜진 건물들(도시 야경). arc로 일부 방향에만 둘 수 있다.
// 건물마다 창문 무늬 위치를 다르게 하되, 텍스처 하나를 같이 쓰고 한 덩어리로 합쳐 한 번에 그린다.
export function city(group, { count = 70, distMin = 34, distMax = 79, yBase = -18, hMax = 40, arc = [0, Math.PI * 2], color = 0x232846 } = {}) {
  const winTex = windowTexture();
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
  const holder = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const ang = arc[0] + (i / count) * (arc[1] - arc[0]) + Math.random() * 0.05;
    const dist = distMin + Math.random() * (distMax - distMin);
    const w = 4 + Math.random() * 6;
    const h = 6 + Math.random() * (dist > (distMin + distMax) / 2 ? hMax : hMax * 0.55);
    const d = 4 + Math.random() * 6;
    const geo = new THREE.BoxGeometry(w, h, d);
    // 창문 크기는 건물 크기에 맞추고(반복), 시작 위치는 건물마다 다르게(어긋남)
    const uv = geo.attributes.uv;
    const ox = Math.random();
    const oy = Math.random();
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w / 4) + ox, uv.getY(k) * (h / 8) + oy);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(ang) * dist, h / 2 + yBase, Math.sin(ang) * dist);
    m.rotation.y = -ang;
    holder.add(m);
  }
  group.add(mergeStatic(holder));
}

// 놀거리 표시: 바닥에서 은은하게 숨 쉬는 빛 고리
export function spotMarker(group, pos, color = 0xffc46b) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, (pos.floorY || 0) + 0.03, pos.z);
  group.add(m);
  return m;
}

// 부드러운 점 텍스처(김·연기·반짝이용)
export function softDot(rgba = '255,255,255') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgba},0.95)`);
  grad.addColorStop(0.5, `rgba(${rgba},0.35)`);
  grad.addColorStop(1, `rgba(${rgba},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 퍼지며 사라지는 점들(뱃고동 김, 순간이동 빛, 눈 가루 등). 장소 update에서 tick(dt)을 불러야 움직인다.
export function puffs(group, { color = '235,235,245', additive = false } = {}) {
  const tex = softDot(color);
  const list = [];
  return {
    emit(pos, { n = 8, spread = 0.3, up = 1.2, size = 0.4, grow = 1.6, life = 2.2, vel = null } = {}) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
        m.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread);
        m.scale.setScalar(size);
        const v = vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 0.6, up * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * 0.6);
        if (vel) v.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
        m.userData = { v, age: -i * 0.05, life: life * (0.8 + Math.random() * 0.4), size, grow };
        group.add(m);
        list.push(m);
      }
    },
    tick(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        const u = m.userData;
        u.age += dt;
        if (u.age < 0) continue;
        const k = u.age / u.life;
        m.position.addScaledVector(u.v, dt);
        u.v.multiplyScalar(1 - dt * 0.6);
        m.scale.setScalar(u.size * (1 + k * u.grow));
        m.material.opacity = Math.min(1, u.age * 5) * (1 - k) * 0.8;
        if (k >= 1) { group.remove(m); m.material.dispose(); list.splice(i, 1); }
      }
    },
  };
}

// 글씨 판(네온 간판 등)
export function textPlane(text, { w = 4, h = 1, color = '#ff7ab8', font = 'Jua', glow = 18, solid = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round(1024 * (h / w));
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${Math.round(c.height * 0.62)}px ${font}, sans-serif`;
  if (solid) { // 밝은 바탕 위 또렷한 글씨(현수막)
    g.fillStyle = color;
    g.lineWidth = c.height * 0.05;
    g.strokeStyle = '#ffffff';
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillText(text, c.width / 2, c.height / 2);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  }
  g.shadowColor = color;
  g.shadowBlur = glow;
  g.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) g.fillText(text, c.width / 2, c.height / 2);
  g.shadowBlur = 0;
  g.fillStyle = color;
  g.globalAlpha = 0.35;
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}

// 촛불 연기: 부드러운 회색 점이 꼬불꼬불 올라가며 퍼진다
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(235,235,245,0.9)');
  grad.addColorStop(0.5, 'rgba(210,210,225,0.35)');
  grad.addColorStop(1, 'rgba(200,200,220,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 장소 하나를 완성한다: 공통 동작(촛불, 풍선 흔들림)과 장소별 움직임, 정리 함수를 붙인다
export function finishWorld(scene, group, parts) {
  const { flames, candleLight, balloons = [], extraUpdate, zones = [], hotspots = [] } = parts;
  let state = 'lit'; // lit → blowing → out
  let bt = 0; // 끄기 시작한 뒤 흐른 시간
  let blowDir = new THREE.Vector3(0, 0, -1); // 입김이 부는 방향(촛불이 이쪽으로 눕는다)
  let onSnuff = null;
  const outAt = flames.map((_, i) => 0.35 + i * 0.16 + Math.random() * 0.06);
  const snuffed = new Set();
  const smokeTex = smokeTexture();
  const smoke = [];
  const tmpV = new THREE.Vector3();

  function puff(pos, k) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    m.position.copy(pos);
    m.scale.setScalar(0.06);
    m.userData = { age: -k * 0.12, life: 2.6 + Math.random() * 0.8, seed: Math.random() * 6, x0: pos.x, z0: pos.z };
    group.add(m);
    smoke.push(m);
  }
  function snuff(i) {
    snuffed.add(i);
    const f = flames[i];
    f.visible = false;
    f.getWorldPosition(tmpV);
    for (let k = 0; k < 7; k++) puff(tmpV, k); // 한 줄기 연기 = 작은 점 여러 개가 차례로
    onSnuff?.(i);
  }
  scene.add(group);
  return {
    ...parts,
    group,
    // 즉시 켜거나 끈다(늦게 들어온 사람, 다시 보기)
    setCandles(lit) {
      state = lit ? 'lit' : 'out';
      snuffed.clear();
      for (const f of flames) { f.visible = lit; f.rotation.set(0, 0, 0); }
      candleLight.intensity = lit ? 2.8 : 0;
    },
    // 입김으로 끄는 연출: from 쪽에서 불어 촛불이 반대쪽으로 눕고 하나씩 꺼지며 연기가 오른다
    blowOut({ from = null, snuffCb = null } = {}) {
      if (state !== 'lit') return;
      state = 'blowing';
      bt = 0;
      onSnuff = snuffCb;
      if (from) blowDir = tmpV.set(-from.x, 0, -from.z).normalize().clone();
    },
    get candleState() { return state; },
    // 이 위치가 속한 구역(미끄럼·무중력·트램펄린·댄스)
    zoneAt(pos) { for (const z of zones) if (z.test(pos)) return z; return null; },
    update(t, dt = 0.016, ctx = {}) {
      if (state === 'lit') {
        for (const f of flames) {
          f.rotation.set(0, 0, 0);
          f.scale.set(1 + Math.sin(t * 17 + f.position.x * 40) * 0.12, 1.6 + Math.sin(t * 23 + f.position.z * 30) * 0.25, 1);
        }
        candleLight.intensity = 2.8 + Math.sin(t * 13) * 0.35 + Math.sin(t * 29) * 0.2;
      } else if (state === 'blowing') {
        bt += dt;
        const gust = THREE.MathUtils.smoothstep(bt, 0.05, 0.3); // 바람이 닿는 정도
        flames.forEach((f, i) => {
          if (snuffed.has(i)) return;
          const shake = Math.sin(t * 60 + i * 2) * 0.25 * gust;
          // 바람 방향으로 눕고 길게 늘어나며 마구 흔들린다
          f.rotation.x = blowDir.z * (1.1 * gust) + shake * 0.4;
          f.rotation.z = -blowDir.x * (1.1 * gust) + shake;
          f.scale.set(0.8 - gust * 0.3, 1.6 + gust * 0.9 + shake, 0.8);
          if (bt >= outAt[i]) snuff(i);
        });
        const left = flames.length - snuffed.size;
        candleLight.intensity = THREE.MathUtils.lerp(candleLight.intensity, (2.8 * left) / flames.length * (1 - gust * 0.3), Math.min(1, dt * 10));
        if (!left) { state = 'out'; candleLight.intensity = 0; }
      }
      for (let i = smoke.length - 1; i >= 0; i--) {
        const m = smoke[i];
        const u = m.userData;
        u.age += dt;
        if (u.age < 0) continue;
        const k = u.age / u.life;
        m.position.y += dt * (0.45 - k * 0.2);
        m.position.x = u.x0 + Math.sin(u.age * 2.2 + u.seed) * 0.08 * (1 + k * 3) - blowDir.x * u.age * 0.12;
        m.position.z = u.z0 + Math.cos(u.age * 1.7 + u.seed) * 0.06 * (1 + k * 3) - blowDir.z * u.age * 0.12;
        m.scale.setScalar(0.06 + k * 0.55);
        m.material.opacity = Math.min(1, u.age * 4) * (1 - k) * 0.55;
        if (k >= 1) { group.remove(m); m.material.dispose(); smoke.splice(i, 1); }
      }
      for (const b of balloons) {
        const ph = b.userData.phase;
        b.position.y = b.userData.base.y + Math.sin(t * 1.1 + ph) * 0.12;
        b.rotation.z = Math.sin(t * 0.8 + ph) * 0.06;
      }
      for (const hs of hotspots) if (hs.marker) { hs.marker.material.opacity = 0.3 + Math.sin(t * 2.5 + hs.pos.x) * 0.18; hs.marker.scale.setScalar(1 + Math.sin(t * 2.5 + hs.pos.x) * 0.06); }
      extraUpdate?.(t, dt, ctx);
    },
    dispose() {
      scene.remove(group);
      smokeTex.dispose();
      group.traverse((o) => {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
      });
    },
  };
}
