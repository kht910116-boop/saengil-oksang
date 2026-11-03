import * as THREE from 'three';
import { createFireworks } from './fireworks.js';

// 파티장 선물의 3D 연출: 풍선 묶음, 케이크 토핑(딸기), 자정 불꽃놀이
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

export function createGiftLayer(scene, { onBurst, onCrackle } = {}) {
  const balloons = [];
  const toppings = [];
  const pending = []; // 점등을 기다리는 불꽃놀이
  const all = [];
  const fireworks = createFireworks(scene, { onBurst, onCrackle });
  let camera = null;

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


  return {
    add,
    get list() { return all.slice(); },
    get debug() { return { pending: pending.length, ...fireworks.debug }; },
    pickables() { return balloons; },
    // 점등 때 쌓인 불꽃놀이를 차례로 쏜다. 3개 이상이면 마지막 3개는 한꺼번에 터지는 피날레.
    launchPending(startDelay = 0) {
      const n = pending.length;
      const finale = n >= 3 ? 3 : 0;
      pending.forEach((g, i) => {
        const inFinale = i >= n - finale;
        const delay = startDelay / 1000 + (inFinale ? (n - finale) * 0.9 + 0.6 + (i - (n - finale)) * 0.12 : i * 0.9);
        fireworks.volley({ color: g.color, index: i, delay, camera });
      });
    },
    launchNow(gift) { fireworks.volley({ color: gift.color, index: all.indexOf(gift), delay: 0, camera }); },
    update(dt, t, view = {}) {
      if (view.camera) camera = view.camera;
      fireworks.update(dt, view);
      for (const b of balloons) {
        if (b.userData.rise < 1) b.userData.rise = Math.min(1, b.userData.rise + dt * 0.6);
        const k = 1 - Math.pow(1 - b.userData.rise, 3);
        b.position.y = (k - 1) * 3 + Math.sin(t * 1.2 + b.userData.phase) * 0.06;
        b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.05;
      }
      for (const s of toppings) {
        if (s.position.y > s.userData.target) s.position.y = Math.max(s.userData.target, s.position.y - dt * 2.5);
      }
    },
  };
}
