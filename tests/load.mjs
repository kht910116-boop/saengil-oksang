// 부하 시험: 가짜 접속자를 단계적으로 늘려 서버 CPU·메모리·지연을 잰다.
// 실행: npm run build && node tests/load.mjs [단계들, 기본 500,1000,2000]
// 최악 조건: 모든 접속자가 쉬지 않고 걸으며 초당 10번 위치를 보낸다(실제 사용보다 훨씬 무거움).
import { spawn, fork } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STEPS = (process.argv[2] || '500,1000,2000').split(',').map(Number);
const PER_ROOM = 30;
const PORT = 20000 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oksang-load-'));
const CLIENT_PROCS = 3;
const HOLD_MS = 20_000;

const server = spawn(process.execPath, ['--no-warnings', 'server/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(DIR, 'load.db'), TRUST_PROXY: '1', NODE_ENV: 'production' },
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* 아직 */ } await sleep(100); }

// 서버 프로세스의 CPU 사용률(%)과 메모리(MB)를 /proc에서 읽는다
const tck = 100;
function procStat() {
  const st = fs.readFileSync(`/proc/${server.pid}/stat`, 'utf8').split(') ')[1].split(' ');
  const cpu = (Number(st[11]) + Number(st[12])) / tck;
  const rss = Number(fs.readFileSync(`/proc/${server.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024;
  return { cpu, rss };
}

let ip = 1;
async function makeRoom() {
  const r = await fetch(`${BASE}/api/rooftops`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(ip / 250)}.${ip++ % 250}` }, body: JSON.stringify({ owner: '민지', month: 1, day: 1, testSeconds: 600 }) });
  return (await r.json()).id;
}

const children = [];
const stats = new Map();
const results = [];
let total = 0;
for (const target of STEPS) {
  const add = target - total;
  const roomsNeeded = Math.ceil(add / PER_ROOM);
  const rooms = [];
  for (let i = 0; i < roomsNeeded; i++) rooms.push(await makeRoom());
  const per = Math.ceil(rooms.length / CLIENT_PROCS);
  for (let c = 0; c < CLIENT_PROCS; c++) {
    const part = rooms.slice(c * per, (c + 1) * per);
    if (!part.length) continue;
    const child = fork('tests/load-client.mjs', [BASE, JSON.stringify(part), String(PER_ROOM)], { stdio: 'ignore' });
    child.on('message', (m) => stats.set(child.pid, m));
    children.push(child);
  }
  total += roomsNeeded * PER_ROOM;
  await sleep(6000); // 접속 안정화
  const a = procStat();
  const t0 = Date.now();
  await sleep(HOLD_MS);
  const b = procStat();
  const cpuPct = ((b.cpu - a.cpu) / ((Date.now() - t0) / 1000)) * 100;
  const s = [...stats.values()];
  const open = s.reduce((x, y) => x + y.open, 0);
  const p50 = Math.max(...s.map((y) => y.p50 ?? 0));
  const p95 = Math.max(...s.map((y) => y.p95 ?? 0));
  const row = { 접속자: open, 옥상: Math.ceil(open / PER_ROOM), '서버 CPU(%)': Math.round(cpuPct), '메모리(MB)': Math.round(b.rss), '지연 중간값(ms)': p50, '지연 95%(ms)': p95, 오류: s.reduce((x, y) => x + y.errors, 0) };
  results.push(row);
  console.log(JSON.stringify(row));
}
console.table(results);
console.log('참고: 지연에는 서버가 위치를 0.1초마다 모아 보내는 대기 시간(최대 100ms)이 포함돼요. CPU 100%는 코어 1개를 다 쓴 상태예요.');
children.forEach((c) => c.kill());
server.kill('SIGTERM');
fs.rmSync(DIR, { recursive: true, force: true });
process.exit(0);
