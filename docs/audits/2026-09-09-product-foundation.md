# Amber HQ Product Foundation Audit — 2026-09-09

## Executive Verdict

**PARTIAL**

기존 Core와 Supabase 관계를 유지하면서 제품 방향으로 확장할 수 있다. 전면 재설계가 필요한 WRONG_ABSTRACTION은 확인하지 못했다.
Daily 실행·승인·이벤트·학습은 실제 코드가 있지만, Project Leadership와 AI Execute는 아직 닫히지 않았다.
이번에는 Goal/Project Planning 연결, Objective 경유 프로젝트 조회, 오래된 Replan 승인/거절을 수정했다.
Agent/Decision/Workflow 테이블이 존재한다는 사실을 완성된 자동화로 평가하지 않았다.
Web은 예시 데이터 미리보기이며 실제 Control Plane은 미구현이다.

## Audit method / scope

사용자가 제공한 제품 목적을 우선하여 root/Web AGENTS, Foundation 문서, Home planning 문서,
전체 source 파일 목록, 0001–0012 migration 구조, 관련 Core/Integration/Worker/Web 구현과 회귀 테스트를 검토했다.
Root README는 없다. 빌드된 dist에만 남아 있는 research 코드는 source 구현으로 세지 않았다.
기존 branch는 `feat/home-command-center-v1`, 시작 시 tracked 변경은 없었고 `.agents/`, `openspec/`는 untracked였다.
외부 계정에서 실제 Calendar/Notion/학교 자료를 가져오거나 Discord 메시지를 보내지 않았다.

## Architecture Map

| 경계 | 실제 구조 / 근거 |
|---|---|
| Core Domain | `packages/core/src/task`, `rules`, `focus`; Task 상태 전환과 event, 시간/용량 deterministic 계산 |
| Planning | `morning`, `replan`, `execution/current-action.ts`; 승인 revision과 Focus에서 Current Action 파생 |
| Project | `work_contexts` + `objectives` + `tasks`; `project-pm`은 scoped 현황 보고 |
| Execution | `FocusSession`/`TaskStep` + completion/block/switch event, Replan/Day Close |
| Agent/Automation | `agent-bootstrap`, `supabase-agent-run-recorder`; built-in Chief/PM read-only 실행 기록; WakeScheduler 실제 동작 |
| Approval | `workflow_runs`, `approval_requests`, 각 repository transaction; checkpoint/version과 plan base 확인 |
| Learning | `decision-learning` → `pattern-learning` → `principle-approval` → `principle-application` |
| Decision Memory | DecisionFeedback.user_reason, LearningCase/Event/Outcome/PatternEvidence; 일반 Memory schema |
| Integrations | iCloud/Google read-only Calendar adapter와 reconciliation, Discord composition root, Input structured-output provider |
| UI Control Plane | Next Home은 `homeFallbackData` + React local state; 인증된 Core API 연결 없음 |

## Audit 결과

