# Amber HQ Agent Extension Contract

**Status:** Foundation v0.3  
**Purpose:** Agent가 늘어나도 기존 Core와 기존 Agent가 깨지지 않는 확장 계약을 정의한다.

---

## 1. Core Principle

> **새 Agent 추가는 기존 시스템의 수정이 아니라 기존 Runtime에 새로운 Configuration과 Capability를 등록하는 작업이어야 한다.**

새 Agent 때문에 기존 Agent에 `if/switch` 분기를 추가하지 않는다.

---

## 2. Recommended Orchestration Pattern

Amber HQ의 기본 사용자-facing 주체는 **Chief**다.

Project PM, School Agent, Researcher 등은 기본적으로 Chief가 호출하는 **specialist-as-tool** 형태로 동작한다.

이유:

- 사용자 인터페이스를 Chief 하나로 유지
- 여러 Agent 결과를 Chief가 압축 가능
- 공통 guardrail / 예산 / approval 정책을 한곳에서 적용
- 사용자가 Agent들에게 직접 반복 설명할 필요 없음

전문 Agent가 사용자를 직접 상대해야 할 명확한 이유가 있을 때만 handoff를 검토한다.

예:

- 장시간 언어 튜터링 세션
- 특정 전문 Agent와 직접 multi-turn 대화가 UX상 명확히 유리한 경우

기본값은 handoff가 아니다.

---

## 3. Code-driven Workflow First

Morning, Day Close, Focus, Recovery, Wake 같은 단계가 명확한 프로세스는 **코드가 실행 순서를 결정**한다.

LLM Agent는 다음에만 사용한다.

- open-ended analysis
- ambiguous priority judgment
- research/synthesis
- draft generation
- context-sensitive intervention

Agent가 workflow 전체를 자유롭게 다시 설계하지 않는다.

---

## 4. Agent Definition

Agent는 다음의 조합이다.

```text
Agent
=
Template
+ Instance Scope
+ Instructions
+ Context Policy
+ Tool Grants
+ Permissions
+ Approval Policy
+ Model Policy
```

### AgentTemplate

역할의 재사용 가능한 정의.

### AgentInstance

Project/Goal/Context에 묶인 실제 instance.

Project마다 코드를 복사하지 않는다.

---

## 5. Additive Extension Rule

새 Agent 추가 시 허용:

- AgentTemplate 추가
- AgentInstance 추가
- 새 instruction 추가
- ToolGrant 추가
- Memory/Context scope 추가
- 새 Tool Adapter 추가
- 새 workflow capability 추가
- 테스트 추가

원칙적으로 금지:

- 기존 Agent instruction 임의 수정
- 기존 Agent permission 임의 확대
- 기존 workflow semantics 변경
- `if (agentName === "...")` 같은 special case
- 기존 event 의미 변경
- 기존 tool contract 깨기
- 기존 Agent가 새 Agent를 알아야만 동작하는 강결합

기존 Core 변경이 불가피하면 **Agent Addition이 아니라 Architecture Change**다.

사용자 승인 없이 진행하지 않는다.

---

## 6. Agent Versioning

AgentTemplate에는 version을 둔다.

예:

```text
project_pm v1
project_pm v2
```

새 AgentInstance는 기본적으로 최신 안정 version을 사용할 수 있다.

기존 AgentInstance는 자동으로 새 version으로 바꾸지 않는다.

기존 Agent migration은 명시적인 작업으로 수행한다.

AgentRun에는 반드시 `template_version`과 `policy_version`을 기록한다.

---

## 7. Tool Registry

Agent는 Tool을 코드에 직접 import해서 무제한 사용하는 것이 아니라 Registry/Grant를 통해 사용한다.

Tool key 예:

- `task.read`
- `task.create`
- `task.update`
- `calendar.read`
- `calendar.write`
- `notion.search`
- `notion.read`
- `research.web`
- `codex.execute`

Agent별로 필요한 Tool만 노출한다.

**모든 Agent에게 모든 Tool을 주지 않는다.**

---

## 8. Tool Risk Policy

