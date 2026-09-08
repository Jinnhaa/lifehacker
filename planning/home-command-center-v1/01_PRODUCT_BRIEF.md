# Home Command Center V1 — Product Brief

## Why

Amber HQ의 Core Loop가 실제 생활에서 작동하려면 사용자가 Task, 일정, Project, Goal, Agent 상태를 오가며 다음 행동을 계산하지 않아야 한다. Home은 이 계산 결과를 실행으로 이어 주는 진입점이다.

## Primary User

일정, 학업, 프로젝트, 장기 목표를 통합 관리하며 매 순간 무엇을 먼저 해야 하는지 판단하는 비용을 줄이고 싶은 단일 사용자다.

## User Problem

사용자는 계획이 있어도 현재 일정과 진행 상태를 다시 확인하고 지금 할 일을 골라야 한다. 정보가 많을수록 시작은 늦어지고 Home 자체가 또 하나의 관리 화면이 된다.

## Core Value

Home에 진입한 사용자가 별도 탐색 없이 다음 한 가지 행동을 이해하고 바로 Focus를 시작할 수 있게 한다.

> 지금은 이것만 하면 돼.

## Product Principle

- Home은 모든 데이터를 보여주는 dashboard가 아니라 행동을 압축하는 command center다.
- 정보 우선순위는 `Current Action → Today Flow → 핵심 Goal → Agent Office`다.
- 장식보다 사용자의 다음 행동과 판단에 직접 필요한 정보를 우선한다.
- 기존 하루 운영 Core Loop를 소비하며 별도 제품 흐름을 만들지 않는다.

## MVP Scope

- Current Action과 Focus 시작
- 고정 일정과 계획 항목을 함께 보여주는 Today Flow
- 현재 상태와 필요한 행동이 보이는 핵심 Goal 최대 3개
- 사용자 행동 또는 판단과 연결된 Agent Office 상태
- Focus 시작, 일시정지, 재개, 완료와 필요한 경우 전환
- empty, loading, error 상태와 responsive baseline

## Non-goals

- 월간 Calendar와 복잡한 일정 관리
- 지난 통계 상세, 성장 분석, 다수 KPI
- 모든 Project 상세 상태
- 내부 Agent log 또는 reasoning 노출
- 다수 Agent 자유 대화와 관리자용 monitoring
- 장식 중심의 게임 또는 타이쿤 시스템

## Success Criteria

- 사용자는 Home 진입 후 매우 짧은 시간 안에 별도 화면 탐색 없이 지금 해야 할 행동을 말할 수 있다.
- 실행 가능한 Current Action이 있으면 한 번의 primary action으로 Focus 진입을 시작할 수 있다.
- 오늘의 고정 일정과 계획된 실행 흐름을 한 영역에서 파악할 수 있다.
- Home이 전체 상태 확인이나 세부 관리 작업을 요구하지 않고 Core Loop 실행으로 이어진다.
