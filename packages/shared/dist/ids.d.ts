import { z } from "zod";
export type Brand<T, Name extends string> = T & {
    readonly __brand: Name;
};
export type UserId = Brand<string, "UserId">;
export type TaskId = Brand<string, "TaskId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export declare const userIdSchema: z.ZodPipe<z.ZodUUID, z.ZodTransform<UserId, string>>;
export declare const taskIdSchema: z.ZodPipe<z.ZodUUID, z.ZodTransform<TaskId, string>>;
export declare const correlationIdSchema: z.ZodPipe<z.ZodUUID, z.ZodTransform<CorrelationId, string>>;
export interface IdGenerator {
    generateCorrelationId(): CorrelationId;
}
export declare class SystemIdGenerator implements IdGenerator {
    generateCorrelationId(): CorrelationId;
}
//# sourceMappingURL=ids.d.ts.map