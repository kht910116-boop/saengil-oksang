// 브라우저 통합 시험: 주인공 1명 + 친구 2명이 옥상 만들기부터 닫힐 때까지 전 과정을 돈다.
// 실행: npm run build && npm run test:e2e   (Playwright와 Chromium이 필요: npx playwright install chromium)
// 그래픽 카드가 없는 환경에서는 3D가 느려서 몇 분 걸린다.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright가 없어요. npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const PORT = 19000 + Math.floor(Math.random() * 500);
const B = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oksang-e2e-'));
const OUT = process.env.E2E_SHOTS || DIR;
let fails = 0;
const ok = (c, m) => { console.log(`${c ? '  ✅' : '  ❌'} ${m}`); if (!c) fails++; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

(async () => {
  const server = spawn(process.execPath, ['--no-warnings', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(DIR, 'e2e.db'), ADMIN_KEY: 'k-e2e', TRUST_PROXY: '1', CLOSE_CHECK_MS: '1000' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${B}/healthz`)).ok) break; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pages = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) p.errs.push(m.text()); });
    pages.push(p);
    return p;
  };
  try {
    log('1. 첫 화면: 공개 시각 고르기, 남은 수, 출처 전달');
    const host = await mk();
    await host.goto(`${B}/?ref=nope`, { waitUntil: 'commit' });
    await host.waitForSelector('#create-form', { timeout: 60000 });
    ok(await host.$$eval('#create-hour option', (o) => o.length) === 17, '공개 시각 선택지 17개(자정 + 오전 8시~오후 11시)');
    await host.fill('#create-owner', '민지');
    await host.selectOption('#create-hour', '21');
    await host.check('#create-test');
    await host.click('#create-form button[type=submit]');
    await host.waitForSelector('#link-host', { timeout: 20000 });
    ok((await host.textContent('.sheet-lead')).includes('10분 뒤에 닫혀요'), '시험용 옥상 안내에 닫히는 시각 표시');

    // 흐름 시험용 옥상: 2분 뒤 점등, 점등 3분 뒤 닫힘
    const r = await host.evaluate(async () => (await fetch('/api/rooftops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: '민지', month: 1, day: 1, testSeconds: 120, testEndSeconds: 180 }) })).json());
    const friendUrl = `${B}/r/${r.id}`;
    const ownerUrl = `${friendUrl}?k=${r.ownerKey}`;
    await host.close();

    log('2. 주인공은 닫힌 문, 친구 둘은 입장');
    const owner = await mk();
    await owner.goto(ownerUrl, { waitUntil: 'commit' });
    await owner.waitForSelector('#door:not([hidden])', { timeout: 60000 });
    const f1 = await mk();
    const f2 = await mk();
    for (const [p, n] of [[f1, '수아'], [f2, '도윤']]) {
      await p.goto(friendUrl, { waitUntil: 'commit' });
      await p.waitForSelector('#visitor-form', { timeout: 60000 });
      await p.fill('#visitor-name', n);
      await p.click('#visitor-form button[type=submit]');
    }
    await f1.waitForFunction(() => document.querySelector('#count').textContent.includes('2명'), null, { timeout: 30000 });
    ok(true, '친구 둘이 서로 접속을 봄');
    ok(await f1.isVisible('#btn-invite') && await f1.isVisible('#btn-letters'), '친구에게 초대·등불 모아보기 버튼');
    ok((await f1.textContent('#goal')).includes('/20'), '공동 목표 표시');

    log('3. 등불(관계·햇수), 익명 선물, 리액션');
    await f1.click('#btn-lantern');
    await f1.click('.rels .tpl:nth-of-type(1) span');
    await f1.selectOption('#lantern-years', '10');
    await f1.click('#lantern-form button[type=submit]');
    await f2.waitForFunction(() => window.__lantern.lanterns >= 1, null, { timeout: 20000 });
    await f2.click('#btn-letters');
    await f2.waitForSelector('.letters li');
    ok((await f2.textContent('.letter-from')).includes('친구 · 함께한 지 10년'), '등불 모아보기에 관계·햇수 표시');
    await f2.click('.sheet-close');
    await f1.click('#btn-gift');
    await f1.waitForSelector('#gift-form');
    await f1.click('.gift-item:nth-of-type(2) span');
    await f1.check('#gift-anon');
    await f1.click('#gift-form button[type=submit]');
    await f2.waitForFunction(() => window.__lantern.gifts >= 1, null, { timeout: 20000 });
    ok((await f2.textContent('#status')).includes('누군가'), '익명 선물이 "누군가"로 표시');
    await f2.waitForTimeout(1200);
    await f2.click('[data-react="heart"]');
    await f1.waitForFunction(() => document.querySelectorAll('.react-float').length > 0, null, { timeout: 10000 }).then(() => ok(true, '리액션이 다른 친구 화면에 뜸')).catch(() => ok(false, '리액션 전달'));

    log('4. 점등: 모두의 화면, 기념사진 자동 촬영');
    await owner.waitForFunction(() => window.__lantern && window.__lantern.people.some((p) => p.me), null, { timeout: 200000, polling: 500 });
    ok(true, '점등 15초 전 주인공 입장');
    await Promise.all([owner, f1].map((p) => p.waitForFunction(() => window.__lantern.igniting, null, { timeout: 120000, polling: 300 })));
    ok(true, '주인공·친구 화면에서 점등 시작');
    await owner.waitForFunction(() => window.__lantern.photoReady, null, { timeout: 240000, polling: 500 });
    ok(true, '점등 장면 기념사진 자동 촬영');
    await owner.screenshot({ path: path.join(OUT, 'e2e-owner-ignite.png') });
    await owner.waitForSelector('#btn-candles', { timeout: 240000 });
    ok(await f1.isVisible('#closing'), '점등 뒤 친구에게 닫힘 예고 배너');

    log('5. 주인공: 촛불 끄기, 답례');
    await owner.click('#btn-candles');
    await f1.waitForFunction(() => window.__lantern.candlesOut, null, { timeout: 20000 });
    ok(true, '주인공이 촛불을 끄자 친구 화면에서도 꺼짐');
    await owner.click('#btn-letters');
    await owner.waitForSelector('[data-thanks]');
    await owner.click('[data-thanks="0"]');
    await f1.waitForFunction(() => window.__lantern.thanks, null, { timeout: 20000 });
    ok((await f1.textContent('#thanks-banner')).includes('다들 정말 고마워'), '친구 화면에 답례 배너');
    await owner.click('.sheet-close').catch(() => {});

    log('6. 기념사진 저장, "내 옥상 만들기"');
    await f1.waitForSelector('#btn-photo', { timeout: 120000 });
    const [dl] = await Promise.all([f1.waitForEvent('download', { timeout: 30000 }).catch(() => null), f1.click('#btn-photo')]);
    ok(dl && (await dl.suggestedFilename()).endsWith('.jpg'), '기념사진(jpg) 저장');
    if (dl) await dl.saveAs(path.join(OUT, 'e2e-photo.jpg'));
    await f1.waitForSelector('#cta:not([hidden])', { timeout: 60000 });
    ok((await f1.getAttribute('#cta a', 'href')) === `/?ref=${r.id}`, '"내 생일 옥상 만들기"에 출처 포함');

    log('7. 닫힘: 닫는 시각이 되면 마무리 화면');
    await f2.waitForFunction(() => document.querySelector('.sheet-body h2')?.textContent.includes('옥상이 닫혔어요'), null, { timeout: 300000, polling: 1000 });
    ok(true, '닫는 시각에 "옥상이 닫혔어요" 화면');
    const gone = await fetch(`${B}/api/rooftops/${r.id}`);
    ok(gone.status === 404, '닫힌 옥상은 서버에서 삭제됨');

    for (const p of pages) if (!p.isClosed()) ok(p.errs.length === 0, `콘솔 오류 없음 ${JSON.stringify(p.errs).slice(0, 200)}`);
  } catch (e) {
    console.error('시험 중단:', e.message.slice(0, 400));
    fails++;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과');
    if (!process.env.E2E_SHOTS) fs.rmSync(DIR, { recursive: true, force: true });
    process.exit(fails ? 1 : 0);
  }
})();
