# Next Action

**단 하나의 최우선 작업:** Chief A01(공식 제출 마감과 시험 준비 충돌)의 전체 행동을 실제 Chief 런타임에서 평가하는 테스트를 만들고, 부족한 판단·설명·승인 경계를 기존 Core 안에서 보완한다.

시작 전 [Session Recovery Contract](./MISSION.md)를 따른다. 현재 A01의 기존 assertion은 마감과 선택적 작업의 순서만 확인하므로 시험 보호·최소 충분 결과·tradeoff 승인까지 검증해야 한다. 결과를 [CURRENT-STATE](./CURRENT-STATE.md), [KNOWN-ISSUES](./KNOWN-ISSUES.md), [Eval](./eval-results/latest.json)에 기록한다. 이후 다른 BLOCKED P0 시나리오와 과거 자동 승격 레코드 provenance를 차례로 조사한다. 검증되지 않은 브랜치를 `main`이나 배포에 완료로 표시하지 않는다.
