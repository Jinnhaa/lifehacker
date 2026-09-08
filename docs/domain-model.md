# Amber HQ Domain Model

**Status:** Foundation v0.3  
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
RecurringActivity  Principle
                   WorkstyleProfile
        │              ▲
        ▼              │
Work Domain ────── Decision / Evidence
WorkContext         Decision
Project / Course    DecisionFeedback
CourseProfile       LearningCase
CourseAssessment    PatternEvidence / Outcome
Task / TaskStep
        │
        ▼
Execution Domain
FocusSession
ActivityOccurrence
DomainEvent
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
Input Domain
InboxItem
ParsedEntity
DomainCommand
        │
        ▼
Automation Domain
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
AIExecution
Scope
AgentScopeGrant
ToolDefinition
ToolGrant
ToolCall
ContextPackage
Artifact
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
- recurring activity defaults
- preferred planning density
- monthly AI budget

---

## 3. Goal / Objective / Recurring Activity Domain

### Canonical hierarchy

```text
Goal
  └─ Objective (optional)

WorkContext
  ├─ Project
  └─ Course

Task
  └─ TaskStep

RecurringActivity
  └─ ActivityOccurrence
```

- Goal = 장기 방향/상태.
- Objective = 기간·완료조건이 있는 결과. Goal 없이 standalone 가능.
- Project와 Course는 내부적으로 공통 `WorkContext`를 사용한다.
- Project = `WorkContext.kind = project`.
- Course = `WorkContext.kind = course` + `CourseProfile` / `CourseAssessment`.
- Task는 최대 하나의 WorkContext에 속한다.
- Task는 optional하게 하나의 Objective에 연결한다.
- Task에 goal/project/course FK를 중복 저장하지 않는다.
- Task의 Goal 연결은 `Task.objective_id → Objective.goal_id`에서만 유도한다.
- WorkContext 자체는 Goal을 암시하지 않는다.
- Task가 `objective_id`와 `work_context_id`를 동시에 가지고 Objective에도 `work_context_id`가 있으면 두 WorkContext는 반드시 같아야 한다.
- Task의 effective WorkContext는 `Task.work_context_id`를 우선하고, 값이 없으면 `Objective.work_context_id`에서 유도한다.
- Objective의 `work_context_id`가 null이면 Task의 WorkContext를 제한하지 않는다.
- RecurringActivity는 optional하게 Goal과 연결한다.
- Weekly target은 Goal이 아니라 RecurringActivity가 소유한다.

### Goal

- `id`, `user_id`
- `title`, `description?`, `importance`
- `status`: active / archived
- `origin`
- `created_at`, `archived_at?`

### Objective

- `id`, `user_id`
- `goal_id?`, `work_context_id?`
- `title`, `target_date?`, `success_criteria`
- `importance`
- `status`: active / achieved / cancelled / archived
- `origin`, `created_at`

### RecurringActivity

- `id`, `user_id`, `goal_id?`
- `title`, `category`
- `period`: week
- `target_count`
- `expected_minutes`
- `minimum_minutes?`
- `scheduling_mode`: flexible / spread / specific_days
- `preferred_days?`, `preferred_time_window?`
- `importance`
- `effective_from`, `effective_until?`
- `active`

Recurrence 기준:
- timezone = UserProfile.timezone
- week start = UserSettings.week_starts_on, default Monday
- `period_key`는 위 기준으로 계산한다.

### ActivityOccurrence

- `id`
- `recurring_activity_id`
- `period_key`
- `sequence_no`
- `planned_date?`, `planned_start_at?`
- `started_at?`, `ended_at?`
- `actual_minutes?`
- `status`: planned / in_progress / partial / completed / skipped / cancelled
- `counts_toward_target`
- `plan_item_id?`

Unique: `(recurring_activity_id, period_key, sequence_no)`

기본 완료 정책:
- minimum_minutes가 없으면 명시적 완료 신호를 1회로 인정.
- minimum_minutes가 있고 그 미만이면 partial.

