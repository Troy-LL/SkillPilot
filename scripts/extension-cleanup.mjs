/**
 * One-shot MCP cleanup for the SkillPilot extension.
 * Usage: node scripts/extension-cleanup.mjs <correlation_id> <dist/index.js> [skillRoot]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const correlation_id = process.argv[2];
const entry = process.argv[3];
const skillRootArg = process.argv[4];

if (!correlation_id || !entry) {
  process.stderr.write('Usage: node extension-cleanup.mjs <correlation_id> <dist/index.js> [skillRoot]\n');
  process.exit(2);
}

const args = [path.resolve(entry)];
if (skillRootArg) {
  args.push('--skill-root', path.resolve(skillRootArg));
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args,
  cwd: path.dirname(path.resolve(entry)),
  stderr: 'pipe',
});

const client = new Client({ name: 'skillpilot-extension-cleanup', version: '0.0.0' });

try {
  await client.connect(transport);
  const res = await client.callTool({ name: 'cleanup', arguments: { correlation_id } });
  if (res.isError) {
    process.stderr.write(JSON.stringify(res.content) + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(res.structuredContent ?? { ok: true }) + '\n');
} finally {
  await client.close();
}
