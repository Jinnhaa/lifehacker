# Mission

2026-10-20 목표는 실제 하루 운영 루프가 끊기지 않는 개인 AI Chief of Staff V1이다. 제품 가치와 정책은 [Product Vision](../product-vision.md), [Chief P0 Policy](../chief-p0-policy.md), [Work Schedule Policy](../work-schedule-policy.md)가 소유한다. 이 문서는 정책을 재정의하지 않는다.

관찰 → 판단 → 가능한 선행 작업 → 필요한 승인 → 현재 행동 → 실행 결과 학습 순으로 사용자의 확인·정리·판단 부담을 줄인다. Supabase 내부 상태, 외부 일정의 authoritative source, 사용자 명시 학습 상태, Core의 상태 전환과 승인 경계는 [Architecture](../architecture.md)와 [Domain Model](../domain-model.md)을 따른다. V1 완료는 [Release Gate](./WAVE-ROADMAP.md)의 증거가 모두 있을 때만 선언한다.

## Session Recovery Contract

새 세션은 `AGENTS.md` → 이 문서 → [CURRENT-STATE](./CURRENT-STATE.md) → [NEXT-ACTION](./NEXT-ACTION.md) 순서로 읽고, `git status --short --branch`, `git rev-parse HEAD`, [최신 Eval 결과](./eval-results/latest.json)를 대조한다. 코드와 문서가 다르면 코드를 확인하고 차이를 기록한다. 중단 전 이 폴더의 상태와 다음 행동을 갱신한다.
