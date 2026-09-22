# Daily Operating Sequence

Morning부터 Day Close까지 사용자, Chief, deterministic Core, Specialist, DB가 협력하는 순서다.

```mermaid
sequenceDiagram
    actor User
    participant UI as Web / Discord
    participant Chief
    participant Core as Rules & Workflow
    participant Agent as Specialist
    participant DB as Supabase

    User->>UI: 일어남
    UI->>Core: Morning 시작
    Core->>DB: 일정·Task·Goal·제약 조회
    Core->>Core: 가용시간·위험·Capacity 계산
    Core-->>User: 시스템이 모르는 오늘 정보만 질문
    User-->>Core: 컨디션·개인 일정
    Core->>Chief: compact planning context
    Chief->>Agent: 필요한 선행작업 위임
    Agent-->>Chief: Artifact·근거·가정
    Chief-->>User: 핵심 결과·계획·승인 필요사항
    User-->>Core: 계획 승인 또는 수정
    Core->>DB: DailyPlan revision 저장
    Core-->>User: Current Action

    loop 실행 중
        User->>Core: 시작·완료·막힘·전환
        Core->>DB: FocusSession·DomainEvent 기록
        Core->>Core: 영향과 replan 필요성 계산
        alt 작은 변화
            Core->>DB: 정책 승인 Plan revision
        else 중요한 변화
            Chief-->>User: 변경안·이유·영향
            User-->>Core: 승인 또는 수정
            Core->>DB: 새 Plan revision
        end
        Core-->>User: 다음 Current Action
    end

    User->>UI: 오늘 끝
    UI->>Core: Day Close
    Core->>DB: 계획 대비 실제 집계
    Core->>DB: LearningCase·Outcome 저장
    Chief-->>User: 요약·Carryover·내일 준비
    Core->>DB: Pattern evidence와 wake checkpoint 저장
```

## 사용자가 직접 하지 않는 일

- 하루의 완료·미완료를 다시 설명하기
- 예상시간과 실제시간을 수동 합산하기
- 모든 일정 충돌을 직접 계산하기
- 작은 지연마다 전체 계획을 다시 짜기
- Specialist에게 프로젝트 맥락을 반복 전달하기

## 사용자가 계속 소유하는 일

- 큰 우선순위와 방향
- 중요한 변경의 승인
- 최종 결과 검토와 외부 제출
- 장기 Principle 승인
