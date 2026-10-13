# Known Issues

1. 로컬 Supabase를 사용한 직렬 전체 테스트 755건은 통과했다. 병렬 실행은 DB contention timeout을 일으켰다.
2. 원격 migration 목록은 `0001`–`0025` 일치한다. 신규 주석 migration `0026`은 로컬에만 적용했고 원격 적용·운영 동작은 미확인이다.
3. Vercel의 현재 배포 URL·SHA·환경 변수는 이번 환경에서 확인되지 않았다. 배포 성공을 주장하지 않는다.
4. 이전 Snowboard bootstrap이 재생 완료를 `learning_units.exposure_state=COMPLETE`로 저장했다. 과거 값을 자동 초기화하면 사용자 명시 학습 완료도 지울 수 있으므로 provenance를 조사한 뒤 복구한다.
5. Chief A01–A10의 기존 단위 테스트는 일부 근거를 확인하지만 시나리오 전체 행동 평가가 아니다. [latest Eval](./eval-results/latest.json)의 BLOCKED를 해결해야 한다.
6. 현재 브랜치의 대학 학습 UI 커밋 두 개는 `main` 미병합이며, DB/브라우저 환경에서 확인되지 않았다.
7. 실제 OpenAI Project Leadership → AI Execution E2E는 backlog 제안의 ID 또는 근거 검증에서 실패했다. 허용 ID·근거를 프롬프트에 명시하고 다음 실패 시 검증 세부사항을 출력하도록 수정했다. 이 변경 이후 유료 외부 API는 재호출하지 않아 통과 여부는 미확인이다. `pnpm test:e2e`로 별도 검증한다.
