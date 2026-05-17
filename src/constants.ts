/** skill-rules.md §2 + §8 */
export const SKILL_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SKILL_ID_MIN = 3;
export const SKILL_ID_MAX = 64;

/** Entire SKILL.md on disk (skill-rules §8) */
export const MAX_PRIMARY_BYTES = 256 * 1024;
/** Body after front matter strip (skill-rules §8) */
export const MAX_BODY_BYTES = 192 * 1024;

/** Hint for hosts (ms); policy remains client-side per architecture.md */
export const DEFAULT_TTL_MS = 300_000;

/** Max in-flight correlation_ids tracked server-side (FIFO eviction on load). */
export const MAX_CORRELATION_REGISTRY = 1024;

/** Max characters for select prompt / goal inputs. */
export const MAX_SELECT_INPUT_CHARS = 8_000;

/** Minimum heuristic score to return a skill_id (below → no match). */
export const SELECT_MIN_SCORE = 2;
