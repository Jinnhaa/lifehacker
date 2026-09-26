# Amber HQ Work & Schedule Policy

Chief P0의 행동·범위는 [Chief P0 Policy v0.1](./chief-p0-policy.md)이 우선한다. 기존 V1/Foundation 설명과 구현 기록은 유지하되 Morning / Recovery / Day Close는 P0 필수 사용자 의식이 아니며, 기존 AI 가능 목록은 P0 runtime 허가가 아니다. Wave 1은 문서 동결만 수행하고 코드·테스트·migration을 변경하지 않는다.

**Status:** CANONICAL

## 1. Core Principle

Amber HQ는 공식 사실과 개인 계획을 분리한다.

공식 사실은 외부 원본이 소유하며,
Chief는 그 사실을 바꾸지 않고 그에 맞는 계획을 만든다.

---

## 2. Task와 Schedule

### Task
완료해야 하는 작업.

예:
- 과제
- 해커톤 제출물
- 지원서

Task는 다음을 가질 수 있다.

- official_deadline
- internal_deadline
- estimated_minutes
- status
- source / ExternalReference

### Schedule
특정 시간이 고정된 일정.

예:
- 중간고사
- 기말고사
- TOPCIT
- JLPT
- 수업
- 회의
- 발표

Task의 마감일과 Schedule은 별개의 데이터다.

UI에서는 함께 볼 수 있지만 저장 의미는 섞지 않는다.

---

## 3. Official Deadline

외부에서 정해진 실제 마감이다.

예:
- Snowboard 과제 마감
- 해커톤 제출 마감

규칙:

- authoritative source가 소유한다.
- 사용자나 Chief가 임의로 변경하지 않는다.
- 원본에서 공식적으로 변경될 때만 갱신한다.
- provenance / ExternalReference를 유지한다.

---

## 4. Internal Deadline

사용자와 Chief가 실제 완료를 목표로 하는 날짜다.

규칙:

- 사용자 또는 Chief가 변경할 수 있다.
- official_deadline보다 늦을 수 없다.
- 기본적으로 공식 마감 1~2일 전에 끝내는 것을 목표로 한다.
- 작업량과 실제 사용자 패턴에 따라 이후 개인화한다.

예:

공식 마감: 9/22 23:59  
내부 마감: 9/20 20:00

---

## 5. Official Schedule

외부에서 시간이 고정된 일정이다.

예:
- 시험
- 수업
- 회의
- 발표
- 보강

규칙:

- 해당 source가 authoritative하다.
- Chief가 임의로 옮길 수 없다.
- 공식 변경이 확인될 때만 수정한다.

---

## 6. Execution Plan

Task 완료나 시험 준비를 위해 Chief가 만드는 실행 계획이다.

예:
- 오늘 JLPT 단어 40개
- 데이터베이스 과제 90분
- 알고리즘 복습 40분

규칙:

- 유연하게 이동 가능하다.
- Official Schedule보다 우선순위가 낮다.
- 일정이나 마감 상황이 바뀌면 Chief가 재계획한다.

---

## 7. Planning Anchor

다음은 단순 일정 표시가 아니라
현재 공부량과 작업량을 결정하는 기준이다.

- 중간고사
- 기말고사
- TOPCIT
- JLPT
- 해커톤
- 중요한 제출 마감
- 중요한 발표

Chief는 다음을 이용해 현재 작업량을 계산한다.

공식 날짜
+ 남은 학습/작업량
+ 남은 날짜
+ 가용시간
+ 다른 일정과 마감
+ 실제 과거 소요시간

→ 오늘/이번 주 해야 할 양

---

## 8. Replanning

공식 일정이나 마감이 변하면:

공식 사실은 유지/갱신
→ 내부 마감 재검토
→ 실행 계획 재배치

공식 일정과 AI 실행 계획이 충돌하면
AI 실행 계획을 이동한다.

중요한 변경은 기존 approval 정책을 따른다.

---

## 9. Snowboard

현재 정규 수강 과목만 추적한다.

자동 수집:

- 과제
- 퀴즈 마감
- 시험
- 명확한 제출 마감
- 명확한 제출/완료 상태

기본 제외:

- 강의 영상 공개기간
- 녹화 영상
- 일반 강의자료
- 단순 시스템 공지

Snowboard 완료 상태가 명확하면
연결된 Lifehacker Task를 완료 처리할 수 있다.

반대로 Lifehacker Task 완료 상태를
Snowboard에 write-back하지 않는다.

Snowboard integration은 MVP에서 read-only다.

---

## 10. Snowboard Sync

