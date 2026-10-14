# Lifehacker — Learning & Tycoon Closed Contract v1.0

- **Status:** APPROVED product and interaction contract — implementation/testing NOT verified
- **Date:** 2026-10-14
- **Consumers:** School/Learning specialist, Chief, Learning web app, Tycoon presentation
- **Dependencies:** `agent-architecture-closed-v1.md`, `chief-p0-policy.md`, `design-system.md`, existing `course-recipe.ts` and canonical Task domain
- **Decision:** Learning mode and unit are **recommended by AI/rules and editable by the user**; plans and next Tasks are created automatically within Core/approval constraints; **overall progress and remaining work are the first screen**.

## 1. Scope, user intent and non-goals

University and Certifications share a learning execution engine, not identical fixed screens. Users choose combinations of three learning approaches (A/B/C); widgets depend on enabled activities. Lifehacker prepares and schedules learning, never forces an assumed study method.

V1 explicitly excludes ungrounded GPA prediction, universal textbook ingestion, arbitrary mastery or linear levels based on time, a second Learning Task system, unlimited generated future Tasks, and game incentives that force needless learning or eliminate rest.

## 2. School/Learning specialist PEAS

- **P:** correct remaining scope, attributable activity completion and validation, fewer user adjustments, appropriate next executable mission, fewer duplicate/missed learning Tasks, no false mastery.
- **E:** class/certification with mixed lectures, readings, assignments, code labs, exams, external LMS and uncertain actual learning.
- **A:** propose/edit course strategy, project accurate progress/remaining workload, propose executable missions to canonical Task pipeline, request targeted missing information, return contextual evidence to Chief. No independent global priority, unsolicited external writes or submission.
- **S:** authorized Snowboard playback/material/assessment facts, existing learning units and explicit user study reports, verified quizzes/code/task submissions, Course Recipe and state histories, capacity from Chief.

## 3. Three composable approaches

| ID | Approach | Activities | Authoritative completion |
|---|---|---|---|
| A | Lecture / concept | view lecture, read notes/textbook, comprehend, revise | Lecture observation for *viewing activity only* according to explicit per-course policy; other study via user/verified learning events |
| B | Deliverable | read brief, research, compose/build artifact, review, submit | canonical Task/TaskStep explicit completion; external submission only when verified |
| C | Practice / repetition | run example, solve set, code, debug, retrain weak scope | user-completed practice and attributable evaluation/output evidence |

Any non-empty subset of A/B/C is valid. Exams and deadlines are assessments linked to activities, not a forced fourth approach. A study unit may be WEEK, MODULE or TOPIC when supported by the existing Course Recipe; a deliverable may instead be a Task with steps and explicit completion boundary. Never force a written essay into a MODULE × BASE learning table.

## 4. Course Recipe onboarding and editing

**Inputs:** course/certification goal, known syllabus and assessment criteria, linked materials, observed lecture scopes, prior user choices. Unknown fields remain UNKNOWN. **Recommendation:** use existing stable Presets if appropriate; course-title matching is only a proposal, never a binding permanent strategy. Existing P0 permits LLM for *large unit → actionable mission decomposition* only; richer AI recipe generation is future-gated by a versioned policy and eval, not silently authorized.

**Required interactions:** show suggested A/B/C, activity list, per-activity units, completion rule and external lecture policy; user can accept, toggle modes, add/reorder/remove activity, edit units or completion boundary, change default estimated effort or mark UNKNOWN. Save version/provenance. Existing records remain unchanged after a recipe change; orphaned scope mapping is surfaced for reconciliation, not deleted. Effective future missions use newest approved user settings; already-approved material schedule change follows Chief approval rules.

**No recommendation available:** show minimal editable A/B/C chooser and one empty activity; do not block a course merely because its title is unknown. **Conflict:** if auto sync differs from user-edited Recipe, preserve user choice and display a non-blocking review issue. **Failure:** restore previous saved recipe and show retry; no partial material rewrite.

## 5. Playback acceptance policy (per Course, user-editable)

- **SEPARATE (default):** official watch completion appears under `School attendance/playback` only; personal study activity completion requires user/verified activity evidence.
- **COUNT_LECTURE_ACTIVITY:** official completion may satisfy the explicitly mapped **lecture viewing activity only**. Must not set `learning_units.exposure`, `understanding`, `validation` automatically unless a separate user/verified learning action explicitly warrants that state. No double count if user also manually confirms the same lecture activity.
- **MANUAL:** lecture viewing activity completion is user-entered; observed LMS status remains a separate fact.

Changing policy must show effective before/after *derived display counts* before save and preserve original playback and user study event history; no retroactive mass update to user-authored evidence. Counts are derived from policy + eligible evidence without mutating source truth. A policy change affecting protected commitments triggers applicable Chief review/approval.

## 6. Progress semantics and projections

