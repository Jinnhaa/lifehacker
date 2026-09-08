# Home Command Center V1 — Requirements Specification

## Functional Requirements

### HOME-001 Current Action

**Requirement:** Home은 활성 `FocusSession`의 Task/Step을 우선하고, 없으면 최신 승인 `DailyPlan`의 첫 실행 가능한 미완료 `PlanItem`을 표시한다. 둘 다 없으면 Planner의 다음 행동 필요 상태를 표시한다.

**User value:** 사용자가 후보를 비교하지 않고 지금 실행할 한 가지를 이해한다.

**Acceptance Criteria**

- 활성 FocusSession이 있으면 그 Task/Step의 제목과 다음 행동이 표시된다.
- 활성 FocusSession이 없으면 최신 승인 DailyPlan의 첫 실행 가능한 미완료 PlanItem이 표시된다.
- Task title, next action, 예상시간, 존재할 경우 최소 Project/Course context가 보인다.
- 실행 가능한 항목의 primary action은 상세 탐색이 아니라 Focus 시작이다.

### HOME-002 Today Flow

**Requirement:** DailyPlan/PlanItem과 고정 Calendar constraint를 시간순으로 함께 보여주며 현재 시각과 Current Action을 강조한다.

**User value:** 오늘의 고정 일정과 실행 계획 사이 흐름을 빠르게 파악한다.

**Acceptance Criteria**

- 고정 일정과 계획된 Task/RecurringActivity를 구분 가능한 형태로 시간순 표시한다.
- 현재 시각 indicator와 Current Action에 해당하는 timeline item 강조가 보인다.
- 월간 보기, 일정 편집, 복잡한 Calendar 관리 기능은 제공하지 않는다.

### HOME-003 Focus Entry / Timer

**Requirement:** Current Action에서 Focus UI를 열고 기존 FocusSession의 시작, 일시정지, 재개, 완료 및 필요한 경우 전환을 지원한다.

**User value:** 다른 화면 탐색 없이 행동을 즉시 실행하고 기록한다.

**Acceptance Criteria**

- Focus 시작을 선택하면 해당 Task/Step 맥락의 Focus Modal 또는 Focus UI가 열린다.
- Focus 상태에 따라 가능한 시작, 일시정지, 재개, 완료 action만 제공된다.
- 경과 시간은 FocusSession 상태에서 계산한다.
- 전환은 기존 Task Switch 정책을 우회하지 않는다.
- UI를 다시 열어도 canonical FocusSession 상태와 일치한다.

### HOME-004 Goal Quest

**Requirement:** 핵심 Goal을 최대 3개까지 목표, 진행 상태, 이번 주 또는 현재 필요한 행동과 함께 보여준다.

**User value:** 장기 목표를 잊지 않되 과도한 통계 없이 현재 행동과 연결한다.

**Acceptance Criteria**

- Goal이 4개 이상이어도 주요 항목은 최대 3개다.
- 목표 이름, 현재 진행 상태, 이번 주 또는 현재 필요한 행동이 보인다.
- 진행 상태는 Goal/RecurringActivity derived state를 사용한다.
- 상세 통계나 다수 KPI가 기본 화면을 차지하지 않는다.

### HOME-005 Agent Office

**Requirement:** Desktop에서 AI Office를 Today Flow 좌우에 나누어 배치하고 AgentInstance/AgentRun 중 사용자 행동이나 판단과 관련된 summary만 보여준다.

**User value:** 내부 과정을 해석하지 않고 필요한 개입과 결과를 확인한다.

**Acceptance Criteria**

- Desktop에서 좌측과 우측 Office가 중앙 Today Flow를 보조한다.
- 각 상태는 사용자에게 필요한 행동, 판단, 완료 결과 중 하나와 연결된다.
- 내부 prompt, reasoning, 상세 실행 log는 표시하지 않는다.
- Agent 상태는 Current Action보다 강하게 강조되지 않는다.

### HOME-006 Empty / No-action State

**Requirement:** 실행 가능한 Current Action이 없을 때 이유와 다음 가능한 행동을 보여준다.

**User value:** 오류인지 계획이 필요한지 추측하지 않고 다음 단계로 이동한다.

**Acceptance Criteria**

- 승인 계획 또는 실행 가능 PlanItem이 없으면 Planner의 다음 행동 필요 상태를 표시한다.
- 이해 가능한 이유와 하나의 primary next action이 있다.
- empty, loading, error 상태를 서로 구분한다.

## Non-functional Requirements

### NFR-001 Visual hierarchy

- 첫 viewport에서 `Current Action → Today Flow → 핵심 Goal → Agent Office` 순서가 크기·위치·강조로 유지된다.
- Current Action의 primary action은 secondary action과 구분된다.

### NFR-002 Core business logic separation

- UI component는 Current Action 선택, priority, 충돌, planning 계산을 수행하지 않는다.
- 주입된 view model만으로 presentation component를 테스트할 수 있다.

### NFR-003 Existing domain reuse

- 모든 Home 상태는 기존 canonical domain에서 파생한다.
- Home 전용 canonical entity나 중복 상태 저장소를 추가하지 않는다.

### NFR-004 Responsive behavior

- 좁은 viewport에서도 Current Action이 첫 주요 content다.
- 좌우 Office는 중앙 흐름을 가리지 않고 정의된 순서로 재배치된다.
- 핵심 action은 horizontal overflow 없이 keyboard와 touch로 사용할 수 있다.

### NFR-005 Accessibility / testability

- control은 accessible name과 keyboard focus state를 갖는다.
- modal은 열릴 때 focus를 내부로 옮기고 닫힐 때 trigger로 돌려보낸다.
- 상태를 색상만으로 구분하지 않는다.
- 주요 영역과 control은 semantic role, heading, label로 component/Playwright test에서 찾을 수 있다.
