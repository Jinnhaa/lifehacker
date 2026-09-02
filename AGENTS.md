# AGENTS.md — Amber HQ

## 1. 이 파일의 역할

이 파일은 Amber HQ 저장소 전체에 적용되는 Codex 작업 지침이다.

Codex는 작업을 시작하기 전에 이 파일과 작업에 관련된 `docs/` 문서를 먼저 확인한다.  
구현 세부사항이 이 파일과 충돌하면 다음 우선순위를 따른다.

1. 현재 사용자의 명시적 요청
2. 현재 작업 디렉터리에 더 가까운 `AGENTS.override.md`
3. 현재 작업 디렉터리에 더 가까운 `AGENTS.md`
4. 루트 `AGENTS.md`
5. 관련 `docs/` 문서

루트 `AGENTS.md`에는 저장소 전체 공통 규칙만 둔다. 특정 앱이나 패키지에만 필요한 지침이 생기면 해당 디렉터리에 별도 `AGENTS.md` 또는 `AGENTS.override.md`를 둔다.

---

## 2. 프로젝트 목적

Amber HQ는 사용자의 일정, 학업, 프로젝트, 장기 목표를 통합적으로 관리하고 반복적인 확인·정리·판단 비용을 줄이는 개인용 AI Chief of Staff 시스템이다.

핵심 목표는 다음과 같다.

- 사용자가 기억하거나 다시 확인해야 하는 일을 줄인다.
- 같은 상황을 AI에게 반복 설명하지 않게 한다.
- 코드로 계산 가능한 것은 코드로 처리한다.
- AI가 할 수 있는 선행 작업은 먼저 수행한다.
- 중요한 판단만 사용자에게 압축해서 요청한다.
- 사용자가 지금 당장 해야 할 한 가지 행동을 명확하게 만든다.
- 사용자의 판단 수정 이유와 실행 결과를 학습해 개인화를 개선한다.

제품의 최상위 원칙:

> 사용자가 더 많은 일을 하게 만드는 것이 아니라, 중요한 일을 하면서 더 적은 것을 생각하게 만든다.

제품 정책의 자세한 내용은 `docs/product-rules.md`가 존재하면 그 문서를 따른다.  
시스템 구조는 `docs/architecture.md`를 따른다.

---

## 3. V1 우선순위

V1의 첫 번째 성공 기준은 다음 하루 운영 루프가 실제로 끊기지 않고 동작하는 것이다.

`일어남 → 일정/Task 확인 → 가용시간 계산 → 사용자 추가 상황 반영 → 하루 계획 → 승인 → 현재 Task → 단계별 실행 → 완료/막힘/전환 → 재계획 → Day Close`

멀티 에이전트 UI, 성장 대시보드, 과도한 자동화는 이 루프보다 우선하지 않는다.

---

## 4. 기술 스택

기본 스택:

- TypeScript
- Next.js App Router
- Supabase PostgreSQL / Auth
- Zod
- Google Calendar API
- Discord Bot
- pnpm workspaces
- Vercel: Web
- 지속 실행 가능한 Worker 런타임: Discord Bot / background jobs

세부 배포 구조와 모듈 책임은 `docs/architecture.md`를 따른다.

새 production dependency를 추가하기 전에는 다음을 확인한다.

- 표준 라이브러리나 기존 dependency로 해결 가능한가?
- 유지보수 비용보다 명확한 이점이 있는가?
- V1에 지금 필요한가?

불필요한 dependency와 framework를 추가하지 않는다.

---

## 5. 아키텍처 불변 조건

다음 규칙은 특별한 이유 없이 우회하지 않는다.

- Supabase가 Amber HQ 내부 상태의 Source of Truth다.
- Google Calendar는 시간 고정 일정의 Source of Truth다.
- Notion은 지식/문서 저장소이며 Task Runtime DB가 아니다.
- UI에 business logic을 넣지 않는다.
- Discord Bot 내부에 domain logic을 넣지 않는다.
- Integration module이 우선순위나 제품 정책을 판단하지 않는다.
- LLM prompt가 상태 머신 역할을 하지 않는다.
- 동일한 domain logic을 Web, Discord, Scheduler가 공유한다.
- 외부 API는 adapter/interface 뒤에 둔다.
- 모든 AI 호출은 중앙 AI Gateway를 통과한다.
- 중요한 상태 변경은 event history를 남긴다.
- hard-coded 사용자명, 과목명, 프로젝트명으로 로직을 작성하지 않는다.
- 새 기능을 위해 기존 Core를 우회하는 임시 parallel implementation을 만들지 않는다.

