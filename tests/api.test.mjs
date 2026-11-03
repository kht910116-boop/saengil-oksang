// 서버 API·실시간 시험: 임시 DB로 서버를 띄워 실제 요청을 보낸다 (node --test)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oksang-test-'));
let server;
let ipSeq = 1;

// 요청마다 다른 IP로 보내 속도 제한에 걸리지 않게 한다(TRUST_PROXY=1)
async function call(method, url, body, { ip } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.1.${Math.floor(ipSeq / 250)}.${ipSeq++ % 250}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  return { status: res.status, data };
}
const create = (extra = {}) => call('POST', '/api/rooftops', { owner: '민지', month: 1, day: 1, testSeconds: 600, ...extra });
const gold = 0xffc46b;

before(async () => {
  if (!fs.existsSync('dist/index.html')) throw new Error('먼저 npm run build 를 실행하세요');
  server = spawn(process.execPath, ['--no-warnings', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(DIR, 'test.db'), ADMIN_KEY: 'k-test', TRUST_PROXY: '1', CLOSE_CHECK_MS: '300' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* 아직 안 뜸 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('서버가 뜨지 않았어요');
});
after(() => { server?.kill('SIGTERM'); fs.rmSync(DIR, { recursive: true, force: true }); });

test('파티장 만들기: 공개 시각·출처·거절 규칙', async () => {
  const cap0 = (await call('GET', '/api/capacity')).data.left;
  const r = await call('POST', '/api/rooftops', { owner: '민지', month: 11, day: 20, hour: 21 });
  // 오늘 날짜에 따라 60일 밖이면 거절될 수 있어 둘 다 허용하되 형식은 확인한다
  assert.ok(r.status === 201 || (r.status === 400 && /60일/.test(r.data.error)), JSON.stringify(r.data));
  assert.equal((await call('POST', '/api/rooftops', { owner: '민지', month: 1, day: 1, hour: 25 })).status, 400);
  assert.equal((await call('POST', '/api/rooftops', { owner: 'ㅅㅂ', month: 1, day: 1 })).status, 400);
  const a = await create();
  assert.equal(a.status, 201);
  assert.ok(a.data.ownerKey && a.data.hostKey);
  const b = await create({ ref: a.data.id });
  assert.equal(b.status, 201);
  const cap1 = (await call('GET', '/api/capacity')).data.left;
  assert.ok(cap1 < cap0, '남은 수가 줄어야 함');
});

test('파티 장소와 의상: 목록에 있는 것만', async () => {
  const d = await create();
  assert.equal(d.data.venue, 'cruise', '고르지 않으면 기본 장소');
  const a = await create({ venue: 'aurora' });
  assert.equal(a.status, 201);
  assert.equal((await call('GET', `/api/rooftops/${a.data.id}`)).data.venue, 'aurora');
  assert.equal((await create({ venue: 'moon' })).status, 400);
  assert.equal((await create({ venue: '__proto__' })).status, 400);
  const open = (outfit) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${a.data.id}`);
    ws.msgs = [];
    ws.on('message', (raw) => { const m = JSON.parse(raw); ws.msgs.push(m); if (m.t === 'welcome') resolve(ws); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '수아', color: gold, outfit })));
  });
  const w1 = await open('suit');
  const w2 = await open('bikini');
  assert.equal(w2.msgs.find((m) => m.t === 'welcome').peers[0].outfit, 'suit');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(w1.msgs.find((m) => m.t === 'join').peer.outfit, 'party', '모르는 의상은 기본 의상으로');
  w1.close();
  w2.close();
});

test('등불: 문구 번호만, 관계·햇수, 이름 필터', async () => {
  const { data: roof } = await create();
  const ok = await call('POST', `/api/rooftops/${roof.id}/lanterns`, { name: '하은', tpl: 2, color: gold, rel: 0, years: 10 });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.rel, 0);
  assert.equal(ok.data.years, 10);
  assert.equal((await call('POST', `/api/rooftops/${roof.id}/lanterns`, { name: '하은', msg: '아무말', color: gold })).status, 400);
  assert.equal((await call('POST', `/api/rooftops/${roof.id}/lanterns`, { name: '010 1234', tpl: 1, color: gold })).status, 400);
  const view = (await call('GET', `/api/rooftops/${roof.id}`)).data;
  assert.equal(view.lanterns.length, 1);
});

test('선물: 익명이면 이름을 어디에도 남기지 않음', async () => {
  const { data: roof } = await create();
  const g = await call('POST', `/api/rooftops/${roof.id}/gifts`, { item: 'balloons', name: '비밀친구', anonymous: true, color: gold });
  assert.equal(g.status, 201);
  assert.equal(g.data.name, '');
  const host = (await call('GET', `/api/rooftops/${roof.id}?h=${roof.hostKey}`)).data;
  assert.ok(!JSON.stringify(host).includes('비밀친구'));
});

test('주인공 답례·촛불: 주인공만, 점등 뒤에만', async () => {
  const { data: early } = await create();
  assert.equal((await call('POST', `/api/rooftops/${early.id}/thanks`, { k: early.ownerKey, tpl: 0 })).status, 403);
  const { data: roof } = await create({ testSeconds: 1 });
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal((await call('POST', `/api/rooftops/${roof.id}/candles`, {})).status, 403);
  assert.equal((await call('POST', `/api/rooftops/${roof.id}/candles`, { k: roof.ownerKey })).status, 200);
  assert.equal((await call('POST', `/api/rooftops/${roof.id}/thanks`, { k: roof.ownerKey, tpl: 1 })).status, 200);
  const view = (await call('GET', `/api/rooftops/${roof.id}`)).data;
  assert.equal(view.candlesOut, true);
  assert.equal(view.thanks, '최고의 생일이었어');
});

test('하루짜리 파티장: 닫는 시각이 지나면 알리고 지움', async () => {
  const { data: roof } = await create({ testSeconds: 1, testEndSeconds: 2 });
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${roof.id}`);
  const got = await new Promise((resolve) => {
    const seen = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '수아', color: gold })));
    ws.on('message', (d) => seen.push(JSON.parse(d).t));
    ws.on('close', (code) => resolve({ code, seen }));
  });
  assert.equal(got.code, 4004);
  assert.ok(got.seen.includes('ended'));
  assert.equal((await call('GET', `/api/rooftops/${roof.id}`)).status, 404);
});

