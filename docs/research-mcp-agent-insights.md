# Research Notes — MCP, Agent AI, Durable Automation

**Research date:** 2026-09-01  
**Purpose:** 최신 공식/주요 구현 가이드에서 Amber HQ에 적용할 설계 인사이트를 추출한다.

---

## 1. 핵심 결론

### MCP는 내부 Core가 아니라 외부 Capability Boundary다

MCP는 tool/context 연결을 표준화하는 데 강하다.

Amber HQ의 Task state, planning rules, routine progress, memory policy 같은 내부 Domain까지 MCP로 바꾸면 오히려 복잡해진다.

따라서:

```text
Amber Core Domain
    │
Tool Registry
    │
├─ Internal Function Tool
├─ Native API Adapter
├─ MCP Tool
└─ Agent-as-Tool
```

처럼 Tool Registry 아래의 한 종류로 취급한다.

---

## 2. MCP 2026-07-28 변화

최신 MCP revision은 stateless core로 전환되었다.

우리 적용:

- MCP protocol session에 business state를 저장하지 않는다.
- Amber HQ의 durable state는 Supabase에 둔다.
- 새 구현에서는 deprecated Roots / Sampling / Logging에 의존하지 않는다.
- remote long-running tool이 필요한 경우에만 MCP Tasks extension을 검토한다.
- HTTP routing/cacheability를 활용할 수 있는 구조를 우선한다.

---

## 3. Tool Risk

MCP tool annotations:

- readOnly
- destructive
- idempotent
- openWorld

은 유용하지만 **hint**다.

Untrusted MCP server의 annotation을 보안 contract처럼 믿지 않는다.

Amber HQ 내부 Tool Registry에 별도의 trusted policy metadata를 둔다.

---

## 4. Prompt Injection

고위험 조합:

```text
private data access
+
untrusted content
+
external communication / code execution
```

Calendar, web, Notion, future email을 동시에 다루는 Amber HQ에 매우 관련이 높다.

대응:

- least privilege tool grant
- external write approval
- sandbox for code execution
- source/trust provenance
- untrusted content를 instruction으로 취급하지 않음

---

## 5. Agent Orchestration

OpenAI Agents SDK와 Microsoft Agent Framework 모두:

- open-ended 작업 → Agent
- 정의된 단계 → Workflow/code

구분을 강조한다.

Amber HQ 적용:

### Code

- Morning
- Focus
- Recovery routing
- Day Close
- Wake
- Routine progress
- Replanning trigger

### Agent

- 복합 우선순위 판단
- 조사
- Task decomposition
- draft
- context synthesis

---

## 6. Manager vs Handoff

Amber HQ는 사용자가 Chief 하나와 대화하고 specialist가 뒤에서 일하는 UX다.

따라서 기본:

```text
Chief = Manager
Project/School/Research Agent = Agent-as-Tool
```

handoff는 specialist가 직접 사용자 대화를 가져가는 것이 분명히 유리한 경우에만 사용한다.

---

## 7. Human-in-the-loop

Agent 실행은 사용자 승인을 기다리며 오랫동안 서버를 붙잡고 있어서는 안 된다.

필요:

```text
ApprovalRequest
Workflow checkpoint
persist
pause
resume
```

OpenAI Agents SDK의 interruption/resume pattern을 사용할 수 있지만 canonical workflow state는 앱 DB에 둔다.

---

## 8. Agent Memory

OpenAI Agents SDK의 Session은 conversational persistence를 제공하지만 Amber Personal Memory와 동일하지 않다.

우리는:

```text
Session = 단기 대화
Supabase Personalization = 장기 기억
```

로 분리한다.

---

## 9. Observability

Agent 시스템은 prompt만 고치는 방식으로 운영하면 문제를 찾기 어렵다.

각 실행에서:

- model call
- tool call
- approval
- specialist delegation
- cost
- latency
- outcome

을 추적해야 한다.

사용자의 correction/why는 향후 eval dataset이 된다.

---

## 10. Durable Automation

Supabase는 현재 Postgres-native Queue와 Cron을 제공한다.

V1에는:

- Cron: wake/deadline/sync trigger
- Queue: background jobs / retries / delivery

를 우선 고려할 수 있다.

단, complex multi-step workflow + long human wait + retry가 많아지면 Trigger.dev 같은 durable workflow runtime을 후속 검토한다.

Temporal은 현재 개인용 V1에는 과도하다.

---

## 11. Idempotency

자동화에서는 retry보다 duplicate side effect가 더 위험할 수 있다.

모든 background workflow에 stable idempotency key를 둔다.

예:

```text
snowboard:{assignment_id}
wake:{user}:{date}:{target}:{attempt}
calendar-workblock:{plan_item_id}
```

---

## 12. Agent Extensibility

새 Agent는 코드 분기가 아니라:

```text
Template
+ Instance
+ Tool Grant
+ Context Scope
+ Approval Policy
```

등록으로 추가한다.

새 Agent가 기존 Core를 수정해야 한다면 Architecture Change로 분류한다.

---

## 13. Recommended Technology Position

### 지금

- Supabase Domain / Event / Memory
- code-driven workflow
- AI Gateway
- Tool Registry
- native Google Calendar / Discord
- optional OpenAI model calls

### Agent가 본격화될 때

- OpenAI Agents SDK TypeScript를 `AgentRuntime` adapter로 검토
- Manager + agents-as-tools
- HITL / tracing 활용
- MCP integration을 Tool Registry에 연결

### MCP

- 기존 좋은 MCP server가 있으면 사용
- 우리 capability를 다른 AI host에서 재사용할 이유가 생기면 Amber MCP server를 별도 노출
- V1 내부 domain command를 MCP로 감싸지 않음

---

## References

- Model Context Protocol, 2026-07-28 Specification release
  https://blog.modelcontextprotocol.io/posts/2026-07-28/
- MCP 2026 Roadmap update
  https://blog.modelcontextprotocol.io/posts/mcp-roadmap/
- MCP Tool Annotations as Risk Vocabulary
  https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- OpenAI Agents SDK — Agent Orchestration
  https://openai.github.io/openai-agents-js/guides/multi-agent/
- OpenAI Agents SDK — MCP
  https://openai.github.io/openai-agents-js/guides/mcp/
- OpenAI Agents SDK — Human in the loop
  https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- OpenAI Agents SDK — Sessions
  https://openai.github.io/openai-agents-js/guides/sessions/
- Microsoft Agent Framework — Overview / Workflows
  https://learn.microsoft.com/en-us/agent-framework/
- Supabase Queues
  https://supabase.com/docs/guides/queues
- Supabase Cron / Scheduled Edge Functions
  https://supabase.com/docs/guides/functions/schedule-functions
- Trigger.dev — Durable execution / idempotency
  https://trigger.dev/docs/how-it-works