구조 변경이 필요하면 먼저 `docs/architecture.md`와 기존 구현을 확인한다.

---

## 6. AI 사용 원칙

가장 중요한 규칙:

> 코드로 확실하게 계산할 수 있는 것은 AI에게 묻지 않는다.

### AI를 사용하지 않는 예

- 날짜/시간 계산
- D-Day
- Calendar 정렬
- 빈 시간 계산
- 남은 작업시간 합산
- 일정 충돌 판정
- Task 상태 전환
- Focus Step 이동
- 실제시간/예상시간 비교
- 반복 알림 시점
- 주간 목표 수행 횟수
- 단순 재배치 가능 여부
- 이미 정해진 규칙 적용

### AI를 사용할 수 있는 예

- 자연어 입력 구조화
- 과제/공고 요구사항 해석
- 복합 우선순위 판단
- Task 단계 분해
- 자료조사/요약/초안
- 막힘 상황의 맞춤 개입
- 복잡한 재계획
- 판단 이유에서 패턴 후보 추출
- Decision Compression
- 다른 AI에 전달할 Context Package 생성

AI 결과는 곧바로 DB mutation으로 사용하지 않는다.

`LLM Output → Structured Output → Zod Validation → Domain Logic → DB Write`

AI 호출 시 필요한 context만 전달하며 전체 Memory/Notion/프로젝트 기록을 매번 넣지 않는다.

---

## 7. 데이터와 상태 관리

Task의 기본 상태:

- `INBOX`
- `PLANNED`
- `IN_PROGRESS`
- `BLOCKED`
- `WAITING_FOR_USER`
- `DONE`

상태 전환은 Core Domain에서만 수행한다.

현재 row만 갱신하지 말고 중요한 변화는 event로 남긴다.

예:

- `task_created`
- `task_planned`
- `task_started`
- `task_blocked`
- `task_resumed`
- `task_switched`
- `task_completed`
- `plan_created`
- `plan_approved`
- `plan_replanned`
- `decision_requested`
- `decision_resolved`

기존 event history를 임의로 덮어쓰지 않는다.

고정 priority 숫자를 영구적인 진실로 취급하지 않는다. 우선순위는 마감, 중요도, 남은 시간, 가용시간, 장기목표 보호, dependency, 사용자 결정 등을 기반으로 현재 시점에 계산한다.

---

## 8. 개인화와 Memory

AI의 제안을 사용자가 수정하면 가능한 경우 수정 이유를 저장한다.

`AI 제안 → 사용자 수정 → 이유 → 결과`

한 번의 선택으로 사용자의 일반 원칙을 단정하지 않는다.

반복 패턴은 `Pattern Candidate`로 만든 뒤 사용자 승인 후에만 장기 `Principle`로 승격한다.

장기 보존 대상:

- 중요한 프로젝트 의사결정과 이유
- 프로젝트 결과와 학습
- 포트폴리오/취업에 활용 가능한 경험
- 승인된 개인 원칙
- 장기 성장 변화

세부 실행 로그는 장기적으로 요약/압축할 수 있다.

---

## 9. Agent 원칙

초기 Agent는 독립 애플리케이션으로 만들지 않는다.

Agent는 다음 구성의 runtime configuration으로 표현한다.

`Agent = Role + Instructions + Memory Scope + Tools + Permissions`

새 Project Agent 때문에 코드를 복제하지 않는다.

Agent 간 자유로운 무한 대화를 구현하지 않는다. 필요 시 Chief가 제한된 입력을 요청하고 결과를 종합한다.

---

## 10. 구현 전 작업 절차

Codex는 구현 전 다음 순서를 따른다.

1. 현재 `git status`와 branch를 확인한다.
2. 적용 범위의 `AGENTS.md` / `AGENTS.override.md`를 확인한다.
3. `docs/architecture.md` 및 관련 문서를 확인한다.
4. 관련 기존 코드를 검색한다.
5. 동일 기능이나 유사 abstraction이 이미 있는지 확인한다.
6. 어떤 Domain/Integration에 속하는지 정한다.
7. AI 없이 해결 가능한지 확인한다.
8. 최소 변경 범위를 정한 뒤 구현한다.

