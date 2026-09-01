# Amber HQ Requirements Coverage Matrix

**Status:** Foundation v0.3

| 요구사항 | Data / Domain | Rule / Policy | Workflow | 최소 검증 |
|---|---|---|---|---|
| Current Action | DailyPlan, PlanItem, FocusSession | derived | Morning/Focus | stale pointer 없음 |
| Plan 승인/수정/재승인 | DailyPlan revision | immutable/supersede | Planning/Replan | 과거 plan 보존 |
| Calendar capacity | ExternalReference, Constraint | deterministic | Morning | work block 이중차감 없음 |
| Goal / Objective | Goal, Objective | 별도 entity | Planning | standalone Objective 가능 |
| Project / Course | WorkContext | Task context 최대 1개 | 모든 업무 | 중복 FK 없음 |
| 과목 평가 | CourseAssessment | grade allocation | School | score/submission 저장 |
| 반복활동 | RecurringActivity, Occurrence | weekly target owner=activity | Routine | period_key 중복 없음 |
| Task 자연어 입력 | Inbox, ParsedEntity, DomainCommand | idempotent mutation | Input | 부분 retry 중복 없음 |
| 외부 수정/삭제 | ExternalReference | version/tombstone | Sync | stale/delete 처리 |
| 완료 자동 감지 | DomainEvent/provenance | integration>user>ask | Execution | 중복 완료 없음 |
| Focus | TaskStep, FocusSession | active session 1개 | Focus | pause history 보존 |
| Blocked/Recovery | LearningCase | route by reason | Recovery | intervention outcome |
| Dynamic Replan | DailyPlan revision | code first | Replan | 큰 변경만 승인 |
| Day Close | Events/Plan | no repeat reporting | Day Close | 미완료/요약 |
| Wake | Notification/Workflow | idempotent | Wake | ack 후 retry 취소 |
| Why 수집 | DecisionFeedback | reason capture | Decision | LearningCase 연결 |
| Pattern 근거 | PatternEvidence | supports/contradicts | Learning | evidence 추적 |
| Principle | Principle | explicit approval | Learning | 자동 승격 금지 |
| 새 Project onboarding/close | WorkContext, Memory | prefill/archive | Lifecycle | 학습 보존 |
| Agent 추가 | Template/Instance/Scope | additive only | Registration | 기존 Core 무변경 |
| Agent 격리 | Scope/Grant | least privilege | Agent Run | cross-scope 차단 |
| Durable 승인 | WorkflowRun/Approval | checkpoint/idempotency | Approval | stale 승인 차단 |
| AI 비용 | AIExecution | gateway only | AI | 월 누적 가능 |
| AI 산출물 | Artifact | provenance | Specialist | Task/Context 연결 |
| MCP | ToolDefinition | boundary only | Tool Resolve | Core MCP 비종속 |
