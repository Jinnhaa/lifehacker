  # Lifehacker Documentation

Lifehacker의 제품 비전, 정책, 구조, 데이터 모델을 찾기 위한 문서 인덱스다.

## 처음 읽는 순서

1. [Product Vision](./product-vision.md) — 무엇을 만들고 왜 만드는가
2. [Product Rules](./product-rules.md) — Chief가 어떻게 판단하고 행동하는가
3. [Product IA](./product-ia.md) — 사용자가 어떤 화면에서 경험하는가
4. [Architecture](./architecture.md) — 시스템이 어떻게 구성되는가
5. [Domain Model](./domain-model.md) — 핵심 개념과 책임 경계
6. [Database Schema](./database-schema.md) — 물리 데이터 구조
7. [Workflows](./workflows.md) — Morning부터 Day Close까지의 실행 계약

## 시각화

| 문서 | 답하는 질문 |
|---|---|
| [System Context](./diagrams/system-context.md) | 사용자, lifehacker, 외부 서비스는 어떻게 연결되는가? |
| [Operating Loop](./diagrams/operating-loop.md) | 발견부터 학습까지 전체 루프는 어떻게 닫히는가? |
| [Proactive Boundary](./diagrams/proactive-boundary.md) | Amber가 어디까지 먼저 하고 언제 승인을 받는가? |
| [Core ERD](./diagrams/erd-core.md) | 목표, 업무, 계획, 실행 데이터는 어떻게 연결되는가? |
| [Personalization ERD](./diagrams/erd-personalization.md) | 판단과 결과가 어떻게 Pattern과 Principle이 되는가? |
| [Automation & Agent ERD](./diagrams/erd-automation-agent.md) | Workflow, Agent, Tool, Artifact는 어떻게 연결되는가? |
| [Daily Loop Sequence](./diagrams/sequence-daily-loop.md) | 하루 운영 중 각 구성요소가 어떤 순서로 동작하는가? |

## Canonical 기준

- 제품 목적과 최종 경험: `product-vision.md`
- 제품 행동과 승인 정책: `product-rules.md`
- 화면 구조: `product-ia.md`
- 기술 경계: `architecture.md`
- Domain 의미: `domain-model.md`
- 실제 Schema Source of Truth: `supabase/migrations/*.sql`
- Workflow 계약: `workflows.md`
- Agent 확장 계약: `agent-contract.md`
- 개인화 계약: `personalization.md`

시각화는 이해를 돕는 파생 문서다. 시각화와 migration이 충돌하면 migration을 우선하고 시각화를 갱신한다.
