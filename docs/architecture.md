# Amber HQ Architecture

**Status:** V1 baseline  
**Primary goal:** 1주 안에 실제 생활에서 사용 가능한 개인용 Chief of Staff core 구축  
**Scope of this document:** backend/domain/automation 및 UI Control Plane 경계

---

## 1. Architecture Goal

Amber HQ는 AI 챗봇이 아니라 **지속적으로 사용자 상태를 관리하는 개인 운영 시스템**이다.

시스템은 다음 질문에 안정적으로 답할 수 있어야 한다.

1. 지금 사용자의 고정 일정은 무엇인가?
2. 지금 해야 하는 일과 마감은 무엇인가?
3. 사용 가능한 시간은 얼마나 되는가?
4. 지금 무엇을 하는 것이 가장 적절한가?
5. AI가 먼저 처리할 수 있는 부분은 무엇인가?
6. 사용자가 직접 결정해야 하는 것은 무엇인가?
7. 계획이 틀어졌을 때 어떻게 다시 완료 가능한 상태로 만드는가?
8. 사용자의 수정 이유와 실제 결과에서 무엇을 학습해야 하는가?

핵심 제품 목표:

> 복잡성을 사용자에게 보여주는 것이 아니라 시스템 내부에서 처리하고, 사용자가 지금 해야 할 행동과 중요한 결정만 남긴다.

---

## 2. Architecture Principles

### 2.1 Deterministic First

코드로 확실하게 계산할 수 있는 것은 AI를 사용하지 않는다.

예:

- Calendar event 조회/정렬
- 가용시간 계산
- D-Day
- deadline risk의 기초 계산
- 예상 작업시간 합산
- 상태 전환
- timer/checkpoint
- 주간 목표 수행량
- 일정 충돌
- 단순 replan trigger
- wake-up escalation timing

AI는 의미 해석, 복합 판단, 생성이 필요한 경우에만 호출한다.

### 2.2 Single Source of Truth

각 데이터 유형마다 한 곳만 canonical source로 둔다.

| 데이터 | Source of Truth |
|---|---|
| Task / Task State | Supabase |
| Project / Goal | Supabase |
| Daily Plan | Supabase |
| Decision / Memory | Supabase |
| Execution Event | Supabase |
| Fixed-time Schedule | iCloud Calendar (primary) |
| Human-readable Project Knowledge | Notion |
| Source code | GitHub repository |

외부 데이터는 필요할 경우 normalized snapshot/reference를 Supabase에 저장할 수 있지만 원본 소유권을 혼동하지 않는다.

### 2.3 Event-aware State

현재 상태만 저장하지 않는다.

중요한 행동은 append-oriented event history로 남겨 향후 개인화와 분석에 사용할 수 있게 한다.

### 2.4 Integration Isolation

iCloud Calendar, Google Calendar, Discord, Notion, Snowboard, Codex는 모두 adapter/interface 뒤에 둔다.

외부 서비스 교체가 Core Domain 변경으로 이어지지 않아야 한다.

### 2.5 AI Isolation

LLM provider를 feature 코드에서 직접 호출하지 않는다.

모든 AI 호출은 AI Gateway를 통과한다.

### 2.6 Human Authority

시스템은 저수준·수정 가능한 작업을 적극적으로 자동화한다.

다만 큰 우선순위, 프로젝트의 핵심 방향, 장기 Principle 승격은 사용자의 권한으로 남긴다.

---

## 3. System Context

```text
                     ┌─────────────────────┐
                     │       User          │
                     └─────────┬───────────┘
                               │
                   Discord / Web / Manual
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Input / Event API │
                    └─────────┬───────────┘
                              ▼
                    ┌─────────────────────┐
                    │    Orchestrator     │
                    └──────┬───────┬──────┘
                           │       │
                 ┌─────────▼─┐   ┌─▼──────────┐
                 │ Rules     │   │ AI Gateway │
                 │ Engine    │   │            │
                 └──────┬────┘   └─────┬──────┘
                        │              │
                        └──────┬───────┘
                               ▼
                  ┌────────────────────────┐
                  │      Core Domain       │
                  │ Task / Plan / Focus    │
                  │ Decision / Memory      │
                  │ Goal / Project / Event │
                  └───────────┬────────────┘
                              ▼
                        ┌───────────┐
                        │ Supabase  │
                        └───────────┘

     External adapters
     ├─ iCloud / Google Calendar
     ├─ Discord
     ├─ Notion
     ├─ Snowboard
     └─ Codex Worker
```

