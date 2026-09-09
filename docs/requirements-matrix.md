# Amber HQ Requirements Coverage Matrix

**Status:** Foundation v0.3.2
**Purpose:** canonical Foundation 요구사항을 Data / Rule / Workflow / Minimum Test로 연결하는 Freeze checklist다.

## Task / Execution

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Task State Machine | Task, DomainEvent | 상태 전환은 Core Domain만 수행 | Execution | 허용·금지 전환 검증 |
| 상태 전환 Event | DomainEvent | 모든 중요 전환은 append-only event 생성 | Execution | 전환과 event가 함께 기록됨 |
| Task completion 자동 확인 | Task, DomainEvent, provenance | 신뢰 가능한 integration 완료를 우선 | Execution | 중복 완료 event 없음 |
| Task completion 수동 확인 | Task, DomainEvent | 사용자 명시 완료를 canonical로 반영 | Execution | manual 완료가 DONE으로 전환됨 |
| 전체 Flow 먼저 확인 | Task, TaskStep | 실행 전 목표·완료기준·전체 단계 확인 | Focus | 확인 전 Focus 시작 금지 |
| 현재 Step 집중 | TaskStep, FocusSession | 한 번에 현재 Step 하나 | Focus | active step 최대 1개 |
| Task Switch Guardrail | FocusSession, DomainEvent, DailyPlan | 영향 경고 1회 후 사용자 전환 허용 | Focus/Replan | pause history와 switch event 보존 |
| Blocked / Recovery | Task, FocusSession, LearningCase | reason별 deterministic route | Recovery | reason→intervention→resume/outcome 연결 |
| 실제시간 기록 | FocusSession, ActivityOccurrence | 실제 실행시간을 session/occurrence에 기록 | Focus/Day Close | actual minutes 집계 가능 |
| Estimate Revision | EstimateRevision, Task | user/ai/system origin별 revision 보존 | Planning/Execution | initial·수정 estimate 이력 보존 |

## Morning / Planning

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| `일어남` Trigger | WorkflowRun, DomainEvent | wake acknowledgment 후 Morning 시작 | Wake/Morning | Wake retry 종료 후 Morning 생성 |
| Calendar 조회 | ExternalReference | fixed schedule은 iCloud Calendar primary, Google Calendar optional read-only | Morning | 지정 범위 일정이 planning input에 포함됨 |
| Morning 추가상황 입력 | InboxItem, ParsedEntity | 시스템이 알 수 없는 정보만 요청 | Morning/Input | 불필요한 재질문 없음 |
| 추가상황 → Constraint | Constraint, provenance | daily context를 유효기간 있는 Constraint로 normalize | Morning | work-until·condition 반영 |
| Daily Capacity 계산 | Availability, Constraint, ExternalReference | deterministic only | Morning/Planning | fixed event와 constraint 제외 계산 |
| 최초 Plan 승인 | DailyPlan, ApprovalRequest | 최초 Morning Plan은 사용자 승인 필요 | Planning | proposed plan이 승인 전 canonical 아님 |
| Plan revision / supersession | DailyPlan, PlanItem | immutable revision, 기존 plan 보존 | Replan | revision과 supersedes 관계 보존 |
| minor replan 자동 처리 | DailyPlan | 같은 우선순위의 low-risk shift만 policy 승인 | Replan | 단순 shift가 새 revision 생성 |
| significant replan 승인 | DailyPlan, ApprovalRequest | 우선순위·Goal·deadline·외부 영향 변경은 승인 | Replan | 중요 변경이 waiting_for_user로 전환 |
| Current Action derived | DailyPlan, PlanItem, FocusSession | active FocusSession 우선, 다음 미완료 항목 순 | Morning/Focus | stale mutable pointer 없음 |
| Day Close | WorkflowRun, DailyPlan, DomainEvent | 수행 자동 집계 후 미완료 재계획 | Day Close | 완료·미완료·actual·Decision 재구성 |

