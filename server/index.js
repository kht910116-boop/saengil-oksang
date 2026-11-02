// 생일 옥상 서버: 정적 파일 제공 + REST API + 실시간(WebSocket)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { SERVICE_NAME, MAX_LANTERNS, OWNER_EARLY_MS, RETENTION_DAYS, REPORT_HIDE_THRESHOLD, renderTemplate, validateName, GIFT_ITEMS, PAYMENT_MODE } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'rooftop.db');
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // 비어 있으면 운영자 화면을 열지 않는다
const IP_SALT = process.env.IP_SALT || crypto.randomBytes(16).toString('hex');

const ROOM_CAP = 40;
const KST = 9 * 3600_000;

// ── DB ──
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
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rooftop_id TEXT NOT NULL,
    item TEXT NOT NULL,
    name TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    color INTEGER NOT NULL,
    x REAL NOT NULL,
    z REAL NOT NULL,
    price INTEGER NOT NULL,
    payment TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS gifts_room ON gifts(rooftop_id);
  CREATE TABLE IF NOT EXISTS lantern_reports (
    lantern_id INTEGER NOT NULL,
    reporter TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (lantern_id, reporter)
  );
`);
// 이전 버전 DB에 새 칸 추가
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('rooftops', 'host_key', "TEXT NOT NULL DEFAULT ''");
addColumn('lanterns', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
addColumn('lanterns', 'reports', 'INTEGER NOT NULL DEFAULT 0');

const q = {
  insertRoof: db.prepare('INSERT INTO rooftops (id, owner, ignite_at, owner_key, host_key, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  getRoof: db.prepare('SELECT * FROM rooftops WHERE id = ?'),
  deleteRoof: db.prepare('DELETE FROM rooftops WHERE id = ?'),
  deleteRoofLanterns: db.prepare('DELETE FROM lanterns WHERE rooftop_id = ?'),
  visibleLanterns: db.prepare('SELECT id, name, msg, color, slot FROM lanterns WHERE rooftop_id = ? AND hidden = 0 ORDER BY id'),
  allLanterns: db.prepare('SELECT id, name, msg, color, slot, hidden FROM lanterns WHERE rooftop_id = ? ORDER BY id'),
  countVisible: db.prepare('SELECT COUNT(*) AS n FROM lanterns WHERE rooftop_id = ? AND hidden = 0'),
  nextSlot: db.prepare('SELECT COALESCE(MAX(slot) + 1, 0) AS n, COUNT(*) AS total FROM lanterns WHERE rooftop_id = ?'),
  insertLantern: db.prepare('INSERT INTO lanterns (rooftop_id, name, msg, color, slot, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  getLantern: db.prepare('SELECT * FROM lanterns WHERE id = ? AND rooftop_id = ?'),
  setHidden: db.prepare('UPDATE lanterns SET hidden = ? WHERE id = ?'),
  addReport: db.prepare('INSERT OR IGNORE INTO lantern_reports (lantern_id, reporter, created_at) VALUES (?, ?, ?)'),
  bumpReports: db.prepare('UPDATE lanterns SET reports = reports + 1 WHERE id = ?'),
  reported: db.prepare(`SELECT l.id, l.rooftop_id, l.name, l.msg, l.reports, l.hidden, r.owner
                        FROM lanterns l JOIN rooftops r ON r.id = l.rooftop_id
                        WHERE l.reports > 0 ORDER BY l.hidden ASC, l.reports DESC, l.id DESC LIMIT 200`),
  expired: db.prepare('SELECT id FROM rooftops WHERE ignite_at < ?'),
  gifts: db.prepare('SELECT id, item, name, anonymous, color, x, z, created_at FROM gifts WHERE rooftop_id = ? ORDER BY id'),
  countGifts: db.prepare('SELECT item, COUNT(*) AS n FROM gifts WHERE rooftop_id = ? GROUP BY item'),
  insertGift: db.prepare('INSERT INTO gifts (rooftop_id, item, name, anonymous, color, x, z, price, payment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  deleteRoofGifts: db.prepare('DELETE FROM gifts WHERE rooftop_id = ?'),
  deleteReportsOfRoof: db.prepare('DELETE FROM lantern_reports WHERE lantern_id IN (SELECT id FROM lanterns WHERE rooftop_id = ?)'),
};

// ── 입력 검사 ──
const COLORS = new Set([0xffc46b, 0xf29bb3, 0x8fd3c1, 0xb9a6f2, 0xfbf4e8]);

// 생일(월/일) → 다음 자정(한국 시간)의 시각. 생일 당일 하루 동안은 이미 켜진 옥상으로 본다.
export function nextBirthdayMidnight(month, day, now = Date.now()) {
  let year = new Date(now + KST).getUTCFullYear();
  const at = (y) => Date.UTC(y, month - 1, day) - KST;
  if (at(year) + 86400_000 <= now) year += 1;
  return at(year);
}

function clean(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeEq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length > 0 && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

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
      const type = req.headers['content-type'] || '';
      try {
        if (type.includes('application/x-www-form-urlencoded')) return resolve(Object.fromEntries(new URLSearchParams(data)));
        resolve(data ? JSON.parse(data) : {});
      } catch { reject(new Error('bad body')); }
    });
  });
}

// 간단한 IP별 속도 제한(메모리에만 보관)
const hits = new Map();
function limited(ip, key, max, windowMs) {
  const k = `${ip}:${key}`;
  const now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  return arr.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of hits) if (!arr.some((t) => now - t < 3600_000)) hits.delete(k);
}, 600_000).unref();
const hashIp = (ip) => crypto.createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 24);

// 역할: host(만든 사람) · owner(주인공) · friend
function roleOf(roof, params) {
  if (safeEq(params.h, roof.host_key)) return 'host';
  if (safeEq(params.k, roof.owner_key)) return 'owner';
  return 'friend';
}
const doorOpen = (roof) => Date.now() >= roof.ignite_at - OWNER_EARLY_MS;

// 익명 선물은 보낸 사람 이름을 밖으로 내보내지 않는다(만든 사람·주인공에게도)
const giftView = (g) => ({ id: g.id, item: g.item, name: g.anonymous ? '' : g.name, anonymous: !!g.anonymous, color: g.color, x: g.x, z: g.z });

function roofView(roof, role) {
  const body = { id: roof.id, owner: roof.owner, igniteAt: roof.ignite_at, now: Date.now(), role, maxLanterns: MAX_LANTERNS, paymentMode: PAYMENT_MODE };
  const gifts = q.gifts.all(roof.id);
  if (role === 'owner' && !doorOpen(roof)) { body.gifts = []; body.giftCount = gifts.length; }
  else body.gifts = gifts.map(giftView);
  if (role === 'host') {
    body.lanterns = q.allLanterns.all(roof.id);
    body.ownerKey = roof.owner_key;
    body.hostKey = roof.host_key;
  } else if (role === 'owner' && !doorOpen(roof)) {
    // 주인공에게는 문이 열리기 전까지 등불 내용을 숨기고 개수만 알려준다
    body.lanterns = [];
    body.lanternCount = q.countVisible.get(roof.id).n;
  } else {
    body.lanterns = q.visibleLanterns.all(roof.id);
  }
  return body;
}

// ── 정적 파일 + 카카오톡/SNS 미리보기 ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ics': 'text/calendar; charset=utf-8' };

function kstLabel(ms) {
  const d = new Date(ms + KST);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

function pageMeta(url) {
  const m = url.pathname.match(/^\/r\/([\w-]{4,16})\/?$/);
  const base = { title: `${SERVICE_NAME} · 친구 생일 자정에 다 같이 불을 켜요`, desc: '친구들이 등불을 모으는 동안 주인공은 문밖에서 기다려요. 생일 자정이 되면 문이 열리고 모두의 화면에서 함께 불이 켜져요.' };
  if (!m) return base;
  if (m[1] === 'demo') return { title: `민지의 생일 옥상 (샘플) · ${SERVICE_NAME}`, desc: '등불을 달고 자정 점등을 미리 볼 수 있는 샘플 옥상이에요.' };
  const roof = q.getRoof.get(m[1]);
  if (!roof) return base;
  const role = roleOf(roof, { k: url.searchParams.get('k'), h: url.searchParams.get('h') });
  const date = kstLabel(roof.ignite_at);
  if (role === 'owner') return { title: `${roof.owner}님, 옥상 문이 ${date} 자정에 열려요`, desc: '친구들이 문 너머에서 무언가를 준비하고 있어요. 자정에 들어와 주세요.' };
  const n = q.countVisible.get(roof.id).n;
  return { title: `${roof.owner}의 생일 옥상에 등불을 달아주세요`, desc: `${date} 자정에 다 같이 불을 켜요.${n ? ` 지금 등불 ${n}개가 모였어요.` : ''} ${roof.owner}에게는 비밀이에요.` };
}

let indexCache = null;
function indexHtml() {
  if (!indexCache || process.env.NODE_ENV !== 'production') indexCache = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  return indexCache;
}

// 보안 헤더: 다른 사이트에 끼워 넣기 방지, 파일 형식 추측 방지, 주소 노출 최소화
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
// 글자 파일(js·css·html 등)은 압축해서 보낸다. 같은 파일은 압축 결과를 기억해 둔다.
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest', '.txt']);
const gzCache = new Map();
function sendBody(req, res, headers, body, ext) {
  const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (wantsGzip && COMPRESSIBLE.has(ext) && body.length > 1024) {
    body = zlib.gzipSync(body, { level: 6 });
    headers['content-encoding'] = 'gzip';
    headers.vary = 'Accept-Encoding';
  }
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers, 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveIndex(req, res, url) {
  const meta = pageMeta(url);
  const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escHtml(SERVICE_NAME)}">`,
    `<meta property="og:title" content="${escHtml(meta.title)}">`,
    `<meta property="og:description" content="${escHtml(meta.desc)}">`,
    `<meta property="og:image" content="${escHtml(origin)}/og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:url" content="${escHtml(origin + url.pathname)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="description" content="${escHtml(meta.desc)}">`,
  ].join('\n  ');
  const html = indexHtml()
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(meta.title)}</title>`)
    .replace('</head>', `  ${tags}\n</head>`);
  sendBody(req, res, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }, Buffer.from(html), '.html');
}

function serveStatic(req, res, url) {
  const pathname = url.pathname;
  let file = path.join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html'; // /privacy → privacy.html
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory() || path.basename(file) === 'index.html') return serveIndex(req, res, url);
  const ext = path.extname(file);
  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  };
  if (COMPRESSIBLE.has(ext)) {
    // 작은 글자 파일: 읽어서 압축(결과는 기억)
    const key = file + ':' + fs.statSync(file).mtimeMs;
    let body = gzCache.get(key);
    if (!body) { body = fs.readFileSync(file); gzCache.set(key, body); }
    return sendBody(req, res, headers, body, ext);
  }
  // 음악·이미지: 이어받기(Range)를 지원해서 휴대폰에서 곡을 앞부분부터 바로 튼다
  const size = fs.statSync(file).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start < 0 || end < start) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...SECURITY_HEADERS, ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...SECURITY_HEADERS, ...headers, 'accept-ranges': 'bytes', 'content-length': size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

// ── 운영자 화면 ──
function adminPage(res, key, notice = '') {
  const rows = q.reported.all().map((l) => `
    <tr class="${l.hidden ? 'hidden' : ''}">
      <td>${escHtml(l.owner)}<br><small>${escHtml(l.rooftop_id)}</small></td>
      <td><b>${escHtml(l.name)}</b><br>${escHtml(l.msg)}</td>
      <td>${l.reports}</td>
      <td>${l.hidden ? '숨김' : '보임'}</td>
      <td>
        <form method="post" action="/admin/action"><input type="hidden" name="key" value="${escHtml(key)}"><input type="hidden" name="lantern" value="${l.id}"><input type="hidden" name="roof" value="${escHtml(l.rooftop_id)}">
          <button name="do" value="${l.hidden ? 'show' : 'hide'}">${l.hidden ? '다시 보이기' : '숨기기'}</button>
          <button name="do" value="delete-roof" class="danger">옥상 삭제</button>
        </form>
      </td>
    </tr>`).join('');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>운영자 · ${SERVICE_NAME}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f6f3ee;color:#2a2238}h1{font-size:20px}table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #e4dccf;padding:8px;text-align:left;vertical-align:top;font-size:14px}tr.hidden{opacity:.55}button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #c9bfae;background:#fff;margin:2px 0;cursor:pointer}button.danger{color:#b2405a;border-color:#e3b3bf}.notice{background:#e7f3ec;padding:8px 12px;border-radius:8px}.wrap{overflow-x:auto}</style></head>
<body><h1>신고된 등불</h1>${notice ? `<p class="notice">${escHtml(notice)}</p>` : ''}<p>신고 ${REPORT_HIDE_THRESHOLD}건이 쌓이면 자동으로 숨겨져요.</p>
<div class="wrap"><table><thead><tr><th>옥상</th><th>등불</th><th>신고</th><th>상태</th><th>처리</th></tr></thead><tbody>${rows || '<tr><td colspan="5">신고된 등불이 없어요.</td></tr>'}</tbody></table></div></body></html>`);
}

