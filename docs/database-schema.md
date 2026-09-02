# Amber HQ Database Schema v0.1

**Status:** IMPLEMENTATION-READY DESIGN  
**Foundation dependency:** Foundation v0.3.2 — FROZEN  
**Database:** Supabase PostgreSQL

## 0. 왜 이 단계가 필요한가

Amber HQ에서 DB는 단순 저장소가 아니라 Agent가 행동할 **환경과 기억**이다. 아래 네 종류를 분리해서 저장한다.

```text
State               현재 무엇이 사실인가
Event               무슨 일이 일어났는가
Memory/Personalization  무엇을 장기적으로 기억하고 학습할 것인가
Execution Trace     AI/Agent/Tool이 실제로 무엇을 했는가
```

이 단계에서 배우는 핵심은 `대화 history ≠ memory`, `현재 state ≠ event history`, `AI 추론 ≠ DB mutation`이라는 점이다.

---

## 1. Physical Design 결정

### 1.1 PK
모든 application table은 `uuid default gen_random_uuid()`를 사용한다.

### 1.2 시간
- 순간: `timestamptz`
- 날짜: `date`
- timezone: IANA timezone text (`Asia/Seoul` 등)
- 날짜 계산은 `profiles.timezone` 기준

### 1.3 Enum
V1은 PostgreSQL enum 대신 `text + CHECK constraint`를 우선한다. 값 변경이 잦은 초기 제품에서 migration을 단순화하면서도 잘못된 상태값은 DB에서 막기 위함이다.

### 1.4 JSONB
JSONB는 relation을 대체하지 않는다.

JSONB 사용:
- snapshot
- AI structured result
- 외부 payload
- options/context
- provenance/source reference

정규 column/FK 사용:
- Goal, Task, Project/Course
- Plan, Decision, Pattern
- Agent, Permission, lifecycle state

### 1.5 User ownership
`profiles.id`는 `auth.users.id` PK를 참조한다. 거의 모든 user-owned table에 `user_id`를 직접 둔다. RLS와 cross-user leakage 방지가 쉬워진다.

### 1.6 삭제
Goal/Objective/WorkContext/Agent/Memory/Principle 등 학습 가치가 있는 데이터는 hard delete보다 archive/status 전환을 우선한다. 계정 삭제 시에만 user-owned data cascade delete를 허용한다.

---

## 2. 전체 구조

```text
auth.users
  └─ profiles ─ user_settings
      ├─ scopes
      ├─ goals ─ objectives
      │   └─ recurring_activities ─ activity_occurrences
      ├─ work_contexts
      │   ├─ course_profiles
      │   └─ course_assessments
      ├─ tasks ─ task_steps ─ estimate_revisions
      ├─ constraints / strategic_directives
      ├─ daily_plans ─ plan_items ─ focus_sessions
      ├─ domain_events
      ├─ inbox_items ─ parsed_entities ─ domain_commands
      ├─ external_references / integration_accounts
      ├─ decisions ─ decision_feedback
      │   └─ learning_cases ─ learning_case_events / outcomes
      │       └─ patterns ─ pattern_evidence ─ principles
      ├─ preferences / memories
      ├─ workflow_runs ─ approval_requests
      ├─ scheduled_jobs / notifications / outbox_events
      └─ Agent Platform
          ├─ agent_templates / agent_instances / agent_scope_grants
          ├─ tool_definitions / tool_grants
          ├─ context_packages / agent_runs / ai_executions
          ├─ tool_calls / artifacts
          └─ mcp_server_connections
```

---

## 3. 구현 우선순위

### P0 — Daily Core
즉시 필요:
- profiles, user_settings, scopes
- goals, objectives
- work_contexts, course_profiles, course_assessments
- recurring_activities, activity_occurrences
- tasks, task_steps, estimate_revisions
- constraints, strategic_directives
- daily_plans, plan_items, focus_sessions
- domain_events
- inbox_items, parsed_entities, domain_commands, external_references
- decisions, decision_feedback, learning_cases, learning_case_events, outcomes
- patterns, pattern_evidence, principles, preferences, memories
- workflow_runs, approval_requests, scheduled_jobs, notifications
- ai_executions

