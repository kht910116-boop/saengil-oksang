import * as THREE from 'three';

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

// 케이크 테이블: 촛불 5개와 따뜻한 촛불 빛
export function cakeTable(group, { legColor = 0x3a3150, topColor = PAL.paper, at = new THREE.Vector3() } = {}) {
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 28), new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.7 }));
  top.position.y = 0.95;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 0.95, 12), new THREE.MeshStandardMaterial({ color: legColor, roughness: 0.8 }));
  leg.position.y = 0.47;
  const cake1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.32, 28), new THREE.MeshStandardMaterial({ color: PAL.pink, roughness: 0.6 }));
  cake1.position.y = 1.17;
  const cake2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 28), new THREE.MeshStandardMaterial({ color: PAL.paper, roughness: 0.6 }));
  cake2.position.y = 1.46;
  table.add(top, leg, cake1, cake2);
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), new THREE.MeshStandardMaterial({ color: PAL.mint }));
    candle.position.set(Math.cos(a) * 0.22, 1.69, Math.sin(a) * 0.22);
    // 불꽃은 심지 끝을 축으로 눕고 늘어나도록 아래쪽을 원점으로 둔다
    const flameGeo = new THREE.SphereGeometry(0.04, 10, 8);
    flameGeo.translate(0, 0.04, 0);
    const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    flame.scale.y = 1.6;
    flame.position.set(candle.position.x, 1.79, candle.position.z);
    table.add(candle, flame);
    flames.push(flame);
  }
  const candleLight = new THREE.PointLight(0xffb45e, 3.6, 9, 1.6);
  candleLight.position.y = 2.1;
  table.add(candleLight);
  table.position.copy(at);
  group.add(table);
  return { flames, candleLight, obstacle: { x: at.x, z: at.z, r: 1.6 } };
}

// 테이블 옆 장식 풍선
export function decoBalloons(group, at = new THREE.Vector3(1.2, 0, -0.8), colors = [PAL.pink, PAL.mint, 0xffd97a, PAL.pink, PAL.lavender]) {
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
  const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const bulbs = [];
  const lanternSlots = [];
  let order = 0;
  for (const [ia, ib, sag] of spans) {
    const a = polePts[ia];
    const b = polePts[ib];
    const curve = sagCurve(a, b, sag);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.018, 4, false), wireMat));
    const n = Math.max(6, Math.round(a.distanceTo(b) / spacing));
    for (let i = 1; i < n; i++) {
      const p = curve.getPointAt(i / n);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, emissive: bulbColor, emissiveIntensity: 0.18 });
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.copy(p).add(new THREE.Vector3(0, -0.1, 0));
      bulb.userData.order = order++;
      group.add(bulb);
      bulbs.push(bulb);
      // 짝수 전구 아래가 1순위 자리, 홀수 전구 아래는 자리가 찼을 때 쓰는 2순위 자리
      lanternSlots.push({ pos: p.clone().add(new THREE.Vector3(0, -0.55, 0)), tier: i % 2 });
    }
  }
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
export function city(group, { count = 70, distMin = 34, distMax = 79, yBase = -18, hMax = 40, arc = [0, Math.PI * 2], color = 0x232846 } = {}) {
  const winTex = windowTexture();
  for (let i = 0; i < count; i++) {
    const ang = arc[0] + (i / count) * (arc[1] - arc[0]) + Math.random() * 0.05;
    const dist = distMin + Math.random() * (distMax - distMin);
    const w = 4 + Math.random() * 6;
    const h = 6 + Math.random() * (dist > (distMin + distMax) / 2 ? hMax : hMax * 0.55);
    const d = 4 + Math.random() * 6;
    const em = winTex.clone();
    em.needsUpdate = true;
    em.wrapS = em.wrapT = THREE.RepeatWrapping;
    em.repeat.set(w / 4, h / 8);
    em.offset.set(Math.random(), Math.random());
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 1, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.9 }));
    m.position.set(Math.cos(ang) * dist, h / 2 + yBase, Math.sin(ang) * dist);
    m.rotation.y = -ang;
    group.add(m);
  }
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
  const { flames, candleLight, balloons = [], extraUpdate } = parts;
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
      candleLight.intensity = lit ? 3.4 : 0;
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
    update(t, dt = 0.016) {
      if (state === 'lit') {
        for (const f of flames) {
          f.rotation.set(0, 0, 0);
          f.scale.set(1 + Math.sin(t * 17 + f.position.x * 40) * 0.12, 1.6 + Math.sin(t * 23 + f.position.z * 30) * 0.25, 1);
        }
        candleLight.intensity = 3.4 + Math.sin(t * 13) * 0.4 + Math.sin(t * 29) * 0.25;
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
        candleLight.intensity = THREE.MathUtils.lerp(candleLight.intensity, (3.4 * left) / flames.length * (1 - gust * 0.3), Math.min(1, dt * 10));
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
      extraUpdate?.(t, dt);
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
