import { MAX_INJECT_BYTES } from './constants.js';
import { SkillPilotError } from './errors.js';
import { estimateTokens } from './token-estimate.js';

const INTERNAL_ONLY_RE =
  /<!--\s*internal-only\s*-->[\s\S]*?<!--\s*\/internal-only\s*-->/gi;

const ACTIVATION_HEADER =
  '> The following skill applies only to the current task. Discard after task completion.\n\n';

export type ShapeBodyResult = {
  body: string;
  token_estimate: number;
  bytes: number;
};

export function stripInternalOnlySections(body: string): string {
  return body.replace(INTERNAL_ONLY_RE, '').trim();
}

export function shapeSkillBody(
  rawBody: string,
  maxInjectBytes: number = MAX_INJECT_BYTES,
): ShapeBodyResult {
  const stripped = stripInternalOnlySections(rawBody);
  const body = ACTIVATION_HEADER + stripped;
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes > maxInjectBytes) {
    throw new SkillPilotError(
      'BODY_TOO_LARGE',
      `Shaped body is ${bytes} bytes; max inject is ${maxInjectBytes} bytes.`,
    );
  }
  return {
    body,
    token_estimate: estimateTokens(body),
    bytes,
  };
}