function deleteRoof(roofId) {
  q.deleteRoofGifts.run(roofId);
  q.deleteReportsOfRoof.run(roofId);
  q.deleteRoofLanterns.run(roofId);
  q.deleteRoof.run(roofId);
  const room = rooms.get(roofId);
  if (room) for (const p of room.values()) p.ws.close(4003, 'deleted');
}

function setLanternHidden(roofId, lanternId, hidden) {
  q.setHidden.run(hidden ? 1 : 0, lanternId);
  broadcast(roofId, { t: hidden ? 'lantern-hide' : 'lantern-show', id: lanternId });
}

// ── HTTP ──
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  // 프록시(Cloudflare 등) 뒤에 둘 때만 전달된 IP를 믿는다. 아니면 위조할 수 있다.
  const ip = (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
  try {
    // 호스팅 상태 확인용
    if (url.pathname === '/healthz') {
      db.prepare('SELECT 1').get();
      return json(res, 200, { ok: true, rooms: rooms.size });
    }
    // 옥상 만들기
    if (req.method === 'POST' && url.pathname === '/api/rooftops') {
      if (limited(ip, 'create', 10, 3600_000)) return json(res, 429, { error: '잠시 후 다시 만들어주세요.' });
      const b = await readBody(req);
      const ownerCheck = validateName(b.owner);
      if (!ownerCheck.ok) return json(res, 400, { error: `주인공 ${ownerCheck.error}` });
      const owner = ownerCheck.value;
      const month = Number(b.month);
      const day = Number(b.day);
      const maxDay = new Date(Date.UTC(2024, month, 0)).getUTCDate(); // 윤년 기준(2월 29일 허용)
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= maxDay)) return json(res, 400, { error: '생일 날짜를 확인해주세요.' });
      const test = Number(b.testSeconds);
      const igniteAt = test > 0 && test <= 600 ? Date.now() + test * 1000 : nextBirthdayMidnight(month, day);
      const id = crypto.randomBytes(5).toString('base64url');
      q.insertRoof.run(id, owner, igniteAt, crypto.randomBytes(9).toString('base64url'), crypto.randomBytes(9).toString('base64url'), Date.now());
      return json(res, 201, roofView(q.getRoof.get(id), 'host'));
    }

    // 옥상 선물 보내기
    const gm = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})\/gifts$/);
    if (gm && req.method === 'POST') {
      const roof = q.getRoof.get(gm[1]);
      if (!roof) return json(res, 404, { error: '옥상을 찾을 수 없어요. 링크를 다시 확인해주세요.' });
      if (limited(ip, 'gift', 10, 600_000)) return json(res, 429, { error: '선물은 10분에 10개까지 보낼 수 있어요. 잠시 후 다시 보내주세요.' });
      const b = await readBody(req);
      const item = GIFT_ITEMS[b.item] ? b.item : null;
      const anonymous = !!b.anonymous;
      const nameCheck = anonymous ? { ok: true, value: '' } : validateName(b.name);
      const name = nameCheck.value;
      const color = Number(b.color);
      if (!item) return json(res, 400, { error: '선물을 다시 골라주세요.' });
      if (!nameCheck.ok) return json(res, 400, { error: `${nameCheck.error} 이름 없이 보내려면 익명으로 보내기를 골라주세요.` });
      if (!COLORS.has(color)) return json(res, 400, { error: '색을 다시 골라주세요.' });
      const used = q.countGifts.all(roof.id).find((r) => r.item === item)?.n || 0;
      if (used >= GIFT_ITEMS[item].limit) return json(res, 409, { error: `이 옥상에는 ${GIFT_ITEMS[item].name}이(가) 가득 찼어요.` });
      // 결제 확인: 지금은 무료. 유료로 바꾸면 여기서 결제 승인 여부를 확인한다.
      if (PAYMENT_MODE !== 'free') return json(res, 503, { error: '결제를 준비하고 있어요.' });
      const x = clampNum(b.x, -11, 11);
      const z = clampNum(b.z, -8, 8);
      // 익명이면 이름을 아예 저장하지 않는다
      const r = q.insertGift.run(roof.id, item, anonymous ? '' : name, anonymous ? 1 : 0, color, x, z, 0, 'free', Date.now());
      const gift = giftView({ id: Number(r.lastInsertRowid), item, name: anonymous ? '' : name, anonymous, color, x, z });
      broadcast(roof.id, { t: 'gift', gift: { ...gift, by: clean(b.peerId, 12) } });
      return json(res, 201, gift);
    }

    const m = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})(?:\/lanterns(?:\/(\d+)\/(hide|show|report))?)?$/);
    if (m) {
      const roof = q.getRoof.get(m[1]);
      if (!roof) return json(res, 404, { error: '옥상을 찾을 수 없어요. 링크를 다시 확인해주세요.' });
      const isLanternPath = url.pathname.includes('/lanterns');

      if (req.method === 'GET' && !isLanternPath) {
        return json(res, 200, roofView(roof, roleOf(roof, { k: url.searchParams.get('k'), h: url.searchParams.get('h') })));
      }

      if (req.method === 'DELETE' && !isLanternPath) {
        const b = await readBody(req);
        if (roleOf(roof, b) !== 'host') return json(res, 403, { error: '옥상을 만든 사람만 지울 수 있어요.' });
        deleteRoof(roof.id);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && isLanternPath && !m[2]) {
        if (limited(ip, 'lantern', 20, 600_000)) return json(res, 429, { error: '등불은 조금 천천히 달아주세요.' });
        const b = await readBody(req);
        const nameCheck = validateName(b.name);
        if (!nameCheck.ok) return json(res, 400, { error: nameCheck.error });
        const name = nameCheck.value;
        // 문구는 직접 받지 않고 준비된 문구의 번호만 받는다
        const msg = Number.isInteger(b.tpl) ? renderTemplate(b.tpl, roof.owner) : null;
        const color = Number(b.color);
        if (!msg) return json(res, 400, { error: '등불에 담을 문구를 골라주세요.' });
        if (!COLORS.has(color)) return json(res, 400, { error: '등불 색을 다시 골라주세요.' });
        const { n, total } = q.nextSlot.get(roof.id);
        if (total >= MAX_LANTERNS) return json(res, 409, { error: '이 옥상의 전구 줄이 가득 찼어요.' });
        const r = q.insertLantern.run(roof.id, name, msg, color, n, Date.now());
        const lantern = { id: Number(r.lastInsertRowid), name, msg, color, slot: n, by: clean(b.peerId, 12) };
        broadcast(roof.id, { t: 'lantern', lantern });
        return json(res, 201, lantern);
      }

      if (req.method === 'POST' && m[2]) {
        const lantern = q.getLantern.get(Number(m[2]), roof.id);
        if (!lantern) return json(res, 404, { error: '등불을 찾을 수 없어요.' });
        const b = await readBody(req);
        if (m[3] === 'report') {
          if (limited(ip, 'report', 30, 3600_000)) return json(res, 429, { error: '잠시 후 다시 신고해주세요.' });
          const added = q.addReport.run(lantern.id, hashIp(ip), Date.now()).changes > 0;
          if (added) {
            q.bumpReports.run(lantern.id);
            if (lantern.reports + 1 >= REPORT_HIDE_THRESHOLD && !lantern.hidden) setLanternHidden(roof.id, lantern.id, true);
          }
          return json(res, 200, { ok: true, already: !added });
        }
        // 숨기기/다시 보이기: 만든 사람은 언제나, 주인공은 문이 열린 뒤에 가능
        const role = roleOf(roof, b);
        const allowed = role === 'host' || (role === 'owner' && doorOpen(roof));
        if (!allowed) return json(res, 403, { error: '이 등불을 숨길 권한이 없어요.' });
        if (m[3] === 'show' && role !== 'host') return json(res, 403, { error: '숨긴 등불은 옥상을 만든 사람만 다시 보이게 할 수 있어요.' });
        setLanternHidden(roof.id, lantern.id, m[3] === 'hide');
        return json(res, 200, { ok: true });
      }
    }

    // 운영자 화면 (ADMIN_KEY 환경변수가 있을 때만)
    if (url.pathname === '/admin' && req.method === 'GET') {
      if (!ADMIN_KEY || !safeEq(url.searchParams.get('key') || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      return adminPage(res, ADMIN_KEY, url.searchParams.get('done') || '');
    }
    if (url.pathname === '/admin/action' && req.method === 'POST') {
      const b = await readBody(req);
      if (!ADMIN_KEY || !safeEq(b.key || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      let done = '';
      const roofId = clean(b.roof, 16);
      if (b.do === 'hide' || b.do === 'show') { setLanternHidden(roofId, Number(b.lantern), b.do === 'hide'); done = b.do === 'hide' ? '숨겼어요.' : '다시 보이게 했어요.'; }
      if (b.do === 'delete-roof') { deleteRoof(roofId); done = '옥상을 삭제했어요.'; }
      res.writeHead(303, { location: `/admin?key=${encodeURIComponent(ADMIN_KEY)}&done=${encodeURIComponent(done)}` });
      return res.end();
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: '없는 주소예요.' });
    serveStatic(req, res, url);
  } catch {
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
  const role = roleOf(roof, { k: url.searchParams.get('k'), h: url.searchParams.get('h') });
  const isOwner = role === 'owner';
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (isOwner && !doorOpen(roof)) return ws.close(4001, 'locked');
    const room = rooms.get(roof.id) || new Map();
    rooms.set(roof.id, room);
    if (room.size >= ROOM_CAP) return ws.close(4002, 'full');
    const peer = { id: crypto.randomBytes(4).toString('hex'), ws, isOwner, joined: false, name: '', color: 0xf29bb3, hat: 0, x: 0, z: 3, dx: 0, dirty: false, last: 0 };
    room.set(peer.id, peer);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'join' && !peer.joined) {
        peer.joined = true;
        const nc = validateName(msg.name);
        peer.name = isOwner ? roof.owner : nc.ok ? nc.value : '친구';
        peer.color = COLORS.has(Number(msg.color)) ? Number(msg.color) : 0xf29bb3;
        peer.hat = Math.abs(Number(msg.hat) || 0) % 4;
        const others = [...room.values()].filter((p) => p.joined && p.id !== peer.id).map(view);
        ws.send(JSON.stringify({ t: 'welcome', you: peer.id, peers: others, now: Date.now() }));
        broadcast(roof.id, { t: 'join', peer: view(peer) }, peer.id);
        broadcast(roof.id, { t: 'count', n: joinedCount(room) });
      } else if (msg.t === 'pos' && peer.joined) {
        const now = Date.now();
        if (now - peer.last < 60) return;
        peer.last = now;
        peer.x = clampNum(msg.x, -13, 13);
        peer.z = clampNum(msg.z, -10, 10);
        peer.dx = clampNum(msg.dx, -1, 1);
        peer.dirty = true;
      } else if (msg.t === 'hop' && peer.joined) {
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

// 보관 기간이 지난 옥상 삭제(하루 한 번)
function cleanupExpired() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400_000;
  const rows = q.expired.all(cutoff);
  for (const r of rows) deleteRoof(r.id);
  if (rows.length) console.log(`보관 기간이 지난 옥상 ${rows.length}개를 삭제했어요.`);
}
cleanupExpired();
setInterval(cleanupExpired, 86400_000).unref();

server.listen(PORT, () => console.log(`${SERVICE_NAME} 서버: http://localhost:${PORT}`));

// 호스팅이 서버를 재시작할 때: 새 연결을 받지 않고, 접속 중인 사람에게 알린 뒤 DB를 닫는다
function shutdown(sig) {
  console.log(`${sig}: 서버를 정리하고 종료해요.`);
  server.close();
  for (const room of rooms.values()) for (const p of room.values()) p.ws.close(1012, 'restart');
  setTimeout(() => { try { db.close(); } catch { /* 이미 닫힘 */ } process.exit(0); }, 500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
