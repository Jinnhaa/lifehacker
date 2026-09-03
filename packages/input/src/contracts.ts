import { userIdSchema, type UserId } from "@amber/shared";
import { z } from "zod";

export const provenanceValues = ["user_explicit", "external", "system_derived", "ai_inferred"] as const;
export const provenanceSchema = z.enum(provenanceValues);
export type Provenance = z.infer<typeof provenanceSchema>;

export const inputSourceSchema = z.enum(["manual", "discord"]);
export type InputSource = z.infer<typeof inputSourceSchema>;

export const textInputSchema = z.object({
  userId: userIdSchema,
  text: z.string().trim().min(1),
  receivedAt: z.iso.datetime({ offset: true }),
  source: inputSourceSchema,
  clientRequestId: z.string().trim().min(1).max(200)
}).strict();
export type TextInput = z.infer<typeof textInputSchema>;
export type TextInputValue = z.input<typeof textInputSchema>;

export const manualTextInputSchema = textInputSchema.extend({ source: z.literal("manual") }).strict();
export type ManualTextInput = z.infer<typeof manualTextInputSchema>;
export type ManualTextInputValue = z.input<typeof manualTextInputSchema>;

export const parsedTaskDraftSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  officialDeadline: z.iso.datetime({ offset: true }).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
  workContextHint: z.string().trim().min(1).optional(),
  objectiveHint: z.string().trim().min(1).optional(),
  executionMode: z.enum(["standard", "learning_required", "output_focused", "mixed"]).optional(),
  inferredFields: z.array(z.string()).default([])
}).strict();
export type ParsedTaskDraft = z.infer<typeof parsedTaskDraftSchema>;

export const parseEntitySchema = z.object({
  entityType: z.string().trim().min(1),
  data: z.unknown(),
  provenance: z.record(z.string(), provenanceSchema),
  confidence: z.number().min(0).max(1)
}).strict();

export const parseResultSchema = z.object({
  intent: z.enum(["CREATE_TASK", "CREATE_RECURRING_ACTIVITY", "UNKNOWN"]),
  entities: z.array(parseEntitySchema),
  requiresConfirmation: z.boolean(),
  clarificationQuestions: z.array(z.string().trim().min(1))
}).strict();
export type ParseResult = z.infer<typeof parseResultSchema>;

export interface ParseInput {
  readonly userId: UserId;
  readonly text: string;
  readonly receivedAt: string;
  readonly timeZone: string;
  readonly source: InputSource;
}

export interface ExplicitTaskFacts {
  readonly officialDeadline?: string;
  readonly estimatedMinutes?: number;
  readonly importance?: 1 | 2 | 3 | 4 | 5;
}
