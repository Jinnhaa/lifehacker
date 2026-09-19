# Lifehacker Design System

**Status:** CANONICAL  
**Purpose:** Lifehacker Web의 시각 언어, 2.5D Office 구성, Game UI 컴포넌트와 interaction 구현 기준을 정의한다.

화면 구조와 기능 배치는 `docs/product-ia.md`를 따른다.

이 문서는 "어떤 느낌으로 만들 것인가"가 아니라
**코드에서 어떤 시각 규칙을 반복 사용할 것인가**를 정의한다.

---

## 1. Visual Direction

Lifehacker의 목표 경험:

> 실제 일을 하고 있지만 타이쿤 게임을 플레이하는 것처럼 느껴지는 Personal AI OS

핵심 키워드:

- Cozy Tycoon
- 2.5D Office
- Playful Productivity
- Warm Control Room
- Clear Mission
- Low Cognitive Load

Lifehacker는 생산성 SaaS 위에 게임 이미지를 씌운 제품이 아니다.

Office World, Agent, Mission, HUD가 실제 기능을 가진다.

---

## 2. Visual Hierarchy

Home 기준 권장 비율:

- Office World: 70~75%
- Functional UI / HUD: 25~30%

UI가 Office World를 덮지 않는다.

기본 정보는 적게 보여주고,
상세 정보는 click / popup / sheet를 통해 연다.

한 화면의 주요 시각적 초점은 최대 3개로 제한한다.

Home에서는 다음 우선순위를 따른다.

1. Main Quest
2. Today's Missions
3. Agent / Office World

---

## 3. Color Tokens

기본 색상은 warm cream + wood + muted game accent를 사용한다.

CSS variable 권장값:

--lh-world-cream: #F4DEC0
--lh-floor-light: #F7E8CF
--lh-panel: #FFF4DC
--lh-panel-soft: #F7E7C8
--lh-panel-warm: #EFCB96

--lh-wood-light: #D39A63
--lh-wood: #B87447
--lh-wood-dark: #825137

--lh-outline: #5D493D
--lh-outline-soft: #8A7060

--lh-text: #43372F
--lh-text-soft: #7B695B
--lh-text-muted: #9C8979

--lh-orange: #F5A83B
--lh-yellow: #FFD65A
--lh-mint: #65CDB6
--lh-teal: #38AFA5
--lh-green: #72B95B
--lh-red: #E76D5D
--lh-blue: #6DB8D8

색상 의미:

- Orange = primary action
- Yellow = mission / achievement
- Mint / Teal = progress / learning
- Green = complete / success
- Red = risk / deadline pressure
- Blue = neutral information

새 화면마다 임의의 accent color를 추가하지 않는다.

---

## 4. Typography

기본 본문은 읽기 쉬운 pretendard를 사용한다.

게임 느낌은 장식 폰트보다
frame, badge, weight, icon, depth로 만든다.

권장 hierarchy:

- Screen title: 24~28px / 700~800
- Main Quest title: 20~22px / 700
- Panel title: 16~18px / 700
- Body: 14~15px / 500
- Secondary body: 13~14px / 500
- Metadata: 12~13px / 500
- Badge: 11~12px / 700

본문 line-height:

- normal text: 1.45~1.6
- compact HUD: 1.2~1.35

과도하게 큰 Hero typography를 사용하지 않는다.

---

## 5. Game Surface

일반 SaaS white card를 기본 컴포넌트로 사용하지 않는다.

기본 Game Panel:

- background: warm cream
- radius: 18~24px
- outer outline: 2~3px
- short bottom shadow
- subtle inner highlight

권장 CSS 특성:

- border: 2px solid var(--lh-outline)
- border-radius: 20px
- box-shadow: 0 5px 0 rgba(84, 57, 40, 0.20)
- inset highlight: inset 0 1px rgba(255,255,255,0.65)

큰 panel은 필요 시 wood frame을 사용한다.

wood frame은 단순 brown rectangle이 아니라:

- 밝은 상단
- 중간 wood body
- 어두운 하단
- 짧은 shadow

의 3단 depth를 느끼게 한다.

---

## 6. Panel Density

큰 white card를 여러 개 세로로 쌓지 않는다.

Home 중앙은 여러 카드가 아니라
**하나의 Quest Console 안에서 정보 hierarchy를 나눈다.**

기본 panel padding:

- large console: 20~24px
- medium panel: 16~20px
- compact HUD: 10~14px

compact panel 사이 gap:

- 8~12px

large section 사이 gap:

- 16~24px

---

## 7. Buttons

버튼은 flat SaaS button보다
살짝 눌리는 physical game button에 가깝게 만든다.

Primary:

- Orange 또는 Green
- 2px dark outline
- radius 12~16px
- bottom shadow 3~4px
- bold label

Hover:

- brightness +2~4%
- translateY(-1px)

Pressed:

- translateY(2px)
- bottom shadow 감소

Disabled:

- saturation 감소
- opacity 0.55~0.65
- shadow 최소화

버튼 높이:

- primary CTA: 44~52px
- secondary: 36~42px
- compact: 30~34px

---

## 8. Quest Console

Home 중앙의 핵심 컴포넌트.

구성:

QuestConsole
- MainQuest
- FocusDurationSelector
- NextQuestList
- TodayCapacity

세 영역은 서로 다른 SaaS Card가 아니라
하나의 Game Panel 안에 배치한다.

### Main Quest

가장 밝고 시각적 우선순위가 높다.

표시:

- Task icon
- 구체적인 현재 행동
- Project / Course context
- 예상 소요시간
- 짧은 이유
- 진행 상태
- 집중시간 선택
- 집중 시작

Main Quest title은 추상적인 parent Task보다
현재 실행 가능한 Step을 우선한다.

좋음:
- 데이터베이스 2주차 영상강의 1/2 수강

나쁨:
- 데이터베이스 공부

### Focus Duration Selector

기본:

- 25분
- 45분
- 60분
- 직접 설정

selected 상태:

- orange / yellow surface
- stronger outline
- subtle raised state

### Next Quest

리스트형으로 compact하게 보여준다.

각 row:

- icon
- Quest title
- estimated duration
- optional short context
- disclosure affordance

정확한 시작시간은 기본 노출하지 않는다.

### Today Capacity

가장 작은 정보 밀도로 표현한다.

표시:

- available time
- estimated required time
- difference
- visual meter
- Chief 한 줄 판단

수치가 부족한 경우 Red를 전체 panel에 쓰지 않고
차이와 meter 일부에만 사용한다.

---

## 9. Today's Missions

Today's Missions는 일반 Todo List가 아니다.

게임의 Daily Mission Board처럼 표현한다.

최대 3개:

- Clear Quest
- Level-up Quest
- Bonus Quest

권장 의미:

Clear Quest:
오늘 해결하지 않으면 실제 문제가 생기는 것

Level-up Quest:
학습 / 장기 목표 / 성장

Bonus Quest:
미리 해두면 미래 부담이 줄어드는 것

Mission card는 Main Quest보다 작고 compact해야 한다.

각 mission:

- category icon
- 짧은 title
- progress
- 상태

Mission 전체 높이는 가능한 한 56~72px 범위로 유지한다.

---

## 10. Mission Completion

완료 피드백은 반드시 존재한다.

기본 flow:

check
→ short scale feedback
→ progress update
→ optional "CLEAR!" / "COMPLETE"

Motion duration:

- check: 120~180ms
- card feedback: 250~350ms
- progress animation: 300~500ms

초기 MVP에서:

- coin economy
- complex XP economy
- random rewards

는 만들지 않는다.

---

## 11. Game Dock

기존 상단 SaaS navigation을 사용하지 않는다.

Game Dock:

- Home
- Work
- Projects
- Learning
- Settings

권장 위치:

- desktop: bottom center
- compact width
- floating game dock

권장 button 크기:

- 52~60px

아이콘 gap:

- 8~12px

active state:

- icon/button이 3~5px 위로 올라옴
- highlight plate
- stronger shadow

inactive state:

- compact icon
- muted surface

Dock 전체가 viewport 폭 전체를 차지하지 않는다.

---

## 12. Popup

Popup은 긴 Form Page보다
작고 명확한 Game Dialog 형태를 우선한다.

권장 width:

- 380~520px

구조:

- optional title plate
- main content
- compact options
- primary action
- secondary action

background:

- dim overlay
- 0.35~0.55 opacity

한 popup에서 사용자가 내려야 하는 핵심 결정은 가능한 한 하나로 제한한다.

---

## 13. Persistent Review Toast

Chief의 승인 요청은 Home 우측 하단에 표시한다.

특성:

- compact
- Office World를 크게 가리지 않음
- 승인 / 거절 전까지 유지
- click 시 Review popup / drawer open

표시:

- 변경 요약
- 이유 한 줄
- 검토
- 승인
- 거절

일반 notification toast처럼 몇 초 뒤 자동 제거하지 않는다.

---

## 14. Bottom Sheet

Bottom Sheet는 Mission 수행 또는 Step 진행에 사용한다.

적합:

- 현재 Quest 상세
- Step 진행
- 간단 선택
- quick edit

부적합:

- 전체 Task 관리
- 큰 Project dashboard
- 긴 설정 페이지

Bottom Sheet에서도 현재 행동 하나를 가장 강조한다.

---

## 15. Focus Mode

Focus Mode는 별도 Productivity Dashboard가 아니다.

기존 Office World를 유지한다.

처리:

- 전체 world dim: 60~75%
- 현재 Quest / Agent 영역 spotlight
- 중앙 floating focus panel
- Timer + Task + minimal actions

Spotlight는 radial gradient 또는 mask를 사용한다.

시각 목표:

> modal을 띄운 느낌이 아니라 무대 조명이 한 지점에 집중되는 느낌

Focus 중:

보임:
- current Task
- Timer
- complete
- pause / stop

숨김 또는 약화:
- Today's Missions
- unrelated Agents
- game dock
- 일반 notification

---

## 16. 2.5D Office Geometry

2.5D는 캐릭터 화풍보다
공간의 perspective와 layering으로 만든다.

기본 시점:

- top-down 3/4 view
- 약 35~50도 위에서 내려다보는 느낌
- 정면 perspective 금지
- 완전한 top-down 금지

Office는 최소한 다음 레이어를 가진다.

1. floor
2. rug / zone
3. back furniture
4. chair back
5. character
6. desk body
7. monitor / desk foreground
8. HUD / badge

공간 깊이는:

- overlap
- object size
- z-index
- directional shadow

로 표현한다.

Home에서 불필요한 작은 장식은 최소화한다.

목표는 풍부함이 아니라
**읽기 쉬운 타이쿤 공간**이다.

---

## 17. Office Complexity

Home 배경은 초기 시안보다 단순하게 유지한다.

한 Agent station당 기본 오브젝트:

- desk
- chair
- monitor
- character
- identity object 1~2개
- optional plant

작은 장식물을 다수 배치하지 않는다.

전체 Office에서 동시에 강한 시각적 accent를 가진 오브젝트는
3~5개 수준으로 제한한다.

빈 floor area를 의도적으로 남긴다.

---

## 18. Agent Station Composition

Agent마다 하나의 Station을 갖는다.

예:

Chief Station:
- central control desk
- monitor
- planning object
- Chief character

Project PM Station:
- desk
- monitor
- project document / board
- Project PM character

Learning Station:
- desk
- monitor
- books / graduation object
- Learning character

Station을 클릭하면 해당 기능으로 진입한다.

---

## 19. Character + Desk Composition

기존 한교동 등 캐릭터 이미지는 유지할 수 있다.

캐릭터를 억지로 3D로 다시 만들지 않는다.

2.5D 공간에 자연스럽게 배치하기 위한 기본 레이어:

1. floor
2. rug / shadow
3. chair back
4. character
5. desk front
6. monitor / foreground object
7. status badge

중요:

**Character 일부를 Desk foreground가 가려야 한다.**

캐릭터 전체가 책상 위에 떠 있는 sticker처럼 보여서는 안 된다.

권장 layering:

- character z-index: 30
- desk-front z-index: 40
- monitor foreground z-index: 45
- status badge z-index: 60

캐릭터와 책상에는 같은 방향의 soft shadow를 사용한다.

권장 drop shadow:

0 5px 3px rgba(90, 61, 40, 0.16~0.20)

필요할 경우 캐릭터에 아주 약한 warm treatment를 적용한다.

강한 sepia / saturation filter는 사용하지 않는다.

---

## 20. Desk Assets

MVP에서는 책상을 작은 부품으로 지나치게 분해하지 않는다.

권장 단위:

- chief-desk
- project-desk
- learning-desk

각 Station asset은 transparent SVG 또는 WebP로 관리할 수 있다.

필요한 경우 foreground piece만 분리한다.

예:

- chief-desk-back
- chief-character
- chief-desk-front

이 정도 분리만으로 자연스러운 overlap을 만들 수 있다.

책상 스타일:

- warm wood
- rounded corners
- slightly exaggerated proportions
- 3/4 top-down perspective
- short directional shadow
- low visual noise

실사 질감은 사용하지 않는다.

---

## 21. Agent States

캐릭터를 수십 장 만들지 않고
CSS / 주변 object / badge로 상태를 표현한다.

기본 state:

### Idle

- 기본 posture
- subtle ambient animation

### Working

- monitor glow
- typing dots 또는 small motion
- status label

### Needs Review

- small ! badge
- warm yellow / orange pulse

### Risk

- red marker를 작게 사용
- 전체 Station을 빨갛게 만들지 않음

### Done

- check
- short sparkle
- subtle completion motion

Agent state는 실제 Agent 상태와 연결한다.

---

## 22. Work & Calendar Visual Model

Work & Calendar는 일반 SaaS Dashboard처럼 만들지 않는다.

Concept:

> Tycoon Office의 Planning Room / Operations Desk

기본 구조:

- Quest Board
- Calendar Board
- Chief presence
- planning objects

Task와 Calendar의 실제 가독성은 게임성보다 우선한다.

### Quest Board

- draggable Quest rows
- expected duration
- deadline context
- project/course indicator

### Calendar Board

- fixed schedule
- execution block
- deadline context