---

## 4. Technology Baseline

### Application

- TypeScript
- Next.js App Router
- pnpm workspaces

### Backend / Data

- Supabase PostgreSQL
- Supabase Auth
- Supabase migrations
- Row Level Security

### Validation

- Zod for external input and AI structured output

### Integrations

- iCloud Calendar CalDAV
- Google Calendar API
- Discord Bot
- Notion API
- Snowboard adapter
- Codex adapter/worker

### Runtime

- Vercel: Next.js web/API where appropriate
- Supabase: Postgres/Auth
- Persistent worker runtime: Discord Bot and jobs requiring a continuously running process
- Scheduled jobs: Supabase scheduled mechanism or worker scheduler, chosen per job

V1에서 distributed microservices는 사용하지 않는다.

---

## 5. Repository Structure

```text
amber-hq/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── web/
│   └── discord-bot/
├── packages/
│   ├── core/
│   │   ├── task/
│   │   ├── planning/
│   │   ├── focus/
│   │   ├── rules/
│   │   ├── goals/
│   │   ├── projects/
│   │   ├── decisions/
│   │   ├── memory/
│   │   └── events/
│   ├── integrations/
│   │   ├── google-calendar/
│   │   ├── discord/
│   │   ├── notion/
│   │   ├── snowboard/
│   │   └── codex/
│   ├── ai/
│   │   ├── gateway/
│   │   ├── providers/
│   │   ├── prompts/
│   │   ├── context/
│   │   └── schemas/
│   └── shared/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
└── docs/
    ├── architecture.md
    ├── product-rules.md
    └── v1-scope.md
```

`packages/core`는 UI나 특정 외부 서비스에 의존하지 않는다.

---

## 6. Core Domain Model

V1 핵심 entity:

### User/Profile

- timezone
- preferences
- integration state references

### Goal

장기간 유지하고 싶은 방향 또는 상태다.

V1 대표 사례는 학점, 일본어다.

### Objective

기간과 완료조건이 있는 결과다.

- Goal 없이 standalone으로 만들 수 있다.
- 필요하면 하나의 Goal 또는 WorkContext와 연결한다.

### WorkContext

Project와 Course가 공유하는 업무 context boundary다.

- Project = `WorkContext.kind = project`
- Course = `WorkContext.kind = course`
- Course는 CourseProfile과 CourseAssessment로 확장한다.

Task와 Memory의 context boundary 역할을 한다.

### Task

핵심 필드:

- title
- work_context_id?
- objective_id?
- status
- official_deadline
- internal_deadline
- estimated_minutes
- actual_minutes
- importance
- next_action
- ai_work
- user_work

Task에 `project_id`, `course_id`, `goal_id`를 중복 저장하지 않는다. Task의 Goal은 Objective를 통해서만 유도하며 WorkContext 자체는 Goal을 암시하지 않는다.

### TaskStep

Focus Mode에서 실행할 최소 행동 단위.

- task_id
- position
- owner: `user | ai`
- estimated_minutes
- completion_criteria
- status

### DailyPlan

해당 날짜의 승인된 실행 계획.

### FocusSession

예상 시간과 실제 시간을 기록하는 실행 세션.

### Decision

사용자의 판단이 필요한 항목.

- question
- why_now
- options
- ai_recommendation
- ai_reason

### DecisionFeedback

사용자가 AI 판단을 수정한 선택과 이유.

- decision_id
- user_choice
- user_reason
- corrected_ai_assumption

### Memory

장기 보존할 구조화된 정보.

- fact
- decision
- project
- experience
- growth

### Principle

사용자가 승인한 일반화된 판단 규칙.

### Pattern Candidate

반복 행동/결정에서 추출되었으나 아직 사용자 승인을 받지 않은 원칙 후보.

