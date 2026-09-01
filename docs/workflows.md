# Amber HQ Workflows

**Status:** Foundation v0.2  
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
→ Routine progress read
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

사용자 승인 전에는 canonical DailyPlan이 아니다.

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

Step 이동은 code.

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

---

## 10. Recurring Activity Scheduling

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

Routine risk 예:

- LOW: 충분한 여유
- MEDIUM: 남은 횟수와 남은 적합 일수가 가까움
- HIGH: 오늘 미수행 시 목표 달성 어려움

Routine은 자동으로 새 주마다 같은 Task row를 복사하는 대신 occurrence를 생성한다.

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
