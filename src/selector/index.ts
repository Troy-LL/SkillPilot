import type { SkillPilotConfig } from '../config.js';
import { heuristicSelector } from './heuristic.js';
import type { SkillSelector } from './types.js';

export function getSelector(_config: SkillPilotConfig): SkillSelector {
  return heuristicSelector;
}

export * from './types.js';
export { heuristicSelector, selectFromCandidates, planFromCandidates } from './heuristic.js';
