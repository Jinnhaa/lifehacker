# Input Pipeline Internal Review Checklist

- AI directly mutates DB: FORBIDDEN
- Raw input persisted before parse: REQUIRED
- Structured output Zod validation: REQUIRED
- Field provenance preserved: REQUIRED
- explicit user value wins: REQUIRED
- Inbox idempotency: REQUIRED
- DomainCommand idempotency: REQUIRED
- CREATE_TASK uses existing TaskService: REQUIRED
- confirmation-needed path creates no Task: REQUIRED
- provider abstraction exists: REQUIRED
- deterministic test path exists: REQUIRED
- Discord/Calendar dependency: FORBIDDEN
