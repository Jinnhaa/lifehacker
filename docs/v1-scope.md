# Amber HQ — V1 Scope

**Target:** 1주 안에 실제 생활에서 사용 시작  
**Current phase:** Core/Foundation/runtime/integration 기반 이후 Home Command Center vertical slice
**Primary user:** single-user personal system  
**Repository:** `lifehacker`

---

## 1. V1의 한 문장 목표

> **아침에 일어난 순간부터 밤에 하루를 닫을 때까지, 사용자가 “지금 무엇을 해야 하는가”를 스스로 계속 계산하지 않아도 되는 최소 동작 시스템을 만든다.**

V1은 완성형 AI 회사가 아니다.

가장 중요한 것은 하루 운영 Core Loop가 실제로 작동하고, 실제 사용 데이터를 첫 주부터 쌓기 시작하는 것이다.

---

## 2. V1 Core Loop

V1의 최우선 Vertical Slice:

```text
일어남
↓
Google Calendar 일정 확인
↓
Supabase Task / Deadline 확인
↓
가용시간 deterministic 계산
↓
AI가 알 수 없는 오늘 상황만 사용자에게 질문
↓
오늘 Plan 생성
↓
사용자 승인
↓
Current Task 결정
↓
Task 실행
↓
완료 / 막힘 / Task 전환
↓
실제 시간 기록
↓
필요 시 Dynamic Replanning
↓
Day Close
↓
미완료 정리 / Memory 후보 / 내일 기상 목표
```

이 Loop가 한 번 끝까지 작동하면 V1의 핵심이 살아 있는 것으로 본다.

---

## 3. V1 반드시 포함

### 3.1 Core Data Model

Supabase에 최소한 다음 Domain을 지원한다.

- Profile
- Long-term Goal
- Project / Course
- Task
- Task Step
- DomainEvent
- Daily Plan
- Daily Plan Item
- Focus Session
- Decision
- Memory
- Pattern Candidate
- AI Usage

DB 변경은 migration으로 관리한다.

---

### 3.2 Task State Machine

최소 상태:

```text
INBOX
PLANNED
IN_PROGRESS
BLOCKED
WAITING_FOR_USER
DONE
```

상태 전환은 Core에서만 수행한다.

중요 상태 변화는 Event를 남긴다.

---

### 3.3 Event Log

최소 Event:

- task_created
- task_planned
- task_started
- task_blocked
- task_resumed
- task_switched
- task_completed
- plan_created
- plan_approved
- plan_replanned
- focus_started
- focus_ended
- decision_requested
- decision_resolved
- morning_started
- day_closed

이 Event는 향후 개인화의 기반이 된다.

---

### 3.4 Rules Engine

V1에서 반드시 코드로 처리:

- 현재 시각
- D-Day
- 오늘/이번 주 Deadline
- Calendar event 정렬
- 빈 시간 계산
- 가용시간
- 예상 작업시간 합계
- 실제 작업시간 합계
- Schedule conflict
- Capacity conflict
- Replan 필요 여부
- Wake escalation 시점
- Long-term Goal 최근 수행량

Rules Engine에서는 LLM을 호출하지 않는다.

---

### 3.5 Manual / Natural Language Task Input

사용자는 자연어로 Task와 일정을 입력할 수 있다.

예:

```text
금요일 6시 로그폴 회의,
목요일까지 BM 수정
```

AI는 이를 구조화된 JSON으로 변환한다.

Zod validation 후 코드가 Supabase에 저장한다.

AI가 직접 DB를 수정하지 않는다.

V1에서는 복잡한 Form UI를 요구하지 않는다.

---

### 3.6 Discord

Discord는 V1의 모바일 대화/알림 채널로 사용한다.

최소 지원:

- 일반 자연어 입력
- `일어남`
- Morning 질문/응답
- Plan 승인/수정 응답
- Blocked reason 응답
- `오늘 끝` / `잘게`
- Wake 알림
- 중요 Notification

Discord Bot 내부에는 business logic을 넣지 않는다.

---

### 3.7 Google Calendar

V1 최소 기능:

- 오늘 일정 조회
- 날짜 범위 일정 조회
- Fixed Event 반영
- 승인된 Work Block 생성 준비

Calendar 데이터로 빈 시간을 계산한다.

빈 시간 계산은 Calendar Adapter가 아니라 Rules Engine이 담당한다.

---

### 3.8 Morning Workflow

V1의 첫 번째 핵심 Acceptance Flow.

입력:

```text
사용자: 일어남
```

