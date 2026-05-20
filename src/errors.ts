export const SKILLPILOT_ERROR_CODES = [
  'STORE_UNAVAILABLE',
  'SKILL_NOT_FOUND',
  'BODY_TOO_LARGE',
  'INVALID_FRONT_MATTER',
  'PATH_ESCAPE',
  'BUDGET_EXCEEDED',
  'SELECTOR_ERROR',
  'VALIDATION_ERROR',
] as const;

export type SkillPilotErrorCode = (typeof SKILLPILOT_ERROR_CODES)[number];

export class SkillPilotError extends Error {
  readonly code: SkillPilotErrorCode;

  constructor(code: SkillPilotErrorCode, message: string) {
    super(message);
    this.name = 'SkillPilotError';
    this.code = code;
  }
}

export function errorPayload(code: SkillPilotErrorCode, message: string): {
  code: SkillPilotErrorCode;
  message: string;
} {
  return { code, message };
}
