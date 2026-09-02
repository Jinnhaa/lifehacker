# Codex Task — Repository + Supabase Database Foundation

## 목적

Foundation v0.3.2와 `docs/database-schema.md`를 실제 로컬 Supabase 개발환경으로 구현한다.

이번 Codex 사용의 이유는 **로컬 repo 파일 생성, dependency 설치, Supabase CLI 실행, SQL migration 작성, DB reset/test**가 필요하기 때문이다. 설계 자체를 다시 하지 않는다.

## 먼저 읽기

- AGENTS.md
- docs/foundation-status.md
- docs/database-schema.md
- docs/domain-model.md
- docs/architecture.md
- docs/requirements-matrix.md

## Step 1 — 환경 확인

먼저 다음을 확인하고 보고한다.

- 현재 repository 절대경로
- branch
- git status
- Node version
- pnpm 사용 가능 여부
- Docker-compatible runtime 사용 가능 여부

remote Supabase DB는 변경하지 않는다.

## Step 2 — 최소 repository bootstrap

현재 package.json이 없다면 pnpm workspace의 최소 root만 구성한다.

이번 작업에서 Next.js UI는 만들지 않는다.

필요:
- package.json
- pnpm-workspace.yaml
- Supabase CLI dev dependency
- .gitignore 보완

불필요:
- apps/web UI
- Discord
- Google Calendar
- AI SDK
- Agent SDK

Supabase CLI는 프로젝트 dependency로 pin한다.

## Step 3 — Supabase local init

현재 공식 Supabase CLI local workflow를 따른다.

- `supabase init`
- local config 생성
- secret commit 금지

Docker runtime이 없어 `supabase start`가 불가능하면 임의 workaround를 만들지 않는다. 필요한 사용자 setup을 보고하고, 가능한 파일 작업까지만 진행한다.

## Step 4 — migration 작성

`docs/database-schema.md`가 Source of Truth다.

migration을 domain별로 분리한다.

권장 순서:
1. identity_and_scope
2. goals_work_and_routines
3. tasks_and_execution
4. planning_and_events
5. input_and_integrations
6. decisions_and_personalization
7. workflows_and_notifications
8. agent_platform
9. rls_constraints_indexes
10. seed_foundation

중요:
- giant SQL 하나로 합치지 않는다.
- Foundation 의미를 임의 변경하지 않는다.
- 새 제품 기능을 추가하지 않는다.
- text + CHECK 정책을 따른다.
- UUID / timestamptz 원칙을 따른다.
- 모든 exposed user table에 RLS를 활성화한다.
- `auth.users`는 PK `id`만 FK 참조한다.
- raw secret/token column을 만들지 않는다.

## Step 5 — Critical invariant 구현

반드시 구현/검증:

- same-user ownership
- Task / Objective WorkContext consistency
- Course extension only on Course WorkContext
- one approved DailyPlan per user/date
- approved plan structure 직접 mutation 방지
- one active FocusSession per user
- RecurringActivity occurrence uniqueness
- Inbox/Command/Workflow/Notification idempotency uniqueness
- LearningCase Decision/Feedback consistency
- RLS

CHECK로 표현할 수 없는 cross-table invariant는 trigger/constraint trigger를 사용해도 된다.

## Step 6 — Local verification

환경이 가능하면 반드시 실행:

- Supabase local start
- migration replay / db reset
- seed
- database tests
- `git diff --check`
- TypeScript DB type generation

테스트는 최소 `docs/database-schema.md`의 Database Tests를 포함한다.

## Step 7 — 자체 리뷰

확인:
- migration을 처음부터 replay 가능한가
- dependency가 불필요하게 추가되지 않았는가
- Foundation과 schema가 충돌하지 않는가
- RLS 빠진 exposed table이 없는가
- secret이 Git 대상에 없는가
- destructive remote command를 실행하지 않았는가
- 아직 필요 없는 앱 기능을 만들지 않았는가

## 금지

- remote `db push`
- remote/production schema 수정
- UI 구현
- Discord/Calendar 구현
- Agent runtime 구현
- Foundation 의미 변경
- commit/push

## 보고 형식

A. Environment  
B. 생성/수정 파일  
C. Migration 목록  
D. 핵심 invariant 구현  
E. RLS  
F. 실행한 검증 명령과 결과  
G. 막힌 환경 설정  
H. 다음 단계

완료 후 commit하지 말고 결과만 보고한다.
