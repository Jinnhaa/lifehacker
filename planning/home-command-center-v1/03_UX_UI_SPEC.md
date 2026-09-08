# Home Command Center V1 — UX/UI Specification

## Screen Purpose

Home은 `지금 무엇을 하면 되는가?`를 먼저 해결하고 오늘의 흐름, 장기 목표, 필요한 Agent 개입을 확인한 뒤 Focus로 이동하는 화면이다. 데이터 총람이나 관리 dashboard가 아니다.

## Information Hierarchy

1. Current Action
2. Today Flow
3. 핵심 Goal 최대 3개
4. Agent Office

Current Action은 Today Flow 안의 최강조 요소다. Goal과 Agent 상태는 현재 행동을 방해하지 않는 보조 정보다.

## Desktop Layout

- 상단 `HomeHeader`는 날짜와 최소 Home 맥락만 제공한다.
- 우상단에 `GoalQuestList`를 배치한다.
- 중앙은 `TodayFlow`이며 `CurrentActionCard`를 가장 강하게 강조한다.
- 좌우에 각각 `AgentOfficePanel`을 배치한다.
- Office는 가벼운 게임/타이쿤 작업 공간처럼 보일 수 있지만 장식이 content나 action보다 앞서지 않는다.
- 별도의 상시 고정 timer panel은 두지 않는다.

## Current Action UX

`CurrentActionCard`에는 Task title, 구체적인 next action, 예상시간, 존재할 경우 최소 Project/Course context, Focus 시작 action을 표시한다. 첫 문장은 무엇을 해야 하는지 직접 설명한다.

Focus 시작이 primary action이다. 카드 전체 클릭을 상세 이동으로 사용하지 않으며 상세 탐색은 필요한 경우 secondary action으로 분리한다. 활성 FocusSession이 있으면 새 시작 대신 진행 중인 작업과 Focus로 돌아가는 action을 제공한다.

## Today Flow UX

- `TimelineItem`은 고정 Calendar 일정과 계획된 Task/RecurringActivity를 구분한다.
- 시간 흐름대로 배열하고 현재 시각 indicator를 제공한다.
- Current Action과 연결된 항목은 label과 스타일로 함께 강조한다.
- 과거 항목은 현재 및 다음 항목보다 약하게 표현한다.
- 충돌이나 실행 가능 여부는 UI가 계산하지 않고 view model 상태를 표현한다.
- 일정 편집, 월간 탐색, 복잡한 filtering은 포함하지 않는다.

## Goal Quest UX

`GoalQuestList`는 최대 3개를 보여주며 각 항목은 목표, 현재 진행 상태, 이번 주 또는 현재 필요한 행동을 설명한다. 짧은 text와 필요한 경우 간결한 progress 표현을 사용하고 여러 차트, 점수, 상세 추세는 기본 노출하지 않는다. Quest 표현은 동기를 돕되 실제 상태를 게임 점수로 왜곡하지 않는다.

## Agent Office UX

`AgentOfficePanel`은 Agent 장식장이 아니라 사용자 접점이다. 사용자 결정 필요, 선행 작업 결과, 현재 행동을 위한 준비 완료, 실패·막힘에 따른 개입 필요처럼 사용자 행동이나 판단과 연결된 상태만 보여준다.

내부 reasoning, prompt, token 사용, 상세 tool log는 노출하지 않는다. 각 상태에는 가능한 action 또는 관련 이유를 짧게 표시하며 조용한 정상 상태는 과도하게 강조하지 않는다.

## Focus Modal UX

- Current Action의 Focus action은 `FocusModal` 또는 동등한 Focus UI를 연다.
- 시작 전 Task/Step, next action, 예상시간과 최소 방향을 확인한다.
- 진행 중에는 `FocusTimer`와 현재 Step을 중심으로 표시한다.
- 상태에 따라 시작, 일시정지, 재개, 완료 control을 제공한다.
- 전환은 secondary action이며 기존 switch guardrail 결과를 따른다.
- 완료 후 canonical 다음 행동을 다시 불러온다.

Modal은 상태를 복제 저장하지 않으며 닫아도 FocusSession이 유지되어야 한다.

## Empty / Loading / Error States

### Empty / No action

실행 가능한 항목이 없는 이유와 Planner가 제공한 하나의 다음 action을 표시한다. `할 일이 없습니다`로 끝내지 않는다.

### Loading

Current Action과 Today Flow의 예상 공간을 유지해 layout shift를 줄인다. placeholder를 실제 action처럼 보이게 하지 않는다.

### Error

영향받는 영역과 재시도 action을 표시한다. Current Action을 신뢰할 수 없으면 추정 action을 만들지 않는다. Goal 또는 Agent의 부분 오류가 Today Flow 전체를 막지 않는다.

## Responsive Principles

- 좁은 화면 순서는 `HomeHeader → Current Action → Today Flow → Goal Quest → Agent Office`다.
- 좌우 Office는 content 흐름 아래로 이동하거나 축약한다.
- Current Action과 Focus primary action을 첫 주요 viewport에 가능한 한 유지한다.
- Today Flow는 가로 축소 대신 세로 timeline으로 전환한다.
- V1은 baseline만 제공하며 전체 모바일 최적화는 범위 밖이다.

## Accessibility Principles

- `Home`, `Current Action`, `Today Flow`, `Goals`, `Agent Office`를 식별할 heading/landmark를 둔다.
- icon-only button에는 accessible name을 제공한다.
- 현재 항목, 상태, 오류를 색상만으로 전달하지 않는다.
- Focus Modal은 focus trap, Escape 처리, trigger focus 복귀, dialog label을 갖는다.
- timer는 스크린 리더에 매초 알리지 않고 의미 있는 변화만 알린다.
- 동작 감소 설정을 존중한다.

## Component Naming Guideline

초기 후보는 `HomeHeader`, `GoalQuestList`, `AgentOfficePanel`, `TodayFlow`, `CurrentActionCard`, `TimelineItem`, `FocusModal`, `FocusTimer`다. 제품 개념과 일치할 때 사용하며 작은 markup까지 분리하거나 미래 variant를 위한 abstraction을 만들지 않는다.

## Test-friendly UI Naming

- visible heading, button name, form label을 첫 selector로 사용한다.
- action name은 `Start focus`, `Pause focus`, `Resume focus`, `Complete focus`, `Switch task`, `Retry`처럼 명확하게 한다.
- 반복 항목은 visible title과 semantic list 구조로 찾는다.
- class name이나 DOM 계층에 의존하지 않는다.
- 꼭 필요할 때만 제품 개념 기반 `data-testid`(`current-action`, `today-flow`)를 쓴다.
