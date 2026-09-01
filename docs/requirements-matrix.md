# Amber HQ Requirements Coverage Matrix

**Status:** Foundation v0.2  
**Purpose:** 사용자 요구사항이 문구로만 남지 않고 Data / Rule / Workflow / Test에 실제로 연결되어 있는지 검증한다.

| 요구사항 | Data / Domain | Rule / Policy | Workflow | 최소 검증 |
|---|---|---|---|---|
| 지금 당장 할 일 1개 | DailyPlan, PlanItem, Task | Current Action 우선 | Morning/Focus | plan에서 current action 산출 |
| Calendar 기반 가용시간 | Constraint, Availability | deterministic only | Morning | fixed event 제외 계산 |
| 아침 추가상황 입력 | Constraint | 이미 알 수 있는 정보 재질문 금지 | Morning | 19시 이후 불가 반영 |
| 계획 승인 후 확정 | DailyPlan | Human authority | Morning | 미승인 plan canonical 금지 |
| 장기목표 학점/일본어 | Goal | Goal protection | Planning | 반복적으로 사라지지 않음 |
| 단기 목표 설정 | Objective | deadline/importance | Planning | Goal/Task 연결 |
| 반복활동 주 N회 | RecurringActivity, ActivityOccurrence | weekly target | Routine Scheduling | 남은 횟수 risk |
| 횟수+예상시간 설정 | RecurringActivity | user setting canonical | Settings/Input | planner capacity 반영 |
| 집안일 관리 | RecurringActivity | life maintenance | Planning | routine occurrence 생성 |
| 일본어 내용까지 준비 | Routine + Context | AI 선행작업 | Execution | 즉시 시작 action 생성 |
| 과목별 공부시간 투자 | Course, Goal | grade allocation | Planning | 취약 과목 시간 증가 가능 |
| 점수 수동 입력 | Course assessment | explicit input | Input | provenance=user |
| Task 자연어 입력 | InboxItem, ParsedEntity | parse only, validate | Input | task/calendar 분리 |
| 매번 설명하지 않기 | Memory, ContextPackage | relevant context only | Agent Run | project context 재사용 |
| AI가 먼저 조사/초안 | Artifact/ToolCall | low-risk auto | Specialist Run | user work minutes 감소 |
| 전체 Flow 먼저 확인 | TaskStep | direction checkpoint | Focus | 시작 전 full flow |
| 그 뒤 한 단계씩 | TaskStep | current step focus | Focus | one active step |
| Focus 중 일반 알림 숨김 | Notification | focus notification tier | Focus | non-urgent suppressed |
| 막힘 원인별 개입 | Event, InterventionPattern | route by reason | Recovery | reason→intervention |
| 작업 전환 시 한 번 붙잡기 | TaskEvent | soft guardrail | Focus Switch | second insist allows |
| 실제시간 기반 재계획 | FocusSession | deterministic delta first | Replan | large conflict escalates |
| 남는시간=무조건 일 추가 금지 | PlanItem | rest/buffer candidates | Replan | rest 선택 가능 |
| 휴식 선언 시 DND | Constraint, Notification | DND | Planning | normal notification suppressed |
| Day Close 자동 정리 | Events, DailyPlan | no repeat reporting | Day Close | unfinished + summary |
| 기상 목표와 반복 깨우기 | ScheduledJob | escalation | Wake | ack cancels retries |
| 큰 우선순위는 사용자 | StrategicDirective | Human authority | Planning | directive wins |
| 포기 기본 후보 금지 | Objective/Task | scope reduction first | Replan | abandon auto 금지 |
| AI 결과는 최고 품질 | AIJob/Artifact | quality not intentionally lowered | Worker | 범위 축소와 품질 분리 |
| 제출 전 사용자가 전체 검토 | Approval/Task | final responsibility | Execution | external submit 자동 금지 |
| 판단 수정 시 왜 묻기 | DecisionFeedback | reason capture | Decision | reason 저장 |
| Pattern 자동 발견 | Pattern, Evidence | evidence required | Learning | evidence_count |
| Principle 승인 후 저장 | Principle | explicit approval | Learning | pending→approved |
| 실제 방식 vs 원하는 방식 분리 | Pattern, Principle | Desired > observed | Personalization | bad habit 자동복제 금지 |
| Agent 신규 추가 시 기존 무변경 | AgentTemplate/Instance | additive contract | Registration | regression test |
| Chief 중심 Agent 운영 | AgentRun | manager pattern | Specialist Run | specialist 직접 spam 금지 |
| Agent별 Memory 격리 | ToolGrant/ContextPackage | least privilege | Agent Run | cross-project isolation |
| 코드 가능한 건 AI 금지 | AIUsage | deterministic first | 모든 workflow | AI call count 검증 |
| 월 AI 비용 제한 | AIUsage/UserSettings | budget policy | AI Gateway | 월 누적 추적 |
| MCP 외부 도구 표준화 | ToolDefinition/MCPConnection | MCP at boundary | Tool Resolve | core가 MCP 의존 안 함 |
| 외부 Tool 위험 승인 | ToolDefinition/ApprovalRequest | risk policy | Tool Call | destructive 승인 |
| 장기 workflow 재개 | WorkflowRun | checkpoint/resume | Approval | process 종료 후 resume |
| 중복 자동화 방지 | InboxItem/WorkflowRun | idempotency | Sync/Scheduler | duplicate event 1회 처리 |
| 정보 출처 구분 | Provenance | explicit > inferred | Input/Memory | AI inference fact 금지 |
| 성장 분석 | Event/Outcome | planning improvement only | Review | 실행/재시작 지표 |
