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
  if (!/^[가-힣A-Za-z ]+$/.test(value)) return { ok: false, error: '이름은 한글이나 영어로만 적어주세요. 숫자, 기호, 자음만 쓴 글자는 쓸 수 없어요.' };
  const flat = value.replace(/ /g, '').toLowerCase();
  const squeezed = flat.replace(/(.)\1+/g, '$1'); // fuuuck → fuck, 씨이이발 같은 반복 변형 대비
  if (BAD_WORDS.some((w) => flat.includes(w.toLowerCase()) || squeezed.includes(w.toLowerCase()))) return { ok: false, error: '다른 이름으로 적어주세요.' };
  if (PERSONAL_KO.some((w) => flat.includes(w)) || PERSONAL_EN_ANY.some((w) => flat.includes(w)) || PERSONAL_EN_WORD.test(value) || NUM_WORDS.test(flat)) {
    return { ok: false, error: '이름에는 연락처, 계정, 주소 같은 개인정보를 적을 수 없어요.' };
  }
  if (IMPERSONATE.some((w) => flat.includes(w))) return { ok: false, error: '운영자로 오해할 수 있는 이름은 쓸 수 없어요.' };
  return { ok: true, value };
}

// 옥상 선물: 친구가 사서 옥상에 보이게 하는 디지털 선물(현금으로 바꿔주지 않음)
export const GIFT_ITEMS = {
  fireworks: { name: '자정 불꽃놀이', price: 3000, limit: 20, desc: '점등 순간 옥상 위로 불꽃이 터져요. 점등이 지났다면 바로 터져요.' },
  balloons: { name: '풍선 묶음', price: 2000, limit: 30, desc: '옥상에 풍선 묶음이 하나 더 떠올라요.' },
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
