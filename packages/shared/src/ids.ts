import { randomUUID } from "node:crypto";
import { z } from "zod";

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, "UserId">;
export type TaskId = Brand<string, "TaskId">;
export type CorrelationId = Brand<string, "CorrelationId">;

export const userIdSchema = z.uuid().transform((value) => value as UserId);
export const taskIdSchema = z.uuid().transform((value) => value as TaskId);
export const correlationIdSchema = z.uuid().transform((value) => value as CorrelationId);

export interface IdGenerator {
  generateCorrelationId(): CorrelationId;
}

export class SystemIdGenerator implements IdGenerator {
  generateCorrelationId(): CorrelationId {
    return randomUUID() as CorrelationId;
  }
}
