/** @deprecated Import from selector/heuristic — kept for existing tests. */
export {
  selectFromCandidates as selectSkill,
  tokenize,
} from './selector/heuristic.js';
export type {
  SelectAlternative,
  SelectResult,
} from './selector/types.js';

export type SelectInput = {
  prompt: string;
  goal?: string;
  context?: string;
  client?: string;
  workspace_path?: string;
  token_budget?: number;
  top_k?: number;
};