| 영역 | 판정 | 근거와 한계 |
|---|---|---|
| A Personal Chief | INCOMPLETE | Calendar/Constraints/Task/RecurringActivity → 계획은 실제 동작. 이번에 연결 Goal/Objective/Project 상태·마감·중요도를 반영. 업무 없는 Goal의 자동 업무 생성/주간 workload는 없음 |
| B Project Management | INCOMPLETE | 공통 WorkContext와 Objective/Task를 재사용할 수 있음. 현황 조회가 중심이며 gap/backlog 생성·검토/iteration 이력·sprint 운영은 없음 |
| C Daily Execution | GOOD | Focus/완료/막힘/전환/Replan/Day Close와 durable event가 구현됨. Web 사용 가능성과 일반 AI 실행까지 GOOD라는 뜻은 아님 |
| D Agent / Automation | INCOMPLETE | AgentRun/AIExecution/ToolCall/Artifact는 분리됨. 현재 Chief/PM은 조회, Input은 parse model call. 조사/초안 생성 dispatcher와 통합 ToolGrant enforcement는 없음 |
| E Approval | INCOMPLETE | Daily revision lifecycle은 구현되어 있고 이번에 오래된 base를 차단. arbitrary tool 외부 write의 승인/resume runner는 없음 |
| F University | INCOMPLETE | CourseProfile/Assessment/linked_task_id와 Inbox/ExternalReference가 확장 기반. 강의·녹음 통합, 과목 정책, Notion output, 제출 추적 workflow는 없음 |
| G Hackathon Workflow | MISSING | 재사용 가능한 WorkflowRun checkpoint 저장은 있으나 discovery부터 pitch까지 실행 가능한 capability 연결이 없음 |
| H Personalization | INCOMPLETE | 일일 피드백 기반 학습 및 승인 deadline preference의 실제 재사용 있음. PM 판단/가치관/추정시간/Recovery 개인화는 제한적 또는 미구현 |
| I Decision Memory | INCOMPLETE | Why와 learning FK chain은 적절함. 현재 MaterialDecisionType은 세 가지 Daily 결정으로 제한, Project별 결정/행동/결과/Career retrieval 미구현 |
| J UI Control Plane | CONFLICT | Home의 로컬 완료·타이머·재계획 표현이 실제 Core 상태처럼 보임. 미리보기 고지를 추가했지만 durable control plane은 아직 없음 |
| K Extensibility | INCOMPLETE | WorkContext/Objective/Scope는 재사용 가능. built-in agent type과 Chief→PM 호출은 고정되어 config만으로 임의 specialist를 실행하지 못함 |

## 발견한 핵심 구조 문제

### P0

- **Goal/Project 의미가 Planning에서 소실됨 — 수정.** Task FK는 있지만 부모 상태·Objective 마감·Goal 중요도를 읽지 않았다.
- **Objective 경유 Project Task가 PM에서 누락됨 — 수정.** canonical effective WorkContext와 실제 query가 달랐다.
- **Project leadership와 AI Execute가 제품 운영 경로에 없음 — 후속 capability.** 기존 entity 선택이 잘못된 문제보다는 미구현이다. 이번 감사에서 전체 domain 기능을 일괄 생성하지 않았다.

### P1

- **오래된 Replan 승인/거절이 최신 계획에 영향을 줄 수 있음 — 수정.** 거절 시 superseded base 복원, 승인 시 현재 base 확인 누락.
- **Control Plane은 화면 prototype — 표시 수정, API 연결 후속.** 인증/Domain mutation/reload 확인 없이 CRUD나 timer를 UI 상태로 구현하면 parallel runtime이 된다.
- **Decision Learning 인과 근거의 범위가 큼 — 후속.** `createLearningCasesForDay`는 해당 날짜의 여러 실행 결과를 각 결정에 연결한다. 프로젝트 의사결정의 결과로 일반화하기 전에 대상 Task/action 연결이 필요하다.
- **AI Execute 운영 안전성 — 후속.** 기록 실패를 무시하는 읽기 보고 패턴을 외부 side effect에 재사용하면 안 된다. 승인/권한/작업 identity/durable 실패와 재시도를 함께 닫아야 한다.
- **Planning remaining gaps — 후속.** StrategicDirective는 ID 매칭의 우선 가산만 있고 배열 순서 전체를 반영하지 않는다. Chief fallback의 별도 후보 선택과 canonical Planning 간 정책 일치, 반복활동 week-start, Task 없는 목표 업무 생성도 필요하다.

### P2

- Foundation freeze와 schema-ready 표기가 실제 구현 상태와 혼동됨 — 역사적 표시로 수정.
- Root lint가 `.next` 생성물까지 검사하여 실패. `dist` 일부가 Git 추적 중이며 root build/typecheck는 Web을 포함하지 않는다.
- Agent 플랫폼에는 runtime보다 먼저 만들어진 테이블이 있지만 삭제/rewrite 근거는 부족하다. 새 플랫폼 layer보다 한 실행 capability로 검증할 것.
- Dependency/sprint/versioned project review 모델은 실제 첫 Project loop 구현 요구에 맞춰 최소 추가할 것.

## 이번에 수정한 구조

### 1. Existing work → Planning

