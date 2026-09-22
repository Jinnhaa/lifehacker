# Lifehacker Product IA

**Status:** CANONICAL  
**Purpose:** Lifehacker의 화면 구조, Navigation, 화면별 책임, 핵심 UX 원칙을 정의한다.

UI/UX 구현은 이 문서를 기준으로 한다.

- 제품 행동/Chief 판단: `docs/product-rules.md`
- Task/Schedule 의미: `docs/work-schedule-policy.md`
- Backend/Runtime: `docs/architecture.md`

---

## 1. Product Experience

Lifehacker는 일반 생산성 Dashboard가 아니라,

> 실제 생활의 일을 타이쿤 게임처럼 플레이하게 만드는 Personal AI Operating System이다.

타이쿤은 장식이 아니다.

- 캐릭터 = Agent + 기능 진입점
- Mission = 실제 Task/Goal
- Status/Stats = 실제 행동 데이터
- Office = 실제 Control Plane

기본 정보량은 작게 유지하고, 필요할 때 클릭해 상세를 연다.

---

## Web-first Principle

Lifehacker의 핵심 기능은 Web만으로 완결되어야 한다.

다음 기능은 Discord나 외부 메시징 채널 없이 Web에서 모두 사용할 수 있어야 한다.

- 계획 생성 및 조정
- 승인 / 거절 / 수정
- Task 생성 / 수정 / 완료
- Calendar 확인 / 조정
- Focus 실행
- Replan
- Projects / Learning 관리
- Settings

Discord는 Morning Briefing, 알림, Wake 등 보조 채널로만 사용한다.

Discord나 다른 외부 채널이 Lifehacker Core Product Flow의 필수 의존성이 되어서는 안 된다.

## 2. Global IA

Lifehacker의 최상위 공간은 5개다.

1. Home
2. Work & Calendar
3. Projects
4. Learning
5. Settings

기존 상단 텍스트 Navigation은 사용하지 않는다.

Home이 전체 서비스의 Hub / World Map 역할을 한다.

---

## 3. Navigation

### Home의 Agent 진입

- Chief → Work & Calendar
- Project PM → Projects
- Learning Agent → Learning
- Settings icon/object → Settings

Agent는 다음 역할을 함께 가진다.

- 공간 진입점
- 현재 상태 표현
- 실제 Agent 작업 상태 표현

### Game Dock

빠른 이동을 위한 icon navigation을 제공한다.

- Home
- Work
- Projects
- Learning
- Settings

### Context Entry

현재 정보에서도 관련 화면으로 바로 이동할 수 있다.

- Home Main Quest 상세 클릭 → 현재 Task가 선택된 Work & Calendar
- Project Task/Calendar → 해당 Project로 필터된 Work & Calendar
- Learning Task/Calendar → Learning/과목으로 필터된 Work & Calendar
- Review Toast → 검토 popup/drawer

---

## 4. Home / Office World

Home은 다음 질문에 답한다.

> 지금 무엇을 하면 되는가?

Home은 항상 2.5D Tycoon Office를 중심으로 구성한다.

- Office World 약 70~75%
- HUD / functional UI 약 25~30%
- 일반 SaaS Dashboard 형태 금지
- UI card/board/HUD 자체를 코드로 디자인
- 캐릭터와 책상은 실제 기능과 연결

### Quest Console

중앙에는 하나의 연결된 Quest Console을 둔다.

#### Main Quest

지금 실행할 행동 하나.

- 구체적인 현재 행동
- Project/Course context
- 예상시간
- 짧은 이유
- Focus 시간 선택
- 집중 시작

현재 Quest는 Focus 시작 시에만 집중 시간을 정한다.

`집중 시작` → Focus Mode

Task명/상세/예상시간 영역 클릭 → Work & Calendar

#### Next Quests

그다음 할 일들을 Queue로 보여준다.

- 정확한 시작시각은 강제하지 않음
- 예상시간 표시
- Chief가 추천 순서 제시
- 사용자가 Drag & Drop으로 변경 가능

#### Today Capacity

- 남은 가용시간
- 남은 Quest 예상시간
- 두 값의 차이
- Chief의 짧은 판단

을 보여준다.

### Today's Missions

Office World 안에 게임의 Daily Mission처럼 최대 3개를 보여준다.

- 🔥 Clear Quest: 오늘 반드시 해결해야 하는 것
- 🌱 Level-up Quest: 공부/성장을 위해 쌓아야 하는 것
- ✨ Bonus Quest: 오늘 해두면 미래 부담이 줄어드는 것

일반 Task List처럼 보이지 않게 한다.

### Chief

Home의 Chief/한교동을 통해:

- 오늘 계획 만들기
- 복합적인 계획 조정 요청

을 할 수 있다.

---

## 5. Focus Mode

Focus 시작 시 Office World를 유지한다.

- 배경 dim
- 현재 Quest/Agent 영역 spotlight
- 중앙에 Task + Timer
- 나머지 일반 정보 숨김

생산성 Timer 전용 Dashboard로 화면을 교체하지 않는다.

---

## 6. Approval / Review

사용자 판단이 필요한 제안은 우측 하단 Persistent Toast로 표시한다.

승인 또는 거절 전까지 자동으로 사라지지 않는다.

- 승인
- 검토
- 거절

거절 시 짧은 이유를 받아 학습한다.