### DomainEvent

Task를 포함한 모든 중요한 상태 변화를 공통 event envelope로 기록한다.

---

## 7. Task State Machine

```text
           ┌──────────┐
           │  INBOX   │
           └────┬─────┘
                ▼
          ┌───────────┐
          │  PLANNED  │
          └─────┬─────┘
                ▼
        ┌───────────────┐
        │  IN_PROGRESS  │
        └───┬───────┬───┘
            │       │
            ▼       ▼
       ┌────────┐ ┌──────────────────┐
       │BLOCKED │ │WAITING_FOR_USER  │
       └───┬────┘ └────────┬─────────┘
           │               │
           └───────┬───────┘
                   ▼
             IN_PROGRESS
                   │
                   ▼
                ┌──────┐
                │ DONE │
                └──────┘
```

상태 전환 함수는 Core Domain에 위치한다.

Integration이나 UI가 DB status를 직접 임의 변경하지 않는다.

모든 중요한 전환은 대응 event를 생성한다.

---

## 8. Event Model

대표 event type:

### Task

- `task_created`
- `task_planned`
- `task_started`
- `task_blocked`
- `block_reason_recorded`
- `task_resumed`
- `task_switched`
- `task_completed`
- `task_estimate_updated`

### Planning

- `plan_created`
- `plan_approved`
- `plan_replanned`
- `capacity_changed`

### Focus

- `focus_started`
- `focus_step_completed`
- `focus_ended`

### Decision

- `decision_requested`
- `decision_resolved`
- `decision_corrected`

### Daily lifecycle

- `morning_started`
- `morning_plan_approved`
- `day_close_started`
- `day_closed`
- `wake_triggered`
- `wake_acknowledged`

Event payload는 versionable JSON으로 두되, event type별 Zod schema를 둔다.

---

## 9. Rules Engine

Rules Engine은 deterministic decision을 담당한다.

대표 함수:

```text
getAvailableTime()
getFreeTimeBlocks()
getNextFixedEvent()
getDeadlineRisk()
getRemainingWorkload()
calculateCapacity()
detectScheduleConflict()
shouldReplan()
calculateReplanDelta()
shouldEscalateWakeup()
shouldProtectLongTermGoal()
getWeeklyGoalProgress()
```

Rules Engine은 LLM을 호출하지 않는다.

### Replanning trigger 예시

- 예상 대비 실제 시간 차이가 작은 경우: 재계획하지 않음
- 중간 수준 차이: 규칙 기반 block shift
- deadline/capacity conflict가 발생한 경우: Planning Engine으로 escalation
- 복합 우선순위 판단이 필요한 경우에만 AI 사용

정확한 threshold는 실제 사용 데이터를 보고 조정 가능하게 config로 관리한다.

---

## 10. Input Pipeline

모든 입력 채널은 동일한 event/domain pipeline으로 들어온다.

```text
Discord / Web / Snowboard / Notion-derived signal
                    │
                    ▼
             Integration Adapter
                    │
                    ▼
              Normalized Input
                    │
          ┌─────────┴──────────┐
          │                    │
 deterministic            semantic
    input                    input
          │                    │
          │                AI Parser
          │                    │
          └─────────┬──────────┘
                    ▼
               Zod Validation
                    ▼
                DomainCommand
                    ▼
                  Supabase
```

AI parser는 DB를 직접 수정하지 않는다.

---

## 11. Morning Workflow

목표: 사용자가 `일어남`이라고 했을 때 하루를 시작할 수 있는 상태를 만든다.

```text
wake acknowledged / "일어남"
        │
        ▼
Calendar events 조회
        │
Active/unfinished Tasks 조회
        │
Deadlines 계산
        │
Long-term Goal progress 조회
        │
Free time / Capacity 계산
        │
        ▼
사용자에게 AI가 알 수 없는 오늘 정보만 질문
        │
        ▼
Capacity 재계산
        │
        ▼
Planning Engine
        │
        ▼
Daily Plan 제안
        │
        ▼
사용자 승인
        │
        ▼
Daily Plan 저장
        │
        ▼
Current Task 결정
```

