# Amber HQ Core Runtime v0.1

**Status:** IMPLEMENTATION-READY
**Depends on:** Database Foundation v0.1

## 1. 왜 이 단계를 만드는가

DB는 상태를 저장할 뿐이다.
이제 필요한 것은 "어떤 코드만이 어떤 상태를 어떻게 바꿀 수 있는가"를 정의하는 Core Runtime이다.

핵심 학습:
- Repository Pattern
- State Machine
- Rules Engine
- Domain Event
- Transaction boundary
- Deterministic-first architecture

Agent가 DB를 직접 수정하게 하지 않는다.

```text
Agent / UI / Discord
        ↓
Application Service
        ↓
Domain Rules
        ↓
Repository
        ↓
Supabase
        ↓
DomainEvent
```

## 2. 이번 구현 범위

포함:
- packages/core
- packages/shared
- Supabase repository abstraction
- Task Repository
- Task State Machine
- Domain Event writer
- Rules Engine v0.1
- unit/integration tests

제외:
- Next.js UI
- Discord
- Google Calendar
- AI Gateway
- Chief Agent
- MCP
- Memory/Pattern logic

## 3. Repository 원칙

Repository는 DB access를 숨긴다.

예:
- getTaskById
- listActiveTasks
- createTask
- updateTask
- appendDomainEvent

금지:
- UI/Agent에서 Supabase client 직접 호출
- business rule을 SQL query 곳곳에 분산
- repository 안에서 AI 호출

## 4. Task State Machine

Canonical states:
- INBOX
- PLANNED
- IN_PROGRESS
- BLOCKED
- WAITING_FOR_USER
- DONE

허용 전이:

```text
INBOX → PLANNED
INBOX → IN_PROGRESS

PLANNED → IN_PROGRESS
PLANNED → DONE

IN_PROGRESS → BLOCKED
IN_PROGRESS → WAITING_FOR_USER
IN_PROGRESS → DONE

BLOCKED → IN_PROGRESS
BLOCKED → WAITING_FOR_USER
BLOCKED → DONE

WAITING_FOR_USER → IN_PROGRESS
WAITING_FOR_USER → BLOCKED
WAITING_FOR_USER → DONE
```

DONE에서 다른 상태로 되돌리지 않는다.

모든 상태 전이는 반드시:
1. 현재 상태 확인
2. 허용 전이 검증
3. transaction 내 상태 변경
4. DomainEvent 기록

## 5. Task State Events

- task_created
- task_planned
- task_started
- task_blocked
- task_waiting_for_user
- task_resumed
- task_completed

Event payload 최소:
- previous_status
- next_status
- reason?
- source
- changed_at

## 6. Application Service

TaskService 외부 entry point:
- createTask(input)
- planTask(taskId)
- startTask(taskId)
- blockTask(taskId, reason)
- waitForUser(taskId, reason)
- resumeTask(taskId)
- completeTask(taskId)

TaskService는:
- validation
- state machine
- repository
- event writer
를 조합한다.

## 7. Rules Engine v0.1

AI 없이 계산하는 규칙부터 구현한다.

Deadline:
- getDaysUntilDeadline
- isDueToday
- isOverdue
- isDueWithin(days)

Duration:
- getRemainingMinutes
- getEstimateError
- getActualVsEstimatedRatio

Capacity 입력:
- availableMinutes
- plannedTaskMinutes
- protectedRoutineMinutes
- bufferMinutes

Capacity 출력:
- remainingCapacity
- overCapacity
- overloadMinutes

Recurring Activity:
입력:
- targetCount
- completedCount
- remainingSuitableDays

출력:
- remainingCount
- risk: LOW / MEDIUM / HIGH

기본 risk:
- remainingCount <= 0 → LOW
- remainingCount < remainingSuitableDays → LOW
- remainingCount == remainingSuitableDays → MEDIUM
- remainingCount > remainingSuitableDays → HIGH

Replan Trigger:
다음 중 하나면 true:
- overCapacity
- task duration overrun이 threshold 초과
- important deadline conflict
- active plan item unavailable

이번 단계에서는 새 plan 생성까지 하지 않고 shouldReplan 판단만 한다.

## 8. Shared Types

packages/shared:
- IDs
- Result / DomainError
- Clock interface
- common date helpers
- Zod input schemas

시간 의존 코드에서는 직접 new Date() 남발 금지.
Clock abstraction 사용.

## 9. Error Model

예:
- TASK_NOT_FOUND
- INVALID_TASK_TRANSITION
- CROSS_USER_ACCESS
- INVALID_INPUT
- CONFLICT

에러 문자열에 business handling을 의존하지 않는다.

## 10. Transaction Boundary

Task 상태 변경 + DomainEvent 기록은 같은 transaction이어야 한다.

부분 성공 금지:
- Task는 DONE인데 event 없음
- event는 task_completed인데 Task가 IN_PROGRESS

DB function/RPC 또는 server-side transaction wrapper 중 현재 Supabase 구조에 맞는 가장 단순한 방식을 사용한다.

## 11. Tests

State machine:
- 모든 허용 전이 PASS
- 모든 금지 전이 FAIL

Event:
- 상태 변경 성공 시 event 1개
- 실패한 전이는 event 0개

Concurrency:
- 동일 Task의 경쟁 전이 시 stale 상태 overwrite 금지

Rules:
- deadline edge cases
- capacity zero/negative
- routine risk
- estimate error
- replan trigger

Repository:
- cross-user read/write 차단
- task create/read/update
- event append

## 12. Definition of Done

- packages/core 생성
- packages/shared 생성
- Task repository 구현
- TaskService 구현
- Task State Machine 구현
- DomainEvent transaction 구현
- Rules Engine v0.1 구현
- unit/integration test PASS
- lint/typecheck PASS
- Supabase local test PASS
- AI dependency 0
- UI dependency 0