---

## 4. Work Context / Course / Task Domain

### WorkContext

- `id`, `user_id`
- `kind`: project / course
- `title`, `description?`
- `status`: active / completed / archived
- `start_date?`, `end_date?`
- `scope_id`
- `created_at`, `archived_at?`

### CourseProfile

- `work_context_id`
- `target_grade?`
- `self_reported_understanding?`
- `term?`, `instructor?`

### CourseAssessment

- `id`
- `course_context_id`
- `assessment_type`: quiz / midterm / final / assignment / team_project / attendance / other
- `title`
- `weight_percent?`
- `due_at?`
- `score?`, `max_score?`
- `submission_status?`: not_required / pending / submitted / late / missing
- `provenance`, `observed_at`
- `created_at`, `updated_at`

점수가 바로 나오지 않는 과제/팀플은 score가 null이어도 된다.

### Task

- `id`, `user_id`
- `work_context_id?`, `objective_id?`
- `title`, `description?`
- `official_deadline?`, `internal_deadline?`
- `estimated_minutes?`, `estimated_user_minutes?`, `actual_minutes`
- `importance`, `status`, `next_action?`, `completion_criteria?`

Task state:
`INBOX / PLANNED / IN_PROGRESS / BLOCKED / WAITING_FOR_USER / DONE`

Pause는 Task state가 아니라 FocusSession state로 표현한다.

### TaskStep

- `id`, `task_id`, `position`, `title`
- `owner`: user / ai
- `estimated_minutes?`
- `completion_criteria?`
- `status`: pending / in_progress / completed / skipped

### EstimateRevision

- `id`, `task_id`
- `estimate_type`: total / user
- `minutes`
- `origin`: user / ai / system
- `reason?`, `created_at`

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
- `origin`, `created_by`, `confirmation_status`
- `source_reference?`

큰 우선순위를 매번 다시 묻지 않기 위한 canonical record다.

StrategicDirective는 사용자 직접 입력이거나 AI 제안 후 사용자 확인을 거친 값만 활성 정책으로 사용한다.

---

## 6. Planning Domain

### DailyPlan

DailyPlan은 **immutable revision**으로 관리한다.

- `id`, `user_id`
- `plan_date`, `timezone`
- `revision_no`
- `status`: proposed / approved / rejected / superseded / closed
- `supersedes_plan_id?`
- `approval_source?`: user / policy
- `approval_reason?`
- `input_snapshot`
- `created_by`: system / ai / user
- `created_at`, `approved_at?`, `closed_at?`

Unique: `(user_id, plan_date, revision_no)`

Replan은 기존 row를 덮어쓰지 않고 새 revision을 만든다.

### PlanItem

- `id`, `daily_plan_id`, `position`
- `item_type`: task / recurring_activity / rest / buffer
- `task_id?`, `activity_occurrence_id?`
- `planned_start_at?`, `planned_end_at?`, `planned_minutes`
- `status`: planned / active / completed / skipped / cancelled

### Current Action

별도 mutable pointer를 canonical로 저장하지 않는다.

1. active FocusSession이 있으면 해당 Task/Step
2. 없으면 최신 approved DailyPlan의 첫 실행가능 미완료 PlanItem
3. 없으면 Planner가 다음 행동 필요 상태 반환

### Availability

Calendar fixed event와 Constraint를 계산한 derived state.

---

## 7. Execution / Event Domain

### FocusSession

- `id`, `user_id`, `task_id`
- `plan_item_id?`, `current_step_id?`
- `status`: active / paused / completed / cancelled
- `started_at`, `paused_at?`, `ended_at?`
- `end_reason?`: completed / switched / blocked / user_stop / replanned / other
- `actual_minutes`

규칙:
- 사용자당 active FocusSession 최대 1개.
- Task switch 시 기존 FocusSession은 paused.
- Task 자체는 필요하면 IN_PROGRESS 유지.
- V1 재개는 새 FocusSession 생성 + 이전 session history 보존.

