// 기억 카드: 파티장이 닫히기 전에 모든 등불 문구를 한 장의 세로 이미지로 남긴다.
const W = 1080;
const PAD = 64;
const COL_GAP = 24;
const CARD_W = (W - PAD * 2 - COL_GAP) / 2;
const MAX_H = 14000; // 휴대폰 브라우저가 감당할 수 있는 캔버스 높이

function hex(c) { return `#${Number(c).toString(16).padStart(6, '0')}`; }

// 글자를 폭에 맞춰 줄바꿈(한국어는 글자 단위로 끊는다)
function wrap(g, text, width) {
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (g.measureText(cur + ch).width > width && cur) { lines.push(cur); cur = ch.trim() ? ch : ''; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export async function composeMemoryCard({ owner, when, venue, lanterns, gifts = 0, thanks = '' }) {
  try { await document.fonts?.ready; } catch { /* 글꼴 없이도 그린다 */ }
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = '34px "Gowun Dodum", sans-serif';
  // 카드마다 높이를 먼저 잰다
  const cards = lanterns.map((l) => {
    const msg = wrap(probe, l.msg, CARD_W - 64);
    return { ...l, msg, h: 70 + msg.length * 46 + 66 };
  });
  const HEAD = 330;
  const cols = [HEAD, HEAD];
  const placed = [];
  let hiddenN = 0;
  for (const c of cards) {
    const col = cols[0] <= cols[1] ? 0 : 1;
    if (cols[col] + c.h + 260 > MAX_H) { hiddenN++; continue; }
    placed.push({ ...c, x: PAD + col * (CARD_W + COL_GAP), y: cols[col] });
    cols[col] += c.h + COL_GAP;
  }
  const H = Math.max(1350, Math.max(...cols) + (thanks ? 200 : 120) + (hiddenN ? 60 : 0));

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b2146');
  bg.addColorStop(1, '#3a2b55');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // 별
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,243,220,${0.15 + Math.random() * 0.5})`;
    g.beginPath();
    g.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // 머리글
  g.fillStyle = '#fff3d6';
  g.shadowColor = 'rgba(255,196,107,0.6)';
  g.shadowBlur = 18;
  g.font = '84px Jua, sans-serif';
  g.fillText(`${owner}의 생일 파티`, PAD, 150);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(251,244,232,0.85)';
  g.font = '36px "Gowun Dodum", sans-serif';
  g.fillText([when, venue].filter(Boolean).join(' · '), PAD, 214);
  g.fillText([`등불 ${lanterns.length}개`, gifts ? `선물 ${gifts}개` : ''].filter(Boolean).join(' · '), PAD, 264);

  for (const c of placed) {
    g.fillStyle = 'rgba(251,244,232,0.96)';
    roundRect(g, c.x, c.y, CARD_W, c.h, 26);
    g.fill();
    // 등불 색 동그라미
    g.fillStyle = hex(c.color);
    g.beginPath();
    g.arc(c.x + 40, c.y + 44, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2238';
    g.font = '34px "Gowun Dodum", sans-serif';
    c.msg.forEach((line, i) => g.fillText(line, c.x + 32, c.y + 108 + i * 46));
    g.fillStyle = '#7a6f8a';
    g.font = '26px "Gowun Dodum", sans-serif';
    const from = [c.name, c.meta].filter(Boolean).join(' · ');
    g.fillText(wrap(g, from, CARD_W - 64)[0] || '', c.x + 32, c.y + c.h - 28);
  }
  let y = Math.max(...cols) + 40;
  g.font = '30px "Gowun Dodum", sans-serif';
  g.fillStyle = 'rgba(251,244,232,0.8)';
  if (hiddenN) { g.fillText(`그리고 등불 ${hiddenN}개가 더 있었어요`, PAD, y); y += 60; }
  if (thanks) {
    g.fillStyle = '#ffc46b';
    g.font = '40px Jua, sans-serif';
    g.fillText(`${owner}의 답례: ${thanks}`, PAD, y + 20);
  }
  g.fillStyle = 'rgba(255,196,107,0.95)';
  g.font = '34px Jua, sans-serif';
  g.textAlign = 'right';
  g.fillText('오늘의 주인공', W - PAD, H - 48);
  return new Promise((resolve) => cv.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}