- Before: Task 필드만 순위 계산에 사용.
- Problem: Goal/Objective/Project를 관리해도 계획에 일부 변화가 전달되지 않음.
- After: MorningObservation에 기존 관계의 최소 사실을 추가하고 `resolvePlanningWork`를 Morning/Replan impact에서 공유. 비활성 부모 제외, Objective 날짜의 사용자 timezone 마감, 중요도 최댓값, 부모 ID directive 적용, input snapshot과 replan hash 반영.
- Why: Task DB를 덮어쓰거나 별도 ProjectTask 모델 없이 기존 업무를 계획으로 연결한다.

### 2. Project execution readback

- Before: `Task.work_context_id` 직접 연결만 조회.
- Problem: Objective에만 프로젝트를 연결하면 Task/Focus/approved PlanItem/event가 PM에서 사라짐.
- After: owner-qualified Objective join과 `coalesce(task.work_context_id, objective.work_context_id)`를 모든 관련 조회에 적용.
- Why: Daily 실행 결과를 같은 프로젝트 맥락에서 조회할 수 있도록 canonical 관계를 준수한다. Task 완료를 Project 출시로 자동 판정하지는 않는다.

### 3. Replan base preservation

- Before: 오래된 proposal 승인 가능, 거절 시 superseded base를 approved로 복원 시도.
- Problem: 더 최신의 사용자 승인 계획을 교체하거나 approved unique constraint 충돌.
- After: 승인 transaction에서 base를 lock/revalidate; 거절은 proposal만 종료하고 base를 되살리지 않음.
- Why: 기존 approved → proposal → 승인 후 supersession이라는 lifecycle 보존.

### 4. Product boundary / documentation

- Before: Web의 local 완료·재계획과 문서 freeze가 운영 완료처럼 보일 수 있음.
- Problem: prototype를 durable Control Plane으로 오인.
- After: Home 미리보기·미저장 고지; canonical 문서에 Project loop, Execute, 실제 구현 한계, 물리 DailyPlan status 정합성 반영.
- Why: 화면이나 테이블의 존재를 실제 end-to-end capability와 구분한다.

## 수정하지 않고 남긴 것

- Project gap/backlog 생성·승인·iteration review: 읽기 PM에서 한 vertical slice로 확장해야 하므로 후속.
- 실제 research/document agent: provider 공통 경계, 권한, Artifact, retry를 함께 구현해야 하므로 후속.
- Project Decision/Career: 일일 결과를 그대로 일반화하지 않고 결정별 action/outcome과 scope 조회를 먼저 구현.
- School/Notion/음성 및 Hackathon 단계 전체: 현재 adapter와 실행 capability가 없고 여러 제품 기능을 동시에 추가하게 됨.
- UI 전체 CRUD: 인증된 서버 경계와 Core service 연결부터 시작. 기존 prototype layout은 보존.
- DB의 모든 immutable history/동시성 경계와 모든 legacy JSON shape를 전면 hardening하지 않음. 이번 회귀 범위는 Planning 입력과 승인 기반 보존.

## 제품별 최종 판정

| 질문 | 판정 | 이유 |
|---|---|---|
| 1 Personal Chief | PARTIAL | 이미 입력된 업무의 계획·실행은 가능. 자동 업무 발견과 운영 UI는 미완성 |
| 2 OURMAP project leadership | PARTIAL | 프로젝트 업무와 Daily 실행의 기반은 있음. 지속 관찰→gap→출시 리딩은 없음 |
| 3 LogFolio PM support | PARTIAL | 동일 Core 재사용 가능. Agile iteration과 PM/Business 산출물 실행 없음 |
| 4 University automation | PARTIAL | Course/Task/입력/Artifact 기반은 있음. 강의 자료→학습/초안 자동화 미구현 |
| 5 Hackathon automation | PARTIAL | 기존 checkpoint/approval 구조로 확장 가능. 실행 workflow 자체는 MISSING |
| 6 Personalization / Decision Memory | PARTIAL | Why와 learning chain 및 제한적 실제 재사용 있음. 프로젝트/커리어 재사용 없음 |
| 7 UI Control Plane | NO | 현재 UI는 미리보기, 실제 주요 상태 조회·수정 API 없음 |

