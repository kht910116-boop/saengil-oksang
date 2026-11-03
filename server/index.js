// 오늘의 주인공 서버: 정적 파일 제공 + REST API + 실시간(WebSocket)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { createPush } from './push.js';
import { SERVICE_NAME, MAX_LANTERNS, OWNER_EARLY_MS, RETENTION_DAYS, REPORT_HIDE_THRESHOLD, renderTemplate, validateName, GIFT_ITEMS, PAYMENT_MODE,
  nextReveal, revealLabel, LANTERN_RELATIONS, MAX_YEARS, THANKS_TEMPLATES,
  closeAt, MAX_ROOFTOPS_PER_DAY, MAX_DAYS_AHEAD, VENUES, DEFAULT_VENUE, OUTFITS, DEFAULT_OUTFIT, ACCESSORIES } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'rooftop.db');
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // 비어 있으면 운영자 화면을 열지 않는다
const IP_SALT = process.env.IP_SALT || crypto.randomBytes(16).toString('hex');

const ROOM_CAP = 40; // 한 파티장에 아바타로 들어올 수 있는 인원(넘치면 구경 모드)
const SOCKET_CAP = 400; // 한 파티장의 전체 연결(구경 포함)
const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
const BACKUP_KEEP = 7;
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
addColumn('lanterns', 'rel', 'INTEGER NOT NULL DEFAULT -1');
addColumn('lanterns', 'years', 'INTEGER NOT NULL DEFAULT 0');
addColumn('rooftops', 'ref', "TEXT NOT NULL DEFAULT ''");
addColumn('rooftops', 'reveal_hour', 'INTEGER NOT NULL DEFAULT 0');
addColumn('rooftops', 'thanks', 'INTEGER NOT NULL DEFAULT -1');
addColumn('rooftops', 'candles_out', 'INTEGER NOT NULL DEFAULT 0');
addColumn('rooftops', 'end_at', 'INTEGER NOT NULL DEFAULT 0');
addColumn('rooftops', 'venue', "TEXT NOT NULL DEFAULT 'rooftop'");
addColumn('rooftops', 'owner_seen', 'INTEGER NOT NULL DEFAULT 0');
// 이전 파티장들에도 닫는 시각을 채운다
for (const r of db.prepare('SELECT id, ignite_at FROM rooftops WHERE end_at = 0').all()) db.prepare('UPDATE rooftops SET end_at = ? WHERE id = ?').run(closeAt(r.ignite_at), r.id);
db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (day TEXT NOT NULL, type TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, type));
  CREATE TABLE IF NOT EXISTS client_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, msg TEXT NOT NULL, place TEXT NOT NULL, ua TEXT NOT NULL);