시스템:

1. 현재 시간 확인
2. 오늘 Calendar 조회
3. Active Task 조회
4. Deadline 계산
5. 어제 미완료 확인
6. 장기목표 수행 상태 확인
7. 1차 가용시간 계산
8. 사용자가 알려줘야 하는 오늘 정보 질문
9. Capacity 재계산
10. Daily Plan 제안
11. 사용자 승인
12. Plan 저장
13. Current Task 결정

---

### 3.9 Planning Engine

Raw DB를 LLM에 그대로 보내지 않는다.

코드가 다음을 planning context로 압축한다.

- free time blocks
- deadline tasks
- unfinished tasks
- long-term goal status
- user condition
- work-until
- fixed schedule

복잡한 Priority 판단이 필요한 경우 AI를 최대 1회의 핵심 planning call로 사용한다.

반환은 structured output이어야 한다.

---

### 3.10 Execution Flow / Focus Domain

Task 시작 전 필요 시 전체 Flow를 생성한다.

사용자 확인 대상:

- 목표
- 완료 기준
- 전체 Step
- 예상시간
- AI 부분
- 사용자 부분

확인 후 현재 Step 단위로 실행한다.

V1 UI가 없거나 최소여도 Discord/command 수준으로 기능 검증 가능해야 한다.

---

### 3.11 Recovery

최소 Block Reason:

- unclear
- hard
- avoidance
- perfectionism
- missing_material
- other

Reason별 route는 코드로 결정한다.

필요한 semantic intervention만 AI를 사용한다.

막힘 → 개입 → 재시작 여부를 Event로 남긴다.

---

### 3.12 Task Switch Guardrail

Focus 중 Task 전환 시:

1. 현재 Task 영향 계산
2. 한 번 추천/경고
3. 사용자가 계속 전환 요청하면 허용
4. 현재 상태 저장
5. 새 Task 시작
6. Replan 판단

사용자를 강제로 막지 않는다.

---

### 3.13 Dynamic Replanning

실제 시간과 예상 시간 차이를 계산한다.

작은 변화는 Rule 기반 처리.

큰 Capacity/Deadline 충돌만 AI Planning으로 escalation.

Replanning은 다음을 고려한다.

- 남은 Task
- Calendar
- Deadline
- 장기 목표
- Rest/Buffer
- 현재 시각

---

### 3.14 Day Close

Trigger:

- `오늘 끝`
- `잘게`
- 지정 시간 이후 Chief의 마무리 제안

자동 수집:

- 완료/미완료
- 계획 대비 실제
- Focus time
- Block
- Task switch
- Decision
- Goal progress

결과:

- 하루 요약
- 미완료 재배치
- Pattern Candidate
- 내일 특이사항 확인
- 목표 기상시간
- 긍정적인 종료 메시지

---

### 3.15 Wake Workflow

전날 목표 기상시간이 있으면 wake trigger 생성.

응답 없을 경우 반복.

시간이 밀리면 실제 schedule impact 계산 후 알림 강도를 높인다.

`일어남`이 들어오면 즉시 종료하고 실제 현재 시간 기준 Morning Workflow를 시작한다.

Discord 음성 전화 자체는 V1 필수로 보지 않는다.

---

### 3.16 Decision Reason Capture

AI 추천을 사용자가 수정한 경우:

```text
왜 그렇게 바꿨는지?
```

를 짧게 확인할 수 있어야 한다.

저장:

- AI recommendation
- user correction
- user reason
- later outcome

이 기능은 개인화 데이터의 핵심이므로 V1에 포함한다.

---

### 3.16A Completion 확인

V1에서는 최소한 다음 완료 입력을 지원한다.

- 사용자의 명시적 완료
- Discord/manual completion
- Integration으로 명확히 확인 가능한 완료 event의 자동 반영을 위한 interface

오프라인 Task용 체크리스트 UI는 Core Logic 이후 구현할 수 있다.

완료 상태 판단이 불확실하면 자동 추측하지 않고 사용자에게 확인한다.

---

### 3.17 Pattern Candidate

V1에서는 완성된 자동 개인화보다 **학습 가능한 데이터 수집**이 중요하다.

지원:

- Decision reason 저장
- 반복 Pattern Candidate 생성 가능 구조
- Principle 후보 승인/거절
- 승인된 Principle 저장

고급 자동 Pattern Detection 품질은 첫 주 필수 완료 조건이 아니다.

---

### 3.18 Long-term Goal 최소 지원