Calendar/Task/capacity 계산은 AI 없이 수행한다.

AI는 여러 목표와 Task 사이의 복합적인 계획 제안이 필요한 경우 사용한다.

---

## 12. Planning Engine

Planning Engine 입력은 raw DB dump가 아니라 **코드가 만든 planning context**다.

예:

```json
{
  "current_time": "09:20",
  "available_blocks": [
    {"start": "09:30", "end": "10:40"},
    {"start": "12:00", "end": "13:30"}
  ],
  "deadline_tasks": [],
  "unfinished_tasks": [],
  "protected_goals": {},
  "daily_condition": "good",
  "work_until": "19:00"
}
```

출력은 structured plan이다.

- ordered plan items
- planned minutes
- recommended start/end
- reasoning summary
- decisions needed

사용자 승인 전에는 canonical DailyPlan으로 확정하지 않는다.

---

## 13. Execution / Focus Workflow

Task 시작 전 필요 시 전체 execution flow를 생성한다.

사용자에게는 먼저 다음을 확인시킨다.

- 목표
- 완료 기준
- 전체 단계
- 예상시간
- AI가 할 부분
- 사용자가 할 부분

사용자 승인 후에는 현재 Step 하나를 중심으로 실행한다.

```text
Task Start
   │
   ▼
Execution Flow 확인
   │
   ▼
Focus Session
   │
   ▼
Current Step
   │
   ├─ Complete → 다음 Step
   ├─ Blocked  → Recovery
   └─ Switch   → Guardrail
```

Step 이동 자체에는 AI가 필요하지 않다.

---

## 14. Recovery Engine

Blocked reason은 최소한 다음 category를 지원한다.

- unclear
- hard
- avoidance
- perfectionism
- missing_material
- other

Routing은 코드로 수행한다.

예:

- `unclear` → task clarification
- `hard` → learning/explanation support
- `avoidance` → minimum action
- `perfectionism` → good-enough criteria
- `missing_material` → research/material retrieval

실제 설명, 재구성, 자료 생성 등 semantic output이 필요할 때 AI를 호출한다.

Recovery 결과와 재시작 여부를 event로 저장한다.

---

## 15. Task Switch Guardrail

사용자가 Focus 중 다른 Task로 전환하려 하면 시스템은 먼저 영향도를 계산한다.

```text
현재 Task 남은 시간
+ 다음 고정 일정
+ deadline impact
+ current plan
```

영향이 있으면 한 번만 경고/추천한다.

사용자가 그래도 전환을 선택하면:

1. 현재 Focus 상태 저장
2. 기존 Task pause
3. 새 Task 시작
4. event 기록
5. 남은 하루 replan 여부 판단

사용자를 반복적으로 막지 않는다.

---

## 16. Dynamic Replanning

모든 Task 완료 시 AI를 호출하지 않는다.

```text
actual duration
      -
estimated duration
      │
      ▼
Rules Engine
```

Rules Engine이 다음을 결정한다.

- 무시 가능한 차이
- 단순 shift
- 새로운 buffer/rest 사용
- protected goal 당겨오기
- 복합 replan 필요

복합 충돌이 있을 때만 AI Planning을 호출한다.

목표는 계획을 유지하는 것이 아니라 **현실이 바뀌어도 중요한 일을 완료 가능한 상태로 계속 복구하는 것**이다.

---

## 17. Day Close Workflow

Trigger:

- 사용자의 `오늘 끝`, `잘게` 등
- 설정된 시간 이후 미종료 상태에 대한 system prompt

코드가 먼저 수집:

- 오늘 계획
- 완료 Task
- 미완료 Task
- Focus time
- estimated vs actual
- blocked events
- task switch
- decisions
- long-term goal progress

AI가 필요한 경우:

- 하루 요약
- 의미 있는 학습/패턴 후보
- 내일 넘길 항목 설명

미완료 Task의 실제 재배치는 Rules/Planning Engine으로 처리한다.

Day Close 마지막에는 다음 날 목표 기상시간을 받을 수 있다.

---

## 18. Wake Workflow

목표 기상시간이 설정된 경우 wake workflow를 schedule한다.