### DomainEvent

공통 envelope:
- `id`
- `event_type`
- `aggregate_type`, `aggregate_id`
- `actor_type`: user / system / agent / integration
- `actor_id?`
- `occurred_at`, `recorded_at`
- `correlation_id`, `causation_id?`
- `workflow_run_id?`
- `idempotency_key?`
- `payload_version`, `payload`

---

## 8. Input Domain

### InboxItem

모든 입력은 바로 Task나 Calendar event가 되지 않고 Inbox를 거친다.

입력 소스:

- Discord
- Web
- iCloud Calendar
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

- `id`, `user_id`
- `question`
- `why_now`
- `options`
- `ai_recommendation`
- `ai_reason`
- `impact`
- `status`
- `created_at`, `resolved_at?`

### DecisionFeedback

사용자가 AI 판단을 수정한 정보.

- `id`, `user_id`, `decision_id`
- `user_choice`
- `user_reason`
- `corrected_ai_assumption?`
- `created_at`

### LearningCase

Clone 학습의 한 사례를 FK 수준에서 연결하는 canonical record다.

- `id`, `user_id`
- `decision_id?`
- `decision_feedback_id?`
- `context_snapshot`
- `recommendation_snapshot?`
- `case_type`: decision / planning / intervention / estimate / routine
- `status`
- `created_at`, `closed_at?`

사용자 correction을 학습하는 LearningCase는 `decision_id`와 `decision_feedback_id`가 모두 필수다. AI 추천을 그대로 따른 사례는 Decision만 연결할 수 있고, 반복활동 실행처럼 순수 관찰 기반 사례는 둘 다 null일 수 있다. `decision_feedback_id`만 단독으로 둘 수 없으며, 값이 있으면 해당 DecisionFeedback의 `decision_id`는 LearningCase의 `decision_id`와 같아야 한다.

### LearningCaseEvent

학습 사례의 context, action, outcome 근거를 append-only DomainEvent와 연결한다.

- `learning_case_id`
- `domain_event_id`
- `event_role`: context / action / outcome

Primary key: `(learning_case_id, domain_event_id, event_role)`

### Outcome

LearningCase의 실제 결과를 저장한다.

- `id`, `user_id`, `learning_case_id`
- `outcome_type`
- `summary?`, `success?`, `score?`, `payload`
- `observed_at`
- `source_event_id?`
- `created_at`

`source_event_id`가 있으면 결과를 관찰하게 한 DomainEvent를 가리킨다. 집계 결과처럼 단일 Event가 없으면 `payload`에 관찰 결과를 보존한다.

개인화 학습 기본 관계:

```text
Decision
→ DecisionFeedback
→ LearningCase
→ LearningCaseEvent → DomainEvent
→ Outcome
→ PatternEvidence
→ Pattern
→ Principle
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
- strategy

### Preference

사용자가 직접 설정하거나 명확하게 확인된 선호.

- `id`, `user_id`
- `preference_key`, `value`, `scope_id?`
- `origin`, `created_by`, `confirmation_status`
- `valid_from?`, `valid_until?`
- `source_reference?`

관찰만 된 값은 Preference로 저장하지 않고 Pattern에 둔다. AI가 제안한 Preference는 사용자 확인 전 적용하지 않는다.

### Pattern

반복된 행동에서 관찰된 경향.

대표 필드:

- `id`, `user_id`
- `pattern_type`
- `condition`
- `observed_behavior`
- `confidence`
- `evidence_count`
- `status`: candidate / active / dismissed / expired
- `evaluator_version`

### PatternEvidence

Pattern이 어떤 LearningCase를 근거로 만들어졌는지 연결.

- `pattern_id`, `learning_case_id`
- `direction`: supports / contradicts
- `weight`
- `observed_at`

Unique: `(pattern_id, learning_case_id)`

AI가 지어낸 성향을 막는 핵심 장치다.

### Principle

사용자가 승인한 일반화된 판단 규칙.

**Pattern 자동 발견 ≠ Principle 자동 저장**

Principle 승격은 사용자 승인이 필요하다.

- `id`, `user_id`, `source_pattern_id?`
- `statement`, `scope?`
- `origin`, `created_by`
- `confirmation_status`: pending / approved / rejected / revised
- `status`: candidate / active / rejected / superseded
- `valid_from?`, `valid_until?`
- `source_reference?`
- `approved_at?`, `created_at`

Principle은 사용자 직접 입력 또는 Pattern Candidate의 사용자 승인으로만 생성한다.

### Provenance Contract

Preference, Principle, StrategicDirective에서 사용자 직접 입력과 AI 제안을 구분하기 위한 공통 metadata다.

- `origin`: user_explicit / ai_proposed / pattern_promoted
- `created_by`: user / system / agent
- `confirmation_status`: not_required / pending / confirmed / rejected
- `source_reference?`: 근거 Pattern, Decision, 입력 또는 Event reference
- `valid_from?`, `valid_until?`: 시간 범위가 있는 경우에만 사용

현재 구현에서 활성 Principle은 `confirmation_status=approved`이면서 `status=active`여야 한다. StrategicDirective와 AI 제안 Preference도 각 canonical 승인 정책을 통과한 뒤 적용한다.

### Intervention learning

독립 entity가 아니라 `LearningCase.case_type = intervention`으로 시작하는 derived concept다.

예:

```text
perfectionism
→ Good Enough 기준 제시
→ 7분 내 재시작
→ completion=true
```

`LearningCase(case_type=intervention) → LearningCaseEvent → Outcome → PatternEvidence → Pattern → 필요 시 Principle`

### WorkstyleProfile

사용자와 Agent에게 실제 적용되는 revisioned Workstyle configuration이다.

- `id`, `user_id`
- `scope_type`: global / agent
- `agent_type?`: chief / project_pm / research / development
- `revision`
- `instructions`, `directives`
- `active`
- `created_at`, `updated_at`

global scope에는 `agent_type`이 없고 agent scope에는 반드시 존재한다. 사용자당 active global은 최대 1개이며 사용자와 agent type 조합당 active profile도 최대 1개다. scope별 revision history를 보존한다.

Preference는 사용자가 확인한 개별 선호, Pattern은 반복 행동에서 관찰한 경향, WorkstyleProfile은 실제 Agent 수행에 적용하는 instruction configuration이다.

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
home_scope_id=...
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
- `max_turns`, `max_tool_calls`, `timeout_seconds`
- `cost_budget`
- `started_at`
- `ended_at`
- `token_usage_rollup`, `estimated_cost_rollup` (AIExecution에서 derived)

### AIExecution

한 번의 model call을 기록하며 비용 집계의 canonical 단위다.

- `id`, `user_id`
- `agent_run_id?`, `workflow_run_id?`
- `job_type`, `provider`, `model`
- `input_context_ref?`
- `status`: queued / running / completed / failed / cancelled
- `input_tokens`, `output_tokens`, `estimated_cost`
- `started_at`, `ended_at?`
- `error_code?`, `correlation_id`

AgentRun의 token/cost 값은 연결된 AIExecution의 derived rollup이며 별도 canonical 비용으로 취급하지 않는다.

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

- `id`, `agent_run_id?`, `workflow_run_id?`
- `initiated_by_ai_execution_id?`
- `tool_definition_id`, `tool_version`
- `input_hash`, `redacted_args?`
- `status`, `approval_request_id?`
- `started_at`, `ended_at?`, `latency_ms?`, `error?`
- `correlation_id`

### Artifact

Agent, AIExecution 또는 ToolCall이 만든 재사용 가능한 결과다.

- `id`, `user_id`
- `artifact_type`, `storage_ref`, `content_hash?`
- `agent_run_id?`, `ai_execution_id?`, `tool_call_id?`
- `task_id?`, `work_context_id?`
- `provenance`, `status`
- `created_at`

최소 하나의 producer reference를 가져야 한다. Task/WorkContext 연결은 산출물의 업무 맥락이 있을 때만 사용한다.

실행 관계:

- AgentRun은 여러 AIExecution과 ToolCall을 가질 수 있다.
- AIExecution은 AgentRun 내부 또는 WorkflowRun의 standalone model call일 수 있다.
- AIExecution이 ToolCall을 시작했다면 `initiated_by_ai_execution_id`로 연결한다.
- Artifact는 실제 producer인 AgentRun, AIExecution 또는 ToolCall을 reference한다.
- 비용의 canonical 합계는 AIExecution이며 AgentRun 비용은 연결된 AIExecution의 합산값이다.

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

Wake retry와 Focus/DND suppression을 포함해 발송 lifecycle을 audit한다.

- `id`, `user_id`, `workflow_run_id?`, `scheduled_job_id?`
- `channel`
- `priority`
- `suppression_reason?`
- `attempt_no`
- `scheduled_at`
- `sent_at?`
- `delivered_at?`
- `acknowledged_at?`
- `dedupe_key`
- `status`: scheduled / suppressed / sent / delivered / acknowledged / failed / cancelled

같은 logical notification의 retry는 동일한 workflow/job correlation 아래 `attempt_no`로 구분한다. Focus/DND로 보내지 않은 알림은 `suppressed`와 `suppression_reason`을 기록한다.

---

## 15. Integration Domain

### IntegrationAccount

iCloud Calendar, Google Calendar, Notion 등 인증 연결.

### ExternalReference

내부 entity와 외부 object의 관계.

예:

```text
task ↔ Snowboard assignment
constraint ↔ iCloud/Google Calendar event
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
| Task/Project/Goal/RecurringActivity | Supabase |
| Decision/Pattern/Principle | Supabase |
| Workflow/Approval state | Supabase |
| Fixed-time calendar event | iCloud Calendar (primary) |
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


