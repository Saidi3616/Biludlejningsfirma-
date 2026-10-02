/**
 * Stabile fejlkoder for API'et (se docs/architecture/07-api.md).
 * Nye koder tilføjes her, efterhånden som milestones kræver dem.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = details;
  }
}

export function toErrorBody(error: AppError, requestId?: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
}
