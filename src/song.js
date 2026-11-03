// 생일 축하 노래(퍼블릭 도메인 멜로디). 박자 정보는 반주와 가사 자막이 함께 쓴다.
export const SONG_BPM = 104;
export const BEAT = 60 / SONG_BPM;
const N = { G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.26, F5: 698.46, G5: 783.99 };
// [음, 박]
export const MELODY = [
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
  ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
  ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
  ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2],
].map(([n, b]) => [N[n], b]);
// 반주 저음: [시작 박, 주파수]
export const BASS = [[0, 130.81], [3, 98], [6, 98], [9, 130.81], [12, 130.81], [15, 87.31], [19, 130.81], [21, 98], [23, 130.81]];
export const LEAD_IN = 2; // 노래 시작 전 준비 박
// 가사 줄: 시작 박과 길이
export function songLines(name) {
  return [
    { text: '생일 축하합니다', at: 0, len: 6 },
    { text: '생일 축하합니다', at: 6, len: 6 },
    { text: `사랑하는 ${name}의`, at: 12, len: 7 },
    { text: '생일 축하합니다', at: 19, len: 6 },
  ];
}
export const SONG_BEATS = 25;
export const SONG_SECONDS = (LEAD_IN + SONG_BEATS) * BEAT;