### P1 — Integration / durable side effect
- integration_accounts
- outbox_events
- context_packages
- artifacts

### P2 — Agent Platform / MCP
- agent_templates, agent_instances, agent_scope_grants
- tool_definitions, tool_grants
- agent_runs, tool_calls
- mcp_server_connections

P2는 P0를 변경하지 않고 additive migration으로 추가 가능해야 한다.

---

# 4. Identity / Settings

## profiles

| column | type | null | constraint |
|---|---|---:|---|
| id | uuid | no | PK, FK `auth.users(id)` |
| display_name | text | yes | |
| timezone | text | no | default `Asia/Seoul` |
| locale | text | no | default `ko-KR` |
| created_at | timestamptz | no | default now() |
| updated_at | timestamptz | no | default now() |

## user_settings

| column | type | null | constraint |
|---|---|---:|---|
| user_id | uuid | no | PK/FK profiles |
| week_starts_on | smallint | no | 1–7 |
| planning_buffer_minutes | integer | no | >=0 |
| monthly_ai_budget_krw | integer | yes | >=0 |
| planning_policy | jsonb | no | default `{}` |
| notification_policy | jsonb | no | default `{}` |
| wake_policy | jsonb | no | default `{}` |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |

현재 개인 설정값(예: AI 예산)은 schema default가 아니라 seed/config에서 넣는다.

---

# 5. Scope

## scopes
Agent permission과 Context retrieval의 공통 boundary.

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| kind | text | no |
| parent_scope_id | uuid | yes |
| label | text | no |
| created_at | timestamptz | no |

`kind`: `global / work_context / goal / objective / custom`

제약:
- 사용자당 global scope 최대 1개
- parent_scope는 같은 user 소유

---

# 6. Goal / Objective

## goals

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| scope_id | uuid | yes |
| title | text | no |
| description | text | yes |
| importance | smallint | no |
| status | text | no |
| origin | text | no |
| created_at | timestamptz | no |
| archived_at | timestamptz | yes |

`importance`: 1–5. `status`: active/archived.

## objectives

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| scope_id | uuid | yes |
| goal_id | uuid | yes |
| work_context_id | uuid | yes |
| title | text | no |
| target_date | date | yes |
| success_criteria | text | yes |
| importance | smallint | no |
| status | text | no |
| origin | text | no |
| created_at | timestamptz | no |
| completed_at | timestamptz | yes |

Objective는 Goal 없이 standalone 가능하다.

---

# 7. Project / Course

## work_contexts
Project/Course 공통 boundary.

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| scope_id | uuid | yes |
| kind | text | no |
| title | text | no |
| description | text | yes |
| status | text | no |
| start_date | date | yes |
| end_date | date | yes |
| agent_mode | text | no |
| created_at | timestamptz | no |
| archived_at | timestamptz | yes |

`kind`: project/course.  
`agent_mode`: auto/disabled/not_applicable.

- Project 기본: auto
- Course: not_applicable (School Agent가 담당)

## course_profiles
`work_context.kind=course` 전용 1:1 확장.

| column | type | null |
|---|---|---:|
| work_context_id | uuid | no |
| user_id | uuid | no |
| target_grade | text | yes |
| term | text | yes |
| instructor | text | yes |
| self_reported_understanding | smallint | yes |
| created_at | timestamptz | no |
| updated_at | timestamptz | no |

## course_assessments

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| course_context_id | uuid | no |
| linked_task_id | uuid | yes |
| assessment_type | text | no |
| title | text | no |
| weight_percent | numeric(5,2) | yes |
| due_at | timestamptz | yes |
| score | numeric | yes |
| max_score | numeric | yes |
| submission_status | text | yes |
| provenance | text | no |
| observed_at | timestamptz | no |
| created_at | timestamptz | no |
| updated_at | timestamptz | no |

assessment_type: quiz/midterm/final/assignment/team_project/attendance/other.

---

# 8. RecurringActivity