Snowboard 수집에는 AI API를 사용하지 않는다.

기본 흐름:

로그인
→ authenticated session
→ 현재 정규과목 확인
→ Upcoming / Activity 수집
→ 상세 페이지 확인
→ normalize
→ Task / Schedule 생성 또는 갱신
→ ExternalReference 저장

동일 항목을 여러 번 동기화해도 중복 Task를 만들지 않는다.

공식 마감 변경 시 official_deadline만 갱신한다.
internal_deadline은 임의로 덮어쓰지 않는다.

---

## 11. Completion

외부 source에서 완료가 명확히 확인되면
연결된 Task를 DONE으로 변경할 수 있다.

완료 근거와 event를 남긴다.

---

## 12. Learning

Chief가 학습할 수 있는 것:

- 적절한 내부 마감 buffer
- 실제 작업시간(추정/용량 보정용이며 의미적 완료 근거가 아님)
- 공부량 분산 방식
- 미루기 패턴
- 성공적인 재계획 패턴
- 사용자의 판단 수정 이유

Chief가 학습으로 변경하면 안 되는 것:

- 공식 마감
- 공식 시험/일정
- 외부 완료 사실

---

## 13. Work / Chief Goal Planning

Work와 Chief planning에서만 다음 최소 계층을 사용한다.

```text
Long-term Goal → Monthly Goal → Weekly Focus Goal
→ Objective / Measurable Subgoal → Task / Learning Mission → Daily Quest
```

- Goal은 기간의 결과이며 Calendar day cell의 Task처럼 취급하지 않는다.
- Task는 기존 `objective_id → goal_id` 연결을 통해 Goal에 기여한다.
- 명시적 milestone이 있으면 milestone 달성 상태를 우선한다.
- 의미적 progress는 명시적으로 정의된 단위/Task 완료(예: 12/18 lessons, 4/6 Tasks), milestone 또는 completion criteria로 계산한다. 근거가 없으면 unknown이며 예상 작업량/시간 가중치 fallback은 금지한다.
- 예상시간은 workload, capacity, schedule feasibility에만 사용한다. 예상 2시간 중 1시간 작업을 50% 완료로 보지 않는다.
- Monthly Win / Weekly Win은 Monthly Goal / Weekly Focus Goal의 표시 용어다. capacity 집중 방향이며 hard deadline, critical loss, serious dependency, major risk를 덮어쓰지 않는다. Daily Quest는 별도 수동 Goal이 아닌 derived execution choice다.
- 완료와 Focus evidence의 기존 Task/Objective/Goal 연결을 보존한다.

## 14. Goal / Task / Event와 Planned Day

- Goal = 기간 상단에서 보여주는 달성 결과.
- Task = 완료해야 하는 일이며 `planned_date`로 실행할 날짜를 가질 수 있다.
- Event = authoritative source가 소유하는 실제 고정 시간.

`planned_date`는 Chief 또는 사용자가 옮길 수 있는 실행 계획이다. Drag는 `planned_date`만 변경하며 `internal_deadline`과 `official_deadline`은 변경하지 않는다.

```text
Planned Day ≠ Internal Deadline ≠ Official Deadline
```


## 15. Chief P0 Timeline / Capacity / Task SSOT

- 공식 시작/마감과 내부 준비/운영 계획을 구분한다. 공식 해커톤 시작 9/28과 내부 준비 시작 9/25는 함께 유효하다. Future Capacity가 제한되면 내부 작업을 당길 수 있으나 공식 사실은 변경하지 않는다.
- 내부 마감을 놓치면 실제 남은 작업, 공식 마감, future capacity를 재평가한다. 공식 지각/완료로 간주하지 않는다. 중요한 전략 변경은 사용자 결정/승인을 따른다.
- user-created Tasks는 Lifehacker(Supabase)에 저장한다. Snowboard는 공식 학교 Task의 발견/import source다. Notion은 knowledge/context이며 Task SSOT나 P0 Task synchronization 대상이 아니다. Calendar는 fixed-time event의 authoritative source다.
- 두 중요한 Goal 충돌은 각각의 Minimum Sufficient Outcome → 둘 다 보존 가능 여부 → capacity 배분 → 불가능하면 expected loss / commitment / dependency / future capacity 비교 순으로 처리한다. 임의 진행률로 선택하지 않는다.
- 새로운 optional commitment가 기존 중요한 commitment를 실질적으로 위협하면 결정 전에 한 번 capacity 영향을 경고한다. 최종 결정은 사용자에게 남긴다. 정량 threshold는 이 Wave에서 새로 정하지 않는다.