Long-term Goal:

- 학점
- 일본어

V1에서는 최소한:

- Goal 생성
- 연결된 RecurringActivity의 주간 target
- ActivityOccurrence 실제 수행
- 최근 수행량
- Planning에서 보호 여부 판단

을 지원한다.

### 학점

V1에서 지원 가능한 최소 입력:

- 과목
- 목표 학점
- 시험/과제 일정
- 실제 공부시간
- 퀴즈/시험 점수 수동 입력

정교한 성적 예측은 V1 범위 밖이다.

### 일본어

V1 최소:

- RecurringActivity 주간 학습 목표
- 실제 학습 기록
- Planning에서 일정량 보호

`오늘 어떤 어휘/문법을 공부할지 자동 준비`는 가능하면 구현하지만 Core Loop보다 후순위다.

---

### 3.19 AI 비용 추적

V1부터 AI 호출은 중앙 Gateway를 통과한다.

최소 저장:

- job type
- model
- estimated token usage
- estimated cost
- timestamp

월 예산은 configurable하게 두고 초기 목표는 약 40,000원 이내로 둔다.

V1에서는 정교한 자동 model routing까지 필수는 아니지만 비용을 측정하지 않는 AI 호출은 만들지 않는다.

---

## 4. V1에서 AI를 사용하는 범위

허용:

- natural language parsing
- 복잡한 Daily Plan
- task decomposition
- blocked support
- decision compression
- Pattern Candidate extraction
- 자료 조사/초안 작업

사용하지 않음:

- date 계산
- deadline 계산
- schedule sorting
- free time
- duration 합산
- state transition
- focus step 이동
- simple replan
- wake timing
- weekly progress count

---

## 5. V1 Integration 우선순위

### Week 1 Core

1. Supabase
2. Discord
3. Google Calendar

### Core 이후

4. Notion
5. Snowboard
6. Codex Worker

Notion/Snowboard/Codex는 중요하지만 Core Loop를 막으면서까지 첫날부터 연결하지 않는다.

---

## 6. Notion V1 범위

V1 첫 주 필수 아님.

연동 시 역할:

- Project 문서
- 회의록
- 수업자료
- 조사자료
- 다른 AI에게 넘길 Context 검색

Notion을 Task Source of Truth로 사용하지 않는다.

초기 Notion 공간은 자동화하기 쉬운 구조로 새로 설계할 수 있다.

---

## 7. Snowboard V1 범위

첫 주 후반 또는 Core 안정 후 연결.

목표:

```text
새 과제/공지 감지
→ 원문 가져오기
→ 요구사항 해석
→ Task/Deadline 후보 생성
→ 사용자 확인
→ Plan 반영
```

Snowboard 인증/접근이 불안정한 경우 Core 개발을 멈추지 않는다.

초기에는 사용자가 과제를 수동으로 넣어도 된다.

---

## 8. Codex Worker V1 범위

첫 주 Core Loop의 필수 완료 조건은 아니다.

초기에는 Adapter/Interface boundary만 준비할 수 있다.

향후 목표:

```text
개발 Task
→ 관련 Project/Decision/파일 Context Package
→ Codex
→ 구현 결과
→ Chief가 결과/판단 필요사항 압축
```

---

## 9. Agent V1 범위

멀티 Agent는 첫 주 Core Loop의 완료 조건이 아니다.

초기에는 `AgentTemplate + AgentInstance + Scope/Grant` 구조만 확장 가능하게 둔다.

예:

```text
template/version
instructions
home_scope
memory/context policy
tool_grants
permissions/approval policy
```

Project Agent 실제 생성과 Agent 협업은 Core가 안정된 뒤 구현한다.

---

## 10. V1 UI 범위

Core/Foundation/runtime/integration 기반을 바탕으로 Home Command Center vertical slice를 구현한다. UI는 기존 Core Loop를 대체하거나 새로운 business logic을 소유하지 않는다.

Home V1의 핵심은 다음과 같다.

- Current Action
- Today Flow
- Focus entry
- 핵심 Goal 최대 3개
- 사용자 행동·판단과 관련된 Agent Office status

고급 analytics, 관리형 dashboard, Agent 자유 대화, 내부 실행 log visualization은 V1 핵심 범위가 아니다.

---

## 11. 7일 구현 순서

### Day 1 — Foundation

- repository bootstrap
- Supabase baseline
- migrations
- Core entity
- Task State Machine
- Event Log
- Rules Engine skeleton

### Day 2 — Input

