# Amber HQ Personalization & Clone Model

**Status:** Foundation v0.3  
**Purpose:** 사용자의 실제 판단과 행동에서 개인화 규칙을 학습하되 잘못된 일반화를 막는다.

---

## 1. Clone Definition

Amber Clone은 사용자의 모든 행동을 흉내 내는 Agent가 아니다.

> **반복적으로 발생하는 판단·설명·정리 방식 중 유용한 부분을 구조화하여 다음 판단 비용을 줄이는 Personalization Layer다.**

나쁜 습관을 그대로 복제하지 않는다.

---

## 2. Separate Layers

```text
What happened
→ Event / Memory

What user chose
→ Decision

Why user chose it
→ DecisionReason

What repeats
→ Pattern

What user approves as a rule
→ Principle

What intervention works
→ InterventionPattern
```

---

## 3. How Jinha Works vs Wants to Work

두 종류를 분리한다.

### Observed Behavior

실제 행동에서 관찰한 패턴.

### Desired Behavior

사용자가 승인한 원칙/목표.

Observed Behavior가 Desired Behavior와 충돌하면 시스템은 단순 복제하지 않는다.

예:

```text
Observed:
장기 목표를 계속 미룸

Desired:
일본어는 매주 보호

→ Planner는 '미루는 패턴'을 따라하지 않고
   Desired Principle을 우선
```

---

## 4. Learning Record

개인화의 최소 단위:

```text
Context Snapshot
AI Recommendation
User Choice
User Reason
Actual Action
Outcome
```

Context Snapshot에는 필요한 structured features만 저장한다.

예:

- meeting_count
- time_of_day
- deadline_load
- energy
- task_type

---

## 5. Pattern Lifecycle

```text
Evidence
↓
Candidate
↓
confidence/evidence accumulation
↓
Pattern detected
↓
User confirmation when rule-like
↓
Principle
```

한 번의 사례로 Principle을 만들지 않는다.

---

## 6. Pattern Types

대표:

- planning preference
- workload tolerance
- time estimation bias
- procrastination trigger
- task switch pattern
- routine completion pattern
- decision preference
- effective intervention
- study allocation pattern

---

## 7. Evidence

Pattern은 반드시 evidence를 가진다.

`PatternEvidence`는 다음 중 하나에 연결된다.

- TaskEvent
- FocusSession
- Decision
- Constraint
- Outcome
- ActivityOccurrence

AI summary text만 evidence로 사용하지 않는다.

---

## 8. Confidence

초기에는 복잡한 ML 모델을 만들 필요가 없다.

단순한 evidence count + consistency로 시작한다.

예:

```text
evidence 1~2회 → weak
3~4회 → candidate
5회+ and consistent → strong candidate
```

숫자는 config이며 실제 사용 후 조정한다.

---

## 9. Principle Approval

Pattern이 반복되어도 시스템은 다음과 같이 확인한다.

```text
최근 5번 회의가 2개 이상인 날
저녁 자기계발 시간을 줄였어.

앞으로:
"회의가 2개 이상인 날 장기학습은 최소 루틴으로 계획"
원칙으로 저장할까?
```

승인 후에만 Principle로 적용한다.

---

## 10. Principle Priority

충돌 시 기본 우선순위:

```text
현재 사용자 명시 지시
> 유효한 StrategicDirective
> 승인된 Principle
> UserSettings
> 강한 Pattern
> 최근 관찰
> 일반 default
```

현재 사용자의 명시 지시가 가장 높다.

---

## 11. Intervention Learning

Blocked 상태에서 어떤 개입이 효과 있었는지 학습한다.

예:

```text
reason=perfectionism
intervention=define_good_enough
restart_latency=6m
completed=true
```

다음 유사 상황에서 효과가 높았던 개입을 우선 추천할 수 있다.

---

## 12. Time Estimation Learning

Task마다 저장:

- initial estimate
- AI-adjusted estimate
- user estimate
- actual time
- task type
- project/course

반복 데이터로:

```text
"발표자료 수정은 보통 네 예상의 1.4배 걸림"
```

같은 후보를 만들 수 있다.

자동으로 사용자의 estimate를 무시하지 않고 보정안을 제안한다.

---

## 13. Routine Learning

RecurringActivity에 대해:

- 목표 횟수
- 실제 횟수
- 요일/시간
- 완료율
- 평균 실제시간

을 관찰한다.

설정이 현실과 반복적으로 맞지 않으면:

```text
주 5회 목표인데 최근 6주 평균 2.8회야.
3회로 조정할까?
```

라고 제안할 수 있다.

사용자 승인 없이 Routine target을 바꾸지 않는다.

---

## 14. Memory vs Session

Agent conversation history는 Personal Memory가 아니다.

대화 history는 필요 시 압축/폐기 가능하다.

장기 Personalization은 Supabase structured records가 canonical source다.

---

## 15. Retrieval

현재 요청마다 전체 Clone을 prompt에 넣지 않는다.

ContextResolver가 현재 작업과 관련된:

- Principles
- Preferences
- Patterns
- recent corrections
- project-specific decisions

만 선별한다.

---

## 16. Growth

장기적으로 계산 가능한 지표:

- plan execution
- actual vs estimated time
- restart latency
- routine consistency
- deadline-crunch proportion
- task switching
- overwork/recovery
- AI delegation/time saved

목적은 사용자 평가가 아니라 다음 계획 개선이다.

---

## 17. Personalization Safety

금지:

- 한 번의 행동으로 성향 확정
- AI 추측을 Fact로 저장
- 승인 없이 Principle 생성
- 오래된 Pattern을 영구 진실처럼 사용
- outcome이 나쁜 패턴을 단순 복제
- 사용자 현재 지시보다 과거 Pattern 우선


---

## 18. Canonical LearningCase

Clone 학습의 한 사례는 `LearningCase`로 묶는다.

`Context Snapshot → Recommendation → Decision/DecisionFeedback → Actual Action Events → Outcome`

PatternEvidence는 LearningCase를 지지/반박 evidence로 사용한다.

`DecisionReason`은 사용하지 않고 `DecisionFeedback.user_reason`으로 통일한다.
`MemoryCandidate` 대신 `Pattern.status=candidate`를 사용한다.
