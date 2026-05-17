#!/usr/bin/env node
import path from 'node:path';
import { runMcpServer } from './server.js';

function parseArgs(argv: string[]): { skillRoot: string } {
  let skillRoot = process.env['SKILL_ROOT']?.trim();
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
      process.stdout.write(`SkillPilot MCP (stdio)

Environment:
  SKILL_ROOT   Directory containing one folder per skill (default: ./skills from cwd)

Arguments:
  --skill-root <path>   Override SKILL_ROOT
`);
      process.exit(0);
    }
  }
  if (!skillRoot) {
    skillRoot = path.resolve(process.cwd(), 'skills');
  } else {
    skillRoot = path.resolve(skillRoot);
  }
  return { skillRoot };
}

const { skillRoot } = parseArgs(process.argv.slice(2));
runMcpServer(skillRoot).catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
