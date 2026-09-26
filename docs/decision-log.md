# Foundation v0.3 Decision Log

## PM/Architecture가 확정한 결정

1. Goal과 Objective는 별도 entity.
2. Project/Course는 공통 WorkContext boundary 사용.
3. CourseAssessment를 별도 저장.
4. Task는 최대 하나의 WorkContext.
5. Weekly target은 RecurringActivity가 소유.
6. DailyPlan은 immutable revision.
7. Current Action은 derived.
8. Pause는 FocusSession 상태.
9. Event는 correlation/causation/idempotency envelope 사용.
10. Input은 Inbox → ParsedEntity → DomainCommand.
11. 외부 object는 version/tombstone reconciliation.
12. Clone 학습 단위는 LearningCase.
13. Decision reason은 DecisionFeedback.user_reason.
14. Pattern Candidate는 별도 entity가 아니라 `Pattern.status = candidate`.
15. Agent 권한은 generic Scope/Grant.
16. AgentRun / AIExecution / ToolCall / Artifact 분리.
17. 승인 재개는 checkpoint/precondition/idempotency로 보호.
18. Calendar fixed event와 Amber work block을 구분.

## 사용자 승인 완료 제품 결정

**승인일:** 2026-09-01

사용자가 아래 추천안을 모두 승인했다.

### U1. Objective 자유도 — APPROVED
 Objective는 Goal 없이도 만들 수 있고 Project/Course에도 optional 연결 가능.

### U2. 반복활동 1회 완료 기준 — APPROVED
 기본은 완료 표시 = 1회. 필요할 때만 minimum_minutes 설정. 미달은 partial.

### U3. Dynamic Replan 재승인 경계 — APPROVED

자동 = 단순 시간 이동/buffer/같은 우선순위 내 조정.
승인 = 큰 우선순위 변경/보호 Goal·RecurringActivity 제거/중요 deadline risk 증가/Project 방향 변경/외부 write.

### U4. Project PM Agent 생성 — APPROVED

- Course는 School Agent 담당.
- Goal/RecurringActivity는 Chief 담당.
- Project는 onboarding 완료 후 PM Agent 자동 생성.
- 작은 Project는 `전담 Agent 사용 안 함` toggle 허용.

## 설정값으로 남길 것

- week start
- RecurringActivity count / expected minutes / minimum minutes
- planning buffer
- wake/notification timing
- monthly AI budget
- 세부 reapproval threshold


## Chief P0 Reset Wave 1 — FROZEN v0.1

**확정일:** 2026-09-26
**Canonical contract:** [Chief P0 Policy](./chief-p0-policy.md)
**Scenario evaluation:** [Chief P0 Eval](./chief-p0-eval.md)

이 결정은 충돌하는 기존 V1/P0 행동·범위를 대체한다. `product-vision.md`의 장기 비전과 `workflows.md`의 기존 Morning/Recovery/Day Close 및 Project AI 구현 기록은 새로운 P0 필수 조건이나 runtime AI 허가가 아니다. architecture, 상태 소유권, event history, 승인 경계는 유지한다. Wave 1은 documentation only이며 구현 삭제나 DB redesign을 수행하지 않는다.

1. Chief = Priority Engine + Cognitive Load Manager + Scope Controller. Observe → Assess → Decide → Define / Bound Done → Protect → Reassure → Execute → Checkpoint → Stop / Continue / Switch → Observe again. Morning / Recovery / Day Close는 필수 사용자 의식이 아니다.
2. Portfolio Context는 Project / Course / Certification을 개념적으로 지원한다. 사용자 전략 사실과 Chief-derived urgency/pressure/risk/capacity conflict/priority/action을 구분한다. 전략 중요도는 현재 priority가 아니다.
3. Goal 계층은 Long-term → Monthly → Weekly Focus → Objective / Measurable Subgoal → Task / Learning Mission → derived Daily Quest다. 월/주 집중 방향은 hard deadline, critical loss, serious dependency, major risk를 덮어쓰지 않는다.
4. **예상 workload/time 기반 Goal progress fallback은 폐기한다.** 의미적 완료는 명시적 단위/Task 완료, milestone, completion criteria 근거만 사용한다. 시간은 capacity/feasibility 계산에 남긴다.
5. Official Timeline과 Internal Plan을 분리하며 future capacity가 제한되면 내부 준비를 당길 수 있다. 중요한 전략 변경은 사용자 통제/승인 대상이다.
6. Priority는 deadline/loss, dependency, commitment, importance, 월/주 focus, future capacity, 누적 Goal 보호, executable state, continuity, cognitive load를 고려한다. 중요 Goal 충돌은 각각의 Minimum Sufficient Outcome과 둘 다 보존 가능 여부, capacity를 검토한 뒤 불가능하면 loss/commitment/dependency/future capacity를 비교한다.
7. Task는 명시적 완료 경계와 제외 scope를 사용할 수 있다. 새 optional commitment가 기존 중요 commitment를 위협하면 결정 전에 한 번 경고하고 선택은 사용자에게 남긴다.
8. 실제 학습은 재생 완료로 추론하지 않는다. Exposure / Understanding / Validation을 구분하며 알 수 없는 실제 학습은 사용자 선언이 authoritative하다. Certification은 CUMULATIVE / MIXED / CRAMMABLE 특성에 따라 조기 보호한다.
9. user-created Tasks는 Lifehacker, 공식 학교 Task 발견/import는 Snowboard, knowledge/context는 Notion, fixed-time events는 Calendar가 담당한다. Notion Task sync는 보류한다.
10. Home은 현재 행동과 다른 중요 업무의 보호 상태를 압축한다. 오늘 상황, Main Quest, why now, completion boundary, reassurance를 제공한다.
11. P0 runtime LLM은 큰 learning unit → actionable Learning Missions만 승인한다. deterministic 계산/규칙은 API 없이 수행한다.
12. GitHub/Google Analytics reporting, advanced autonomous Agent Platform, Wake/Day Close/Morning ritual 개선, 새 multi-agent architecture, Notion Task sync, broad personalization은 P0 non-goals다.

수치 priority 가중치, 정량 warning threshold, 특성별 정량 보호량은 미확정이며 임의로 동결하지 않는다. 물리 schema 매핑은 후속 구현 검토 사항이다.
