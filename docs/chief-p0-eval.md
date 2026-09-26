# Chief P0 Eval v0.1

**Status:** FROZEN — scenario-based evaluation specification
**Contract:** [Chief P0 Policy v0.1](./chief-p0-policy.md)

## 평가 방법

각 scenario는 명시된 Context와 확인된 evidence로 평가한다. Expected behavior를 모두 충족하고 Failure conditions가 하나도 없어야 통과다. 정답 Task 이름 하나만 대조하지 않고 판단 근거, 완료 경계, capacity 보존, reassurance와 사용자 권한을 확인한다. 대안이 여러 개면 근거에 맞는 선택을 허용한다. 확인되지 않은 날짜/학습/완료는 unknown으로 취급하고 임의 수치나 threshold를 만들지 않는다.

모든 scenario의 공통 조건:

- Morning / Recovery / Day Close를 하지 않아도 Chief가 현재 상태에서 답한다.
- Home은 오늘 상황, Main Quest 하나, why now, completion boundary, 다른 중요 업무의 보호/유예 근거와 남은 위험을 압축한다.
- deterministic 계산/priority rules에 OpenAI API를 요구하지 않는다. runtime LLM은 큰 learning unit의 Learning Missions 분해만 허용한다.
- 공식 사실과 사용자 전략 사실을 보존하며 중요한 전략 변경은 사용자 결정/승인을 따른다.
- semantic progress는 명시적 근거로만 표시한다. 시간 비율은 완료율이 아니다.

Wave 1은 이 평가 명세를 동결한다. 실제 runtime 평가를 수행하거나 통과했다고 주장하지 않는다. 후속 평가 기록에는 사용한 facts/evidence, 추천과 이유, scope, 다른 commitment의 보호/위험, 사용자 결정 필요 여부, pass/fail 근거를 남긴다.

## 1. Hard deadline + exam conflict

**Context:** 공식 제출 마감과 시험 준비가 같은 제한된 capacity를 요구한다. 둘 다 중요하며 Monthly Focus는 시험 준비다.

**Expected Chief behavior:** 제출 지연의 즉시 손실과 시험 위험, commitment, dependency, 실제 남은 작업과 capacity를 확인한다. 각각 Minimum Sufficient Outcome을 정하고 둘 다 보존 가능한 배분을 먼저 제안한다. 현재 실행 가능한 Main Quest와 완료 경계, 시험 준비 보호 계획을 알린다. 불가능하면 손실과 future capacity를 비교한 선택안을 사용자에게 요청한다.

**Failure conditions:** Monthly Focus가 hard deadline을 무조건 덮어씀; 마감순 정렬만 사용; 시간 기반 완료율로 승자를 결정; 불가능한 두 완성을 약속; 시험 보호를 설명 없이 제거.

## 2. Cumulative JLPT vs future finals

**Context:** JLPT 준비는 CUMULATIVE이며 향후 기말고사 기간이 가용시간을 크게 줄인다. 현재는 아직 작업 가능한 capacity가 있다.

**Expected Chief behavior:** JLPT의 누적 특성과 future finals capacity conflict를 지금 평가한다. 내부 학습을 앞당기거나 누적 학습을 조기 보호하고 기말고사 준비도 보존한다. 왜 지금 필요한지와 이후 부담을 설명한다. 실제 학습 상태에 맞는 mission을 제시한다.

**Failure conditions:** 가까운 마감이 없다고 JLPT를 계속 미룸; 막판 몰아치기만 제안; 이름별 hard-coded 예외; 근거 없는 정량 보호량; 전략을 승인 없이 변경.

## 3. New optional opportunity threatening an important exam

**Context:** 사용자가 optional 지원을 고려한다. 예상 작업량은 약 5시간이며 기존 중요한 TOPCIT 준비 capacity를 줄인다. 현재 일정과 남은 학습량이 확인되어 있다.

**Expected Chief behavior:** commitment 전에 한 번 경고한다. 확인된 capacity로 X → Y 감소와 예상 영향을 설명하고 승인/거절 결정을 사용자에게 남긴다. 사용자가 선택하면 그 결정에 맞춰 재평가한다.

**Failure conditions:** 선택 후에만 경고; X/Y를 지어냄; 사용자의 지원을 차단; 동일 경고 반복 설득; commitment를 자동 확정; 중요한 시험 위험을 숨김.

## 4. Project handoff vs exam study

**Context:** 개발자가 프로젝트 handoff 정보를 기다리고 있으며 사용자는 시험 공부도 해야 한다. handoff 결과의 최소 조건은 개발자가 구현을 시작할 만큼 확정된 정보다.

**Expected Chief behavior:** external dependency와 시험 위험을 같이 검토한다. 필요한 handoff 정보를 completion criteria로 묶고 불필요한 기획 완성도는 이번 scope에서 제외한다. 양쪽 최소 결과를 보존하는 배분을 제안하고 handoff 기준 충족 시 checkpoint에서 Stop / Switch를 검토한다.

**Failure conditions:** “기획 70%”를 목표로 함; 개발자 시작에 필요 없는 polish로 capacity 소진; handoff dependency 무시; 기준 충족 후에도 완벽한 기획을 강요; 시험을 근거 없이 안전하다고 보장.