`);

const push = createPush(db, { dataDir: path.dirname(DB_PATH), serviceName: SERVICE_NAME });

const q = {
  insertRoof: db.prepare('INSERT INTO rooftops (id, owner, ignite_at, owner_key, host_key, created_at, ref, reveal_hour, end_at, venue) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  ended: db.prepare('SELECT id FROM rooftops WHERE end_at > 0 AND end_at <= ?'),
  metricToday: db.prepare('SELECT n FROM metrics WHERE day = ? AND type = ?'),
  setThanks: db.prepare('UPDATE rooftops SET thanks = ? WHERE id = ?'),
  setCandles: db.prepare('UPDATE rooftops SET candles_out = 1 WHERE id = ?'),
  setOwnerSeen: db.prepare('UPDATE rooftops SET owner_seen = ? WHERE id = ? AND owner_seen = 0'),
  metric: db.prepare('INSERT INTO metrics (day, type, n) VALUES (?, ?, 1) ON CONFLICT(day, type) DO UPDATE SET n = n + 1'),
  metricsSince: db.prepare('SELECT day, type, n FROM metrics WHERE day >= ? ORDER BY day DESC'),
  insertError: db.prepare('INSERT INTO client_errors (at, msg, place, ua) VALUES (?, ?, ?, ?)'),
  recentErrors: db.prepare('SELECT at, msg, place, ua FROM client_errors ORDER BY id DESC LIMIT 50'),
  pruneErrors: db.prepare('DELETE FROM client_errors WHERE id <= (SELECT MAX(id) FROM client_errors) - 500'),
  getRoof: db.prepare('SELECT * FROM rooftops WHERE id = ?'),
  deleteRoof: db.prepare('DELETE FROM rooftops WHERE id = ?'),
  deleteRoofLanterns: db.prepare('DELETE FROM lanterns WHERE rooftop_id = ?'),
  visibleLanterns: db.prepare('SELECT id, name, msg, color, slot, rel, years FROM lanterns WHERE rooftop_id = ? AND hidden = 0 ORDER BY id'),
  allLanterns: db.prepare('SELECT id, name, msg, color, slot, hidden, rel, years FROM lanterns WHERE rooftop_id = ? ORDER BY id'),
  countVisible: db.prepare('SELECT COUNT(*) AS n FROM lanterns WHERE rooftop_id = ? AND hidden = 0'),
  nextSlot: db.prepare('SELECT COALESCE(MAX(slot) + 1, 0) AS n, COUNT(*) AS total FROM lanterns WHERE rooftop_id = ?'),
  insertLantern: db.prepare('INSERT INTO lanterns (rooftop_id, name, msg, color, slot, created_at, rel, years) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
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

// 생일 공개 시각 계산은 src/config.js 의 nextReveal(2월 29일 처리 포함)을 쓴다
export const nextBirthdayMidnight = (month, day, now) => nextReveal(month, day, 0, now);

// 측정: 날짜별 이벤트 수만 센다(누가 했는지는 남기지 않음)
const kstDay = (ms = Date.now()) => new Date(ms + KST).toISOString().slice(0, 10);
function count(type) {
  try { q.metric.run(kstDay(), type); } catch { /* 측정 실패는 서비스에 영향 없음 */ }
}
const CLIENT_EVENTS = new Set(['landing_visit', 'venue_preview', 'demo_visit', 'friend_visit', 'owner_door', 'owner_enter', 'ignite_seen', 'letters_open',
  'share_click', 'cta_click', 'photo_save', 'video_save', 'calendar_click', 'react', 'inapp_open_external', 'webgl_fail', 'group_photo_save', 'memory_save', 'lite_on', 'lite_off', 'spot_use', 'venue_preview', 'emote', 'group_motion']);

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
  const body = {
    id: roof.id, owner: roof.owner, igniteAt: roof.ignite_at, now: Date.now(), role, maxLanterns: MAX_LANTERNS, paymentMode: PAYMENT_MODE,
    endAt: roof.end_at,
    venue: VENUES[roof.venue] ? roof.venue : DEFAULT_VENUE,
    thanks: roof.thanks >= 0 ? THANKS_TEMPLATES[roof.thanks] || null : null,
    candlesOut: !!roof.candles_out,
  };
  const gifts = q.gifts.all(roof.id);
  if (role === 'owner' && !doorOpen(roof)) { body.gifts = []; body.giftCount = gifts.length; }
  else body.gifts = gifts.map(giftView);
  if (role === 'host') {
    body.lanterns = q.allLanterns.all(roof.id);
    body.ownerKey = roof.owner_key;
    body.hostKey = roof.host_key;
    // 준비 현황판: 주인공이 링크를 열어봤는지, 지금 몇 명이 와 있는지
    body.ownerSeen = roof.owner_seen || 0;
    const room = rooms.get(roof.id);
    body.online = room ? [...room.values()].filter((p) => p.joined).length : 0;
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

function pageMeta(url) {
  const m = url.pathname.match(/^\/r\/([\w-]{4,16})\/?$/);
  const base = { title: `${SERVICE_NAME} · 친구 생일에 다 같이 불을 켜요`, desc: '친구들이 등불을 모으는 동안 주인공은 문밖에서 기다려요. 정한 시각이 되면 문이 열리고 모두의 화면에서 함께 불이 켜져요.' };
  if (!m) return base;
  if (m[1] === 'demo') return { title: `민지의 생일 파티 (샘플) · ${SERVICE_NAME}`, desc: '등불을 달고 점등을 미리 볼 수 있는 샘플 파티장이에요.', venue: DEFAULT_VENUE };
  const roof = q.getRoof.get(m[1]);
  if (!roof) return base;
  const role = roleOf(roof, { k: url.searchParams.get('k'), h: url.searchParams.get('h') });
  const when = revealLabel(roof.ignite_at);
  const venue = VENUES[roof.venue] ? roof.venue : DEFAULT_VENUE;
  const place = VENUES[venue].name;
  if (role === 'owner') return { title: `${roof.owner}님, 파티장 문이 ${when}에 열려요`, desc: '친구들이 문 너머에서 무언가를 준비하고 있어요. 그 시각에 들어와 주세요.', venue };
  const n = q.countVisible.get(roof.id).n;
  return { title: `${roof.owner}의 생일 파티(${place})에 등불을 달아주세요`, desc: `${when}에 다 같이 불을 켜요.${n ? ` 지금 등불 ${n}개가 모였어요.` : ''} ${roof.owner}에게는 비밀이에요.`, venue };
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
    `<meta property="og:image" content="${escHtml(origin)}${meta.venue && fs.existsSync(path.join(DIST, 'og', `${meta.venue}.png`)) ? `/og/${meta.venue}.png` : '/og.png'}">`,
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
    'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : pathname === '/sw.js' ? 'no-cache' : 'public, max-age=3600',
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
          <button name="do" value="delete-roof" class="danger">파티장 삭제</button>
        </form>
      </td>
    </tr>`).join('');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>운영자 · ${SERVICE_NAME}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f6f3ee;color:#2a2238}h1{font-size:20px}table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #e4dccf;padding:8px;text-align:left;vertical-align:top;font-size:14px}tr.hidden{opacity:.55}button{font:inherit;padding:6px 10px;border-radius:8px;border:1px solid #c9bfae;background:#fff;margin:2px 0;cursor:pointer}button.danger{color:#b2405a;border-color:#e3b3bf}.notice{background:#e7f3ec;padding:8px 12px;border-radius:8px}.wrap{overflow-x:auto}</style></head>