```text
target wake time
    │
    ▼
notification
    │
no response
    ▼
retry/escalation
    │
schedule impact calculation
    │
    ▼
stronger notification
```

반복 시점과 schedule impact 계산은 code로 처리한다.

`일어남`/wake acknowledgment가 들어오면 즉시 종료한다.

Discord에서 실제 음성 통화 발신 가능 여부는 별도 integration capability로 취급하며 core requirement로 가정하지 않는다.

---

## 19. Long-term Goal Engine

V1에서 지속 보호가 중요한 장기 목표는 소수만 둔다.

대표:

- 학점
- 일본어

### 학점

가능한 데이터:

- 과목
- 목표 성적
- 평가 비중
- 중간/기말/퀴즈 점수
- 과제 제출
- 실제 공부시간
- 사용자 체감 이해도

목적은 정확한 최종 성적 예측보다 **남은 시간의 과목별 투자 판단**이다.

### 일본어

추적 가능 항목:

- RecurringActivity 주간 학습 target
- 실제 수행
- 최근 학습 내용
- 부족 영역
- 실제 소요시간

Planning Engine은 장기 목표가 단기 마감 때문에 반복적으로 사라지는 것을 방지한다.

---

## 20. Decision System

중요한 판단만 사용자에게 가져간다.

Decision escalation 기준:

- uncertainty
- wrong decision의 downstream rework cost
- external impact
- reversibility

저수준 조사/정리처럼 잘못되어도 수정 비용이 작은 작업은 자동 실행할 수 있다.

Decision record:

- question
- why now
- options
- AI recommendation
- reason
- expected impact
- user choice
- user reason
- outcome

사용자가 AI 판단을 수정하면 가능하면 `왜?`를 짧게 확인해 학습 데이터로 남긴다.

---

## 21. Memory Architecture

Memory는 모두 prompt에 넣는 저장소가 아니다.

### Categories

- Fact
- Decision
- Project
- Experience
- Principle
- Growth

### Retrieval principle

```text
Current Task
    │
    ▼
Context Resolver
    │
    ├─ Relevant Project memory
    ├─ Relevant Decisions
    ├─ Approved Principles
    ├─ Recent working context
    └─ Relevant Notion documents
    │
    ▼
Compact Context Package
```

실행 로그는 시간이 지나면 요약/압축할 수 있다.

중요한 Decision, Experience, approved Principle은 장기 보존한다.

Vector retrieval은 V1 필수사항이 아니다. 구조화 query로 충분하지 않을 때 도입한다.

---

## 22. Pattern Learning

개인화는 다음 LearningCase chain을 중심으로 학습한다.

```text
Decision
→ DecisionFeedback
→ LearningCase
→ Actual Action DomainEvent / Outcome
→ PatternEvidence
→ Pattern Candidate
```

Pattern detector는 LearningCase에 연결된 PatternEvidence를 모아 `Pattern Candidate`를 만든다.

AI가 임의로 장기 Principle로 저장하지 않는다.

```text
Pattern detected
      │
      ▼
Pattern Candidate
      │
      ▼
User approval
      │
      ▼
Approved Principle
```

---

## 23. AI Gateway

모든 LLM 호출은 중앙 Gateway를 통과한다.

대표 job type:

- `parse_input`
- `interpret_requirement`
- `plan_day`
- `decompose_task`
- `prepare_work`
- `recover_block`
- `replan_complex`
- `extract_pattern_candidate`
- `compress_decision`
- `build_context_package`

Gateway 책임:

- job type validation
- provider/model selection
- prompt/template selection
- relevant context assembly
- structured output validation
- retry policy
- token/cost logging
- timeout/error normalization

Feature module은 특정 model/provider name에 의존하지 않는다.

---

## 24. AI Cost Strategy

기본 우선순위:

1. deterministic code
2. SQL/query
3. Rules Engine
4. 저비용 AI
5. 고성능 AI

고성능 AI는 다음에만 사용한다.

- 복잡한 일정/우선순위 충돌
- 중요한 프로젝트 판단
- 높은 rework cost의 결정
- 복잡한 context synthesis