각 Tool은 최소한 다음 risk metadata를 Amber HQ 내부에 가진다.

- read-only 여부
- destructive 여부
- idempotent 여부
- open-world 여부
- trust level
- private data access 여부
- external communication 여부
- execution/code capability 여부

MCP Tool Annotation이 존재하면 import할 수 있지만 **hint로만 취급**한다.

Amber HQ의 deterministic policy가 최종 approval 결정을 한다.

---

## 9. Approval Policy

기본 정책 예:

### 자동 실행 가능

- 내부 DB read
- 승인된 scope의 context read
- 자료조사
- read-only Notion search
- Calendar read
- reversible low-risk draft creation

### 조건부 자동 실행

- 내부 Task 생성/수정
- 승인된 Daily Plan에 따른 Work Block 생성
- Project 내부 reversible artifact 생성

### 사용자 승인 필요

- 외부 메시지 발송
- 외부 제출
- 삭제/destructive 작업
- permission 확대
- 중요한 전략 방향 변경
- 대규모 downstream 재작업을 유발하는 핵심 가정
- production/main에 영향을 주는 위험한 개발 작업

실제 정책은 `Decision Cost + Tool Risk`를 함께 본다.

---

## 10. Prompt Injection / Tool Composition Risk

Agent가 다음 세 가지 능력을 동시에 갖는 실행 경로는 고위험으로 본다.

1. private data 읽기
2. untrusted/open-world content 읽기
3. 외부로 데이터를 보내거나 코드를 실행할 수 있음

예:

```text
Calendar private data
+ Web/Email untrusted text
+ shell/external send
```

이 조합이 가능하면:

- tool scope를 줄이거나
- 외부 write에 approval을 요구하거나
- sandbox를 사용하거나
- sensitive context를 제거한다.

Untrusted content 안의 instruction을 시스템 지침으로 취급하지 않는다.

---

## 11. MCP Usage Policy

### MCP를 사용하는 곳

MCP는 **외부 Capability와 Context를 Agent에게 표준화해서 연결하는 boundary**로 사용한다.

좋은 후보:

- 외부 SaaS tool
- 여러 Agent/Client가 공통 사용해야 하는 capability
- third-party MCP server가 이미 안정적으로 존재하는 서비스
- 향후 ChatGPT/Codex 등 다른 host에서도 재사용할 도구

### MCP를 사용하지 않는 곳

다음은 굳이 MCP로 감싸지 않는다.

- Task state transition
- deadline 계산
- capacity 계산
- RecurringActivity progress
- internal Rules Engine
- Supabase 내부 domain command
- Morning workflow의 step control

내부 business logic을 MCP 호출의 연쇄로 만들지 않는다.

---

## 12. MCP Protocol Baseline

새로운 자체 MCP 구현을 한다면 **2026-07-28 계열을 기준**으로 한다.

주의:

- protocol session에 상태를 숨기지 않는다.
- application state는 Amber HQ DB에서 관리한다.
- deprecated Roots/Sampling/Logging에 새 의존성을 만들지 않는다.
- long-running remote tool이 필요할 때만 MCP Tasks extension을 검토한다.
- MCP의 `Task`와 Amber HQ의 사용자 `Task`는 다른 개념이다.

MCP server/client SDK version은 구현 시 공식 최신 stable을 확인한다.

---

## 13. MCP Tool Loading

MCP server의 tool surface가 큰 경우 모든 tool schema를 매 run prompt에 노출하지 않는다.

지원 runtime에서 가능하면:

- tool filtering
- deferred tool loading / tool search
- tool list caching

을 사용한다.

단, user/agent policy에 따라 Tool 목록이 달라지면 cache key에 policy identity를 포함하거나 caching을 비활성화한다.

---

## 14. Manager / Specialist Communication Contract

Chief가 specialist를 호출할 때 raw conversation 전체를 넘기지 않는다.

Structured Specialist Request:

```text
task
goal
scope
context_package
expected_output
constraints
decision_boundary
tool_grants
budget
```

Specialist response:

```text
result
confidence
assumptions
evidence
decisions_needed
artifacts
suggested_next_action
```

Chief는 specialist의 내부 장황한 output이 아니라 사용자에게 필요한 것만 압축한다.

---

## 15. Agent Run Boundary

모든 Agent run은 다음 제한을 가져야 한다.

- max turns
- max tool calls
- timeout
- token/cost budget
- allowed tool grants
- approval policy

AgentRun에는 적용된 `template_version`, `policy_version`과 위 실행 제한값을 snapshot으로 저장한다. 허용되지 않은 Tool 요청은 실행하지 않고 forbidden tool rejection으로 기록한다.

무한 self-reflection / agent-to-agent loop를 허용하지 않는다.

---

## 16. Durable Human-in-the-loop

사용자 판단을 기다리는 동안 process를 계속 열어두지 않는다.

```text
Agent/Workflow
→ ApprovalRequest
→ WorkflowRun = waiting_for_user
→ state/checkpoint 저장
→ process 종료 가능
→ 사용자 응답
→ resume
```

SDK 자체의 resumable state를 사용할 수 있어도 canonical business state는 Supabase에 남긴다.

---

## 17. Agent Memory Boundary

Agent session history와 Personal Memory를 동일한 것으로 취급하지 않는다.

### Session

현재 대화/실행에 필요한 단기 history.

### Personal Memory

Supabase에 저장된 장기 Fact/Decision/Experience/Pattern/Principle.

Agent 실행 시 ContextResolver가 필요한 Memory만 ContextPackage에 주입한다.

---

## 18. Agent Registration Checklist

새 Agent 추가 전:

1. 기존 Template로 표현 가능한가?
2. 새 Template가 정말 필요한가?
3. 어떤 Scope를 가져야 하는가?
4. 어떤 Memory만 읽어야 하는가?
5. 어떤 Tool이 필요한가?
6. 각 Tool은 어떤 승인 정책인가?
7. 기존 Core/Agent 변경이 필요한가?
8. 필요하다면 왜 extension point가 부족한가?
9. 비용 한도는?
10. 테스트는?

---

## 19. Required Tests for New Agent

최소:

- 기존 Agent regression
- tool grant enforcement
- forbidden tool rejection
- memory scope isolation
- approval escalation
- template version behavior
- budget/turn limit
- structured specialist response validation

Project A Agent가 Project B의 private project memory를 기본적으로 읽을 수 없어야 한다.

---

## 20. OpenAI Agents SDK Policy

OpenAI Agents SDK는 **Agent Runtime Adapter 후보**다.

사용한다면 장점:

- agents-as-tools
- handoffs
- human-in-the-loop
- sessions
- guardrails
- tracing
- MCP integration

하지만 Core Domain이 SDK에 종속되지 않게 한다.

예:

```text
AgentRuntime interface
    ├─ OpenAIAgentsRuntime
    └─ future runtime
```

V1의 deterministic workflow는 SDK Agent loop로 옮기지 않는다.

---

## 21. A2A Policy

Amber HQ 내부 Agent 간 통신을 위해 A2A 같은 cross-platform agent protocol을 V1에서 도입하지 않는다.

현재 Agent는 같은 애플리케이션/조직 내에 있고 Chief가 orchestration을 통제한다.

향후 **외부 조직이 운영하는 opaque Agent**와 상호작용해야 할 때만 별도 검토한다.


---

## 22. Scope Enforcement Contract

Agent isolation은 prompt가 아니라 data/repository/tool layer에서 강제한다.

- AgentInstance는 home_scope_id를 가진다.
- 추가 접근은 AgentScopeGrant로만 허용.
- ToolGrant도 optional scope를 가진다.
- deny가 allow보다 우선.
- ContextResolver와 repository query는 같은 policy identity 사용.
- 새 Agent는 Scope/Grant configuration 추가만으로 동작해야 한다.

## 23. Execution Trace Separation

- AgentRun: multi-step specialist run
- AIExecution: model call
- ToolCall: capability invocation
- Artifact: produced reusable result