---

## 18. Audit Resolution Contracts

### Input mutation
`InboxItem → ParsedEntity → DomainCommand → DomainEvent`

- ParsedEntity는 processing_status와 domain_command_id를 가진다.
- DomainCommand는 idempotency_key와 result entity reference를 가진다.
- ExternalReference는 external_version/content_hash/sync_status를 가진다.
- 외부 삭제는 hard delete 대신 tombstone/reconciliation 처리.

### Clone
Canonical chain:
`Decision → DecisionFeedback → LearningCase → LearningCaseEvent/Outcome → PatternEvidence → Pattern → Principle`

- `DecisionReason` 별도 entity 없음.
- Pattern Candidate는 별도 entity가 아니라 `Pattern.status = candidate`.
- PatternEvidence는 supports/contradicts, weight, observed_at을 가진다.
- Pattern은 evaluator_version을 가진다.

### Agent Scope
Generic `Scope`, `AgentScopeGrant`, `ToolGrant`로 격리한다.
- Scope kind: global / work_context / goal / objective / custom
- AgentInstance는 home_scope_id를 가진다.
- deny가 allow보다 우선.
- ContextResolver와 Tool 실행은 같은 scope policy 사용.

### AI trace
- AgentRun = multi-step specialist run
- AIExecution = individual model call
- ToolCall = capability invocation
- Artifact = reusable result
- 비용 집계는 AIExecution 기준

### Durable approval
WorkflowRun은 checkpoint_state/checkpoint_version/idempotency_key/correlation_id를 가진다.

ApprovalRequest는:
- action_type/action_ref/action_hash
- checkpoint_version
- pending/approved/rejected/expired/cancelled
- expires_at/responded_at
- resume_idempotency_key

Resume 전 checkpoint/precondition/idempotency를 재검증한다.

### Notification
scheduled/suppressed/sent/delivered/acknowledged/failed/cancelled lifecycle과 dedupe_key를 가진다.

### Calendar identity
FixedExternalEvent와 AmberManagedWorkBlock을 provenance로 구분해 capacity 이중 차감을 막는다.