세부 승인/거절 정책은 `product-rules.md`를 따른다.

---

## 7. Direct Manipulation

일상적인 수정은 Chat보다 직접 UI 조작을 우선한다.

- Click → 수정
- Drag & Drop → 순서/시간 이동
- 직접 duration 수정

Chat은 복합 조정이나 예외 상황에 사용한다.

---

## 8. Work & Calendar

다음 질문에 답한다.

> 전체 할 일과 시간을 어떻게 조정할까?

Task와 Calendar를 한 공간에서 관리한다.

핵심 기능:

- Task/Quest 목록
- Calendar
- Today / Week / Deadlines
- Official / Internal Deadline
- 예상시간
- Drag & Drop
- Click Edit
- Calendar 배치/이동

시각적으로 일반 SaaS Dashboard가 아니라
**Tycoon Office의 Planning Room / Operations Desk**처럼 느껴져야 한다.

기본 진입은 Week이며 상단 view는 `Today / Week / Month`다.

- Week: Weekly Wins와 Mon–Sun Planned Day board. Task와 fixed Calendar Event를 함께 보되 의미는 분리한다.
- Today: Home과 같은 canonical priority를 사용한 ordered Quest, workload, capacity, deadline warning과 고정 일정의 시간 흐름.
- Month: Monthly Wins를 먼저 보여주고 Exam/Quiz, official deadline, 중요한 internal deadline, milestone, 큰 fixed event만 표시한다.

Home은 Work Today의 복사본이 아니다. Home은 지금 실행할 Main Quest를 압축한 cockpit이고, Work Today는 오늘 계획 전체를 확인·수정하는 planning surface다.

일상 수정은 확인 modal 없이 즉시 반영한다. Task 완료는 canonical manual completion을 사용하고, day drag는 Planned Day만 변경한다.

Home보다 게임성은 약해도 동일한 세계관과 디자인 시스템을 유지한다.

---

## 9. Projects

다음 질문에 답한다.

> 이 프로젝트는 어디까지 왔고 다음에 무엇을 해야 하는가?

기본 구성:

- Project List
- Status / Goal
- Next Mission
- Milestones
- Project PM
- Knowledge / Documents
- Important Decisions
- Project Work & Calendar

Project Work & Calendar는 별도 시스템이 아니다.

전체 Work & Calendar에 Project filter를 적용한 동일 View를 사용한다.

---

## 10. Learning

다음 질문에 답한다.

> 무엇을 얼마나 공부해야 하고 실제로 얼마나 익혔는가?

Learning 안에서 관리한다.

- University
- Certifications
- My Stats

### University

- 현재 학기
- 과목
- 주간 학습량
- Course Mission
- Mastery
- Quiz / Exam Risk
- University Calendar

University Calendar는 전체 Work & Calendar에서
University 관련 일정/Task만 필터링한 View다.

### Course Mission

큰 학습 Task는 바로 실행 가능한 단계로 쪼갠다.

예:

데이터베이스 2주차
→ 영상강의 수강
→ Notion 정리
→ 이해 확인
→ GPT Quiz
→ 약점 복습
→ 재Quiz
→ Mastery 달성

### Mastery

단순 수강 여부가 아니라 실제 이해도를 활용할 수 있다.

예:

교안 기반 Quiz
→ 정답률 기준 달성
→ Mastered

### My Stats

실제 행동 데이터를 기반으로 게임형 학습 Stat을 보여준다.

예:

- 꾸준함
- 집중
- 마감 안정성
- 복습
- Mastery

임의의 숫자를 만들지 않는다.

---

## 11. Task UX

Task는 바로 시작할 수 있을 만큼 구체적이어야 한다.

`데이터베이스 2주차 공부`처럼 큰 표현을 그대로 Main Quest로 노출하지 않는다.

큰 작업은:

- 작은 Quest
- 완료 기준
- 예상시간
- 필요 시 Checkpoint

로 분해한다.

큰 작업을 오래 붙잡는 경우 Chief가 중간 Checkpoint에서
완료 기준과 남은 Deadline Risk를 확인한다.

실제 소요시간은 기록하고,
반복되는 유사 작업의 예상시간 개선에 활용한다.

---

## 12. Unfinished Work

미완료 Quest를 다음 날 단순 복사하지 않는다.

- Day Close 기록
- 다음 날 전체 상황 재평가
- Chief 조정안 생성
- 사용자 확인
- 승인 후 반영

---

## 13. Settings

- Integrations
- Notifications
- Automation
- Planning Preferences
- AI / Agent Permissions
- Account / System

불필요한 게임화를 강요하지 않는다.

---

## 14. UX Anti-patterns

다음은 금지한다.

- Home을 일반 SaaS Dashboard로 대체
- Tycoon Office를 단순 배경 이미지로 사용
- white card를 세로로 계속 쌓기
- 기본 화면에 많은 텍스트 노출
- Review UI가 Home 본문을 차지
- Chat 없이는 기본 수정이 불가능
- Calendar를 Home 중심에 노출
- 모든 Quest에 정확한 시작시각 강제
- 캐릭터를 기능 없는 장식으로 사용
- Project/Learning별 별도 Task system 생성
- 모호한 큰 Task를 그대로 Main Quest로 노출
- 게임 Stats를 실제 데이터 없이 생성
