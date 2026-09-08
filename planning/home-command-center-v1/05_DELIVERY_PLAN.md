# Home Command Center V1 — Delivery Plan

## Branch

`feat/home-command-center-v1`

## In Scope

1. Home shell
2. Today Flow
3. Current Action
4. Goal Quest 최대 3개
5. 양쪽 Agent Office layout
6. Focus Modal / Timer 기본 interaction
7. Responsive baseline
8. 최소 QA

## Out of Scope

- Agent orchestration 신규 구현
- DB schema 변경
- 새로운 Planning Engine
- Growth Analytics
- Calendar write 기능 신규 구현
- Notification 신규 구현
- 멀티 Agent 자유 대화
- 전체 모바일 완성도 최적화
- 범위 밖 refactor

## Recommended Implementation Order

1. shell/layout
2. Home view model / adapter boundary
3. Current Action
4. Today Flow
5. Goal Quest
6. Agent Office
7. Focus interaction
8. responsive
9. QA

mock/fixture가 필요하면 view-model boundary에서 사용하고 canonical state로 저장하지 않는다.

## Minimum QA

- Current Action의 최우선 계층과 FocusSession/DailyPlan fallback
- Goal 최대 3개 노출
- Agent 내부 log/reasoning 비노출
- Focus 시작, 일시정지, 재개, 완료 및 필요한 경우 전환
- empty, loading, partial error와 좁은 viewport
- keyboard focus와 modal focus 복귀

## Verification

저장소에 존재하는 script만 실행한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

없는 script를 새로 만들지 않고 실행할 수 없는 검증은 보고한다.
