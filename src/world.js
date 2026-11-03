// 파티 장소를 고르는 입구. 장소마다 모듈이 따로 있고, 모두 같은 모양의 '세계' 객체를 돌려준다.
//   bulbs, lanternSlots, obstacles, floor, hemi, update(t, dt), setCandles(lit), dispose(),
//   bounds {w, d}(걸어 다닐 수 있는 사각형), entrance(입장 지점), cakeTop
import { buildRooftop } from './venues/rooftop.js';
import { buildCruise } from './venues/cruise.js';
import { buildAurora } from './venues/aurora.js';
import { buildSky } from './venues/sky.js';
import { buildSpace } from './venues/space.js';
import { DEFAULT_VENUE } from './config.js';

const BUILDERS = { rooftop: buildRooftop, cruise: buildCruise, aurora: buildAurora, sky: buildSky, space: buildSpace };

export function buildWorld(scene, venue = DEFAULT_VENUE) {
  const build = BUILDERS[venue] || BUILDERS[DEFAULT_VENUE];
  return build(scene);
}
