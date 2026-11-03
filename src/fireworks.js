import * as THREE from 'three';

// 불꽃놀이 엔진: 둥근 빛 입자 + 빛 꼬리 + 여러 터짐 모양 + 반짝임 + 섬광
// 입자마다 크기·투명도·색이 달라야 해서 직접 만든 셰이더로 그린다(한 번에 그려서 가볍다).

const VS = `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FS = `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    float a = core * core * vAlpha;
    // 가운데는 하얗게, 바깥은 고유 색으로 빛나게
    vec3 col = mix(vColor, vec3(1.0, 0.97, 0.9), smoothstep(0.18, 0.0, d) * 0.85);
    gl_FragColor = vec4(col * (0.7 + core), a);
  }
`;

const PATTERNS = ['peony', 'ring', 'heart', 'willow'];
const GOLD = new THREE.Color(0xffd27a);
const WARM = new THREE.Color(0xffb15e);

function makeSystem(count, scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const alpha = new Float32Array(count);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: { uScale: { value: 400 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // 입자가 계속 움직이므로 화면 밖 판정을 끈다
  scene.add(points);
  return { geo, pos, alpha, size, color, mat, points, count };
}

// 터짐 모양별 처음 속도
function velocities(pattern, n, cam) {
  const out = [];
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  if (cam) { right.setFromMatrixColumn(cam.matrixWorld, 0).normalize(); up.setFromMatrixColumn(cam.matrixWorld, 1).normalize(); }
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3();
    if (pattern === 'ring') {
      // 화면을 향한 고리(살짝 기울임)
      const a = (i / n) * Math.PI * 2;
      v.copy(right).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a) * 0.82);
      v.multiplyScalar(6.4 + Math.random() * 0.4);
    } else if (pattern === 'heart') {
      // 하트 곡선: x = 16sin³t, y = 13cos t − 5cos2t − 2cos3t − cos4t
      const t = (i / n) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      v.copy(right).multiplyScalar(hx).addScaledVector(up, hy).multiplyScalar(0.36 * (0.95 + Math.random() * 0.1));
    } else {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      v.set(r * Math.cos(th), u, r * Math.sin(th));
      v.multiplyScalar(pattern === 'willow' ? 4.2 + Math.random() * 1.2 : 5.6 + Math.random() * 1.4);
    }
    out.push(v);
  }
  return out;
}

const SETTINGS = {
  peony: { n: 160, trail: 3, life: 2.3, drag: 1.5, gravity: 1.5, size: 1.1, crackle: true },
  ring: { n: 120, trail: 3, life: 2.1, drag: 1.3, gravity: 1.1, size: 1.1, crackle: false },
  heart: { n: 130, trail: 3, life: 2.6, drag: 1.25, gravity: 0.45, size: 1.15, crackle: false },
  willow: { n: 110, trail: 6, life: 3.4, drag: 0.85, gravity: 2.4, size: 1.0, crackle: true },
  small: { n: 70, trail: 2, life: 1.6, drag: 1.8, gravity: 1.6, size: 0.85, crackle: false },
};

export function createFireworks(scene, { onBurst, onCrackle } = {}) {
  const shells = [];
  // 터질 때 옥상을 비추는 섬광(최대 2개를 돌려 쓴다)
  const flashes = [0, 1].map(() => {
    const l = new THREE.PointLight(0xffffff, 0, 45, 1.6);
    scene.add(l);
    return { light: l, t: 1 };
  });
  let flashIdx = 0;
  let viewScale = 400;
  let bursts = 0;
  let launched = 0;

  function launch({ color, pattern = 'peony', origin, delay = 0, small = false, camera }) {
    launched++;
    const s = {
      delay,
      color: new THREE.Color(color),
      pattern: small ? 'small' : pattern,
      cfg: SETTINGS[small ? 'small' : pattern],
      origin: origin.clone(),
      peak: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * (small ? 8 : 5), small ? 7 + Math.random() * 3 : 9.5 + Math.random() * 3.5, (Math.random() - 0.5) * 3 - 2)),
      t: 0,
      stage: 'wait',
      camera,
      rocket: null,
      sys: null,
    };
    shells.push(s);
  }

  function startRocket(s) {
    s.stage = 'rise';
    s.t = 0;
    const R = 14; // 로켓 머리 + 꼬리
    s.rocket = { sys: makeSystem(R, scene), hist: Array.from({ length: R }, () => s.origin.clone()) };
  }

  function burst(s) {
    s.stage = 'burst';
    s.t = 0;
    scene.remove(s.rocket.sys.points);
    s.rocket.sys.geo.dispose();
    s.rocket.sys.mat.dispose();
    s.rocket = null;
    const { n, trail } = s.cfg;
    const vel = velocities(s.pattern === 'small' ? 'peony' : s.pattern, n, s.camera);
    s.parts = vel.map((v) => ({ v, p: s.peak.clone(), hist: Array.from({ length: trail }, () => s.peak.clone()), seed: Math.random() * 10 }));
    s.sys = makeSystem(n * (trail + 1), scene);
    bursts++;
    const f = flashes[flashIdx++ % flashes.length];
    f.light.color.copy(s.color).lerp(new THREE.Color(0xffffff), 0.4);
    f.light.position.copy(s.peak);
    f.t = 0;
    f.max = s.pattern === 'small' ? 10 : 26;
    onBurst?.(s.pattern);
    if (s.cfg.crackle) setTimeout(() => onCrackle?.(), s.cfg.life * 650);
  }

  function writeRocket(s) {
    const { sys, hist } = s.rocket;
    hist.unshift(hist.pop().copy(s.pos));
    for (let i = 0; i < hist.length; i++) {
      sys.pos.set([hist[i].x + (i ? (Math.random() - 0.5) * 0.06 : 0), hist[i].y, hist[i].z], i * 3);
      sys.alpha[i] = i === 0 ? 1 : (1 - i / hist.length) * 0.55 * (0.6 + Math.random() * 0.4);
      sys.size[i] = i === 0 ? 1.0 : 0.55 * (1 - i / hist.length);
      const c = i === 0 ? new THREE.Color(0xfff3d6) : WARM;
      sys.color.set([c.r, c.g, c.b], i * 3);
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.aAlpha.needsUpdate = true;
    sys.geo.attributes.aSize.needsUpdate = true;
    sys.geo.attributes.aColor.needsUpdate = true;
  }

  function writeBurst(s, dt) {
    const { cfg, parts, sys } = s;
    const k = s.t / cfg.life; // 0 → 1
    const fade = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    const tmpC = new THREE.Color();
    let idx = 0;
    for (const part of parts) {
      part.v.multiplyScalar(Math.max(0, 1 - cfg.drag * dt));
      part.v.y -= cfg.gravity * dt;
      part.hist.unshift(part.hist.pop().copy(part.p));
      part.p.addScaledVector(part.v, dt);
      // 끝으로 갈수록 따뜻한 빛으로, 버드나무형은 금빛
      tmpC.copy(s.pattern === 'willow' ? GOLD : s.color).lerp(s.pattern === 'willow' ? WARM : GOLD, Math.min(1, k * 1.3) * 0.6);
      // 반짝임: 끝 무렵 깜빡깜빡
      const twinkle = cfg.crackle && k > 0.55 ? (Math.sin((s.t + part.seed) * 38) > 0.2 ? 1 : 0.15) : 1;
      for (let j = 0; j <= cfg.trail; j++) {
        const p = j === 0 ? part.p : part.hist[j - 1];
        sys.pos.set([p.x, p.y, p.z], idx * 3);
        const tail = j === 0 ? 1 : (1 - j / (cfg.trail + 1)) * 0.5;
        sys.alpha[idx] = fade * tail * twinkle;
        sys.size[idx] = cfg.size * (j === 0 ? 1 : 0.75 - j * 0.08) * (1 - k * 0.35);
        sys.color.set([tmpC.r, tmpC.g, tmpC.b], idx * 3);
        idx++;
      }
    }
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.aAlpha.needsUpdate = true;
    sys.geo.attributes.aSize.needsUpdate = true;
    sys.geo.attributes.aColor.needsUpdate = true;
  }

  return {
    get debug() { return { launched, flying: shells.length, burst: bursts }; },
    launch,
    // 선물 하나 = 큰 불꽃 하나 + 작은 불꽃 둘
    volley({ color, index = 0, delay = 0, camera }) {
      const origin = new THREE.Vector3((Math.random() - 0.5) * 16, 1, -7 + (Math.random() - 0.5) * 4);
      const pattern = PATTERNS[index % PATTERNS.length];
      launch({ color, pattern, origin, delay, camera });
      launch({ color, origin: origin.clone().add(new THREE.Vector3(-2.5, 0, 0.5)), delay: delay + 0.45, small: true, camera });
      launch({ color: 0xfff1d6, origin: origin.clone().add(new THREE.Vector3(2.5, 0, -0.5)), delay: delay + 0.7, small: true, camera });
    },
    update(dt, { viewHeight } = {}) {
      if (viewHeight) viewScale = viewHeight * 0.55;
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        if (s.stage === 'wait') {
          s.delay -= dt;
          if (s.delay <= 0) startRocket(s);
          continue;
        }
        s.t += dt;
        if (s.stage === 'rise') {
          const dur = s.pattern === 'small' ? 0.8 : 1.15;
          const k = Math.min(1, s.t / dur);
          const e = 1 - Math.pow(1 - k, 2.2);
          s.pos = (s.pos || new THREE.Vector3()).lerpVectors(s.origin, s.peak, e);
          s.pos.x += Math.sin(s.t * 18) * 0.05; // 살짝 흔들리며 올라간다
          s.rocket.sys.mat.uniforms.uScale.value = viewScale;
          writeRocket(s);
          if (k >= 1) burst(s);
        } else {
          s.sys.mat.uniforms.uScale.value = viewScale;
          writeBurst(s, dt);
          if (s.t > s.cfg.life) {
            scene.remove(s.sys.points);
            s.sys.geo.dispose();
            s.sys.mat.dispose();
            shells.splice(i, 1);
          }
        }
      }
      for (const f of flashes) {
        if (f.t >= 1) { f.light.intensity = 0; continue; }
        f.t = Math.min(1, f.t + dt / 0.45);
        f.light.intensity = (f.max || 20) * Math.pow(1 - f.t, 2);
      }
    },
  };
}
