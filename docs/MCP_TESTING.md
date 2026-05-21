# MCP testing (Skilling)

## Automated

```bash
npm test          # build + node:test unit tests
npm run smoke     # stdio MCP: list, skill_plan, begin_task, health, end_task (.agents/skills)
```

CI runs `npm ci`, `npm test`, and `npm run smoke` on pull requests.

**E2 sessionEnd hook:** `npm run test:session-end-hook` (or close the composer and check Hooks output).

**Sprint F auto-begin hook:** `npm run test:auto-begin-hook` (requires `npm run build`). Verifies `session.json` v2, `active-body.md` bridge, and skip-on-active-session.

## MCP Inspector (manual)

From the repo root after `npm run build`:

```bash
npx @modelcontextprotocol/inspector node dist/index.js --skill-root ./.agents/skills
```

Use the Inspector UI to call lifecycle tools (**`begin_task`**, **`get_session`**, **`end_task`**) or low-level tools (**`list`**, **`select`**, **`load`**, **`cleanup`**). Set `SKILL_ROOT` via `--skill-root` or `env` in the Inspector launch config if needed.

## Cursor (verified)

Stdio MCP behavior is host-agnostic once paths are correct. Use `npm run smoke` for a CLI lifecycle check.