**No fictional single blended academic mastery percentage.** Show per activity/track `completed / total / remaining` only for comparable verified units; unknown denominator displays `total unknown` and no percent bar. Deliverables use completed milestone count and explicit submitted/not submitted, not study-unit percentage. Time spent and video playback never count as comprehension/mastery.

For each Learning Unit track separately:
- `Exposure`: NOT_STARTED / PARTIAL / COMPLETE from explicit study/execution evidence (not playback).
- `Understanding`: UNKNOWN / WEAK / OK / STRONG; may be explicit user declaration or supported assessment evidence and retains provenance.
- `Validation`: NOT_TESTED / FAILED / PASSED; PASS requires a named assessment and recorded threshold/result, or equivalent configured verifiable criterion.

All three are independent. `validation = PASSED` does not automatically turn `exposure = COMPLETE`; display independent facts instead of forcing an artificial progression order. Duplicate sync/event replay MUST NOT inflate any count.

**Remaining scope:** sum only known incomplete comparable units in each separate track; show due dates, estimated workload only when evidence-backed, and unknown when data incomplete. Closed definition of 'next': the highest-priority Chief-compatible next executable activity that is incomplete, unblocked, aligned with current Recipe, and not already represented by an active canonical Task. Missing prerequisites mean offer a scoped unblocking step or clarification, not guess the next lecture.

## 7. Closed UX architecture

### 7.1 Course overview (default landing)

First viewport on desktop and mobile: Course name, assessment risk/time, **activity-specific total / complete / remaining** overview, then a single `Next Learning Mission` with why/how much and status. Optional fold: detailed progress by unit, assessments, activity history. Primary tabs: `학습 현황`, `학습 계획`, `활동 기록`, `학습 설정`. Hidden approaches have no empty cards or fake zero bars.

Course list cards show: name, next known deadline, strongest known risk, 1–3 concise track counters; never mislabel watch completion as study. Tycoon world remains Office entry navigation, not a spreadsheet-like second management system. Course detail uses game-themed but readable panels (existing `design-system.md`) and accessible controls.

### 7.2 Recipe configuration

`학습 설정` initially recommends modes and activity units. Every adjustable item has `current`, `suggested`, `save/cancel`, and inline validation. One click returns to progress. No settings locked solely to course names. Important changes show consequences to existing plan and approval state. While saving: disable duplicate submit; on error retain unsaved input and old persisted data; on successful save reproject before success confirmation.

### 7.3 Loading / empty / offline / conflict

- **Loading:** skeleton of actual progress panels with non-deceptive pending status.
- **No connected LMS:** user can configure a course manually; data source marked disconnected.
- **No known total:** UNKNOWN, request one bounded input or show editable placeholder; no fabricated 0%.
- **Partial sync:** show `마지막 확인 시각`, stale badge and last reliable state; do not reset progress.
- **No next mission:** explain whether COMPLETE, UNKNOWN_SCOPE, BLOCKED, or NEEDS_USER_CHOICE; include a recovery action.
- **Recipe conflict:** preserve prior user strategy, show review without corrupting task history.
- **Mobile:** first viewport gives meaningful overview and next action; large grid becomes grouped progress rows; buttons touch-operable and focusable; no horizontal scrolling for mission controls.

## 8. Tycoon game contract: feedback, never fictitious learning

The visual layer maps evidence to world representation. Real functional Office stations correspond to Chief, Learning Studio, Reviews; the agent's animation mirrors authoritative runtime status (`idle`, `planning`, `working`, `waiting_for_user`, `blocked`, `error`). No idle character may imply an active AI job.

**Two non-interchangeable meters:**
1. `Mission Activity` = count of distinct verified completed executable actions/milestones. Entertainment stamp/animation; dedupe by domain-event identity. Does NOT measure skill.
2. `Learning Readiness / Verified Competence` = explicit learning dimensions and named assessments; progression exists only for matched evidence. No XP accumulation from stopwatch, watch playback, mere checkboxes without satisfying evidence, or repeated sync.

**Game display state rules:**
- `Not yet started`: no true study/completion evidence.
- `Studying`: attributable study-execution evidence or partial scope.
- `Scope covered`: configured explicit scope completion, but understanding/validation independently shown.
- `Understanding confirmed`: `Understanding=OK/STRONG` and evidence source shown; `Validation` may remain NOT_TESTED.
- `Verified milestone`: `Validation=PASSED` for named test or configured verifiable goal. Show which assessment, scope and date; no global mastery claim.

These are **labels/badges**, not a forced linear internal state machine. The UI may animate badge unlock only on a newly verified evidence transition, never on page reload; event idempotency prevents repeat awards. Course decoration milestones (e.g. bookshelf/station improvement) may be tied only to named, achieved task or learning milestones and remain reversible display projections, not policies. Streaks and game rewards must not pressure work during protected rest or feed back into Chief priorities.

## 9. Auto planning & canonical Task

