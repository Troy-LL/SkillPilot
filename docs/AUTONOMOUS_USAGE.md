# Autonomous SkillPilot usage (Sprint E)

SkillPilot cannot force an IDE agent to call tools. Sprint E adds **policy** (Cursor rules), **fewer MCP steps** (`begin_task` / `end_task`), and a **session file** so the extension and future hooks share one source of truth.

## E1 — Implemented

### Session file (SOT on disk)

Path: **`.skillpilot/session.json`** at the repo root (gitignored). Written by **`begin_task`**, cleared by **`end_task`**.

```json
{
  "version": 1,
  "skill_id": "find-skills",
  "correlation_id": "uuid",
  "ttl_ms": 300000,
  "started_at": "2026-05-14T12:00:00.000Z",
  "phase": "review"
}
```

### MCP tools

| Tool | Role |
|------|------|
| **`begin_task`** | `select` (unless `skill_id`) + `load` + write session; optional `end_previous` (default true) |
| **`end_task`** | `cleanup` + clear session |
| **`get_session`** | Read active episode or `{ active: false }` |
| `list`, `select`, `load`, `cleanup`, `ingest` | Debugging and catalog growth |

**Typical flow:** `begin_task` → (agent work using `body`) → `end_task`.

### Cursor rules

[`.cursor/rules/skillpilot-lifecycle.mdc`](../.cursor/rules/skillpilot-lifecycle.mdc) — `alwaysApply: true` policy for agents in this repo.

### Extension

**SkillPilot: Register Active Session** — reads `.skillpilot/session.json` and starts the status-bar TTL (no clipboard).

### Limitations (honest)

- Rules are **soft**; the model may still skip tools.
- Session file tracks the **last begin_task** in this repo; it does not remove text from the host context by itself.
- **`cleanup`** in the MCP process is bookkeeping; the host must drop injected guidance.

## E2 — Phase 1 (implemented)

Project hook **`.cursor/hooks.json`** runs on **`sessionEnd`** (composer conversation ends):

| Step | Behavior |
|------|----------|
| 1 | Find **`.skillpilot/session.json`** under workspace roots / repo root |
| 2 | Run **`scripts/extension-cleanup.mjs`** (`cleanup` via stdio MCP) |
| 3 | Delete session file on success |

Script: **`.cursor/hooks/skillpilot-session-end.mjs`** (Node; logs to stderr).

**Why not `stop`?** The `stop` hook fires after each agent loop turn; cleaning there would drop the session mid-chat. Use **`end_task`** in chat when switching topics without closing the composer.

**Requires:** `npm run build` so `dist/index.js` exists. Reload Cursor after editing `hooks.json`.

**Local test:**

```powershell
npm run build
# Leave a session open (begin_task in chat/Inspector; do not end_task), then:
npm run test:session-end-hook
```

### E2 — Deferred

| Hook | Purpose |
|------|---------|
| `afterMCPExecution` (matcher: `begin_task` / `load`) | Backup session sync (usually redundant) |
| `stop` | Only if Cursor adds a narrower “conversation idle” signal |
| `beforeSubmitPrompt` | TTL reminder when session expired |

**Not in E2:** silent system-prompt injection from hooks (host API limits).

## Manual validation

1. `npm run build` && `npm test` && `npm run smoke`
2. Reload Cursor MCP; confirm `begin_task`, `end_task`, `get_session`
3. Chat: `begin_task` for a review prompt → check `.skillpilot/session.json`
4. `end_task` → file removed, `ok: true`
5. Extension: Register Active Session → dismiss (optional; E2 `sessionEnd` also cleans up when the composer closes)

Record results in [VALIDATION_REPORT.md](VALIDATION_REPORT.md).

## Related

- [SKILLS_CATALOG.md](SKILLS_CATALOG.md) — discover and import skills
- [EXTENSION.md](EXTENSION.md) — TTL extension
- [HOST_MCP_SETUP.md](HOST_MCP_SETUP.md) — MCP wiring
