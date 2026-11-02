// 단위 시험: 이름 필터, 조사, 날짜 계산 (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateName, josa, nextReveal, closeAt, revealLabel, callName, renderTemplate } from '../src/config.js';

test('이름 필터: 평범한 이름은 통과', () => {
  for (const n of ['민지', '수아', 'David', 'Caroline', 'Janet', 'Min Ji', '오이', '박서준', '이사랑']) assert.equal(validateName(n).ok, true, n);
});

test('이름 필터: 욕설·개인정보·사칭·기호는 차단', () => {
  for (const n of ['씨발', '씨 발', 'ㅅㅂ', 'tlqkf', 'Fuuuck', '010-1234-5678', '공일공일이삼사', '카톡아이디', 'instaminji', 'naver', '운영자', 'admin', '민지😀', '민지123', '#민지', '아주아주아주긴이름이에요']) {
    assert.equal(validateName(n).ok, false, n);
  }
});

test('조사: 받침에 따라 이/가, 을/를', () => {
  assert.equal(josa('도윤', '이가'), '도윤이');
  assert.equal(josa('민지', '이가'), '민지가');
  assert.equal(josa('토핑', '을를'), '토핑을');
  assert.equal(josa('케이크', '을를'), '케이크를');
  assert.equal(callName('수진'), '수진아');
  assert.equal(callName('민지'), '민지야');
  assert.equal(renderTemplate(0, '수진'), '수진아, 생일 축하해!');
});

test('공개 시각: 생일 당일 원하는 시각, 지난 생일은 내년', () => {
  const now = Date.UTC(2026, 10, 2); // 2026-11-02 09:00 KST
  assert.equal(revealLabel(nextReveal(11, 5, 21, now)), '11월 5일 오후 9시');
  assert.equal(revealLabel(nextReveal(11, 5, 0, now)), '11월 5일 자정');
  assert.equal(new Date(nextReveal(10, 1, 0, now) + 9 * 3600_000).getUTCFullYear(), 2027);
});

test('공개 시각: 생일 당일에 만들면 그 해 그대로', () => {
  const birthdayNoon = Date.UTC(2026, 10, 5, 3); // 11-05 12:00 KST
  assert.equal(revealLabel(nextReveal(11, 5, 21, birthdayNoon)), '11월 5일 오후 9시');
});

test('2월 29일 생일: 평년은 2월 28일, 윤년은 2월 29일', () => {
  assert.equal(revealLabel(nextReveal(2, 29, 0, Date.UTC(2026, 10, 2))), '2월 28일 자정');
  assert.equal(revealLabel(nextReveal(2, 29, 0, Date.UTC(2028, 0, 1))), '2월 29일 자정');
});

test('닫는 시각: 생일 다음 날 0시 5분', () => {
  const at = nextReveal(11, 20, 21, Date.UTC(2026, 10, 2));
  const close = new Date(closeAt(at) + 9 * 3600_000);
  assert.deepEqual([close.getUTCMonth() + 1, close.getUTCDate(), close.getUTCHours(), close.getUTCMinutes()], [11, 21, 0, 5]);
  const midnight = nextReveal(11, 20, 0, Date.UTC(2026, 10, 2));
  assert.equal(closeAt(midnight) - midnight, 86400_000 + 5 * 60_000);
});
