# Core Work & Planning ERD

`supabase/migrations/0001~0017` 기준의 핵심 업무·계획·실행 관계다. 가독성을 위해 운영에 직접 필요한 주요 column만 표시한다.

```mermaid
erDiagram
    PROFILES ||--o{ SCOPES : owns
    PROFILES ||--o{ GOALS : owns
    PROFILES ||--o{ WORK_CONTEXTS : owns
    PROFILES ||--o{ TASKS : owns
    PROFILES ||--o{ DAILY_PLANS : owns

    SCOPES ||--o{ GOALS : bounds
    SCOPES ||--o{ WORK_CONTEXTS : bounds
    GOALS ||--o{ GOALS : parent_of
    GOALS ||--o{ OBJECTIVES : guides
    GOALS ||--o{ RECURRING_ACTIVITIES : protects
    WORK_CONTEXTS ||--o{ OBJECTIVES : frames
    WORK_CONTEXTS ||--o{ TASKS : contains
    OBJECTIVES ||--o{ TASKS : produces
    RECURRING_ACTIVITIES ||--o{ ACTIVITY_OCCURRENCES : instantiates

    TASKS ||--o{ TASK_STEPS : decomposes
    TASKS ||--o{ ESTIMATE_REVISIONS : revises
    TASKS ||--o{ TASK_DEPENDENCIES : task
    TASKS ||--o{ TASK_DEPENDENCIES : prerequisite

    DAILY_PLANS ||--|{ PLAN_ITEMS : contains
    TASKS ||--o{ PLAN_ITEMS : schedules
    ACTIVITY_OCCURRENCES ||--o{ PLAN_ITEMS : schedules
    PLAN_ITEMS ||--o{ FOCUS_SESSIONS : launches
    TASKS ||--o{ FOCUS_SESSIONS : focuses
    ACTIVITY_OCCURRENCES ||--o{ FOCUS_SESSIONS : focuses
    TASK_STEPS ||--o{ FOCUS_SESSIONS : current_step

    PROFILES {
        uuid id PK
        text timezone
        text locale
    }
    SCOPES {
        uuid id PK
        uuid user_id FK
        text kind
        uuid parent_scope_id FK
    }
    GOALS {
        uuid id PK
        uuid user_id FK
        uuid scope_id FK
        text level
        uuid parent_goal_id FK
        numeric progress
        text status
    }
    WORK_CONTEXTS {
        uuid id PK
        uuid user_id FK
        uuid scope_id FK
        text kind
        text status
        text agent_mode
    }
    OBJECTIVES {
        uuid id PK
        uuid goal_id FK
        uuid work_context_id FK
        date target_date
        text success_criteria
        text status
    }
    RECURRING_ACTIVITIES {
        uuid id PK
        uuid goal_id FK
        int target_count
        int expected_minutes
        text scheduling_mode
    }
    ACTIVITY_OCCURRENCES {
        uuid id PK
        uuid recurring_activity_id FK
        text period_key
        int sequence_no
        text status
    }
    TASKS {
        uuid id PK
        uuid work_context_id FK
        uuid objective_id FK
        date planned_date
        timestamp official_deadline
        int estimated_user_minutes
        text status
    }
    TASK_STEPS {
        uuid id PK
        uuid task_id FK
        int position
        text owner
        text skill_key
        uuid review_of_step_id FK
        text status
    }
    ESTIMATE_REVISIONS {
        uuid id PK
        uuid task_id FK
        text estimate_type
        int minutes
        text origin
    }
    TASK_DEPENDENCIES {
        uuid task_id PK, FK
        uuid prerequisite_task_id PK, FK
        timestamp created_at
    }
    DAILY_PLANS {
        uuid id PK
        date plan_date
        int revision_no
        text status
        uuid supersedes_plan_id FK
    }
    PLAN_ITEMS {
        uuid id PK
        uuid daily_plan_id FK
        uuid task_id FK
        uuid activity_occurrence_id FK
        text item_type
        int planned_minutes
    }
    FOCUS_SESSIONS {
        uuid id PK
        uuid task_id FK
        uuid activity_occurrence_id FK
        uuid plan_item_id FK
        uuid current_step_id FK
        int planned_minutes
        int actual_seconds
        text status
    }
```

## 핵심 해석

- Goal은 방향, Objective는 완료조건이 있는 결과, Task는 실행할 일이다.
- Project와 Course는 `WorkContext`로 통합한다.
- Task의 Goal은 Objective를 통해 유도하며 `goal_id`를 중복 저장하지 않는다.
- 실행 소유권은 Task가 아니라 `TaskStep.owner=user|ai`에 둔다.
- DailyPlan은 revision 단위로 immutable하게 보존한다.
- FocusSession은 Task 또는 Routine occurrence 중 정확히 하나를 대상으로 한다.