- Task CRUD
- natural language parser
- structured validation
- manual goal/course/project seed

### Day 3 — Calendar + Discord

- Discord Bot
- Google Calendar auth/read
- normalized calendar event
- available time calculation

### Day 4 — Morning Planning

- `일어남`
- context collection
- capacity calculation
- daily planning
- approval
- current task

**이 시점부터 실제 사용 시작을 목표로 한다.**

### Day 5 — Execution

- Task Step
- Focus Session
- Blocked
- Recovery
- Task Switch Guardrail

### Day 6 — Replanning + Close

- actual time
- dynamic replanning
- Day Close
- Wake Workflow

### Day 7 — Learning / Stabilization

- Decision Why
- Pattern Candidate
- Long-term Goal protection
- 실사용 버그 수정
- 필요하면 Notion 또는 Snowboard의 첫 adapter 시작

일정은 실제 개발 난이도에 따라 이동할 수 있지만 Core Loop 우선순위는 바꾸지 않는다.

---

## 12. Acceptance Criteria

V1 Core는 최소한 다음 시나리오가 실제로 가능해야 한다.

### Scenario A — Morning

```text
Discord: 일어남
→ Calendar 자동 조회
→ 오늘 Task 조회
→ 가용시간 계산
→ 추가 상황 질문
→ Plan 생성
→ 사용자 승인
→ Current Task 제공
```

### Scenario B — Execution

```text
Task 시작
→ 전체 Flow 확인
→ Step 실행
→ 완료
→ 실제시간 저장
→ 다음 Step
```

### Scenario C — Blocked

```text
막힘
→ 이유 선택
→ 적합한 개입
→ 재시작
→ Event 저장
```

### Scenario D — Switch

```text
다른 Task로 전환 요청
→ 영향 경고
→ 그래도 전환
→ 허용
→ 남은 계획 재계산
```

### Scenario E — Day Close

```text
오늘 끝
→ 오늘 수행 자동 수집
→ 미완료 재배치
→ 요약
→ Memory 후보
→ 목표 기상시간
```

### Scenario F — Learning

```text
AI 추천 수정
→ 왜?
→ 이유 저장
→ 향후 Pattern Candidate 생성 가능한 데이터 존재
```

---

## 13. V1 Non-goals

첫 주에 만들 필요 없음:

- 완성형 Agent Office
- 다수 Agent의 자유 대화
- 정교한 Agent Meeting UI
- 모든 Task 완전 자동 발견
- 완성형 Snowboard automation
- 완성형 Notion 양방향 sync
- 고급 Vector DB
- 완벽한 장기 개인화
- 정확한 학점 예측 모델
- 고급 성장 분석 Dashboard
- 수면 시간 강제 관리
- 사용자의 행동을 강제로 차단하는 기능
- 중요한 제출물을 사용자 검토 없이 외부 제출
- 모든 생활영역 전용 Agent

---

## 14. 첫 주에 의도적으로 수동이어도 되는 것

속도를 위해 다음은 V1 초기에 수동 입력을 허용한다.

- 과목 초기 등록
- 프로젝트 초기 등록
- 일부 Deadline
- 시험/퀴즈 점수
- 일부 Task
- 실제 컨디션/오늘 일할 수 있는 시간
- Blocked reason
- 프로젝트 초기 핵심 정보

단, 한 번 입력된 정보를 계속 다시 요구하는 구조로 만들지 않는다.

---

## 15. V1 이후 확장 순서

Core 사용 후 실제 불편을 기준으로 우선순위를 재결정한다.

예상 순서:

```text
Snowboard 자동 감지
→ Notion Context Resolver
→ AI 선행작업 확대
→ Codex Worker
→ Project Agent
→ Agent Resource Allocation
→ Growth Analytics
→ 고급 Pattern Learning
```

실제 사용 데이터가 예상과 다르면 이 순서를 변경할 수 있다.

---

## 16. V1 성공 판단

첫 주 종료 시 다음을 확인한다.

- `오늘 뭐 해야 하지?`라고 직접 생각하는 횟수가 줄었는가
- Calendar/Deadline 확인 횟수가 줄었는가
- 반복 설명이 줄었는가
- 실제 Task 완료까지 연결되는가
- Plan이 틀어졌을 때 복구되는가
- AI 판단을 수정한 이유가 기록되는가
- AI 호출 없이 코드로 처리되는 영역이 충분히 큰가
- 사용하면서 시스템이 새로운 부담이 되지 않는가

기능 수보다 위 변화가 중요하다.
