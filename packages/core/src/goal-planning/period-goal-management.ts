import type { UserId } from "@amber/shared";
import { z } from "zod";
import type { ObjectiveProgressMode, PlanningGoalLevel } from "./goal-progress.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "날짜를 확인해 주세요.");
const title = z.string().trim().min(1).max(300);
export const periodGoalInputSchema = z.object({
  title, level: z.enum(["MONTHLY", "WEEKLY"]),
  periodStart: date.nullable(), periodEnd: date.nullable(), parentGoalId: z.uuid().nullable()
}).refine((input) => !input.periodStart || !input.periodEnd || input.periodStart <= input.periodEnd,
  "종료일은 시작일보다 빠를 수 없습니다.");
export type PeriodGoalInput = z.infer<typeof periodGoalInputSchema>;
export const periodObjectiveInputSchema = z.object({
  title, goalId: z.uuid(), progressMode: z.enum(["STATUS", "TASK_COUNT", "NUMERIC"]),
  status: z.enum(["active", "achieved"]), successCriteria: z.string().nullable(), targetDate: date.nullable(),
  targetValue: z.number().finite().nullable(), currentValue: z.number().finite().nullable(), unit: z.string().nullable()
}).superRefine((input, ctx) => {
  if (input.progressMode === "NUMERIC" && (input.targetValue === null || input.targetValue <= 0 || input.currentValue === null || input.currentValue < 0)) {
    ctx.addIssue({ code: "custom", message: "수치 목표는 목표값 > 0, 현재값 ≥ 0이어야 합니다." });
  }
  if (input.progressMode !== "STATUS" && input.status !== "active") {
    ctx.addIssue({ code: "custom", message: "완료 상태는 STATUS 목표에만 직접 지정할 수 있습니다." });
  }
}).transform((input) => ({ ...input,
  targetValue: input.progressMode === "NUMERIC" ? input.targetValue : null,
  currentValue: input.progressMode === "NUMERIC" ? input.currentValue : null,
  unit: input.progressMode === "NUMERIC" ? input.unit : null
}));
export type PeriodObjectiveInput = z.infer<typeof periodObjectiveInputSchema>;

export function validatePeriodGoalParent(input: PeriodGoalInput, parent: { id: string; level: PlanningGoalLevel; status: string } | null, id?: string): void {
  if (!input.parentGoalId) return;
  if (!parent || parent.id === id || parent.status !== "active" || parent.level !== (input.level === "WEEKLY" ? "MONTHLY" : "LONG_TERM")) {
    throw new Error("상위 Goal의 종류와 소유권을 확인해 주세요.");
  }
}

export interface PeriodGoalManagementRepository {
  saveGoal(userId: UserId, id: string | null, input: PeriodGoalInput): Promise<string>;
  archiveGoal(userId: UserId, id: string): Promise<void>;
  saveObjective(userId: UserId, id: string | null, input: PeriodObjectiveInput): Promise<string>;
  cancelObjective(userId: UserId, id: string): Promise<void>;
}
export class PeriodGoalManagementService {
  constructor(private readonly repository: PeriodGoalManagementRepository) {}
  saveGoal(userId: UserId, id: string | null, input: unknown) {
    if (id) z.uuid().parse(id);
    return this.repository.saveGoal(userId, id, periodGoalInputSchema.parse(input));
  }
  archiveGoal(userId: UserId, id: string) { return this.repository.archiveGoal(userId, z.uuid().parse(id)); }
  saveObjective(userId: UserId, id: string | null, input: unknown) {
    if (id) z.uuid().parse(id);
    return this.repository.saveObjective(userId, id, periodObjectiveInputSchema.parse(input));
  }
  cancelObjective(userId: UserId, id: string) { return this.repository.cancelObjective(userId, z.uuid().parse(id)); }
}

export type PeriodObjectiveView = {
  id: string; title: string; goalId: string; progressMode: ObjectiveProgressMode; status: string;
  successCriteria: string | null; targetDate: string | null; targetValue: number | null;
  currentValue: number | null; unit: string | null; progressLabel: string;
};
