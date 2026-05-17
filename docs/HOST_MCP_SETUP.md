# Cursor and VS Code — MCP host wiring

Use **`docs/mcp-config.example.json`** as the shape of the `mcpServers` entry. Replace placeholders with **absolute paths** on your machine.

## Cursor

1. Open **Cursor Settings → MCP** (or add project-level **`.cursor/mcp.json`** if you use per-repo MCP).
2. Merge the `skillpilot` block from `mcp-config.example.json`.
3. Set:
   - `command`: `node` (or full path to `node.exe` on Windows if `node` is not on PATH for GUI apps).
   - `args`: `[ "<REPO>/dist/index.js" ]` or add `"--skill-root", "<REPO>/skills>"` after the entry script.
   - `env.SKILL_ROOT`: `"<REPO>/skills"` (recommended so cwd does not matter).

Restart MCP / reload window after edits.

### `select` missing in Cursor (only `list`, `load`, `cleanup`)

The repo **does** register **`select`** after Sprint B. If Cursor’s tool list is stale:

1. **Rebuild** from the repo you are editing:
   ```bash
   cd P:\Troy\Code\Tools\SkillPilot
   npm run build
   ```
2. **Confirm** `dist/server.js` is newer than your last pull (or run `npm run smoke` — it calls `select`).
3. **Point MCP at this build** — `args` must be the absolute path to **`...\SkillPilot\dist\index.js`**, not another clone, `npm link` target, or an old global install.
4. **Restart the MCP server** in Cursor: disable/re-enable the `skillpilot` server, or **Developer: Reload Window**.
5. In chat, ask the agent to **list MCP tools** for `skillpilot` — you should see **`select`**.

If `select` still does not appear, check for a **second** SkillPilot entry in user vs project MCP config (one may point at an old path).

## VS Code

1. Open **MCP** settings for your VS Code build (location varies by version; often user `settings.json` MCP section or dedicated MCP JSON — follow [VS Code MCP documentation](https://code.visualstudio.com/docs) for your release).
2. Use the **same** `mcpServers.skillpilot` object as in `mcp-config.example.json`, with the same absolute paths as for Cursor.

## Verify in the IDE

After the server appears as connected, invoke tools in order: **`list`** → **`select`** (optional) → **`load`** → **`cleanup`** (use `correlation_id` from `load`; call twice to confirm idempotency).

CLI alternative (no IDE): from repo root, `npm run smoke` (runs `list` → `select` → `load` → `cleanup` ×2).
