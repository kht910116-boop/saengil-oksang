import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// 움직이지 않는 부품 묶음을 재료별로 한 덩어리로 합친다. 휴대폰은 '그리는 횟수'가 많을수록 버벅이므로
// 같은 재료를 쓰는 조각들을 하나로 만들면 훨씬 가벼워진다. root 안의 모든 메시는 이후 따로 움직이면 안 된다.
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(g);
    m.parent.remove(m);
  }
  for (const [mat, geos] of buckets) {
    let list = geos;
    if (list.some((g) => !g.index)) list = list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of list) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    const merged = list.length === 1 ? list[0] : mergeGeometries(list);
    if (!merged) { for (const g of list) root.add(new THREE.Mesh(g, mat)); continue; }
    root.add(new THREE.Mesh(merged, mat));
  }
  return root;
}

// 색이 여러 가지인 장식(음식·깃발·케이크)을 '색은 꼭짓점에, 재료는 하나'로 합친다.
// 거칠기·금속감·투명도·양면 여부가 같은 것끼리 묶고, 은은한 자체 발광도 꼭짓점 색을 따르게 한다.
export function mergeColored(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) meshes.push(o); });
  for (const m of meshes) {
    const mt = m.material;
    if (!mt.isMeshStandardMaterial || mt.map || mt.emissiveMap) continue; // 그림이 있는 재료는 그대로 둔다
    const ei = Math.round((mt.emissiveIntensity || 0) * 20) / 20;
    const key = [Math.round(mt.roughness * 10), Math.round(mt.metalness * 10), mt.transparent ? Math.round(mt.opacity * 10) : 10, mt.side, ei].join('|');
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const c = mt.color;
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!groups.has(key)) groups.set(key, { list: [], proto: mt, ei });
    groups.get(key).list.push(g);
    m.parent.remove(m);
  }
  for (const { list, proto, ei } of groups.values()) {
    const merged = mergeGeometries(list);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: proto.roughness, metalness: proto.metalness,
      transparent: proto.transparent, opacity: proto.opacity, side: proto.side,
      emissive: 0xffffff, emissiveIntensity: ei,
    });
    // 자체 발광 색 = 꼭짓점 색 × 세기(원래 재료가 '자기 색으로 은은하게 빛나던' 것과 같게)
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
    };
    mat.customProgramCacheKey = () => 'vc-emissive';
    root.add(new THREE.Mesh(merged, mat));
  }
  return mergeStatic(root); // 남은(그림 있는) 것들은 재료별로
}