## Goal / RecurringActivity / Life

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Long-term Goal protection | Goal, RecurringActivity, DailyPlan | 마감이 없다는 이유로 반복 제거 금지 | Planning/Replan | 반복 누락 시 보호 후보 생성 |
| StrategicDirective | StrategicDirective | 현재 지시·유효 directive를 과거 Pattern보다 우선 | Planning | 유효기간과 우선순위 적용 |
| RecurringActivity 주간 횟수 | RecurringActivity, ActivityOccurrence | target_count와 period_key로 계산 | RecurringActivity Scheduling | 남은 횟수 deterministic 계산 |
| expected minutes | RecurringActivity | 사용자 설정값을 capacity에 반영 | Planning | occurrence 예상시간 반영 |
| minimum minutes | RecurringActivity, ActivityOccurrence | optional minimum 기준 | Execution | minimum 이상 완료 처리 |
| partial completion | ActivityOccurrence | minimum 미달은 partial | Execution | partial이 target 완료로 오계산되지 않음 |
| RecurringActivity risk | ActivityOccurrence, Availability | 남은 횟수·적합 일수·가용시간 계산 | Planning | LOW/MEDIUM/HIGH 경계 검증 |
| occurrence 중복 방지 | ActivityOccurrence | activity/period/sequence unique | Scheduling | retry 후 occurrence 1개 |
| Rest protection | PlanItem, Constraint | 남는 시간에 무조건 Task 추가 금지 | Planning/Replan | rest 후보 유지 가능 |
| Buffer | PlanItem, UserSettings | 계획 buffer를 capacity와 replan에 반영 | Planning/Replan | buffer 흡수 후 revision 생성 |
| DND | Constraint, Notification | 내부 상태 갱신은 계속하고 일반 알림 억제 | Notification | suppressed와 사유 기록 |
| 개인시간 Constraint | Constraint | 불확실한 개인시간에 중요 Task 과의존 금지 | Morning/Planning | 개인시간 제외 capacity 계산 |

## School

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| CourseAssessment | WorkContext, CourseProfile, CourseAssessment | Course 전용 평가 구조 | School | 평가 유형·비중·일정 저장 |
| 시험/퀴즈 점수 입력 | CourseAssessment, provenance | user_explicit 점수 우선 | Input/School | 점수·만점·출처 저장 |
| 과목별 시간 투자 | CourseAssessment, FocusSession | 취약도·평가·실제시간 기반 배분 | Planning | 취약 과목 투자 증가 가능 |
| 학습형 vs 산출물형 과제 | Task, TaskStep | 학습 목적과 결과물 생산을 구분 | Input/Execution | 유형에 따라 owner·flow가 달라짐 |
| 학습형 과제 이해 보호 | TaskStep | 사용자가 이해해야 할 부분을 user owner로 유지 | Execution | AI가 핵심 학습 Step을 대체하지 않음 |

## Input / Integration

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Natural Language Input | InboxItem, ParsedEntity | AI는 parse만 하고 DB 직접 수정 금지 | Input | Task/Calendar 후보 분리 |
| Inbox → ParsedEntity → DomainCommand | InboxItem, ParsedEntity, DomainCommand | validation 후 command 실행 | Input | invalid payload mutation 금지 |
| provenance | InboxItem, DomainEvent, ExternalReference | 모든 자동 발견 정보에 출처 유지 | Input/Sync | 원본까지 역추적 가능 |
| user_explicit / ai_inferred 구분 | provenance, Preference, Pattern | 직접값과 추론값을 혼합하지 않음 | Input/Learning | AI inference가 Fact로 저장되지 않음 |
| user explicit 우선 | UserSettings, provenance | 충돌 시 사용자 명시값 우선 | Input/Planning | inferred 값이 explicit 값을 덮지 않음 |
| deduplication | InboxItem, DomainCommand | stable dedupe/idempotency key 사용 | Input/Sync | 부분 retry 후 mutation 1회 |
| external create/update/delete | ExternalReference, DomainCommand | 같은 reconciliation pipeline 사용 | Sync | create/update/tombstone 검증 |
| stale/conflict | ExternalReference | 자동 덮어쓰기 대신 상태·provenance 유지 | Sync/Input | stale/conflict가 사용자 확인으로 연결 |
| Fixed Event / Amber Work Block | ExternalReference, PlanItem | provenance로 두 종류 구분 | Calendar/Planning | capacity 이중 차감 없음 |
| integration failure | WorkflowRun, ExternalReference | 실패가 Core state 손실로 이어지지 않음 | Sync/Planning | stale 표시·retry 가능 상태 유지 |

