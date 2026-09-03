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
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "DomainError";
  }
}