<body><p><a href="/admin/stats?key=${encodeURIComponent(key)}">통계와 오류 보기</a> · <a href="/admin/backup?key=${encodeURIComponent(key)}">지금 백업 내려받기</a></p><h1>신고된 등불</h1>${notice ? `<p class="notice">${escHtml(notice)}</p>` : ''}<p>신고 ${REPORT_HIDE_THRESHOLD}건이 쌓이면 자동으로 숨겨져요.</p>
<div class="wrap"><table><thead><tr><th>파티장</th><th>등불</th><th>신고</th><th>상태</th><th>처리</th></tr></thead><tbody>${rows || '<tr><td colspan="5">신고된 등불이 없어요.</td></tr>'}</tbody></table></div></body></html>`);
}

// 운영자 통계: 최근 14일 이벤트 수와 핵심 비율, 최근 화면 오류
function statsPage(res) {
  const since = kstDay(Date.now() - 13 * 86400_000);
  const rows = q.metricsSince.all(since);
  const days = [...new Set(rows.map((r) => r.day))].sort().reverse();
  const types = [...new Set(rows.map((r) => r.type))].sort();
  const get = (d, t) => rows.find((r) => r.day === d && r.type === t)?.n || 0;
  const sum = (t) => rows.filter((r) => r.type === t).reduce((a, r) => a + r.n, 0);
  const ratio = (a, b) => (b ? (a / b).toFixed(2) : '-');
  const created = sum('rooftop_created');
  const kpis = [
    ['만든 파티장', created],
    ['다른 파티장에서 이어서 만든 파티장(퍼짐)', `${sum('rooftop_created_ref')} (${created ? Math.round((sum('rooftop_created_ref') / created) * 100) : 0}%)`],
    ['파티장당 친구 방문', ratio(sum('friend_visit'), created)],
    ['파티장당 등불', ratio(sum('lantern_added'), created)],
    ['파티장당 선물', ratio(sum('gift_added'), created)],
    ['주인공 입장 / 문 앞 대기', `${sum('owner_enter')} / ${sum('owner_door')}`],
    ['"내 파티 만들기" 누름', sum('cta_click')],
    ['기념사진 저장', sum('photo_save')],
    ['화면 오류', sum('client_error')],
  ];
  const errs = q.recentErrors.all();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
  res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>통계 · ${SERVICE_NAME}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;background:#f6f3ee;color:#2a2238}h1{font-size:20px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;background:#fff;font-size:13px}td,th{border-bottom:1px solid #e4dccf;padding:6px 8px;text-align:left;white-space:nowrap}.wrap{overflow-x:auto}.kpi td:last-child{font-weight:700;font-variant-numeric:tabular-nums}</style></head>
<body><h1>최근 14일</h1><div class="wrap"><table class="kpi">${kpis.map(([k, v]) => `<tr><td>${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('')}</table></div>
<h2>날짜별</h2><div class="wrap"><table><thead><tr><th>이벤트</th>${days.map((d) => `<th>${d.slice(5)}</th>`).join('')}</tr></thead><tbody>
${types.map((t) => `<tr><td>${escHtml(t)}</td>${days.map((d) => `<td>${get(d, t) || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<h2>최근 화면 오류</h2><div class="wrap"><table><thead><tr><th>시각</th><th>내용</th><th>위치</th><th>기기</th></tr></thead><tbody>
${errs.map((e) => `<tr><td>${new Date(e.at + KST).toISOString().slice(5, 16).replace('T', ' ')}</td><td>${escHtml(e.msg)}</td><td>${escHtml(e.place)}</td><td>${escHtml(e.ua.slice(0, 60))}</td></tr>`).join('') || '<tr><td colspan="4">없어요</td></tr>'}</tbody></table></div></body></html>`);
}

// 백업: 하루 한 번 DB 스냅숏을 만들고 최근 7개만 남긴다. 운영자는 /admin/backup 으로 내려받아 다른 곳에 보관한다.
function makeBackup(force = false) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `rooftop-${kstDay()}.db`);
  if (force || !fs.existsSync(file)) {
    const tmp = `${file}.tmp`;
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    fs.renameSync(tmp, file);
    const old = fs.readdirSync(BACKUP_DIR).filter((f) => /^rooftop-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(BACKUP_KEEP);
    for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f), { force: true });
  }
  return file;
}

function deleteRoof(roofId, closeCode = 4003) {
  q.deleteRoofGifts.run(roofId);
  q.deleteReportsOfRoof.run(roofId);
  q.deleteRoofLanterns.run(roofId);
  q.deleteRoof.run(roofId);
  photoAt.delete(roofId);
  for (const k of fxAt.keys()) if (k.startsWith(`${roofId}:`)) fxAt.delete(k);
  push.removeRoof(roofId);
  const room = rooms.get(roofId);
  if (room) for (const p of room.values()) p.ws.close(closeCode, closeCode === 4004 ? 'ended' : 'deleted');
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
    // 오늘 더 만들 수 있는 파티장 수
    if (req.method === 'GET' && url.pathname === '/api/capacity') {
      return json(res, 200, capacity());
    }
    // 파티장 만들기
    if (req.method === 'POST' && url.pathname === '/api/rooftops') {
      if (capacity().left <= 0) return json(res, 429, { error: '오늘 만들 수 있는 파티장이 다 찼어요. 내일 0시에 다시 열려요.', full: true });
      // 남용 방지: 한 사람이 한 시간에 5개, 하루에 20개까지
      if (limited(ip, 'create', 5, 3600_000) || limited(ip, 'create-day', 20, 86400_000)) return json(res, 429, { error: '파티장을 너무 많이 만들었어요. 잠시 후 다시 만들어주세요.' });
      const b = await readBody(req);
      const ownerCheck = validateName(b.owner);
      if (!ownerCheck.ok) return json(res, 400, { error: `주인공 ${ownerCheck.error}` });
      const owner = ownerCheck.value;
      const month = Number(b.month);
      const day = Number(b.day);
      const maxDay = new Date(Date.UTC(2024, month, 0)).getUTCDate(); // 윤년 기준(2월 29일 허용)
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= maxDay)) return json(res, 400, { error: '생일 날짜를 확인해주세요.' });
      const hour = b.hour === undefined ? 0 : Number(b.hour);
      if (!(Number.isInteger(hour) && hour >= 0 && hour <= 23)) return json(res, 400, { error: '공개 시각을 다시 골라주세요.' });
      const test = Number(b.testSeconds);
      const isTest = test > 0 && test <= 600;
      const igniteAt = isTest ? Date.now() + test * 1000 : nextReveal(month, day, hour);
      if (!isTest && igniteAt - Date.now() > MAX_DAYS_AHEAD * 86400_000) return json(res, 400, { error: `생일 ${MAX_DAYS_AHEAD}일 전부터 파티장을 만들 수 있어요.` });
      // 시험용 파티장은 점등 10분 뒤(시험 코드는 testEndSeconds로 더 짧게) 닫는다
      const testEnd = Number(b.testEndSeconds);
      const endAt = isTest ? igniteAt + (testEnd > 0 && testEnd <= 600 ? testEnd * 1000 : 600_000) : closeAt(igniteAt);
      // 다른 파티장에서 "내 파티도 만들기"로 왔으면 출처를 남긴다(퍼짐 측정)
      const ref = typeof b.ref === 'string' && /^[\w-]{4,16}$/.test(b.ref) && q.getRoof.get(b.ref) ? b.ref : '';
      const venue = b.venue === undefined ? DEFAULT_VENUE : b.venue;
      if (typeof venue !== 'string' || !Object.hasOwn(VENUES, venue)) return json(res, 400, { error: '파티 장소를 다시 골라주세요.' });
      const id = crypto.randomBytes(5).toString('base64url');
      q.insertRoof.run(id, owner, igniteAt, crypto.randomBytes(9).toString('base64url'), crypto.randomBytes(9).toString('base64url'), Date.now(), ref, hour, endAt, venue);
      count('rooftop_created');
      if (ref) count('rooftop_created_ref');
      return json(res, 201, roofView(q.getRoof.get(id), 'host'));
    }

    // 파티장 선물 보내기
    // 점등 알림(웹 푸시)
    if (req.method === 'GET' && url.pathname === '/api/push/key') return json(res, 200, { key: push.publicKey });
    const pm = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})\/push$/);
    if (pm && (req.method === 'POST' || req.method === 'DELETE')) {
      const roof = q.getRoof.get(pm[1]);
      if (!roof) return json(res, 404, { error: '파티장을 찾을 수 없어요.' });
      const b = await readBody(req);
      if (req.method === 'DELETE') { push.unsubscribe(roof.id, b.endpoint); return json(res, 200, { ok: true }); }
      if (roof.ignite_at <= Date.now()) return json(res, 400, { error: '이미 점등이 지났어요.' });
      if (limited(ip, 'push', 20, 600_000)) return json(res, 429, { error: '잠시 후 다시 시도해주세요.' });
      const r = push.subscribe(roof.id, b.sub, roleOf(roof, b));
      if (!r.ok) return json(res, 400, { error: r.error });
      count('push_subscribe');
      return json(res, 201, { ok: true });
    }
    const gm = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})\/gifts$/);
    if (gm && req.method === 'POST') {
      const roof = q.getRoof.get(gm[1]);
      if (!roof) return json(res, 404, { error: '파티장을 찾을 수 없어요. 링크를 다시 확인해주세요.' });
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
      if (used >= GIFT_ITEMS[item].limit) return json(res, 409, { error: `이 파티장에는 ${GIFT_ITEMS[item].name}이(가) 가득 찼어요.` });
      // 결제 확인: 지금은 무료. 유료로 바꾸면 여기서 결제 승인 여부를 확인한다.
      if (PAYMENT_MODE !== 'free') return json(res, 503, { error: '결제를 준비하고 있어요.' });
      const x = clampNum(b.x, -11, 11);
      const z = clampNum(b.z, -8, 8);
      // 익명이면 이름을 아예 저장하지 않는다
      const r = q.insertGift.run(roof.id, item, anonymous ? '' : name, anonymous ? 1 : 0, color, x, z, 0, 'free', Date.now());
      const gift = giftView({ id: Number(r.lastInsertRowid), item, name: anonymous ? '' : name, anonymous, color, x, z });
      broadcast(roof.id, { t: 'gift', gift: { ...gift, by: clean(b.peerId, 12) } });
      count('gift_added');
      return json(res, 201, gift);
    }

    // 주인공의 답례·촛불 끄기
    const om = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})\/(thanks|candles)$/);
    if (om && req.method === 'POST') {
      const roof = q.getRoof.get(om[1]);
      if (!roof) return json(res, 404, { error: '파티장을 찾을 수 없어요. 링크를 다시 확인해주세요.' });
      const b = await readBody(req);
      if (roleOf(roof, b) !== 'owner') return json(res, 403, { error: '주인공만 할 수 있어요.' });
      if (Date.now() < roof.ignite_at) return json(res, 403, { error: '점등 뒤에 할 수 있어요.' });
      if (om[2] === 'thanks') {
        const tpl = Number(b.tpl);
        if (!Number.isInteger(tpl) || !THANKS_TEMPLATES[tpl]) return json(res, 400, { error: '답례 문구를 골라주세요.' });
        q.setThanks.run(tpl, roof.id);
        broadcast(roof.id, { t: 'thanks', text: THANKS_TEMPLATES[tpl] });
        count('thanks_sent');
        return json(res, 200, { ok: true, text: THANKS_TEMPLATES[tpl] });
      }
      if (roof.candles_out) return json(res, 200, { ok: true });
      q.setCandles.run(roof.id);
      count('candles_blown');
      // 모두의 화면에서 같은 박자로 생일 노래를 부른 뒤 촛불이 꺼진다
      const songAt = Date.now() + 1500;
      broadcast(roof.id, { t: 'candles', songAt });
      return json(res, 200, { ok: true, songAt });
    }

    // 화면에서 보내는 측정 이벤트(종류만, 개인 정보 없음)
    if (url.pathname === '/api/events' && req.method === 'POST') {
      if (limited(ip, 'events', 200, 600_000)) return json(res, 429, { ok: false });
      const b = await readBody(req);
      if (CLIENT_EVENTS.has(b.type)) count(b.type);
      return json(res, 200, { ok: true });
    }
    // 화면에서 난 오류 기록(운영자가 보도록)
    if (url.pathname === '/api/client-errors' && req.method === 'POST') {
      if (limited(ip, 'cerr', 20, 600_000)) return json(res, 429, { ok: false });
      const b = await readBody(req);
      q.insertError.run(Date.now(), clean(b.msg, 300) || '(내용 없음)', clean(b.place, 120), clean(req.headers['user-agent'], 160));
      q.pruneErrors.run();
      count('client_error');
      return json(res, 200, { ok: true });
    }

    const m = url.pathname.match(/^\/api\/rooftops\/([\w-]{4,16})(?:\/lanterns(?:\/(\d+)\/(hide|show|report))?)?$/);
    if (m) {
      const roof = q.getRoof.get(m[1]);
      if (!roof) return json(res, 404, { error: '파티장을 찾을 수 없어요. 이미 닫힌 파티장이거나 링크가 잘못됐어요.' });
      const isLanternPath = url.pathname.includes('/lanterns');

      if (req.method === 'GET' && !isLanternPath) {
        const role = roleOf(roof, { k: url.searchParams.get('k'), h: url.searchParams.get('h') });
        if (role === 'owner' && !roof.owner_seen) q.setOwnerSeen.run(Date.now(), roof.id);
        return json(res, 200, roofView(roof, role));
      }

      if (req.method === 'DELETE' && !isLanternPath) {
        const b = await readBody(req);
        if (roleOf(roof, b) !== 'host') return json(res, 403, { error: '파티장을 만든 사람만 지울 수 있어요.' });
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
        const rel = Number.isInteger(b.rel) && b.rel >= 0 && b.rel < LANTERN_RELATIONS.length ? b.rel : -1;
        const years = Number.isInteger(b.years) && b.years >= 0 && b.years <= MAX_YEARS ? b.years : 0;
        const { n, total } = q.nextSlot.get(roof.id);
        if (total >= MAX_LANTERNS) return json(res, 409, { error: '이 파티장의 전구 줄이 가득 찼어요.' });
        const r = q.insertLantern.run(roof.id, name, msg, color, n, Date.now(), rel, years);
        const lantern = { id: Number(r.lastInsertRowid), name, msg, color, slot: n, rel, years, by: clean(b.peerId, 12) };
        broadcast(roof.id, { t: 'lantern', lantern });
        count('lantern_added');
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
        if (m[3] === 'show' && role !== 'host') return json(res, 403, { error: '숨긴 등불은 파티장을 만든 사람만 다시 보이게 할 수 있어요.' });
        setLanternHidden(roof.id, lantern.id, m[3] === 'hide');
        return json(res, 200, { ok: true });
      }
    }

    // 운영자 화면 (ADMIN_KEY 환경변수가 있을 때만)
    if (url.pathname === '/admin' && req.method === 'GET') {
      if (!ADMIN_KEY || !safeEq(url.searchParams.get('key') || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      return adminPage(res, ADMIN_KEY, url.searchParams.get('done') || '');
    }
    if (url.pathname === '/admin/stats' && req.method === 'GET') {
      if (!ADMIN_KEY || !safeEq(url.searchParams.get('key') || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      return statsPage(res);
    }
    if (url.pathname === '/admin/backup' && req.method === 'GET') {
      if (!ADMIN_KEY || !safeEq(url.searchParams.get('key') || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      const file = makeBackup(true);
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(file)}"`, 'cache-control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === '/admin/action' && req.method === 'POST') {
      const b = await readBody(req);
      if (!ADMIN_KEY || !safeEq(b.key || '', ADMIN_KEY)) { res.writeHead(404); return res.end(); }
      let done = '';
      const roofId = clean(b.roof, 16);
      if (b.do === 'hide' || b.do === 'show') { setLanternHidden(roofId, Number(b.lantern), b.do === 'hide'); done = b.do === 'hide' ? '숨겼어요.' : '다시 보이게 했어요.'; }
      if (b.do === 'delete-roof') { deleteRoof(roofId); done = '파티장을 삭제했어요.'; }
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
  const isHost = role === 'host';
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (isOwner && !doorOpen(roof)) return ws.close(4001, 'locked');
    const room = rooms.get(roof.id) || new Map();
    rooms.set(roof.id, room);
    if (room.size >= SOCKET_CAP) return ws.close(4002, 'full');
    const peer = { id: crypto.randomBytes(4).toString('hex'), ws, isOwner, joined: false, spectator: false, name: '', color: 0xf29bb3, hat: 0, outfit: DEFAULT_OUTFIT, x: 0, z: 3, dx: 0, dirty: false, last: 0, lastHop: 0, lastReact: 0 };
    room.set(peer.id, peer);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'join' && !peer.joined) {
        // 아바타 자리가 다 찼으면 구경 모드(주인공은 언제나 아바타로). 자기 자신은 세기 전에 판단한다.
        peer.spectator = !isOwner && avatarCount(room) >= ROOM_CAP;
        peer.joined = true;
        count(peer.spectator ? 'ws_spectator' : 'ws_join');
        const nc = validateName(msg.name);
        peer.name = isOwner ? roof.owner : nc.ok ? nc.value : '친구';
        peer.color = COLORS.has(Number(msg.color)) ? Number(msg.color) : 0xf29bb3;
        peer.hat = Math.abs(Number(msg.hat) || 0) % 4;
        peer.outfit = typeof msg.outfit === 'string' && Object.hasOwn(OUTFITS, msg.outfit) ? msg.outfit : DEFAULT_OUTFIT;
        peer.acc = typeof msg.acc === 'string' && Object.hasOwn(ACCESSORIES, msg.acc) ? msg.acc : 'none';
        const others = [...room.values()].filter((p) => p.joined && !p.spectator && p.id !== peer.id).map(view);
        ws.send(JSON.stringify({ t: 'welcome', you: peer.id, peers: others, now: Date.now(), spectator: peer.spectator }));
        if (!peer.spectator) broadcast(roof.id, { t: 'join', peer: view(peer) }, peer.id);
        broadcast(roof.id, countMsg(room));
      } else if (msg.t === 'pos' && peer.joined && !peer.spectator) {
        const now = Date.now();
        if (now - peer.last < 60) return;
        peer.last = now;
        peer.x = clampNum(msg.x, -40, 40); // 넓어진 장소(배 길이 등)를 담는 범위
        peer.z = clampNum(msg.z, -40, 40);
        peer.dx = clampNum(msg.dx, -1, 1);
        peer.dirty = true;
      } else if (msg.t === 'hop' && peer.joined && !peer.spectator) {
        const now = Date.now();
        if (now - peer.lastHop < 1000) return; // 도배 방지
        peer.lastHop = now;
        broadcast(roof.id, { t: 'hop', id: peer.id }, peer.id);
      } else if (msg.t === 'photo' && peer.joined && (isOwner || isHost) && doorOpen(roof)) {
        // 단체 사진: 주인공(또는 만든 사람)이 누르면 5초 뒤 모두의 화면에서 같은 순간을 찍는다
        const now = Date.now();
        if (now - (photoAt.get(roof.id) || 0) < 15_000) return;
        photoAt.set(roof.id, now);
        count('group_photo');
        broadcast(roof.id, { t: 'photo', at: now + 5000 });
      } else if (msg.t === 'emote' && peer.joined && !peer.spectator && EMOTES.has(msg.kind)) {
        // 캐릭터 동작: 한 사람은 0.8초에 한 번
        const now = Date.now();
        if (now - (peer.lastEmote || 0) < 800) return;
        peer.lastEmote = now;
        broadcast(roof.id, { t: 'emote', id: peer.id, kind: msg.kind }, peer.id);
      } else if (msg.t === 'gmo' && peer.joined && !peer.spectator && GROUP_MOTIONS.has(msg.kind) && Array.isArray(msg.ids)) {
        // 같이 하는 동작: 같은 방의 실제 참가자만, 사람당 3초에 한 번. 시작 시각은 서버가 정해 모두 맞춘다.
        const now = Date.now();
        if (now - (peer.lastGmo || 0) < 3000) return;
        peer.lastGmo = now;
        const ids = msg.ids.filter((id) => typeof id === 'string' && room.has(id) && id !== peer.id).slice(0, 7);
        if (!ids.length) return;
        broadcast(roof.id, { t: 'gmo', kind: msg.kind, by: peer.id, ids, cx: clampNum(msg.cx, -40, 40), cz: clampNum(msg.cz, -40, 40), ang: clampNum(msg.ang, -7, 7), at: now + 300 }, peer.id);
      } else if (msg.t === 'fx' && peer.joined && !peer.spectator && FX_IDS.has(msg.id)) {
        // 장소 놀거리(뱃고동·눈사람·열기구 등): 모두의 화면에서 같이 일어나게 중계. 한 사람은 1.5초에 한 번, 같은 놀거리는 방마다 1초에 한 번
        const now = Date.now();
        if (now - (peer.lastFx || 0) < 1500) return;
        const key = `${roof.id}:${msg.id}`;
        if (now - (fxAt.get(key) || 0) < 1000) return;
        peer.lastFx = now;
        fxAt.set(key, now);
        broadcast(roof.id, { t: 'fx', id: msg.id, by: peer.id }, peer.id);
      } else if (msg.t === 'react' && peer.joined && REACTIONS.has(msg.kind)) {
        const now = Date.now();
        if (now - peer.lastReact < 700) return; // 도배 방지
        peer.lastReact = now;
        broadcast(roof.id, { t: 'react', id: peer.spectator ? null : peer.id, kind: msg.kind }, peer.id);
      }
    });
    ws.on('close', () => {
      room.delete(peer.id);
      if (peer.joined) {
        if (!peer.spectator) broadcast(roof.id, { t: 'leave', id: peer.id });
        broadcast(roof.id, countMsg(room));
      }
      if (!room.size) rooms.delete(roof.id);
    });
  });
});

