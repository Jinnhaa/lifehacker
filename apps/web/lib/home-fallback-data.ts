export const homeFallbackData = {
  // TODO: DailyPlan read API 연결
  // TODO: active FocusSession API 연결
  // TODO: browser natural-language input API 연결
  quests: {
    main: { title: "모바일프로그래밍 UI 구현", minutes: 45 },
    next: { title: "TOEIC Part 5", minutes: 30 },
    fixedEvent: { title: "NEXTiME 회의", startsAt: "18:00" },
    hiddenCount: 5,
  },
  schedule: [
    { startsAt: "10:30", title: "모바일프로그래밍" },
    { startsAt: "12:00", title: "점심" },
    { startsAt: "16:00", title: "데이터베이스" },
    { startsAt: "18:00", title: "NEXTiME 회의" },
  ],
  intervention: {
    title: "Amber 제안",
    message: "오늘 가용시간보다 예정 작업이 1시간 50분 많아요.",
    recommendation: "우선순위가 낮은 2개를 내일로 넘기는 걸 추천해요.",
  },
  goals: {
    today: [
      { name: "모바일프로그래밍", outcome: "과제 진척 확보", status: "60%" },
      { name: "TOEIC 900+", outcome: "주간 페이스 유지", status: "오늘 1회 남음" },
      { name: "NEXTiME", outcome: "제출 위험 해소", status: "보고서 검토 필요" },
    ],
    week: [
      { name: "모바일프로그래밍", outcome: "핵심 화면 완성", status: "3개 화면 남음" },
      { name: "TOEIC 900+", outcome: "학습 루틴 유지", status: "2회 남음" },
      { name: "NEXTiME", outcome: "피드백 반영", status: "검토 중" },
    ],
    month: [
      { name: "포트폴리오", outcome: "대표 사례 정리", status: "진행 중" },
      { name: "학업", outcome: "중간 마감 안정화", status: "양호" },
      { name: "NEXTiME", outcome: "다음 마일스톤 확정", status: "결정 필요" },
    ],
  },
  agents: {
    chief: { name: "Chief", status: "working", detail: "오늘의 우선순위를 정리하는 중" },
    project: [
      { name: "LogFolio PM", status: "working", detail: "포트폴리오 사례 구조화" },
      { name: "NEXTiME PM", status: "waiting_decision", detail: "보고서 방향 확인 필요" },
      { name: "Research", status: "idle", detail: "대기 중" },
    ],
  },
  decisionCount: 2,
} as const;

export type GoalPeriod = keyof typeof homeFallbackData.goals;
