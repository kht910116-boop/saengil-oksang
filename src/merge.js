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
    for (const g of list) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const merged = list.length === 1 ? list[0] : mergeGeometries(list);
    if (!merged) { for (const g of list) root.add(new THREE.Mesh(g, mat)); continue; }
    root.add(new THREE.Mesh(merged, mat));
  }
  return root;
}
