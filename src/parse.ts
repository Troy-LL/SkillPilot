import { parse as parseYaml } from 'yaml';
import {
  isValidSkillId,
  validateBodyUtf8Length,
  validateClients,
  validateSummary,
  validateTags,
  validateTitle,
  validateTriggers,
  validateVersion,
} from './validate.js';

export type SkillFrontMatter = {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  triggers?: string[];
  version?: string;
  clients?: string[];
};

export type ParsedSkillFile = {
  meta: SkillFrontMatter;
  body: string;
};

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export function parseSkillMarkdown(rawUtf8: string, folderDerivedId: string): ParsedSkillFile {
  const m = rawUtf8.match(FRONT_MATTER);
  if (!m?.[1] || m[2] === undefined) {
    throw new Error('SKILL.md must start with YAML front matter delimited by --- lines');
  }
  const yamlBlock = m[1];
  const body = m[2];
  let data: unknown;
  try {
    data = parseYaml(yamlBlock);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML front matter: ${msg}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('YAML front matter must parse to a mapping object');
  }
  const rec = data as Record<string, unknown>;
  const idRaw = rec['id'];
  if (typeof idRaw !== 'string' || !isValidSkillId(idRaw)) {
    throw new Error('front matter id must match skill-rules §2');
  }
  if (idRaw !== folderDerivedId) {
    throw new Error(
      `id "${idRaw}" does not match folder name "${folderDerivedId}" (v1-exceptions.md: strict folder vs front matter)`,
    );
  }
  const meta: SkillFrontMatter = {
    id: idRaw,
    title: validateTitle(rec['title']),
    summary: validateSummary(rec['summary']),
    tags: validateTags(rec['tags']),
    triggers: validateTriggers(rec['triggers']),
    version: validateVersion(rec['version']),
    clients: validateClients(rec['clients']),
  };
  validateBodyUtf8Length(body);
  return { meta, body };
}
