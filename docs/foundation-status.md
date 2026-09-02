# Foundation Status

**Version:** Foundation v0.3.2
**Status:** FROZEN — READY FOR DATABASE SCHEMA
**Date:** 2026-09-01

## Confirmed product decisions

1. Objective는 Goal 없이 standalone으로 만들 수 있으며, 필요하면 Goal 또는 WorkContext(Project/Course)에 연결할 수 있다.
2. RecurringActivity의 minimum_minutes는 optional이다. minimum 미달은 partial로 기록한다.
3. Dynamic Replan은 작은 시간 조정은 자동 처리하고, 큰 우선순위/Goal 제거/중요 deadline risk/Project 방향/외부 write는 사용자 승인을 받는다.
4. Project는 onboarding 완료 후 Project PM Agent를 기본 생성하며, 작은 Project는 전담 Agent를 끌 수 있다. Course는 School Agent, Goal/RecurringActivity는 Chief가 담당한다.

## Freeze Declaration

Foundation Freeze 완료.
새로운 사용자 요구사항 또는 Architecture Change가 없는 한
Foundation 설계를 다시 열지 않고 Database Schema 설계로 진행한다.

## Next step

`docs/database-schema.md` 설계