## recurring_activities

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| goal_id | uuid | yes |
| title | text | no |
| category | text | no |
| period | text | no |
| target_count | smallint | no |
| expected_minutes | integer | no |
| minimum_minutes | integer | yes |
| scheduling_mode | text | no |
| preferred_days | smallint[] | yes |
| preferred_time_window | jsonb | yes |
| importance | smallint | no |
| effective_from | date | no |
| effective_until | date | yes |
| active | boolean | no |
| created_at | timestamptz | no |
| updated_at | timestamptz | no |

category: study/household/exercise/self_care/other.  
period: V1=`week`.  
minimum_minutes는 optional이며 expected_minutes 이하.

## activity_occurrences

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| recurring_activity_id | uuid | no |
| period_key | text | no |
| sequence_no | smallint | no |
| planned_date | date | yes |
| planned_start_at | timestamptz | yes |
| started_at | timestamptz | yes |
| ended_at | timestamptz | yes |
| actual_minutes | integer | yes |
| status | text | no |
| counts_toward_target | boolean | no |
| created_at | timestamptz | no |

Unique: `(recurring_activity_id, period_key, sequence_no)`.

status: planned/in_progress/partial/completed/skipped/cancelled.

PlanItem이 occurrence를 참조하며 반대 방향 FK는 만들지 않는다.

---

# 9. Task / Step / Estimate

## tasks

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| work_context_id | uuid | yes |
| objective_id | uuid | yes |
| title | text | no |
| description | text | yes |
| execution_mode | text | no |
| official_deadline | timestamptz | yes |
| internal_deadline | timestamptz | yes |
| estimated_minutes | integer | yes |
| estimated_user_minutes | integer | yes |
| actual_minutes | integer | no |
| importance | smallint | no |
| status | text | no |
| next_action | text | yes |
| completion_criteria | text | yes |
| completion_source | text | yes |
| created_at | timestamptz | no |
| completed_at | timestamptz | yes |
| updated_at | timestamptz | no |

status: INBOX/PLANNED/IN_PROGRESS/BLOCKED/WAITING_FOR_USER/DONE.  
execution_mode: standard/learning_required/output_focused/mixed.

Task에 `goal_id/project_id/course_id`를 중복 저장하지 않는다.

Cross-table invariant:
- Task와 Objective가 둘 다 WorkContext를 가지면 동일해야 한다.
- Objective WorkContext가 null이면 Task WorkContext를 허용한다.

## task_steps

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| task_id | uuid | no |
| position | integer | no |
| title | text | no |
| owner | text | no |
| estimated_minutes | integer | yes |
| completion_criteria | text | yes |
| status | text | no |
| created_at | timestamptz | no |
| updated_at | timestamptz | no |

Unique `(task_id, position)`. owner=user/ai.

## estimate_revisions

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| task_id | uuid | no |
| estimate_type | text | no |
| minutes | integer | no |
| origin | text | no |
| reason | text | yes |
| created_at | timestamptz | no |

estimate_type=total/user. origin=user/ai/system.

---

# 10. Constraint / Strategy

## constraints
`constraint_type`: availability/energy/personal_time/temporary_policy/hard_rule.

핵심 column:
`id, user_id, constraint_type, value jsonb, hardness, valid_from, valid_until, reason, origin, created_at`.

## strategic_directives
큰 우선순위의 canonical record.

핵심 column:
`id, user_id, directive, priority_order jsonb, scope_id, reason, origin, created_by, confirmation_status, source_reference jsonb, valid_from, valid_until, created_at`.

---

# 11. Daily Planning

## daily_plans

| column | type | null |
|---|---|---:|
| id | uuid | no |
| user_id | uuid | no |
| plan_date | date | no |
| timezone | text | no |
| revision_no | integer | no |
| status | text | no |
| supersedes_plan_id | uuid | yes |
| approval_source | text | yes |
| approval_reason | text | yes |
| input_snapshot | jsonb | no |
| created_by | text | no |
| created_at | timestamptz | no |
| approved_at | timestamptz | yes |
| closed_at | timestamptz | yes |

