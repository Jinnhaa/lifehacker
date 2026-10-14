# Lifehacker — Current Documentation Index

**Status:** ACTIVE navigation. Start here rather than scanning every `docs/*.md` file.

## 0. Reading route (minimum)

1. [`AGENTS.md`](../AGENTS.md) — repository execution/approval rules.
2. [`agent-architecture-closed-v1.md`](./agent-architecture-closed-v1.md) — **ratified agent ADR**, Chief PEAS, V1 goal-based planner, utility migration gates, safety and Eval.
3. [`learning-tycoon-closed-v1.md`](./learning-tycoon-closed-v1.md) — **ratified Learning/tycoon contract**: study-mode composition, source authority, progress, missions, truthful level-up, UI and Eval.
4. [`v1-release-contract.md`](./v1-release-contract.md) — **2026-10-20** release gates, evidence requirements, current execution priorities.
5. [`ai-development/CURRENT-STATE.md`](./ai-development/CURRENT-STATE.md) and [`ai-development/NEXT-ACTION.md`](./ai-development/NEXT-ACTION.md) — actual branch/eval/blockers; revalidate Git SHA before trusting.

## 1. Canonical topic owners

| Question | Owns it |
|---|---|
| Product purpose & values | [`product-vision.md`](./product-vision.md) |
| Current Chief P0 runtime and allowed LLM use | [`chief-p0-policy.md`](./chief-p0-policy.md) + [`chief-p0-eval.md`](./chief-p0-eval.md) |
| Agent target / PEAS / future utility | [`agent-architecture-closed-v1.md`](./agent-architecture-closed-v1.md) |
| Learning behavior / game truth / progress-first UI | [`learning-tycoon-closed-v1.md`](./learning-tycoon-closed-v1.md) |
| General user behavior, preferences and policies | [`product-rules.md`](./product-rules.md) |
| Task, deadline, schedule source and approval | [`work-schedule-policy.md`](./work-schedule-policy.md) |
| Agent scope, tools, extensions, permissions | [`agent-contract.md`](./agent-contract.md) |
| Global IA / office UI / style | [`product-ia.md`](./product-ia.md) + [`design-system.md`](./design-system.md) |
| Runtime/data architecture | [`architecture.md`](./architecture.md) + [`domain-model.md`](./domain-model.md) + [`workflows.md`](./workflows.md) |
| Physical DB schema | `supabase/migrations/*.sql` first; [`database-schema.md`](./database-schema.md) for human reference only |
| Input interface and provenance | [`input-contracts.md`](./input-contracts.md) |
| Personalization/workstyle | [`personalization.md`](./personalization.md) + [`workstyle.md`](./workstyle.md) |
| Existing requirement trace | [`requirements-matrix.md`](./requirements-matrix.md) |
| Historical decisions | [`decision-log.md`](./decision-log.md) + [`decisions/`](./decisions/) |
| Current code/test/deployment truth | [`ai-development/`](./ai-development/) and inspected Git commit / tests |

**Precedence:** Follow [`document-governance.md`](./document-governance.md). New Closed Spec is scoped and does not silently override current frozen Chief P0 or Core permissions. For Learning specifics the new Closed Spec controls over older examples in `product-ia.md` and `design-system.md`; those remain style and global navigation owners.

## 2. Evaluation and session recovery

- [`ai-development/MISSION.md`](./ai-development/MISSION.md): recovery contract.
- [`ai-development/WAVE-ROADMAP.md`](./ai-development/WAVE-ROADMAP.md): Wave handoff and release plan.
- [`ai-development/EVAL-MATRIX.md`](./ai-development/EVAL-MATRIX.md): existing executable Evals and gaps.
- [`ai-development/eval-results/latest.json`](./ai-development/eval-results/latest.json): dated test observation; **not** a blanket release PASS.
- New AG-/LT- scenarios in the two Closed Specs are **contract cases**, not automatically passing tests. Add test evidence before declaring completion.

## 3. Historical / non-canonical material

- [`archive/2026-10-foundation/README.md`](./archive/2026-10-foundation/README.md): original Foundation/v0.1 implementation notes, checklists, and one-week scope; for historical investigation only.
- [`document-governance.md`](./document-governance.md): cleanup ledger, document lifecycle and Closed Spec checklist.
- Architecture diagrams in [`diagrams/`](./diagrams/) are derived illustrations. `migrations` and active runtime contracts take precedence.
- Topic-specific runbooks (for example `notion-work-intake.md`) are reference documents; verify live integration behavior against code before use.

**No indiscriminate whole-repo rereads:** Inspect `AGENTS.md`, this index, the relevant owning contract and current handoff, then read only files needed for the current Wave.