function view(p) {
  return { id: p.id, name: p.name, color: p.color, hat: p.hat, outfit: p.outfit, acc: p.acc || 'none', x: p.x, z: p.z, owner: p.isOwner };
}
const REACTIONS = new Set(['clap', 'heart', 'party']);
const GROUP_MOTIONS = new Set(['highfive', 'hug', 'ring', 'conga', 'selfie']);
const EMOTES = new Set(['hop', 'sit', 'wave', 'dance', 'bow', 'flip', 'spin', 'cheer', 'wiggle', 'surprise', 'cry', 'stretch', 'lie', 'sleep', 'heart', 'eat', 'cheers']);
const FX_IDS = new Set(['horn', 'wheel', 'aurora', 'snowman', 'fire', 'ride1', 'ride2', 'ride3', 'bell', 'tpA', 'tpB', 'disco']);
const fxAt = new Map(); // 놀거리 도배 방지(파티장:놀거리 → 마지막 시각)
const photoAt = new Map(); // 파티장별 마지막 단체 사진 시각(도배 방지)
function avatarCount(room) {
  let n = 0;
  for (const p of room.values()) if (p.joined && !p.spectator) n++;
  return n;
}
function countMsg(room) {
  let n = 0;
  let watching = 0;
  for (const p of room.values()) if (p.joined) { if (p.spectator) watching++; else n++; }
  return { t: 'count', n, watching };
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

// 하루짜리 파티장: 닫는 시각(생일 다음 날 0시 5분)이 지난 파티장은 접속자에게 알리고 지운다(매분 확인)
function closeEnded() {
  const rows = q.ended.all(Date.now());
  for (const r of rows) {
    broadcast(r.id, { t: 'ended' });
    deleteRoof(r.id, 4004);
  }
  if (rows.length) console.log(`닫는 시각이 지난 파티장 ${rows.length}개를 닫고 지웠어요.`);
  // 혹시 닫는 시각이 없는 오래된 파티장(보관 기간 초과)도 지운다
  for (const r of q.expired.all(Date.now() - RETENTION_DAYS * 86400_000)) deleteRoof(r.id, 4004);
}
closeEnded();
setInterval(closeEnded, Number(process.env.CLOSE_CHECK_MS) || 60_000).unref(); // 시험에서는 더 짧게
setInterval(() => push.tick().catch((e) => console.warn('알림 확인 실패', e.message)), Number(process.env.PUSH_CHECK_MS) || 20_000).unref();

// 오늘(한국 시간) 더 만들 수 있는 파티장 수
function capacity() {
  const made = q.metricToday.get(kstDay(), 'rooftop_created')?.n || 0;
  const d = new Date(Date.now() + KST);
  const resetAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - KST;
  return { left: Math.max(0, MAX_ROOFTOPS_PER_DAY - made), max: MAX_ROOFTOPS_PER_DAY, resetAt };
}
try { makeBackup(); } catch (e) { console.error('백업 실패', e.message); }
setInterval(() => { try { makeBackup(); } catch (e) { console.error('백업 실패', e.message); } }, 3600_000).unref(); // 매시간 확인, 하루 한 번 생성

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