모든 AI usage는 job type과 비용을 기록할 수 있게 한다.

Background agent loop가 무제한 반복되지 않도록 iteration/time/cost boundary를 둔다.

---

## 25. Integration Contracts

### Calendar Adapters

iCloud Calendar는 primary fixed-time source이며 CalDAV read-only adapter로 연결한다.
Google Calendar는 선택적 read-only source다. 두 provider는 동일한 normalized event와
ExternalReference/Constraint 계약을 사용하되 인증과 동기화 cursor는 adapter 내부에서 분리한다.

최소 interface:

- `listEvents(range)`

가용시간과 우선순위 계산은 adapter가 아니라 Core Rules가 담당한다.

### Discord Adapter

역할:

- user input 수신
- command/trigger 전달
- notification 전송
- approval/decision 응답 전달

Business logic을 포함하지 않는다.

### Notion Adapter

역할:

- 관련 문서 검색
- 문서 fetch
- 필요 시 문서 생성/업데이트

Notion Task DB와 Amber Task DB를 이중 Source of Truth로 만들지 않는다.

### Snowboard Adapter

목표:

- new assignment/announcement signal 생성
- 원문/reference 전달

과제 요구사항 해석과 Task 생성은 Core/AI pipeline에서 처리한다.

인증/접근 방법이 불안정하면 V1 core 개발을 막지 않도록 adapter 경계 밖에서 해결한다.

### Codex Adapter

목표:

- 개발 Task에 필요한 Context Package 전달
- 작업 결과 수집
- 상태/결과를 Chief workflow로 반환

Codex 자체가 Amber HQ의 장기 Memory를 갖는다고 가정하지 않는다.

---

## 26. Agent Runtime

Agent는 독립 서버가 아니라 configuration 기반 runtime으로 시작한다.

```text
AgentInstance
├─ AgentTemplate + template version
├─ home_scope_id
├─ memory/context policy
├─ ToolGrant
└─ permissions / approval policy
```

대표 agent:

- Chief
- School Agent
- Project PM
- Worker

새 프로젝트가 생기면 같은 runtime에 다른 scope/config를 부여한다.

Agent meeting은 자유대화가 아니라 제한된 protocol로 구현한다.

예:

1. 관련 Agent에게 독립 의견 요청
2. Chief가 충돌 탐지
3. 필요할 때만 한 번의 rebuttal
4. Chief가 사용자용 결론 압축

V1 core loop가 안정되기 전에는 멀티 Agent orchestration을 우선 구현하지 않는다.

---

## 27. Scheduler / Background Jobs

Background job의 대표 유형:

- wake trigger/retry
- deadline watch
- daily close reminder
- periodic external sync
- memory compression
- pattern detection

각 job은 idempotent하게 설계한다.

같은 job이 두 번 실행돼도 중복 Task/notification/event가 무분별하게 생성되지 않아야 한다.

job execution status와 failure를 추적할 수 있어야 한다.

---

## 28. Error Handling

외부 Integration 실패가 전체 시스템 실패로 이어지지 않게 한다.

예:

- Calendar 조회 실패 → stale data 표시/재시도 + planning을 확정하지 않음
- AI 실패 → deterministic data는 보존하고 사용자에게 핵심 실패만 알림
- Discord 실패 → notification retry 가능 상태 저장
- Notion 실패 → Task runtime 자체는 계속 동작

에러를 삼키지 않는다.

사용자에게 필요한 에러와 개발 로그를 구분한다.

---

## 29. Security and Privacy

- Supabase RLS를 사용자 소유 데이터에 적용한다.
- Service Role Key는 server-only로 유지한다.
- OAuth access/refresh token은 client bundle에 노출하지 않는다.
- Discord Bot Token과 AI API Key를 Git에 넣지 않는다.
- `.env.local` / 배포 secret store를 사용한다.
- 로그에 token, credential, 전체 민감 payload를 출력하지 않는다.
- 외부 integration은 필요한 최소 권한 scope를 우선한다.
- destructive external action은 user authority 정책을 따른다.

---

## 30. Observability

V1부터 최소한 다음을 추적 가능하게 한다.

