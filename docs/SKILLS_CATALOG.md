# Skill catalog — discover, install locally, route with SkillPilot

SkillPilot only **lists / selects / loads** skills under **`SKILL_ROOT`** (default `./skills`). To grow that catalog, use the **find-skills** workflow with **project-local** installs — not global `-g` on your user profile.

## Pipeline

```text
find-skills (agent)  →  npx skills add (this repo)  →  ingest / import  →  select  →  load  →  cleanup
```

| Step | What | Where files live |
|------|------|------------------|
| 1. Discover | Agent follows **find-skills**; `npx skills find <query>` or [skills.sh](https://skills.sh/) | — |
| 2. Install **locally** | `npm run skills:add -- <pkg>` or `npx skills add <pkg> -y` **from repo root** (no `-g`) | `<repo>/.agents/skills/<name>/` |
| 3. Import into router | `npm run skills:import -- <name>` or MCP **`ingest`** | `<repo>/skills/<skill_id>/SKILL.md` |
| 4. Use | MCP **`select`** / **`load`** + extension TTL | Same `SKILL_ROOT` as MCP config |

## Commands (SkillPilot repo root)

PowerShell:

```powershell
npm run build
npm run skills:add -- vercel-labs/skills@find-skills
npm run skills:import -- find-skills
npm run smoke
```

Bash:

```bash
npm run build
npm run skills:add -- vercel-labs/skills@find-skills
npm run skills:import -- find-skills
```

`skills:add` runs `npx skills add` with **cwd = this repo** and **without `-g`**, so skills land under **`.agents/skills/`** here — not only on `C:\Users\...\.cursor` or a global agents path.

## MCP `ingest` tool

After a local `npx skills add`:

```json
{ "agents_folder": "find-skills" }
```

Optional: `skill_id`, `repo_root` (defaults to parent of `SKILL_ROOT`).

## MCP `SKILL_ROOT` alignment

Point Cursor MCP `env.SKILL_ROOT` at **this repo’s `skills/`** folder so **`select`** sees imported skills immediately.

## Notes

- Imported skills are normalized to **`skill-rules.md`** (`id`, `title`, `summary`; `name`/`description` from upstream mapped when needed).
- **`.agents/skills/`** = staging / CLI layout; **`skills/`** = SkillPilot router catalog.
- Do not use **`npx skills add -g`** when curating for this project unless you also import into `skills/`.
