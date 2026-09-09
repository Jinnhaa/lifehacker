# Amber HQ Workflows

**Status:** Foundation v0.3  
**Purpose:** Core workflow의 deterministic 단계, AI 단계, approval checkpoint를 정의한다.

---

## 1. Workflow Rule

단계가 명확한 workflow는 **코드가 orchestration**한다.

Agent가 임의로 전체 workflow를 결정하지 않는다.

모든 장기 workflow는 필요 시:

- checkpoint
- retry
- idempotency
- pause/resume
- audit event

를 지원할 수 있게 설계한다.

---

## 2. WorkflowRun

모든 중요한 workflow는 `WorkflowRun`으로 추적 가능해야 한다.

대표:

- morning
- daily_planning
- focus
- recovery
- day_close
- wake
- external_sync
- agent_job

---

## 3. Morning

```text
wake acknowledged
→ Calendar read
→ Tasks/Deadlines read
→ RecurringActivity progress read
→ Constraints read
→ deterministic capacity
→ missing daily context request
→ deterministic recompute
→ AI planning if needed
→ approval
→ save plan
→ current action
```

승인 대기 중에는 workflow state를 저장하고 process가 종료될 수 있다.

---

## 4. Daily Planning

AI 입력은 raw DB가 아니라 compact planning context.

AI 출력은 structured plan proposal.

계획 제안은 새 `DailyPlan` revision과 `PlanItem`으로 저장하되 승인 전 상태는 `pending_approval`이다. 승인된 revision만 실행 계획으로 사용하며 이전 revision과 supersession 관계를 보존한다.

최초 계획이나 중요한 변경은 사용자 승인 후 `approved`가 된다. 단순하고 낮은 위험의 재배치는 정책에 따라 자동 승인할 수 있다.

### Current Action

Current Action은 별도 mutable pointer나 Home 전용 entity로 저장하지 않고 다음 순서로 파생한다.

1. active `FocusSession`의 Task/Step
2. 없으면 최신 approved `DailyPlan`의 첫 실행 가능한 미완료 `PlanItem`
3. 없으면 Planner가 next action 필요 상태 반환

---

## 5. Focus

```text
Task selected
→ prepare execution flow
→ full flow shown once
→ user confirms direction
→ focus session
→ current step only
→ complete / blocked / switch
```

실행 시간과 pause/resume은 별도 Timer가 아니라 `FocusSession`에 기록한다. pause는 Task 상태가 아니며 Step 이동은 code가 수행한다.

Task 완료는 현재 Step을 순서대로 완료한 뒤 마지막 Step에서 Task를 `DONE`으로 전환한다. 막힘이나 전환으로 Focus를 멈추면 기존 FocusSession과 실제시간 history를 보존한다.

---

## 6. Recovery

```text
blocked
→ reason classification
→ deterministic route
→ semantic assistance if needed
→ intervention
→ resume
→ outcome event
```

막힘으로 pause된 Focus는 개입 후 재개할 수 있다. 외부 자료나 사람을 기다려야 하면 Task를 `WAITING_FOR_USER` 또는 `BLOCKED`로 전환하고 Current Action을 다시 파생한다.

---

## 7. Dynamic Replan

```text
actual state change
→ deterministic impact calculation
→ small change: rule-based adjustment
→ capacity/deadline conflict: complex planning
→ approval only if important plan/priority changes
```

모든 작은 시간차에 LLM을 호출하지 않는다.

Replan은 기존 DailyPlan을 덮어쓰지 않고 새 revision을 만든다. 중요한 변경은 승인 대기 상태를 유지하며 거절되면 기존 approved plan을 실행 계획으로 유지한다. Task 완료·막힘·전환 등 trigger와 resulting revision은 DomainEvent로 추적한다.

---

## 8. Day Close

```text
trigger
→ deterministic daily aggregation
→ unfinished replan
→ optional AI summary
→ memory/pattern candidates
→ tomorrow special context
→ wake target
→ close
```

active Focus가 있으면 종료 여부를 한 번 확인하고, 확인 시 해당 FocusSession의 실제시간과 종료 이유를 보존한 뒤 Day Close를 계속한다. 최신 approved DailyPlan을 기준으로 완료·미완료·실제시간·blocked·switch를 집계하고 완료한 plan revision을 닫는다.

Day Close 결과는 중요한 Decision을 다음 canonical learning chain으로 연결할 수 있다.

`Decision → DecisionFeedback → LearningCase → LearningCaseEvent → Outcome → PatternEvidence → Pattern → 사용자 승인 시 Principle`

Pattern Candidate는 별도 entity가 아니라 `Pattern.status=candidate`다. 학습 또는 Principle 제안 실패는 Day Close 완료를 되돌리지 않는다.

---

## 9. Wake

```text
target wake
→ notification
→ no response
→ retry
→ schedule impact increases
→ stronger message
→ wake acknowledged
→ stop retries
→ Morning
```

모든 wake notification은 dedupe/idempotency를 갖는다.

