# Eval Matrix

`pnpm eval`은 [시나리오 명세](../../evals/scenarios.json)를 실행하고 [latest.json](./eval-results/latest.json)을 자동 저장한다. 로컬 Supabase가 준비되면 `pnpm eval:db`로 B03·B04 실제 DB 검증도 실행한다. 최근 실행은 PASS 4 / FAIL 0 / BLOCKED 14다. 각 결과에는 scenario ID, setup, expected, failure, actual, PASS/FAIL/BLOCKED, 테스트 증거, Wave, branch 및 평가 SHA가 있다. 필수 시나리오가 모두 PASS가 아니면 명령이 실패한다. 실제 OpenAI E2E의 별도 실패는 [Known Issues](./KNOWN-ISSUES.md)에 기록한다.

| 영역 | 시나리오 | 현재 검증 범위 |
|---|---|---|
| A Product Behavior | A01–A10 | 기존 10개를 유지; 부분 assertion 또는 미구현 실사용 평가가 남음 |
| B Data Integrity | B01–B04 | 재생/학습 분리와 Day Close 결정/실행 증거를 단위·로컬 DB에서 검증; 전체 동기화·중복 검증 필요 |
| C Autonomous Execution | C01 | 소유권·검증 실패 단위 검증; 예산/시간/도구/승인 경계 통합 검증 필요 |
| D User Experience | D01–D02 | Main Quest/Up Next 투영 단위 검증; 브라우저·모바일·새로고침 확인 필요 |
| E End-to-End | E01 | 실제 하루 루프 DB/API 실행 필요 |

`coverage=partial`인 assertion은 PASS가 아니라 BLOCKED로 집계한다. P0 회귀 실패나 차단이 남으면 Wave 완료를 금지한다. 외부 API mock 테스트와 실제 연동 결과를 섞지 않는다.