Unique `(user_id, plan_date, revision_no)`.

Partial unique index: 하루 `status=approved` row 최대 1개.

Replan은 row 수정이 아니라 새 revision.

## plan_items

핵심 column:
`id, user_id, daily_plan_id, position, item_type, task_id?, activity_occurrence_id?, planned_start_at?, planned_end_at?, planned_minutes, status, created_at, updated_at`.

Target CHECK:
- task → task_id만
- routine → activity_occurrence_id만
- rest/buffer → 둘 다 null

승인된 plan의 planned fields는 수정하지 않는다. 실행 status만 변경 가능하고 계획 변경은 새 revision을 만든다.

---

# 12. Focus

## focus_sessions

핵심 column:
`id, user_id, task_id, plan_item_id?, current_step_id?, status, started_at, paused_at?, ended_at?, end_reason?, actual_minutes, created_at`.

status=active/paused/completed/cancelled.

Partial unique index: 사용자당 `status=active` 최대 1개.

Task switch는 Task PAUSED state를 만들지 않고 기존 FocusSession을 paused로 남긴 뒤 새 FocusSession을 생성한다.

---

# 13. DomainEvent

## domain_events

핵심 column:
`id, user_id, event_type, aggregate_type, aggregate_id, actor_type, actor_id?, occurred_at, recorded_at, correlation_id, causation_id?, workflow_run_id?, idempotency_key?, payload_version, payload jsonb`.

대표 event:
- task_created/planned/started/blocked/resumed/switched/completed
- plan_created/approved/replanned
- focus_started/ended
- decision_requested/resolved
- morning_started/day_closed
- activity_completed

별도 TaskEvent table은 만들지 않는다.

---

# 14. Input / Command / External

## inbox_items
`id, user_id, source, external_id?, external_version?, raw_content?, raw_payload?, content_hash?, received_at, observed_at?, dedupe_key, provenance, parse_status, correlation_id, created_at`

Unique `(user_id, dedupe_key)`.

## parsed_entities
`id, user_id, inbox_item_id, entity_type, structured_data jsonb, confidence, requires_confirmation, processing_status, domain_command_id?, created_at`.

## domain_commands
`id, user_id, command_type, payload jsonb, idempotency_key, correlation_id, causation_id?, status, result_entity_type?, result_entity_id?, created_at, applied_at?`.

Unique `(user_id, idempotency_key)`.

AI는 DomainCommand 이전의 해석까지만 한다. DB mutation은 command handler가 수행한다.

## external_references
`id, user_id, source, external_type, external_id, external_version?, ownership, content_hash?, internal_entity_type, internal_entity_id, sync_status, first_seen_at, last_seen_at, deleted_at?`.

ownership=external/amber_managed.  
sync_status=active/stale/deleted/conflict.

Unique `(user_id, source, external_type, external_id)`.

Amber가 Calendar에 만든 Work Block은 `amber_managed`로 표시하여 fixed capacity에 이중 차감하지 않는다.

## integration_accounts (P1)
OAuth/API secret 자체는 저장하지 않는다.

`id, user_id, provider, external_account_id?, status, secret_ref?, metadata jsonb, connected_at?, last_sync_at?, created_at`.

---

# 15. Decision / Clone

## decisions
`id, user_id, workflow_run_id?, question, why_now?, options jsonb, ai_recommendation jsonb?, ai_reason?, impact jsonb?, status, created_at, resolved_at?`.

## decision_feedback
`id, user_id, decision_id, user_choice jsonb, user_reason?, corrected_ai_assumption?, created_at`.

V1에서는 decision당 feedback 최대 1개.

## learning_cases
`id, user_id, case_type, context_snapshot jsonb, recommendation_snapshot jsonb?, decision_id?, decision_feedback_id?, status, created_at, closed_at?`.

case_type=decision/planning/intervention/estimate/routine.

Invariant: decision_feedback가 있으면 같은 decision에 속해야 한다.

## learning_case_events
`learning_case_id, domain_event_id, event_role`.

PK `(learning_case_id, domain_event_id, event_role)`.  
event_role=context/action/outcome.

