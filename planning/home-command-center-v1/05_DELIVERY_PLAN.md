# Home Command Center V1 — Delivery Plan

## Branch

`feat/home-command-center-v1`

## In Scope

1. Home shell
2. Today Flow
3. Current Action
4. Goal Quest 최대 3개
5. 양쪽 Agent Office layout
6. Focus Modal / Timer 기본 interaction
7. Responsive baseline
8. 최소 QA

## Out of Scope

- Agent orchestration 신규 구현
- DB schema 변경
- 새로운 Planning Engine
- Growth Analytics
- Calendar write 기능 신규 구현
- Notification 신규 구현
- 멀티 Agent 자유 대화
- 전체 모바일 완성도 최적화
- 범위 밖 refactor

## Recommended Implementation Order

1. shell/layout
2. Home view model / adapter boundary
3. Current Action
4. Today Flow
5. Goal Quest
6. Agent Office
7. Focus interaction
8. responsive
9. QA

mock/fixture가 필요하면 view-model boundary에서 사용하고 canonical state로 저장하지 않는다.

## Minimum QA

- Current Action의 최우선 계층과 FocusSession/DailyPlan fallback
- Goal 최대 3개 노출
- Agent 내부 log/reasoning 비노출
- Focus 시작, 일시정지, 재개, 완료 및 필요한 경우 전환
- empty, loading, partial error와 좁은 viewport
- keyboard focus와 modal focus 복귀

## Verification

저장소에 존재하는 script만 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

없는 script를 새로 만들지 않고 실행할 수 없는 검증은 보고한다.

---

## MVP Scope Gate

Home Command Center는 Current Action과 Today Flow라는 핵심 가치 외에
Agent Office, Focus, 게임화 요소까지 포함하므로 범위가 빠르게 확장될 위험이 있다.

### Scope Explosion Risk

**67 / 100**

주요 위험:

- Current Action + Today Flow 외의 보조 기능이 독립 기능 수준으로 확장될 수 있음
- Agent Office가 실제 Agent orchestration 구현으로 번질 수 있음
- Focus가 완성형 생산성 도구로 확장될 수 있음
- Quest 표현이 별도 게임 시스템으로 확장될 수 있음

Home의 목적은 시스템 전체를 관리하는 Dashboard를 만드는 것이 아니라,

> 사용자가 지금 무엇을 해야 하는지 즉시 이해하고 실행으로 이어지게 하는 것

이다.

### Top 3 Scope Risks

#### 1. Agent Office 고도화

이번 V1에서는 Agent Office를 사용자의 행동과 판단에 필요한 상태를 보여주는
presentation layer로 제한한다.

현재 범위 밖:

- 실시간 Agent orchestration
- Agent 간 자유 대화
- Agent 회의
- 내부 reasoning / execution log
- 복잡한 캐릭터 animation
- 별도 Agent simulation system

#### 2. Focus 기능 고도화

이번 V1의 Focus는 Current Action을 실제 실행으로 연결하기 위한 최소 기능이다.

현재 범위 밖:

- Pomodoro 설정 시스템
- Focus 통계
- 장기 생산성 분석
- 자동 휴식 관리
- 세션 성과 분석
- 별도 Timer Domain

Timer의 canonical execution state는 기존 `FocusSession`을 사용한다.

#### 3. Game System 고도화

Quest와 Office는 게임처럼 이해하기 쉽게 표현하기 위한 UX다.

현재 범위 밖:

- XP
- Level
- Reward
- Achievement
- 캐릭터 성장
- 게임 경제
- 별도 progression system

**게임처럼 보이게 하는 것과 게임 시스템을 만드는 것을 구분한다.**

### Cut Now

현재 `feat/home-command-center-v1` branch에서는 다음을 구현하지 않는다.

- Agent 실시간 orchestration UI
- Agent 자유 대화 / 회의
- Agent reasoning / 내부 log
- 복잡한 캐릭터 animation
- XP / Level / Reward / Achievement
- Focus 통계
- Growth Analytics
- 월간 Dashboard
- Home 전용 Domain
- Home 전용 canonical DB state
- 새로운 Planning Engine
- 범위 밖 backend 기능
- 전체 모바일 완성도 최적화
- unrelated refactor

### MVP Completion Line

다음 조건을 만족하면 추가 기능을 넣지 않고
현재 Home Command Center V1 branch를 완료한다.

1. Home 진입 시 `Current Action`이 가장 먼저 인식된다.
2. `Today Flow`를 통해 오늘 남은 흐름을 빠르게 이해할 수 있다.
3. Current Action에서 Focus를 시작할 수 있다.
4. 핵심 Goal 최대 3개가 Quest 형태로 보인다.
5. 좌우 Agent Office가 Home 구조 안에 존재한다.
6. Agent Office가 내부 시스템 관리 화면이 되지 않는다.
7. Home이 전체 Task와 데이터를 탐색해야 하는 Dashboard가 되지 않는다.
8. 새로운 Home 전용 Domain 또는 canonical DB state가 없다.

**위 조건을 만족하면 Out of Scope 기능을 추가하지 않고 작업을 종료한다.**

### Next Iteration

MVP가 실제로 동작한 뒤 다음을 검토한다.

- Current Action 실제 Core 연결 개선
- Today Flow와 DailyPlan / Calendar 연결 개선
- FocusSession 실제 연동 안정화
- Goal / RecurringActivity 실제 데이터 연결
- Agent 상태 실제 데이터 연결
- 실사용에서 발견된 UX 문제 개선

우선순위는 실제 사용 중 발생한 불편을 기준으로 다시 정한다.

### Later

실사용 데이터가 쌓이기 전에는 다음을 구현하지 않는다.

- Agent interaction 고도화
- Agent animation 고도화
- Growth Analytics
- XP / Level / Reward
- 고급 Focus 분석
- Home layout 개인화
- 게임 시스템 고도화
- 복잡한 과거 통계 Dashboard
