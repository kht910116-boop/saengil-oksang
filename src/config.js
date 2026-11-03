// 서버와 화면이 같이 쓰는 설정
export const SERVICE_NAME = '오늘의 주인공';
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

// ── 이름 필터 ──
// 1) 허용 목록: 한글 완성형 글자와 영어, 띄어쓰기만. 숫자·기호·자음/모음만 쓴 글자·이모지는 전부 막는다.
// 2) 욕설(변형·영타 포함), 3) 연락처·계정·주소 단어, 4) 한글로 쓴 숫자 4자 이상, 5) 운영자 사칭을 막는다.
const BAD_WORDS = [
  '씨발', '시발', '씨바', '시바', '씨빨', '씨팔', '시팔', '쉬발', '쓰발', '쓰벌', '씹', '좆', '좃', '존나', '졸라', '병신', '븅신', '빙신', '병싄',
  '개새', '개색', '개쉐', '개세', '새끼', '쌍년', '쌍놈', '썅', '지랄', '미친놈', '미친년', '미친새', '닥쳐', '꺼져', '엿먹', '니미', '니애미', '느금', '애미', '애비', '엠창',
  '섹스', '야동', '자지', '보지', '창녀', '걸레', '한남', '한녀', '틀딱', '급식충', '맘충',
  'fuck', 'fuk', 'shit', 'bitch', 'sex', 'porn', 'dick', 'pussy', 'asshole', 'nigg',
  'tlqkf', 'tlqk', 'qudtls', 'whssk', 'wlfkf', 'rotoRl', 'rotor', 'ssibal', 'sibal', 'byungsin',
];
const PERSONAL_KO = ['카톡', '카카오', '아이디', '인스타', '디엠', '전화', '연락', '번호', '핸드폰', '휴대폰', '폰번', '주소', '계좌', '은행', '텔레', '오픈채팅', '오픈톡', '오카', '메일', '지메일', '네이버', '닷컴', '점컴', '골뱅이', '유튜브', '틱톡', '트위터', '페북', '디스코드', '라인아이디'];
// 짧은 영어 단어는 이름 속 글자와 겹치지 않게 단어 단위로, 긴 단어는 붙여 써도 잡는다
const PERSONAL_EN_WORD = /\b(id|ig|dm|tel|line|mail|com|net|kr|fb|phone|call|dial)\b/i;
const PERSONAL_EN_ANY = ['kakao', 'katalk', 'kakaotalk', 'insta', 'telegram', 'gmail', 'naver', 'daum', 'hanmail', 'http', 'www', 'youtube', 'tiktok', 'twitter', 'facebook', 'discord', 'openchat', 'snapchat'];
const NUM_WORDS = /[영공일이삼사오육륙칠팔구]{4,}/;
const IMPERSONATE = ['운영자', '관리자', '운영진', '공식', 'admin', 'official', 'staff'];

export function validateName(input, { max = 10 } = {}) {
  const value = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return { ok: false, error: '이름을 적어주세요.' };
  if (value.length > max) return { ok: false, error: `이름은 ${max}자까지 적을 수 있어요.` };
  if (!/^[\uAC00-\uD7A3A-Za-z ]+$/.test(value)) return { ok: false, error: '이름은 한글이나 영어로만 적어주세요. 숫자, 기호, 자음만 쓴 글자는 쓸 수 없어요.' };
  const flat = value.replace(/ /g, '').toLowerCase();
  const squeezed = flat.replace(/(.)\1+/g, '$1'); // fuuuck → fuck, 씨이이발 같은 반복 변형 대비
  if (BAD_WORDS.some((w) => flat.includes(w.toLowerCase()) || squeezed.includes(w.toLowerCase()))) return { ok: false, error: '다른 이름으로 적어주세요.' };
  if (PERSONAL_KO.some((w) => flat.includes(w)) || PERSONAL_EN_ANY.some((w) => flat.includes(w)) || PERSONAL_EN_WORD.test(value) || NUM_WORDS.test(flat)) {
    return { ok: false, error: '이름에는 연락처, 계정, 주소 같은 개인정보를 적을 수 없어요.' };
  }
  if (IMPERSONATE.some((w) => flat.includes(w))) return { ok: false, error: '운영자로 오해할 수 있는 이름은 쓸 수 없어요.' };
  return { ok: true, value };
}

// 파티장 선물: 친구가 사서 파티장에 보이게 하는 디지털 선물(현금으로 바꿔주지 않음)
export const GIFT_ITEMS = {
  fireworks: { name: '불꽃놀이', price: 3000, limit: 20, desc: '점등 순간 파티장 위로 불꽃이 터져요. 점등이 지났다면 바로 터져요.' },
  balloons: { name: '풍선 묶음', price: 2000, limit: 30, desc: '파티장에 풍선 묶음이 하나 더 떠올라요.' },
  topping: { name: '케이크 토핑', price: 1000, limit: 24, desc: '케이크 위에 딸기가 하나 올라가요.' },
};
// 결제 방식: 'free'면 모든 선물이 무료. 나중에 유료로 바꿀 때 서버의 결제 확인 부분만 바꾼다.
export const PAYMENT_MODE = 'free';

