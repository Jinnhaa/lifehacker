import { describe, expect, it } from "vitest";
import { classifyBlockReason, formatRecovery } from "./focus-service.js";
import type { BlockCategory, FocusContext, RecoveryResult } from "./focus.js";

const context: FocusContext = {
  sessionId: "session", taskId: "task", planItemId: "item", taskTitle: "운영체제 과제",
  taskCompletionCriteria: "보고서 제출 가능 상태", estimatedMinutes: 60, nextAction: "개요 작성",
  steps: [{
    id: "step", position: 1, title: "서론 작성", owner: "user", estimatedMinutes: 20,
    completionCriteria: "서론 문단 완성", status: "pending"
  }],
  currentStep: {
    id: "step", position: 1, title: "서론 작성", owner: "user", estimatedMinutes: 20,
    completionCriteria: "서론 문단 완성", status: "pending"
  }
};

describe("Focus deterministic recovery", () => {
  it.each<[string, BlockCategory]>([
    ["뭘 해야 할지 모르겠어", "unclear"],
    ["너무 어려워", "hard"],
    ["하기 싫어서 미루고 있어", "avoidance"],
    ["완벽하게 해야 할 것 같아", "perfectionism"],
    ["교수님 자료가 없어", "missing_material"],
    ["기타 이유야", "other"]
  ])("maps %s to %s without AI", (input, category) => {
    expect(classifyBlockReason(input)).toBe(category);
  });

  it.each<[BlockCategory, string]>([
    ["unclear", "서론 작성"],
    ["hard", "두 개의 더 작은 실행 단위"],
    ["avoidance", "5분만"],
    ["perfectionism", "서론 문단 완성"],
    ["missing_material", "막힘 상태"],
    ["other", "가장 작은 다음 행동"]
  ])("returns the canonical %s recovery", (category, expected) => {
    const result: RecoveryResult = { context, category, detail: "교수님 강의자료", nextAction: null };
    expect(formatRecovery(result)).toContain(expected);
  });

  it("leaves ambiguous text unclassified", () => {
    expect(classifyBlockReason("그냥 그래")).toBeNull();
  });
});
