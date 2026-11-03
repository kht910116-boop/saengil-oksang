import * as THREE from 'three';

// 공동 목표 보상: 점등 때 하늘을 가로지르는 유성우
function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,240,210,0)');
  grad.addColorStop(0.75, 'rgba(255,236,200,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 5, 256, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMeteors(scene, count = 14) {
  const tex = streakTexture();
  const meteors = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 0.12),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
    );
    m.frustumCulled = false;
    m.visible = false;
    scene.add(m);
    meteors.push({ m, t: 0, delay: 0, from: new THREE.Vector3(), dir: new THREE.Vector3() });
  }
  let active = false;
  let elapsed = 0;
  return {
    get active() { return active; },
    start(duration = 9) {
      active = true;
      elapsed = 0;
      meteors.forEach((s, i) => {
        s.delay = (i / meteors.length) * (duration - 1.5) + Math.random() * 0.4;
        s.t = 0;
        s.from.set(-14 + Math.random() * 22, 13 + Math.random() * 8, -12 - Math.random() * 10);
        s.dir.set(1, -0.45 - Math.random() * 0.2, 0.1).normalize();
        s.m.rotation.set(0, 0, Math.atan2(s.dir.y, s.dir.x));
      });
    },
    update(dt, camera) {
      if (!active) return;
      elapsed += dt;
      let alive = 0;
      for (const s of meteors) {
        if (elapsed < s.delay) { alive++; continue; }
        s.t += dt;
        const k = s.t / 1.1;
        if (k > 1) { s.m.visible = false; continue; }
        alive++;
        s.m.visible = true;
        s.m.position.copy(s.from).addScaledVector(s.dir, k * 16);
        s.m.quaternion.copy(camera.quaternion);
        s.m.rotateZ(Math.atan2(s.dir.y, s.dir.x) * 0.6 - 0.35);
        s.m.material.opacity = Math.sin(k * Math.PI);
      }
      if (!alive) active = false;
    },
  };
}

// 꽃가루(색종이): 촛불을 끈 순간 위로 터졌다가 팔랑팔랑 떨어진다
export function createConfetti(scene, max = 260) {
  const geo = new THREE.PlaneGeometry(0.09, 0.05);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const colors = [0xffc46b, 0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xffffff, 0x7ad7ff].map((c) => new THREE.Color(c));
  const parts = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  return {
    burst(center, n = 200) {
      parts.length = 0;
      for (let i = 0; i < Math.min(n, max); i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3.5;
        parts.push({
          p: new THREE.Vector3(center.x, center.y, center.z),
          v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 4 + Math.random() * 4, Math.sin(a) * sp * 0.6),
          r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          w: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5),
          life: 4 + Math.random() * 2,
        });
        mesh.setColorAt(i, colors[i % colors.length]);
      }
      mesh.count = parts.length;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    update(dt) {
      if (!parts.length) return;
      let alive = 0;
      parts.forEach((pt, i) => {
        pt.life -= dt;
        if (pt.life <= 0) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); return; }
        alive++;
        // 올라갈 때는 빠르게, 내려올 때는 공기 저항으로 천천히 팔랑
        pt.v.y -= 9 * dt;
        if (pt.v.y < -0.9) pt.v.y = -0.9;
        pt.v.x *= 1 - dt * 1.5;
        pt.v.z *= 1 - dt * 1.5;
        pt.p.addScaledVector(pt.v, dt);
        pt.p.x += Math.sin(pt.life * 3 + i) * dt * 0.4;
        if (pt.p.y < 0.02) { pt.p.y = 0.02; pt.v.set(0, 0, 0); pt.w.set(0, 0, 0); }
        pt.r.addScaledVector(pt.w, dt);
        q.setFromEuler(e.set(pt.r.x, pt.r.y, pt.r.z));
        m4.compose(pt.p, q, one);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (!alive) { parts.length = 0; mesh.count = 0; }
    },
  };
}

// 입김: 주인공 입에서 케이크 쪽으로 흩어지며 날아가는 하얀 점들
export function createBreath(scene) {
  const n = 60;
  const pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xeef4ff, size: 0.12, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  let t = -1;
  let from = new THREE.Vector3();
  let to = new THREE.Vector3();
  const seeds = Array.from({ length: n }, () => [Math.random(), Math.random() - 0.5, Math.random() - 0.5]);
  return {
    start(a, b) { from = a.clone(); to = b.clone(); t = 0; },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const dur = 1.0;
      for (let i = 0; i < n; i++) {
        const [d, sx, sy] = seeds[i];
        const k = Math.min(1, Math.max(0, (t - d * 0.6) / 0.5)); // 하나씩 차례로 출발
        const p = from.clone().lerp(to, k);
        p.x += sx * k * 0.5;
        p.y += sy * k * 0.3;
        pos.set([p.x, p.y, p.z], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = t < dur ? 0.5 * Math.sin((t / dur) * Math.PI) : 0;
      if (t > dur + 0.2) { t = -1; pts.material.opacity = 0; }
    },
  };
}
