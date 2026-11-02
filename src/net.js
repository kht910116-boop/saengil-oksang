// 서버와의 통신(REST + WebSocket)
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const err = new Error(data.error || '연결이 원활하지 않아요. 다시 시도해주세요.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function connectRoom({ room, key, hostKey, hello, onMessage, onClose }) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const qs = new URLSearchParams({ room });
  if (key) qs.set('k', key);
  if (hostKey) qs.set('h', hostKey);
  let ws;
  let closedByUs = false;
  let retry = 0;
  const api = {
    send(msg) { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); },
    close() { closedByUs = true; ws?.close(); },
  };
  const open = () => {
    ws = new WebSocket(`${proto}://${location.host}/ws?${qs}`);
    ws.onopen = () => { retry = 0; api.send({ t: 'join', ...hello }); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* 무시 */ } };
    ws.onclose = (e) => {
      if (closedByUs) return;
      const fatal = e.code === 4001 || e.code === 4002 || e.code === 4003 || e.code === 4004;
      onClose?.(e.code, fatal);
      if (!fatal) setTimeout(open, Math.min(8000, 800 * 2 ** retry++));
    };
  };
  open();
  return api;
}

// 측정 이벤트(종류만). 서버가 없는 미리보기 페이지에서는 보내지 않는다.
export function track(type) {
  if (window.__FORCE_MODE) return;
  try {
    fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type }), keepalive: true }).catch(() => {});
  } catch { /* 측정 실패는 무시 */ }
}

// 화면 오류를 서버에 남긴다(한 화면에서 최대 5번). 주소의 열쇠(k·h)는 지운다.
let reported = 0;
export function reportError(msg) {
  if (window.__FORCE_MODE || reported >= 5) return;
  reported += 1;
  const place = location.pathname;
  try {
    fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msg: String(msg).slice(0, 300), place }), keepalive: true }).catch(() => {});
  } catch { /* 무시 */ }
}