기존 구현을 이해하지 않고 새 helper/service/table을 추가하지 않는다.

요청 범위를 벗어난 리팩터링이나 unrelated bug fix를 같이 수행하지 않는다.

---

## 11. 구현 원칙

- 문제의 원인을 해결하고 표면적인 patch를 반복하지 않는다.
- 가장 단순한 구현을 우선한다.
- premature abstraction을 피한다.
- future feature를 예상해 과도하게 구현하지 않는다.
- DB schema 변경은 migration으로 관리한다.
- 이미 적용된 migration 파일을 수정하지 않는다.
- 새 schema 변경은 새 migration으로 추가한다.
- secrets를 코드나 Git에 저장하지 않는다.
- `.env.example`에는 변수명만 둔다.
- TypeScript에서 불필요한 `any`를 사용하지 않는다.
- 외부 입력과 AI structured output은 runtime validation을 거친다.
- timezone은 명시적으로 처리하며 기본 사용자 timezone은 `Asia/Seoul`을 지원한다.

---

## 12. 테스트와 완료 기준

Core Domain Logic은 외부 API 없이 테스트 가능해야 한다.

우선 테스트 대상:

- Task state transition
- Deadline 계산
- Available time 계산
- Schedule conflict
- Capacity 계산
- Replanning trigger
- Wake escalation
- Goal protection
- Event 생성

외부 API unit test에서는 실제 API를 호출하지 않고 mock/fixture를 사용한다.

작업 완료 전 가능한 범위에서 다음을 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

아직 script가 존재하지 않는 초기 단계라면 없는 command를 임의로 가장하지 말고, 가능한 검증을 수행한 뒤 누락된 script를 보고한다.

Definition of Done:

- 요구사항이 반영됨
- Architecture를 우회하지 않음
- type/runtime validation이 필요한 곳에 존재함
- 핵심 로직 테스트 통과
- migration 필요 시 포함
- secrets 노출 없음
- 관련 문서 업데이트
- lint/typecheck/test/build 중 적용 가능한 검증 통과
- 주요 flow를 가능한 범위에서 실제로 확인함

---

## 13. Repository 기준

Amber HQ는 하나의 메인 GitHub repository를 사용한다.

서비스나 패키지가 늘었다는 이유만으로 repository를 분리하지 않는다.

별도 repository는 다음 중 명확한 이유가 있을 때만 검토한다.

- 독립 제품
- 독립적인 release lifecycle
- 별도 보안/권한 경계
- 별도 운영 주체 또는 배포 수명주기

Monorepo 기본 구조는 `docs/architecture.md`를 따른다.

---

## 14. Git Branch 규칙

`main`은 항상 실행 가능한 상태를 유지한다.

기능 개발은 원칙적으로 `main`에 직접 수행하지 않는다.

Branch naming:

- `feat/<kebab-case>`
- `fix/<kebab-case>`
- `refactor/<kebab-case>`
- `docs/<kebab-case>`
- `test/<kebab-case>`
- `chore/<kebab-case>`

예:

- `feat/morning-workflow`
- `feat/task-event-log`
- `fix/calendar-timezone`
- `refactor/planning-engine`

한 branch는 하나의 명확한 목적을 가진다.

### Git 작업 권한

Codex는 사용자의 현재 요청에 Git 작업이 포함되지 않았다면 임의로 다음 작업을 수행하지 않는다.

- 새 repository 생성
- 새 branch 생성/전환
- commit
- push
- merge/rebase
- remote 변경

사용자가 Git 작업을 요청한 경우 아래 기준을 따른다.

---

## 15. Commit 규칙

Commit message의 **설명은 반드시 한국어**로 작성한다.

Conventional Commits 형식을 사용한다.

```text
<type>[(optional-scope)]: <한국어 설명>
```

허용 type:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `style`
- `perf`
- `build`
- `ci`

예:

- `feat: 태스크 상태 전환 로직 구현`
- `feat(calendar): 오늘 일정 조회 기능 추가`
- `fix(planning): 자정 이후 가용시간 계산 오류 수정`
- `refactor: 일정 계산 로직을 Rules Engine으로 분리`
- `docs: 아키텍처 문서 업데이트`
- `test: 태스크 상태 전환 테스트 추가`

피해야 할 메시지:

- `update`
- `수정`
- `작업`
- `wip`
- `최종`
- `진짜최종`
- `fix bug`

하나의 commit에는 하나의 논리적 변경만 담는다. 서로 관계없는 변경은 분리한다.

Commit 전 최소한 `git status`, `git diff`를 확인하고 해당 변경과 관련된 검증을 수행한다.

---

## 16. Push / PR / main 반영 기준

Push는 사용자가 요청했을 때 수행한다.

Push 전:

- 의미 있는 논리적 작업 단위가 완료되어야 한다.
- 비밀정보가 포함되지 않았는지 확인한다.
- 가능한 검증이 통과해야 한다.
- 깨진 migration 또는 debug code를 포함하지 않는다.

중요한 변경은 PR 단위 검토를 권장한다.

특히 다음은 PR 검토 대상이다.

- DB schema
- Authentication
- Core architecture
- AI Gateway
- Memory 구조
- 외부 integration
- Agent runtime
- 대규모 refactor

`main` 반영 전 가능한 경우 lint, typecheck, test, build와 핵심 flow를 확인한다.

강제 push, history rewrite, destructive reset은 사용자가 명시적으로 요청하지 않는 한 수행하지 않는다.

---

## 17. 문서 관리

다음 변경은 코드와 문서를 같이 업데이트한다.

- Architecture 변경 → `docs/architecture.md`
- 제품/판단 정책 변경 → `docs/product-rules.md`가 존재하면 업데이트
- V1 범위 변경 → `docs/v1-scope.md`가 존재하면 업데이트
- 저장소 전체 작업 규칙 변경 → `AGENTS.md`

세부 설계가 root `AGENTS.md`를 비대하게 만들면 `docs/` 또는 하위 `AGENTS.md`로 이동한다.

---

## 18. 작업 후 보고

Codex는 작업 완료 후 간단히 보고한다.

- 구현한 내용
- 주요 변경 파일
- 검증/테스트 결과
- migration 여부
- 남은 문제 또는 위험
- 다음 권장 작업

불필요하게 긴 작업 로그는 보고하지 않는다.

---

## 19. 최종 판단 기준

선택지가 여러 개라면 다음 순서로 판단한다.

1. 사용자의 인지 부담을 실제로 줄이는가?
2. 판단 정확도를 높이는가?
3. 사용자의 직접 작업시간을 줄이는가?
4. 기존 Architecture를 지키는가?
5. 코드로 처리 가능한 것을 AI에게 맡기고 있지 않은가?
6. 비용과 운영 복잡도를 불필요하게 키우지 않는가?
7. 이후 확장이 가능한가?
8. 지금 V1에 실제로 필요한가?

확신이 없을 때 임기응변으로 새 구조를 만들지 말고 기존 Architecture 안의 가장 단순한 해결책을 우선한다.


## 20. Foundation / Agent Extension 추가 규칙

구현 전 작업과 관련된 다음 Foundation 문서를 확인한다.

- `docs/domain-model.md`
- `docs/agent-contract.md`
- `docs/input-contracts.md`
- `docs/personalization.md`
- `docs/workflows.md`
- `docs/requirements-matrix.md`

특히 새 Agent 추가는 `docs/agent-contract.md`의 **Additive Extension Rule**을 따른다.

새 Agent를 위해 기존 Agent/Core에 special-case 조건을 추가하지 않는다. 기존 구조 변경이 불가피하면 Architecture Change로 보고하고 사용자 승인 전 진행하지 않는다.

MCP는 외부 capability boundary로 사용하며 내부 Rules/State/Planning을 MCP tool chain으로 구현하지 않는다.

Background automation은 idempotency, retry, dedupe, checkpoint/resume을 고려한다.

- Foundation 결정 충돌 시 `docs/decision-log.md`와 `docs/domain-model.md`의 최신 canonical 정의를 우선 확인한다.

- `docs/audits/`는 과거 감사 결과 보관용이며 canonical 설계 기준이 아니다. 충돌 시 최신 Foundation 문서를 우선한다.
