# Database Schema Review Checklist

**Target:** `docs/database-schema.md` v0.1  
**Internal result:** PASS

## Foundation consistency
- Goal / Objective separate: PASS
- Project / Course → WorkContext: PASS
- Task direct Goal FK 없음: PASS
- RecurringActivity canonical: PASS
- Weekly target owned by RecurringActivity: PASS
- DailyPlan immutable revision: PASS
- Current Action derived: PASS
- Pause = FocusSession: PASS
- Event = DomainEvent only: PASS
- Clone = Decision → Feedback → LearningCase → Pattern → Principle: PASS
- Pattern Candidate = Pattern.status=candidate: PASS
- Agent additive extension supported: PASS
- Generic Scope / Grants: PASS
- Durable approval/resume supported: PASS
- AIExecution canonical cost source: PASS
- MCP state excluded from core DB: PASS

## Product requirement coverage
- Long/short goals: PASS
- Weekly routines + duration: PASS
- Household/study routines: PASS
- Course assessment: PASS
- School learning/output execution mode: PASS
- Natural language input pipeline: PASS
- Morning constraints: PASS
- Planning/replan: PASS
- Focus/recovery/switch: PASS
- Decision Why: PASS
- Clone evidence storage: PASS
- Project PM Agent lifecycle support: PASS
- Tool permissions: PASS
- Notification suppression/retry: PASS
- AI cost measurement: PASS

## Physical consistency
- UUID PK: PASS
- timestamptz for instants: PASS
- user_id for RLS: PASS
- core relations normalized: PASS
- JSONB limited to snapshots/dynamic payload: PASS
- idempotency keys identified: PASS
- partial unique indexes identified: PASS
- cross-table trigger invariants identified: PASS
- RLS strategy identified: PASS
- raw secrets prohibited: PASS
- archive/retention identified: PASS

## User decision required before implementation
None.

남은 선택은 제품 정책이 아니라 구현 세부사항이며, `database-schema.md`의 원칙 안에서 구현 단계에서 결정한다.
