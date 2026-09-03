export const domainErrorCodes = [
  "TASK_NOT_FOUND",
  "INVALID_TASK_TRANSITION",
  "CROSS_USER_ACCESS",
  "INVALID_INPUT",
  "CONFLICT"
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
