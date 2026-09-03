export const domainErrorCodes = [
    "TASK_NOT_FOUND",
    "INVALID_TASK_TRANSITION",
    "CROSS_USER_ACCESS",
    "INVALID_INPUT",
    "CONFLICT",
    "INPUT_DUPLICATE",
    "PARSE_FAILED",
    "PARSE_INVALID",
    "UNSUPPORTED_INTENT",
    "CONFIRMATION_REQUIRED",
    "COMMAND_ALREADY_APPLIED",
    "ENTITY_RESOLUTION_REQUIRED"
];
export class DomainError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "DomainError";
    }
}
//# sourceMappingURL=errors.js.map