import type { SkillingConfig } from '../config.js';
import { logEvent } from '../observability.js';
import { planFromCandidates, selectFromCandidates } from './heuristic.js';
import type { SkillSelector } from './types.js';

let selectorModeWarned = false;

export function getSelector(config: SkillingConfig): SkillSelector {
  if (!selectorModeWarned && config.selector !== 'heuristic') {
    selectorModeWarned = true;
    logEvent('warn', 'skill_select', {
      message: `SKILLING_SELECTOR=${config.selector} is not implemented; using heuristic selector.`,
    });
  }
  return {
    select: (candidates, options) =>
      selectFromCandidates(candidates, {
        ...options,
        selectMinConfidence: options.selectMinConfidence ?? config.selectMinConfidence,
      }),
    plan: (candidates, options) =>
      planFromCandidates(candidates, {
        ...options,
        selectMinConfidence: options.selectMinConfidence ?? config.selectMinConfidence,
        planMinConfidence: options.planMinConfidence ?? config.planMinConfidence,
      }),
  };
}

export * from './types.js';
export {
  filterCandidatesForPhaseAutoPick,
  heuristicSelector,
  isMcpDomainSkill,
  planFromCandidates,
  queryHasMcpAnchor,
  selectFromCandidates,
} from './heuristic.js';
