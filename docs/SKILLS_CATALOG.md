# Skill catalog — discover, install locally, route with Skilling

Skilling **lists / selects / loads** skills under **`SKILL_ROOT`**. For this repo, the **canonical** root is **`.agents/skills/`**.

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
| 3. Overlay (Skilling) | Add or edit **`.agents/skills-meta/<id>.yaml`** | Tags, triggers, `inject_mode_default` — survives skill updates |
| 4. Route | MCP with `SKILL_ROOT` pointing at `.agents/skills` | Reads skills + merges overlays |

## Commands (Skilling repo root)

PowerShell:

```powershell
npm run build
$env:SKILL_ROOT = "$PWD/.agents/skills"
npx skills add anthropics/skills@mcp-builder -y
npm run smoke
```

## MCP configuration

Point **`env.SKILL_ROOT`** at **this repo’s `.agents/skills`** folder:

```json
"env": { "SKILL_ROOT": "<REPO>/.agents/skills" }
```

See **`docs/mcp-config.example.json`**.

## Bundled / project skills (`.agents/skills/`)

| Skill id | Role |
|----------|------|
| **find-skills** | Discover and install ecosystem skills |
| **com-skilling-orchestrator** | `begin_task` / `end_task` / `skill_plan` workflow |
| **mcp-builder**, **skill-creator**, **typescript-mcp-server-generator** | MCP and skill authoring (MCP-only — not general TypeScript scripts) |
| **typescript-cli** | Node/TypeScript CLI tools and small scripts (not MCP servers) |
| **frontend-design** | Distinctive web UI / React components |
| **create-hook**, **create-rule** | Git hooks (create-hook) and Cursor rules (create-rule); use **com-skilling-orchestrator** for Cursor MCP lifecycle hooks |

## Routing accuracy

The bundled catalog is **meta/MCP-heavy by design**. For general coding tasks:

- **`typescript-cli`** — CLI tools and Node scripts
- **`frontend-design`** — UI/card/widget work
- **`find-skills`** — discover domain skills from [skills.sh](https://skills.sh/) when nothing bundled fits

Tune routing without editing skill bodies via **`.agents/skills-meta/<id>.yaml`**:

| Overlay field | Purpose |
|---------------|---------|
| `triggers` | Phrases that strongly signal this skill |
| `tags` | Token overlap for heuristic matching |
| `min_confidence` | Per-skill floor (e.g. `0.45` for MCP skills) |
| `inject_mode_default` | Default inject tier (`compact` recommended for large skills) |

Selector thresholds (env overrides):

- **`SKILLING_SELECT_MIN_CONFIDENCE`** — default `0.25` (minimum to return any skill)
- **`SKILLING_PLAN_MIN_CONFIDENCE`** — default `0.35` (minimum for `skill_plan` `skills_needed`)

MCP-tagged skills require **mcp** or an exact MCP trigger in the query; otherwise their score is capped to avoid false positives on generic TypeScript prompts.

## Notes

- **`.agents/skills-meta/`** holds Skilling routing metadata for ecosystem skills; commit these files in the repo.
- **`com-skilling-orchestrator`** is first-party; not managed by `npx skills update`.
- Ecosystem front matter (`name` / `description`) is normalized to **`id`**, **`title`**, **`summary`** when skills are installed via `npx skills add`.
- **`token_estimate`** is computed from the skill **body** when not set explicitly.
- Folder name **must** match YAML **`id`**.
- Do not use **`npx skills add -g`** when curating this project unless you also copy into `.agents/skills` here.

## Regression

```powershell
npm run benchmark
```

Section **2b** asserts each scenario matches `expected_skill_id` (selection regression gate).