test('실시간: 40명 넘으면 구경 모드, 점프 도배 방지', async () => {
  const { data: roof } = await create();
  const open = () => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${roof.id}`);
    ws.msgs = [];
    ws.on('message', (d) => { const m = JSON.parse(d); ws.msgs.push(m); if (m.t === 'welcome') resolve(ws); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '친구', color: gold })));
  });
  const peers = [];
  for (let i = 0; i < 41; i++) peers.push(await open());
  assert.equal(peers[39].msgs.find((m) => m.t === 'welcome').spectator, false);
  assert.equal(peers[40].msgs.find((m) => m.t === 'welcome').spectator, true);
  const watcher = peers[1];
  const before = watcher.msgs.filter((m) => m.t === 'hop').length;
  for (let i = 0; i < 5; i++) peers[0].send(JSON.stringify({ t: 'hop' }));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(watcher.msgs.filter((m) => m.t === 'hop').length - before, 1, '1초에 한 번만 전달');
  peers.forEach((p) => p.close());
});

test('측정·통계·백업: 운영자 키가 있어야 열림', async () => {
  assert.equal((await call('POST', '/api/events', { type: 'friend_visit' })).status, 200);
  assert.equal((await fetch(`${BASE}/admin/stats`)).status, 404);
  const stats = await fetch(`${BASE}/admin/stats?key=k-test`);
  assert.equal(stats.status, 200);
  assert.ok((await stats.text()).includes('만든 파티장'));
  const bk = await fetch(`${BASE}/admin/backup?key=k-test`);
  assert.equal(bk.status, 200);
  assert.ok((await bk.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(`${BASE}/healthz`)).status, 200);
});
