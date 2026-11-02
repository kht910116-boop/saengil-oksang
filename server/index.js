// 생일 옥상 서버: 정적 파일 제공 + REST API + 실시간(WebSocket)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'rooftop.db');

const MAX_LANTERNS = 200;
const ROOM_CAP = 40;
const OWNER_EARLY_MS = 15_000; // 주인공은 자정 15초 전에 입장
const KST = 9 * 3600_000;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS rooftops (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    ignite_at INTEGER NOT NULL,
    owner_key TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lanterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rooftop_id TEXT NOT NULL,
    name TEXT NOT NULL,
    msg TEXT NOT NULL,
    color INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lanterns_room ON lanterns(rooftop_id);
`);

const q = {
  insertRoof: db.prepare('INSERT INTO rooftops (id, owner, ignite_at, owner_key, created_at) VALUES (?, ?, ?, ?, ?)'),
  getRoof: db.prepare('SELECT * FROM rooftops WHERE id = ?'),
  lanterns: db.prepare('SELECT id, name, msg, color, slot FROM lanterns WHERE rooftop_id = ? ORDER BY id'),
  countLanterns: db.prepare('SELECT COUNT(*) AS n FROM lanterns WHERE rooftop_id = ?'),
  insertLantern: db.prepare('INSERT INTO lanterns (rooftop_id, name, msg, color, slot, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
};

// 기본 욕설 필터: 공백·기호·숫자를 지운 뒤 대표적인 욕설이 들어 있으면 막는다(완벽하지 않으므로 신고·숨김 기능과 함께 쓴다)
const BAD_WORDS = ['씨발', '시발', '씨바', '시바', '쓰발', 'ㅅㅂ', 'ㅆㅂ', '병신', '븅신', 'ㅂㅅ', '개새', '새끼', 'ㅅㄲ', '좆', '존나', 'ㅈㄴ', '지랄', 'ㅈㄹ', '미친놈', '미친년', '닥쳐', '꺼져', '엿먹', '니애미', '느금', '애미', '애비', 'fuck', 'shit', 'bitch'];
export function hasBadWord(text) {
  const t = String(text).toLowerCase().replace(/[\s\d~`!@#$%^&*()_+\-=\[\]{}|\\;:'",.<>/?·ㆍ…]/g, '');
  return BAD_WORDS.some((w) => t.includes(w));
}

const COLORS = new Set([0xffc46b, 0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xfbf4e8]);

// 생일(월/일) → 다음 자정(한국 시간)의 시각. 생일 당일이 이미 지났으면 내년.
export function nextBirthdayMidnight(month, day, now = Date.now()) {
  const kstNow = new Date(now + KST);
  let year = kstNow.getUTCFullYear();
  const at = (y) => Date.UTC(y, month - 1, day) - KST;
  // 생일 당일 하루 동안은 이미 켜진 옥상으로 본다
  if (at(year) + 86400_000 <= now) year += 1;
  return at(year);
}

function clean(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 8_000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('bad json')); }
    });
  });
}

