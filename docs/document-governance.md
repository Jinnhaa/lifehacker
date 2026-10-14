# Lifehacker — Documentation Governance and Cleanup Ledger v1.0

- **Status:** APPROVED documentation lifecycle policy; repository migrations performed only via reviewed branch/PR.
- **Goal:** one active source of truth per product question; obsolete implementation plans are discoverable in history but cannot silently overrule current contracts.

## 1. Four document classes

| Class | Contents | Read by Codex? | Allowed to govern implementation? |
|---|---|---|---|
| CANONICAL | Active vision, domain boundaries, current approved runtime policies, architecture, workflows, migrations | Yes, only relevant slices | Yes in owned domain |
| CLOSED SPEC | Versioned input/state/actions, exceptions, authority, Evals, explicit non-goals | Yes for assigned work | Yes within scope and precedence |
| OPERATIONAL | Branch SHA, Wave, open issues, test evidence, next action | At session resume | Indicates **actual state**, never overrides policy |
| HISTORICAL | Foundation drafts, old checklists, prior weekly targets, research | No by default | No; citation/context only |

**Interpretation precedence:** explicit current user decision and applicable AGENTS instructions → newer specifically scoped approved Closed Spec → current scoped canonical policy → technical architecture/contracts → historical/working notes. Conflicts with explicitly FROZEN policies require a versioned ADR and review, not an implicit override. DB schema facts come from `supabase/migrations` and running code; README summaries do not replace them.

## 2. Minimal active navigation

Start: `AGENTS.md` → `docs/README.md` → `docs/agent-architecture-closed-v1.md` for Agent decisions → `docs/learning-tycoon-closed-v1.md` for Learning/game work → `docs/v1-release-contract.md` for deadline/release → relevant `chief-p0-policy.md`, `agent-contract.md`, `work-schedule-policy.md`, `design-system.md`, domain files → `docs/ai-development/{CURRENT-STATE,NEXT-ACTION,EVAL-MATRIX}.md` for live evidence.

Do not read all historical docs each Codex session. Use relevant slices from existing canonical documents, record file paths in handoff. No new document without clear ownership and a change-control line.

## 3. Cleanup decision register

| Old root doc | Disposition | Why | Replacement/current authority |
|---|---|---|---|
| `v1-scope.md` | ARCHIVE | old one-week bootstrap plan and UI-deferred assumptions conflict with present V1 | `v1-release-contract.md` + live `ai-development` |
| `foundation-status.md` | ARCHIVE | 2026-09-01 `READY FOR DATABASE SCHEMA`, no longer current phase | `decision-log.md`, migrations, live handoff |
| `database-schema-checklist.md` | ARCHIVE | historical Foundation PASS not runtime DB proof | migrations, integration tests, Eval Matrix |
| `core-runtime-checklist.md` | ARCHIVE | early internal build checklist | existing Core code/tests, Eval Matrix |
| `input-pipeline-checklist.md` | ARCHIVE | early internal review checklist | `input-contracts.md`, tests, Eval Matrix |
| `core-runtime.md` | ARCHIVE | foundational v0.1 implementation-ready blueprint, not current runtime contract | `architecture.md`, `workflows.md`, current Core code |
| `input-pipeline.md` | ARCHIVE | foundational v0.1 build blueprint | `input-contracts.md`, current input implementation |
| `research-mcp-agent-insights.md` | ARCHIVE | dated external research notes, not approved policy | `agent-contract.md`, new agent ADR |

**Do not archive automatically:** `chief-p0-policy.md`, `chief-p0-eval.md`, `decision-log.md`, `decisions/*`, `agent-contract.md`, `product-vision.md`, `product-rules.md`, `product-ia.md`, `design-system.md`, `architecture.md`, `domain-model.md`, `database-schema.md`, `workflows.md`, `work-schedule-policy.md`, `requirements-matrix.md`, `personalization.md`, `workstyle.md`, `input-contracts.md`, active `ai-development/*` — they still govern or document actively tested decisions. They may need later content-level refactoring, not silent deletion.

Other docs (e.g. Notion operations) remain specialized references. A suspect runtime claim must be verified against code before archiving or editing.

## 4. Migration procedure and acceptance

1. Verify clean working tree, correct feature branch and current SHA; do not rewrite current feature or main.
2. Create separate docs branch based on current feature head.
3. Move each `ARCHIVE` source to `docs/archive/2026-10-foundation/` with `git mv` (Git history preserved).
4. Repair markdown links to moved files, and change Codex references to new current release contracts.
5. Update `docs/README.md`, scoped UI reference notes, `AGENTS.md`, and handoff; leave frozen Chief policy untouched.
6. Run link/consistency checks and inspect staged diff; no code/DB/lockfile changes.
7. Commit docs-only and create PR **into feature branch**, not `main` until feature integration.

**Acceptance:** root docs index navigates to one current policy per topic; every archived item is explicitly labeled historical; no `AGENTS.md` instruction sends Codex to an obsolete file; no broken local markdown links introduced by moves; `git diff --name-status` shows only docs and minimal navigation edits; relevant eval/handoff files and decisions are untouched. If a required check fails, stop and repair before commit.

## 5. Closed Spec template for future changes

Every Closed Spec MUST contain: `ID/version/owner/status`; purpose and non-goals; input schema and authority; preconditions/invariants; user/control boundary; normative behavior incl. success/failure/unknown/retry; data transitions and idempotency; interactions/loading/empty/conflict if UI; performance/cost limits if runtime; fixture table and automated eval (command, evidence, PASS/FAIL/BLOCKED); release gate; migration/backward compatibility; rollback; supersedes/precedence and change-control. If a material rule is unsettled, explicitly mark `DECISION_REQUIRED` with prohibited actions until resolved.
