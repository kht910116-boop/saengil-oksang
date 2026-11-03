// 점등 알림(웹 푸시): 점등 30분 전, 5분 전에 알림을 보낸다.
// 구독 정보(브라우저가 준 주소와 암호 키)는 파티장이 닫히면 함께 지운다. 이름·연락처는 받지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';

const MAX_SUBS_PER_ROOF = 500;
const STAGES = [
  { col: 'sent30', before: 30 * 60_000 },
  { col: 'sent5', before: 5 * 60_000 },
];

export function createPush(db, { dataDir, subject = 'mailto:ddorami2003@gmail.com', serviceName }) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rooftop_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'friend',
    sent30 INTEGER NOT NULL DEFAULT 0,
    sent5 INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (rooftop_id, endpoint)
  )`);

  // 서버 열쇠(VAPID): 환경 변수가 없으면 데이터 폴더에 한 번 만들어 계속 쓴다(재시작해도 구독이 유지되게)
  let keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  if (!keys.publicKey || !keys.privateKey) {
    const file = path.join(dataDir, 'vapid.json');
    try { keys = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
      keys = webpush.generateVAPIDKeys();
      fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    }
  }
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  const q = {
    insert: db.prepare('INSERT OR IGNORE INTO push_subs (rooftop_id, endpoint, p256dh, auth, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    count: db.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE rooftop_id = ?'),
    remove: db.prepare('DELETE FROM push_subs WHERE rooftop_id = ? AND endpoint = ?'),
    removeRoof: db.prepare('DELETE FROM push_subs WHERE rooftop_id = ?'),
    removeId: db.prepare('DELETE FROM push_subs WHERE id = ?'),
    due: Object.fromEntries(STAGES.map((s) => [s.col, db.prepare(
      `SELECT p.*, r.owner, r.ignite_at FROM push_subs p JOIN rooftops r ON r.id = p.rooftop_id
       WHERE p.${s.col} = 0 AND r.ignite_at - ? <= ? AND r.ignite_at > ? LIMIT 500`)])),
    mark: Object.fromEntries(STAGES.map((s) => [s.col, db.prepare(`UPDATE push_subs SET ${s.col} = 1 WHERE id = ?`)])),
  };

  function valid(sub) {
    return sub && typeof sub.endpoint === 'string' && /^https:\/\/[^\s]{10,800}$/.test(sub.endpoint)
      && typeof sub.keys?.p256dh === 'string' && sub.keys.p256dh.length < 200
      && typeof sub.keys?.auth === 'string' && sub.keys.auth.length < 100;
  }

  function message(row, minutes) {
    const owner = row.owner;
    if (row.role === 'owner') return { title: `${owner}님, 문이 곧 열려요`, body: `${minutes}분 뒤에 파티장 문이 열려요. 친구들이 무언가를 준비했어요.` };
    return { title: `${owner}의 생일 점등 ${minutes}분 전`, body: `${minutes}분 뒤에 다 같이 불을 켜요. 늦지 않게 들어와 주세요.` };
  }

  let busy = false;
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      for (const s of STAGES) {
        const rows = q.due[s.col].all(now, s.before, now);
        for (const row of rows) {
          q.mark[s.col].run(row.id); // 실패해도 다시 보내지 않는다(알림 폭탄 방지)
          // 30분 전 알림을 놓친 채 5분 전이 되었으면 30분 알림은 건너뛴다
          if (s.col === 'sent30' && row.ignite_at - now <= 6 * 60_000) continue;
          const minutes = Math.max(1, Math.round((row.ignite_at - now) / 60_000));
          const payload = JSON.stringify({ ...message(row, minutes), url: `/r/${row.rooftop_id}`, tag: `ignite-${row.rooftop_id}`, service: serviceName });
          try {
            await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { TTL: 600, urgency: 'high' });
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) q.removeId.run(row.id); // 더 이상 없는 구독
            else console.warn(`알림 보내기 실패(${e.statusCode || e.message})`);
          }
        }
      }
    } finally { busy = false; }
  }

  return {
    publicKey: keys.publicKey,
    // 구독 저장. 주인공 링크로 구독하면 주인공용 문구를 보낸다.
    subscribe(roofId, sub, role) {
      if (!valid(sub)) return { ok: false, error: '알림 정보를 확인하지 못했어요.' };
      if (q.count.get(roofId).n >= MAX_SUBS_PER_ROOF) return { ok: false, error: '이 파티장은 알림 신청이 가득 찼어요.' };
      q.insert.run(roofId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, role === 'owner' ? 'owner' : 'friend', Date.now());
      return { ok: true };
    },
    unsubscribe(roofId, endpoint) { if (typeof endpoint === 'string') q.remove.run(roofId, endpoint); },
    removeRoof(roofId) { q.removeRoof.run(roofId); },
    tick,
  };
}
