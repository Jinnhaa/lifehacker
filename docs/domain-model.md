# Amber HQ Domain Model

**Status:** Foundation v0.2  
**Purpose:** Amber HQ의 요구사항을 구현할 때 필요한 핵심 Domain과 관계를 정의한다.  
**Principle:** 기능을 먼저 만들고 DB를 뒤늦게 덧붙이지 않는다. 변경 비용이 큰 Domain 경계와 데이터 소유권을 먼저 고정한다.

---

## 1. Domain Map

```text
Identity
  UserProfile / UserSettings
        │
        ├──────────────┐
        ▼              ▼
Goal Domain        Personalization Domain
Goal               Preference
Objective          Pattern
Routine            Principle
                   InterventionPattern
        │              ▲
        ▼              │
Work Domain ────── Decision / Evidence
Project             Decision
Course              DecisionReason
Task                PatternEvidence
TaskStep            Outcome
        │
        ▼
Execution Domain
FocusSession
ActivityOccurrence
TaskEvent
        │
        ▼
Planning Domain
Constraint
Availability
DailyPlan
PlanItem
StrategicDirective
        │
        ▼
Automation Domain
InboxItem
WorkflowRun
ScheduledJob
Notification
ApprovalRequest
        │
        ▼
Agent / Tool Domain
AgentTemplate
AgentInstance
AgentRun
ToolDefinition
ToolGrant
ToolCall
ContextPackage
        │
        ▼
Integration Domain
IntegrationAccount
ExternalReference
MCPServerConnection
```

---

## 2. Identity

### UserProfile

사용자의 기본 identity와 시스템 동작의 기준값.

대표 필드:

- `id`
- `display_name`
- `timezone`
- `locale`
- `created_at`

### UserSettings

사용자가 **직접 설정한 값**만 저장한다.

AI가 추론한 패턴과 절대 섞지 않는다.

예:

- planning buffer
- notification policy
- wake policy
- routine defaults
- preferred planning density
- monthly AI budget

---

## 3. Goal Domain

### Goal

장기간 유지하고 싶은 방향 또는 상태.

예:

- 학점
- 일본어

대표 필드:

- `title`
- `description`
- `importance`
- `status`

### Objective

기간과 완료 조건이 있는 단기/중기 결과 목표.

예:

- 이번 학기 GPA 4.2+
- JLPT N2 취득
- 4호선톤 제출
- 지원사업 신청 완료

대표 필드:

- `goal_id?`
- `title`
- `target_date`
- `success_criteria`
- `importance`
- `status`

### RecurringActivity

사용자가 주도적으로 횟수와 시간을 조절할 수 있는 반복 활동.

예:

- 일본어 공부
- 운동
- 빨래
- 청소기
- 화장실 청소
- 주간 회고

반복활동으로 만들기 위한 기준:

> 사용자가 횟수와 시간을 스스로 조절할 수 있고 반복적으로 수행할 가치가 있는가?

대표 필드:

- `title`
- `category`
- `linked_goal_id?`
- `frequency_period` (`week` 등)
- `frequency_count`
- `expected_minutes`
- `minimum_minutes?`
- `scheduling_mode`
- `preferred_days?`
- `preferred_time_window?`
- `importance`
- `active`

### ActivityOccurrence

RecurringActivity의 실제 한 번의 실행.

예:

```text
일본어 Routine: 주 3회 × 30분
Occurrence:
- 월 28분 완료
- 수 35분 완료
- 토 예정
```

대표 필드:

- `recurring_activity_id`
- `planned_date`
- `started_at`
- `ended_at`
- `actual_minutes`
- `status`
- `counts_toward_target`
- `source_task_id?`

---

## 4. Work Domain

### Project

종료점이 있는 프로젝트/활동의 context boundary.

예:

- LogFolio
- OURMAP
- 4호선톤
- 어흥콘

### Course

학교 과목 전용 context.

Project와 공통 인터페이스를 가질 수 있지만 다음 정보가 추가된다.

- 목표 성적
- 평가 구조
- 시험 일정
- 현재 점수
- 이해도
- 실제 공부시간

### Task

실제 완료해야 하는 한 번의 일.

대표 필드:

- `project_id?`
- `course_id?`
- `objective_id?`
- `goal_id?`
- `title`
- `description`
- `official_deadline`
- `internal_deadline`
- `estimated_minutes`
- `estimated_user_minutes`
- `actual_minutes`
- `importance`
- `status`
- `next_action`
- `completion_criteria`

`estimated_minutes`와 `estimated_user_minutes`를 구분한다.

