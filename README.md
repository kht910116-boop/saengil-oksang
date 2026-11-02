# 생일 옥상 (saengil-oksang)

친구 생일 자정에 다 같이 불을 켜는 3D 옥상 서비스.
친구들이 생일 옥상에 등불을 모으는 동안 주인공은 닫힌 문 앞에서 기다리고, 생일 자정이 되면 문이 열리며 모든 접속자 화면에서 동시에 점등됩니다.

## 기능
- 옥상 만들기: 주인공 이름과 생일 → 친구 링크 / 주인공 링크 / 관리 링크 3개
- 실시간 동시 접속: 아바타 이동, 접속자 수, 등불이 바로 공유됨(방당 40명)
- 등불: 준비된 축하 문구 16개 중에서 고름(자유 입력 없음), 옥상당 180개
- 이름 필터(서버·화면 공통, `src/config.js`의 validateName): 한글 완성형·영어만 허용, 숫자·기호·자음만 쓴 글자·이모지 차단, 욕설 변형·영타 욕설, 연락처·계정·주소 단어, 한글로 쓴 숫자 4자 이상, 운영자 사칭 차단
- 주인공: 자정 15초 전까지 닫힌 문만 보임(등불 개수만), 자정 뒤 처음 들어오면 점등 연출을 한 번 보여줌
- 관리: 만든 사람은 링크 다시 보기, 등불 숨기기/다시 보이기, 옥상 지우기. 주인공은 문이 열린 뒤 등불 숨기기 가능
- 신고: 같은 사람은 1번만 집계, 3건이면 자동 숨김. 운영자 화면 `/admin?key=…`
- 옥상 선물: 자정 불꽃놀이·풍선 묶음·케이크 토핑(익명 가능, 익명이면 이름을 저장하지 않음). 지금은 전부 무료(PAYMENT_MODE=free, 한 사람당 10분에 10개)
- 카카오톡·SNS 링크 미리보기(옥상마다 제목·설명이 다름), 자정 알림 캘린더(.ics), 점등 영상 저장(지원 브라우저)
- 느린 기기에서 해상도·빛 번짐 자동 조절, 숨겨진 화면에서는 렌더링 중지
- 개인정보처리방침 `/privacy`, 이용약관 `/terms`
- 보관 기간: 생일 자정으로부터 400일 뒤 자동 삭제

## 로컬 실행
```bash
npm install
npm run build              # 화면 빌드(dist/)
ADMIN_KEY=비밀키 npm start  # http://localhost:8787
```
- 샘플 옥상: `/r/demo`
- 시험용 옥상: 첫 화면에서 "1분 뒤를 자정으로" 체크

## 환경 변수
| 이름 | 설명 | 기본값 |
|---|---|---|
| `PORT` | 서버 포트 | 8787 |
| `DB_PATH` | SQLite 파일 위치(배포 시 영구 디스크에) | `data/rooftop.db` |
| `ADMIN_KEY` | 운영자 화면 키. 비우면 운영자 화면이 꺼짐 | 없음 |
| `IP_SALT` | 신고 중복 판정용 IP 해시 소금값. 고정해 두기 | 실행할 때마다 무작위 |
| `NODE_ENV` | `production`이면 index.html을 캐시 | |
| `TRUST_PROXY` | `1`이면 프록시가 넘긴 접속 IP(x-forwarded-for)를 믿음. Cloudflare 등 뒤에 둘 때만 켜기 | 꺼짐 |

## 배포 (호스팅 정해지면)
- Docker: `docker build -t saengil-oksang . && docker run -p 8787:8787 -v $(pwd)/data:/app/data -e ADMIN_KEY=… -e IP_SALT=… saengil-oksang`
- 반드시 HTTPS 뒤에 두세요(WebSocket이 `wss://`로 연결됨). 프록시는 WebSocket 업그레이드를 통과시켜야 합니다.
- 정적 파일(`/assets/`, 이미지, 음악)은 Cloudflare 같은 CDN 캐시를 붙이면 전송비가 크게 줄어듭니다.
- 백업: `data/rooftop.db` 파일 하나만 복사하면 됩니다.
- 호스팅 업체가 정해지면 `public/privacy.html`의 "처리 위탁" 항목에 업체명을 적어야 합니다.

## BGM
`public/audio/`에 상황별 곡 3개(bgm-rooftop / bgm-door / bgm-midnight)가 들어 있습니다. 소리를 켠 사람만 내려받습니다. 곡 출처와 손질 내용, 새 곡 만드는 법은 `BGM_GUIDE.md`.

## 구조
- `server/index.js` — HTTP·WebSocket 서버, SQLite 저장, 미리보기·운영자 화면
- `src/config.js` — 서버와 화면이 같이 쓰는 설정(문구, 한도, 보관 기간)
- `src/main.js` — 화면(모드: 첫 화면 / 샘플 / 실제 옥상)
- `src/world.js` · `src/avatar.js` — 옥상과 마시멜로 인형(모두 코드로 그림, 3D 모델 파일 없음)
- `src/audio.js` · `src/recorder.js` · `src/net.js` — 소리, 영상·캘린더, 통신
- `public/` — 개인정보처리방침, 이용약관, 미리보기 이미지, BGM
