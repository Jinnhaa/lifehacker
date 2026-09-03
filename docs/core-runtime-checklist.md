# Core Runtime Internal Review Checklist

**Result target:** PASS

- Repository layer exists: REQUIRED
- Direct Supabase access outside repository: FORBIDDEN
- Task transition table explicit: REQUIRED
- State update + DomainEvent atomic: REQUIRED
- Invalid transition produces no event: REQUIRED
- Rules Engine contains no AI: REQUIRED
- Clock abstraction used in deterministic time logic: REQUIRED
- Cross-user repository tests: REQUIRED
- Unit tests for all transitions: REQUIRED
- No UI/Discord/Calendar dependencies: REQUIRED
