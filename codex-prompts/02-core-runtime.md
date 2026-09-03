# Codex Task — Core Runtime v0.1

**추천 설정: Medium**
이유: State transition, transaction, repository, Supabase 연동 간 정합성 판단이 필요함.

먼저 읽기:
- AGENTS.md
- docs/foundation-status.md
- docs/database-schema.md
- docs/core-runtime.md

목적:
이미 구현된 Database Foundation 위에 Domain Repository + Task State Machine + Rules Engine v0.1을 실제 코드로 구현한다.

중요:
- 설계를 다시 하지 말 것
- Supabase schema 의미를 임의 변경하지 말 것
- remote Supabase 접근 금지
- UI / Discord / Calendar / AI / Agent 구현 금지
- commit / push 금지

작업:
1. 현재 repo/package 구조 확인
2. pnpm workspace에 packages/core, packages/shared 추가
3. shared type/error/clock 구성
4. Task repository abstraction + Supabase implementation
5. Task State Machine
6. TaskService
7. 상태변경 + DomainEvent atomicity 보장
8. Rules Engine v0.1
   - deadline
   - duration
   - capacity
   - recurring activity risk
   - shouldReplan
9. unit/integration tests
10. lint/typecheck/test 실행

제약:
- feature 코드에서 Supabase 직접 호출 금지
- business rule repository에 흩뿌리지 말 것
- new Date() 직접 의존 최소화, Clock abstraction 사용
- AI SDK dependency 추가 금지
- 불필요한 framework 추가 금지
- 기존 migration 수정 금지. 정말 필요한 DB 변경 발견 시 변경하지 말고 보고

완료 보고:
A. 생성/수정 파일
B. Repository 구조
C. Task State Machine 구현
D. Atomic state/event 처리 방식
E. Rules Engine
F. 테스트 결과
G. 기존 schema 변경 필요 여부
H. 다음 단계

git diff --check 포함.