Use existing `Course Recipe → Learning proposal → Reconciliation → canonical Task → World Model → Chief`. Do not add a separate study Task table or independent scheduler. Auto-materialize only the next executable mission(s) according to existing one-per-Course scope; user approval is required for material commitment changes, not routine low-risk proposal creation. Repeated reconciliation is idempotent. COMPLETE/PARTIAL/SKIP updates the authoritative target and reprojects remaining scope. A task cannot claim `submitted` merely because a step checkbox is checked unless submission criterion is verified. User can correct actual position without corrupting LMS observation.

## 10. Concrete test fixtures

| Fixture | Suggested composition (editable) | Core assertions |
|---|---|---|
| Writing/discussion course | B + optional A | essay/presentation stages, feedback, submit; **no forced MODULE** |
| Database theory | A + C | lecture count separate from concepts and SQL practice; changing playback policy affects lecture count only |
| Mobile programming | B + C | implementation and submission status independent from lab repetition |
| C programming | A + C | theory comprehension, example run, original coding, error/debug and exam assessment |
| JLPT or similar cumulative certificate | A + C | ongoing vocabulary/grammar/practice, calendar capacity protection; no course-name-coded planner exception |

Fixtures must use synthetic test identities and stable dates, not production student records. A specific user course may use a different saved combination.

## 11. Learning & game evaluation (mandatory)

| ID / test layer | Condition and exact expected result |
|---|---|
| LT-01 UI+DB | New unknown course: recommendation unavailable → editable modes/unit config; saving and reload preserves selection |
| LT-02 DB | User modifies Recipe after initial bootstrap; two Snowboard syncs preserve settings and old learning history |
| LT-03 API+DB | Completed watch with SEPARATE → watch=complete but own Exposure/Understanding/Validation untouched |
| LT-04 API+DB | COUNT_LECTURE_ACTIVITY → only mapped lecture viewing activity derived complete, never understanding/mastery; two syncs do not double count |
| LT-05 API+DB | MANUAL watch policy → external playback may exist but user activity completion remains independent |
| LT-06 Core+UI | Incomplete total/unknown scope → no percent, no time guarantee, finite targeted action to resolve gap |
| LT-07 Core+DB | A+C or B+C combination → activity-specific remaining and one next canonical Task; second reconciliation creates zero duplicates |
| LT-08 Core+UI | Recipe edit removes a component → source learning records kept, projections updated, obsolete task flagged for reconciliation rather than deleted |
| LT-09 Core+UI | Focus 2 hours or playback complete with no learning evidence → activity stats may reflect time/watch but no study mastery or validated badge |
| LT-10 UI | Assessment PASSED without Exposure COMPLETE → validation badge appears and exposure remains independent |
| LT-11 Browser mobile | Four different course archetypes + certificate → active panels visible, no forced layout, first viewport shows progress/remaining/next action |
| LT-12 Browser+API | Agent run fails → station shows error/blocked, no false working animation; Task can be continued manually |
| LT-13 Browser | Refresh during saved progress/mission action → state restored without repeated badge animation or duplicated event |
| LT-14 API+UI | Recipe policy change affecting important approved plan → old plan remains until required approval and correct proposed impact shown |

**Execution protocol:** Add LT scenario entries and exact test mappings in `evals/scenarios.json` once tests exist; evaluate data conditions using `pnpm test:unit`, `pnpm test` and `pnpm eval:db` with local Supabase. Before UI acceptance, establish a deterministic seeded browser workflow that navigates `/learning`, opens a Course, edits Recipe, saves, refreshes, changes policy, and observes resulting progress; record browser, viewport, deployed/local SHA and outcome. No dedicated Learning browser runner is verified today; until implemented and run, LT browser cases are BLOCKED. Validate all changes with `pnpm lint`, `pnpm typecheck`, `pnpm build`. Existing `pnpm test:e2e` is project AI E2E and cannot be treated as LT UI evidence.

**PASS =** stated assertions verified with evidence and relevant unit, DB/API and browser test artifacts. **BLOCKED =** no executable fixture or environment/test unavailable. **FAIL =** any assertion violated. Mock success cannot substitute for real DB/API/browser evidence; do not mark final DONE with LT-01..LT-14 unverified. These are new checks that complement, not replace, existing Chief A01–A10 and B01–B04.

## 12. Source changes and freeze control

Current `UniversityModal` has no complete University Recipe settings UX, and current MODULE × BASE table does not fit all courses. Implementation must start with a focused reuse/delta map for: `course-recipe.ts`, `supabase-university-learning-bootstrap-service.ts`, `learning-workspace-server.ts`, `learning-workspace.tsx`, `learning-workspace/actions.ts`, canonical Task reconciliation. No rebuild of the domain model unless an explicit incompatibility with test reproduction is shown. A new global utility optimizer is prohibited in this Learning wave.

To change a frozen aspect (A/B/C composition, editable suggestion, user completion authority, progress-first view, Task SSOT, non-inflating game progress), version this contract and add failing-before/passing-after Evals with decision owner approval.