Task를 Calendar로 drag하면
"Quest를 오늘 시간대에 배치한다"는 느낌을 유지한다.

sidebar + spreadsheet + generic white cards 조합은 피한다.

---

## 23. Learning Visual Model

Learning은 게임 요소를 가장 적극적으로 사용할 수 있다.

활용:

- Course Mission
- weekly progress
- Mastery meter
- Quiz result
- learning streak
- My Stats
- Level-up feedback

과목별 Mastery는 임의 숫자가 아니라 실제 학습 evidence와 연결한다.

Learning Calendar는 전체 Work & Calendar의 filtered view다.

---

## 24. Icon & Badge

단순 SVG icon만 화면에 떠 있게 두지 않는다.

중요 icon은 작은 plate / container 안에 넣는다.

권장 icon container:

- 32~44px
- radius 10~14px
- cream / yellow / mint surface
- dark outline
- short shadow

badge:

- compact
- strong semantic color
- 11~12px label
- 과도한 badge 사용 금지

---

## 25. Motion

Motion은 상태 전달과 재미를 위해 사용한다.

권장 duration:

- button press: 80~120ms
- hover: 120~180ms
- panel open: 160~220ms
- toast: 180~240ms
- focus dim: 250~350ms
- quest complete: 300~500ms

motion easing은 자연스러운 ease-out 계열을 기본으로 한다.

지나친 bounce, confetti, floating particle은 사용하지 않는다.

---

## 26. Responsive Strategy

Desktop을 Primary Target으로 한다.

Home:

- Office World를 가능한 한 유지
- Quest Console은 중앙
- Missions는 side HUD
- Game Dock은 bottom center

화면 폭이 줄어들면:

1. decorative objects 감소
2. Agent station 간격 축소
3. Mission HUD compact
4. Quest Console width 축소

Office를 없애고 일반 mobile dashboard로 바꾸지 않는다.

---

## 27. Accessibility

게임 UI라도 기본 사용성을 지킨다.

- text contrast 유지
- icon-only action에는 tooltip 또는 accessible label
- focus state 제공
- 색상만으로 상태 구분하지 않음
- drag 기능에는 click/edit 대안 제공

---

## 28. Visual Anti-patterns

금지:

- 일반 SaaS Dashboard
- white card 세로 적층
- generic sidebar + table
- office를 한 장짜리 background image로만 사용
- flat character sticker
- 캐릭터와 책상의 perspective 불일치
- 지나치게 많은 화분/책/소품
- 화면 대부분을 HUD가 차지
- 모든 정보의 상시 노출
- 과도한 fantasy RPG decoration
- 실사 texture
- 과도한 glassmorphism
- gradient 남용
- 게임성을 위해 실제 조작성 희생
- Agent를 기능 없는 장식으로 사용

---

## 29. Home Visual Target

현재 확정된 Home 방향:

- warm 2.5D Office
- 충분한 빈 floor 공간
- Chief / Project PM / Learning Station
- 중앙 Quest Console
- 우측 Today's Missions
- 우측 하단 Persistent Review Toast
- 하단 Game Dock
- Main Quest가 가장 강한 시각적 초점

배경은 풍부하지만 복잡하지 않아야 한다.

사용자가 첫 화면을 보자마자:

1. 지금 할 일
2. 오늘 중요한 Mission
3. 각 Agent가 무엇을 하고 있는지

를 빠르게 이해할 수 있어야 한다.

---

## 30. Implementation Rule

새 UI를 구현할 때:

1. `docs/product-ia.md`를 먼저 확인한다.
2. 이 `docs/design-system.md`의 token과 component rule을 재사용한다.
3. 기존 component와 CSS variable을 우선 확장한다.
4. 화면마다 새로운 visual language를 임의로 만들지 않는다.
5. Home Office는 실제 DOM/component 구조로 구현한다.
6. 기능 UI는 이미지에 bake하지 않는다.
7. illustrative asset은 SVG/WebP를 사용할 수 있다.
8. UI logic과 visual asset을 분리한다.

---

## 31. Final Design Check

구현 결과를 다음 기준으로 검토한다.

1. 일반 SaaS가 아니라 Tycoon product로 보이는가?
2. Office World가 실제 공간으로 느껴지는가?
3. 배경 복잡도가 Main Quest를 방해하지 않는가?
4. 캐릭터가 책상/공간에 자연스럽게 속해 있는가?
5. Agent가 실제 기능과 상태를 표현하는가?
6. Main Quest가 즉시 보이는가?
7. Mission이 Todo List가 아니라 게임 Mission처럼 보이는가?
8. UI가 Office를 지나치게 덮지 않는가?
9. 클릭/드래그 등 직접 조작이 쉬운가?
10. 실제 일을 하지만 게임을 플레이하는 느낌이 드는가?
