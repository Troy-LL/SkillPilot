export const SKILLING_ERROR_CODES = [
  'STORE_UNAVAILABLE',
  'SKILL_NOT_FOUND',
  'BODY_TOO_LARGE',
  'INVALID_FRONT_MATTER',
  'PATH_ESCAPE',
  'BUDGET_EXCEEDED',
  'SELECTOR_ERROR',
  'VALIDATION_ERROR',
] as const;

export type SkillingErrorCode = (typeof SKILLING_ERROR_CODES)[number];

export class SkillingError extends Error {
  readonly code: SkillingErrorCode;

  constructor(code: SkillingErrorCode, message: string) {
    super(message);
    this.name = 'SkillingError';
    this.code = code;
  }
}

export function errorPayload(code: SkillingErrorCode, message: string): {
  code: SkillingErrorCode;
  message: string;
} {
  return { code, message };
}
