export const domainErrorCodes = [
    "TASK_NOT_FOUND",
    "INVALID_TASK_TRANSITION",
    "CROSS_USER_ACCESS",
    "INVALID_INPUT",
    "CONFLICT"
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