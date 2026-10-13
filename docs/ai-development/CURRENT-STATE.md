# Current State

**확인일:** 2026-10-13 (Asia/Seoul)

**검사 시작 SHA:** `a2b1cc9a783ff8c2cc50f680ea8dd028ab96c8f6`

**브랜치:** `feat/p0-learning-readiness` (작업 SHA는 `git rev-parse HEAD`로 재확인)

`main`/`origin/main`은 검사 시작 시 `8b5183f545d6e414a53e7c37868c4d9ee7445a33`였다. 현재 브랜치에는 대학 강의별 학습 UI 두 커밋과 재생/학습 상태 분리(`f6b2380`), 그 DB 통합 검증(`cc1729d`), 기존 통합 테스트 안정화(`787ddb2`), Day Close 판단 증거 분리(`6bfd825`), 동시 Agent 초기화 수정(`517400c`), Morning 테스트 갱신(`3f05bef`), AI backlog 근거 지시 강화(`b9649f5`), lint 정리(`4f3b907`)가 있다. GitHub 검색 당시 열린 PR은 없었다. 많은 이전 P0 브랜치의 변경은 `main`에 병합된 기록이 있으며, 현재 브랜치의 변경은 아직 `main`에 없다. [Wave Roadmap](./WAVE-ROADMAP.md)에서 검증 상태를 분리한다.

코드: Snowboard 재생 완료와 Learning Unit의 사용자 학습 상태를 분리했다. Snowboard 재생은 `snowboard_lecture_progress`에 저장된다. Learning Unit은 실제 학습의 별도 상태를 유지한다. 새 migration `0026`은 기존의 충돌하던 DB 주석을 바로잡으며 로컬 DB에 적용했다. 원격은 `0025`까지 확인했고 `0026`은 적용하지 않았다. 기존 DB에 과거 자동 승격된 Exposure가 있다면 일괄 수정하지 않는다. 어떤 값이 사용자 선언인지 구분할 근거가 필요한 상태다.

검증: `pnpm test:unit` 638 PASS, 로컬 DB 전체 통합 117 PASS, 외부 유료 AI E2E를 분리한 `pnpm test` 755 PASS, `pnpm lint`/`pnpm typecheck`/`pnpm build` PASS. `pnpm eval:db`는 PASS 4 / FAIL 0 / BLOCKED 14여서 gate 실패다. 실제 OpenAI를 부르는 Project Leadership → AI Execution E2E는 분리 전 실행에서 backlog 근거 검증 실패 1건을 보였다. 허용된 ID·근거를 프롬프트에 명시하고 상세 오류 출력을 추가했지만 외부 AI 재검증은 아직 하지 않아 해당 E2E는 FAIL/미검증 상태다. 연결된 원격 Supabase migration은 검사 시점 `0001`–`0025`가 모두 일치했다. 원격 DB에 테스트 데이터를 쓰지 않았다. Vercel 배포 상태는 확인되지 않았다.

검사 시작 시 `packages/core/dist`와 `packages/shared/dist`의 추적된 빌드 산출물이 이미 수정되어 있었다. 관련 없는 기존 변경으로 간주하여 소스 변경 커밋에 포함하지 않는다.