V0.1에서는 Day Close 완료 후 다음 날 fixed Calendar Constraint와 명시된 wake preference/개인시간 Constraint만 관찰한다. 정확한 시간을 계산할 명시값이 없으면 Day Close를 막지 않고 후속 질문으로 전환한다. 날짜별 `WorkflowRun` 하나와 교체 가능한 `Notification`/`ScheduledJob`으로 예약하며, persistent Discord worker가 due job을 claim한 뒤 DM을 발송한다. `일어남`은 당일 예약을 acknowledge/cancel한 후 기존 Morning Workflow로 이어진다.

---

## 10. RecurringActivity Scheduling

매일 Planner가:

```text
weekly target
- completed occurrences
= remaining occurrences
```

를 계산한다.

추가 고려:

- 남은 주간 날짜
- available time
- preferred schedule
- minimum duration
- deadline load

RecurringActivity risk 예:

- LOW: 충분한 여유
- MEDIUM: 남은 횟수와 남은 적합 일수가 가까움
- HIGH: 오늘 미수행 시 목표 달성 어려움

RecurringActivity는 자동으로 새 주마다 같은 Task row를 복사하는 대신 occurrence를 생성한다.

---

## 11. New Project Onboarding

```text
user announces project
→ determine required info
→ research public info if available
→ create pre-filled brief
→ user corrects/approves
→ project context
→ AgentInstance if needed
→ initial tasks/plan
```

한 질문씩 장시간 인터뷰하기보다 pre-filled batch review를 우선한다.

---

## 12. New Agent Registration

```text
agent request
→ existing template check
→ scope
→ memory policy
→ tools
→ permissions
→ approval policy
→ budget
→ config registration
→ contract tests
```

기존 Agent/Core 변경이 필요하면 중단하고 Architecture Change로 보고한다.

---

## 13. Agent Specialist Run

```text
Chief
→ build ContextPackage
→ resolve allowed tools
→ specialist run
→ tool calls / approvals
→ structured specialist result
→ Chief synthesis
→ user decision only if necessary
```

---

## 14. Durable Approval

```text
workflow/agent reaches risky action
→ ApprovalRequest
→ WorkflowRun waiting_for_user
→ persist checkpoint
→ notify user
→ user approve/reject
→ resume from checkpoint
```

사용자 응답을 기다리는 동안 서버 process를 유지하지 않는다.

---

## 15. Background Job Reliability

Watcher/Scheduler/Queue 작업은 idempotent하게 만든다.

필수:

- stable job key
- retry policy
- deduplication
- failure state
- archive/audit

예:

```text
wake:{user_id}:{date}:{target_time}:{attempt}
snowboard:{assignment_external_id}
calendar-sync:{calendar_id}:{sync_window}
```

---

## 16. External Sync

```text
scheduler/webhook
→ InboxItem
→ dedupe
→ normalize
→ domain candidate
→ policy
→ state/event
```

Polling과 webhook 모두 동일 pipeline을 쓴다.

---

## 17. AI Loop Limits

Agent self-improvement loop를 사용할 경우 반드시:

- max iterations
- evaluator pass condition
- max cost
- timeout

를 둔다.

V1에서는 반복 critique loop를 기본값으로 사용하지 않는다.


---

## 18. Plan Revision Contract

Initial Morning Plan은 user approval이 필요하다.

Replan:
- low-risk minor shift → policy-approved new revision
- priority/goal/deadline/external-impact change → proposed revision + user approval

기존 approved plan을 덮어쓰지 않는다.

## 19. Durable Resume Contract

Approval 대기 시 WorkflowRun checkpoint를 저장하고 process는 종료 가능하다.

응답 후:
1. approval status
2. checkpoint version
3. action precondition
4. resume idempotency key
를 확인하고 resume한다.

## 20. External Sync Lifecycle

`Inbox → ParsedEntity → DomainCommand → ExternalReference → DomainEvent`

create/update/delete/stale/conflict를 동일 contract로 처리한다.


## 21. Approval Base Preservation — 2026-09-09

중요 Replan은 기존 approved plan을 유지한 채 pending_approval revision을 생성한다.
승인 시 기반 plan을 잠그고 아직 approved인지 확인한 뒤 같은 transaction에서
기존 plan을 superseded, 새 plan을 approved로 바꾼다. 기반이 이미 바뀌거나 닫혔다면
오래된 dynamic replan 승인으로 최신 계획을 교체하지 않는다.
거절은 해당 proposal/approval/workflow만 종료하며 과거 superseded plan을 복원하지 않는다.
최초 Morning의 미승인 초안 수정은 이전 초안이 superseded여도 승인 계획이 없으면 승인 가능하다.

## 22. Project and Specialist Workflow Boundary

목표 흐름은 Project 근거 → gap → Objective/Task 제안 → 중요한 scope 승인 → Daily Planning → 실행 근거 → review다.
현재 Project PM은 조회 단계까지만 구현되어 있다. School/Discovery는 같은 WorkflowRun checkpoint,
승인 및 Artifact producer 경계를 활용할 후속 capability이며 실행 가능한 workflow가 이미 있다는 뜻은 아니다.
다음 구현은 한 가지 조사/초안 작업의 요청 → AgentRun → 검증 Artifact → 사용자 검토 → 업무 결과 연결부터 닫는다.
