# Chief P0 Policy v0.1

**Status:** FROZEN — canonical Chief P0 behavioral contract
**확정일:** 2026-09-26
**Purpose:** 중요한 일을 하면서 더 적은 것을 생각하게 만든다.

## 1. 적용 범위와 운영 루프

Chief P0 = Priority Engine + Cognitive Load Manager + Scope Controller.
이 계약은 기존 V1 문서의 충돌하는 P0 행동·범위 정의보다 우선한다. 기존 architecture, domain ownership, state machine, event history, approval 경계는 유지한다. Wave 1은 문서만 변경하며 기존 구현을 삭제하거나 DB를 재설계하지 않는다.

```text
Observe → Assess → Decide → Define / Bound Done → Protect → Reassure
→ Execute → Checkpoint → Stop / Continue / Switch → Observe again
```

Morning / Recovery / Day Close는 P0의 필수 사용자 의식이나 진입 조건이 아니다. 현재 상태에서 바로 다음 행동을 제공하며, 막힘·완료·전환·일정 변화 후 다시 관찰한다. 중요한 전략 변경은 사용자 결정 또는 승인을 따른다.

## 2. Portfolio / Context의 소유권

Chief는 Project, Course, Certification Context를 가로질러 사용자의 commitment를 판단한다. Certification은 개념적으로 Learning Context다. 이는 개념 계약이며 새 table/enum/FK를 지시하지 않는다.

| 사용자 소유 전략 사실 | Chief가 현재 근거에서 도출하는 상태 |
|---|---|
| strategic importance, commitment, goals | urgency, current pressure, risk |
| 수동으로 제공한 공식 날짜, internal strategy | future capacity conflict, priority |
| 시스템이 신뢰성 있게 알 수 없는 실제 학습 상태 | recommended current action |

Strategic importance는 current priority와 다르다. 공식 날짜는 수동 입력이어도 공식 사실로 보존하며 내부 계획을 바꿨다고 함께 변경하지 않는다.

## 3. Goal 계층과 근거

```text
Long-term Goal → Monthly Goal → Weekly Focus Goal
→ Objective / Measurable Subgoal → Task / Learning Mission → Daily Quest
```

Monthly / Weekly Goals는 capacity를 집중할 방향이다. hard deadline, critical loss, serious dependency, major risk를 덮어쓰지 않는다. Daily Quest는 현재 상태에서 도출한 실행 선택이며 별도로 수동 관리하는 Goal이 아니다. 기존 Monthly Win / Weekly Win은 이 계층의 표시 용어로 사용할 수 있다.

의미적 완료는 명시적 근거로만 판단한다: 12 / 18 lessons, 명시적으로 정의된 Task 4 / 6개, milestone 완료 여부, explicit completion criteria. 단위 수는 해당 목표의 범위를 실제로 나타낼 때만 사용하고 임의로 만든 Task 수를 전체 Goal 완료율로 일반화하지 않는다. 근거가 없으면 진행을 알 수 없다고 표시한다.

금지: 예상 2시간 중 1시간 작업 = 50% 완료, 기획 70% 완료, 예상 작업량 가중치로 의미적 진행률 계산. 예상시간과 실제시간은 workload, capacity, schedule feasibility와 추정 보정에 사용하며 semantic progress를 대체하지 않는다.

## 4. Official Timeline과 Internal Plan

공식/external 일정과 개인 운영 일정은 별개다. 해커톤 공식 시작 9/28, 내부 준비 시작 9/25는 동시에 유효하다. Future Capacity가 제한될 때 Chief는 내부 준비를 앞당길 수 있으나 공식 시작은 바꾸지 않는다. 내부 마감을 놓치면 공식 마감, 남은 작업, future capacity를 다시 평가하고 내부 계획을 조정한다. 공식 지각이나 Task 완료로 간주하지 않는다.

## 5. Priority와 Scope

최소 고려 요소: hard deadline / immediate loss, external dependency, commitment, strategic importance, Monthly / Weekly Focus, Future Capacity, protected cumulative goals, blocked/executable state, continuity, cognitive load. 고정 priority 숫자나 임의 진행률만으로 선택하지 않는다. blocked 작업은 실행 가능한 unblock 행동과 실제 실행을 구분한다.

중요 Goal 충돌 시:

1. 각각의 Minimum Sufficient Outcome을 명시한다.
2. 두 결과를 모두 보존할 수 있는지 확인한다.
3. 실제 available capacity를 배분한다.
4. 불가능하면 expected loss, commitment, dependency, future capacity를 비교해 축소/선택안을 압축하고 중요한 tradeoff는 사용자에게 요청한다.

