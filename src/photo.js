// 점등 기념사진: 3D 화면을 잘라 세로 사진(1080×1350)으로 만들고 아래에 파티장 정보를 적는다.
// 3D 화면은 그린 직후에 그대로 베껴 와야 하므로 snapshot()은 렌더 직후 같은 틀에서 부른다.
export function snapshot(sourceCanvas) {
  const c = document.createElement('canvas');
  c.width = sourceCanvas.width;
  c.height = sourceCanvas.height;
  c.getContext('2d').drawImage(sourceCanvas, 0, 0);
  return c;
}

export async function composePhoto(shot, { owner, when, lanterns, gifts, friends }) {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2547';
  g.fillRect(0, 0, W, H);
  // 화면을 세로 사진 비율로 가운데 맞춰 자르기
  const scale = Math.max(W / shot.width, H / shot.height);
  const sw = W / scale;
  const sh = H / scale;
  g.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, 0, 0, W, H);
  // 아래쪽 글자 받침
  const grad = g.createLinearGradient(0, H - 420, 0, H);
  grad.addColorStop(0, 'rgba(23,27,54,0)');
  grad.addColorStop(1, 'rgba(23,27,54,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, H - 420, W, 420);
  try { await document.fonts?.ready; } catch { /* 글꼴 없이도 그린다 */ }
  g.fillStyle = '#fff3d6';
  g.shadowColor = 'rgba(255,196,107,0.6)';
  g.shadowBlur = 18;
  g.font = '86px Jua, sans-serif';
  g.fillText(`${owner}의 생일 파티`, 64, H - 200);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(251,244,232,0.9)';
  g.font = '40px "Gowun Dodum", sans-serif';
  g.fillText(when, 64, H - 138);
  const facts = [lanterns ? `등불 ${lanterns}개` : '', gifts ? `선물 ${gifts}개` : '', friends ? `친구 ${friends}명` : ''].filter(Boolean).join(' · ');
  if (facts) g.fillText(facts, 64, H - 84);
  g.fillStyle = 'rgba(255,196,107,0.95)';
  g.font = '34px Jua, sans-serif';
  g.textAlign = 'right';
  g.fillText('오늘의 주인공', W - 64, H - 84);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}
