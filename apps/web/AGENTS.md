# AGENTS.md — Web

Home Command Center 작업 전 다음 문서를 순서대로 확인한다.

1. `/AGENTS.md`
2. `/planning/home-command-center-v1/01_PRODUCT_BRIEF.md`
3. `/planning/home-command-center-v1/02_REQUIREMENTS_SPEC.md`
4. `/planning/home-command-center-v1/03_UX_UI_SPEC.md`
5. `/planning/home-command-center-v1/04_TECHNICAL_DESIGN.md`
6. `/planning/home-command-center-v1/05_DELIVERY_PLAN.md`

## Rules

- Home에 새로운 business logic을 만들지 않고 기존 Core Domain을 재사용한다.
- 새 DB schema를 추가하지 않는다.
- Timer는 기존 FocusSession을 사용한다.
- Current Action은 canonical derivation을 사용한다.
- `05_DELIVERY_PLAN.md` 범위 밖 구현과 unrelated refactor를 하지 않는다.
- 관련 Acceptance Criteria를 기준으로 검증한다.
- 작업과 관련된 파일만 탐색한다.