예:

```text
전체 작업: 4시간
AI 선행작업 후 사용자 직접 작업: 1시간 20분
```

### TaskStep

Focus Mode에서 실행하는 최소 행동 단위.

- `position`
- `title`
- `owner`: user / ai
- `estimated_minutes`
- `completion_criteria`
- `status`

---

## 5. Constraint / Strategy Domain

### Constraint

Task도 Goal도 아닌 현재 계획의 제약조건.

예:

- 오늘 19시 이후 작업 불가
- 오늘 컨디션 낮음
- 저녁은 개인시간
- 시험기간에는 프로젝트 최소화

대표 필드:

- `type`
- `value`
- `hardness`
- `valid_from`
- `valid_until`
- `reason`
- `source`

### StrategicDirective

사용자가 직접 정한 큰 우선순위 또는 한시적 운영 방향.

예:

```text
이번 주: 학업 > LogFolio > OURMAP
```

대표 필드:

- `scope`
- `directive`
- `priority_order`
- `valid_from`
- `valid_until`
- `reason`

큰 우선순위를 매번 다시 묻지 않기 위한 canonical record다.

---

## 6. Planning Domain

### DailyPlan

사용자가 승인한 하루 계획.

### PlanItem

DailyPlan 안의 실제 실행 항목.

Task뿐 아니라 RecurringActivity occurrence, rest, buffer도 표현 가능해야 한다.

`item_type` 예:

- task
- routine
- rest
- buffer

### Availability

Google Calendar fixed event와 Constraint를 계산한 실제 가용시간.

DB에 영구 저장할 필요가 없는 derived state일 수 있다.

---

## 7. Execution / Event Domain

### TaskEvent

상태 변경과 사용자 행동의 append-oriented record.

예:

- task_started
- task_blocked
- task_resumed
- task_switched
- task_completed
- estimate_updated

### FocusSession

Task를 실제로 수행한 session.

### Outcome

Decision, intervention, plan의 실제 결과.

개인화는 recommendation만 저장하는 것이 아니라 결과까지 저장해야 한다.

---

## 8. Input Domain

### InboxItem

모든 입력은 바로 Task나 Calendar event가 되지 않고 Inbox를 거친다.

입력 소스:

- Discord
- Web
- Google Calendar
- Snowboard
- Notion
- Codex
- Scheduler/System

대표 필드:

- `source`
- `external_id?`
- `raw_content`
- `received_at`
- `parse_status`
- `dedupe_key?`
- `provenance`

### ParsedEntity

한 입력에서 추출한 구조화 후보.

예:

```text
"금요일 6시 로그폴 회의,
 목요일까지 BM 수정,
 요즘 일본어가 밀림"
```

→

- CalendarEvent candidate
- Task candidate
- Observation candidate

대표 필드:

- `entity_type`
- `structured_data`
- `confidence`
- `requires_confirmation`
- `source_inbox_item_id`

---

## 9. Decision Domain

### Decision

사용자의 판단이 필요한 중요한 결정.

대표 필드:

- `question`
- `why_now`
- `options`
- `ai_recommendation`
- `ai_reason`
- `impact`
- `status`

### DecisionFeedback

사용자가 AI 판단을 수정한 정보.

- `decision_id`
- `user_choice`
- `user_reason`
- `corrected_ai_assumption?`

### Outcome

결정이 실제로 어떤 결과를 냈는지 나중에 연결한다.

개인화 학습 기본 단위:

```text
상황
→ AI 추천
→ 사용자 수정
→ 왜?
→ 실제 행동
→ 결과
```

---

## 10. Personalization / Clone Domain

Memory와 Clone은 분리한다.

### Memory

무엇이 있었는가를 저장.

종류:

- fact
- decision
- project
- experience
- growth

### Preference

사용자가 직접 설정하거나 명확하게 확인된 선호.

### Pattern

반복된 행동에서 관찰된 경향.

대표 필드:

- `pattern_type`
- `condition`
- `observed_behavior`
- `confidence`
- `evidence_count`
- `status`

### PatternEvidence

Pattern이 어떤 실제 Event/Decision/Outcome을 근거로 만들어졌는지 연결.

AI가 지어낸 성향을 막는 핵심 장치다.

### Principle

사용자가 승인한 일반화된 판단 규칙.

**Pattern 자동 발견 ≠ Principle 자동 저장**

Principle 승격은 사용자 승인이 필요하다.

### InterventionPattern

어떤 막힘/상황에서 어떤 개입이 실제로 효과적이었는지.

