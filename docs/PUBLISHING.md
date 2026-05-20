# Publishing SkillPilot

## Cursor Marketplace (official plugin)

This repo is packaged as a [Cursor plugin](https://cursor.com/docs/plugins): manifest at `.cursor-plugin/plugin.json`, portable MCP entry at `scripts/run-mcp.mjs`, and root `mcp.json`.

### Local test (before submit)

1. Build the server:

   ```bash
   npm install
   npm run build
   ```

2. Symlink into Cursor local plugins (adjust paths):

   ```bash
   # macOS / Linux
   ln -s "$(pwd)" ~/.cursor/plugins/local/skillpilot

   # Windows (PowerShell, admin may be required)
   New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.cursor\plugins\local\skillpilot" -Target (Get-Location)
   ```

3. Restart Cursor or **Developer: Reload Window**.

4. Enable the **skillpilot** MCP server in Settings → MCP.

5. Verify: `npm run smoke` and `npm run benchmark`.

**Hooks:** Plugin hook commands use paths under `hooks/` relative to the plugin install directory. If auto-begin does not run in a non–SkillPilot workspace, confirm Cursor resolves hook paths from the plugin root (or set `SKILLPILOT_SERVER_ROOT` to your clone path). MCP tools work without hooks.

### Submit

1. Push to a **public** Git repository with `LICENSE`, `README.md`, and committed `assets/logo.svg`.
2. Open [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) and submit the repo URL.
3. Expect **manual review**; listing is curated.

### Checklist

- [ ] `.cursor-plugin/plugin.json` — valid `name`, `description`, `logo`
- [ ] `npm run build` produces `dist/` (documented; not committed)
- [ ] Bundled skills in `.agents/skills/` have compatible licenses (see `skills-lock.json`)
- [ ] Overlays in `.agents/skills-meta/` committed for ecosystem routing
- [ ] No machine-specific absolute paths in `mcp.json`
- [ ] `npm test` and `npm run benchmark` pass

## npm (optional)

Roadmap item: publish CLI package as `skillpilot-mcp` with `bin` → `dist/index.js`. Not required for marketplace plugin install.

## Community MCP listing

For [cursor.directory](https://cursor.directory/), submit the public repo with install snippet from `docs/mcp-config.example.json` (use `scripts/run-mcp.mjs` for portable paths).