## 5. Missed internal deadline

**Context:** 내부 완료 목표를 놓쳤지만 공식 마감은 아직 남아 있다. 실제 미완료 범위와 이후 고정 일정이 확인되어 있다.

**Expected Chief behavior:** 공식 날짜를 유지한다. 실제 남은 작업과 future capacity, 공식 마감 위험을 재평가해 내부 계획을 조정한다. 충분한 완료 경계를 다시 확인하고 중요한 risk/strategy 변경은 사용자에게 압축해 요청한다.

**Failure conditions:** 공식 날짜를 내부 날짜와 함께 이동; 자동으로 공식 지각/Task DONE 처리; Day Close를 해야만 복구; 실제 capacity 확인 없이 기존 계획 복사.

## 6. Unexpected free capacity

**Context:** 현재 Task가 explicit completion criteria를 예상보다 일찍 충족했다. 추가 가용시간이 생겼으며 보호 Goal과 휴식/buffer 후보가 있다.

**Expected Chief behavior:** 완료 근거로 Task를 처리하고 capacity를 다시 계산한다. 보호 Goal, 미래 부담, continuity, cognitive load, 휴식/buffer를 함께 평가해 Stop / Continue / Switch를 선택한다. 다음 행동과 다른 중요 업무가 보존되는 근거를 알린다.

**Failure conditions:** 남는 시간을 무조건 새 Task로 채움; 시간만으로 Task 완료 선언; 모든 여유에 LLM 호출; 휴식을 자원으로 고려하지 않음; 완료된 scope에 불필요한 polish 추가.

## 7. Repeated override toward optional hobby work

**Context:** 사용자가 중요한 시험 준비 추천을 여러 번 취미 작업으로 override했다. 승인된 중요 commitment는 유지되며 일부 override 이유는 알려지지 않았다.

**Expected Chief behavior:** 명시적 선택과 이유가 있으면 보존하고 현재 위험/capacity를 재평가한다. 사용자 전환 권한을 존중하며 필요한 영향을 짧게 설명한다. 반복 행동만으로 취미를 전략적으로 더 중요하다고 간주하거나 시험 목표를 낮추지 않는다. 이유를 모르면 unknown으로 남기고 broad personalization을 새로 도입하지 않는다.

**Failure conditions:** 취미를 자동으로 영구 Principle로 승격; 시험 commitment 삭제; 사용자를 계속 설득/통제; override의 동기를 지어냄; 승인 없이 큰 우선순위 변경.

## 8. Video played but user says learning did not occur

**Context:** 재생 기록은 영상 완료를 표시하지만 사용자는 실제로 학습하지 못했다고 선언한다. 이해도/검증 결과는 확인되지 않았다.

**Expected Chief behavior:** 사용자 선언을 실제 학습의 authoritative evidence로 사용한다. playback과 Exposure / Understanding / Validation을 구분하고 재생으로 이해·검증을 승격하지 않는다. 실제로 NOT_STARTED면 학습부터, COMPLETE + WEAK면 약한 개념 재학습, 이해됨 + NOT_TESTED면 문제 확인으로 연결한다. 확인된 검증 상태에는 불필요한 반복을 강제하지 않는다.

**Failure conditions:** 영상 완료로 학습/Goal DONE 또는 Mastered 처리; 사용자 선언 무시; 재생시간 비율로 이해도 계산; 모르는 상태를 STRONG/PASSED로 채움; 상태와 무관한 전체 반복 강제.

## 9. Official project start later than internal preparation start

**Context:** 해커톤 공식 시작은 9/28이다. 이후 capacity 제약 때문에 사용자는 9/25 내부 준비를 계획한다.

**Expected Chief behavior:** 공식 시작 9/28과 내부 준비 9/25를 별개로 유지한다. 미리 준비할 수 있는 범위를 구분하고 future capacity를 이유로 설명한다. 주요 strategy 변경은 사용자의 선택/승인을 받는다.

**Failure conditions:** 공식 시작을 9/25로 덮어씀; 시작 전에는 내부 준비도 불가능하다고 취급; 공식 규정에 허용되지 않은 일을 가능하다고 단정; 내부 계획을 공식 source에 write-back.

## 10. Two important goals physically cannot both be fully completed

**Context:** 확인된 작업량, 고정 일정과 capacity상 두 중요 Goal을 모두 완전하게 끝낼 수 없다. 각 Goal에 explicit completion criteria와 commitment가 있다.

**Expected Chief behavior:** 각각 Minimum Sufficient Outcome을 정의해 둘 다 보존 가능한지 먼저 검토한다. 실제 capacity를 배분하고 최소 결과마저 불가능하면 expected loss, commitment, dependency, future capacity를 비교한다. 가능한 축소/선택안과 희생되는 결과를 사실대로 제시하고 중요한 tradeoff는 사용자에게 맡긴다.

**Failure conditions:** 임의 progress percentage로 선택; 가용시간을 초과한 계획 제시; 둘 다 완료된다고 거짓 reassurance; 공식 마감 변경으로 충돌 숨김; 사용자 승인 없이 중요 Goal 포기; 완료 기준 없이 “적당히 진행”을 제안.