// 받침에 맞는 조사: josa('도윤', '이가') → '도윤이', josa('토핑', '을를') → '토핑을'
export function josa(word, pair) {
  const w = String(word);
  const code = w.charCodeAt(w.length - 1) - 0xac00;
  const has = code >= 0 && code <= 11171 ? code % 28 !== 0 : false;
  const [withB, withoutB] = pair === '이가' ? ['이', '가'] : pair === '을를' ? ['을', '를'] : pair === '와과' ? ['과', '와'] : ['은', '는'];
  return w + (has ? withB : withoutB);
}

// 등불 개인화(자유 입력 없이 고르기만)
export const LANTERN_RELATIONS = ['친구', '가족', '연인', '동료', '선후배', '비밀'];
export const MAX_YEARS = 40; // 알고 지낸 햇수(0은 '모름')
// 주인공 답례 문구
export const THANKS_TEMPLATES = ['다들 정말 고마워!', '최고의 생일이었어', '덕분에 행복한 하루야', '사랑해 친구들', '내년에도 같이 불 켜자'];
// 공동 목표: 등불이 이만큼 모이면 점등 때 유성우
export const GOAL_LANTERNS = 20;

// 공개 시각 표시: 0시는 '자정', 나머지는 '오후 9시'처럼
export function revealLabel(ms, { withDate = true } = {}) {
  const d = new Date(ms + 9 * 3600_000);
  const h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const time = h === 0 && mi === 0 ? '자정' : `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}시${mi ? ` ${mi}분` : ''}`;
  return withDate ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${time}` : time;
}

// 생일(월/일)과 공개 시각(0~23시) → 다음 공개 시각(한국 시간). 생일 당일 하루 동안은 그 해로 본다.
export function nextReveal(month, day, hour = 0, now = Date.now()) {
  const KST = 9 * 3600_000;
  let year = new Date(now + KST).getUTCFullYear();
  // 2월 29일 생일은 평년에 2월 28일로(그대로 두면 3월 1일로 넘어간다)
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dayStart = (y) => Date.UTC(y, month - 1, month === 2 && day === 29 && !leap(y) ? 28 : day) - KST;
  if (dayStart(year) + 86400_000 <= now) year += 1;
  return dayStart(year) + hour * 3600_000;
}

// 하루짜리 파티장: 생일 다음 날 0시 5분에 닫히고 데이터를 지운다
export const CLOSE_AFTER_MIDNIGHT_MS = 5 * 60_000;
export const MAX_ROOFTOPS_PER_DAY = 300; // 하루에 새로 만들 수 있는 파티장 수(한국 시간 기준)
export const MAX_DAYS_AHEAD = 60; // 생일 60일 전부터 만들 수 있다
// 공개 시각이 속한 날(한국 시간)의 다음 날 0시 5분
export function closeAt(igniteAt) {
  const KST = 9 * 3600_000;
  const d = new Date(igniteAt + KST);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - KST;
  return dayStart + 86400_000 + CLOSE_AFTER_MIDNIGHT_MS;
}

// 서비스 이름과 파티 장소·의상 목록(나중에 유료 장소·한정 의상을 붙일 수 있게 목록으로 둔다)
export const BRAND = '오늘의 주인공';
export const VENUES = {
  cruise: { name: '밤바다 크루즈', desc: '달빛 아래 유람선 갑판, 바다 위에서 터지는 불꽃' },
  aurora: { name: '오로라 유리돔', desc: '눈 덮인 설원의 투명한 돔, 점등 때 하늘을 덮는 오로라' },
  sky: { name: '구름 위 열기구 광장', desc: '노을 진 구름 위에 떠 있는 광장과 열기구들' },
  space: { name: '우주 전망 라운지', desc: '지구가 내려다보이는 우주정거장 라운지' },
  rooftop: { name: '도시 옥상', desc: '불 켜진 도시가 내려다보이는 밤 옥상' },
};
export const DEFAULT_VENUE = 'cruise';
// 입장할 때 고르는 파티 의상. 나중에 유료 의상을 추가할 수 있게 목록으로 둔다.
export const OUTFITS = {
  dress: { name: '드레스' },
  suit: { name: '정장' },
  party: { name: '파티복' },
};
export const DEFAULT_OUTFIT = 'party';
// 입장할 때 고르는 꾸미기 소품(리본·귀는 고깔모자 대신 쓴다)
export const ACCESSORIES = { none: { name: '없음' }, ribbon: { name: '리본' }, cat: { name: '고양이 귀' }, bunny: { name: '토끼 귀' }, glasses: { name: '안경' }, flower: { name: '꽃 핀' } };
