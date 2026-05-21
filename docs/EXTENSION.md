# Skilling Lifecycle extension (Sprint C / E)

VS Code / **Cursor** extension for **TTL countdown** and **MCP `cleanup`** after Skilling **`begin_task`** or **`load`**. The host agent still calls MCP; the extension does **not** intercept MCP traffic. You **register** the session manually, from **`.skilling/session.json`**, or from clipboard JSON.

**Extension details (features, settings, VSIX):** see **[`extension/README.md`](../extension/README.md)**.

## Install

**VSIX (recommended):**

```powershell
cd extension
npm install
npm run compile
npm run package
cursor --install-extension skilling-lifecycle-0.2.0.vsix
```

Reload the window. Set `skilling.serverEntry` in Settings.

**Development (F5):**

1. Build the MCP server: `npm run build` at repo root.
2. `cd extension && npm install && npm run compile`
3. Open the **Skilling repo root** → **F5** → **Run Skilling Extension**
4. In the Extension Development Host window, open the repo and set settings (see below).

## Settings

| Setting | Purpose |
|---------|---------|
| **`skilling.serverEntry`** | Absolute path to `...\Skilling\dist\index.js` (required for cleanup). |
| **`skilling.skillRoot`** | Absolute path to `...\Skilling\.agents\skills` (optional). |
| **`skilling.autoCleanupOnTtl`** | Call MCP `cleanup` when TTL fires (default `true`). |
| **`skilling.promptBeforeCleanup`** | Confirm before TTL cleanup (default `false`). |
| **`skilling.ttlMsOverride`** | If `> 0`, ignore load `ttl_ms` and use this value (ms). |
| **`skilling.autoRegisterSession`** | Watch `.skilling/session.json` and start TTL automatically (default `true`). |

## Workflow

**Sprint F (preferred):** hook or agent runs **`begin_task`** → extension **auto-registers** when **`skilling.autoRegisterSession`** is true (default). Manual **`Skilling: Register Active Session`** still available.

**Sprint C (manual):**

1. In chat, run MCP **`load`** (or `select` → `load`). Copy the JSON payload (or at least `correlation_id`, `skill_id`, `ttl_ms`).
2. Run command **`Skilling: Register Active Skill from Load JSON`** (clipboard must be the load JSON).
   - Or **`Skilling: Register Active Skill…`** and paste fields manually.
3. Status bar shows **`Skill: <id> (Nm)`** — click to **Dismiss** (cleanup now).
4. When TTL expires, extension runs **`cleanup`** via `scripts/extension-cleanup.mjs` (same MCP server as your config).

## Commands

- **`skilling.registerActiveSession`** — read **`.skilling/session.json`** after **`begin_task`**.
- **`skilling.registerFromClipboard`** — parse load JSON from clipboard.
- **`skilling.registerActiveSkill`** — wizard for correlation_id / skill_id / TTL.
- **`skilling.dismissActiveSkill`** — cleanup now and clear status bar.

## Troubleshooting Register Active Session

If chat **`begin_task`** worked but the command says **no `.skilling/session.json`**:

1. Set **`skilling.serverEntry`** to your `dist/index.js` (repo root = that file’s parent), or **`skilling.skillRoot`** to your **`.agents/skills`** folder (repo root = parent of `.agents/`).
2. Re-run the command. You do **not** need the workspace root folder open if those settings point at the Skilling repo (common when the Extension Dev Host opened only `extension/`).
3. Confirm the file exists: `<repo>/.skilling/session.json` after **`begin_task`**, before **`end_task`**.

## Cursor hooks (Sprint E2)

When a **composer conversation ends**, the project **`sessionEnd`** hook ([`.cursor/hooks.json`](../.cursor/hooks.json) → [`hooks/skilling-session-end.mjs`](../hooks/skilling-session-end.mjs)) runs the same **`extension-cleanup.mjs`** logic and removes **`.skilling/session.json`** and **`active-body.md`**. You do not need the extension for that path — but the extension still helps for **TTL countdown** and **dismiss mid-chat**.

Reload Cursor after changing hooks. See **`docs/AUTONOMOUS_USAGE.md`** § E2.

## Limitations (v0.3)

- Auto-register requires resolving repo root via `skilling.serverEntry` / `skilling.skillRoot` or an open workspace containing `.skilling/session.json`.
- Cleanup spawns a **separate** MCP process; correlation ids are only meaningful in the **same** server process as the agent’s session for bookkeeping — MCP `cleanup` is still **idempotent** at the protocol level.
- Packaged VSIX must include `extension/scripts/extension-cleanup.mjs` and the user must have the Skilling repo’s `node_modules` (run from repo layout) or future packaging work.

## MCP config

Keep your existing **`mcp.json`** / Cursor MCP entry for the agent. The extension only needs **`skilling.serverEntry`** aligned with that entry’s `dist/index.js` path.
