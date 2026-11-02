// 부하 시험용 가짜 접속자 묶음(별도 프로세스). 각자 초당 10번 위치를 보내고, 자기 위치가 되돌아오는 시간을 잰다.
import WebSocket from 'ws';
const [, , base, roomsJson, perRoomStr, startStr] = process.argv;
const rooms = JSON.parse(roomsJson);
const perRoom = Number(perRoomStr);
const lat = [];
let open = 0;
let errors = 0;
for (const room of rooms) {
  for (let i = 0; i < perRoom; i++) {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?room=${room}`);
    let me = null;
    let x = Math.random() * 10 - 5;
    let sentAt = 0;
    let wanted = null;
    ws.on('open', () => { open++; ws.send(JSON.stringify({ t: 'join', name: '친구', color: 0xf29bb3 })); });
    ws.on('error', () => { errors++; });
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'welcome') {
        me = m.you;
        setInterval(() => {
          x = Math.max(-12, Math.min(12, x + (Math.random() - 0.5)));
          const vx = +x.toFixed(2);
          if (!wanted) { wanted = vx; sentAt = performance.now(); }
          ws.send(JSON.stringify({ t: 'pos', x: vx, z: 1, dx: 1 }));
        }, 100 + Math.random() * 20);
      } else if (m.t === 'state' && wanted !== null) {
        const mine = m.p.find((p) => p[0] === me);
        if (mine) { lat.push(performance.now() - sentAt); wanted = null; }
      }
    });
  }
}
setInterval(() => {
  const s = lat.splice(0).sort((a, b) => a - b);
  const pct = (q) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * q))]) : null);
  process.send?.({ open, errors, n: s.length, p50: pct(0.5), p95: pct(0.95) });
}, 2000);
