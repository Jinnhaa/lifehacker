# Next Steps

1. Foundation v0.3.2 변경을 먼저 commit/push한다.
2. 이 패키지의 `docs/database-schema.md`, `docs/database-schema-checklist.md`를 repo에 추가한다.
3. DB 설계를 Codex에게 다시 시키지 않는다. 설계는 이 문서를 Source of Truth로 사용한다.
4. Codex는 `codex-prompts/01-database-foundation.md`에 따라 실제 로컬 구현만 수행한다.
5. Codex 결과는 ChatGPT에 가져와 검수한다.

## 이 단계의 학습 목적

이번 단계에서는 다음을 직접 경험한다.

- PK / FK / unique / check constraint
- migration이 왜 필요한지
- RLS가 무엇을 보호하는지
- state와 event history의 차이
- idempotency가 자동화에서 왜 필요한지
- Agent memory와 session history가 왜 다른지
- Agent permission을 DB에 어떻게 표현하는지

Codex는 설계자가 아니라 **로컬 구현 엔지니어**로 사용한다.