## Decision / Clone / Memory

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Decision Compression | Decision | 사용자 판단이 필요한 것만 압축 | Decision | question/options/recommendation/impact 존재 |
| AI 추천 수정 | DecisionFeedback | correction을 원 추천과 연결 | Decision | decision FK 보존 |
| Why 수집 | DecisionFeedback | 수정 이유를 짧게 저장 | Decision | user_reason 누락 방지 |
| LearningCase | LearningCase, DomainEvent, Outcome | context·recommendation·행동·결과 연결 | Learning | 한 사례 전체 재구성 |
| PatternEvidence | PatternEvidence, LearningCase | LearningCase 기반 supports/contradicts | Learning | direct polymorphic evidence FK 없음 |
| Pattern Candidate | Pattern | `status=candidate`, 별도 entity 없음 | Learning | 한 사례로 Principle 자동 생성 금지 |
| Principle 승인 | Principle, ApprovalRequest | 사용자 승인 후에만 활성 | Learning/Approval | 미승인 Principle 적용 금지 |
| Observed vs Desired | Pattern, Principle, StrategicDirective | Desired가 observed 행동보다 우선 | Personalization/Planning | 나쁜 습관 자동 복제 금지 |
| Intervention learning | LearningCase(`case_type=intervention`), LearningCaseEvent, Outcome, Pattern | 막힘·개입·재시작·완료 결과를 기존 learning chain으로 연결 | Recovery/Learning | restart latency와 outcome 조회 |
| Workstyle 적용 | WorkstyleProfile | active global + agent profile의 revisioned instruction configuration 적용 | Agent Context Resolve | scope별 active profile 최대 1개와 적용 revision 추적 |
| Memory category별 권한 | Memory, Principle, provenance | Fact/Decision/Experience/Principle별 authority | Learning/Review | category별 자동 저장 허용 범위 검증 |
| retention/compression | Memory, DomainEvent, source_reference | 상세 로그 압축 시 중요 근거 보존 | Review | 압축 후 원본 reference 추적 |

## Agent

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Chief manager pattern | AgentTemplate, AgentRun | specialist는 기본적으로 Chief가 호출 | Specialist Run | specialist가 사용자에게 직접 spam하지 않음 |
| additive extension | AgentTemplate, AgentInstance, Scope | config/capability 등록으로 추가 | Registration | 기존 Core/Agent 수정 없음 |
| AgentTemplate version | AgentTemplate | 기존 instance 자동 migration 금지 | Registration | version별 behavior 재현 |
| AgentInstance scope | AgentInstance, Scope | home_scope와 추가 grant 사용 | Agent Run | 다른 scope 기본 차단 |
| Memory isolation | AgentScopeGrant, ContextPackage | 허용 scope Memory만 조회 | Context Resolve | cross-project Memory 차단 |
| Context isolation | Scope, ContextPackage | 필요한 context만 주입 | Context Resolve | prohibited scope 누락 확인 |
| ToolGrant | ToolGrant, ToolDefinition | grant된 Tool만 resolve | Tool Resolve | grant 없는 Tool 거부 |
| forbidden tool rejection | ToolCall, ToolGrant | 실행 전에 deterministic policy 적용 | Agent Run | 금지 Tool side effect 없음 |
| max turns | AgentRun | run snapshot 한도 적용 | Agent Run | 초과 시 중단 |
| max tool calls | AgentRun | run snapshot 한도 적용 | Agent Run | 초과 Tool 호출 거부 |
| cost budget | AgentRun, AIExecution | budget 초과 loop 금지 | Agent Run | 초과 시 종료/escalation |
| template_version | AgentRun | 실행 version 기록 | Agent Run | 과거 run 재현 |
| policy_version | AgentRun | 실행 policy version 기록 | Agent Run | 승인/권한 정책 재현 |

## Tool / MCP / Security

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| MCP external boundary | ToolDefinition, MCPServerConnection | MCP는 외부 capability 연결에만 사용 | Tool Resolve | 내부 state machine MCP 비사용 |
| Core MCP 비종속 | Core Domain | Rules/State/Planning은 내부 Domain 소유 | 모든 Core Workflow | MCP 없이 Core unit test 가능 |
| Tool risk metadata | ToolDefinition | read/write/destructive/open-world risk 저장 | Tool Resolve | risk별 approval 계산 |
| external write approval | ToolDefinition, ApprovalRequest | 외부 전송·제출·삭제 승인 필요 | Tool Call/Approval | 승인 없는 side effect 차단 |
| prompt injection boundary | provenance, ContextPackage | untrusted content를 instruction으로 실행 금지 | Context Resolve/Tool Call | 공격 문자열이 Tool 권한을 확대하지 않음 |
| least privilege | Scope, ToolGrant | 필요한 최소 data/tool만 허용 | Agent Run | 과도한 grant 차단 |
| private+untrusted+external 위험 | ToolDefinition, ToolGrant, ApprovalRequest | 고위험 조합 축소·승인·sandbox | Agent Run | 민감정보 외부 유출 경로 차단 |

