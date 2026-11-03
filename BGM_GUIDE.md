# BGM 만들기 안내 (Google Flow용)

## 지금 들어가 있는 곡 (2026-11-02)
Google Flow Music으로 만든 6곡 중 3곡을 골라 손질해 넣었습니다. 6곡 모두 Whisper로 확인한 결과 목소리·가사가 없는 연주곡이었습니다.

| 파일 | 원곡 | 손질 |
|---|---|---|
| `bgm-rooftop.mp3` | Rooftop Birthday Glow (Take 2) | 끝 페이드아웃 제거, 끝 3초를 처음과 겹쳐 이음새 없이 반복, 음량 맞춤(134초) |
| `bgm-door.mp3` | Outside the Door (Take 2) | 같은 방식으로 반복 처리(148초) |
| `bgm-midnight.mp3` | The Big Reveal (Take 2) | 7.1초부터 32초만 사용, 소리가 터지는 순간이 하늘에 이름이 뜨는 4.8초 무렵에 오도록 맞춤, 끝 3초 페이드아웃 |

다른 버전(Take 1)으로 바꾸고 싶으면 원곡 파일을 주고 말해 주세요.

---

오늘의 주인공은 상황마다 다른 곡을 자동으로 바꿔 틉니다. 아래 3곡을 만들어 **파일 이름을 정확히 똑같이** 바꾼 뒤 보내 주시면 바로 연결됩니다. 파일이 없어도 서비스는 효과음만으로 정상 동작합니다.

| 파일 이름 | 언제 나오나 | 길이 | 반복 |
|---|---|---|---|
| `bgm-rooftop.mp3` | 파티장에 있는 동안(첫 화면, 샘플 포함) | 2~3분 | 반복 재생 |
| `bgm-door.mp3` | 주인공이 닫힌 문 앞에서 자정을 기다릴 때 | 1~2분 | 반복 재생 |
| `bgm-midnight.mp3` | 자정 점등 순간 | 30~40초 | 한 번만 재생 후 파티장 곡으로 돌아감 |

## 만드는 순서 (초등학생 버전)

1. Google Flow에 들어가서 음악 만들기 화면을 엽니다.
2. 아래 **프롬프트**를 한 곡씩 복사해서 붙여 넣고 만들기를 누릅니다.
3. 마음에 드는 결과가 나올 때까지 2~3번 다시 만들어 보고, 제일 좋은 것을 고릅니다.
4. mp3로 내려받습니다.
5. 파일 이름을 표에 있는 이름으로 바꿉니다. (예: `bgm-rooftop.mp3`)
6. 3개 파일을 채팅에 올려 주세요. 제가 `public/audio/` 폴더에 넣습니다.

> 상업적으로 써도 되는지는 Flow의 이용약관에서 한 번 확인해 주세요. 서비스는 무료지만 후원을 받기 때문입니다.

## 프롬프트

음악 생성 도구는 보통 영어 프롬프트를 더 잘 알아듣습니다. 영어를 그대로 붙여 넣으면 됩니다.

### 1. `bgm-rooftop.mp3` — 밤 파티장의 생일 파티

> Cozy lo-fi acoustic instrumental for a small birthday gathering on a city rooftop at night. Warm nylon guitar, soft felt piano, gentle brushed drums, a little glockenspiel sparkle, faint distant city ambience. 76 BPM, relaxed and happy, a bit nostalgic. No vocals. Smooth loopable ending that flows back into the beginning. 2 to 3 minutes.

(한국어 설명: 밤 파티장의 작은 생일 모임. 따뜻한 기타와 피아노, 살짝 반짝이는 글로켄슈필. 가사 없음. 끝과 처음이 자연스럽게 이어지게.)

### 2. `bgm-door.mp3` — 문 앞에서 기다리는 설렘

> Quiet, anticipatory ambient music box lullaby. Slow celesta and soft music box melody over a warm sustained pad, very sparse, like waiting outside a door where friends are secretly preparing a surprise. Gentle, curious, softly excited. 60 BPM. No drums, no vocals. Seamless loop. 1 to 2 minutes.

(한국어 설명: 친구들이 몰래 준비하는 문 앞에서 기다리는 느낌. 오르골과 첼레스타, 아주 조용하게. 드럼·가사 없음.)

### 3. `bgm-midnight.mp3` — 자정 점등 순간

> A 35-second cinematic birthday reveal. Starts almost silent with a single music box note for the first 4 seconds, then at 5 seconds blooms into a warm swell of strings, bells and soft choir pads as lights turn on one by one, rising to a joyful, tender peak around 12 seconds, then settles into a gentle glowing ending. Magical, heartfelt, celebratory. No lyrics.

(한국어 설명: 처음 4초는 거의 조용하다가, 5초쯤 전구가 켜지는 순간 현악과 종소리가 확 피어나고, 12초쯤 절정, 그다음 잔잔하게 끝남. 화면 연출은 1.2초에 전구가 켜지기 시작해 4.8초에 하늘에 이름이 떠오르도록 맞춰져 있습니다.)