## outcomes
`id, user_id, learning_case_id, source_event_id?, outcome_type, summary?, success?, score?, payload jsonb, observed_at, created_at`.

## patterns
`id, user_id, pattern_type, condition jsonb, observed_behavior, confidence, evidence_count, evaluator_version, status, first_observed_at, last_observed_at, created_at`.

status=candidate/active/dismissed/expired.

Pattern Candidate는 별도 table이 아니다.

## pattern_evidence
`pattern_id, learning_case_id, direction, weight, observed_at`.

PK `(pattern_id, learning_case_id)`. direction=supports/contradicts.

## principles
`id, user_id, scope_id?, source_pattern_id?, statement, origin, created_by, confirmation_status, source_reference jsonb?, valid_from, valid_until?, status, approved_at, created_at`.

Pattern에서 Principle로 승격할 때 사용자 승인이 필수.

## preferences
`id, user_id, scope_id?, preference_key, value jsonb, origin, created_by, confirmation_status, source_reference jsonb?, valid_from, valid_until?, created_at`.

관찰값은 Preference로 바로 저장하지 않고 Pattern에 둔다.

## memories
`id, user_id, scope_id?, memory_type, title?, content, summary?, importance, origin, confirmation_status, retention_class, source_reference jsonb?, source_event_id?, created_at, archived_at?`.

memory_type=fact/decision/project/experience/growth/strategy.  
retention_class=permanent/compressible/short.

Principle은 memories에 중복 저장하지 않는다.

---

# 16. Durable Workflow / Notification

## workflow_runs
`id, user_id, workflow_type, status, current_step?, checkpoint_state jsonb, checkpoint_version, idempotency_key, correlation_id, started_at, updated_at, completed_at?`.

Unique `(user_id, idempotency_key)`.

## approval_requests
`id, user_id, workflow_run_id, decision_id?, action_type, action_ref, action_hash, checkpoint_version, status, requested_at, expires_at?, responded_at?, responded_by?, response_payload jsonb?, resume_idempotency_key, created_at`.

Resume 전 approval status, checkpoint_version, action precondition, resume idempotency를 재검증한다.

## scheduled_jobs
`id, user_id, workflow_run_id?, job_key, job_type, run_at, payload jsonb, status, attempt_count, max_attempts, last_error?, created_at, updated_at`.

Unique `(user_id, job_key)`.

## notifications
`id, user_id, workflow_run_id?, channel, notification_type, priority, payload jsonb, scheduled_at?, status, suppression_reason?, attempt_no, dedupe_key, sent_at?, delivered_at?, acknowledged_at?, created_at`.

status=scheduled/suppressed/sent/delivered/acknowledged/failed/cancelled.

Unique `(user_id, dedupe_key)`.

## outbox_events (P1)
외부 side effect durable delivery.

`id, user_id, event_type, payload jsonb, idempotency_key, status, available_at, attempt_count, max_attempts, last_error?, created_at, processed_at?`.

Unique `(user_id, idempotency_key)`.

---

# 17. Agent Platform (P2)

## agent_templates
`id, user_id, template_key, version, name, role, instructions, active, created_at`.

Unique `(user_id, template_key, version)`.

## agent_instances
`id, user_id, agent_template_id, template_version, name, home_scope_id, custom_instructions?, status, created_at, archived_at?`.

기존 Agent는 template 최신 버전으로 자동 upgrade하지 않는다.

## agent_scope_grants
`id, user_id, agent_instance_id, scope_id, access_level, valid_from, valid_until?`.

Unique `(agent_instance_id, scope_id)`.

## tool_definitions
`id, user_id, tool_key, source_type, read_only, destructive, idempotent, open_world, trust_level, data_access_class, side_effect_class, default_approval_policy, version, mcp_server_connection_id?, active, created_at`.

Unique `(user_id, tool_key, version)`.

## tool_grants
`id, user_id, agent_instance_id, tool_definition_id, scope_id?, permission, approval_policy, valid_from, valid_until?`.

permission=allow/deny. **deny wins**.

