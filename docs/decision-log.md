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
14. MemoryCandidate 대신 Pattern candidate.
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
승인 = 큰 우선순위 변경/보호 Goal·Routine 제거/중요 deadline risk 증가/Project 방향 변경/외부 write.

### U4. Project PM Agent 생성 — APPROVED

- Course는 School Agent 담당.
- Goal/Routine은 Chief 담당.
- Project는 onboarding 완료 후 PM Agent 자동 생성.
- 작은 Project는 `전담 Agent 사용 안 함` toggle 허용.

## 설정값으로 남길 것

- week start
- routine count / expected minutes / minimum minutes
- planning buffer
- wake/notification timing
- monthly AI budget
- 세부 reapproval threshold
