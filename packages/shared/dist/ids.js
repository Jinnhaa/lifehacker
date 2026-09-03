import { randomUUID } from "node:crypto";
import { z } from "zod";
export const userIdSchema = z.uuid().transform((value) => value);
export const taskIdSchema = z.uuid().transform((value) => value);
export const correlationIdSchema = z.uuid().transform((value) => value);
export class SystemIdGenerator {
    generateCorrelationId() {
        return randomUUID();
    }
}
//# sourceMappingURL=ids.js.map