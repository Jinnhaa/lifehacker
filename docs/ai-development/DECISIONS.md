# Decisions for Handoff

정책 원본은 [Decision Log](../decision-log.md)와 [decisions/](../decisions/)다.

- Chief P0는 정해진 순서의 근거로 판단하며 임의 가중 합산을 쓰지 않는다. Morning/Day Close는 추천의 진입 조건이 아니다. 근거: [Chief P0 Policy](../chief-p0-policy.md).
- 학습 행동은 Chief 판단 전에 canonical Task로 materialize한다. 근거: [Learning Work as Canonical Task](../decisions/002-learning-work-as-canonical-task.md).
- Snowboard의 재생 완료는 실제 공부·이해·검증의 증거가 아니다. `learning_units`의 원래 DB 주석과 [Chief P0 Policy](../chief-p0-policy.md)가 이 경계를 명시한다. 이번 수정은 Snowboard bootstrap이 Exposure를 자동 완료로 승격하던 위반을 제거한다. 재생 기록은 기존 `snowboard_lecture_progress`에 남긴다.
- Eval은 assertion이 실행되어도 시나리오의 전체 기대 행동을 검증하지 않으면 BLOCKED로 남긴다. 점수나 추측으로 완료를 선언하지 않는다. 근거: [Chief P0 Eval](../chief-p0-eval.md).
- `pnpm test`는 단위·로컬 DB 통합 테스트를 직렬로 수행한다. 실제 유료 OpenAI를 호출하는 E2E는 `pnpm test:e2e`로 분리하고 결과를 별도로 보고한다. 모델 출력을 재생산 가능한 로컬 테스트의 성공으로 대체하지 않는다.
