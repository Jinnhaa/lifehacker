# Personalization & Clone ERD

사용자의 수정과 실제 결과가 검증 가능한 Pattern과 승인된 Principle로 발전하는 구조다.

```mermaid
erDiagram
    DECISIONS ||--o| DECISION_FEEDBACK : corrected_by
    DECISIONS ||--o{ LEARNING_CASES : frames
    DECISION_FEEDBACK ||--o{ LEARNING_CASES : explains
    LEARNING_CASES ||--o{ LEARNING_CASE_EVENTS : links
    DOMAIN_EVENTS ||--o{ LEARNING_CASE_EVENTS : evidence
    LEARNING_CASES ||--o{ OUTCOMES : produces
    LEARNING_CASES ||--o{ PATTERN_EVIDENCE : supports_or_contradicts
    PATTERNS ||--o{ PATTERN_EVIDENCE : accumulates
    PATTERNS ||--o{ PRINCIPLES : promoted_to
    SCOPES ||--o{ PRINCIPLES : bounds
    SCOPES ||--o{ PREFERENCES : bounds
    SCOPES ||--o{ MEMORIES : bounds
    DOMAIN_EVENTS ||--o{ MEMORIES : sources

    DECISIONS {
        uuid id PK
        uuid workflow_run_id FK
        text question
        jsonb ai_recommendation
        text ai_reason
        text status
    }
    DECISION_FEEDBACK {
        uuid id PK
        uuid decision_id FK
        jsonb user_choice
        text user_reason
        text corrected_ai_assumption
    }
    LEARNING_CASES {
        uuid id PK
        text case_type
        uuid decision_id FK
        uuid decision_feedback_id FK
        jsonb context_snapshot
        jsonb recommendation_snapshot
        text status
    }
    LEARNING_CASE_EVENTS {
        uuid learning_case_id PK, FK
        uuid domain_event_id PK, FK
        text event_role PK
    }
    DOMAIN_EVENTS {
        uuid id PK
        text event_type
        uuid aggregate_id
        uuid correlation_id
        jsonb payload
    }
    OUTCOMES {
        uuid id PK
        uuid learning_case_id FK
        uuid source_event_id FK
        text outcome_type
        boolean success
        numeric score
    }
    PATTERNS {
        uuid id PK
        text pattern_type
        jsonb condition
        text observed_behavior
        numeric confidence
        int evidence_count
        text status
    }
    PATTERN_EVIDENCE {
        uuid pattern_id PK, FK
        uuid learning_case_id PK, FK
        text direction
        numeric weight
    }
    PRINCIPLES {
        uuid id PK
        uuid scope_id FK
        uuid source_pattern_id FK
        text statement
        text confirmation_status
        text status
    }
    PREFERENCES {
        uuid id PK
        uuid scope_id FK
        text preference_key
        jsonb value
        text confirmation_status
    }
    MEMORIES {
        uuid id PK
        uuid scope_id FK
        uuid source_event_id FK
        text memory_type
        text retention_class
        text content
    }
    SCOPES {
        uuid id PK
        text kind
        text label
    }
```

## 학습 계약

```text
Context → Recommendation → User Choice/Reason → Action Event → Outcome
→ Pattern Evidence → Pattern Candidate → User Approval → Principle
```

- AI 요약문만으로 Pattern을 만들지 않는다.
- 한 번의 선택으로 사용자의 성향을 확정하지 않는다.
- Pattern 발견은 자동화할 수 있지만 Principle 적용은 사용자 승인이 필요하다.
- 현재 사용자 지시와 승인된 Desired behavior가 과거 Observed behavior보다 우선한다.