- workflow 시작/종료
- job failure
- integration failure
- AI job type
- AI token/cost
- task state transition
- plan/replan event
- decision response
- focus actual duration

관측 가능성을 위해 business logic에 무분별한 console log를 넣지 말고 공통 logging interface를 둔다.

---

## 31. Testing Strategy

### Unit

외부 dependency 없는 Core:

- state machine
- deadline
- capacity
- free time
- conflict
- replan trigger
- goal protection
- wake escalation

### Integration

- Supabase repository
- Calendar adapter
- Discord adapter
- AI Gateway structured output

외부 API는 가능한 sandbox/mock/fixture를 사용한다.

### Workflow

최소 주요 vertical flow:

```text
일어남
→ Calendar/Task 조회
→ Capacity
→ 사용자 상황
→ Daily Plan
→ 승인
→ Current Task
```

이 flow가 V1의 첫 번째 end-to-end acceptance test다.

---

## 32. Deployment Boundary

### Vercel

- Next.js
- 사용자 요청 기반 API
- 짧은 server operations

### Supabase

- Postgres
- Auth
- migrations
- RLS
- 필요한 scheduled/server function

### Persistent Worker

- Discord connection
- 장시간 살아 있어야 하는 listener
- 필요한 background workflow

특정 hosting provider에 Core Domain이 종속되지 않게 한다.

---

## 33. Scalability Strategy

V1은 개인용 단일 사용자 규모에서 시작한다.

처음부터 다음을 만들지 않는다.

- microservices
- Kafka
- 복잡한 event bus
- dedicated vector database
- distributed agent mesh
- 여러 독립 worker service
- 과도한 caching layer

확장 시 병목이 실제로 확인된 뒤 분리한다.

PostgreSQL schema와 module boundary를 명확히 해 코드 구조의 확장성만 확보한다.

---

## 34. Implementation Order

기능 구축 순서는 다음을 기본으로 한다.

1. Repository / Supabase baseline
2. Core data model
3. Event model
4. Task state machine
5. Rules Engine
6. Manual Task input
7. Discord adapter
8. Calendar adapters (iCloud primary, Google optional)
9. Morning workflow
10. Daily planning
11. Execution / Focus domain
12. Recovery
13. Dynamic replanning
14. Day Close
15. Wake workflow
16. Decision reason capture
17. Memory / Pattern Candidate
18. Snowboard adapter
19. Notion context resolver
20. Codex Worker
21. Project Agent runtime
22. Agent collaboration protocol

UI 구현은 이 순서의 Core 기능을 대체하지 않는다.

---

## 35. V1 Non-goals

다음은 초기 Core의 완료 조건이 아니다.

- 화려한 Agent office UI
- Agent가 자율적으로 계속 대화하는 시스템
- 모든 외부 서비스 완전 자동화
- 정확한 성적 예측
- 완벽한 장기 패턴 모델
- vector database
- 사용자 행동을 막는 강제 통제
- AI가 최종 제출을 대신하는 구조

---

## 36. Architecture Decision Rules

새 기술이나 구조를 도입할 때 다음 순서로 판단한다.

1. 현재 실제 문제를 해결하는가?
2. deterministic code로 가능한가?
3. 기존 module/interface로 가능한가?
4. 데이터 Source of Truth를 흐리지 않는가?
5. 운영비를 불필요하게 키우지 않는가?
6. 테스트가 가능한가?
7. provider/vendor 교체 가능성을 지나치게 막지 않는가?
8. V1에 지금 필요한가?

새 abstraction을 도입하는 이유를 한 문장으로 설명할 수 없다면 도입하지 않는다.

---

## 37. Known Open Decisions

다음은 구현 과정에서 별도 결정이 필요한 항목이다.

- Discord에서 실제 음성 전화 수준의 wake-up이 가능한지와 대체 수단
- Snowboard의 안정적인 접근/인증 방식
- persistent worker hosting provider
- scheduled job을 Supabase와 worker 중 어디에 둘지에 대한 구체 기준
- Codex invocation 방식과 execution permission boundary
- AI provider/model routing 정책의 구체값
- event retention/compression 주기
- Notion project knowledge schema