## Automation / Notification

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| WorkflowRun | WorkflowRun, DomainEvent | 중요한 workflow 상태 지속 저장 | 모든 Workflow | process 종료 후 상태 조회 |
| ApprovalRequest | ApprovalRequest, WorkflowRun | risky action checkpoint 저장 | Approval | pending/approved/rejected lifecycle |
| long wait resume | WorkflowRun, ApprovalRequest | process를 유지하지 않고 checkpoint 재개 | Approval | 장시간 뒤 동일 step resume |
| stale approval rejection | ApprovalRequest | checkpoint version·precondition 재검증 | Approval | 변경된 action 실행 차단 |
| idempotency | WorkflowRun, DomainCommand, DomainEvent | stable key로 duplicate side effect 방지 | Automation | 동일 trigger 결과 1회 |
| retry | ScheduledJob, WorkflowRun, Notification | failure state와 retry policy 유지 | Automation | retry 후 상태 일관성 |
| notification dedupe | Notification | logical notification dedupe key 사용 | Notification | 중복 발송 방지 |
| Wake retry | Notification, ScheduledJob, WorkflowRun | attempt별 기록, acknowledgment 후 중단 | Wake | ack 뒤 추가 발송 없음 |
| Focus suppression | Notification, FocusSession | 일반 알림 suppressed 기록 | Focus/Notification | suppression_reason 저장 |
| DND suppression | Notification, Constraint | DND 중 일반 알림 억제 | Notification | DND 종료 후 상태 정상화 |

## AI / Context

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| deterministic-first | Rules Engine, AIExecution | 코드·SQL·Rule 우선 | 모든 Workflow | deterministic case AI 호출 0회 |
| 코드 계산에 AI 금지 | Rules Engine | 날짜·시간·상태·합산·단순 replan은 code | Planning/Execution | AI call count 검증 |
| AI Gateway | AIExecution | 모든 model call은 중앙 Gateway 통과 | AI | Gateway 밖 provider 호출 없음 |
| AIExecution | AIExecution | model call 단위 token/cost 기록 | AI | job/model/token/cost 저장 |
| 월 비용 추적 | AIExecution, UserSettings | AIExecution 합산을 budget과 비교 | AI/Review | 월 누적 비용 계산 |
| Run/AI/Tool/Artifact 구분 | AgentRun, AIExecution, ToolCall, Artifact | 실행 책임과 producer 분리 | Agent Run | trace 전체 연결 가능 |
| ContextPackage 최소화 | ContextPackage, Scope | 현재 Task에 필요한 context만 포함 | Context Resolve | unrelated Memory 제외 |
| 전체 Memory 전달 금지 | ContextPackage | structured relevant retrieval만 허용 | Agent Run | full Memory dump 없음 |
| structured AI output | AIExecution, DomainCommand | Zod validation 후 Domain mutation | AI/Input | invalid output DB write 금지 |

## Project Lifecycle

| Requirement | Data / Domain | Rule / Policy | Workflow | Minimum Test |
|---|---|---|---|---|
| Project onboarding | WorkContext, WorkflowRun | 필요한 정보 판단 후 batch review | Project Onboarding | 승인 전 context 미확정 |
| pre-filled brief | ContextPackage, Artifact | 공개 정보와 기존 context로 먼저 준비 | Project Onboarding | 이미 아는 정보 재질문 없음 |
| Project PM Agent | AgentInstance, Scope | onboarding 후 기본 생성, toggle 허용 | Registration | project home scope로 생성 |
| Project 종료/archive | WorkContext, AgentInstance | 종료 후 context와 Agent archive | Project Lifecycle | active planning에서 제외 |
| Decision/Result/Learning 보존 | Decision, Outcome, Memory | 종료 시 핵심 기록 압축·보존 | Project Close | Situation→Result→Learning 조회 |


## Product Closed-loop Gaps — 2026-09-09

| Capability | Current status | 다음 acceptance boundary |
|---|---|---|
| Goal/Project work → Planning | 기존 연결 Task의 상태/마감/중요도 반영 | Task 없는 목표의 업무 발견·제안·승인 |
| Project execution → project review | effective WorkContext 조회 및 Task event 연결 | gap/backlog proposal → next iteration |
| AI work → Artifact | schema만 준비, 생성 실행 미구현 | 권한 검사·실행·실패·재시도·결과 연결 |
| Decision Why → Project/Career reuse | 일일 학습 chain 구현, PM 경로 미구현 | 결정별 근거·행동·결과 및 scope 조회 |
| UI → durable Core state | 미리보기만 구현 | 인증→Core mutation→reload 후 상태 유지 |
