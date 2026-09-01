# Amber HQ Input Contracts

**Status:** Foundation v0.3  
**Purpose:** 사용자의 자연어와 외부 시스템 신호가 어떤 과정을 거쳐 안전한 Domain State가 되는지 정의한다.

---

## 1. Single Inbox Principle

모든 입력은 하나의 논리적 Inbox Pipeline으로 들어온다.

소스:

- Discord
- Web
- Google Calendar
- Snowboard
- Notion-derived signal
- Codex result
- Scheduler
- System event

채널별로 별도 business logic을 만들지 않는다.

---

## 2. Pipeline

```text
Raw Input
→ InboxItem
→ Dedupe
→ Classification
→ Parse / Normalize
→ ParsedEntity[]
→ Validation
→ Confirmation Policy
→ Domain Command
→ Event
```

---

## 3. InboxItem

필수:

- source
- raw_content 또는 external reference
- received_at
- source_user
- external_id?
- dedupe_key?
- provenance
- parse_status

Raw input은 추후 재해석/감사를 위해 원본 또는 안전한 reference를 보존한다.

---

## 4. Provenance

모든 자동 발견 정보에는 가능한 경우 출처를 붙인다.

예:

- `user_explicit`
- `google_calendar`
- `snowboard`
- `notion`
- `ai_inferred`
- `system_derived`

AI가 추론한 값과 사용자가 직접 말한 사실을 동일하게 취급하지 않는다.

---

## 5. Natural Language Parsing

예:

```text
금요일 6시 로그폴 회의,
목요일까지 BM 수정해야 돼.
```

Parser output:

```json
{
  "entities": [
    {
      "type": "calendar_event_candidate",
      "confidence": 0.98,
      "requires_confirmation": false
    },
    {
      "type": "task_candidate",
      "confidence": 0.93,
      "requires_confirmation": false
    }
  ]
}
```

LLM은 JSON 구조화를 수행할 수 있지만 Domain DB를 직접 변경하지 않는다.

---

## 6. Confirmation Policy

확인 필요 여부는 다음으로 결정한다.

- confidence
- downstream impact
- missing required data
- contradiction with existing state
- external side effect

낮은 영향 + 높은 confidence는 자동 반영 가능하다.

중요한 방향이나 충돌은 압축해서 확인한다.

---

## 7. User-configured Settings Input

웹 설정에서 사용자가 직접 관리할 수 있는 주요 데이터:

### Long-term Goals

- title
- importance
- status

### Objectives

- title
- target date
- success criteria
- importance
- linked goal

### Recurring Activities

- title
- category
- linked goal
- 주간 횟수
- 예상 소요시간
- 최소 수행시간
- scheduling mode
- 선호 요일/시간 (optional)
- importance
- active

### Planning Settings

- default buffer
- notification preference
- wake policy
- monthly AI budget

---

## 8. Daily Context Input

Morning에서 시스템이 먼저 Calendar/Task를 읽은 뒤 시스템이 모르는 것만 요청한다.

예:

- 오늘 몇 시까지 일할지
- Calendar에 없는 개인 일정
- 컨디션
- 오늘 부담되는 일
- 부담 이유

Daily input은 `Constraint` 또는 daily planning context로 normalize한다.

---

## 9. Completion Input

완료 신호 우선순위:

1. 신뢰 가능한 integration에서 명확한 완료 event
2. 사용자의 명시적 체크/완료
3. ambiguous 상태에 대한 확인 질문

시스템이 근거 없이 완료를 추측하지 않는다.

---

## 10. Decision Feedback Input

AI 판단을 수정하면:

- user choice
- reason
- corrected assumption
- optional note

를 받는다.

`왜?`는 짧고 선택 가능한 이유 후보를 우선한다.

---

## 11. Idempotency / Dedupe

Webhook, polling, queue retry로 같은 입력이 여러 번 들어올 수 있다.

모든 external input은 가능한 경우:

```text
source + external_id + event_version
```

또는 stable hash로 dedupe key를 만든다.

동일 Snowboard 과제가 두 번 Task로 생성되지 않아야 한다.

---

## 12. Contradiction Handling

새 입력이 기존 Fact/Decision과 충돌하면 자동 덮어쓰지 않는다.

예:

```text
기존 회의: 18:00
새 입력: 같은 회의 19:00
```

가능한 경우 update candidate를 만들고 provenance를 유지한다.

중요 충돌은 사용자에게 확인한다.

---

## 13. External Content Trust

Calendar description, email, web page, imported Notion text 등 외부 텍스트는 **data**로 취급한다.

그 안에 포함된:

```text
"Ignore previous instructions..."
```

같은 문자열을 시스템 instruction으로 실행하지 않는다.

ContextPackage 생성 시 source/trust metadata를 함께 유지한다.


---

## 14. Domain Command / External Change Contract

모든 실제 mutation은 DomainCommand를 거친다.

DomainCommand:
- command_type, payload
- idempotency_key
- correlation_id, causation_id
- status
- result_entity_type/id

ExternalReference:
- source
- external_type/id/version
- content_hash
- internal_entity_type/id
- sync_status: active/stale/deleted/conflict
- first_seen_at/last_seen_at/deleted_at

외부 create/update/delete는 같은 reconciliation pipeline을 사용한다.