이 항목들은 Core 구조를 임기응변으로 바꾸지 않고 각각 독립적인 Architecture Decision으로 해결한다.


---

## 44. Foundation v0.3 Canonical Decisions

- Goal과 Objective는 별도 entity.
- Project/Course는 공통 WorkContext를 사용.
- Course는 CourseProfile/CourseAssessment로 확장.
- Task는 최대 하나의 WorkContext와 optional Objective만 직접 연결.
- Canonical 반복활동 용어는 RecurringActivity.
- Weekly target은 RecurringActivity가 소유.
- DailyPlan은 immutable revision.
- Current Action은 FocusSession/latest approved plan에서 derived.
- Pause는 Task state가 아니라 FocusSession state.
- Clone chain은 Decision → DecisionFeedback → LearningCase → Action Event/Outcome → PatternEvidence → Pattern → Principle.
- Pattern Candidate는 별도 entity가 아니라 `Pattern.status = candidate` lifecycle을 사용.
- Workflow approval은 checkpoint version + precondition + idempotent resume.
- Agent isolation은 Scope/AgentScopeGrant/ToolGrant.
- AgentRun / AIExecution / ToolCall / Artifact를 분리.


## 45. Product Operating Architecture — 2026-09-09

Amber HQ의 제품 범위는 Personal AI Operating System이다. Understand → Decide → Execute → Learn을
Daily Execution Loop와 Project Leadership Loop 양쪽에서 닫아야 한다. 기존 Daily Core 구현만으로
제품 전체가 완성되었다고 판단하지 않는다.

- Personal loop: Goal/Objective + Project/Course work + Calendar/Constraints → Planning → 승인 → Focus/Recovery → Day Close → Learning.
- Project loop: WorkContext의 목표/현재 근거 → Gap → Objective(milestone) → Task(backlog) → Daily Execution → Review → 다음 iteration.
- Objective/Task/WorkContext를 재사용한다. 별도 ProjectTask, DashboardTask 또는 프로젝트별 상태 머신을 만들지 않는다.
- TaskStep.owner는 업무 분담, AgentRun은 실제 실행, AIExecution은 model call, Artifact는 결과물이다. AI owner 표시나 상태 보고만으로 실행 완료를 주장하지 않는다.
- UI는 Home 실행 진입점과 Goal/Project/Schedule/Automation/Personalization 관리 화면을 포함하는 Control Plane이다.
  Home의 작은 화면 범위는 제품 전체 관리 권한을 축소하는 규칙이 아니다. mutation은 인증된 서버 경계 → Core → DB/event를 통과한다.

현재 구현 경계:

| 영역 | 실제 구현 | 아직 닫히지 않은 연결 |
|---|---|---|
| Daily Core | Discord → Morning/Focus/Replan/Day Close/Wake | Goal/Project에서 자동 업무 발견·주간 workload 생성 |
| Planning | 기존 Task의 Goal/Objective/WorkContext 상태·중요도·Objective 마감 반영 | Task가 없는 Goal의 실행 업무 생성, dependency 및 전략 순서 전체 처리 |
| Project PM | scoped Task/Objective/Goal/Focus/event 조회 | 근거 수집 → gap → backlog 제안 → 승인 → iteration review |
| Agent | Chief/PM 읽기 서비스와 실행 기록, Input model adapter | 생성 작업 dispatch, ToolGrant 강제 실행, 실패/재시도/승인 resume |
| Learning | 일일 판단 피드백 → LearningCase → Pattern → 승인 Principle의 제한적 Planning 적용 | 프로젝트 Decision/Why/Result 조회 및 PM 판단·Career 재사용 |
| Web | 예시 데이터 기반 미리보기 | 인증, Core 조회·mutation, reload 후 durable 상태 복원 |

Foundation 문서의 schema 존재 또는 freeze 표시는 구현 완료 증거가 아니다.
물리 필드/상태는 database-schema와 migrations, 관계·정책은 domain-model/product-rules,
실행 계약은 workflows/agent-contract를 함께 확인한다. 감사 기록은 canonical 설계를 대체하지 않는다.