## context_packages (P1)
`id, user_id, scope_id, task_id?, work_context_id?, payload jsonb, source_refs jsonb, policy_version, retention_expires_at?, created_at`.

전체 Memory를 복사하지 않고 현재 run에 필요한 정보만 materialize한다.

## agent_runs
`id, user_id, agent_instance_id, workflow_run_id?, context_package_id?, template_version, policy_version, status, max_turns, max_tool_calls, cost_budget_krw?, started_at, ended_at?, created_at`.

## ai_executions
개별 model call.

`id, user_id, agent_run_id?, workflow_run_id?, job_type, provider, model, prompt_version?, input_context_hash, status, input_tokens?, output_tokens?, estimated_cost_usd?, estimated_cost_krw?, fx_rate_snapshot?, latency_ms?, created_at, completed_at?`.

월 AI 비용의 canonical aggregation source.

## tool_calls
`id, user_id, agent_run_id?, workflow_run_id?, tool_definition_id, scope_id?, approval_request_id?, input_hash, status, result_ref?, latency_ms?, error?, created_at, completed_at?`.

Secret/raw private payload를 실행 로그에 무분별하게 저장하지 않는다.

## artifacts (P1)
`id, user_id, artifact_type, title?, task_id?, work_context_id?, source_ai_execution_id?, source_agent_run_id?, content_text?, storage_path?, content_hash?, created_at`.

큰 파일/바이너리는 Supabase Storage를 사용한다.

## mcp_server_connections
`id, user_id, server_label, transport, server_url?, trust_level, auth_secret_ref?, protocol_version?, capabilities jsonb, enabled, created_at, updated_at`.

MCP session 자체에 Amber business state를 저장하지 않는다.

---

# 18. Critical DB Invariants

Migration에서 반드시 구현/테스트한다.

1. **Same-user FK**: child-parent가 같은 user 소유. 가능한 FK는 `(parent_id,user_id)` composite FK로 보강.
2. **Task↔Objective Context**: 둘 다 WorkContext가 있으면 동일해야 함.
3. **Course-only extension**: CourseProfile/Assessment는 kind=course에만 연결.
4. **DailyPlan**: `(user,date,revision)` unique + 하루 approved 최대 1개.
5. **Approved plan immutability**: approved plan의 schedule 구조 직접 수정 금지. replan은 new revision.
6. **Focus**: 사용자당 active session 최대 1개.
7. **Recurring occurrence**: `(activity,period_key,sequence_no)` unique.
8. **Idempotency**: Inbox/Command/Workflow/Job/Notification/Outbox key unique.
9. **LearningCase**: feedback가 가리키는 decision과 LearningCase decision이 동일.

Cross-table CHECK로 표현할 수 없는 2, 3, 5, 9는 DB trigger/constraint trigger로 보강한다.

---

# 19. Index

V1 필수:

### tasks
- `(user_id,status)`
- `(user_id,official_deadline)`
- `(user_id,work_context_id,status)`

### daily_plans
- `(user_id,plan_date)`

### recurring
- `(user_id,active)`
- `(recurring_activity_id,period_key)`

### domain_events
- `(user_id,occurred_at desc)`
- `(user_id,aggregate_type,aggregate_id,occurred_at desc)`
- `correlation_id`
- `workflow_run_id`

### input/external
- `(user_id,parse_status)`
- `(user_id,received_at desc)`
- `(user_id,source,sync_status)`

### personalization
- `(user_id,status,pattern_type)`
- `(user_id,memory_type,created_at desc)`

### workflow/AI
- `(user_id,status,updated_at)`
- `(user_id,created_at desc)` on ai_executions
- `agent_run_id` on ai_executions

실제 query profile 없이 추가 index를 남발하지 않는다.

---

# 20. RLS

Supabase exposed schema의 모든 user-owned table은 RLS를 활성화한다.

기본 사용자 policy:

```text
auth.uid() = user_id
```

profiles는 `auth.uid() = id`.

중요한 구분:

```text
RLS              사용자 간 데이터 격리
AgentScopeGrant  한 사용자 내부 Agent 간 scope 격리
ToolGrant        Agent별 tool 권한
```

