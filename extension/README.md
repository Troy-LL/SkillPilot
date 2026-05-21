# Skilling Lifecycle

Companion extension for the **Skilling** MCP skill router (this monorepo’s `extension/` package). Tracks active skill episodes from **`begin_task`** / **`load`**, shows a **status-bar TTL**, and runs MCP **`cleanup`** when you dismiss or when time expires.

Works in **Cursor** and **VS Code**. Requires the Skilling MCP server (`dist/index.js`) configured separately.

## Features

- **Auto-register session** (Sprint F) — watches `.skilling/session.json` when `skilling.autoRegisterSession` is true (default).
- **Register Active Session** — manual register from session file (no clipboard).
- **Status bar** — skill **title** and TTL; tooltip shows **summary** / **rationale**; click to dismiss and cleanup.
- **Register from load JSON** — paste the MCP `load` / `begin_task` tool result from clipboard.
- **Manual register** — wizard for `correlation_id`, `skill_id`, and TTL.
- **Auto-cleanup on TTL** — spawns `extension-cleanup.mjs` to call MCP `cleanup` (configurable).
- **Session file resolution** — finds repo root via `skilling.serverEntry` or `skilling.skillRoot` (parent of `.agents/skills/` or `dist/`).

## Requirements

1. **Skilling MCP** wired in Cursor/VS Code (`mcp.json` → `node …/dist/index.js`, `SKILL_ROOT` → `.agents/skills/`).
2. **`npm run build`** at the Skilling repo so `dist/index.js` exists.
3. Extension settings (see below).

## Quick start

1. Install this extension (VSIX or Extension Development Host).
2. Set **`skilling.serverEntry`** to your absolute path:  
   `P:\path\to\Skilling\dist\index.js`
3. Optional: **`skilling.skillRoot`** → `...\SkillPilot\.agents\skills`
4. Send a chat prompt (Sprint F hook may auto-`begin_task`) or run MCP **`begin_task`** manually.
5. Status bar should appear automatically; or Command Palette → **Register Active Session**.
6. When done: click the status bar, **Dismiss Active Skill**, MCP **`end_task`**, or close the composer (`sessionEnd` hook).

## Commands

| Command | Description |
|---------|-------------|
| **Register Active Session** | Start TTL tracking from `.skilling/session.json` |
| **Register Active Skill from Load JSON** | Parse clipboard JSON from `load` / `begin_task` |
| **Register Active Skill…** | Enter correlation id, skill id, TTL manually |
| **Dismiss Active Skill (Cleanup Now)** | MCP `cleanup` + clear status bar |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `skilling.serverEntry` | *(empty)* | Path to `dist/index.js` (required for cleanup) |
| `skilling.skillRoot` | *(empty)* | Path to `.agents/skills/` (optional; helps find session file) |
| `skilling.autoCleanupOnTtl` | `true` | Run MCP cleanup when TTL expires |
| `skilling.promptBeforeCleanup` | `false` | Confirm before TTL cleanup |
| `skilling.ttlMsOverride` | `0` | Override TTL (ms); `0` = use session / load value |

## Cursor hooks (optional)

If the Skilling repo includes **`.cursor/hooks.json`**, closing a composer session runs the same cleanup script and clears `.skilling/session.json` without this extension. The extension is still useful for **mid-chat TTL** and **manual dismiss**.

See the main repo: `docs/AUTONOMOUS_USAGE.md`, `docs/EXTENSION.md`.

## Limitations

- Does **not** intercept MCP automatically; you register explicitly (or use `sessionEnd` hooks).
- Cleanup starts a **separate** MCP process; `cleanup` is idempotent at the protocol level.
- Packaged VSIX includes `scripts/extension-cleanup.mjs`; Node.js must be on `PATH`.

## Development

```bash
cd extension
npm install
npm run compile
# F5 → "Run Skilling Extension" from repo root .vscode/launch.json
```

Package VSIX:

```bash
npx @vscode/vsce package
cursor --install-extension skilling-lifecycle-0.2.0.vsix
```

## License

ISC (same as Skilling)
