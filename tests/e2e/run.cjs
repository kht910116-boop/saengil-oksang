// 브라우저 통합 시험: 주인공 1명 + 친구 2명이 파티장 만들기부터 닫힐 때까지 전 과정을 돈다.
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
// 기본은 작은 휴대폰 화면(360×640). E2E_W·E2E_H로 바꿀 수 있다
const VW = Number(process.env.E2E_W) || 360;
const VH = Number(process.env.E2E_H) || 640;
const snap = async (p, name) => { if (process.env.E2E_SHOTS) await p.screenshot({ path: path.join(OUT, `m${VW}-${name}.png`) }).catch(() => {}); };
// 휴대폰 배치 검사: 화면에 떠 있는 버튼·안내끼리 겹치거나 화면 밖으로 나가면 실패
const layout = async (p, label) => {
  const bad = await p.evaluate(() => {
    const vis = (el) => {
      if (!el || el.closest('[hidden]')) return null;
      for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return null; }
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 ? r : null;
    };
    const out = [];
    if (document.querySelector('#sheet.open')) return out; // 시트가 열려 있으면 그 아래는 가려져도 된다
    const W = innerWidth, H = innerHeight;
    const name = (el) => el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 12) || el.className;
    for (const b of document.querySelectorAll('button, a.btn')) {
      const r = vis(b);
      if (r && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) out.push(`화면 밖: ${name(b)}`);
    }
    const items = ['.topbar .title', '.top-right > *', '#reactions > button', '#joystick', '.actions > *', '#status.show', '#closing', '#thanks-banner', '#spot-btn', '#ceremony-hint', '#cta']
      .flatMap((sel) => [...document.querySelectorAll(sel)]).map((el) => [el, vis(el)]).filter(([, r]) => r);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const [a, ra] = items[i], [b, rb] = items[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 3 && oy > 3) out.push(`겹침: ${name(a)} ↔ ${name(b)}`);
    }
    return out;
  });
  ok(bad.length === 0, `[${label}] 화면 배치${bad.length ? `: ${bad.join(', ')}` : ' 겹침 없음'}`);
};

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
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true, acceptDownloads: true });
    // 느린 시험 브라우저에서 '가볍게 보기' 권유 창이 버튼을 가리지 않게
    await ctx.addInitScript(() => { try { localStorage.setItem('lite-asked', 'true'); } catch {} });
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
    // 목록에 보일 진짜 파티장(사흘 뒤 생일) 하나와, 생일자가 직접 연 파티장 하나를 미리 만든다
    const soon = new Date(Date.now() + 3 * 86400_000 + 9 * 3600_000);
    const mkRoom = (body) => fetch(`${B}/api/rooftops`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ month: soon.getUTCMonth() + 1, day: soon.getUTCDate(), hour: 21, ...body }) }).then((x) => x.json());
    const listed = await mkRoom({ owner: '하은', venue: 'aurora' });
    const selfRoom = await mkRoom({ owner: '지우', venue: 'sky', self: true });
    await host.goto(`${B}/`, { waitUntil: 'commit' });
    await host.waitForSelector('.room-item', { timeout: 60000 });
    ok(await host.isVisible('#tab-rooms') && !(await host.isVisible('#create-form')), '첫 화면은 파티장 고르기');
    const titles = await host.$$eval('.room-title', (e) => e.map((x) => x.textContent));
    ok(titles.some((t) => t.includes('하은')) && titles.some((t) => t.includes('지우')), '공개 파티장이 목록에 보임');
    await snap(host, '00-room-list');
    await layout(host, '파티장 목록');
    await host.click(`.room-item[href="/r/${listed.id}"]`);
    await host.waitForSelector('#visitor-form', { timeout: 60000 });
    ok(host.url().endsWith(`/r/${listed.id}`), '목록에서 고른 파티장으로 들어감');
    await host.goto(`${B}/?ref=nope`, { waitUntil: 'commit' });
    await host.waitForSelector('#create-form', { timeout: 60000 });
    ok(await host.isVisible('.who-pick'), '"내 생일 직접 열기" 선택지');
    await snap(host, '01-landing');
    ok(await host.$$eval('#create-hour option', (o) => o.length) === 17, '공개 시각 선택지 17개(자정 + 오전 8시~오후 11시)');
    await host.fill('#create-owner', '민지');
    await host.selectOption('#create-hour', '21');
    await host.check('#create-test');
    await host.click('#create-form button[type=submit]');
    await host.waitForSelector('#link-host', { timeout: 20000 });
    ok((await host.textContent('.sheet-lead')).includes('10분 뒤에 닫혀요'), '시험용 파티장 안내에 닫히는 시각 표시');

    // 흐름 시험용 파티장: 2분 뒤 점등, 점등 3분 뒤 닫힘
    const r = await host.evaluate(async () => (await fetch('/api/rooftops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: '민지', month: 1, day: 1, testSeconds: 200, testEndSeconds: 180 }) })).json());
    const friendUrl = `${B}/r/${r.id}`;
    const ownerUrl = `${friendUrl}?k=${r.ownerKey}`;
    await host.close();

    log('2. 주인공은 닫힌 문, 친구 둘은 입장');
    const owner = await mk();
    await owner.goto(ownerUrl, { waitUntil: 'commit' });
    await owner.waitForSelector('#door:not([hidden])', { timeout: 60000 });
    await owner.waitForTimeout(800);
    await snap(owner, '02-owner-door');
    const f1 = await mk();
    const f2 = await mk();
    for (const [p, n, url] of [[f1, '수아', `${friendUrl}?h=${r.hostKey}`], [f2, '도윤', friendUrl]]) {
      await p.goto(url, { waitUntil: 'commit' });
      await p.waitForSelector('#visitor-form', { timeout: 60000 });
      await p.fill('#visitor-name', n);
      await p.click('#visitor-form button[type=submit]');
    }
    await f1.waitForFunction(() => document.querySelector('#count').textContent.includes('2명'), null, { timeout: 30000 });
    ok(true, '친구 둘이 서로 접속을 봄');
    await f2.waitForTimeout(1500);
    await snap(f2, '03-friend-room');
    await layout(f1, '만든 사람 파티장');
    await layout(f2, '친구 파티장');
    ok(await f1.isVisible('#btn-invite') && await f1.isVisible('#btn-letters'), '친구에게 초대·등불 모아보기 버튼');
    ok((await f1.textContent('#goal')).includes('/20'), '공동 목표 표시');

    log('3. 등불(관계·햇수), 익명 선물, 리액션');
    await f1.click('#btn-lantern');
    await f1.waitForSelector('#lantern-form');
    await snap(f1, '04-lantern-form');
    ok(await f1.evaluate(() => { const b = document.querySelector('#lantern-form button[type=submit]'); b.scrollIntoView(); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), '등불 쓰기: 보내기 버튼까지 스크롤해서 닿음');
    await f1.click('.rels .tpl:nth-of-type(1) span');
    await f1.selectOption('#lantern-years', '10');
    await f1.click('#lantern-form button[type=submit]');
    await f2.waitForFunction(() => window.__lantern.lanterns >= 1, null, { timeout: 20000 });
    await f2.click('#btn-letters');
    await f2.waitForSelector('.letters li');
    ok((await f2.textContent('.letter-from')).includes('친구 · 함께한 지 10년'), '등불 모아보기에 관계·햇수 표시');
    await snap(f2, '05-letters');
    await f2.click('.sheet-close');
    await f1.click('#btn-gift');
    await f1.waitForSelector('#gift-form');
    await snap(f1, '06-gift-form');
    await f1.click('.gift-item:nth-of-type(2) span');
    await f1.check('#gift-anon');
    await f1.click('#gift-form button[type=submit]');
    await f2.waitForFunction(() => window.__lantern.gifts >= 1, null, { timeout: 20000 });
    ok((await f2.textContent('#status')).includes('누군가'), '익명 선물이 "누군가"로 표시');
    await f2.waitForTimeout(1200);
    await f2.click('[data-react="heart"]');
    await f1.waitForFunction(() => document.querySelectorAll('.react-float').length > 0, null, { timeout: 10000 }).then(() => ok(true, '리액션이 다른 친구 화면에 뜸')).catch(() => ok(false, '리액션 전달'));

    log('3b. 휴대폰: 동작판·같이 하기·앉기·메뉴(가볍게 보기·관리·단체 사진)');
    await f1.waitForTimeout(1500);
    await f1.click('[data-emote-open]');
    await f1.waitForSelector('#emotes:not([hidden])');
    ok(await f1.$$eval('#emotes [data-emote]', (b) => b.length) === 6 && await f1.$$eval('#emotes [data-gm]', (b) => b.length) === 3, '동작판: 혼자 하는 동작 6개 + 같이 하는 동작 3개');
    await snap(f1, '07-emotes');
    await f1.click('#emotes [data-emote="wave"]');
    ok(await f1.isHidden('#emotes'), '동작을 고르면 동작판이 닫힘');
    // 같이 하기: 두 친구를 가까이 세우고 하이파이브
    const me1 = await f1.evaluate(() => window.__lantern.mePos);
    await f2.evaluate(([x, z]) => window.__lantern.moveMe(x + 1.2, z), [me1.x, me1.z]);
    await f1.waitForFunction(() => { const ps = window.__lantern.people; const m = ps.find((p) => p.me); return ps.some((p) => !p.me && Math.hypot(p.x - m.x, p.z - m.z) < 3); }, null, { timeout: 20000 });
    await f1.waitForTimeout(900);
    await f1.click('[data-emote-open]');
    await f1.waitForSelector('#emotes [data-gm="highfive"]:not([disabled])', { timeout: 10000 });
    await f1.click('#emotes [data-gm="highfive"]');
    await f2.waitForFunction(() => window.__lantern.gmActive > 0, null, { timeout: 10000 }).then(() => ok(true, '하이파이브가 친구 화면에서도 같이 시작')).catch(() => ok(false, '같이 하는 동작 전달'));
    await f1.waitForTimeout(3000);
    // 앉기: 의자 앞으로 가서 '앉기' 버튼
    const seat = (await f2.evaluate(() => window.__lantern.spots)).find((h) => h.id.startsWith('seat'));
    if (seat) {
      await f2.evaluate((id) => window.__lantern.goSpot(id), seat.id);
      await f2.waitForSelector('#spot-btn:not([hidden])', { timeout: 10000 });
      await snap(f2, '08-spot-btn');
      await layout(f2, '놀거리 버튼');
      await f2.click('#spot-btn');
      await f2.waitForFunction(() => window.__lantern.lift > 0.1, null, { timeout: 8000 }).then(() => ok(true, '의자에 앉기')).catch(() => ok(false, '의자에 앉기'));
      await snap(f2, '09-sitting');
    } else ok(false, '앉는 자리 놀거리가 있음');
    // 메뉴: 가볍게 보기 켜고 끄기
    await f2.click('#btn-more');
    await f2.waitForSelector('#top-more:not([hidden]) #btn-lite');
    await snap(f2, '10-menu');
    await f2.click('#btn-lite');
    ok(await f2.evaluate(() => document.body.classList.contains('lite')) && await f2.isHidden('#top-more'), '메뉴 → 가볍게 보기 켜짐(메뉴는 닫힘)');
    await f2.waitForTimeout(800);
    await snap(f2, '11-lite');
    await layout(f2, '가볍게 보기');
    await f2.click('#btn-more');
    await f2.click('#btn-lite');
    ok(!(await f2.evaluate(() => document.body.classList.contains('lite'))), '가볍게 보기 끄기');
    // 메뉴: 만든 사람의 현황·관리
    await f1.click('#btn-more');
    await f1.click('#btn-manage');
    await f1.waitForSelector('#sheet.open');
    await snap(f1, '12-manage');
    ok(true, '메뉴 → 현황·관리 열림');
    await f1.click('.sheet-close');
    // 메뉴: 단체 사진(모두의 화면에서 카운트다운 → 사진 저장)
    await f1.waitForTimeout(500);
    await f1.click('#btn-more');
    await f1.click('#btn-group');
    await f2.waitForSelector('#countdown', { timeout: 10000 }).then(() => ok(true, '단체 사진 카운트다운이 친구 화면에도 뜸')).catch(() => ok(false, '단체 사진 카운트다운 전달'));
    await f2.waitForTimeout(3500);
    await snap(f2, '13-group-countdown');
    await f1.waitForSelector('#save-group', { timeout: 30000 });
    await snap(f1, '14-group-photo');
    const [gdl] = await Promise.all([f1.waitForEvent('download', { timeout: 30000 }).catch(() => null), f1.click('#save-group')]);
    ok(gdl && (await gdl.suggestedFilename()).endsWith('.jpg'), '단체 사진(jpg) 저장');
    await f1.evaluate(() => document.querySelector('#sheet.open .sheet-close')?.click());
    await f2.evaluate(() => document.querySelector('#sheet.open .sheet-close')?.click());

    log('3c. 가상 응원단: 만든 사람이 보내면 모두의 화면에 등장하고 등불을 단다');
    const before3c = await f2.evaluate(() => ({ people: window.__lantern.people.length, lanterns: window.__lantern.lanterns }));
    await f1.click('#btn-more');
    await f1.click('#btn-manage');
    await f1.waitForSelector('[data-bots="5"]');
    await snap(f1, '12b-bots-manage');
    await f1.click('[data-bots="5"]');
    await f2.waitForFunction((n) => window.__lantern.people.length >= n + 5, before3c.people, { timeout: 20000 }).then(() => ok(true, '응원단 5명이 친구 화면에 나타남')).catch(() => ok(false, '응원단 등장'));
    await f2.waitForFunction((n) => window.__lantern.lanterns >= n + 5, before3c.lanterns, { timeout: 20000 }).then(() => ok(true, '응원단 등불 5개')).catch(() => ok(false, '응원단 등불'));
    ok((await f2.textContent('#count')).includes('응원단 5'), '접속 수에 응원단 따로 표시');
    await f2.waitForTimeout(1500);
    await snap(f2, '12c-bots-room');

    log('4. 점등: 모두의 화면, 기념사진 자동 촬영');
    await owner.waitForFunction(() => window.__lantern && window.__lantern.people.some((p) => p.me), null, { timeout: 200000, polling: 500 });
    ok(true, '점등 15초 전 주인공 입장');
    await Promise.all([owner, f1].map((p) => p.waitForFunction(() => window.__lantern.igniting, null, { timeout: 120000, polling: 300 })));
    ok(true, '주인공·친구 화면에서 점등 시작');
    await f1.waitForTimeout(4000);
    await snap(f1, '15-ignite');
    await layout(f1, '점등식');
    await owner.waitForFunction(() => window.__lantern.photoReady, null, { timeout: 240000, polling: 500 });
    ok(true, '점등 장면 기념사진 자동 촬영');
    await owner.screenshot({ path: path.join(OUT, 'e2e-owner-ignite.png') });
    await owner.waitForSelector('#btn-candles', { timeout: 240000 });
    await owner.waitForTimeout(800);
    await snap(owner, '16-owner-candles-btn');
    await layout(owner, '주인공 촛불 끄기 전');
    ok(await f1.isVisible('#closing'), '점등 뒤 친구에게 닫힘 예고 배너');

    log('5. 주인공: 촛불 끄기, 답례');
    await owner.click('#btn-candles');
    await owner.waitForTimeout(2500);
    await snap(owner, '17-candle-blow');
    await layout(owner, '촛불 끄기');
    await f1.waitForTimeout(3000);
    await snap(f1, '18-song-friend');
    await f1.waitForFunction(() => window.__lantern.candlesOut, null, { timeout: 45000 });
    ok(true, '주인공이 촛불을 끄자 생일 노래 뒤 친구 화면에서도 꺼짐');
    await owner.click('#btn-letters', { timeout: 60000 }); // 촛불 의식이 끝나면 버튼이 다시 보인다
    await owner.waitForSelector('[data-thanks]');
    await snap(owner, '19-owner-letters-thanks');
    await owner.click('[data-thanks="0"]');
    await f1.waitForFunction(() => window.__lantern.thanks, null, { timeout: 20000 });
    ok((await f1.textContent('#thanks-banner')).includes('다들 정말 고마워'), '친구 화면에 답례 배너');
    await f1.waitForTimeout(600);
    await snap(f1, '20-thanks-banner');
    await owner.click('.sheet-close').catch(() => {});

    log('6. 기념사진 저장, "내 파티 만들기"');
    await f1.waitForSelector('#btn-photo', { timeout: 120000 });
    await f1.evaluate(() => { const s = document.querySelector('#sheet'); if (s.classList.contains('open') && !s.classList.contains('locked')) s.querySelector('.sheet-close').click(); });
    await f1.waitForTimeout(400);
    await snap(f1, '21-after-photo-btn');
    await layout(f1, '점등 후 친구 화면');
    await f1.click('#btn-photo');
    await f1.waitForSelector('#keep-photo');
    ok(await f1.isVisible('#keep-video') && await f1.isVisible('#keep-card') && await f1.isVisible('#keep-replay'), '사진·영상: 기념사진·점등 영상·기억 카드·다시 보기가 한곳에');
    await snap(f1, '21b-keepsakes');
    const [vdl] = await Promise.all([f1.waitForEvent('download', { timeout: 30000 }).catch(() => null), f1.click('#keep-video')]);
    ok(vdl && /\.(webm|mp4)$/.test(await vdl.suggestedFilename()), '점등 영상 저장');
    const [dl] = await Promise.all([f1.waitForEvent('download', { timeout: 30000 }).catch(() => null), f1.click('#keep-photo')]);
    ok(dl && (await dl.suggestedFilename()).endsWith('.jpg'), '기념사진(jpg) 저장');
    await f1.evaluate(() => document.querySelector('#sheet.open .sheet-close')?.click());
    if (dl) await dl.saveAs(path.join(OUT, 'e2e-photo.jpg'));
    await f1.waitForSelector('#cta:not([hidden])', { timeout: 60000 });
    ok((await f1.getAttribute('#cta a', 'href')) === `/?ref=${r.id}`, '"내 생일 파티 만들기"에 출처 포함');
    await snap(f1, '22-cta');
    await layout(f1, '내 파티 만들기 안내');

    log('6b. 내 생일 직접 열기: 주인공이 문 앞 대기 없이 바로 들어가고 관리 메뉴가 있음');
    const me2 = await mk();
    await me2.goto(`${B}/r/${selfRoom.id}?k=${selfRoom.ownerKey}`, { waitUntil: 'commit' });
    await me2.waitForSelector('#btn-more', { timeout: 120000 });
    ok(!(await me2.isVisible('#door')), '문 앞 대기 화면 없음');
    await me2.click('#btn-more');
    ok(await me2.isVisible('#btn-manage'), '직접 연 생일자에게 관리 메뉴');
    await me2.keyboard.press('Escape');
    await me2.close();

    log('7. 닫힘: 닫는 시각이 되면 마무리 화면');
    await f2.waitForFunction(() => document.querySelector('.sheet-body h2')?.textContent.includes('파티장이 닫혔어요'), null, { timeout: 300000, polling: 1000 });
    ok(true, '닫는 시각에 "파티장이 닫혔어요" 화면');
    await snap(f2, '23-closed');
    const gone = await fetch(`${B}/api/rooftops/${r.id}`);
    ok(gone.status === 404, '닫힌 파티장은 서버에서 삭제됨');

    for (const p of pages) if (!p.isClosed()) ok(p.errs.length === 0, `콘솔 오류 없음 ${JSON.stringify(p.errs).slice(0, 200)}`);
  } catch (e) {
    console.error('시험 중단:', e.message.slice(0, 1200));
    for (const [i, p] of pages.entries()) if (!p.isClosed()) await snap(p, `fail-${i}`);
    fails++;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    console.log(fails ? `\n실패 ${fails}개` : '\n모두 통과');
    if (!process.env.E2E_SHOTS) fs.rmSync(DIR, { recursive: true, force: true });
    process.exit(fails ? 1 : 0);
  }
})();
