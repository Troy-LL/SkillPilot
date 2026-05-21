#!/usr/bin/env node
import { loadConfig } from './config.js';
import { bindObservability } from './observability.js';
import { runMcpServer } from './server.js';

function parseArgs(argv: string[]): { skillRoot?: string } {
  let skillRoot: string | undefined;
  const args = [...argv];
  while (args.length > 0) {
    const a = args.shift();
    if (a === '--skill-root' || a === '-r') {
      const v = args.shift();
      if (!v) throw new Error('--skill-root requires a path');
      skillRoot = v;
      continue;
    }
    if (a === '--help' || a === '-h') {
      process.stdout.write(`Skilling MCP (stdio)

Environment:
  SKILL_ROOT              Directory of skill folders (default: discover .agents/skills from cwd, else bundled catalog)
  SKILLING_SKILLS_ROOT  Same as SKILL_ROOT
  SKILLING_CONFIG       Path to Skilling.config.json

Arguments:
  --skill-root <path>   Override SKILL_ROOT
`);
      process.exit(0);
    }
  }
  return { skillRoot };
}

const cwd = process.cwd();
const { skillRoot: cliRoot } = parseArgs(process.argv.slice(2));
const config = loadConfig(cwd, cliRoot);
bindObservability(config);

runMcpServer(config.skillsRoot, config).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