Service Role은 서버/Worker에서만 사용하며 client bundle에 절대 노출하지 않는다. Service Role은 RLS를 우회할 수 있으므로 Agent scope/tool 정책은 repository/tool executor에서 별도로 강제한다.

---

# 21. Secrets

Raw secret/token을 application table에 저장하지 않는다.

금지:
- OAuth refresh token
- API key
- Discord Bot token
- Supabase service-role key
- MCP auth token

DB에는 `secret_ref/auth_secret_ref`만 저장한다.

---

# 22. Retention

### Permanent
Decision, DecisionFeedback, Principle, 중요한 Project Memory, Experience.

### Compressible
세부 execution event, 오래된 LearningCase detail.

### Short
ContextPackage, 임시 AI/tool 결과, 중복 raw payload.

압축하더라도 Pattern/Experience가 참조한 source linkage는 유지한다.

---

# 23. Migration Plan

한 giant migration으로 만들지 않는다.

```text
0001_identity_and_scope
0002_goals_work_and_routines
0003_tasks_and_execution
0004_planning_and_events
0005_input_and_integrations
0006_decisions_and_personalization
0007_workflows_and_notifications
0008_agent_platform
0009_rls_constraints_indexes
0010_seed_foundation
```

각 단계 후 local reset/test를 통과한 뒤 다음 migration으로 간다.

---

# 24. Seed

개발용 최소 seed:

```text
User
├ Goal: 학점
├ Goal: 일본어
├ RecurringActivity: 일본어 공부
└ Sample Course / Task
```

실제 개인 데이터와 개발 seed는 분리한다.

---

# 25. Database Tests

반드시 자동 검증:

- 다른 user row 접근 불가
- Objective standalone 가능
- cross-user FK 불가
- CourseProfile이 Project에 연결 불가
- occurrence period/sequence 중복 불가
- invalid Task status 거부
- Task/Objective WorkContext mismatch 거부
- 같은 날짜 approved plan 두 개 불가
- active FocusSession 두 개 불가
- 같은 DomainCommand idempotency 재처리 불가
- DomainEvent correlation 조회 가능
- LearningCase feedback/decision mismatch 거부
- stale Approval resume 차단 가능 구조
- Agent Scope A가 Scope B를 기본 접근하지 않는 구조
- deny ToolGrant 우선

---

# 26. 일부러 넣지 않는 것

- 별도 Vector DB
- embedding table 남발
- 모든 Agent transcript 영구 저장
- microservice별 DB
- A2A protocol state
- MCP session state
- 정확한 학점 예측 모델
- AI 호출마다 전체 Memory 복제

semantic retrieval이 실제 bottleneck이 된 뒤 pgvector를 검토한다.

---

# 27. Supabase 개발 방식

Schema Source of Truth는 Dashboard click가 아니라 Git migration이다.

```text
migration 작성
→ local db reset
→ DB test
→ TypeScript types 생성
→ commit
→ remote dry-run
→ remote push
```

Remote Dashboard에서 즉흥적으로 table을 만들지 않는다.

---

# 28. Database Foundation Definition of Done

- migration을 처음부터 replay 가능
- local `db reset` 성공
- seed 성공
- RLS test 성공
- FK/unique/check/trigger test 성공
- DailyPlan/Focus current state 조회 가능
- Decision→LearningCase→Pattern chain 저장 가능
- Agent Scope/ToolGrant 저장 가능
- duplicate external signal이 중복 mutation을 만들지 않는 구조
- TypeScript DB types 생성 가능
- Git/DB에 raw secret 없음

---

# 29. 이 DB 다음에 무엇을 만드는가

```text
Database
→ Domain Repository
→ Task State Machine / Rules Engine
→ Input Pipeline
→ Discord / Google Calendar
→ AI Gateway
→ Chief
→ Specialist Agent
→ Clone Learning
```

이 순서의 이유는 Agent에게 Tool을 주기 전에 **Agent가 안전하게 읽고 바꿀 세계의 상태**부터 만들어야 하기 때문이다.
