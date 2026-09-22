# Automation & Agent ERD

중단·재개 가능한 Workflow와 제한된 Agent 실행, Tool 권한, Artifact 생산 관계를 보여준다.

```mermaid
erDiagram
    WORKFLOW_RUNS ||--o{ APPROVAL_REQUESTS : checkpoints
    WORKFLOW_RUNS ||--o{ SCHEDULED_JOBS : schedules
    WORKFLOW_RUNS ||--o{ NOTIFICATIONS : emits
    WORKFLOW_RUNS ||--o{ AGENT_RUNS : orchestrates
    WORKFLOW_RUNS ||--o{ AI_EXECUTIONS : invokes
    WORKFLOW_RUNS ||--o{ TOOL_CALLS : invokes

    AGENT_TEMPLATES ||--o{ AGENT_INSTANCES : instantiates
    SCOPES ||--o{ AGENT_INSTANCES : home_scope
    AGENT_INSTANCES ||--o{ AGENT_SCOPE_GRANTS : receives
    SCOPES ||--o{ AGENT_SCOPE_GRANTS : grants
    AGENT_INSTANCES ||--o{ TOOL_GRANTS : receives
    TOOL_DEFINITIONS ||--o{ TOOL_GRANTS : grants
    SCOPES ||--o{ TOOL_GRANTS : bounds

    SCOPES ||--o{ CONTEXT_PACKAGES : bounds
    TASK_STEPS ||--o{ CONTEXT_PACKAGES : contextualizes
    AGENT_INSTANCES ||--o{ AGENT_RUNS : executes
    CONTEXT_PACKAGES ||--o{ AGENT_RUNS : supplies
    TASK_STEPS ||--o{ AGENT_RUNS : dispatches
    AGENT_RUNS ||--o{ AI_EXECUTIONS : contains
    AGENT_RUNS ||--o{ TOOL_CALLS : contains
    TOOL_DEFINITIONS ||--o{ TOOL_CALLS : executes
    APPROVAL_REQUESTS ||--o{ TOOL_CALLS : authorizes
    AGENT_RUNS ||--o{ ARTIFACTS : produces
    AI_EXECUTIONS ||--o{ ARTIFACTS : produces
    TASK_STEPS ||--o{ ARTIFACTS : fulfills
    ARTIFACTS ||--o{ ARTIFACTS : revises

    WORKFLOW_RUNS {
        uuid id PK
        text workflow_type
        text status
        text current_step
        jsonb checkpoint_state
        int checkpoint_version
        text idempotency_key
    }
    APPROVAL_REQUESTS {
        uuid id PK
        uuid workflow_run_id FK
        text action_type
        text action_hash
        int checkpoint_version
        text status
        text resume_idempotency_key
    }
    SCHEDULED_JOBS {
        uuid id PK
        uuid workflow_run_id FK
        text job_key
        timestamp run_at
        text status
    }
    NOTIFICATIONS {
        uuid id PK
        uuid workflow_run_id FK
        text channel
        text status
        text dedupe_key
    }
    AGENT_TEMPLATES {
        uuid id PK
        text template_key
        text version
        text role
    }
    AGENT_INSTANCES {
        uuid id PK
        uuid agent_template_id FK
        uuid home_scope_id FK
        text template_version
        text status
    }
    AGENT_SCOPE_GRANTS {
        uuid id PK
        uuid agent_instance_id FK
        uuid scope_id FK
        text access_level
    }
    TOOL_DEFINITIONS {
        uuid id PK
        text tool_key
        boolean read_only
        boolean destructive
        text default_approval_policy
        text version
    }
    TOOL_GRANTS {
        uuid id PK
        uuid agent_instance_id FK
        uuid tool_definition_id FK
        uuid scope_id FK
        text permission
        text approval_policy
    }
    CONTEXT_PACKAGES {
        uuid id PK
        uuid scope_id FK
        uuid task_step_id FK
        jsonb payload
        jsonb source_refs
        text policy_version
    }
    AGENT_RUNS {
        uuid id PK
        uuid agent_instance_id FK
        uuid workflow_run_id FK
        uuid context_package_id FK
        uuid task_step_id FK
        text skill_key
        text skill_version
        int attempt_number
        text status
    }
    AI_EXECUTIONS {
        uuid id PK
        uuid agent_run_id FK
        uuid workflow_run_id FK
        text provider
        text model
        text status
        numeric estimated_cost_krw
    }
    TOOL_CALLS {
        uuid id PK
        uuid agent_run_id FK
        uuid tool_definition_id FK
        uuid approval_request_id FK
        text status
    }
    ARTIFACTS {
        uuid id PK
        uuid source_agent_run_id FK
        uuid source_ai_execution_id FK
        uuid task_step_id FK
        uuid revision_of_artifact_id FK
        text verification_status
        text review_status
    }
    TASK_STEPS {
        uuid id PK
        text owner
        text skill_key
        text status
    }
    SCOPES {
        uuid id PK
        text kind
    }
```

## 실행 계약

- Workflow는 checkpoint를 DB에 저장하고 process 종료 후 재개할 수 있다.
- Agent의 scope와 tool 권한은 prompt가 아니라 repository/tool layer에서 강제한다.
- `deny` 권한이 `allow`보다 우선한다.
- AgentRun은 실행 묶음, AIExecution은 model call, ToolCall은 capability 호출, Artifact는 재사용 결과다.
- 외부 write와 파괴적 작업은 ApprovalRequest를 통과한다.
- Artifact 수정은 덮어쓰기가 아니라 revision chain으로 남긴다.