// 간단한 IP별 속도 제한
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = `${ip}:${key}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  return arr.length > max;
}

function publicRoof(r, withKey = false) {
  return {
    id: r.id,
    owner: r.owner,
    igniteAt: r.ignite_at,
    now: Date.now(),
    lanterns: q.lanterns.all(r.id),
    ...(withKey ? { ownerKey: r.owner_key } : {}),
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

function serveStatic(req, res, pathname) {
  let file = path.join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  try {
    if (req.method === 'POST' && url.pathname === '/api/rooftops') {
      if (limited(ip, 'create', 10, 3600_000)) return json(res, 429, { error: '잠시 후 다시 만들어주세요.' });
      const b = await readBody(req);
      const owner = clean(b.owner, 10);
      const month = Number(b.month);
      const day = Number(b.day);
      if (!owner) return json(res, 400, { error: '주인공 이름을 적어주세요.' });
      if (hasBadWord(owner)) return json(res, 400, { error: '주인공 이름을 다시 적어주세요.' });
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return json(res, 400, { error: '생일 날짜를 확인해주세요.' });
      const test = Number(b.testSeconds);
      const igniteAt = test > 0 && test <= 600 ? Date.now() + test * 1000 : nextBirthdayMidnight(month, day);
      const id = crypto.randomBytes(5).toString('base64url');
      const key = crypto.randomBytes(9).toString('base64url');
      q.insertRoof.run(id, owner, igniteAt, key, Date.now());
      return json(res, 201, publicRoof(q.getRoof.get(id), true));
    }

    const m = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})(\/lanterns)?$/);
    if (m) {
      const roof = q.getRoof.get(m[1]);
      if (!roof) return json(res, 404, { error: '옥상을 찾을 수 없어요. 링크를 다시 확인해주세요.' });
      if (req.method === 'GET' && !m[2]) {
        const isOwner = url.searchParams.get('k') === roof.owner_key;
        const body = publicRoof(roof);
        body.isOwner = isOwner;
        // 주인공에게는 문이 열리기 전(자정 15초 전)까지 등불 내용을 숨기고 개수만 알려준다
        if (isOwner && Date.now() < roof.ignite_at - OWNER_EARLY_MS) { body.lanternCount = body.lanterns.length; body.lanterns = []; }
        return json(res, 200, body);
      }
      if (req.method === 'POST' && m[2]) {
        if (limited(ip, 'lantern', 20, 600_000)) return json(res, 429, { error: '등불은 조금 천천히 달아주세요.' });
        const b = await readBody(req);
        const name = clean(b.name, 10);
        const msg = clean(b.msg, 40);
        const color = Number(b.color);
        if (!name || !msg) return json(res, 400, { error: '이름과 남길 말을 적어주세요.' });
        if (!COLORS.has(color)) return json(res, 400, { error: '등불 색을 다시 골라주세요.' });
        if (hasBadWord(msg) || hasBadWord(name)) return json(res, 400, { error: '생일을 축하하는 말로 다시 적어주세요.' });
        const n = q.countLanterns.get(roof.id).n;
        if (n >= MAX_LANTERNS) return json(res, 409, { error: '이 옥상의 전구 줄이 가득 찼어요.' });
        const r = q.insertLantern.run(roof.id, name, msg, color, n, Date.now());
        const lantern = { id: Number(r.lastInsertRowid), name, msg, color, slot: n, by: clean(b.peerId, 12) };
        broadcast(roof.id, { t: 'lantern', lantern });
        return json(res, 201, lantern);
      }
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '없는 주소예요.' });
    serveStatic(req, res, url.pathname);
  } catch (e) {
    json(res, 400, { error: '요청을 처리하지 못했어요. 다시 시도해주세요.' });
  }
});

// ── 실시간 ──
const rooms = new Map(); // roofId -> Map(peerId -> peer)
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

function broadcast(roofId, msg, exceptId = null) {
  const room = rooms.get(roofId);
  if (!room) return;
  const data = JSON.stringify(msg);
  for (const p of room.values()) if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return socket.destroy();
  const roof = q.getRoof.get(url.searchParams.get('room') || '');
  if (!roof) return socket.destroy();
  const isOwner = url.searchParams.get('k') === roof.owner_key;
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (isOwner && Date.now() < roof.ignite_at - OWNER_EARLY_MS) return ws.close(4001, 'locked');
    const room = rooms.get(roof.id) || new Map();
    rooms.set(roof.id, room);
    if (room.size >= ROOM_CAP) return ws.close(4002, 'full');
    const peer = { id: crypto.randomBytes(4).toString('hex'), ws, isOwner, joined: false, name: '', color: 0xf29bb3, hat: 0, x: 0, z: 3, dx: 0, dirty: false, last: 0 };
    room.set(peer.id, peer);

    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (m.t === 'join' && !peer.joined) {
        peer.joined = true;
        peer.name = isOwner ? roof.owner : clean(m.name, 10) || '친구';
        if (hasBadWord(peer.name)) peer.name = '친구';
        peer.color = COLORS.has(Number(m.color)) ? Number(m.color) : 0xf29bb3;
        peer.hat = Number(m.hat) % 4;
        const others = [...room.values()].filter((p) => p.joined && p.id !== peer.id).map(view);
        ws.send(JSON.stringify({ t: 'welcome', you: peer.id, peers: others, now: Date.now() }));
        broadcast(roof.id, { t: 'join', peer: view(peer) }, peer.id);
        broadcast(roof.id, { t: 'count', n: joinedCount(room) });
      } else if (m.t === 'pos' && peer.joined) {
        const now = Date.now();
        if (now - peer.last < 60) return; // 초당 약 15회 이하
        peer.last = now;
        peer.x = clampNum(m.x, -13, 13);
        peer.z = clampNum(m.z, -10, 10);
        peer.dx = clampNum(m.dx, -1, 1);
        peer.dirty = true;
      } else if (m.t === 'hop' && peer.joined) {
        broadcast(roof.id, { t: 'hop', id: peer.id }, peer.id);
      }
    });
    ws.on('close', () => {
      room.delete(peer.id);
      if (peer.joined) {
        broadcast(roof.id, { t: 'leave', id: peer.id });
        broadcast(roof.id, { t: 'count', n: joinedCount(room) });
      }
      if (!room.size) rooms.delete(roof.id);
    });
  });
});

function view(p) {
  return { id: p.id, name: p.name, color: p.color, hat: p.hat, x: p.x, z: p.z, owner: p.isOwner };
}
function joinedCount(room) {
  let n = 0;
  for (const p of room.values()) if (p.joined) n++;
  return n;
}
function clampNum(v, a, b) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : 0;
}

// 위치는 모아서 초당 10번 보낸다
setInterval(() => {
  for (const [roofId, room] of rooms) {
    const moved = [];
    for (const p of room.values()) if (p.dirty) { moved.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.dx.toFixed(2)]); p.dirty = false; }
    if (moved.length) broadcast(roofId, { t: 'state', p: moved });
  }
}, 100);

server.listen(PORT, () => console.log(`생일 옥상 서버: http://localhost:${PORT}`));
