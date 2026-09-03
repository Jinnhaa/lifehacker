export declare const domainErrorCodes: readonly ["TASK_NOT_FOUND", "INVALID_TASK_TRANSITION", "CROSS_USER_ACCESS", "INVALID_INPUT", "CONFLICT", "INPUT_DUPLICATE", "PARSE_FAILED", "PARSE_INVALID", "UNSUPPORTED_INTENT", "CONFIRMATION_REQUIRED", "COMMAND_ALREADY_APPLIED", "ENTITY_RESOLUTION_REQUIRED"];
export type DomainErrorCode = (typeof domainErrorCodes)[number];
export declare class DomainError extends Error {
    readonly code: DomainErrorCode;
    readonly details?: Readonly<Record<string, unknown>> | undefined;
    constructor(code: DomainErrorCode, message: string, details?: Readonly<Record<string, unknown>> | undefined);
}
//# sourceMappingURL=errors.d.ts.map