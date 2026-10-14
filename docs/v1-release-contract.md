# Lifehacker — V1 Release Closed Contract (2026-10-20)

- **Status:** APPROVED target; live pass status MUST be drawn from `ai-development/CURRENT-STATE.md` and `eval-results/latest.json`.
- **Deadline:** 2026-10-20, user-local Asia/Seoul.
- **Core delivery choice:** constraint-validated goal-based Chief with real observation → goal assessment → next Task → approval → execution → state refresh. Utility-based optimization is **not** a release prerequisite.
- **User-facing presentation:** existing tycoon Office and Learning UI; presentation never controls domain truth.

## 1. Canonical working priorities

1. Stabilize existing branch/previous Wave; preserve unmerged work, canonical Task ownership, migrations and user evidence.
2. Close Chief A01 at Core and DB/API level, including the approval boundary; then regress A02–A10.
3. Close real playback vs learning-authority data integrity and known historical provenance gaps without bulk overwrites.
4. Connect Course Recipe selection/edit → progress/remaining → next canonical Task → Chief and UI.
5. Complete a verified single end-to-end daily loop, mobile/desktop and release evidence.

**Do not reopen for V1:** multiple self-directed competing Chief agents, learned numerical utility weights, arbitrary full-office animation makeover, broad Notion sync, new duplicate planner/Task domain. `agent-architecture-closed-v1.md` and `learning-tycoon-closed-v1.md` own boundaries.

## 2. Release gate (no partial success claims)

| Gate | PASS proof |
|---|---|
| R01 State correctness | Official LMS playback != actual study; Source of Truth and dedupe tested via local DB; provenance preserved |
| R02 Chief priorities | Existing A01–A10 evals run at full stated behavioral scope; material trade-off gets approved and recorded before mutation |
| R03 Core execution | Plan/Current Action/Focus/completion/block/switch/replan/Day Close with persisted state and event history; E01 real DB/API E2E |
| R04 Learning | LT-01..LT-14 scenarios passing at applicable test levels; different course archetypes work without hardcoding |
| R05 Safety | Unauthorized external writes never execute; no security/permission regression; stale/unknown/failure safe fallback |
| R06 UI | Real browser test on mobile and desktop; reload, pending approval, empty/loading/error, actual station state truthful |
| R07 Deployment | Vercel URL and deployed SHA actually verified; migrations reconciled and rollback considered; no claim from local build alone |
| R08 Handoff | Independent session can read `AGENTS.md` → new contracts → `ai-development/{CURRENT-STATE,NEXT-ACTION,EVAL-MATRIX}.md` and continue with matching Git SHA |

**Final state:** `DONE` only if all R01–R08 PASS with evidence. Otherwise `PARTIAL` with explicit blockers and the highest-utility usable safe slice. A test count is not feature coverage. Do not relabel a BLOCKED test as PASS.

## 3. Verification record schema

For each gate capture: `id`, `owner`, `required_scenarios`, `branch`, `commit_sha`, `environment` (mock/local DB/staging/prod/browser), `command`, `observed result`, `PASS/FAIL/BLOCKED`, `evidence link/log path`, `known caveats`, `rollback` (when relevant), `last_verified_at`. Store current evidence in existing `docs/ai-development` artifacts, not this fixed contract.

## 4. Release/change control

- No destructive migration or production-data rewrite without explicit approval and backup/rollback strategy.
- Non-destructive doc or development changes can go through a PR; main merge depends on test/eval gate, not wishful timetable.
- Policy or user value decisions (important deadlines/goal removal/weight tradeoffs) require user approval.
- Existing `chief-p0-policy.md` owns current Chief behavior until a reviewed replacement explicitly changes its status.
- If remaining time is insufficient: prioritize verified end-to-end vertical slice and transparent incomplete status; never synthesize passing test reports.
