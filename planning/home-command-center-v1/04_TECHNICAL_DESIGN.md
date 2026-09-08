# Home Command Center V1 — Technical Design

## Purpose

새 architecture를 정의하지 않는다. 기존 Core Domain이 계산한 상태를 Home UI가 어떻게 소비하는지와 presentation boundary를 고정한다.

## Domain Consumption

| Home concern | Canonical source | UI consumption |
|---|---|---|
| Current Action | active `FocusSession` → 없으면 latest approved `DailyPlan`의 첫 실행 가능한 미완료 `PlanItem` → 없으면 Planner의 다음 행동 필요 상태 | 하나의 Current Action view model |
| Today Flow | `DailyPlan` / `PlanItem` + fixed calendar constraints | 시간순 timeline view model |
| Goals | `Goal` / `RecurringActivity` derived state | 최대 3개 Quest summary |
| Timer | `FocusSession` | session 상태·시간과 허용 action |
| Agent Office | `AgentInstance` / `AgentRun` | 사용자 행동·판단 관련 summary만 사용 |

Current Action derivation은 `docs/domain-model.md`의 canonical 정의를 그대로 따른다. Home이 선택 규칙을 다시 구현하지 않는다.

## Presentation Boundary

Home UI는 presentation consumer다. Core/Rules/Domain이 Current Action, 실행 가능성, planning, priority, 시간 충돌과 Focus 전환 규칙을 결정한다.

Backend/API가 준비되지 않은 부분에는 UI adapter/view-model boundary를 둘 수 있다. 이 boundary는 canonical output을 rendering 형태로 변환할 뿐 새로운 진실을 저장하거나 business decision을 내리지 않는다. Current Action display와 허용 action, Today Flow item, 최대 3개 Goal summary, 좌우 Agent summary, loading/empty/partial error를 포함할 수 있다.

구체 type과 API는 구현 시 기존 코드를 확인해 최소 범위로 정하며 이 문서 때문에 shared abstraction을 선행 생성하지 않는다.

## Focus Interaction

1. UI가 Current Action의 Focus action을 요청한다.
2. 기존 Focus application/domain 경계가 FocusSession을 시작하거나 현재 session을 반환한다.
3. UI는 반환 상태로 Focus Modal/Timer를 표시한다.
4. pause, resume, complete, switch는 기존 Focus와 Task Switch 규칙을 호출한다.
5. mutation 후 Home read model을 갱신한다.

Goal 또는 Agent summary 실패는 해당 보조 영역에 격리할 수 있다. Current Action derivation을 신뢰할 수 없으면 UI가 추정값을 만들지 않는다.

## Prohibited Designs

- `HomeCurrentTask` 같은 중복 canonical entity
- `DashboardTask` 또는 Home 전용 task state
- FocusSession과 분리된 Timer domain
- UI 내부 priority, planning, conflict, Current Action 계산
- 기존 Core를 우회하는 parallel implementation
- Home 편의를 위한 DB schema 즉흥 추가
- Agent 내부 log 또는 reasoning을 presentation model에 포함

## Testing Boundary

- Core derivation과 상태 전환은 domain test로 검증한다.
- adapter/view model은 canonical input 변환을 검증한다.
- component test는 loading, empty, error, Focus 상태와 accessible action을 검증한다.
- Playwright가 있으면 Home 진입 → Current Action 확인 → Focus 시작 → pause/resume/complete를 검증한다.