PARTIAL은 해당 제품이 현재 운영 가능하다는 의미가 아니라, 기존 foundation을 재사용하면서 빠진 capability를 추가할 수 있다는 의미다.

## 변경 파일

- `packages/core/src/morning/{morning.ts,planning-work.ts,morning-planner.ts,supabase-morning-repository.ts}` 및 관련 테스트
- `packages/core/src/replan/{replan-service.ts,replan-impact.ts,supabase-replan-repository.ts}` 및 관련 테스트
- `packages/core/src/project-pm/supabase-project-pm-repository.ts` 및 관련 테스트
- `apps/web/app/page.tsx`
- `docs/{architecture,domain-model,database-schema,workflows,product-rules,agent-contract,personalization,foundation-status,requirements-matrix}.md`
- 본 감사 보고서

## Database / Migration

새 table, dependency, migration 없음. 기존 migration 수정 없음. 로컬 DB 테스트는 임시 사용자 fixture를 생성·정리한다.
계획의 derived 마감·중요도는 Task 원본을 변경하지 않고 기존 input_snapshot에 보존한다.

## Tests

- 전체 `pnpm test`: **45 files / 318 tests passed**, 로컬 Supabase 포함.
- 변경 Core source 및 Home page ESLint: 통과.
- `pnpm lint`: 실패. 기존 `.next` 생성물 검사에서 11,392 problems. 이 실패를 통과로 처리하지 않았다.
- `pnpm typecheck`, `pnpm build`: 통과.
- `pnpm --filter @amber/web typecheck`, `pnpm web:build`: 통과.
- `git diff --check`: 통과.
- 추가 회귀: Goal/Objective/Project 상태·마감·directive, DB→Planning, Goal 중요 작업 제거 승인, Objective 경유 PM/Focus/event 조회, 오래된 proposal 승인 차단 및 거절 시 최신 계획 보존.
- 브라우저 수동 E2E 및 외부 계정 실사용은 수행하지 않음. 실제 Control Plane이 아직 없으므로 UI DB mutation 검증을 주장하지 않음.

## Commits / Git Status

Commit/push/branch 변경 없음. 변경은 검토 가능한 working tree로 남긴다.
기존 untracked `.agents/`, `openspec/` 보존. 새 source helper와 본 보고서가 untracked로 추가된다.
빌드로 변경된 추적 dist 파일은 작업 전 내용으로 복원해 source/doc 변경에 포함하지 않는다.

## 다음 개발 우선순위

1. **P0: Project State evidence → gap → Objective/Task 제안 → 사용자 승인 → DailyPlan → 실행 결과 → review.** 첫 프로젝트 한 개에서 실제 출시 업무를 연결하고 scope 변경은 승인한다.
2. **P0: 승인된 AI 업무 → 권한 검사 → 한 생성 capability 실행 → Artifact → 검토/결과 연결.** 실패/retry/중복 방지/ToolCall trace까지 포함한다.
3. **P1: 인증된 Web → canonical Current Action → Focus 시작/완료 → reload 후 동일 상태.** 이후 Goal/Project/Constraint와 automation policy 관리 mutation을 같은 경계로 확장한다.
4. **P1: Project Decision + Why + Evidence → 해당 action → Result → 다음 Project 판단 / Career 조회.** 일일 집계 결과와 결정별 인과 근거를 분리한다.
5. **P1: 학교 과제/자료 한 source → dedupe → 요구 추출 → Task/계획 → 초안 Artifact → 사용자 검토.** 이후 녹음/Notion/시험 축적을 연결한다.
6. **P2: 검증된 생성/승인 capability들을 Discovery→MVP→QA→IR workflow로 조합.** generic workflow designer는 먼저 만들지 않는다.
7. **P2: Source만 검사하는 lint/build 경계와 tracked generated artifact 정책 정리.** CI가 Web 포함 실제 변경 범위를 검증하도록 한다.
