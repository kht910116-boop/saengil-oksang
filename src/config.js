// 서버와 화면이 같이 쓰는 설정
export const SERVICE_NAME = '생일 옥상';
export const CONTACT_EMAIL = 'ddorami2003@gmail.com';
export const MAX_LANTERNS = 180; // 전구 줄의 등불 자리 수(183)보다 조금 적게
export const OWNER_EARLY_MS = 15_000; // 주인공은 자정 15초 전에 입장
export const RETENTION_DAYS = 400; // 생일 자정으로부터 약 13개월 뒤 삭제
export const REPORT_HIDE_THRESHOLD = 3; // 신고 3건이면 자동으로 숨김

// 등불 문구: 직접 쓰지 않고 이 중에서 고른다(욕설·개인정보 방지). {부름}은 "민지야/수진아"처럼 바뀐다.
export const LANTERN_TEMPLATES = [
  '{부름}, 생일 축하해!',
  '태어나줘서 고마워',
  '올해도 늘 네 편이야',
  '건강하고 행복하자',
  '오늘은 너의 날이야',
  '함께여서 늘 고마워',
  '새로운 한 해도 반짝이길',
  '꿈꾸는 일 모두 이루어지길',
  '웃는 날이 더 많은 한 해 되길',
  '우리 오래오래 보자',
  '맛있는 거 먹으러 가자!',
  '너라서 참 좋아',
  '올해도 수고 많았어, 응원해',
  '세상에서 제일 축하해',
  '사랑해, 생일 축하해',
  '다음 생일에도 같이 불 켜자',
];

// 받침이 있으면 "아", 없으면 "야" (한글이 아니면 이름만)
export function callName(name) {
  const last = String(name).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return name;
  return name + (code % 28 ? '아' : '야');
}

export function renderTemplate(index, owner) {
  const t = LANTERN_TEMPLATES[index];
  return t ? t.replace('{부름}', callName(owner)) : null;
}

// 이름에 연락처·이메일 같은 개인정보가 들어가지 않게
export function looksPersonal(text) {
  return /\d{4,}|@|https?:|www\.|\.com|\.kr/i.test(String(text).replace(/[\s-]/g, ''));
}
