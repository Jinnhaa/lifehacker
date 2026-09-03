# Codex Task — Input Pipeline v0.1

**추천 설정: Medium**
이유: AI structured output, idempotency, provenance, DomainCommand 적용 경계가 연결됨.

먼저 읽기:
- AGENTS.md
- docs/input-contracts.md
- docs/database-schema.md
- docs/core-runtime.md
- docs/input-pipeline.md
- codex-prompts/03-input-pipeline.md

목표:
사용자 자연어 입력을 안전하게 CREATE_TASK DomainCommand로 변환하고
기존 TaskService를 통해 Task를 생성하는 Input Pipeline v0.1을 구현한다.

중요:
- Foundation/Core Runtime 재설계 금지
- AI가 DB 직접 mutation 금지
- provider SDK를 feature code에 직접 퍼뜨리지 말 것
- existing migration 수정 금지
- remote Supabase 접근 금지
- Discord/Calendar/UI/Chief 구현 금지
- commit/push 금지

구현:
1. 현재 package 구조 확인
2. Input module/package 구성
3. ManualTextInput contract
4. AIInterpreter interface
5. Zod ParseResult / ParsedTaskDraft schema
6. DeterministicTestInterpreter
7. provider adapter boundary
8. InboxItem repository
9. ParsedEntity repository
10. DomainCommand repository
11. InputService orchestration
12. CREATE_TASK → TaskService 연결
13. provenance 저장/전달
14. idempotency 처리
15. confirmation-needed 처리
16. tests

AI provider 실제 호출에 secret이 필요하면:
- secret을 코드에 넣지 말 것
- adapter/config만 구현
- deterministic interpreter로 전체 integration test 가능하게 유지

검증:
- pnpm test
- pnpm lint
- pnpm typecheck
- pnpm build
- pnpm db:test
- git diff --check

보고:
A. 생성/수정 파일
B. Input flow
C. AIInterpreter 구조
D. Structured output validation
E. Provenance
F. Idempotency
G. Task end-to-end
H. 테스트 결과
I. 실제 AI 호출을 위해 필요한 환경변수
J. 다음 단계
