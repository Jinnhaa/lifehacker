# Wave Roadmap & Release Gate

과거 Wave 명칭은 Git과 [Decision Log](../decision-log.md)를 기준으로 확인한다. Chief P0 Reset Wave 1은 정책·10개 시나리오 동결 단계다. 이후 P0 World Model, unified candidates, Chief priority와 runtime 연결, outcome refresh loop는 `main`의 병합 기록이 있다. Learning P0 Wave 1은 Course Recipe 계약이며, 대학 모듈 현실/부트스트랩은 `main`에 있다. 현재 `feat/p0-learning-readiness`의 학습 UI와 P0 수정·Eval/Handoff는 미병합이다.

| 범위 | 코드 | 테스트 | UI | DB/배포 | 판정 |
|---|---|---|---|---|---|
| Chief P0 정책/10 시나리오 | 정책 구현 일부 | 런타임 10개 중 전체 행동 검증 미완 | Home 투영 단위 테스트 | 실제 환경 미확인 | 부분 완료 |
| Learning Recipe/모듈 bootstrap | `main`에 구현 | 단위 테스트 | 현재 브랜치 UI 추가 | 원격 0023–0025 적용 확인, 실사용 흐름 미검증 | 부분 완료 |
| Snowboard 재생/학습 분리 | 현재 브랜치 수정 | 단위·로컬 DB 재시도 통과 | 외부 재생과 학습 요약 별도 | 로컬 0026 적용, 원격 미적용; 과거 오염 데이터 조사 필요 | 코드·로컬 DB 완료, 운영 미검증 |
| Day Close 결정·실행 증거 | 사용자 수정 결정을 Chief 판단 구간에서 분리 | 로컬 DB 3일 루프 통과 | 해당 없음 | 로컬 DB 검증 | 코드 완료, 운영 미검증 |
| Project Leadership + AI E2E | 검증 규칙 유지, 프롬프트의 허용 ID 명시 | 실제 OpenAI 실행에서 근거 검증 실패; 변경 후 미재실행 | 해당 없음 | 외부 AI 사용 검증 필요 | 차단 |
| Eval/Handoff | 현재 브랜치 추가 | 반복 가능한 단위 평가 | 해당 없음 | DB/E2E 차단 | 부분 완료 |

## 2026-10-20 V1 Release Gate

[V1 Scope](../archive/2026-10-foundation/v1-scope.md)와 [요구사항 매트릭스](../requirements-matrix.md)를 기준으로 다음 증거를 확인한다: 기존 P0 Wave 누락 정리, Chief A01–A10 필수 평가, 학습 상태 분리, 일정·Task 계획, 승인과 Current Action, 완료·막힘·전환·재계획, 안전한 AI 선행 작업 한 종류, 주요 결정과 결과 저장, 새로고침 유지, 실제 DB/API E2E 하루 루프, Vercel 환경 검증, 독립 세션 복구. 한 항목이라도 미검증이면 V1 DONE이 아니다. [Eval Matrix](./EVAL-MATRIX.md)는 실행 가능한 검증과 부족한 증거를 구분한다.

다음 Wave는 기존 P0/학습 UI의 운영 검증과 Eval의 BLOCKED 항목을 닫는 데 집중한다. V1과 무관한 멀티 에이전트 UI·성장 대시보드는 이월한다.