Task 완료는 explicit completion criteria에 의존한다. 예: “해커톤 기획 70%” 대신 “개발자가 구현을 시작할 만큼 확정된 정보가 준비됨”. 현재 Task/session에서 제외하는 범위도 명시할 수 있다. Checkpoint에서는 근거와 완료 경계, 남은 위험을 재평가해 Stop / Continue / Switch를 결정한다. 충분한 결과를 얻으면 불필요한 완성도를 강요하지 않는다.

## 6. Protect와 Reassure

새 optional opportunity가 기존 중요한 commitment를 실질적으로 위협하면 commitment 전에 한 번 경고한다. 예: “이 지원은 약 5시간이 필요하고 TOPCIT 준비 가용시간을 X에서 Y로 줄여.” X/Y는 실제 capacity 계산 근거가 있을 때만 제시한다. 최종 commitment 결정은 사용자에게 남기고 반복 설득하지 않는다.

누적 Goal은 미래 마감 혼잡을 고려해 일찍 보호한다. Certification 학습 특성은 CUMULATIVE / MIXED / CRAMMABLE을 개념적으로 지원하며 보호 시점에 반영한다. JLPT처럼 누적형이면 마지막 순간 구조에 의존하지 않는다. 이 예시를 자격증 이름별 hard-coded 로직으로 만들지 않는다.

예상보다 시간이 남아도 무조건 Task를 채우지 않는다. 보호 Goal, 미래 부담 감소, continuity, 휴식과 buffer를 함께 고려한다. 반복적인 취미 override만으로 전략 중요도나 승인된 Goal을 낮추지 않는다. 명시적 수정 이유와 실제 결과를 보존하되 broad personalization은 P0 범위 밖이다.

## 7. 실제 Learning State

재생/영상 수강 완료는 실제 학습이나 이해·검증 완료의 근거가 아니다.

| 차원 | 개념 상태 |
|---|---|
| Exposure | NOT_STARTED / PARTIAL / COMPLETE |
| Understanding | UNKNOWN / WEAK / OK / STRONG |
| Validation | NOT_TESTED / FAILED / PASSED |

시스템이 실제 학습을 신뢰성 있게 알 수 없으면 사용자 선언이 authoritative하다. 재생 기록으로 사용자 선언을 덮어쓰지 않는다.

- NOT_STARTED: 자료 학습부터 시작한다.
- COMPLETE + WEAK: 약한 개념을 다시 학습한다.
- 이해됨 + NOT_TESTED: 퀴즈/문제로 확인한다.
- 검증됨: 불필요한 반복을 강제하지 않는다.

Exposure, Understanding, Validation을 서로 자동 승격시키지 않는다. 상태를 모르면 아는 척하지 않고 필요한 확인만 요청한다.

## 8. Source of Truth와 Home

P0 user-created Tasks는 Lifehacker에 저장한다(Supabase 내부 SSOT). Snowboard는 공식 학교 Task를 발견/import할 수 있으며 외부 공식 사실의 provenance를 보존한다. Notion은 knowledge/context이며 Task SSOT가 아니다. Calendar는 fixed-time event의 authoritative source이며 내부 work block과 분리한다.

Home은 “지금 무엇을 할까?”와 “다른 중요한 일들은 안전하게 처리되고 있나?”에 답한다. 오늘의 상황, Main Quest 하나, why now, completion boundary, 다른 중요한 업무에 대한 reassurance를 압축한다. 보호 계획·유예 근거·남은 위험을 사실대로 알려주며 근거 없이 안전하다고 보장하지 않는다. 전체 Task dashboard는 Work & Calendar의 책임이다.

## 9. AI 경계와 P0 non-goals

Deterministic first. D-Day, deadline rules, capacity arithmetic, schedule conflict, Task state, progress arithmetic, deterministic priority rules는 OpenAI API 없이 수행한다.

현재 승인된 P0 runtime LLM 사용은 **큰 learning unit → 실행 가능한 Learning Missions** 분해뿐이다. 중앙 AI Gateway와 structured output → runtime validation → domain logic → DB write 경계를 유지한다. 기존 V1의 복합 planning/초안/요약/개인화 AI 가능 목록은 P0 runtime 허가로 해석하지 않는다.

보류: GitHub analytics/reporting, Google Analytics reporting, advanced autonomous Agent Platform, Wake 개선, Day Close 개선, Morning ritual 개선, 새 multi-agent architecture, Notion Task synchronization, broad personalization.

## 10. 평가와 미확정 세부사항

[Chief P0 Eval](./chief-p0-eval.md)의 시나리오로 계약을 평가한다. 이 Wave는 실행 평가 통과를 주장하지 않는다. Priority의 수치 가중치, warning의 정량 threshold, 학습 특성별 정량 보호량은 확정되지 않았으며 임의 수치를 추가하지 않는다. 개념의 물리 schema 매핑은 후속 구현에서 기존 domain에 맞춰 검토한다.
