# Skill catalog — discover, install locally, route with SkillPilot

SkillPilot **lists / selects / loads** skills under **`SKILL_ROOT`**. For this repo, the **canonical** root is **`.agents/skills/`** — not the template tree under **`skills/`**.

## Pipeline (recommended)

```text
find-skills  →  npx skills add (repo root, no -g)  →  .agents/skills/<id>/
             →  MCP SKILL_ROOT = <repo>/.agents/skills
             →  skill_plan / begin_task / end_task
```

| Step | What | Where files live |
|------|------|------------------|
| 1. Discover | Agent follows **find-skills**; `npx skills find <query>` or [skills.sh](https://skills.sh/) | — |
| 2. Install **locally** | `npm run skills:add -- <pkg>` or `npx skills add <pkg> -y` **from repo root** (no `-g`) | `<repo>/.agents/skills/<id>/` |
| 3. Route | MCP with `SKILL_ROOT` pointing at `.agents/skills` | Same path as MCP |
| 4. Optional ingest | `npm run skills:import -- <id>` or MCP **`ingest`** | Copies to `<repo>/skills/` (legacy / smoke only) |

## Commands (SkillPilot repo root)

PowerShell:

```powershell
npm run build
$env:SKILL_ROOT = "$PWD/.agents/skills"
npx skills add anthropics/skills@mcp-builder -y
npm run smoke
```

Optional import into `skills/` (not required for daily MCP use):

```powershell
npm run skills:import -- mcp-builder
```

## MCP configuration

Point **`env.SKILL_ROOT`** at **this repo’s `.agents/skills`** folder:

```json
"env": { "SKILL_ROOT": "<REPO>/SkillPilot/.agents/skills" }
```

See **`docs/mcp-config.example.json`**.

## Bundled / project skills (`.agents/skills/`)

| Skill id | Role |
|----------|------|
| **find-skills** | Discover and install ecosystem skills |
| **com-skillpilot-orchestrator** | `begin_task` / `end_task` / `skill_plan` workflow |
| **mcp-builder**, **skill-creator**, **typescript-mcp-server-generator** | MCP and skill authoring |
| **create-hook**, **create-rule** | Cursor hooks and rules |

## Notes

- Ecosystem front matter (`name` / `description`) is normalized to **`id`**, **`title`**, **`summary`**; quoted phrases in `description` may become **`triggers`** when omitted.
- Folder name **must** match YAML **`id`**.
- Do not use **`npx skills add -g`** when curating this project unless you also copy into `.agents/skills` here.
