import type { UserId } from "@amber/shared";
import { z } from "zod";

export const exposureStateSchema = z.enum(["NOT_STARTED", "PARTIAL", "COMPLETE"]);
export const understandingStateSchema = z.enum(["UNKNOWN", "WEAK", "OK", "STRONG"]);
export const validationStateSchema = z.enum(["NOT_TESTED", "FAILED", "PASSED"]);
const titleSchema = z.string().trim().min(1, "제목을 입력해 주세요.").max(300);
const positionSchema = z.number().int().positive().max(2147483647);
const learningUnitLinks = {
  stageId: z.uuid().nullable().optional(),
  materialId: z.uuid().nullable().optional(),
  sequenceNo: positionSchema.nullable().optional(),
  unitType: z.string().trim().min(1).nullable().optional(),
  canonicalTopicKey: z.string().trim().min(1).nullable().optional()
};
const createSchema = z.object({
  ...learningUnitLinks,
  title: titleSchema, position: positionSchema.nullable().default(null),
  exposureState: exposureStateSchema.default("NOT_STARTED"),
  understandingState: understandingStateSchema.default("UNKNOWN"),
  validationState: validationStateSchema.default("NOT_TESTED")
});
const updateSchema = z.object({
  ...learningUnitLinks,
  title: titleSchema.optional(), position: positionSchema.optional(),
  exposureState: exposureStateSchema.optional(), understandingState: understandingStateSchema.optional(),
  validationState: validationStateSchema.optional()
}).refine((input) => Object.keys(input).length > 0, "변경할 값을 입력해 주세요.");

export type LearningUnitCreate = z.infer<typeof createSchema>;
export type LearningUnitUpdate = z.infer<typeof updateSchema>;
export interface LearningUnit {
  readonly id: string; readonly userId: UserId; readonly workContextId: string;
  readonly title: string; readonly position: number;
  // Optional for legacy in-memory callers; persisted V2 rows return explicit nullable links.
  readonly stageId?: string | null;
  readonly materialId?: string | null;
  readonly sequenceNo?: number | null;
  readonly unitType?: string | null;
  readonly canonicalTopicKey?: string | null;
  readonly exposureState: z.infer<typeof exposureStateSchema>;
  readonly understandingState: z.infer<typeof understandingStateSchema>;
  readonly validationState: z.infer<typeof validationStateSchema>;
}
export interface LearningUnitSummary {
  readonly total: number; readonly exposed: number; readonly weak: number; readonly notValidated: number;
}
export function summarizeLearningUnits(units: readonly LearningUnit[]): LearningUnitSummary {
  return {
    total: units.length, exposed: units.filter((unit) => unit.exposureState === "COMPLETE").length,
    weak: units.filter((unit) => unit.understandingState === "WEAK").length,
    notValidated: units.filter((unit) => unit.validationState !== "PASSED").length
  };
}
export interface LearningUnitRepository {
  list(userId: UserId): Promise<readonly LearningUnit[]>;
  create(userId: UserId, contextId: string, input: LearningUnitCreate): Promise<LearningUnit>;
  update(userId: UserId, contextId: string, id: string, input: LearningUnitUpdate): Promise<LearningUnit>;
  delete(userId: UserId, contextId: string, id: string): Promise<void>;
}
export class LearningUnitService {
  constructor(private readonly repository: LearningUnitRepository) {}
  list(userId: UserId) { return this.repository.list(userId); }
  create(userId: UserId, contextId: string, input: unknown) {
    return this.repository.create(userId, z.uuid().parse(contextId), createSchema.parse(input));
  }
  update(userId: UserId, contextId: string, id: string, input: unknown) {
    return this.repository.update(userId, z.uuid().parse(contextId), z.uuid().parse(id), updateSchema.parse(input));
  }
  delete(userId: UserId, contextId: string, id: string, confirmed: boolean) {
    z.literal(true, { error: "삭제 확인을 선택해 주세요." }).parse(confirmed);
    return this.repository.delete(userId, z.uuid().parse(contextId), z.uuid().parse(id));
  }
}
