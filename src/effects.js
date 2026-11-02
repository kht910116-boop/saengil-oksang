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