예:

```text
perfectionism
→ Good Enough 기준 제시
→ 7분 내 재시작
→ completion=true
```

---

## 11. Context Domain

### ContextPackage

Agent/GPT/Codex에게 일을 시킬 때 필요한 최소 context 묶음.

대표 구성:

- task
- completion criteria
- project/course summary
- current objective/goal
- relevant decisions
- approved principles
- current constraints
- relevant memories
- relevant Notion documents
- expected output
- prohibited actions

ContextPackage는 필요한 정보만 포함한다.

전체 Memory / 전체 Notion을 전달하지 않는다.

### ContextResolver

현재 Task + Agent scope + Tool permission을 기준으로 ContextPackage를 생성한다.

---

## 12. Agent Domain

### AgentTemplate

역할 정의.

예:

- chief
- project_pm
- school
- researcher
- developer_worker

대표 필드:

- `key`
- `name`
- `role`
- `instructions`
- `default_tools`
- `default_permissions`
- `default_memory_policy`
- `version`
- `active`

### AgentInstance

특정 scope에서 실제 동작하는 Agent.

예:

```text
template=project_pm
name=LogFolio PM
project_id=...
```

### AgentRun

한 번의 agent 실행.

반드시 기록:

- `agent_instance_id`
- `template_version`
- `policy_version`
- `workflow_run_id?`
- `input_context_ref`
- `status`
- `started_at`
- `ended_at`
- `token_usage`
- `estimated_cost`

---

## 13. Tool Domain

### ToolDefinition

Agent가 사용할 수 있는 capability.

Tool source:

- internal function
- MCP
- external API adapter
- agent-as-tool

대표 metadata:

- `tool_key`
- `source_type`
- `read_only`
- `destructive`
- `idempotent`
- `open_world`
- `trust_level`
- `data_access_class`
- `side_effect_class`
- `default_approval_policy`
- `version`

MCP annotation은 참고 신호이며 Amber HQ의 ToolDefinition policy가 최종 기준이다.

### ToolGrant

어떤 Agent가 어떤 scope에서 Tool을 사용할 수 있는지.

### ToolCall

모든 의미 있는 tool call을 추적한다.

- agent/run
- tool
- input hash / redacted args
- result status
- approval reference
- latency
- error
- cost if applicable

---

## 14. Automation / Durable Workflow Domain

### WorkflowRun

Morning, Day Close, Focus recovery, agent 작업 등 장기/중단 가능 workflow의 실행 상태.

대표 필드:

- `workflow_type`
- `status`
- `current_step`
- `state`
- `idempotency_key`
- `started_at`
- `updated_at`
- `completed_at`

상태 예:

- running
- waiting_for_user
- waiting_for_tool
- scheduled
- completed
- failed
- cancelled

### ApprovalRequest

사용자 승인이 필요한 tool/decision checkpoint.

실행 프로세스를 계속 열어두지 않고 DB에 저장한 뒤 나중에 resume 가능해야 한다.

### ScheduledJob

Wake, deadline watch, sync 같은 미래 trigger.

### Notification

발송 여부와 deduplication을 추적한다.

---

## 15. Integration Domain

### IntegrationAccount

Google Calendar, Notion 등 인증 연결.

### ExternalReference

내부 entity와 외부 object의 관계.

예:

```text
task ↔ Snowboard assignment
plan item ↔ Google Calendar event
project ↔ Notion page
```

### MCPServerConnection

MCP를 사용할 경우 server 단위 connection/config.

- server label
- transport/url
- trust level
- allowed tool policy
- protocol version/capability
- auth reference
- enabled

---

## 16. Source of Truth

| 데이터 | Canonical source |
|---|---|
| Task/Project/Goal/Routine | Supabase |
| Decision/Pattern/Principle | Supabase |
| Workflow/Approval state | Supabase |
| Fixed-time calendar event | Google Calendar |
| Knowledge document | Notion |
| Source code | GitHub |
| Agent execution state | Supabase |
| MCP server tool catalog | External server + cached registry |

---

## 17. Foundation Rule

새 기능을 추가할 때 먼저 이 Domain Model로 표현 가능한지 확인한다.

표현 가능하면 기존 Domain을 재사용한다.

표현 불가능하면 DB column을 즉흥적으로 추가하지 말고:

1. 새로운 개념이 정말 독립 Domain인지 확인
2. 기존 Domain의 책임을 오염시키지 않는지 확인
3. Architecture 변경인지 판단
4. 문서 업데이트
5. Migration

순으로 처리한다.
