# Amber HQ Input Pipeline v0.1

**Status:** IMPLEMENTATION-READY
**Depends on:** Database Foundation v0.1 + Core Runtime v0.1

## 1. 왜 이 단계를 만드는가

Core Runtime까지는 구조화된 명령만 처리할 수 있다.
이제 사용자의 실제 자연어를 안전한 실행 명령으로 바꿔야 한다.

```text
Raw Input
→ InboxItem
→ Parse
→ ParsedEntity
→ Validate
→ DomainCommand
→ Application Service
→ Domain Mutation
→ DomainEvent
```

핵심 학습:
- Structured Output
- Command Pattern
- Validation Boundary
- Provenance
- Idempotency
- AI interpretation vs deterministic execution

## 2. V0.1 범위

포함:
- manual text input
- task intent parsing
- deadline / duration / importance 추출
- clarification-needed 판정
- ParsedEntity 저장
- DomainCommand 생성
- TaskService 연결
- idempotency
- AI Gateway abstraction
- deterministic fallback/test parser
- unit/integration tests

제외:
- Discord 실제 연결
- Google Calendar
- Snowboard
- Notion
- Chief orchestration
- voice
- multimodal input
- autonomous follow-up conversation UI

## 3. 핵심 원칙

### 3.1 AI는 해석만 한다

```text
AI
→ ParseResult
→ Zod validation
→ DomainCommand
→ TaskService
```

AI가 직접 tasks table을 수정하지 않는다.

### 3.2 explicit user value wins

우선순위:

```text
user_explicit
> trusted_external
> system_derived
> ai_inferred
```

### 3.3 ambiguous input은 억지로 생성하지 않는다

AI가 임의의 deadline/time을 사실처럼 만들지 않는다.

### 3.4 deterministic first

다음은 AI 이전에 코드로 처리 가능하면 코드로 처리한다.
- 명시적 date token
- 숫자 duration
- timezone
- source metadata
- duplicate detection
- schema validation

## 4. Manual Input Contract

```ts
type ManualTextInput = {
  userId: UserId
  text: string
  receivedAt: string
  source: "manual"
  clientRequestId: string
}
```

`clientRequestId`는 retry idempotency용이다.

## 5. Parse Result

```ts
type ParseResult = {
  intent:
    | "CREATE_TASK"
    | "CREATE_RECURRING_ACTIVITY"
    | "UNKNOWN"

  entities: Array<{
    entityType: string
    data: unknown
    provenance: Record<string, Provenance>
    confidence: number
  }>

  requiresConfirmation: boolean
  clarificationQuestions: string[]
}
```

V0.1에서 CREATE_TASK를 production-ready로 만든다.

## 6. Parsed Task Draft

```ts
type ParsedTaskDraft = {
  title: string
  description?: string
  officialDeadline?: string
  estimatedMinutes?: number
  importance?: 1 | 2 | 3 | 4 | 5
  workContextHint?: string
  objectiveHint?: string
  executionMode?:
    | "standard"
    | "learning_required"
    | "output_focused"
    | "mixed"
  inferredFields: string[]
}
```

`workContextHint`는 바로 FK로 쓰지 않는다.
향후 entity resolution 단계에서 실제 WorkContext와 매칭한다.

## 7. Provenance

필드 단위 provenance:
- user_explicit
- external
- system_derived
- ai_inferred

AI inferred field는 사용자 명시값보다 우선할 수 없다.

## 8. Inbox 처리 순서

1. Manual input 받음
2. dedupe_key 계산
3. InboxItem insert
4. 이미 존재하면 기존 processing result 반환
5. parse
6. ParsedEntity 저장
7. confirmation 필요 없으면 DomainCommand 생성
8. DomainCommand apply
9. TaskService 호출
10. DomainEvent 생성

## 9. Idempotency

같은 clientRequestId로 두 번 요청해도 Task는 한 번만 생성한다.

두 레이어:
- InboxItem.dedupe_key
- DomainCommand.idempotency_key

## 10. AI Gateway

Feature 코드에서 provider SDK 직접 호출 금지.

```ts
interface AIInterpreter {
  parseInput(input: ParseInput): Promise<ParseResult>
}
```

V0.1:
- DeterministicTestInterpreter
- provider adapter boundary

Application code는 interface만 의존한다.

## 11. Structured Output

AI output은 반드시 Zod schema를 통과한다.

실패 시:
```text
AI output
→ schema invalid
→ PARSE_INVALID
→ InboxItem parse_status=failed
```

## 12. Confirmation Rule v0.1

자동 생성 허용:
- intent 명확
- title 존재
- 위험한 외부 write 없음
- 중요한 필드 conflict 없음

confirmation 필요:
- 여러 intent 후보
- title 불명확
- 사용자 명시값끼리 conflict
- high-impact existing entity 변경

단순 Task 생성 자체는 confirmation을 기본 요구하지 않는다.

## 13. DomainCommand

검증을 통과한 실행 명령이다. AI 결과 자체가 아니다.

## 14. Processing Status

InboxItem:
- pending
- parsed
- waiting_for_confirmation
- applied
- failed

ParsedEntity:
- parsed
- validated
- rejected
- applied

DomainCommand:
- pending
- applied
- rejected
- failed

## 15. Error Model

추가 DomainError:
- INPUT_DUPLICATE
- PARSE_FAILED
- PARSE_INVALID
- UNSUPPORTED_INTENT
- CONFIRMATION_REQUIRED
- COMMAND_ALREADY_APPLIED
- ENTITY_RESOLUTION_REQUIRED

## 16. Tests

Parser contract:
- valid task parse
- malformed structured output
- unknown intent
- inferred field provenance

Idempotency:
- same input twice → one InboxItem
- same command twice → one Task

Application:
- task input → Task + task_created event
- invalid parse → no Task
- confirmation-needed → no Task

Explicit-vs-inferred:
- user deadline cannot be overwritten by AI inferred deadline

Timezone:
- relative date interpretation uses user timezone

## 17. Definition of Done

- 명확한 input module/package
- AIInterpreter interface
- deterministic test interpreter
- provider adapter boundary
- Zod structured-output schema
- InboxItem/ParsedEntity/DomainCommand repositories
- InputService
- CREATE_TASK end-to-end
- idempotency tests
- provenance tests
- local Supabase integration tests
- lint/typecheck/build/test PASS
- Discord dependency 0
- Calendar dependency 0
