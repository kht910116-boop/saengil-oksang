import * as THREE from 'three';

// 옥상 선물의 3D 연출: 풍선 묶음, 케이크 토핑(딸기), 자정 불꽃놀이
const BALLOON_COLORS = [0xf29bb3, 0x8fd3c1, 0xffd97a, 0xb9a6f2, 0xfbf4e8];

function balloonCluster(color) {
  const g = new THREE.Group();
  const colors = [color, BALLOON_COLORS[(BALLOON_COLORS.indexOf(color) + 1) % 5], color];
  const offsets = [[0, 0, 0], [0.38, -0.2, 0.12], [-0.34, -0.12, -0.1]];
  const strMat = new THREE.MeshBasicMaterial({ color: 0xe8e0f0 });
  offsets.forEach(([ox, oy, oz], i) => {
    const mat = new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.35, emissive: colors[i], emissiveIntensity: 0.12 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), mat);
    b.scale.y = 1.18;
    b.position.set(ox, 2.5 + oy, oz);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 2.2 + oy, 4), strMat);
    str.position.set(ox * 0.5, (2.2 + oy) / 2, oz * 0.5);
    str.rotation.z = -ox * 0.12;
    g.add(b, str);
  });
  // 바닥 추(작은 선물 상자)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), new THREE.MeshStandardMaterial({ color: 0xfbf4e8, roughness: 0.7 }));
  box.position.y = 0.12;
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), new THREE.MeshStandardMaterial({ color }));
  ribbon.position.y = 0.2;
  g.add(box, ribbon);
  return g;
}

function strawberry() {
  const g = new THREE.Group();
  const berry = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8455f, roughness: 0.45, emissive: 0xe8455f, emissiveIntensity: 0.12 }));
  berry.scale.set(1, 1.2, 1);
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.04, 6), new THREE.MeshStandardMaterial({ color: 0x4f8a6e }));
  leaf.position.y = 0.065;
  leaf.rotation.x = Math.PI;
  g.add(berry, leaf);
  return g;
}

// 케이크 위 자리: 윗단 둘레 → 아랫단 턱
const TOPPING_SPOTS = [];
for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; TOPPING_SPOTS.push([Math.cos(a) * 0.3, 1.64, Math.sin(a) * 0.3]); }
for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; TOPPING_SPOTS.push([Math.cos(a) * 0.47, 1.38, Math.sin(a) * 0.47]); }

function firework(color, origin) {
  const n = 220;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    vel.push(new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th)).multiplyScalar(5 + Math.random() * 1.5));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.5, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // 입자 위치가 계속 바뀌므로 화면 밖 판정을 끈다
  const rocket = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false }));
  rocket.position.copy(origin);
  const peak = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 9 + Math.random() * 4, (Math.random() - 0.5) * 4 - 3));
  return { points, rocket, vel, pos, mat, origin: origin.clone(), peak, t: 0, burst: false, done: false };
}

export function createGiftLayer(scene, { onBurst } = {}) {
  const balloons = [];
  const toppings = [];
  const pending = []; // 점등을 기다리는 불꽃놀이
  const flying = [];
  const all = [];

  function add(gift, { from = null } = {}) {
    if (all.some((g) => g.id === gift.id && gift.id != null)) return null;
    all.push(gift);
    if (gift.item === 'balloons') {
      const g = balloonCluster(gift.color);
      g.position.set(gift.x, 0, gift.z);
      g.userData.gift = gift;
      g.userData.phase = Math.random() * 6;
      g.userData.rise = from ? 0 : 1;
      scene.add(g);
      balloons.push(g);
    } else if (gift.item === 'topping') {
      const spot = TOPPING_SPOTS[toppings.length % TOPPING_SPOTS.length];
      const s = strawberry();
      s.position.set(spot[0], spot[1] + (from ? 1.5 : 0), spot[2]);
      s.userData.target = spot[1];
      scene.add(s);
      toppings.push(s);
    } else if (gift.item === 'fireworks') {
      pending.push(gift);
    }
    return gift;
  }

  function launch(color, delay = 0) {
    setTimeout(() => {
      const fw = firework(color, new THREE.Vector3((Math.random() - 0.5) * 16, 1, -7 + (Math.random() - 0.5) * 4));
      scene.add(fw.rocket, fw.points);
      flying.push(fw);
    }, delay);
  }

  return {
    add,
    get list() { return all.slice(); },
    get debug() { return { pending: pending.length, flying: flying.length, burst: flying.filter((f) => f.burst).length }; },
    pickables() { return balloons; },
    // 점등 때 쌓인 불꽃놀이를 차례로 쏜다
    launchPending(startDelay = 0) {
      pending.forEach((g, i) => launch(g.color, startDelay + i * 650));
    },
    launchNow(gift) { launch(gift.color, 0); },
    update(dt, t) {
      for (const b of balloons) {
        if (b.userData.rise < 1) b.userData.rise = Math.min(1, b.userData.rise + dt * 0.6);
        const k = 1 - Math.pow(1 - b.userData.rise, 3);
        b.position.y = (k - 1) * 3 + Math.sin(t * 1.2 + b.userData.phase) * 0.06;
        b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.05;
      }
      for (const s of toppings) {
        if (s.position.y > s.userData.target) s.position.y = Math.max(s.userData.target, s.position.y - dt * 2.5);
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t += dt;
        if (!f.burst) {
          const k = Math.min(1, f.t / 1.1);
          f.rocket.position.lerpVectors(f.origin, f.peak, 1 - Math.pow(1 - k, 2));
          if (k >= 1) {
            f.burst = true;
            f.t = 0;
            scene.remove(f.rocket);
            for (let j = 0; j < f.vel.length; j++) { f.pos[j * 3] = f.peak.x; f.pos[j * 3 + 1] = f.peak.y; f.pos[j * 3 + 2] = f.peak.z; }
            f.mat.opacity = 1;
            onBurst?.();
          }
        } else {
          for (let j = 0; j < f.vel.length; j++) {
            f.vel[j].multiplyScalar(1 - dt * 1.6);
            f.vel[j].y -= dt * 1.4;
            f.pos[j * 3] += f.vel[j].x * dt;
            f.pos[j * 3 + 1] += f.vel[j].y * dt;
            f.pos[j * 3 + 2] += f.vel[j].z * dt;
          }
          f.points.geometry.attributes.position.needsUpdate = true;
          f.mat.opacity = Math.max(0, 1 - f.t / 2.2);
          if (f.t > 2.3) {
            scene.remove(f.points);
            f.points.geometry.dispose();
            flying.splice(i, 1);
          }
        }
      }
    },
  };
}
